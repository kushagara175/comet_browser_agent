/**
 * @privapilot/extension - Local Decision Tier
 *
 * The problem statement conditions transmission: sanitize the visual context
 * *"**If it requires** the visual context to be sent to server."* The loop had one
 * code path and no "if" - every step transmitted, whether or not the server was
 * needed to answer it.
 *
 * This router sits ahead of the HTTP client and resolves the steps that do not need
 * a reasoning model. When it decides, nothing leaves the machine at all: not a
 * redacted screenshot, not an element list, not a goal string.
 *
 * Design constraints, in order of importance:
 *
 *  1. **Site-agnostic.** No selectors, no domains, no per-site rules. The finale
 *     pages are unknown. What is used here is generic UI vocabulary and the goal's
 *     own words.
 *  2. **Escalate when unsure.** Deciding locally is an optimisation; deciding wrongly
 *     is a bug. Every rule requires an unambiguous winner, and ambiguity escalates.
 *  3. **Never locally decide a consequential action.** No typing, no submitting, no
 *     consenting on the user's behalf, no declaring the task finished. Those are the
 *     actions where being wrong actually costs the user something.
 *
 * The router reasons over the SANITIZED context - the same view the server would
 * have received. It could legitimately read the raw DOM, since it runs on-device,
 * but keeping it to the sanitized view means a locally-decided step and a remotely-
 * decided one were made from identical information, so the comparison is honest.
 */

import { ActionProposal, SanitizedContext, SanitizedElement, ViewportMetadata } from '@privapilot/protocol';

export interface RoutingContext {
  readonly goal: string;
  readonly sanitized: SanitizedContext;
  readonly step: number;
  /** Consecutive scrolls already decided locally, to stop a scroll loop. */
  readonly consecutiveLocalScrolls: number;
  /** Client-internal layout facts. Never transmitted; used only to route. */
  readonly viewport?: ViewportMetadata;
  /**
   * Labels of controls already clicked in this run.
   *
   * Without this the router re-proposes its own obvious answer forever: the goal
   * still names the button, so the same click scores highest on every step, the page
   * has already responded to it, and the run dies on semantic verification. Having
   * made the obvious move and not finished, the router is by definition no longer
   * sure - so it escalates.
   */
  readonly alreadyActionedLabels?: ReadonlyArray<string>;
}

export type RoutingDecision =
  | { readonly source: 'local'; readonly proposal: ActionProposal; readonly rule: string }
  | { readonly source: 'remote'; readonly escalationReason: string };

/**
 * Generic dismissal vocabulary.
 *
 * Deliberately excludes "accept", "agree", "allow" and "reject": those express a
 * choice on the user's behalf about consent, which is not ours to make locally, and
 * a banner offering only those escalates instead. This list is closing an overlay,
 * not answering it.
 */
const DISMISS_TERMS = ['dismiss', 'close', 'no thanks', 'not now', 'maybe later', 'skip', 'got it'];

/** Words that carry no discriminating signal when matching a goal to a control. */
const STOPWORDS = new Set([
  'the', 'a', 'an', 'to', 'of', 'in', 'on', 'at', 'for', 'and', 'or', 'is', 'are',
  'be', 'my', 'me', 'i', 'it', 'this', 'that', 'with', 'from', 'by', 'please',
  'go', 'goto', 'open', 'click', 'press', 'select', 'find', 'show', 'view', 'page'
]);

/**
 * Share of the CONTROL's own words that must appear in the goal.
 *
 * The first version scored the other direction - what fraction of the goal's words
 * the label accounted for - and that is backwards. A goal is a sentence and a label
 * is two or three words, so "Open the safe preview for the pending request" could
 * never match a button reading "Open Safe Preview": half the goal's words are not on
 * any button. Scoring label-in-goal asks the question that actually matters, which is
 * whether this control is the thing the goal names.
 */
const MIN_LABEL_COVERAGE = 0.75;

/** ...and this much of a lead over the runner-up, so "unambiguous" means it. */
const MIN_MATCH_MARGIN = 0.4;

/** Two matched words, or a single-word goal naming a single-word control exactly. */
const MIN_MATCHED_TOKENS = 2;

/** Ceiling on consecutive local scrolls, so an unreachable goal still escalates. */
const MAX_CONSECUTIVE_LOCAL_SCROLLS = 2;

/** Unscrolled content must exceed this many pixels before scrolling is worthwhile. */
const MIN_REMAINING_SCROLL_PX = 120;

function tokenize(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .split(/\s+/)
    .filter((t) => t.length > 1 && !STOPWORDS.has(t));
}

/** A redacted control is presented as a bracketed category label. */
function isRedactedPlaceholder(name: string): boolean {
  return /^\[[^\]]+\]$/.test(name.trim());
}

function isActionable(el: SanitizedElement): boolean {
  return (
    el.actionCapabilities.includes('click') &&
    el.state.includes('visible') &&
    !el.state.includes('disabled')
  );
}

/** How much of this control's own label the goal accounts for. */
function scoreCandidate(goalTokens: Set<string>, name: string): { score: number; matched: number } {
  const labelTokens = tokenize(name);
  if (labelTokens.length === 0) return { score: 0, matched: 0 };
  let hits = 0;
  for (const token of labelTokens) {
    if (goalTokens.has(token)) hits++;
  }
  return { score: hits / labelTokens.length, matched: hits };
}

let actionCounter = 0;
function nextActionId(): string {
  actionCounter += 1;
  return `act_local_${Date.now()}_${actionCounter}`;
}

export class DecisionRouter {
  /**
   * Decides a step locally, or reports why it must be escalated.
   *
   * Returning `remote` is the safe default and the common case; a rule fires only
   * when the answer is not in doubt.
   */
  static route(ctx: RoutingContext): RoutingDecision {
    const { goal, sanitized } = ctx;
    const elements = sanitized.elements;

    if (elements.length === 0) {
      return { source: 'remote', escalationReason: 'no interactive elements to reason over' };
    }

    const actioned = new Set((ctx.alreadyActionedLabels || []).map((l) => l.toLowerCase().trim()));
    const candidates = elements
      .filter(isActionable)
      .filter((el) => !actioned.has(el.sanitizedName.toLowerCase().trim()));

    if (candidates.length === 0) {
      return {
        source: 'remote',
        escalationReason: actioned.size > 0
          ? 'every locally-obvious control has already been actioned'
          : 'no actionable elements'
      };
    }

    // --- Rule 1: close a blocking overlay -------------------------------------
    // A banner or modal covering the page has to go before anything else can be
    // judged, and closing one needs no reasoning model.
    const dismissMatches = candidates.filter((el) => {
      const name = el.sanitizedName.toLowerCase().trim();
      return DISMISS_TERMS.some((term) => name === term || name.startsWith(term + ' ') || name.endsWith(' ' + term));
    });

    if (dismissMatches.length === 1) {
      const target = dismissMatches[0];
      return {
        source: 'local',
        rule: 'dismiss-overlay',
        proposal: {
          actionId: nextActionId(),
          kind: 'click',
          targetLocalId: target.localId,
          confidence: 0.9,
          risk: 'safe',
          rationale: `Closing "${target.sanitizedName}" locally: dismissing an overlay needs no server reasoning.`,
          expectedState: 'The overlay is dismissed and the underlying page is interactable.'
        }
      };
    }

    // --- Rule 2: one control unambiguously matches the goal --------------------
    const goalTokenList = tokenize(goal);
    const goalTokens = new Set(goalTokenList);
    if (goalTokens.size > 0) {
      const scored = candidates
        .filter((el) => !isRedactedPlaceholder(el.sanitizedName))
        .map((el) => ({ el, ...scoreCandidate(goalTokens, el.sanitizedName) }))
        .sort((a, b) => b.score - a.score || b.matched - a.matched);

      const best = scored[0];
      const runnerUp = scored[1];

      // A one-word goal naming a one-word control is unambiguous even though only a
      // single token matched; anything less specific needs two.
      const enoughTokens =
        best &&
        (best.matched >= MIN_MATCHED_TOKENS ||
          (best.matched === 1 && goalTokens.size === 1 && tokenize(best.el.sanitizedName).length === 1));

      if (best && enoughTokens && best.score >= MIN_LABEL_COVERAGE) {
        const margin = best.score - (runnerUp ? runnerUp.score : 0);
        if (margin >= MIN_MATCH_MARGIN) {
          // A control whose label matches the goal may still be the consequential
          // one ("Submit payment"). Risk classification runs on this proposal exactly
          // as it does on a server-proposed one, so a protected action still stops
          // for consent - the router does not get to skip that gate.
          return {
            source: 'local',
            rule: 'unambiguous-label-match',
            proposal: {
              actionId: nextActionId(),
              kind: 'click',
              targetLocalId: best.el.localId,
              confidence: Math.min(0.95, 0.6 + best.score * 0.35),
              risk: 'safe',
              rationale:
                `"${best.el.sanitizedName}" matches the goal unambiguously ` +
                `(${Math.round(best.score * 100)}% of its label named in the goal, ` +
                `${Math.round(margin * 100)}% clear of the next candidate). ` +
                `Decided on-device; nothing was transmitted.`,
              expectedState: `The page responds to "${best.el.sanitizedName}".`
            }
          };
        }

        return {
          source: 'remote',
          escalationReason: `label match ambiguous (runner-up within ${Math.round(margin * 100)}%)`
        };
      }
    }

    // --- Rule 3: nothing on screen matches, and there is provably more page ----
    //
    // An earlier version scrolled whenever nothing matched. That was a guess: with
    // no document height there was no evidence any content existed below, so it
    // burned steps on short pages and inverted the problem statement's clause -
    // when the local tier cannot find the target, the server is what IS required.
    //
    // It now scrolls only on evidence: the host reported a document taller than the
    // scrolled viewport. Bounded, so an unreachable goal still escalates.
    const viewport = ctx.viewport;
    if (
      viewport &&
      typeof viewport.documentHeight === 'number' &&
      ctx.consecutiveLocalScrolls < MAX_CONSECUTIVE_LOCAL_SCROLLS
    ) {
      const remaining = viewport.documentHeight - (viewport.scrollY + viewport.viewportHeight);
      if (remaining > MIN_REMAINING_SCROLL_PX) {
        return {
          source: 'local',
          rule: 'scroll-to-reveal',
          proposal: {
            actionId: nextActionId(),
            kind: 'scroll',
            confidence: 0.75,
            risk: 'safe',
            scrollDirection: 'down',
            rationale:
              `No visible control matches the goal and ${Math.round(remaining)}px of page remains below the fold. ` +
              `Scrolling decided on-device; nothing was transmitted.`,
            expectedState: 'Additional page content becomes visible.'
          }
        };
      }
    }

    return {
      source: 'remote',
      escalationReason: 'no local rule applies with sufficient confidence'
    };
  }
}
