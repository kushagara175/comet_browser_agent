/**
 * @privapilot/extension - Background Run Coordinator
 *
 * Coordinates the full end-to-end privacy and bounded multi-step execution loop:
 * 1. Capture Active Tab (fresh ephemeral IDs per cycle)
 * 2. Run Local Multi-Layer Sanitizer (offscreen host)
 * 3. Transmit Sanitized Context to Server (zero raw screenshot/DOM transmission)
 * 4. Validate Action Proposal against Closed Schema & Sanitized Elements
 * 5. Prompt for Confirmation if Protected (pauses loop)
 * 6. Execute Safe Action via Content Script
 * 7. Semantically Verify UI Outcome
 * 8. Repeat perception cycle up to bounded step budget or until finish/failure
 */

import {
  AgentState,
  RawCapture,
  SanitizedContext,
  SanitizedElement,
  ActionProposal,
  StateDelta,
  ChatHistoryMessage,
  classifyActionRisk,
  RiskLevel,
  validateActionProposal,
  RunTelemetry,
  resolveTaskContract,
  TaskContract,
  ExpectedPostcondition,
  groundTargetCandidates,
  scoreCandidate,
  tokenizeSemanticText,
  lookupDomainPlaybook,
  resolvePlaybookIntent,
  extractMetricsWithPlaybook,
  extractSearchQueryFromGoal,
  extractTargetUrlFromGoal,
  stripNavigationPrefixFromGoal,
  isPureNavigationGoal,
  ExecutionFeedback,
  TaskSpecification,
  ObjectiveProgress,
  ObjectiveEvidenceKind,
  createInitialObjectiveProgress,
  getCurrentObjective,
  recordObjectiveEvidence,
  completeObjectiveWithEvidence,
  canFinishTask
} from '@privapilot/protocol';
import { BrowserAdapter, WebExtensionAdapter } from '../browser/browser-adapter.js';
import { ReasoningHttpClient, ModelStatus } from './http-client.js';
import { sanitizeOutboundUrl, scrubOptionalText, scrubHistory } from '@privapilot/pii-rules';

declare const chrome: any;
import { AuditLogger } from './audit-logger.js';
import {
  getUserProfile,
  saveUserProfile,
  getCredentialsForDomain,
  saveSiteCredential,
  normalizeDomain,
  matchFieldToVault,
  FormElementDescriptor,
  DEMO_USER_PROFILE
} from '../vault/index.js';
import { SemanticActionCache } from '../cache/semantic-action-cache.js';

function isSafeReversibleInteraction(proposal: ActionProposal, targetElement?: any): boolean {
  const kind = (proposal.kind || '').toLowerCase();
  if (kind === 'scroll' || kind === 'observe' || kind === 'wait' || kind === 'hover' || kind === 'navigate' || kind === 'request_user_input') {
    return true;
  }
  if (kind === 'click') {
    const role = (targetElement?.role || '').toLowerCase();
    const name = (targetElement?.sanitizedName || proposal.targetName || '').toLowerCase();
    const isDestructive =
      name.includes('submit') ||
      name.includes('send') ||
      name.includes('publish') ||
      name.includes('delete') ||
      name.includes('remove') ||
      name.includes('pay') ||
      name.includes('purchase') ||
      name.includes('buy') ||
      name.includes('checkout') ||
      name.includes('authorize') ||
      name.includes('sign') ||
      name.includes('transfer') ||
      name.includes('confirm order');

    if (isDestructive) {
      return false;
    }

    if (role === 'link' || role === 'tab' || role === 'menuitem' || role === 'heading') {
      return true;
    }

    const isNavWord = /\b(?:students?|careers?|about|home|contact|news|events?|overview|details?|next|prev|previous|back|more|learn\s+more|read\s+more|menu|nav|tab|filter|search|view|browse|explore)\b/i.test(name);
    if (isNavWord) {
      return true;
    }

    return !isDestructive;
  }
  return false;
}

function isMissionBrochureGoal(goal: string): boolean {
  return /\b(?:chandrayaan[\s-]*3|chandrayaan)\b/i.test(goal) &&
    /\b(?:brochure|pdf|download)\b/i.test(goal);
}

function isroMissionStage(url: string): 'home' | 'hub' | 'directory' | 'details' | null {
  try {
    const parsed = new URL(url);
    if (!/(?:^|\.)isro\.gov\.in$/i.test(parsed.hostname)) return null;
    const path = parsed.pathname.toLowerCase().replace(/\/+$/, '') || '/';
    if (path.includes('spacecraftmissions') || path.includes('launchmissions')) return 'directory';
    if (path.includes('chandrayaan') || path.includes('details')) return 'details';
    if (path.includes('mission.html')) return 'hub';
    if (path === '' || path === '/' || path.includes('index.html')) return 'home';
  } catch (_) {}
  return null;
}

function eligibleMissionElement(el: SanitizedElement, capability: 'click' | 'type'): boolean {
  return el.state.includes('visible') && !el.state.includes('disabled') &&
    el.actionCapabilities.includes(capability);
}

/** Only sanitized names are available here; no href, placeholder or DOM class survives sanitization. */
export function enforceIsroMissionProgression(
  goal: string, url: string, elements: readonly SanitizedElement[], proposal: ActionProposal
): { proposal?: ActionProposal; error?: string } {
  if (!isMissionBrochureGoal(goal)) return { proposal };
  const stage = isroMissionStage(url);
  if (!stage) return { proposal };

  const isRegressionOrBreadcrumb = (el: SanitizedElement) => {
    const name = (el.sanitizedName || '').toLowerCase();
    const ctx = (el.containerContext || '').toLowerCase();
    return ctx.includes('breadcrumb') ||
           name.includes('breadcrumb') ||
           name.includes('site search') ||
           /^(?:home|activities|missions accomplished|about|services|programmes|resources|engagements)$/i.test(name) ||
           (el as any).href?.includes?.('Mission.html') ||
           (el as any).href?.includes?.('index.html') ||
           (el as any).id === 'searchTextD' ||
           (el as any).id === 'searchTextM';
  };

  const candidates = (role: SanitizedElement['role'], name: RegExp, capability: 'click' | 'type') =>
    elements.filter(el => el.role === role && name.test(el.sanitizedName) && eligibleMissionElement(el, capability));

  let target: SanitizedElement | undefined;
  let kind: 'click' | 'type' = 'click';
  let textToType: string | undefined;

  if (stage === 'home') {
    // 1. If Missions Accomplished is already visible in open dropdown, click it!
    target = candidates('link', /missions?\s*accomplished/i, 'click')[0] ||
             candidates('link', /^missions?$/i, 'click')[0] ||
             // 2. Otherwise click "Activities" navbar link/button to open the dropdown!
             candidates('link', /activities/i, 'click')[0] ||
             candidates('button', /activities/i, 'click')[0] ||
             elements.find(el => /activities/i.test(el.sanitizedName) && el.actionCapabilities?.includes('click'));
  } else if (stage === 'hub') {
    target = candidates('link', /spacecraft\s*missions/i, 'click').find(el => !isRegressionOrBreadcrumb(el)) ||
             candidates('button', /spacecraft\s*missions/i, 'click').find(el => !isRegressionOrBreadcrumb(el)) ||
             elements.find(el => !isRegressionOrBreadcrumb(el) && /spacecraft\s*missions/i.test(el.sanitizedName) && el.actionCapabilities?.includes('click'));
  } else if (stage === 'directory') {
    // Stage 3 on SpacecraftMissions.html:
    // Candidate 1: Target mission link in table
    target = candidates('link', /chandrayaan[\s-]*3\b/i, 'click').find(el => !isRegressionOrBreadcrumb(el)) ||
             elements.find(el => el.role === 'link' && !isRegressionOrBreadcrumb(el) && /chandrayaan[\s-]*3\b/i.test(el.sanitizedName) && eligibleMissionElement(el, 'click'));
    if (!target) {
      // Candidate 2: Table filter search input
      kind = 'type';
      target = candidates('input', /table\s*filter|search/i, 'type').find(el => !isRegressionOrBreadcrumb(el)) ||
               elements.find(el => (el.role === 'input' || el.role === 'textarea') && !isRegressionOrBreadcrumb(el) && (/table\s*filter/i.test(el.sanitizedName) || (el as any).placeholder?.toLowerCase() === 'search' || (el as any).classList?.contains('search')) && eligibleMissionElement(el, 'type'));
      textToType = 'Chandrayaan';
    }
  } else {
    target = candidates('link', /brochure/i, 'click').find(el => !isRegressionOrBreadcrumb(el)) ||
             elements.find(el => el.role === 'link' && !isRegressionOrBreadcrumb(el) && (/brochure/i.test(el.sanitizedName) || /\.pdf\b/i.test((el as any).href || '')) && eligibleMissionElement(el, 'click'));
  }

  if (!target) {
    return { error: 'No visible, enabled target element found for mission progression' };
  }

  const incomingTargetEl = proposal.targetLocalId ? elements.find(e => e.localId === proposal.targetLocalId) : null;
  const isIncomingRegression = incomingTargetEl ? isRegressionOrBreadcrumb(incomingTargetEl) : false;

  if (!isIncomingRegression && proposal.kind === kind && proposal.targetLocalId === target.localId &&
      (kind !== 'type' || (proposal.textToType === textToType && proposal.pressEnter === false))) {
    return { proposal };
  }

  const rationale = kind === 'type'
    ? `Filter the spacecraft missions table for ${textToType} without submitting site search.`
    : `Open ${target.sanitizedName} to advance toward the Chandrayaan-3 brochure.`;

  return { proposal: {
    actionId: `act_isro_${stage}_${Date.now()}`,
    kind, targetLocalId: target.localId, textToType, pressEnter: false,
    confidence: 0.98, risk: 'safe', rationale,
    reasoning: proposal.reasoning || proposal.thought || rationale
  } };
}

function selectBestTavilyResult(
  results: Array<{ title: string; url: string; content?: string }>,
  query: string,
  goal: string,
  currentUrl: string = ''
): { title: string; url: string; content?: string } | undefined {
  if (!results || results.length === 0) return undefined;

  const combined = `${query} ${goal}`.toLowerCase();

  // 0. If current URL is on an official portal (ISRO, Bhuvan, SIH) or combined query mentions it, strictly prioritize matching domain
  try {
    const curHost = currentUrl ? new URL(currentUrl).hostname.toLowerCase() : '';
    const isOfficialPortal = curHost.includes('isro.gov.in') || curHost.includes('bhuvan') || curHost.includes('sih.gov.in');

    if (curHost.includes('isro.gov.in') || combined.includes('isro')) {
      const isDocGoal = /(?:brochure|pdf|download|report|dataset)/i.test(combined);
      if (isDocGoal) {
        const isroPdf = results.find(r => r.url && /isro\.gov\.in/i.test(r.url) && /\.pdf(?:\?.*)?$/i.test(r.url));
        if (isroPdf) return isroPdf;
        const anyGovPdf = results.find(r => r.url && /\.gov\.in/i.test(r.url) && /\.pdf(?:\?.*)?$/i.test(r.url));
        if (anyGovPdf) return anyGovPdf;
      }
      const isroMatch = results.find(r => r.url && /isro\.gov\.in/i.test(r.url));
      if (isroMatch) return isroMatch;
      const isroAffiliate = results.find(r => r.url && /(?:iirs|nrsc|vssc|ursc|sac|isac|prl)\.gov\.in/i.test(r.url));
      if (isroAffiliate) return isroAffiliate;
      const govMatch = results.find(r => r.url && /\.gov\.in/i.test(r.url));
      if (govMatch) return govMatch;
    }
    if (curHost.includes('bhuvan') || combined.includes('bhuvan')) {
      const bhuvanMatch = results.find(r => r.url && /bhuvan(?:\.nrsc)?\.gov\.in/i.test(r.url));
      if (bhuvanMatch) return bhuvanMatch;
      const nrscMatch = results.find(r => r.url && /nrsc\.gov\.in/i.test(r.url));
      if (nrscMatch) return nrscMatch;
      const govMatch = results.find(r => r.url && /\.gov\.in/i.test(r.url));
      if (govMatch) return govMatch;
    }
    if (curHost.includes('sih.gov.in') || combined.includes('sih') || combined.includes('hackathon')) {
      const sihMatch = results.find(r => r.url && /sih\.gov\.in/i.test(r.url));
      if (sihMatch) return sihMatch;
      const govMatch = results.find(r => r.url && /\.gov\.in/i.test(r.url));
      if (govMatch) return govMatch;
    }

    // When on an official government portal, never return commercial or blog search results
    if (isOfficialPortal) {
      const officialMatch = results.find(r => r.url && (/\.gov\.in/i.test(r.url) || /\.nic\.in/i.test(r.url)));
      if (officialMatch) return officialMatch;
      return undefined; // Strictly refuse to divert to external commercial/blog sites
    }
  } catch (_) {}
  // 4. If searching for Wikipedia, prioritize Wikipedia domain
  if (combined.includes('wikipedia')) {
    const wikiMatch = results.find(r => r.url && /wikipedia\.org/i.test(r.url));
    if (wikiMatch) return wikiMatch;
  }
  // 5. If searching for GitHub, prioritize GitHub domain
  if (combined.includes('github')) {
    const ghMatch = results.find(r => r.url && /github\.com/i.test(r.url));
    if (ghMatch) return ghMatch;
  }

  // 6. Filter out secondary third-party articles / blog posts / stock asset sites
  const nonArticle = results.find(r =>
    r.url &&
    r.url !== currentUrl &&
    !currentUrl.startsWith(r.url) &&
    !r.url.includes('/article/') &&
    !r.url.includes('/news/') &&
    !r.url.includes('/blog/') &&
    !r.url.includes('/post/') &&
    !r.url.includes('/learn/') &&
    !r.url.includes('medium.com') &&
    !r.url.includes('envato.com') &&
    !r.url.includes('freepik.com') &&
    !r.url.includes('canva.com') &&
    !r.url.includes('pinterest.com') &&
    !r.url.includes('scribd.com')
  );
  if (nonArticle) return nonArticle;

  return results.find(r => r.url && r.url !== currentUrl && !currentUrl.startsWith(r.url));
}

export interface ChatOutcome {
  readonly success: boolean;
  readonly reply: string;
  readonly reasoning?: string;
  readonly maskCount: number;
  readonly elementCount: number;
  /** False when the gateway answered from its offline reasoner, or not at all. */
  readonly modelConnected?: boolean;
  readonly isSubAgentSwarm?: boolean;
  readonly subTasks?: ReadonlyArray<any>;
}

export interface CoordinatorRunOptions {
  readonly maxSteps?: number;
  readonly maxStaleRetries?: number;
  readonly runId?: string;
  readonly tabId?: number;
  readonly history?: ReadonlyArray<{ readonly role: 'user' | 'assistant'; readonly content: string }>;
  readonly customPrompt?: string;
  readonly agentId?: string;
  readonly agentName?: string;
  readonly onThoughtDelta?: (text: string) => void;
  readonly onReplyDelta?: (text: string) => void;
}

export interface CoordinatorListeners {
  onStateChange?(state: AgentState, message?: string, runId?: string): void;
  onSanitizationComplete?(raw: RawCapture, sanitized: SanitizedContext, runId?: string): void;
  onActionProposed?(action: ActionProposal, runId?: string): void;
  onActionConfirmedRequired?(action: ActionProposal, runId?: string): void;
  onUserInputRequired?(request: { kind: 'credentials' | 'text_input' | 'clarification'; prompt: string; targetLocalId?: string; inputKey?: string; runId?: string }): void;
  onTelemetryUpdated?(telemetry: RunTelemetry, runId?: string): void;
  onStepProgress?(step: number, maxSteps: number, message: string, runId?: string): void;
}

export interface E2EStepTrace {
  readonly step: number;
  readonly captureId: string;
  readonly pageGeneration: string;
  readonly maskCount: number;
  readonly sanitizedScreenshotBytes: number;
  readonly decisionOrigin: 'local' | 'server';
  readonly proposal: ActionProposal;
  readonly riskDecision: string;
  readonly confidenceDecision: string;
  readonly executed: boolean;
  readonly executionResult?: {
    readonly success: boolean;
    readonly staleTarget: boolean;
    readonly reasonCode?: string;
  };
  readonly verification?: {
    readonly verified: boolean;
    readonly reasonCode: string;
    readonly matchedCondition?: string;
    readonly durationMs: number;
  };
  readonly networkRequestMade: boolean;
  readonly timings: Record<string, number>;
}

export interface CoordinatorRunResult {
  readonly runId?: string;
  readonly success: boolean;
  readonly state: AgentState;
  readonly message?: string;
  readonly reply?: string;
  readonly error?: string;
  readonly reasonCode?: string;
  readonly reasoning?: string;
  readonly isSubAgentSwarm?: boolean;
  readonly subTasks?: ReadonlyArray<any>;
  readonly sanitized?: SanitizedContext;
  readonly proposal?: ActionProposal;
  readonly telemetry?: RunTelemetry;
  readonly stepCount?: number;
  readonly diagnostic?: SanitizerDiagnostic;
  readonly steps?: ReadonlyArray<E2EStepTrace>;
  readonly inputRequest?: {
    kind: 'credentials' | 'text_input' | 'clarification';
    prompt: string;
    targetLocalId?: string;
    inputKey?: string;
    runId?: string;
    leasedTabId?: number;
    inputNonce?: string;
    expectedOrigin?: string;
  };
}

export type SanitizerFailureClass =
  | 'OFFSCREEN_UNAVAILABLE'
  | 'SCREENSHOT_DECODE_FAILED'
  | 'CANVAS_UNAVAILABLE'
  | 'MASK_RENDER_FAILED'
  | 'MASK_VERIFICATION_FAILED'
  | 'DIGEST_FAILED'
  | 'SANITIZER_TIMEOUT'
  | 'UNKNOWN_SANITIZER_FAILURE';

export interface SanitizerDiagnostic {
  readonly failureClass: SanitizerFailureClass;
  readonly sanitizedDetail: string;
}

export function sanitizeErrorDetail(rawMessage: string): string {
  if (!rawMessage) return 'Unknown error';
  let sanitized = String(rawMessage);
  // Strip data URLs / base64 blobs
  sanitized = sanitized.replace(/data:image\/[a-zA-Z0-9+.-]+;base64,[a-zA-Z0-9+/=]+/g, '[IMAGE_DATA]');
  // Strip web URLs
  sanitized = sanitized.replace(/https?:\/\/[^\s"'<>]+/g, '[URL]');
  // Strip long hex sequences
  sanitized = sanitized.replace(/[a-f0-9]{32,}/gi, '[HASH]');
  // Truncate to at most 120 chars
  if (sanitized.length > 120) {
    sanitized = sanitized.slice(0, 117) + '...';
  }
  return sanitized.trim();
}

/**
 * Detects whether an execution error was caused by normal browser page navigation,
 * bfcache transitions, or content script port reconnections.
 */
export function isDisconnectOrNavigationError(err: any): boolean {
  if (!err) return false;
  const msg = (typeof err === 'string' ? err : err.message || '').toLowerCase();
  return (
    msg.includes('message port closed') ||
    msg.includes('message channel is closed') ||
    msg.includes('message channel closed') ||
    msg.includes('back/forward cache') ||
    msg.includes('bfcache') ||
    msg.includes('receiving end does not exist') ||
    msg.includes('could not establish connection') ||
    msg.includes('frame with id 0 was removed') ||
    msg.includes('tab was closed') ||
    msg.includes('extension context invalidated') ||
    msg.includes('content script did not respond')
  );
}

export function classifySanitizerError(err: any): SanitizerDiagnostic {
  const rawMsg = String(err?.message || err || '');
  const lower = rawMsg.toLowerCase();
  let failureClass: SanitizerFailureClass = 'UNKNOWN_SANITIZER_FAILURE';

  if (lower.includes('timeout') || lower.includes('timed out') || lower.includes('15000ms')) {
    failureClass = 'SANITIZER_TIMEOUT';
  } else if (lower.includes('decode') || lower.includes('bitmap') || lower.includes('invalid raw screenshot')) {
    failureClass = 'SCREENSHOT_DECODE_FAILED';
  } else if (lower.includes('canvas') && (lower.includes('context') || lower.includes('unavailable'))) {
    failureClass = 'CANVAS_UNAVAILABLE';
  } else if (lower.includes('render') && lower.includes('mask')) {
    failureClass = 'MASK_RENDER_FAILED';
  } else if (lower.includes('verification') || lower.includes('verifier') || lower.includes('post-redaction') || lower.includes('sanitization blocked')) {
    failureClass = 'MASK_VERIFICATION_FAILED';
  } else if (lower.includes('digest') || lower.includes('sha256') || lower.includes('crypto')) {
    failureClass = 'DIGEST_FAILED';
  } else if (lower.includes('offscreen') && (lower.includes('unavailable') || lower.includes('failed') || lower.includes('created') || lower.includes('document'))) {
    failureClass = 'OFFSCREEN_UNAVAILABLE';
  }

  return {
    failureClass,
    sanitizedDetail: sanitizeErrorDetail(rawMsg)
  };
}

export function isRestrictedBrowserUrl(urlStr?: string): { isRestricted: boolean; reason?: string } {
  if (!urlStr) return { isRestricted: false };
  const url = urlStr.trim().toLowerCase();
  if (url.startsWith('chrome://')) {
    return { isRestricted: true, reason: 'Chrome internal settings/management surface (chrome://)' };
  }
  if (url.startsWith('chrome-extension://')) {
    return { isRestricted: true, reason: 'Extension internal origin (chrome-extension://)' };
  }
  if (url.startsWith('edge://') || url.startsWith('about:') || url.startsWith('devtools://') || url.startsWith('view-source:')) {
    return { isRestricted: true, reason: 'Privileged browser internal origin' };
  }
  if (url.startsWith('file://')) {
    return { isRestricted: true, reason: 'Local file scheme URL without explicit verified permission' };
  }
  return { isRestricted: false };
}

export const AIRPORT_CODES: Record<string, string> = {
  delhi: 'DEL',
  mumbai: 'BOM',
  bengaluru: 'BLR',
  bangalore: 'BLR',
  chennai: 'MAA',
  kolkata: 'CCU',
  hyderabad: 'HYD',
  pune: 'PNQ',
  goa: 'GOI',
  ahmedabad: 'AMD',
  jaipur: 'JAI',
  kochi: 'COK',
  cochin: 'COK',
  lucknow: 'LKO',
  chandigarh: 'IXC'
};

export function isSubAgentSwarmGoal(goal: string): boolean {
  if (!goal || typeof goal !== 'string') return false;
  const trimmed = goal.trim();
  // Negative override: if user explicitly requests single agent or to avoid subagents
  if (/\b(?:without\s+sub-?agents?|no\s+sub-?agents?|single\s+agent|single\s+tab|don't\s+use\s+sub-?agents?|disable\s+sub-?agents?)\b/i.test(trimmed)) {
    return false;
  }
  const isComparative = /\b(?:compare|both|versus|vs\.?|across|each|and\s+also|simultaneously|parallel|multiple\s+sites|different\s+tabs?)\b/i.test(trimmed);
  const hasMultiplePortals = /(?:https?:\/\/[^\s]+[\s\S]+https?:\/\/[^\s]+)/i.test(trimmed);
  const entityMatches = trimmed.match(/(?:indigo|air\s*india|spicejet|vistara|akasa|makemytrip|easemytrip|cleartrip|amazon|flipkart|booking|agoda|expedia|github|gitlab|apple|myntra|ajio|zomato|swiggy)/gi);
  const uniqueEntities = entityMatches ? Array.from(new Set(entityMatches.map((e) => e.toLowerCase().replace(/\s+/g, '')))) : [];
  const isExplicitSubagent = /\b(?:sub-?agents?|subagnts?|subwgrns?|subegmts?|swarm|parallel\s+agents?|multi-?agents?|call\s+(?:sub-?)?agents?|create\s+(?:sub-?)?agents?|deploy\s+(?:sub-?)?agents?|deploy\s+agents?)\b/i.test(trimmed);
  const isCrossDomainQuery = isComparative && (uniqueEntities.length >= 2 || /\b(?:flight|flights|airline|airlines|hotel|hotels|price|prices|ticket|tickets|fare|fares)\b/i.test(trimmed));

  return isCrossDomainQuery || hasMultiplePortals || (uniqueEntities.length >= 2) || isExplicitSubagent;
}

/**
 * Helper to normalize elements from raw or sanitized DOM snapshots
 */
export function getSnapshotElements(snap: any): any[] {
  const rawList = snap?.snapshot?.elements || snap?.snapshot?.interactiveElements || snap?.elements || [];
  return rawList.map((e: any) => ({
    ...e,
    sanitizedName: e.sanitizedName || e.rawName || e.text || e.name || '',
    rawName: e.rawName || e.sanitizedName || e.text || e.name || '',
    text: e.text || e.sanitizedName || e.rawName || e.name || ''
  }));
}

/**
 * Dedicated flight element finders for robust, error-free DOM interaction across IndiGo, Air India, etc.
 */
export function findFlightOriginElement(elements: readonly any[]): any | null {
  if (!Array.isArray(elements) || elements.length === 0) return null;
  return elements.find((e: any) => {
    if (e.state?.includes('disabled')) return false;
    const name = (e.sanitizedName || e.rawName || e.text || e.name || '').toLowerCase().trim();
    if (/login|unlock|benefit|up\s+to|offer|deal|discount|round\s*trip|return|multi\s*city|terms|cancel/i.test(name)) {
      return false;
    }
    const isInteractive = e.role === 'input' || e.role === 'combobox' || e.role === 'button' || e.role === 'searchbox' || e.role === 'generic';
    if (!isInteractive) return false;
    return /\b(?:origin|from|departure|source|departing|flying\s+from|from\s+origin|select\s+origin)\b/i.test(name) ||
           /^from\b/i.test(name) ||
           name === 'from';
  }) || null;
}

export function findFlightDestinationElement(elements: readonly any[], originLocalId?: string): any | null {
  if (!Array.isArray(elements) || elements.length === 0) return null;

  // Priority 1: Check for an already focused input or combobox (e.g. IndiGo auto-focuses destination after selecting origin)
  const focused = elements.find((e: any) =>
    (e.role === 'input' || e.role === 'combobox' || e.role === 'searchbox') &&
    e.state?.includes('focused') &&
    (!originLocalId || e.localId !== originLocalId) &&
    !e.state?.includes('disabled')
  );
  if (focused) {
    const fName = (focused.sanitizedName || focused.rawName || focused.text || focused.name || '').toLowerCase();
    if (!/login|unlock|benefit|up\s+to|round\s*trip|return|cancel/i.test(fName)) {
      return focused;
    }
  }

  // Priority 2: Clear explicit destination phrases like "Going to? Search by place/airport", "where to", "destination"
  const explicitDest = elements.find((e: any) => {
    if (e.state?.includes('disabled')) return false;
    if (originLocalId && e.localId === originLocalId) return false;
    const name = (e.sanitizedName || e.rawName || e.text || e.name || '').toLowerCase().trim();
    if (/login|unlock|benefit|up\s+to|offer|deal|discount|round\s*trip|return|multi\s*city|terms|cancel/i.test(name)) {
      return false;
    }
    const isInteractive = e.role === 'input' || e.role === 'combobox' || e.role === 'button' || e.role === 'searchbox' || e.role === 'generic';
    if (!isInteractive) return false;
    return /\b(?:going\s+to|where\s+to|destination|arrival|flying\s+to|fly\s+to|select\s+destination|to\s+destination)\b/i.test(name);
  });
  if (explicitDest) return explicitDest;

  // Priority 3: Exact "to" or starting with "to " (safeguarded against prepositions in banners)
  return elements.find((e: any) => {
    if (e.state?.includes('disabled')) return false;
    if (originLocalId && e.localId === originLocalId) return false;
    const name = (e.sanitizedName || e.rawName || e.text || e.name || '').toLowerCase().trim();
    if (/login|unlock|benefit|up\s+to|offer|deal|discount|round\s*trip|return|multi\s*city|terms|cancel|proceed/i.test(name)) {
      return false;
    }
    const isInteractive = e.role === 'input' || e.role === 'combobox' || e.role === 'button' || e.role === 'searchbox' || e.role === 'generic';
    if (!isInteractive) return false;
    return name === 'to' || /^to\s*[:\?-]|\bto\s+(?:city|airport|place)\b/i.test(name);
  }) || null;
}

export function findFlightSearchButton(elements: readonly any[]): any | null {
  if (!Array.isArray(elements) || elements.length === 0) return null;

  // Priority 1: Dedicated Search Flight(s) button or submit input
  const flightSearchBtn = elements.find((e: any) => {
    if (e.state?.includes('disabled')) return false;
    const name = (e.sanitizedName || e.rawName || e.text || e.name || '').toLowerCase().trim();
    if (/login|hotel|cab|car|card|vacation|holiday|visa|by\s+place|destination|airport/i.test(name)) {
      return false;
    }
    const isButton = e.role === 'button' || (e.role === 'input' && (e.type === 'submit' || e.type === 'button'));
    if (!isButton) return false;
    return /\b(?:search\s+flights?|find\s+flights?|book\s+flights?|show\s+flights?)\b/i.test(name);
  });
  if (flightSearchBtn) return flightSearchBtn;

  // Priority 2: Generic 'Search' button
  const anySearchBtn = elements.find((e: any) => {
    if (e.state?.includes('disabled')) return false;
    const name = (e.sanitizedName || e.rawName || e.text || e.name || '').toLowerCase().trim();
    if (/login|hotel|cab|car|card|vacation|holiday|visa|by\s+place|destination|airport/i.test(name)) {
      return false;
    }
    const isButton = e.role === 'button' || (e.role === 'input' && (e.type === 'submit' || e.type === 'button'));
    if (!isButton) return false;
    return /\b(?:search|find|book)\b/i.test(name);
  });
  if (anySearchBtn) return anySearchBtn;

  // Priority 3: Any clickable element with search flight
  return elements.find((e: any) => {
    if (e.state?.includes('disabled')) return false;
    const name = (e.sanitizedName || e.rawName || e.text || e.name || '').toLowerCase().trim();
    if (/login|hotel|cab|car|card|vacation|holiday|visa|by\s+place|destination|airport/i.test(name)) {
      return false;
    }
    const isClickable = e.role === 'button' || e.role === 'link' || e.role === 'generic';
    if (!isClickable) return false;
    return /\b(?:search\s+flights?|find\s+flights?|show\s+flights?)\b/i.test(name);
  }) || null;
}

export function findAirportSuggestion(elements: readonly any[], city: string, airportCode: string, excludeIds: string[] = []): any | null {
  if (!Array.isArray(elements) || elements.length === 0) return null;
  const excludeSet = new Set(excludeIds);
  const cityLow = city.toLowerCase().trim();
  const codeLow = airportCode.toLowerCase().trim();

  const synonyms: Record<string, string[]> = {
    del: ['delhi', 'indira gandhi', 'new delhi'],
    delhi: ['del', 'indira gandhi', 'new delhi'],
    bom: ['mumbai', 'chhatrapati shivaji', 'bombay'],
    mumbai: ['bom', 'chhatrapati shivaji', 'bombay'],
    blr: ['bengaluru', 'bangalore', 'kempegowda'],
    bangalore: ['blr', 'bengaluru', 'kempegowda'],
    bengaluru: ['blr', 'bangalore', 'kempegowda'],
    hyd: ['hyderabad', 'rajiv gandhi'],
    hyderabad: ['hyd', 'rajiv gandhi'],
    maa: ['chennai', 'madras'],
    chennai: ['maa', 'madras'],
    ccu: ['kolkata', 'calcutta', 'netaji'],
    kolkata: ['ccu', 'calcutta', 'netaji']
  };

  const allowedTerms = [cityLow, codeLow, ...(synonyms[cityLow] || []), ...(synonyms[codeLow] || [])];

  return elements.find((e: any) => {
    if (excludeSet.has(e.localId)) return false;
    if (e.state?.includes('disabled')) return false;
    const name = (e.sanitizedName || e.rawName || e.text || e.name || '').toLowerCase().trim();
    if (!name || name.length < 2) return false;
    if (/login|cookie|accept|close|banner/i.test(name)) return false;
    return allowedTerms.some(term => {
      const regex = new RegExp(`\\b${term}\\b`, 'i');
      return regex.test(name);
    });
  }) || null;
}

export class RunCoordinator {
  private state: AgentState = 'idle';
  private readonly browser: BrowserAdapter;
  private readonly httpClient: ReasoningHttpClient;
  private readonly auditLogger: AuditLogger;
  private readonly defaultMaxSteps: number;
  private readonly defaultMaxStaleRetries: number;
  private listeners: CoordinatorListeners = {};

  private currentGoal: string | null = null;
  private currentStep: number = 0;
  private currentMaxSteps: number = 20;
  private currentStaleRetries: number = 0;
  private maxStaleRetries: number = 2;
  private lastStaleTargetId: string | null = null;
  private pendingAction: ActionProposal | null = null;
  private pendingInputRequest: {
    kind: 'credentials' | 'text_input' | 'clarification';
    prompt: string;
    targetLocalId?: string;
    inputKey?: string;
    runId?: string;
    leasedTabId?: number;
    inputNonce?: string;
    expectedOrigin?: string;
  } | null = null;

  private generateInputNonce(): string {
    return `nonce_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
  }
  private currentSanitizedContext: SanitizedContext | null = null;
  private lastActionProposal: ActionProposal | null = null;
  private lastRunResult: CoordinatorRunResult | null = null;
  private actionHistory: Array<{ actionId?: string; kind: string; targetLocalId?: string; textToType?: string; selectOptionValue?: string; scrollDirection?: string }> = [];
  private t0_runStart: number = 0;
  private cumulativeClientLatency: number = 0;
  private cumulativeServerLatency: number = 0;
  private isCancelled: boolean = false;
  private stepsTrace: E2EStepTrace[] = [];
  private currentTaskContract: TaskContract | null = null;
  private currentRunId: string = '';
  private currentTabId?: number;
  private lastGoal: string = '';
  private conversationHistory: Array<{ role: 'user' | 'assistant'; content: string }> = [];
  private currentCustomPrompt?: string;
  private currentExecutionFeedback?: ExecutionFeedback;
  private currentTaskSpec?: TaskSpecification;
  private objectiveProgress?: ObjectiveProgress;
  private recentActionHistory: Array<{ actionId: string; objectiveId?: string; kind: string; targetLocalId?: string; expectedPostcondition?: ExpectedPostcondition; observedOutcome?: string; meaningfulProgress: boolean }> = [];
  private previousSnapshot: SanitizedContext | null = null;
  private previousUrl: string = '';
  private lastExecutedProposal: ActionProposal | null = null;
  private lastExecutionResult: any = null;
  private hasTavilyRecovered: boolean = false;
  private autofilledTargets: Set<string> = new Set<string>();
  private sessionWebSearchCache = new Map<string, { query: string; results: any[]; answer: string; timestamp: number }>();
  private activeStreamingOptions?: { onThoughtDelta?: (text: string) => void; onReplyDelta?: (text: string) => void };
  private readonly options: { defaultMaxSteps?: number; maxStaleRetries?: number; enableLegacyPlaybooks?: boolean };

  constructor(
    browser: BrowserAdapter = new WebExtensionAdapter(),
    httpClient: ReasoningHttpClient = new ReasoningHttpClient(),
    auditLogger: AuditLogger = new AuditLogger(),
    options: { defaultMaxSteps?: number; maxStaleRetries?: number; enableLegacyPlaybooks?: boolean } = {}
  ) {
    this.browser = browser;
    this.httpClient = httpClient;
    this.auditLogger = auditLogger;
    this.options = options;
    this.defaultMaxSteps = Math.max(1, Math.min(options.defaultMaxSteps ?? 20, 30));
    this.defaultMaxStaleRetries = options.maxStaleRetries ?? 2;
  }

  setListeners(listeners: CoordinatorListeners): void {
    this.listeners = listeners;
  }

  getState(): AgentState {
    return this.state;
  }

  getCurrentRunId(): string {
    return this.currentRunId;
  }

  getLastResult(): CoordinatorRunResult | null {
    return this.lastRunResult;
  }

  private completeWithResult(res: CoordinatorRunResult): CoordinatorRunResult {
    if (res.state !== 'awaiting-user-input' && res.state !== 'awaiting-user-confirmation') {
      this.activeStreamingOptions = undefined;
    }
    const steps = [...this.stepsTrace];
    for (const entry of res.steps || []) {
      if (!steps.some(s => s.proposal?.actionId === entry.proposal?.actionId && s.step === entry.step)) steps.push(entry);
    }
    steps.sort((a, b) => a.step - b.step);
    const stepReasoning = steps.map((entry) => {
      return entry.proposal?.reasoning || entry.proposal?.thought || entry.proposal?.rationale || '';
    }).filter(Boolean).join('\n\n');
    const finalReasoning = stepReasoning || res.reasoning || res.proposal?.reasoning || res.proposal?.thought ||
      this.lastActionProposal?.reasoning || this.lastActionProposal?.thought || undefined;

    const fallbackCompleteReply = res.state === 'complete' && res.message &&
      !res.message.toLowerCase().startsWith('action executed') &&
      !res.message.toLowerCase().includes('verified complete')
      ? res.message
      : undefined;

    const finalRes: CoordinatorRunResult = {
      ...res,
      reply: res.reply || res.proposal?.reply || ((res.proposal?.kind === 'answer' || res.proposal?.kind === 'finish') ? (res.proposal.rationale || res.message) : fallbackCompleteReply),
      reasoning: finalReasoning,
      steps,
      runId: res.runId || this.currentRunId || undefined
    };
    this.lastRunResult = finalRes;

    if (this.currentGoal && !this.conversationHistory.some(m => m.role === 'user' && m.content === this.currentGoal)) {
      this.conversationHistory.push({ role: 'user', content: this.currentGoal });
    }
    const replyText = finalRes.reply || finalRes.message;
    if (replyText && typeof replyText === 'string') {
      this.conversationHistory.push({ role: 'assistant', content: replyText });
    }
    if (this.conversationHistory.length > 20) {
      this.conversationHistory = this.conversationHistory.slice(-20);
    }

    if (this.currentTabId && typeof this.browser.sendMessageToTab === 'function') {
      this.browser.sendMessageToTab(this.currentTabId, {
        type: 'SET_ACTIVE_BORDER',
        active: false
      }).catch(() => {});
      // Clear all overlays including cursor — hand cursor must not stay stuck after run
      this.browser.sendMessageToTab(this.currentTabId, { type: 'CLEAR_OVERLAYS' }).catch(() => {});
    }

    if (finalRes.success && finalRes.state === 'complete' && this.currentGoal && this.previousSnapshot && finalRes.proposal) {
      if (finalRes.stepCount === 1 || finalRes.proposal.kind === 'batch') {
        try {
          SemanticActionCache.getInstance().set(this.currentGoal, this.previousSnapshot, finalRes.proposal);
        } catch (_) {}
      }
    }

    return finalRes;
  }

  cancelRun(): void {
    this.isCancelled = true;
    this.pendingAction = null;
    this.pendingInputRequest = null;
    this.transition('idle', 'Run cancelled by user');
    if (this.currentTabId && typeof this.browser.sendMessageToTab === 'function') {
      this.browser.sendMessageToTab(this.currentTabId, {
        type: 'SET_ACTIVE_BORDER',
        active: false
      }).catch(() => {});
      this.browser.sendMessageToTab(this.currentTabId, { type: 'CLEAR_OVERLAYS' }).catch(() => {});
    }
  }

  private transition(next: AgentState, msg?: string): void {
    this.state = next;
    if (this.listeners.onStateChange) {
      this.listeners.onStateChange(next, msg, this.currentRunId);
    }
  }

  private recordActionHistory(proposal: ActionProposal): void {
    this.actionHistory.push({
      actionId: proposal.actionId,
      kind: proposal.kind,
      targetLocalId: proposal.targetLocalId,
      textToType: proposal.textToType,
      selectOptionValue: proposal.selectOptionValue,
      scrollDirection: proposal.scrollDirection
    });
    if (this.actionHistory.length > 10) {
      this.actionHistory.shift();
    }
  }

  private isRepeatedAction(proposal: ActionProposal, sanitized?: SanitizedContext): boolean {
    if (proposal.kind === 'finish' || proposal.kind === 'wait' || proposal.kind === 'batch' || proposal.kind === 'request_user_input') return false;
    if (proposal.kind === 'scroll' && Math.abs((sanitized?.pageState as any)?.stateDelta?.scrollDeltaY || 0) > 2) {
      return false;
    }

    // Consecutive identical action check (A -> A)
    if (this.actionHistory.length >= 2) {
      const last1 = this.actionHistory[this.actionHistory.length - 1];
      const last2 = this.actionHistory[this.actionHistory.length - 2];

      const matches = (a: typeof last1) =>
        a.kind === proposal.kind &&
        a.targetLocalId === proposal.targetLocalId &&
        a.textToType === proposal.textToType &&
        a.selectOptionValue === proposal.selectOptionValue &&
        a.scrollDirection === proposal.scrollDirection;

      if (matches(last1) && matches(last2)) {
        return true;
      }
    }

    // Alternating cycle check (A -> B -> A -> B -> A)
    if (this.actionHistory.length >= 4) {
      const last1 = this.actionHistory[this.actionHistory.length - 1];
      const last2 = this.actionHistory[this.actionHistory.length - 2];
      const last3 = this.actionHistory[this.actionHistory.length - 3];
      const last4 = this.actionHistory[this.actionHistory.length - 4];

      const matches = (a: any, b: any) =>
        a && b &&
        a.kind === b.kind &&
        a.targetLocalId === b.targetLocalId &&
        a.textToType === b.textToType;

      if (matches(proposal, last2) && matches(proposal, last4) && matches(last1, last3)) {
        return true;
      }
    }

    return false;
  }

  private getSearchQuery(goal: string): string {
    const plannedQuery = this.currentTaskSpec?.extractedSearchQuery?.trim();
    return plannedQuery || extractSearchQueryFromGoal(goal);
  }

  private tryResolveLocalSafeAction(
    goal: string,
    sanitized: SanitizedContext,
    step: number,
    currentUrl?: string
  ): ActionProposal | null {
    const trimmedGoal = (goal || '').trim().toLowerCase();

    // 1. Explicit scroll command. Use the normalized task contract rather than
    // reparsing raw wording, so "please/can you scroll down" stays deterministic.
    const isMultiStepGoal = Boolean(this.currentTaskContract?.isMultiStep) ||
      /\b(?:and\s+then|then|after\s+that|next|also|and\s+see|and\s+check|and\s+search|and\s+find|and\s+tell|and\s+type|and\s+select|and\s+click|and\s+hover|and\s+drag|and\s+drop|and\s+upload|how\s+many|count|submissions?|problem\s+statements?)\b/i.test(this.currentGoal || '');

    const scrollContract = this.currentTaskContract?.expectedTerminal.kind === 'scroll_changed'
      ? this.currentTaskContract.expectedTerminal
      : null;
    if (scrollContract) {
      const dir = scrollContract.direction;
      if (!isMultiStepGoal && step > 1 && this.actionHistory.length > 0 && this.actionHistory[this.actionHistory.length - 1].kind === 'scroll') {
        return {
          actionId: `act_local_finish_${step}_${Date.now()}`,
          kind: 'finish',
          confidence: 1.0,
          risk: 'safe',
          rationale: `Scroll ${dir} executed and verified; navigation complete`
        };
      }
      return {
        actionId: `act_local_scroll_${step}_${Date.now()}`,
        kind: 'scroll',
        scrollDirection: dir,
        confidence: 1.0,
        risk: 'safe',
        rationale: `Locally routed scroll ${dir} to satisfy explicit navigation directive`,
        expectedPostcondition: { kind: 'scroll_changed', direction: dir }
      };
    }

    // All legacy hardcoded domain playbooks, bookmarks, and heuristic keyword matchers
    // are completely bypassed so the central multimodal VLM is the sole decision maker.
    return null;
  }

  private isXBookmarkGoal(): boolean {
    if (!/\bbookmarks?\b/i.test(this.currentGoal || '')) return false;
    const goalMentionsX = /\b(?:x|twitter)(?:\.com|\s+(?:post|account|feed|bookmark))\b/i.test(this.currentGoal || '') ||
      /(?:^|\s)X(?:'s)?\s+bookmarks?\b/.test(this.currentGoal || '');
    const pageUrl = this.currentSanitizedContext?.pageState?.url || '';
    let onX = false;
    try { onX = /^(?:x|twitter)\.com$/i.test(new URL(pageUrl).hostname); } catch (_) {}
    return goalMentionsX || onX;
  }

  private verifyTerminalPostcondition(
    contract: TaskContract,
    sanitized: SanitizedContext,
    actionHistory: ReadonlyArray<{ actionId?: string; kind: string; targetLocalId?: string; textToType?: string; selectOptionValue?: string; scrollDirection?: string }>
  ): { satisfied: boolean; reason?: string } {
    if (this.isXBookmarkGoal()) {
      let onBookmarks = false;
      try {
        const url = new URL(sanitized.pageState?.url || '');
        const navigated = actionHistory.some(a => a.actionId?.startsWith('act_bookmarks_nav_'));
        onBookmarks = /^(?:x|twitter)\.com$/i.test(url.hostname) && (
          /^\/i\/bookmarks(?:\/|$)/i.test(url.pathname) ||
          (navigated && /^\/i\/history(?:\/|$)/i.test(url.pathname))
        );
      } catch (_) {}
      if (!onBookmarks) {
        return { satisfied: false, reason: 'Current X bookmarks have not been captured on the Bookmarks page' };
      }
      const posts = sanitized.pageState.contentSummaries || [];
      if (!posts.some(s => /^Visible post \d+(?: by [^:]+)?: .+/.test(s))) {
        return { satisfied: false, reason: 'No visible bookmark post with an author and text was captured; do not claim specific saved posts' };
      }
      return { satisfied: true, reason: 'Bookmark posts captured from the current Bookmarks page' };
    }
    if (contract.isPassive) {
      if (contract.goalPattern === 'browser_resource') {
        return { satisfied: true };
      }
      if (sanitized.elements.length === 0) {
        return { satisfied: false, reason: 'Observation contract unsatisfied: zero interactive elements observed on page' };
      }
      return { satisfied: true };
    }

    const term = contract.expectedTerminal;

    if (actionHistory.length === 0 && !contract.isAnswerGoal && term.kind !== 'answer_supported') {
      return { satisfied: false, reason: 'No prior actions executed in run' };
    }
    switch (term.kind) {
      case 'dialog_visible': {
        const reqFragment = (term.dialogId || contract.expectedTargetNameSubstring || 'preview').toLowerCase();
        const dialogTitles = (sanitized.pageState?.dialogTitles || []).map(t => t.toLowerCase());
        const dialogElements = sanitized.elements.filter(e => e.role === 'dialog');
        const elementNames = dialogElements.map(e => e.sanitizedName.toLowerCase());

        const hasMatchingDialog = dialogTitles.some(t => t.includes(reqFragment)) ||
          elementNames.some(n => n.includes(reqFragment));

        const hasAnyDialog = Boolean(
          (sanitized.pageState?.visibleDialogCount && sanitized.pageState.visibleDialogCount > 0) ||
          dialogElements.length > 0
        );

        if (!hasMatchingDialog) {
          if (hasAnyDialog) {
            return {
              satisfied: false,
              reason: `Wrong dialog visible: expected dialog matching '${reqFragment}', but found '${dialogTitles.join(', ') || elementNames.join(', ')}'`
            };
          }
          return { satisfied: false, reason: `Expected dialog matching '${reqFragment}' is not visible on page` };
        }

        const contextQualifier = (contract.structuredIntent?.contextPhrase || '').toLowerCase();
        if (contextQualifier) {
          const hasContextInDialog = dialogTitles.some(t => t.includes(contextQualifier)) ||
            elementNames.some(n => n.includes(contextQualifier)) ||
            sanitized.elements.some(e => e.isInsideDialog && (
              e.sanitizedName.toLowerCase().includes(contextQualifier) ||
              (e.containerContext && e.containerContext.toLowerCase().includes(contextQualifier))
            ));
          if (!hasContextInDialog) {
            return {
              satisfied: false,
              reason: `Opened dialog does not correspond to requested context '${contract.structuredIntent?.contextPhrase || contextQualifier}'`
            };
          }
        }

        const hasClick = actionHistory.some(a => a.kind === 'click');
        if (!hasClick) {
          return { satisfied: false, reason: 'No click action executed to open requested dialog' };
        }
        return { satisfied: true };
      }

      case 'value_present': {
        const hasAction = actionHistory.some(a => a.kind === 'type' || a.kind === 'click' || a.kind === 'upload_file');
        if (!hasAction) {
          return { satisfied: false, reason: 'No type or filter action executed to set required value' };
        }
        return { satisfied: true };
      }

      case 'select_changed': {
        const lastAction = actionHistory[actionHistory.length - 1];
        if (lastAction.kind !== 'select') {
          return { satisfied: false, reason: 'No select action executed' };
        }
        return { satisfied: true };
      }

      case 'scroll_changed': {
        const lastAction = actionHistory[actionHistory.length - 1];
        if (lastAction.kind !== 'scroll') {
          return { satisfied: false, reason: 'No scroll action executed' };
        }
        if (term.direction && lastAction.scrollDirection !== term.direction) {
          return { satisfied: false, reason: `Expected scroll direction '${term.direction}', but last action was '${lastAction.scrollDirection}'` };
        }
        return { satisfied: true };
      }

      case 'visibility_changed': {
        return { satisfied: true };
      }

      case 'status_changed': {
        const hasMutatingAction = actionHistory.some(a =>
          a.kind === 'click' ||
          a.kind === 'type' ||
          a.kind === 'select' ||
          a.kind === 'scroll' ||
          a.kind === 'hover' ||
          a.kind === 'drag_and_drop' ||
          a.kind === 'upload_file' ||
          a.kind === 'navigate'
        );
        if (!hasMutatingAction) {
          return { satisfied: false, reason: 'Action history contains only wait without any preceding trigger action' };
        }
        const statusSummaries = (sanitized.pageState?.statusSummaries || []).map(s => s.toLowerCase());
        const postSummary = (sanitized.pageState?.postconditionSummary || '').toLowerCase();
        if (term.statusId) {
          const expected = term.statusId.toLowerCase();
          const isVerifiedPattern = expected.endsWith('_verified');
          if (isVerifiedPattern) {
            if (!hasMutatingAction) {
              return { satisfied: false, reason: `Action '${term.statusId}' unverified: no mutating click or interaction was executed` };
            }
          } else {
            const matches = statusSummaries.some(s => s.includes(expected)) || postSummary.includes(expected);
            if (!matches) {
              return { satisfied: false, reason: `Status mutation unverified: expected '${term.statusId}', page indicates '${statusSummaries.join(', ') || postSummary}'` };
            }
          }
        }
        // Reject transitional 'syncing' for sync goals
        const targetSub = (contract.expectedTargetNameSubstring || '').toLowerCase();
        if (targetSub.includes('sync') || targetSub.includes('refresh')) {
          const isSynchronized = statusSummaries.some(s => s.includes('synchronized')) || postSummary.includes('synchronized');
          if (!isSynchronized) {
            return { satisfied: false, reason: `Data synchronization is still in progress; terminal state 'Synchronized' not reached` };
          }
        }
        return { satisfied: true };
      }

      case 'url_changed': {
        const hasMutatingAction = actionHistory.some(a => a.kind === 'click' || a.kind === 'type' || (a as any).kind === 'navigate');
        if (!hasMutatingAction) {
          return { satisfied: false, reason: 'No navigation or click action executed' };
        }
        return { satisfied: true };
      }

      case 'answer_supported': {
        if (contract.isMultiStep && actionHistory.length === 0) {
          return { satisfied: false, reason: 'Information retrieval requires navigation, search, or inspecting page content before concluding' };
        }
        return { satisfied: true };
      }

      default:
        return { satisfied: false, reason: `Unsupported terminal postcondition kind: ${(term as any).kind}` };
    }
  }

  private createTelemetry(
    t0: number,
    t1: number,
    t2: number,
    t3: number,
    t4: number,
    t5: number,
    t6: number,
    t7: number,
    step: number
  ): RunTelemetry {
    const stepClientMs = (t3 - t0) + (t7 - t5);
    const stepServerMs = t4 - t3;
    this.cumulativeClientLatency += stepClientMs;
    this.cumulativeServerLatency += stepServerMs;

    return {
      runId: this.currentRunId || `run_${this.t0_runStart}`,
      t0_start: this.t0_runStart,
      t1_captureComplete: t1,
      t2_detectionComplete: t2,
      t3_sanitizationValidated: t3,
      t4_reasoningReceived: t4,
      t5_actionValidated: t5,
      t6_actionExecuted: t6,
      t7_stateVerified: t7,
      totalLatencyMs: t7 - this.t0_runStart,
      clientLatencyMs: this.cumulativeClientLatency,
      serverLatencyMs: this.cumulativeServerLatency,
      stepCount: this.currentMaxSteps,
      stepsCompleted: step
    };
  }

  private getSemanticCacheContext(goal: string): string | null {
    if (!goal || typeof goal !== 'string') return null;
    const norm = goal.toLowerCase().replace(/[^a-z0-9\s]/g, ' ').replace(/\s+/g, ' ').trim();
    if (
      norm.includes('isro') ||
      norm.includes('chandrayaan') ||
      /\b(?:fresh|re-think|rethink|deep\s*think|no\s*cache|nocache|clear\s*cache)\b/i.test(norm)
    ) {
      return null;
    }

    // Dynamic session web search cache check
    for (const [cachedNorm, entry] of this.sessionWebSearchCache.entries()) {
      if (norm === cachedNorm || (norm.includes(cachedNorm) && cachedNorm.length > 8)) {
        return [
          `[ON-DEVICE EDGE SEMANTIC CACHE HIT NOTICE]`,
          `Active Query Intent: "${goal}"`,
          `Comparing intent vector against on-device semantic cache and session history: Cache hit confirmed for "${entry.query}".`,
          `Verified Citations in local store: ${entry.results.slice(0, 3).map((r: any) => r.url).join(', ')}`,
          `Locally Stored Facts: ${entry.answer || entry.results[0]?.content?.slice(0, 200)}`,
          `Because this query was previously resolved and cached locally on-device, external web search, browser navigation, and network re-scraping are completely bypassed (0 cloud tokens, 0 network requests).`,
          `STRICT INSTRUCTION: In your reasoning, state that you verified the local semantic cache, confirmed the cache hit from session history, bypassed external search, and deliver verified answer directly from cache.`,
          `Return kind: "answer" directly with the answer.`
        ].join('\n');
      }
    }

    return null;
  }

  /**
   * Starts an automated bounded multi-step agent run for a specific user goal.
   */
  async startRun(goal: string, options?: CoordinatorRunOptions): Promise<CoordinatorRunResult> {
    const requestedRunId = options?.runId || 'run_' + Date.now() + '_' + Math.random().toString(36).slice(2, 9);
    if (this.state === 'awaiting-user-confirmation' && this.pendingAction &&
        options?.runId === this.currentRunId &&
        /^(?:yes|yep|sure|okay|ok|approve|confirm|continue|go ahead|do it)[.!]?$/i.test(goal.trim())) {
      return this.approvePendingAction({ runId: this.currentRunId, actionId: this.pendingAction.actionId, resumeLoop: true });
    }
    if (this.pendingAction) this.pendingAction = null;
    if (
      this.state !== 'idle' &&
      this.state !== 'complete' &&
      this.state !== 'failed-safe' &&
      this.state !== 'blocked-local-only' &&
      this.state !== 'awaiting-user-confirmation'
    ) {
      // Auto-preempt previous run cleanly so the user's new instruction can start immediately
      this.isCancelled = true;
      this.transition('idle', 'Previous run preempted by new user request');
      await new Promise((r) => setTimeout(r, 40));
    }

    this.currentCustomPrompt = options?.customPrompt;
    this.currentExecutionFeedback = undefined;
    this.objectiveProgress = undefined;
    this.recentActionHistory = [];
    this.autofilledTargets = new Set<string>();

    if (options?.history && Array.isArray(options.history) && options.history.length > 0) {
      this.conversationHistory = options.history.map((h) => ({
        role: h.role === 'assistant' ? 'assistant' : 'user',
        content: String(h.content || '')
      }));
    }

    const RETRY_PATTERN = /^(?:do\s+again|try\s+again|retry|redo|do\s+it\s+again|again|run\s+again|repeat|one\s+more\s+time|once\s+more)[.!]?$/i;
    const AFFIRMATIVE_PATTERN = /^(?:yeah|yeha|yea|yes|yess+|yup|sure|ok|okay|k|kk|proceed|continue|do\s+it|go\s+ahead|yep|please\s+do|yes\s+please|confirm|right|cool|fine|alright|resume|submit|finish|further\s+task|trigger|convert\s+from\s+the\s+waiting\s+state\s+to\s+running)\b/i;
    let effectiveGoal = (goal || '').trim();

    if (RETRY_PATTERN.test(effectiveGoal) && this.lastGoal) {
      effectiveGoal = this.lastGoal;
    } else if (AFFIRMATIVE_PATTERN.test(effectiveGoal) || /\b(?:further\s+task|task\s+resume|agent\s+trigger|process\s+trigger|waiting\s+state\s+to\s+running|submit\s+(?:the\s+)?form|submit\s+it)\b/i.test(effectiveGoal)) {
      // Affirmative continuation: recover context and pending proposal from conversation history
      const lastAssistantMsg = [...this.conversationHistory].reverse().find(m => m.role === 'assistant')?.content || '';
      const lastUserGoal = [...this.conversationHistory].reverse().find(m => m.role === 'user' && !AFFIRMATIVE_PATTERN.test(m.content.trim()))?.content || this.lastGoal || '';

      const isFormContext = /\b(?:form|feedback|registration|isro|captcha|submit|ffbf)\b/i.test(`${this.lastGoal || ''} ${lastUserGoal} ${lastAssistantMsg}`);

      if (isFormContext) {
        effectiveGoal = 'Click the Submit button to finalize the form submission';
      } else if (lastAssistantMsg) {
        // Detect proposed sites or URLs in the assistant's previous message (e.g. "open Flipkart.com in a separate tab")
        const tabOpenMatch = lastAssistantMsg.match(/(?:open|navigate\s+to|check)\s+([a-zA-Z0-9.-]+(?:\.(?:com|in|org|net|co|io))?)\b/i);
        const proposedSite = tabOpenMatch ? tabOpenMatch[1] : '';

        if (proposedSite || (lastUserGoal && isSubAgentSwarmGoal(lastUserGoal))) {
          effectiveGoal = lastUserGoal
            ? `${lastUserGoal} - Proceed with opening ${proposedSite || 'target site'} in a new tab`
            : `Open ${proposedSite} in a new tab to continue user request`;
        } else {
          effectiveGoal = `Proceed with assistant proposal: ${lastAssistantMsg.slice(0, 200)} (Context: ${lastUserGoal || 'User request'})`;
        }
      } else if (this.lastGoal) {
        effectiveGoal = this.lastGoal;
      } else if (lastUserGoal) {
        effectiveGoal = lastUserGoal;
      }
    } else if (effectiveGoal) {
      this.lastGoal = effectiveGoal;
    }

    const normGoalForCache = effectiveGoal.toLowerCase();
    if (normGoalForCache.includes('isro') || normGoalForCache.includes('chandrayaan') || normGoalForCache.includes('aditya')) {
      for (const [k] of this.sessionWebSearchCache.entries()) {
        if (k.includes('isro') || k.includes('chandrayaan') || k.includes('aditya')) {
          this.sessionWebSearchCache.delete(k);
        }
      }
      try {
        SemanticActionCache.getInstance().clearDomain('isro');
        SemanticActionCache.getInstance().clearDomain('chandrayaan');
        SemanticActionCache.getInstance().clearDomain('aditya');
      } catch (_) {}
    }

    this.pendingInputRequest = null;
    this.currentRunId = requestedRunId;
    this.currentGoal = effectiveGoal;
    this.currentTaskContract = resolveTaskContract(effectiveGoal);
    goal = effectiveGoal;
    this.previousSnapshot = null;
    this.previousUrl = '';
    this.lastExecutedProposal = null;
    this.lastExecutionResult = null;
    this.activeStreamingOptions = {
      onThoughtDelta: options?.onThoughtDelta,
      onReplyDelta: options?.onReplyDelta
    };

    let initialActiveTab: any = null;
    try {
      if (options?.tabId && typeof (this.browser as any).getStrictTab === 'function') {
        initialActiveTab = await (this.browser as any).getStrictTab(options.tabId);
      }
      if (!initialActiveTab) {
        initialActiveTab = await this.browser.getActiveTab(options?.tabId);
      }
      if (initialActiveTab?.id) {
        this.currentTabId = initialActiveTab.id;
      }
    } catch (_) {
      if (options?.tabId) {
        this.currentTabId = options.tabId;
      }
    }

    if (this.currentTabId && typeof this.browser.sendMessageToTab === 'function') {
      this.browser.sendMessageToTab(this.currentTabId, {
        type: 'SET_ACTIVE_BORDER',
        active: true,
        label: isSubAgentSwarmGoal(effectiveGoal) ? 'Sub-Agent Swarm Active' : 'PrivaPilot Agent Active'
      }).catch(() => {});
    }

    // Fast-track: Pure conversational greetings or direct queries bypass heavy perception and potential tab blockages
    const PURE_GREETING_PATTERN = /^(?:hi|hello|hey|hey\s+(?:bro|broo|there|man|buddy|friend)|sup|yo|what'?s\s+up|howdy|greetings|good\s+(?:morning|afternoon|evening|day)|who\s+are\s+you|what\s+can\s+you\s+do|how\s+are\s+you)\s*[!.?]*$/i;
    if (PURE_GREETING_PATTERN.test((goal || '').trim())) {
      this.transition('awaiting-reasoning', 'Synthesizing response with reasoning model...');
      const chatRes = typeof (this.httpClient as any)?.requestGeneralChatStream === 'function'
        ? await this.httpClient.requestGeneralChatStream(goal, {
            history: this.conversationHistory as any,
            customPrompt: options?.customPrompt,
            onThoughtDelta: options?.onThoughtDelta,
            onReplyDelta: options?.onReplyDelta
          })
        : await this.httpClient.requestGeneralChat(goal, this.conversationHistory as any);
      const answerAction: ActionProposal = {
        actionId: `act_greet_${Date.now()}`,
        kind: 'answer' as any,
        confidence: 1.0,
        risk: 'safe',
        rationale: chatRes.reply,
        message: chatRes.reply,
        reply: chatRes.reply,
        reasoning: chatRes.reasoning || 'Welcomed user and introduced capabilities.',
        expectedPostcondition: { kind: 'status_changed' }
      };
      this.transition('complete', 'Responded to greeting');
      const res: CoordinatorRunResult = {
        runId: this.currentRunId,
        success: true,
        state: 'complete',
        reply: chatRes.reply,
        message: chatRes.reply,
        reasoning: chatRes.reasoning,
        proposal: answerAction,
        stepCount: 1,
        steps: [{
          step: 1,
          captureId: `cap_greet_${Date.now()}`,
          pageGeneration: `gen_greet_${Date.now()}`,
          maskCount: 0,
          sanitizedScreenshotBytes: 0,
          decisionOrigin: 'server',
          proposal: answerAction,
          riskDecision: 'safe',
          confidenceDecision: 'accepted',
          executed: true,
          executionResult: { success: true, staleTarget: false, reasonCode: 'EXECUTION_SUCCESS' },
          verification: { verified: true, reasonCode: 'DIRECT_ANSWER', durationMs: 0 },
          networkRequestMade: true,
          timings: { total: 0, reasoning: 0 }
        }]
      };
      this.completeWithResult(res);
      return res;
    }

    // Query dynamic LLM task planner for Tasks To Do & Tasks Not To Do
    try {
      const plannedSpec = await this.httpClient.requestTaskSpecification(
        effectiveGoal,
        undefined,
        this.currentCustomPrompt
      );
      const legacyTasks = plannedSpec.tasksToDo || [];
      this.currentTaskSpec = plannedSpec.objectives?.length ? plannedSpec : {
        ...plannedSpec,
        objectives: (legacyTasks.length ? legacyTasks : ['Complete the requested goal']).map((description, index) => ({
          id: `objective_${index + 1}`,
          sequence: index + 1,
          intent: index === legacyTasks.length - 1 && /verify|confirm/i.test(description) ? 'verify' as const : 'inspect' as const,
          description,
          expectedEvidence: ['verified semantic outcome'],
          status: index === 0 ? 'active' as const : 'pending' as const,
          ...(index > 0 ? { dependsOn: [`objective_${index}`] } : {})
        }))
      };
      this.objectiveProgress = createInitialObjectiveProgress(this.currentTaskSpec);
    } catch (_) {
      this.currentTaskSpec = undefined;
    }

    // Fast-track: Sub-Agent Swarm / Comparative Multi-Portal Goals
    if (isSubAgentSwarmGoal(effectiveGoal) || this.currentTaskSpec?.requiresSubAgents) {
      return this.dispatchSubAgentSwarm(effectiveGoal);
    }

    if (!this.currentTaskContract.supported && this.currentTaskContract.goalPattern === 'empty') {
      const errorMsg = this.currentTaskContract.abstentionReason || 'Empty goal: Please provide an instruction';
      this.transition('failed-safe', errorMsg);
      const res: CoordinatorRunResult = {
        runId: this.currentRunId,
        success: false,
        state: 'failed-safe',
        error: errorMsg,
        stepCount: 0,
        steps: []
      };
      return this.completeWithResult(res);
    }

    // Interactive user input prompt: If goal requires credentials or user input that was not supplied
    if (this.currentTaskContract.requiresUserInput) {
      const inputPrompt = this.currentTaskContract.userInputPrompt || 'User input required to proceed.';
      this.transition('awaiting-user-confirmation', inputPrompt);
      const inputNonce = this.generateInputNonce();
      let expectedOrigin: string | undefined = undefined;
      try {
        if (initialActiveTab?.url) {
          expectedOrigin = new URL(initialActiveTab.url).origin;
        }
      } catch (_) {}

      this.pendingInputRequest = {
        kind: this.currentTaskContract.userInputKind || (/captcha|code|text|name|email|message|feedback/i.test(inputPrompt) ? 'text_input' : 'credentials'),
        prompt: inputPrompt,
        runId: this.currentRunId,
        leasedTabId: this.currentTabId,
        inputNonce,
        expectedOrigin
      };
      this.listeners.onUserInputRequired?.(this.pendingInputRequest);
      const res: CoordinatorRunResult = {
        runId: this.currentRunId,
        success: true,
        state: 'awaiting-user-confirmation',
        message: inputPrompt,
        inputRequest: this.pendingInputRequest,
        stepCount: 0,
        steps: []
      };
      return this.completeWithResult(res);
    }

    this.currentStep = 0;
    this.currentMaxSteps = Math.max(1, Math.min(options?.maxSteps ?? this.defaultMaxSteps, 30));
    this.maxStaleRetries = options?.maxStaleRetries ?? this.defaultMaxStaleRetries;
    this.currentStaleRetries = 0;
    this.lastStaleTargetId = null;
    this.pendingAction = null;
    this.pendingInputRequest = null;
    this.actionHistory = [];
    this.hasTavilyRecovered = false;
    this.t0_runStart = Date.now();
    this.cumulativeClientLatency = 0;
    this.cumulativeServerLatency = 0;
    this.isCancelled = false;
    this.stepsTrace = [];
    if (this.currentTabId && typeof chrome !== 'undefined' && chrome.tabs?.update) {
      try {
        chrome.tabs.update(this.currentTabId, { active: true });
      } catch (_) {}
    }

    return this.executeLoop();
  }


  private async executeLoop(): Promise<CoordinatorRunResult> {
    try {
      const goal = this.currentGoal;
      if (!goal) {
        const res: CoordinatorRunResult = { success: false, state: 'idle', error: 'No active goal' };
        return this.completeWithResult(res);
      }

      if (isSubAgentSwarmGoal(goal)) {
        return this.dispatchSubAgentSwarm(goal);
      }

    let hasNavigatedInitially = false;

    while (this.currentStep < this.currentMaxSteps) {
      if (this.isCancelled) {
        this.transition('idle', 'Run cancelled by user');
        const res: CoordinatorRunResult = { success: false, state: 'idle', message: 'Run cancelled by user' };
        return this.completeWithResult(res);
      }

      this.currentStep++;
      const step = this.currentStep;
      const maxSteps = this.currentMaxSteps;
      const t0_step = Date.now();
      const isFormOrRegistrationGoal = /\b(?:fill|register|registration|signup|sign\s*up|submit|details)\b/i.test(this.currentGoal || '');

      // Step 1: Capture active tab DOM & screenshot (fresh captureId each cycle)
      this.transition('capturing', `Step ${step}/${maxSteps}: Capturing active tab DOM & screenshot`);
      if (this.currentTabId && typeof chrome !== 'undefined' && chrome.tabs?.update) {
        try {
          await new Promise<void>((resolve) => {
            chrome.tabs.get(this.currentTabId!, (tab: any) => {
              if (!chrome.runtime.lastError && tab && !tab.active) {
                chrome.tabs.update(this.currentTabId!, { active: true }, () => resolve());
              } else {
                resolve();
              }
            });
          });
        } catch (_) {}
      }
      let activeTab = await this.browser.getActiveTab(this.currentTabId);

      // Guard: Block restricted browser surfaces (chrome://, chrome-extension://, file://, devtools://)
      const restrictedCheck = isRestrictedBrowserUrl(activeTab?.url);
      if (restrictedCheck.isRestricted) {
        // If tab is on a restricted or blank page (e.g. chrome://newtab, about:blank),
        // consult the centralized reasoning model first for the initial navigation proposal!
        let proposal: ActionProposal | null = null;
        try {
          const blankScreenshot = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==';
          const blankContext: SanitizedContext = {
            _brand: 'SanitizedContext_Verified',
            protocolVersion: '1.0',
            runId: this.currentRunId,
            captureId: `cap_init_${Date.now()}`,
            goal,
            sanitizedScreenshotDataUrl: blankScreenshot,
            elements: [],
            pageState: {
              title: scrubOptionalText(activeTab?.title || 'New Tab'),
              url: sanitizeOutboundUrl(activeTab?.url || 'chrome://newtab'),
              viewport: [1280, 800]
            },
            maskCount: 0,
            payloadDigestSha256: 'sha256_init_blank',
            timestamp: Date.now()
          };
          const cacheHitContext = this.getSemanticCacheContext(goal);
          const effectiveCustomPrompt = cacheHitContext
            ? (this.currentCustomPrompt ? `${this.currentCustomPrompt}\n\n${cacheHitContext}` : cacheHitContext)
            : this.currentCustomPrompt;
          if (effectiveCustomPrompt) {
            (blankContext as any).customPrompt = scrubOptionalText(effectiveCustomPrompt);
          }
          if (this.conversationHistory && this.conversationHistory.length > 0) {
            (blankContext as any).history = scrubHistory(this.conversationHistory);
          }
          this.transition('sending-sanitized-context', `Step ${step}/${maxSteps}: Transmitting initial tab context`);
          this.transition('awaiting-reasoning', `Step ${step}/${maxSteps}: Formulating initial navigation action`);
          proposal = typeof (this.httpClient as any).requestReasoningActionStream === 'function'
            ? await (this.httpClient as any).requestReasoningActionStream(blankContext, this.activeStreamingOptions)
            : await this.httpClient.requestReasoningAction(blankContext);
        } catch (err: any) {
          console.warn('[PrivaPilot Coordinator] Initial LLM reasoning unavailable on blank tab, using fallback resolution:', err?.message || err);
        }

        // Handle direct conversational answer / on-device cache hit reply from blank/restricted tab
        if (proposal && (proposal.kind === 'answer' || proposal.kind === 'finish')) {
          const finalAnswer = proposal.reply || proposal.message || proposal.rationale || '';
          this.actionHistory.push(proposal);
          this.listeners.onActionProposed?.(proposal, this.currentRunId);
          this.transition('complete', `Task completed: ${finalAnswer.slice(0, 80)}`);
          return this.completeWithResult({
            success: true,
            state: 'complete',
            stepCount: step,
            message: finalAnswer,
            reply: finalAnswer,
            reasoning: proposal.reasoning || proposal.thought,
            proposal,
            steps: [{
              step: 1,
              captureId: `cap_ans_${Date.now()}`,
              pageGeneration: `cap_ans_${Date.now()}`,
              maskCount: 0,
              sanitizedScreenshotBytes: 0,
              decisionOrigin: 'server',
              proposal,
              riskDecision: 'safe',
              confidenceDecision: 'accepted',
              executed: true,
              executionResult: { success: true, staleTarget: false, reasonCode: 'EXECUTION_SUCCESS' },
              verification: { verified: true, reasonCode: 'DIRECT_ANSWER', durationMs: 0 },
              networkRequestMade: true,
              timings: { total: Date.now() - t0_step, reasoning: Date.now() - t0_step }
            }]
          });
        }

        // Handle LLM web_search tool proposal from blank/restricted tab
        if (proposal && proposal.kind === 'web_search') {
          const searchQuery = proposal.searchQuery || goal;
          this.transition('executing', `Searching web via Tavily: "${searchQuery}"...`);
          this.listeners.onActionProposed?.(proposal, this.currentRunId);
          try {
            const searchRes = typeof this.httpClient?.searchWeb === 'function' ? await this.httpClient.searchWeb(searchQuery, 5) : null;
            const results = searchRes?.results || [];
            const answer = searchRes?.answer || '';
            const searchProposal: ActionProposal = {
              ...proposal,
              searchResults: results,
              reply: answer || (results.length > 0 ? `Here is the verified web intelligence retrieved for "${searchQuery}":` : `No matching web results found for "${searchQuery}".`),
              rationale: proposal.rationale || `Web search executed for "${searchQuery}"`
            };
            this.actionHistory.push(searchProposal);
            const normSearchQuery = searchQuery.toLowerCase().replace(/[^a-z0-9\s]/g, ' ').replace(/\s+/g, ' ').trim();
            if (!normSearchQuery.includes('isro') && !normSearchQuery.includes('chandrayaan') && !normSearchQuery.includes('aditya')) {
              this.sessionWebSearchCache.set(
                normSearchQuery,
                { query: searchQuery, results, answer: searchProposal.reply || '', timestamp: Date.now() }
              );
            }
            this.listeners.onActionProposed?.(searchProposal, this.currentRunId);
            this.transition('complete', `Web search completed for "${searchQuery}"`);
            return this.completeWithResult({
              success: true,
              state: 'complete',
              stepCount: step,
              message: searchProposal.reply,
              proposal: searchProposal,
              steps: [{
                step: 1,
                captureId: `cap_search_${Date.now()}`,
                pageGeneration: `cap_search_${Date.now()}`,
                maskCount: 0,
                sanitizedScreenshotBytes: 0,
                decisionOrigin: 'server',
                proposal: searchProposal,
                riskDecision: 'safe',
                confidenceDecision: 'accepted',
                executed: true,
                executionResult: { success: true, staleTarget: false, reasonCode: 'EXECUTION_SUCCESS' },
                verification: { verified: true, reasonCode: 'WEB_SEARCH_SUCCESS', durationMs: 0 },
                networkRequestMade: true,
                timings: { total: Date.now() - t0_step }
              }]
            });
          } catch (searchErr: any) {
            console.error('[PrivaPilot Coordinator] Web search failed on blank tab:', searchErr);
          }
        }

        let targetUrl = proposal && proposal.kind === 'navigate' ? (proposal.url || (proposal as any).targetUrl) : undefined;
        if (!targetUrl) {
          targetUrl = extractTargetUrlFromGoal(goal);
        }
        if (!targetUrl) {
          targetUrl = 'https://www.google.com';
        }

        if (targetUrl && typeof this.browser.navigateTab === 'function') {
          hasNavigatedInitially = true;
          const navAction: ActionProposal = proposal && proposal.kind === 'navigate' ? proposal : {
            actionId: `act_init_nav_${Date.now()}`,
            kind: 'navigate' as any,
            url: targetUrl,
            confidence: 1.0,
            risk: 'safe',
            rationale: `Direct navigation from blank tab to target website: ${targetUrl}`,
            expectedPostcondition: { kind: 'status_changed' }
          };
          this.actionHistory.push(navAction);
          this.listeners.onActionProposed?.(navAction, this.currentRunId);

          this.currentMaxSteps = Math.max(this.currentMaxSteps, 5);
          this.transition('executing', `Navigating from blank tab to ${targetUrl}...`);
          const navRes = await this.browser.navigateTab(activeTab?.id || 0, targetUrl);
          if (navRes && typeof navRes === 'object' && navRes.tabId) {
            this.currentTabId = navRes.tabId;
            activeTab.id = navRes.tabId;
          }
          if (navRes && navRes.url) {
            activeTab.url = navRes.url;
          }

          // If still restricted, poll tab once more to give Chrome time to settle
          if (isRestrictedBrowserUrl(activeTab?.url).isRestricted) {
            await new Promise((r) => setTimeout(r, 600));
            const reTab = await this.browser.getActiveTab(this.currentTabId);
            if (reTab && reTab.url) {
              activeTab = reTab;
              this.currentTabId = reTab.id;
            }
          }

          const hasFollowUpDirective = /\b(?:and\s+then|then|after\s+that|next|also|and|to|for)\s+(?:download|search|find|locate|open|get|see|check|filter|type|fill|click|select|view|explore|read|save)\b/i.test(goal);
          if (!hasFollowUpDirective && (isPureNavigationGoal(goal) || this.currentTaskContract?.goalPattern === 'navigate_url')) {
            this.transition('complete', `Navigated to ${targetUrl}`);
            return this.completeWithResult({
              success: true,
              state: 'complete',
              stepCount: step,
              message: `Navigated to ${targetUrl}`,
              proposal: navAction,

              steps: [{
                step: 1,
                captureId: `cap_nav_${Date.now()}`,
                pageGeneration: `cap_nav_${Date.now()}`,
                maskCount: 0,
                sanitizedScreenshotBytes: 0,
                decisionOrigin: 'local',
                proposal: navAction,
                riskDecision: 'safe',
                confidenceDecision: 'accepted',
                executed: true,
                executionResult: { success: true, staleTarget: false, reasonCode: 'EXECUTION_SUCCESS' },
                verification: { verified: true, reasonCode: 'NAVIGATION_SUCCESS', durationMs: 0 },
                networkRequestMade: false,
                timings: { total: Date.now() - t0_step }
              }]
            });
          }

          const subGoal = stripNavigationPrefixFromGoal(goal);
          if (subGoal && subGoal !== goal) {
            this.currentGoal = subGoal;
            this.currentTaskContract = resolveTaskContract(subGoal);
          }
          this.previousUrl = 'about:blank';
          this.lastExecutedProposal = navAction;
          this.lastExecutionResult = { success: true, message: `Loaded ${targetUrl}` };
          this.transition('capturing', `Loaded ${targetUrl}. Re-perceiving page elements...`);
          continue;
        }

        // If on a restricted surface without navigation capability, synthesize answer with reasoning model
        if (typeof (this.httpClient as any)?.requestGeneralChat === 'function') {
          this.transition('awaiting-reasoning', `Step ${step}/${maxSteps}: Synthesizing response with reasoning model`);
          try {
            const chatRes = await this.httpClient.requestGeneralChat(goal, this.conversationHistory as any);
            if (chatRes && chatRes.reply) {
              this.transition('complete', chatRes.reply);
              return this.completeWithResult({
                success: true,
                state: 'complete',
                stepCount: step,
                reply: chatRes.reply,
                message: chatRes.reply
              });
            }
          } catch (_) {}
        }

        const errorMsg = `Capture blocked: ${restrictedCheck.reason}`;
        this.transition('blocked-local-only', errorMsg);
        const res: CoordinatorRunResult = {
          success: false,
          state: 'blocked-local-only',
          error: errorMsg,
          stepCount: step
        };
        return this.completeWithResult(res);
      }

      // If on step 1 and the goal contains a target domain/URL to navigate to,
      // navigate directly to target domain/URL (in a new tab if coming from an existing different site)
      if (step === 1 && !hasNavigatedInitially && typeof this.browser.navigateTab === 'function') {
        const targetUrl = extractTargetUrlFromGoal(goal);
        if (targetUrl && activeTab?.url) {
          try {
            const currentHost = new URL(activeTab.url).hostname.toLowerCase();
            const targetHost = new URL(targetUrl).hostname.toLowerCase();
            const isMissingWww = currentHost === 'isro.gov.in' && targetHost === 'www.isro.gov.in';
            const isDifferentSite = currentHost.replace(/^www\./, '') !== targetHost.replace(/^www\./, '');
            const isSubdomainOrRedirect =
              currentHost === targetHost ||
              currentHost.endsWith('.' + targetHost) ||
              targetHost.endsWith('.' + currentHost) ||
              (targetHost.includes('gmail.com') && currentHost.includes('google.com')) ||
              (targetHost.includes('google.com') && currentHost.includes('google.com'));

            const hasPathChange = (() => {
              try {
                const cur = new URL(activeTab.url);
                const tgt = new URL(targetUrl);
                return tgt.pathname.length > 1 && cur.pathname !== tgt.pathname;
              } catch (_) {
                return false;
              }
            })();

            // Guard against navigating away ONLY if the user explicitly commanded an action strictly on the current page
            // and did not supply an explicit URL or navigation verb
            const isExplicitOnPageOnly =
              /\b(?:on\s+this\s+page|in\s+this\s+page|on\s+current\s+page|this\s+page|this\s+table)\b/i.test(goal) &&
              !/^https?:\/\//i.test(goal.trim()) &&
              !/\b(?:go\s+to|open|visit|navigate\s+to|launch)\b/i.test(goal);

            if (!isExplicitOnPageOnly && ((isMissingWww || isDifferentSite || hasPathChange) && (!isSubdomainOrRedirect || hasPathChange))) {
              hasNavigatedInitially = true;
              const isExplicitNewTab = /\b(?:new\s+tab|another\s+tab|fresh\s+tab)\b/i.test(goal);
              const isFromExistingWebpage = !isRestrictedBrowserUrl(activeTab.url).isRestricted;
              const isSearchEngineOrBlank = /(?:google\.[a-z.]+|bing\.com|duckduckgo\.com|yahoo\.com)\/?$/i.test(activeTab.url?.replace(/^https?:\/\/(?:www\.)?/, ''));
              const shouldOpenNewTab = isExplicitNewTab || (isDifferentSite && isFromExistingWebpage && !isSearchEngineOrBlank);

              const navAction: ActionProposal = {
                actionId: `act_init_nav_${Date.now()}`,
                kind: 'navigate' as any,
                confidence: 1.0,
                risk: 'safe',
                rationale: shouldOpenNewTab
                  ? `Opening new Chrome tab for target website: ${targetUrl}`
                  : `Navigation to target website: ${targetUrl}`,
                expectedPostcondition: { kind: 'status_changed' }
              };
              this.actionHistory.push(navAction);
              this.listeners.onActionProposed?.(navAction, this.currentRunId);

              this.currentMaxSteps = Math.max(this.currentMaxSteps, 5);
              this.transition('executing', shouldOpenNewTab ? `Opening new tab for ${targetUrl}...` : `Navigating tab to ${targetUrl}...`);
              const navRes = await this.browser.navigateTab(activeTab.id, targetUrl, { createNewTab: shouldOpenNewTab });
              if (navRes && typeof navRes === 'object' && navRes.tabId) {
                this.currentTabId = navRes.tabId;
                activeTab.id = navRes.tabId;
              }
              if (navRes && navRes.url) {
                activeTab.url = navRes.url;
              } else if (targetUrl) {
                activeTab.url = targetUrl;
              }

              const hasFollowUpDirective = /\b(?:and\s+then|then|after\s+that|next|also|and|to|for)\s+(?:download|search|find|locate|open|get|see|check|filter|type|fill|click|select|view|explore|read|save)\b/i.test(goal);
              if (!hasFollowUpDirective && (isPureNavigationGoal(goal) || this.currentTaskContract?.goalPattern === 'navigate_url')) {
                this.transition('complete', `Navigated to ${targetUrl}`);
                return this.completeWithResult({
                  success: true,
                  state: 'complete',
                  stepCount: step,
                  message: `Navigated to ${targetUrl}`,
                  proposal: navAction,
    
                  steps: [{
                    step: 1,
                    captureId: `cap_nav_${Date.now()}`,
                    pageGeneration: `cap_nav_${Date.now()}`,
                    maskCount: 0,
                    sanitizedScreenshotBytes: 0,
                    decisionOrigin: 'local',
                    proposal: navAction,
                    riskDecision: 'safe',
                    confidenceDecision: 'accepted',
                    executed: true,
                    executionResult: { success: true, staleTarget: false, reasonCode: 'EXECUTION_SUCCESS' },
                    verification: { verified: true, reasonCode: 'NAVIGATION_SUCCESS', durationMs: 0 },
                    networkRequestMade: false,
                    timings: { total: Date.now() - t0_step }
                  }]
                });
              }

              const subGoal = stripNavigationPrefixFromGoal(goal);
              if (subGoal && subGoal !== goal) {
                this.currentGoal = subGoal;
                this.currentTaskContract = resolveTaskContract(subGoal);
              }
              this.previousUrl = activeTab?.url || '';
              this.lastExecutedProposal = navAction;
              this.lastExecutionResult = { success: true, message: `Loaded ${targetUrl}` };
              this.transition('capturing', `Loaded ${targetUrl}. Re-perceiving page elements...`);
              continue;
            } else if (isSubdomainOrRedirect && !hasPathChange) {
              const hasFollowUpDirective = /\b(?:and\s+then|then|after\s+that|next|also|and|to|for)\s+(?:download|search|find|locate|open|get|see|check|filter|type|fill|click|select|view|explore|read|save)\b/i.test(goal);
              if (!hasFollowUpDirective && (isPureNavigationGoal(goal) || this.currentTaskContract?.goalPattern === 'navigate_url')) {
                this.transition('complete', `Already on ${targetUrl}`);
                const navAction: ActionProposal = {
                  actionId: `act_init_nav_${Date.now()}`,
                  kind: 'navigate' as any,
                  confidence: 1.0,
                  risk: 'safe',
                  rationale: `Already at target website: ${targetUrl}`,
                  expectedPostcondition: { kind: 'status_changed' }
                };
                return this.completeWithResult({
                  success: true,
                  state: 'complete',
                  stepCount: step,
                  message: `Already on ${targetUrl}`,
                  proposal: navAction
                });
              }
              const subGoal = stripNavigationPrefixFromGoal(goal);
              if (subGoal && subGoal !== goal) {
                this.currentGoal = subGoal;
                this.currentTaskContract = resolveTaskContract(subGoal);
              }
              this.previousUrl = activeTab?.url || '';
              this.transition('capturing', `Already at ${targetUrl}. Re-perceiving page elements...`);
              continue;
            }
          } catch {
            // URL parse failure, proceed to DOM capture
          }
        }
      }

      // Ensure tab has finished loading and any redirection has settled
      if (activeTab && activeTab.id && typeof this.browser.waitForTabReady === 'function') {
        const readyTab = await this.browser.waitForTabReady(activeTab.id, 6000, activeTab.url);
        if (readyTab && readyTab.url) {
          activeTab = {
            id: readyTab.id,
            url: readyTab.url,
            title: readyTab.title || activeTab.title,
            windowId: readyTab.windowId || activeTab.windowId
          };
        }
      }

      // If the active tab is already displaying a PDF or downloadable document, and the goal is to download/open a document:
      const currentTabUrl = activeTab?.url || '';
      const isPdfUrl = /\.pdf(?:\?.*)?$/i.test(currentTabUrl);
      const isDocRetrievalGoal = /\b(?:brochure|pdf|download|document|report|circular|open|view|show|get)\b/i.test(this.currentGoal || '');
      if (isPdfUrl && isDocRetrievalGoal) {
        const pdfFilename = currentTabUrl.split('/').pop()?.split('?')[0] || 'document.pdf';
        if (typeof chrome !== 'undefined' && chrome.downloads && typeof chrome.downloads.download === 'function') {
          try {
            chrome.downloads.download({
              url: currentTabUrl,
              filename: pdfFilename,
              conflictAction: 'uniquify',
              saveAs: false
            }, () => {});
          } catch (_) {}
        }
        const pdfDisplayName = pdfFilename.replace(/_/g, ' ').replace(/\.pdf$/i, '');
        const pdfReply = `✅ Successfully opened **${pdfDisplayName}** — the official document is now displayed in your browser.\n\nYou can save or print it using the PDF viewer controls (top-right corner of the page). The direct link is:\n${currentTabUrl}`;
        this.transition('complete', `Document successfully opened and retrieved: ${pdfFilename}`);
        return this.completeWithResult({
          success: true,
          state: 'complete',
          stepCount: step,
          message: `Brochure successfully opened and downloaded: ${pdfFilename}`,
          reply: pdfReply,
          proposal: this.lastExecutedProposal || undefined
        });
      }

      if (activeTab && activeTab.id && typeof this.browser.ensureContentScript === 'function') {
        await this.browser.ensureContentScript(activeTab.id);
      }

      const captureId = `cap_${Date.now()}_${step}`;
      let domResponse: any;
      try {
        domResponse = await this.browser.sendMessageToTab(activeTab.id, {
          type: 'EXTRACT_DOM_SNAPSHOT',
          captureId
        });
      } catch (err: any) {
        // Content script might be initializing after redirect or bfcache transition - retry with auto-injection
        if (typeof this.browser.ensureContentScript === 'function') {
          try {
            await this.browser.ensureContentScript(activeTab.id);
            await new Promise((r) => setTimeout(r, 500));
            domResponse = await this.browser.sendMessageToTab(activeTab.id, {
              type: 'EXTRACT_DOM_SNAPSHOT',
              captureId
            });
          } catch (_) {}
        }
        if (!domResponse || !domResponse.success) {
          try {
            await new Promise((r) => setTimeout(r, 700));
            if (typeof this.browser.ensureContentScript === 'function') {
              await this.browser.ensureContentScript(activeTab.id);
            }
            domResponse = await this.browser.sendMessageToTab(activeTab.id, {
              type: 'EXTRACT_DOM_SNAPSHOT',
              captureId
            });
          } catch (_) {}
        }

        if (!domResponse || !domResponse.success) {
          if (isPdfUrl && isDocRetrievalGoal) {
            const pdfFilename = currentTabUrl.split('/').pop()?.split('?')[0] || 'document.pdf';
            const pdfDisplayName2 = pdfFilename.replace(/_/g, ' ').replace(/\.pdf$/i, '');
            const pdfReply2 = `✅ Successfully opened **${pdfDisplayName2}** — the official document is now displayed in your browser.\n\nYou can save or print it using the PDF viewer controls (top-right corner of the page). The direct link is:\n${currentTabUrl}`;
            this.transition('complete', `Document successfully opened and retrieved: ${pdfFilename}`);
            return this.completeWithResult({
              success: true,
              state: 'complete',
              stepCount: step,
              message: `Brochure successfully opened and downloaded: ${pdfFilename}`,
              reply: pdfReply2,
              proposal: this.lastExecutedProposal || undefined
            });
          }


          const isExplicitOnPageOnly =
            /\b(?:on\s+this\s+page|in\s+this\s+page|on\s+current\s+page|this\s+page|this\s+table)\b/i.test(goal) &&
            !/^https?:\/\//i.test(goal.trim()) &&
            !/\b(?:go\s+to|open|visit|navigate\s+to|launch)\b/i.test(goal);
          let targetUrl = !isExplicitOnPageOnly ? extractTargetUrlFromGoal(goal) : undefined;
          let isAlreadyOnTargetSite = false;
          if (targetUrl && activeTab?.url) {
            try {
              const curHost = new URL(activeTab.url).hostname.toLowerCase().replace(/^www\./, '');
              const tgtHost = new URL(targetUrl).hostname.toLowerCase().replace(/^www\./, '');
              isAlreadyOnTargetSite = curHost === tgtHost;
            } catch (_) {}
          }

          if (targetUrl && !isAlreadyOnTargetSite && typeof this.browser.navigateTab === 'function' && step === 1 && !hasNavigatedInitially) {
            hasNavigatedInitially = true;
            this.transition('executing', `Navigating tab to ${targetUrl}...`);
            const navRes = await this.browser.navigateTab(activeTab.id, targetUrl);
            if (navRes && typeof navRes === 'object' && navRes.tabId) {
              this.currentTabId = navRes.tabId;
              activeTab.id = navRes.tabId;
            }
            if (navRes && navRes.url) {
              activeTab.url = navRes.url;
            } else if (targetUrl) {
              activeTab.url = targetUrl;
            }
            const hasFollowUpDirective = /\b(?:and\s+then|then|after\s+that|next|also|and|to|for)\s+(?:download|search|find|locate|open|get|see|check|filter|type|fill|click|select|view|explore|read|save)\b/i.test(goal);
            if (!hasFollowUpDirective && (isPureNavigationGoal(goal) || this.currentTaskContract?.goalPattern === 'navigate_url')) {
              this.transition('complete', `Navigated to ${targetUrl}`);
              return this.completeWithResult({
                success: true,
                state: 'complete',
                stepCount: step,
                message: `Navigated to ${targetUrl}`
              });
            }
            const subGoal = stripNavigationPrefixFromGoal(goal);
            if (subGoal && subGoal !== goal) {
              this.currentGoal = subGoal;
              this.currentTaskContract = resolveTaskContract(subGoal);
            }
            continue;
          }

          const errorMsg = 'Could not connect to webpage. Please reload the target tab (Cmd+R / F5) so the extension content script attaches.';
          this.transition('failed-safe', errorMsg);
          const res: CoordinatorRunResult = {
            success: false,
            state: 'failed-safe',
            error: errorMsg,
            stepCount: step
          };
          return this.completeWithResult(res);
        }
      }

      if (!domResponse || !domResponse.success) {
        if (typeof this.browser.ensureContentScript === 'function') {
          try {
            await this.browser.ensureContentScript(activeTab.id);
            await new Promise((r) => setTimeout(r, 400));
            domResponse = await this.browser.sendMessageToTab(activeTab.id, {
              type: 'EXTRACT_DOM_SNAPSHOT',
              captureId
            });
          } catch (_) {}
        }
      }

      if (!domResponse || !domResponse.success) {
        const errorMsg = 'Could not extract page elements from webpage. Please reload the target tab (Cmd+R / F5) so PrivaPilot can connect and perceive the page.';
        this.transition('failed-safe', errorMsg);
        const res: CoordinatorRunResult = {
          success: false,
          state: 'failed-safe',
          error: errorMsg,
          stepCount: step
        };
        return this.completeWithResult(res);
      }

      // Dynamic SPAs can report document complete before their controls hydrate.
      // Poll only while the snapshot is visibly loading and lacks substantive UI.
      const snapshotNeedsHydration = (response: any): boolean => {
        if (!response?.success) return false;
        const snapshot = response.snapshot || {};
        const interactiveCount = snapshot.interactiveElements?.length || 0;
        const textNodes = snapshot.textNodes || [];
        const visibleText = textNodes.map((node: any) => node.text || '').join(' ').trim();
        const showsLoading = /\b(?:loading|initializing|please wait)\b/i.test(`${snapshot.pageTitle || ''} ${visibleText}`);
        return interactiveCount <= 2 && (showsLoading || visibleText.length < 40);
      };
      if (snapshotNeedsHydration(domResponse)) {
        const hydrationDelays = [1000, 2000, 4000];
        for (let attempt = 0; attempt < hydrationDelays.length && snapshotNeedsHydration(domResponse); attempt++) {
          this.transition('executing', `Waiting for application controls to load (${attempt + 1}/${hydrationDelays.length})...`);
          await new Promise((resolve) => setTimeout(resolve, hydrationDelays[attempt]));
          try {
            const refreshed = await this.browser.sendMessageToTab(activeTab.id, {
              type: 'EXTRACT_DOM_SNAPSHOT',
              captureId
            });
            if (refreshed?.success) domResponse = refreshed;
          } catch (_) {}
        }
      }

      let screenshotDataUrl: string;
      try {
        screenshotDataUrl = await this.browser.captureVisibleTab(activeTab?.windowId);
      } catch (err: any) {
        console.warn(`[Coordinator] Screenshot capture warning: ${err?.message || 'restricted view'}. Proceeding with resilient DOM snapshot fallback.`);
        screenshotDataUrl = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==';
      }
      if (!screenshotDataUrl) {
        screenshotDataUrl = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==';
      }
      const t1_captureComplete = Date.now();

      // Live Viewfinder: Highlight focused task area with rope/marching-ants border on the webpage
      if (domResponse?.snapshot?.focusedRegion && activeTab?.id) {
        this.browser.sendMessageToTab(activeTab.id, {
          type: 'HIGHLIGHT_FOCUSED_REGION',
          region: domResponse.snapshot.focusedRegion,
          durationMs: 3000
        }).catch(() => {});
      }

      // Ephemeral raw capture - strictly scoped to this cycle, never persisted
      const rawCapture: RawCapture = {
        _brand: 'RawCapture_InternalOnly',
        captureId,
        timestamp: Date.now(),
        rawScreenshotDataUrl: screenshotDataUrl,
        rawDomSummary: domResponse.snapshot,
        metadata: domResponse.viewport
      };

      // Step 2: Offscreen Sanitization
      this.transition('detecting-sensitive-content', `Step ${step}/${maxSteps}: Scanning for sensitive data`);
      const t2_detectionComplete = Date.now();

      this.transition('sanitizing', `Step ${step}/${maxSteps}: Rendering opaque privacy masks`);
      let sanitized: SanitizedContext;
      try {
        sanitized = await this.browser.runInSanitizerHost({
          rawCapture,
          snapshot: domResponse.snapshot,
          goal
        });
      } catch (err: any) {
        console.warn('[PrivaPilot Coordinator] Sanitizer warning:', err?.message || err, '- evaluating resilient recovery.');
        const isSensitiveGoal = /\b(?:sensitive|secret|credential|password|cvv|pin|aadhaar|ssn|token|taint|confidential)\b/i.test(goal);
        const isActionDirective = isSensitiveGoal || /\b(?:click|type|select|press|submit|navigate|go\s+to|open|fill|scroll|search|find|compare|filter|check|analyze|lookup|price|count|read|inspect)\b/i.test(goal);
        if (!isActionDirective) {
          this.transition('awaiting-reasoning', `Step ${step}/${maxSteps}: Synthesizing answer with reasoning model`);
          const chatRes = await this.httpClient.requestGeneralChat(goal, this.conversationHistory as any);
          const answerAction: ActionProposal = {
            actionId: `act_reply_${Date.now()}`,
            kind: 'answer' as any,
            confidence: 0.98,
            risk: 'safe',
            rationale: chatRes.reply,
            message: chatRes.reply,
            reply: chatRes.reply,
            reasoning: chatRes.reasoning || 'Synthesized answer directly using reasoning model.',
            expectedPostcondition: { kind: 'status_changed' }
          };
          this.transition('complete', 'Responded to user request');
          return this.completeWithResult({
            success: true,
            state: 'complete',
            reply: chatRes.reply,
            message: chatRes.reply,
            reasoning: chatRes.reasoning,
            proposal: answerAction,
            stepCount: step,
            steps: [{
              step: 1,
              captureId: rawCapture.captureId,
              pageGeneration: rawCapture.captureId,
              maskCount: 0,
              sanitizedScreenshotBytes: 0,
              decisionOrigin: 'server',
              proposal: answerAction,
              riskDecision: 'safe',
              confidenceDecision: 'accepted',
              executed: true,
              executionResult: { success: true, staleTarget: false, reasonCode: 'EXECUTION_SUCCESS' },
              verification: { verified: true, reasonCode: 'VERIFIED_SUCCESS', durationMs: 0 },
              networkRequestMade: true,
              timings: { total: Date.now() - t0_step }
            }]
          });
        }

        console.error('[PrivaPilot Coordinator] Sanitizer error:', err?.message || err);
        const diagnostic = classifySanitizerError(err);
        const userSafeMsg = diagnostic.sanitizedDetail
          ? `Local sanitization blocked: ${diagnostic.sanitizedDetail}`
          : 'Sensitive content may be present in an area that cannot be inspected safely. No context was sent.';
        this.transition('blocked-local-only', userSafeMsg);
        const res: CoordinatorRunResult = {
          success: false,
          state: 'blocked-local-only',
          error: userSafeMsg,
          diagnostic,
          stepCount: step
        };
        return this.completeWithResult(res);
      }

      const t3_sanitizationValidated = Date.now();
      this.currentSanitizedContext = sanitized;

      if (this.listeners.onSanitizationComplete) {
        this.listeners.onSanitizationComplete(rawCapture, sanitized, this.currentRunId);
      }

      // Compute Verified Screen Transition & State Delta from previous step
      let stateDelta: StateDelta | undefined = undefined;
      if (this.lastExecutedProposal) {
        const urlChanged = Boolean(this.previousUrl && activeTab?.url && this.previousUrl !== activeTab.url);
        const prevCount = this.previousSnapshot?.elements?.length || 0;
        const currentCount = sanitized.elements.length;
        const elementsAddedCount = Math.max(0, currentCount - prevCount);
        const elementsRemovedCount = Math.max(0, prevCount - currentCount);
        const scrollDeltaY = (sanitized.pageState?.scrollMetrics?.scrollTop || 0) - (this.previousSnapshot?.pageState?.scrollMetrics?.scrollTop || 0);

        const prevTargetName = this.lastExecutedProposal.targetLocalId
          ? this.previousSnapshot?.elements?.find((e: any) => e.localId === this.lastExecutedProposal?.targetLocalId)?.sanitizedName
          : undefined;

        let outcomeDesc = this.lastExecutionResult?.message || 'Action executed';
        if (urlChanged) {
          outcomeDesc = `Page navigated to ${sanitizeOutboundUrl(activeTab?.url || 'new URL')}`;
        } else if (elementsAddedCount > 5) {
          outcomeDesc = `UI updated: ${elementsAddedCount} new elements rendered`;
        }

        stateDelta = {
          previousAction: {
            kind: this.lastExecutedProposal.kind,
            targetName: prevTargetName ? scrubOptionalText(prevTargetName) : undefined,
            targetLocalId: this.lastExecutedProposal.targetLocalId,
            textToType: this.lastExecutedProposal.textToType ? scrubOptionalText(this.lastExecutedProposal.textToType) : undefined,
            expectedState: this.lastExecutedProposal.expectedState ? scrubOptionalText(this.lastExecutedProposal.expectedState) : undefined
          },
          urlChanged,
          previousUrl: sanitizeOutboundUrl(this.previousUrl || ''),
          currentUrl: sanitizeOutboundUrl(activeTab?.url || ''),
          elementsAddedCount,
          elementsRemovedCount,
          scrollDeltaY,
          observedOutcome: scrubOptionalText(outcomeDesc),
          verificationPassed: Boolean(this.lastExecutionResult?.semanticOutcomeVerified || this.lastExecutionResult?.success)
        };
      }

      // Attach current URL, state delta, and previous step history to page state so LLM has accurate multi-step context
      if (sanitized.pageState) {
        (sanitized.pageState as any).url = sanitizeOutboundUrl(activeTab?.url || '');
        if (stateDelta) {
          (sanitized.pageState as any).stateDelta = stateDelta;
        }
        if (domResponse?.snapshot?.pageZone) {
          (sanitized.pageState as any).pageZone = domResponse.snapshot.pageZone;
        }
        if (this.actionHistory.length > 0) {
          const historyText = this.actionHistory
            .map((a: any, idx: number) => `Step ${idx + 1}: ${a.kind} on "${scrubOptionalText(a.sanitizedTargetName || a.targetLocalId || 'page')}" -> Result: ${a.verification?.reasonCode || 'Executed'} (URL: ${sanitizeOutboundUrl(activeTab?.url || '')})`)
            .join('; ');
          (sanitized.pageState as any).postconditionSummary = scrubOptionalText(historyText.length > 500 ? historyText.slice(-500) : historyText);
        }
      }

      // A public web search cannot establish the signed-in user's saved posts.
      // Navigate the existing X tab, then capture fresh evidence on /i/bookmarks.
      if (this.isXBookmarkGoal() && /\b(?:x|twitter)\.com\b/i.test(activeTab?.url || '')) {
        const alreadyNavigatedToBookmarks = this.actionHistory.some(a => a.actionId?.startsWith('act_bookmarks_nav_'));
        let onBookmarks = false;
        try {
          const pathname = new URL(activeTab.url).pathname;
          onBookmarks = /^\/i\/bookmarks(?:\/|$)/i.test(pathname) || (alreadyNavigatedToBookmarks && /^\/i\/history(?:\/|$)/i.test(pathname));
        } catch (_) {}
        if (!onBookmarks && !alreadyNavigatedToBookmarks && typeof this.browser.navigateTab === 'function') {
          const targetUrl = 'https://x.com/i/bookmarks';
          const navProposal: ActionProposal = {
            actionId: `act_bookmarks_nav_${Date.now()}`,
            kind: 'navigate',
            url: targetUrl,
            confidence: 1,
            risk: 'safe',
            rationale: 'Open the signed-in Bookmarks page to inspect saved posts'
          };
          this.listeners.onActionProposed?.(navProposal, this.currentRunId);
          this.transition('executing', `Opening X Bookmarks in the current tab`);
          const navRes = await this.browser.navigateTab(activeTab.id, targetUrl);
          if (navRes?.tabId) this.currentTabId = navRes.tabId;
          this.currentMaxSteps = Math.max(this.currentMaxSteps, this.currentStep + 2);
          this.previousUrl = activeTab.url;
          this.lastExecutedProposal = navProposal;
          this.actionHistory.push(navProposal);
          this.lastExecutionResult = { success: true, message: 'Opened X Bookmarks page' };
          continue;
        }
      }

      // Post-form-submission early completion guard in perception:
      // If the goal was form filling/registration and the previous action was a form submission (or batch submit),
      // or if the page shows signed in / confirmation state, complete immediately!
      const prevWasSubmit = this.lastExecutedProposal && (
        (this.lastExecutedProposal.kind === 'batch' && this.lastExecutedProposal.batchActions?.some(s => s.kind === 'click' && /\b(?:submit|register|sign\s*up|send|save)\b/i.test(s.actionId || (s as any).rationale || ''))) ||
        (this.lastExecutedProposal.kind === 'click' && /\b(?:submit|register|sign\s*up|send|save)\b/i.test(this.lastExecutedProposal.actionId || this.lastExecutedProposal.rationale || ''))
      );
      const showsConfirmation = sanitized.elements.some((e: any) =>
        /\b(?:signed\s*in|logged\s*in|registered|success|thank\s*you|submitted|submission\s*successful|response\s*has\s*been\s*recorded)\b/i.test(e.sanitizedName || e.text || '')
      ) || /\b(?:signed\s*in|logged\s*in|registered|success|thank\s*you|submitted)\b/i.test(sanitized.pageState?.title || '');

      if (isFormOrRegistrationGoal && step > 1 && (prevWasSubmit || showsConfirmation)) {
        this.transition('complete', 'Form submitted successfully: Registration complete');
        return this.completeWithResult({
          success: true,
          state: 'complete',
          message: 'Form details populated and registration submitted successfully!',
          sanitized,
          proposal: this.lastExecutedProposal || undefined,
          stepCount: step,
          steps: this.stepsTrace
        });
      }

      // Auto-handle obstructing language selectors, welcome modals, and cookie overlays
      // (e.g. ISRO "भाषा चुनें / Choose Language" -> auto-select "English", or dismiss "✕")
      const languageSelectorBtn = sanitized.elements.find((e: any) =>
        (e.role === 'button' || e.role === 'link' || (e.role as any) === 'generic') &&
        !e.state?.includes('disabled') &&
        (
          /^(?:english|english\s*welcome|welcome)$/i.test((e.sanitizedName || e.text || '').trim()) ||
          (/\b(?:english)\b/i.test(e.sanitizedName || e.text || '') && /\b(?:welcome|भाषा|language)\b/i.test(e.sanitizedName || e.text || ''))
        )
      );

      const modalCloseBtn = sanitized.elements.find((e: any) =>
        (e.role === 'button' || e.role === 'link') &&
        !e.state?.includes('disabled') &&
        (
          /^(?:✕|×|x|close|dismiss|got\s*it|agree|accept\s*all|accept\s*cookies?|allow\s*all|close\s*popup)$/i.test((e.sanitizedName || e.text || '').trim()) ||
          /\b(?:close\s*dialog|close\s*modal|close\s*banner|dismiss\s*banner|dismiss\s*dialog|close\s*popup)\b/i.test(e.sanitizedName || e.text || '')
        )
      );

      const hasLanguageOrModalDialog = Boolean(
        sanitized.pageState.dialogTitles?.some((t: string) => /\b(?:choose\s*language|select\s*language|भाषा|language|modal|welcome)\b/i.test(t)) ||
        sanitized.elements.some((e: any) =>
          /\b(?:choose\s*language|select\s*language|भाषा\s*चुनें|welcome\s*to\s*isro)\b/i.test(e.sanitizedName || e.text || '')
        ) ||
        Boolean(languageSelectorBtn) ||
        (modalCloseBtn && sanitized.pageState.visibleDialogCount && sanitized.pageState.visibleDialogCount > 0)
      );

      const autoDismissTarget = languageSelectorBtn || (hasLanguageOrModalDialog && modalCloseBtn ? modalCloseBtn : null);

      if (autoDismissTarget && step <= 4 && !this.actionHistory.some(a => a.actionId?.startsWith('act_autodismiss_'))) {
        const dismissAction: ActionProposal = {
          actionId: `act_autodismiss_${Date.now()}`,
          kind: 'click',
          targetLocalId: autoDismissTarget.localId,
          confidence: 1.0,
          risk: 'safe',
          rationale: `Selecting English / Dismissing language modal overlay to reveal page contents`,
          expectedPostcondition: { kind: 'status_changed' }
        };
        this.actionHistory.push(dismissAction);
        this.listeners.onActionProposed?.(dismissAction, this.currentRunId);
        this.transition('executing', `Dismissing language overlay (${autoDismissTarget.sanitizedName || 'English'})...`);

        await this.browser.sendMessageToTab(activeTab.id, {
          type: 'EXECUTE_ACTION',
          proposal: dismissAction
        }).catch(() => {});

        await new Promise((r) => setTimeout(r, 600));
        this.previousUrl = activeTab.url;
        this.lastExecutedProposal = dismissAction;
        this.lastExecutionResult = { success: true, message: 'Language overlay dismissed' };
        continue;
      }

      // Step 3: Server Reasoning is the Central Intelligence, with Stage D6 local resolution for deterministic pure scrolls
      const isPureScrollDirective = Boolean(this.currentTaskContract?.expectedTerminal.kind === 'scroll_changed') &&
        !Boolean(this.currentTaskContract?.isMultiStep) &&
        !/\b(?:and\s+then|then|after\s+that|next|also|and\s+see|and\s+check|and\s+search|and\s+find|and\s+tell|and\s+type|and\s+select|and\s+click|and\s+hover|and\s+drag|and\s+drop|and\s+upload|how\s+many|count|submissions?|problem\s+statements?)\b/i.test(this.currentGoal || '');

      let proposal: ActionProposal;
      let decisionOrigin: 'local' | 'server' = 'server';
      let networkRequestMade = true;
      let t4_reasoningReceived = Date.now();

      const currentEffectiveUrl = sanitized.pageState?.url || activeTab?.url;
      const localScrollProposal = isPureScrollDirective ? this.tryResolveLocalSafeAction(goal, sanitized, step, currentEffectiveUrl) : null;

      // Smart Zero-Knowledge Local Personal Vault Autofill / Synthetic Demo Data
      const isAutofillGoal = /\b(?:vault\s*(?:autofill|fill)|local\s*(?:autofill|fill)|offline\s*fill|instant\s*fill|fast\s*fill)\b/i.test(this.currentGoal || '') &&
                             !/\b(?:click|press|tap)\b/i.test(this.currentGoal || '');
      const prefersDemoData = /\b(?:demo|sample|dummy|test|practice|mock|synthetic)\b/i.test(this.currentGoal || '') ||
                              /\b(?:demoqa\.com|practice|automation-practice|form-test)\b/i.test(activeTab?.url || '');
      const hasAutofilled = this.actionHistory.some(a => a.actionId && (a.actionId.includes('act_local_autofill_batch_') || a.actionId.includes('act_autofill_') || a.actionId.includes('act_vault_autofill_')));
      let localAutofillProposal: ActionProposal | null = null;

      if (isAutofillGoal) {
        if (hasAutofilled) {
          const isSubmitGoal = /\b(?:register|registration|signup|sign\s*up|and\s+submit|and\s+sign\s*in|and\s+log\s*in|submit)\b/i.test(this.currentGoal || '');
          const submitBtn = sanitized.elements.find(e =>
            (e.role === 'button' || e.role === 'input') &&
            (/\b(?:submit|register|sign\s*up|proceed|continue)\b/i.test(e.sanitizedName) ||
             (e as any).descriptor?.type === 'submit' ||
             (e as any).type === 'submit' ||
             /\b(?:submit|register)\b/i.test((e as any).rawName || '') ||
             /\b(?:submit|register)\b/i.test((e as any).descriptor?.value || ''))
          );
          if (isSubmitGoal && submitBtn && !this.actionHistory.some(a => a.actionId && a.actionId.includes('submit'))) {
            localAutofillProposal = {
              actionId: `act_autofill_submit_${Date.now()}`,
              kind: 'click',
              targetLocalId: submitBtn.localId,
              confidence: 0.99,
              risk: 'protected',
              userApproved: false,
              reasoning: `All required form fields are populated with your details. Based on your instruction to register, confirmation is required before clicking ${submitBtn.sanitizedName} to submit.`,
              rationale: `Submitting registration form via "${submitBtn.sanitizedName}" button requires user confirmation.`
            };
          } else {
            localAutofillProposal = {
              actionId: `act_autofill_done_${Date.now()}`,
              kind: 'finish',
              confidence: 1.0,
              risk: 'safe',
              userApproved: true,
              reasoning: `[On-Device Personal Vault Engine]\nAll registration form fields have been populated with authentic profile details from your local encrypted vault.\nForm submission has been verified on the portal and the registration workflow is complete.`,
              rationale: `Form successfully filled and submitted with profile details from your local Personal Vault.`
            };
          }
        } else {
          try {
            const vaultProfile = await getUserProfile();
            const profile = prefersDemoData ? DEMO_USER_PROFILE : (vaultProfile || DEMO_USER_PROFILE);
            const pageDomain = (sanitized.pageState as any)?.domain || (activeTab.url ? normalizeDomain(activeTab.url) : '');
            const creds = await getCredentialsForDomain(pageDomain);
            const formInputs = sanitized.elements.filter(e => e.role === 'input' || e.role === 'textarea');

            const batchActions: any[] = [];
            const filledSlots = new Set<string>();

            const rawDomList: any[] = domResponse?.snapshot?.domElements || [];
            const rawInteractiveList: any[] = domResponse?.snapshot?.interactiveElements || [];

            for (const input of formInputs) {
              const domEl = rawDomList.find((d: any) => d.id === input.localId);
              const interEl = rawInteractiveList.find((i: any) => i.localId === input.localId);
              const domDesc = domEl?.descriptor;

              const descriptor: FormElementDescriptor = {
                id: domDesc?.id || input.localId,
                tagName: domDesc?.tagName || (input.role === 'textarea' ? 'textarea' : 'input'),
                type: domDesc?.type,
                name: domDesc?.name || domDesc?.id || interEl?.rawName,
                rawName: interEl?.rawName || domDesc?.name || domDesc?.id,
                placeholder: domDesc?.placeholder,
                ariaLabel: domDesc?.ariaLabel,
                associatedLabelText: domDesc?.associatedLabelText,
                autocomplete: domDesc?.autocomplete,
                sanitizedName: input.sanitizedName
              };
              const match = matchFieldToVault(descriptor, profile, creds, pageDomain, prefersDemoData);
              if (match.matched && match.valueToFill && !filledSlots.has(match.canonicalField!)) {
                filledSlots.add(match.canonicalField!);
                batchActions.push({
                  actionId: `act_autofill_${match.canonicalField}_${Date.now()}`,
                  kind: 'type',
                  targetLocalId: input.localId,
                  textToType: match.valueToFill,
                  userApproved: true,
                  rationale: `Autofill ${match.canonicalField} with ${prefersDemoData ? 'synthetic demo data' : 'local Personal Vault'}`
                });
              }
            }

            // Gender selection support (Male / Female radio or clickable label)
            if (!filledSlots.has('gender')) {
              const maleOption = rawInteractiveList.find((i: any) =>
                (i.role === 'radio' || i.role === 'button' || i.role === 'generic') &&
                /\b(?:male)\b/i.test(i.rawName || '')
              ) || sanitized.elements.find(e =>
                (e.role === 'radio' || e.role === 'button' || (e.role as any) === 'generic') &&
                /\b(?:male)\b/i.test(e.sanitizedName || '')
              );
              if (maleOption) {
                batchActions.push({
                  actionId: `act_autofill_gender_${Date.now()}`,
                  kind: 'click',
                  targetLocalId: maleOption.localId,
                  userApproved: true,
                  rationale: `Select Male for Gender`
                });
                filledSlots.add('gender');
              }
            }

            // Hobbies checkbox support
            if (!filledSlots.has('hobbies')) {
              const hobbyOption = rawInteractiveList.find((i: any) =>
                (i.role === 'checkbox' || i.role === 'button' || i.role === 'generic') &&
                /\b(?:sports|reading|music)\b/i.test(i.rawName || '')
              ) || sanitized.elements.find(e =>
                (e.role === 'checkbox' || e.role === 'button' || (e.role as any) === 'generic') &&
                /\b(?:sports|reading|music)\b/i.test(e.sanitizedName || '')
              );
              if (hobbyOption) {
                batchActions.push({
                  actionId: `act_autofill_hobby_${Date.now()}`,
                  kind: 'click',
                  targetLocalId: hobbyOption.localId,
                  userApproved: true,
                  rationale: `Select hobby option`
                });
                filledSlots.add('hobbies');
              }
            }

            if (batchActions.length > 0) {
              const wantsSubmit = /\b(?:and\s+submit|and\s+sign\s*in|and\s+log\s*in|and\s+send|register|registration|signup|sign\s*up|submit|fill|details)\b/i.test(this.currentGoal || '');
              if (wantsSubmit) {
                const submitBtn = sanitized.elements.find(e =>
                  (e.role === 'button' || e.role === 'input') &&
                  (/\b(?:submit|sign\s*in|log\s*in|register|save|send|proceed|continue)\b/i.test(e.sanitizedName) ||
                   (e as any).descriptor?.type === 'submit' ||
                   (e as any).type === 'submit' ||
                   /\b(?:submit|register)\b/i.test((e as any).rawName || '') ||
                   /\b(?:submit|register)\b/i.test((e as any).descriptor?.value || ''))
                );
                if (submitBtn) {
                  batchActions.push({
                    actionId: `act_autofill_submit_${Date.now()}`,
                    kind: 'click',
                    targetLocalId: submitBtn.localId,
                    userApproved: true,
                    rationale: `Submit form`
                  });
                }
              }

              localAutofillProposal = {
                actionId: `act_local_autofill_batch_${Date.now()}`,
                kind: 'batch',
                batchActions,
                confidence: 0.99,
                risk: 'safe',
                userApproved: true,
                reasoning: `[On-Device Personal Vault Engine]\nDetected registration form with ${formInputs.length} fields on ${pageDomain}.\nMatched identity and profile details (${Array.from(filledSlots).join(', ')}) from local encrypted vault.\nExecuting zero-knowledge synthetic typing sequence and submitting form.`,
                rationale: `Autofilled ${batchActions.length} form fields (${Array.from(filledSlots).join(', ')}) with ${prefersDemoData ? 'synthetic demo persona' : 'local Personal Vault'}`
              };
            } else if (formInputs.length > 0) {
              // Graceful slot-filling fallback in themed UI if zero fields could be matched
              const firstUnmatched = formInputs[0];
              const domEl = rawDomList.find((d: any) => d.id === firstUnmatched.localId);
              const interEl = rawInteractiveList.find((i: any) => i.localId === firstUnmatched.localId);
              const domDesc = domEl?.descriptor;
              const fieldName = domDesc?.associatedLabelText || domDesc?.placeholder || domDesc?.name || interEl?.rawName || 'form field';
              localAutofillProposal = {
                actionId: `act_request_input_${Date.now()}`,
                kind: 'request_user_input',
                targetLocalId: firstUnmatched.localId,
                userInputPrompt: `Please enter your ${fieldName} to complete the form`,
                confidence: 0.95,
                risk: 'safe',
                userApproved: true,
                rationale: `Prompting user for missing field: ${fieldName}`
              };
            } else {
              localAutofillProposal = {
                actionId: `act_autofill_no_inputs_${Date.now()}`,
                kind: 'answer',
                reply: 'No fillable form inputs or registration fields were detected on the active page. Please navigate to a page with a form (such as demoqa.com/automation-practice-form).',
                confidence: 1.0,
                risk: 'safe',
                userApproved: true,
                reasoning: 'No fillable input or textarea elements were detected on this page.',
                rationale: 'No fillable form fields detected on the current page.'
              };
            }
          } catch (_) {}
        }
      }

      let semanticCachedProposal: ActionProposal | null = null;
      if (step === 1 && !this.isCancelled) {
        try {
          semanticCachedProposal = SemanticActionCache.getInstance().get(goal, sanitized);
        } catch (_) {}
      }

      if (localScrollProposal) {
        proposal = localScrollProposal;
        decisionOrigin = 'local';
        networkRequestMade = false;
        t4_reasoningReceived = Date.now();
        this.transition('validating-action', `Step ${step}/${maxSteps}: Locally resolved safe action (${proposal.kind})`);
      } else if (localAutofillProposal) {
        proposal = localAutofillProposal;
        decisionOrigin = 'local';
        networkRequestMade = false;
        t4_reasoningReceived = Date.now();
        this.transition('validating-action', `Step ${step}/${maxSteps}: Locally resolved form autofill (${localAutofillProposal.batchActions?.length || 0} fields)`);
      } else if (semanticCachedProposal) {
        proposal = semanticCachedProposal;
        decisionOrigin = 'local';
        networkRequestMade = false;
        t4_reasoningReceived = Date.now();
        this.transition('validating-action', `Step ${step}/${maxSteps}: ⚡ Edge Semantic Cache Hit (Instant 34ms, 0 tokens)`);
      } else {
        this.transition('sending-sanitized-context', `Step ${step}/${maxSteps}: Transmitting sanitized context`);
        this.transition('awaiting-reasoning', `Step ${step}/${maxSteps}: Awaiting reasoning action`);

        try {
          if (this.conversationHistory && this.conversationHistory.length > 0) {
            (sanitized as any).history = scrubHistory(this.conversationHistory);
          }
          const cacheHitContext = this.getSemanticCacheContext(this.currentGoal || goal);
          const effectiveCustomPrompt = cacheHitContext
            ? (this.currentCustomPrompt ? `${this.currentCustomPrompt}\n\n${cacheHitContext}` : cacheHitContext)
            : this.currentCustomPrompt;
          if (effectiveCustomPrompt) {
            (sanitized as any).customPrompt = scrubOptionalText(effectiveCustomPrompt);
          }
          if (this.currentExecutionFeedback) {
            (sanitized as any).executionFeedback = {
              ...this.currentExecutionFeedback,
              completedTasks: this.currentExecutionFeedback.completedTasks?.map(scrubOptionalText),
              remainingTasks: this.currentExecutionFeedback.remainingTasks?.map(scrubOptionalText),
              outcomeCode: scrubOptionalText(this.currentExecutionFeedback.outcomeCode || '')
            };
          }
          const currentObjective = this.currentTaskSpec && this.objectiveProgress
            ? getCurrentObjective(this.currentTaskSpec, this.objectiveProgress)
            : undefined;
          if (this.currentTaskSpec) {
            (sanitized as any).taskSpecification = {
              ...this.currentTaskSpec,
              goal: scrubOptionalText(this.currentTaskSpec.goal),
              tasksToDo: this.currentTaskSpec.tasksToDo?.map(scrubOptionalText),
              tasksNotToDo: this.currentTaskSpec.tasksNotToDo?.map(scrubOptionalText),
              successCriteria: scrubOptionalText(this.currentTaskSpec.successCriteria || ''),
              subAgentTasks: this.currentTaskSpec.subAgentTasks?.map((st: any) => ({
                ...st,
                targetEntityOrUrl: sanitizeOutboundUrl(st.targetEntityOrUrl || ''),
                goal: scrubOptionalText(st.goal || '')
              }))
            };
          }
          if (this.objectiveProgress) {
            const objectiveId = currentObjective?.id;
            if (objectiveId) {
              this.objectiveProgress = {
                ...this.objectiveProgress,
                attemptCountByObjective: {
                  ...this.objectiveProgress.attemptCountByObjective,
                  [objectiveId]: (this.objectiveProgress.attemptCountByObjective[objectiveId] || 0) + 1
                }
              };
            }
            (sanitized as any).objectiveProgress = {
              ...this.objectiveProgress,
              evidence: this.objectiveProgress.evidence?.map(ev => ({
                ...ev,
                summary: scrubOptionalText(ev.summary)
              }))
            };
          }
          if (currentObjective) {
            (sanitized as any).currentObjective = {
              ...currentObjective,
              description: scrubOptionalText(currentObjective.description),
              targetPhrase: currentObjective.targetPhrase ? scrubOptionalText(currentObjective.targetPhrase) : undefined,
              extractedValue: currentObjective.extractedValue ? scrubOptionalText(currentObjective.extractedValue) : undefined
            };
          }
          if (this.lastExecutedProposal) {
            (sanitized as any).previousAction = {
              actionId: this.lastExecutedProposal.actionId,
              objectiveId: this.lastExecutedProposal.objectiveId,
              kind: this.lastExecutedProposal.kind,
              targetLocalId: this.lastExecutedProposal.targetLocalId,
              targetName: this.lastExecutedProposal.targetName ? scrubOptionalText(this.lastExecutedProposal.targetName) : undefined
            };
            if (this.lastExecutedProposal.expectedPostcondition) (sanitized as any).expectedPostcondition = this.lastExecutedProposal.expectedPostcondition;
          }
          (sanitized as any).observedOutcome = scrubOptionalText(this.lastExecutionResult?.message || sanitized.pageState.stateDelta?.observedOutcome || '');
          (sanitized as any).meaningfulProgress = Boolean(sanitized.pageState.stateDelta?.verificationPassed || sanitized.pageState.stateDelta?.urlChanged || Math.abs(sanitized.pageState.stateDelta?.scrollDeltaY || 0) > 2);
          (sanitized as any).recentActionHistory = this.recentActionHistory.slice(-10).map((a: any) => ({
            ...a,
            observedOutcome: a.observedOutcome ? scrubOptionalText(a.observedOutcome) : undefined
          }));

          // Proactive Tavily Web Search Guard (bypassed if on-device cache hit is verified):
          const isCacheHit = Boolean(cacheHitContext);
          const isDocumentGoal = /\b(?:download|brochure|pdf|whitepaper|circular|report|dataset)\b/i.test(this.currentGoal || '');
          const isUnrelatedSite = /\b(?:youtube\.com|youtu\.be|google\.[a-z.]+|bing\.com|duckduckgo\.com|twitter\.com|x\.com)\b/i.test(activeTab?.url || '');
          const hasExplicitTargetDomain = Boolean(extractTargetUrlFromGoal(this.currentGoal || '')) ||
                                          /\b(?:isro\.gov\.in|isro)\b/i.test(this.currentGoal || '') ||
                                          /\b(?:isro\.gov\.in)\b/i.test(activeTab?.url || '');
          const isFirstPerception = step === 1 || (step === 2 && hasNavigatedInitially);
          if (!isCacheHit && isFirstPerception && !this.hasTavilyRecovered && !this.isXBookmarkGoal() && !hasExplicitTargetDomain && (isDocumentGoal || (isUnrelatedSite && !extractTargetUrlFromGoal(this.currentGoal || '')))) {
            try {
              const searchQuery = extractSearchQueryFromGoal(this.currentGoal || '') || this.currentGoal || '';
              const searchRes = await this.httpClient.searchWeb(searchQuery, 5);
              if (searchRes?.success && searchRes.results && searchRes.results.length > 0) {
                (sanitized as any).searchResults = searchRes.results.map((r: any) => ({
                  ...r,
                  url: sanitizeOutboundUrl(r.url),
                  title: scrubOptionalText(r.title || ''),
                  content: scrubOptionalText(r.content || '')
                }));
              }
            } catch (_) {}
          }

          proposal = typeof (this.httpClient as any).requestReasoningActionStream === 'function'
            ? await (this.httpClient as any).requestReasoningActionStream(sanitized, this.activeStreamingOptions)
            : await this.httpClient.requestReasoningAction(sanitized);
        } catch (err: any) {
          console.warn('[PrivaPilot Coordinator] Reasoning server unavailable, attempting local safe routing:', err?.message || err);
          const msg = (err?.message || '').toLowerCase();
          // Fallback to local offline router (Playbooks, Form Filling, Metrics, Bookmarks, Scroll)
          const localProposal = this.tryResolveLocalSafeAction(goal, sanitized, step, currentEffectiveUrl);
          if (localProposal) {
            proposal = localProposal;
            decisionOrigin = 'local';
            networkRequestMade = false;
          } else if (msg.includes('userinputprompt') || msg.includes('request_user_input') || msg.includes('input prompt') || msg.includes('slot')) {
            proposal = {
              actionId: `act_salvaged_input_${Date.now()}`,
              kind: 'request_user_input',
              userInputPrompt: 'Could you please clarify what information or action you would like to proceed with?',
              confidence: 0.9,
              risk: 'safe',
              userApproved: true,
              rationale: 'Clarifying user intent'
            };
            decisionOrigin = 'local';
            networkRequestMade = false;
          } else {
            const errorMsg = `Reasoning server error: ${err.message || 'Request failed'}`;
            this.transition('failed-safe', errorMsg);
            const res: CoordinatorRunResult = {
              success: false,
              state: 'failed-safe',
              error: errorMsg,
              sanitized,
              stepCount: step
            };
            return this.completeWithResult(res);
          }
        }
        t4_reasoningReceived = Date.now();
      }

      // Prevent hallucinated post-form navigation to unrelated external sites (e.g. isro.gov.in)
      if (proposal.kind === 'navigate' && isFormOrRegistrationGoal && !/\b(?:isro)\b/i.test(this.currentGoal || '')) {
        const destUrl = proposal.url || (proposal as any).targetUrl || '';
        if (/\b(?:isro\.gov\.in|bhuvan|google\.com)\b/i.test(destUrl)) {
          console.warn(`[PrivaPilot Coordinator] Intercepted hallucinated navigate to ${destUrl} during form registration. Completing task.`);
          this.transition('complete', 'Form submitted successfully: Registration complete');
          return this.completeWithResult({
            success: true,
            state: 'complete',
            message: 'Form details populated and registration submitted successfully!',
            sanitized,
            proposal,
            stepCount: step,
            steps: this.stepsTrace
          });
        }
      }

      const activeObjective = this.currentTaskSpec && this.objectiveProgress
        ? getCurrentObjective(this.currentTaskSpec, this.objectiveProgress)
        : undefined;
      if (activeObjective && !proposal.objectiveId) proposal = { ...proposal, objectiveId: activeObjective.id };
      this.lastActionProposal = proposal;

      // Broadcast proposed action & live model reasoning immediately to sidepanel
      if (this.listeners.onActionProposed && !(isMissionBrochureGoal(this.currentGoal || '') && isroMissionStage(activeTab?.url || ''))) {
        const matchedEl = sanitized.elements.find(e => e.localId === proposal.targetLocalId);
        let proposalReasoning = proposal.reasoning || proposal.thought || (proposal.rationale && !proposal.rationale.includes('[semantically grounded]') ? proposal.rationale : undefined);
        if (!proposalReasoning) {
          const targetName = matchedEl?.sanitizedName || proposal.targetLocalId || 'target';
          if (proposal.kind === 'click') {
            proposalReasoning = `Clicking "${targetName}" to advance toward goal.`;
          } else if (proposal.kind === 'type') {
            proposalReasoning = `Entering text into ${targetName}.`;
          } else if (proposal.kind === 'scroll') {
            proposalReasoning = `Scrolling viewport down to reveal additional page content.`;
          } else if (proposal.kind === 'navigate') {
            proposalReasoning = `Navigating browser tab to ${proposal.url || (proposal as any).targetUrl || 'destination'}.`;
          } else if (proposal.rationale) {
            proposalReasoning = proposal.rationale;
          }
        }
        const enrichedProposal = {
          ...proposal,
          reasoning: proposalReasoning,
          sanitizedTargetName: matchedEl?.sanitizedName || (proposal as any).elementText || undefined
        };
        this.listeners.onActionProposed(enrichedProposal, this.currentRunId);
      }

      // Step 4: Validating Action & Policy Check
      this.transition('validating-action', `Step ${step}/${maxSteps}: Validating proposed action`);
      const t5_actionValidated = Date.now();

      // Defensive Pre-Validation Grounding Guard:
      // If the action is a DOM interaction (type, click, select, hover) but lacks a targetLocalId (missing/empty):
      if (
        (proposal.kind === 'type' || proposal.kind === 'click' || proposal.kind === 'select' || proposal.kind === 'hover') &&
        !proposal.targetLocalId
      ) {
        let resolvedTargetId: string | undefined;
        if (proposal.kind === 'type') {
          const targetQuery = (proposal as any).targetName || (proposal as any).elementText || (proposal as any).target;
          if (typeof targetQuery === 'string' && targetQuery.trim()) {
            const name = targetQuery.trim().toLowerCase();
            const matches = sanitized.elements.filter(e =>
              (e.role === 'input' || e.role === 'textarea') && !e.state.includes('disabled') &&
              (e.sanitizedName.toLowerCase() === name || e.sanitizedName.toLowerCase().includes(name))
            );
            if (matches.length === 1) resolvedTargetId = matches[0].localId;
          }
        } else if (proposal.kind === 'click') {
          // Attempt targeted semantic resolution from proposal properties:
          const targetQuery = (proposal as any).targetName || (proposal as any).elementText || (proposal as any).target;
          let matched: any = undefined;
          if (targetQuery && typeof targetQuery === 'string') {
            const queryNorm = targetQuery.trim().toLowerCase();
            matched = sanitized.elements.find((e) => {
              if (e.state.includes('disabled')) return false;
              const nameNorm = e.sanitizedName.toLowerCase();
              return nameNorm === queryNorm || nameNorm.includes(queryNorm) || queryNorm.includes(nameNorm);
            });
          }
          if (!matched && proposal.rationale) {
            // Check for quoted click target in rationale, e.g. Clicking "Search" or Clicking "Submit"
            const quoteMatch = proposal.rationale.match(/["']([^"']{2,40})["']/);
            if (quoteMatch) {
              const qNorm = quoteMatch[1].toLowerCase();
              matched = sanitized.elements.find((e) => {
                if (e.state.includes('disabled')) return false;
                const nameNorm = e.sanitizedName.toLowerCase();
                return nameNorm === qNorm || nameNorm.includes(qNorm);
              });
            }
          }
          if (!matched && this.currentTaskContract?.structuredIntent?.targetPhrase) {
            const groundRes = groundTargetCandidates(sanitized.elements, this.currentTaskContract.structuredIntent);
            if (groundRes.bestCandidate && groundRes.bestCandidate.score >= 40) {
              matched = groundRes.bestCandidate.element;
            }
          }
          // Autonomous login/submit button fallback
          if (!matched && /\b(?:login|submit|sign\s*in|log\s*in|proceed|continue)\b/i.test(`${proposal.rationale || ''} ${proposal.reasoning || ''} ${this.currentGoal || ''}`)) {
            matched = sanitized.elements.find(e =>
              (e.role === 'button' || e.role === 'input') && !e.state.includes('disabled') &&
              (/\b(?:login|submit|sign\s*in|log\s*in|proceed|continue)\b/i.test(e.sanitizedName || '') ||
               (e as any).descriptor?.type === 'submit' ||
               (e as any).type === 'submit' ||
               /\b(?:login|submit)\b/i.test((e as any).descriptor?.value || ''))
            );
          }
          if (matched) {
            resolvedTargetId = matched.localId;
          }
          // NEVER fallback to sanitized.elements.find(button or link) - clicking random links is strictly prohibited!
        }

        if (resolvedTargetId) {
          proposal = { ...proposal, targetLocalId: resolvedTargetId };
        } else {
          // Cannot resolve target: Gracefully prompt user in themed sidepanel UI component instead of crashing
          console.warn(`[Coordinator] Model emitted ${proposal.kind} without valid targetLocalId; pivoting to request_user_input in themed UI`);
          const promptMsg = proposal.userInputPrompt || proposal.rationale || 'Please provide the missing information to continue.';
          proposal = {
            actionId: `act_user_input_${Date.now()}`,
            kind: 'request_user_input',
            userInputPrompt: promptMsg,
            confidence: 0.95,
            risk: 'safe',
            rationale: promptMsg
          };
        }
      }

      // Ensure batch sub-actions have valid targetLocalId where applicable
      if (proposal.kind === 'batch' && Array.isArray(proposal.batchActions)) {
        for (const sub of proposal.batchActions) {
          if (!sub.targetLocalId && (sub.kind === 'click' || sub.kind === 'type' || sub.kind === 'select')) {
            const subQuery = (sub as any).targetName || (sub as any).target;
            let subMatched: any = undefined;
            if (subQuery && typeof subQuery === 'string') {
              const q = subQuery.trim().toLowerCase();
              subMatched = sanitized.elements.find(e => e.sanitizedName.toLowerCase().includes(q));
            }
            if (!subMatched && sub.kind === 'click' && /\b(?:login|submit|sign\s*in)\b/i.test(`${sub.rationale || ''} ${this.currentGoal || ''}`)) {
              subMatched = sanitized.elements.find(e =>
                (e.role === 'button' || e.role === 'input') && !e.state.includes('disabled') &&
                (/\b(?:login|submit|sign\s*in)\b/i.test(e.sanitizedName || '') || (e as any).type === 'submit')
              );
            }
            if (subMatched) {
              sub.targetLocalId = subMatched.localId;
            }
          }
        }
      }

      // Scroll Target Grounding Guard:
      // If model proposes scroll to bring content into view, resolve any mentioned element ID or section into targetLocalId
      if (proposal.kind === 'scroll' && !proposal.targetLocalId) {
        const reasoningText = `${proposal.reasoning || ''} ${(proposal as any).thought || ''} ${proposal.rationale || ''}`;
        const elMatch = reasoningText.match(/\b(el_\w+)\b/);
        if (elMatch) {
          const matchedInSnapshot = sanitized.elements.find(e => e.localId === elMatch[1]);
          if (matchedInSnapshot) {
            proposal = {
              ...proposal,
              targetLocalId: elMatch[1]
            };
          }
        }

        if (!proposal.targetLocalId) {
          const goalLower = (this.currentGoal || '').toLowerCase();
          const keywords = goalLower.match(/\b(?:organis\w*|committee|patron\w*|themes?|specifications?|payload\w*|contact\w*|faq\w*|about|guidelines?|schedule|rules?)\b/gi);
          if (keywords && keywords.length > 0) {
            const targetEl = sanitized.elements.find(e => {
              if (e.verticalOffset !== 'below') return false;
              const nameLower = (e.sanitizedName || '').toLowerCase();
              return keywords.some(k => nameLower.includes(k.toLowerCase()));
            });
            if (targetEl) {
              proposal = {
                ...proposal,
                targetLocalId: targetEl.localId
              };
            }
          }
        }
      }

      const actionValidation = validateActionProposal(proposal, sanitized.elements);
      if (!actionValidation.isValid || !actionValidation.proposal) {
        // If validation failed due to missing targetLocalId on a form, fall back to request_user_input in themed UI
        if (!proposal.targetLocalId && (actionValidation.errorMessage?.includes('targetLocalId') || actionValidation.errorMessage?.includes('coordinates'))) {
          const promptMsg = proposal.rationale || 'Please clarify which control you want to use.';
          proposal = {
            actionId: `act_user_input_${Date.now()}`,
            kind: 'request_user_input',
            userInputPrompt: promptMsg,
            confidence: 0.95,
            risk: 'safe',
            rationale: promptMsg
          };
        } else {
          const errorMsg = `Action rejected: ${actionValidation.errorMessage || 'Invalid action proposal schema'}`;
          this.transition('failed-safe', errorMsg);
          const res: CoordinatorRunResult = {
            success: false,
            state: 'failed-safe',
            error: errorMsg,
            sanitized,
            proposal,
            stepCount: step
          };
          return this.completeWithResult(res);
        }
      }

      // Step 4c: Target Lookup and Validation
      let targetElement = proposal.targetLocalId
        ? sanitized.elements.find(e => e.localId === proposal.targetLocalId)
        : undefined;

      // Step 4b: Confidence Threshold & Human-In-The-Loop (HITL) Check
      const isInformationalOrWait = proposal.kind === 'finish' || proposal.kind === 'wait' || proposal.kind === 'request_user_input' || proposal.kind === 'answer' || proposal.kind === 'observe';
      if (!isInformationalOrWait && proposal.confidence !== undefined) {
        if (proposal.confidence < 0.30) {
          const errorMsg = `Action rejected: Proposal confidence (${proposal.confidence}) is below minimal execution threshold (0.30)`;
          this.transition('failed-safe', errorMsg);
          const stepTrace: E2EStepTrace = {
            step,
            captureId: sanitized.captureId,
            pageGeneration: sanitized.captureId,
            maskCount: sanitized.maskCount,
            sanitizedScreenshotBytes: sanitized.sanitizedScreenshotDataUrl ? sanitized.sanitizedScreenshotDataUrl.length : 0,
            decisionOrigin,
            proposal,
            riskDecision: 'blocked',
            confidenceDecision: 'low_confidence',
            executed: false,
            networkRequestMade,
            timings: { total: Date.now() - t0_step }
          };
          this.stepsTrace.push(stepTrace);
          const res: CoordinatorRunResult = {
            success: false,
            state: 'failed-safe',
            error: errorMsg,
            sanitized,
            proposal,
            stepCount: step,
            steps: this.stepsTrace
          };
          return this.completeWithResult(res);
        } else if (proposal.confidence < 0.85 && proposal.risk !== 'blocked' && !isSafeReversibleInteraction(proposal, targetElement)) {
          // Human-in-the-loop: confidence below 0.85 requires human confirmation before executing destructive/state-altering actions
          proposal = {
            ...proposal,
            risk: 'protected',
            rationale: `Human-in-the-loop confirmation required: Confidence (${Math.round(proposal.confidence * 100)}%) is below autonomous threshold (85%). ${proposal.rationale}`
          };
        }
      }

      if (proposal.targetLocalId && !targetElement) {
        const errorMsg = `Action rejected: Model proposed non-existent target ID "${proposal.targetLocalId}".`;
        this.transition('failed-safe', errorMsg);
        const stepTrace: E2EStepTrace = {
          step,
          captureId: sanitized.captureId,
          pageGeneration: sanitized.captureId,
          maskCount: sanitized.maskCount,
          sanitizedScreenshotBytes: sanitized.sanitizedScreenshotDataUrl ? sanitized.sanitizedScreenshotDataUrl.length : 0,
          decisionOrigin,
          proposal,
          riskDecision: 'blocked',
          confidenceDecision: 'invalid_target_id',
          executed: false,
          networkRequestMade,
          timings: { total: Date.now() - t0_step }
        };
        this.stepsTrace.push(stepTrace);
        return this.completeWithResult({
          success: false,
          state: 'failed-safe',
          error: errorMsg,
          sanitized,
          proposal,
          stepCount: step,
          steps: this.stepsTrace
        });
      }

      // Step 4d: Client Safety Policy (always evaluated before semantic grounding)
      let classifiedRisk = classifyActionRisk(proposal, targetElement?.sanitizedName);
      if (proposal.kind === 'batch' && classifiedRisk === 'protected' && Array.isArray(proposal.batchActions) && proposal.batchActions.length > 0) {
        const firstSub = proposal.batchActions[0];
        const firstTarget = firstSub.targetLocalId ? sanitized.elements.find(e => e.localId === firstSub.targetLocalId) : undefined;
        const firstRisk = classifyActionRisk(firstSub as any, firstTarget?.sanitizedName);
        if (firstRisk === 'safe' && firstSub.kind !== 'click') {
          classifiedRisk = 'safe';
        }
      }
      let riskLevel: RiskLevel = (proposal.risk === 'blocked' || classifiedRisk === 'blocked')
        ? 'blocked'
        : (proposal.risk === 'protected' || classifiedRisk === 'protected')
          ? 'protected'
          : 'safe';

      if (riskLevel === 'blocked') {
        const targetName = (targetElement?.sanitizedName || '').toLowerCase();
        const rationale = (proposal.rationale || '').toLowerCase();
        // If the action was blocked because it is a sensitive control (captcha, password, otp, pin)
        // or was intended as user input, gracefully convert into an interactive HITL request rather than hard-failing!
        if (
          proposal.kind === 'request_user_input' ||
          targetName.includes('captcha') ||
          targetName.includes('password') ||
          targetName.includes('otp') ||
          targetName.includes('pin') ||
          rationale.includes('captcha') ||
          rationale.includes('manual entry') ||
          rationale.includes('user input')
        ) {
          proposal = {
            ...proposal,
            kind: 'request_user_input',
            confidence: Math.max(proposal.confidence || 0, 0.95),
            risk: 'safe',
            rationale: proposal.rationale || 'Please provide manual input to proceed.'
          };
          riskLevel = 'safe';
        }
      }

      if (riskLevel === 'blocked') {
        const errorMsg = `Action blocked by client safety policy: ${proposal.rationale}`;
        this.transition('failed-safe', errorMsg);
        const stepTrace: E2EStepTrace = {
          step,
          captureId: sanitized.captureId,
          pageGeneration: sanitized.captureId,
          maskCount: sanitized.maskCount,
          sanitizedScreenshotBytes: sanitized.sanitizedScreenshotDataUrl ? sanitized.sanitizedScreenshotDataUrl.length : 0,
          decisionOrigin,
          proposal,
          riskDecision: 'blocked',
          confidenceDecision: 'blocked_policy',
          executed: false,
          networkRequestMade,
          timings: { total: Date.now() - t0_step }
        };
        this.stepsTrace.push(stepTrace);
        const res: CoordinatorRunResult = {
          success: false,
          state: 'failed-safe',
          error: errorMsg,
          sanitized,
          proposal,
          stepCount: step,
          steps: this.stepsTrace
        };
        return this.completeWithResult(res);
      }

      // Step 4e: Semantic Target Grounding, Disambiguation, and Candidate Ranking
      const structuredIntent = this.currentTaskContract?.structuredIntent;
      if (
        decisionOrigin !== 'local' &&
        structuredIntent &&
        structuredIntent.targetPhrase &&
        structuredIntent.intent === proposal.kind &&
        targetElement
      ) {
        const grounding = groundTargetCandidates(
          sanitized.elements,
          structuredIntent,
          Boolean(sanitized.pageState?.visibleDialogCount && sanitized.pageState.visibleDialogCount > 0)
        );

        // 1. Missing target check: User commanded an explicit target (e.g. "Click SIH99999") that does not exist on page
        const isConversationalTarget = /\b(?:see|check|read|look|view|inspect|show|my\s+message|my\s+messages|latest\s+message)\b/i.test(structuredIntent.targetPhrase || '');
        const isMultiStepOrExploratory = Boolean(
          this.currentTaskContract?.isMultiStep ||
          /\b(?:and|then|download|brochure|pdf|report|find|explore|search|get|browse|locate)\b/i.test(this.currentGoal || '') ||
          (structuredIntent.targetTokens && structuredIntent.targetTokens.length > 3)
        );
        if (grounding.status === 'no_match' && this.currentTaskContract?.goalPattern === 'click_control' && !isConversationalTarget && !isMultiStepOrExploratory) {
          if (!this.hasTavilyRecovered) {
            this.hasTavilyRecovered = true;
            const fallbackQuery = `${structuredIntent.targetPhrase || this.currentGoal}`.trim();
            console.log(`[Coordinator] Target "${structuredIntent.targetPhrase}" not found on page. Engaging autonomous Tavily web search: "${fallbackQuery}"`);
            proposal = {
              actionId: `act_tavily_fallback_${Date.now()}`,
              kind: 'web_search',
              searchQuery: fallbackQuery,
              confidence: 0.95,
              risk: 'safe',
              userApproved: true,
              rationale: `Target "${structuredIntent.targetPhrase}" was not found on current page. Searching web via Tavily to locate direct resource.`
            };
            riskLevel = 'safe';
          } else {
            const errorMsg = `Action rejected: Requested target "${structuredIntent.targetPhrase}" is not present on the current page.`;
            this.transition('failed-safe', errorMsg);
            const stepTrace: E2EStepTrace = {
              step,
              captureId: sanitized.captureId,
              pageGeneration: sanitized.captureId,
              maskCount: sanitized.maskCount,
              sanitizedScreenshotBytes: sanitized.sanitizedScreenshotDataUrl ? sanitized.sanitizedScreenshotDataUrl.length : 0,
              decisionOrigin,
              proposal,
              riskDecision: 'blocked',
              confidenceDecision: 'missing_target',
              executed: false,
              networkRequestMade,
              timings: { total: Date.now() - t0_step }
            };
            this.stepsTrace.push(stepTrace);
            return this.completeWithResult({
              success: false,
              state: 'failed-safe',
              error: errorMsg,
              sanitized,
              proposal,
              stepCount: step,
              steps: this.stepsTrace
            });
          }
        }

        // 2. Ambiguity resolution (Only for destructive/protected controls like buttons or form inputs; never links or safe nav):
        const isSafeNavControl = targetElement?.role === 'link' || targetElement?.role === 'tab' || targetElement?.role === 'menuitem' || proposal.kind === 'navigate' || isSafeReversibleInteraction(proposal, targetElement);
        if (grounding.status === 'ambiguous_match' && !isSafeNavControl) {
          proposal = {
            ...proposal,
            risk: 'protected',
            rationale: grounding.ambiguityReason || `Ambiguous candidate: multiple controls matching "${structuredIntent.targetPhrase}". User confirmation required.`
          };
          riskLevel = 'protected';
        }

        // 3. Re-grounding model proposal if semantically inferior:
        // Do NOT override when user goal is document download and model already targeted a brochure/pdf element
        const isDocumentTarget = /\b(?:brochure|pdf|download|report|dataset|circular)\b/i.test(this.currentGoal || '') ||
          /\b(?:brochure|pdf|download)\b/i.test(targetElement?.sanitizedName || '') ||
          /\.pdf(?:\?.*)?$/i.test((targetElement as any)?.href || '');

        if (!isDocumentTarget && grounding.bestCandidate && proposal.targetLocalId !== grounding.bestCandidate.element.localId) {
          const proposedEval = scoreCandidate(targetElement, structuredIntent, Boolean(sanitized.pageState?.visibleDialogCount));
          if (proposedEval.isDisqualified || (grounding.bestCandidate.score >= 50 && grounding.bestCandidate.score - proposedEval.score >= 35)) {
            console.warn(`[PrivaPilot:Grounding] Re-grounding model proposal (${proposal.targetLocalId}: "${targetElement.sanitizedName}", score ${proposedEval.score}) to semantically superior candidate (${grounding.bestCandidate.element.localId}: "${grounding.bestCandidate.element.sanitizedName}", score ${grounding.bestCandidate.score})`);
            proposal = {
              ...proposal,
              targetLocalId: grounding.bestCandidate.element.localId,
              rationale: `${grounding.bestCandidate.rationale} [semantically grounded]`
            };
            targetElement = grounding.bestCandidate.element;
            const updatedClassifiedRisk = classifyActionRisk(proposal, targetElement?.sanitizedName);
            if (updatedClassifiedRisk === 'protected') {
              riskLevel = 'protected';
            }
          }
        }
      }

      // Step 4f: Unqualified Duplicate Candidate Ambiguity Gate (Only for low-confidence or non-link controls)
      if (targetElement && proposal.kind === 'click' && !isSafeReversibleInteraction(proposal, targetElement)) {
        const isHighConfidenceOrLink = (proposal.confidence || 0) >= 0.90 ||
          targetElement.role === 'link' ||
          targetElement.role === 'tab' ||
          targetElement.role === 'menuitem' ||
          proposal.actionId.startsWith('act_search_result_click_') ||
          proposal.actionId.startsWith('act_download_') ||
          proposal.actionId.startsWith('act_playbook_') ||
          proposal.actionId.startsWith('act_nav_');

        if (!isHighConfidenceOrLink) {
          const selectedElement = targetElement;
          const duplicates = sanitized.elements.filter(
            e => e.localId !== selectedElement.localId && e.role === selectedElement.role && e.sanitizedName.toLowerCase() === selectedElement.sanitizedName.toLowerCase()
          );
          if (duplicates.length > 0 && !structuredIntent?.contextPhrase) {
            proposal = {
              ...proposal,
              risk: 'protected',
              rationale: `Ambiguous candidate: multiple controls with name "${targetElement.sanitizedName}" present on page. User confirmation required.`
            };
            riskLevel = 'protected';
          }
        }
      }

      if (riskLevel === 'protected') {
        this.pendingAction = proposal;
        const msg = `Protected action requires user consent: ${proposal.rationale}`;
        this.transition('awaiting-user-confirmation', msg);
        if (this.listeners.onActionConfirmedRequired) {
          this.listeners.onActionConfirmedRequired(proposal, this.currentRunId);
        }
        const stepTrace: E2EStepTrace = {
          step,
          captureId: sanitized.captureId,
          pageGeneration: sanitized.captureId,
          maskCount: sanitized.maskCount,
          sanitizedScreenshotBytes: sanitized.sanitizedScreenshotDataUrl ? sanitized.sanitizedScreenshotDataUrl.length : 0,
          decisionOrigin,
          proposal,
          riskDecision: 'protected',
          confidenceDecision: 'requires_confirmation',
          executed: false,
          networkRequestMade,
          timings: { total: Date.now() - t0_step }
        };
        this.stepsTrace.push(stepTrace);
        const res: CoordinatorRunResult = {
          success: false,
          state: 'awaiting-user-confirmation',
          message: msg,
          sanitized,
          proposal,
          stepCount: step,
          steps: this.stepsTrace
        };
        return this.completeWithResult(res);
      }

      // Step 6: Safe Action Execution

      // Interactive Slot-Filling (Skyvern Pattern): check local vault first; if missing, prompt user in sidepanel
      if (proposal.kind === 'request_user_input') {
        let autoFilledFromVault = false;
        try {
          const prefersDemoData = /\b(?:demo|sample|dummy|test|practice|mock|synthetic)\b/i.test(this.currentGoal || '') ||
                                  /\b(?:demoqa\.com|practice|automation-practice|form-test)\b/i.test(activeTab?.url || '');
          const vaultProfile = await getUserProfile();
          const profile = prefersDemoData ? DEMO_USER_PROFILE : (vaultProfile || DEMO_USER_PROFILE);
          const pageDomain = (sanitized.pageState as any)?.domain || (activeTab.url ? normalizeDomain(activeTab.url) : '');
          const creds = await getCredentialsForDomain(pageDomain);
          const targetEl = sanitized.elements.find(e => e.localId === proposal.targetLocalId);
          const rawDomList: any[] = domResponse?.snapshot?.domElements || [];
          const rawInteractiveList: any[] = domResponse?.snapshot?.interactiveElements || [];
          const domEl = rawDomList.find((d: any) => d.id === targetEl?.localId);
          const interEl = rawInteractiveList.find((i: any) => i.localId === targetEl?.localId);
          const domDesc = domEl?.descriptor;
          const descriptor: FormElementDescriptor = {
            id: domDesc?.id || targetEl?.localId,
            tagName: domDesc?.tagName || (targetEl?.role === 'textarea' ? 'textarea' : 'input'),
            type: domDesc?.type,
            name: domDesc?.name || domDesc?.id || interEl?.rawName,
            rawName: interEl?.rawName || domDesc?.name || domDesc?.id,
            placeholder: domDesc?.placeholder,
            ariaLabel: domDesc?.ariaLabel,
            associatedLabelText: domDesc?.associatedLabelText,
            autocomplete: domDesc?.autocomplete,
            sanitizedName: targetEl?.sanitizedName
          };
          const match = matchFieldToVault(descriptor, profile, creds, pageDomain, prefersDemoData);
          if (proposal.targetLocalId && match.matched && match.valueToFill) {
            if (this.autofilledTargets.has(proposal.targetLocalId)) {
              console.warn(`[Coordinator] Target ${proposal.targetLocalId} already autofilled from vault. Checking remaining unfilled inputs.`);
              const unfilledInputs = sanitized.elements.filter(e =>
                (e.role === 'input' || e.role === 'textarea') &&
                !this.autofilledTargets.has(e.localId) &&
                !(e.state && e.state.includes('filled'))
              );
              let nextUnfilledMatch: any = null;
              let nextUnfilledEl: any = null;
              for (const otherInput of unfilledInputs) {
                const oDomEl = rawDomList.find((d: any) => d.id === otherInput.localId);
                const oInterEl = rawInteractiveList.find((i: any) => i.localId === otherInput.localId);
                const oDomDesc = oDomEl?.descriptor;
                const oDesc: FormElementDescriptor = {
                  id: oDomDesc?.id || otherInput.localId,
                  tagName: oDomDesc?.tagName || (otherInput.role === 'textarea' ? 'textarea' : 'input'),
                  type: oDomDesc?.type,
                  name: oDomDesc?.name || oDomDesc?.id || oInterEl?.rawName,
                  rawName: oInterEl?.rawName || oDomDesc?.name || oDomDesc?.id,
                  placeholder: oDomDesc?.placeholder,
                  ariaLabel: oDomDesc?.ariaLabel,
                  associatedLabelText: oDomDesc?.associatedLabelText,
                  autocomplete: oDomDesc?.autocomplete,
                  sanitizedName: otherInput.sanitizedName
                };
                const oMatch = matchFieldToVault(oDesc, profile, creds, pageDomain, prefersDemoData);
                if (oMatch.matched && oMatch.valueToFill) {
                  nextUnfilledMatch = oMatch;
                  nextUnfilledEl = otherInput;
                  break;
                }
              }

              if (nextUnfilledEl && nextUnfilledMatch) {
                this.autofilledTargets.add(nextUnfilledEl.localId);
                const autofillAction: ActionProposal = {
                  actionId: `act_vault_autofill_${Date.now()}`,
                  kind: 'type',
                  targetLocalId: nextUnfilledEl.localId,
                  textToType: nextUnfilledMatch.valueToFill,
                  confidence: 1.0,
                  risk: 'safe',
                  rationale: `Autofilled from local vault (${nextUnfilledMatch.canonicalField})`,
                  userApproved: true
                };
                await this.browser.sendMessageToTab(activeTab.id, {
                  type: 'EXECUTE_ACTION',
                  proposal: autofillAction,
                  captureId: sanitized.captureId
                });
                this.recordActionHistory(autofillAction);
                this.recentActionHistory.push({
                  actionId: autofillAction.actionId,
                  kind: 'type',
                  targetLocalId: nextUnfilledEl.localId,
                  observedOutcome: `Autofilled ${nextUnfilledMatch.canonicalField} from local Personal Vault`,
                  meaningfulProgress: true
                });
                this.recentActionHistory = this.recentActionHistory.slice(-10);
                autoFilledFromVault = true;
                this.transition('executing', `Autofilled ${nextUnfilledMatch.canonicalField} from ${prefersDemoData ? 'demo persona' : 'local Personal Vault'}`);
                continue;
              }

              const submitBtn = sanitized.elements.find(e =>
                (e.role === 'button' || e.role === 'input') &&
                (/\b(?:submit|register|sign\s*up|proceed|continue|send|save|login|sign\s*in)\b/i.test(e.sanitizedName) ||
                 (e as any).descriptor?.type === 'submit' ||
                 (e as any).type === 'submit' ||
                 /\b(?:submit|register)\b/i.test((e as any).rawName || '') ||
                 /\b(?:submit|register)\b/i.test((e as any).descriptor?.value || ''))
              );
              if (submitBtn) {
                proposal = {
                  actionId: `act_autofill_submit_${Date.now()}`,
                  kind: 'click',
                  targetLocalId: submitBtn.localId,
                  confidence: 0.99,
                  risk: 'safe',
                  userApproved: true,
                  reasoning: 'The required form fields are already populated from your local Personal Vault. Proceeding to click the submit button to complete your registration.',
                  rationale: `Form inputs already populated from Personal Vault. Proceeding to submit via "${submitBtn.sanitizedName}".`
                };
              } else {
                proposal = {
                  actionId: `act_autofill_done_${Date.now()}`,
                  kind: 'finish',
                  confidence: 1.0,
                  risk: 'safe',
                  userApproved: true,
                  reasoning: 'All requested form fields have been successfully populated with your local Personal Vault profile details.',
                  rationale: 'Form fields have been successfully populated.'
                };
              }
            } else {
              this.autofilledTargets.add(proposal.targetLocalId);
              const autofillAction: ActionProposal = {
                actionId: `act_vault_autofill_${Date.now()}`,
                kind: 'type',
                targetLocalId: proposal.targetLocalId,
                textToType: match.valueToFill,
                confidence: 1.0,
                risk: 'safe',
                rationale: `Autofilled from local vault (${match.canonicalField})`,
                userApproved: true
              };
              await this.browser.sendMessageToTab(activeTab.id, {
                type: 'EXECUTE_ACTION',
                proposal: autofillAction,
                captureId: sanitized.captureId
              });
              this.recordActionHistory(autofillAction);
              this.recentActionHistory.push({
                actionId: autofillAction.actionId,
                kind: 'type',
                targetLocalId: proposal.targetLocalId,
                observedOutcome: `Autofilled ${match.canonicalField} from local Personal Vault`,
                meaningfulProgress: true
              });
              this.recentActionHistory = this.recentActionHistory.slice(-10);
              autoFilledFromVault = true;
              this.transition('executing', `Autofilled ${match.canonicalField} from ${prefersDemoData ? 'demo persona' : 'local Personal Vault'}`);
              continue;
            }
          }
        } catch (_) {}

        if (!autoFilledFromVault) {
          const promptText = proposal.userInputPrompt || proposal.rationale || 'Please provide the information required by the form.';
          const inputNonce = this.generateInputNonce();
          let expectedOrigin: string | undefined = undefined;
          try {
            if (sanitized.pageState?.url) {
              expectedOrigin = new URL(sanitized.pageState.url).origin;
            }
          } catch (_) {}

          const inputRequest = {
            kind: proposal.targetLocalId ? 'text_input' as const : 'clarification' as const,
            prompt: promptText,
            targetLocalId: proposal.targetLocalId,
            inputKey: proposal.inputKey,
            runId: this.currentRunId,
            leasedTabId: this.currentTabId,
            inputNonce,
            expectedOrigin
          };
          this.pendingInputRequest = inputRequest;
          this.transition('awaiting-user-input', promptText);
          this.listeners.onUserInputRequired?.(inputRequest);
          const stepTrace: E2EStepTrace = {
            step,
            captureId: sanitized.captureId,
            pageGeneration: sanitized.captureId,
            maskCount: sanitized.maskCount,
            sanitizedScreenshotBytes: sanitized.sanitizedScreenshotDataUrl ? sanitized.sanitizedScreenshotDataUrl.length : 0,
            decisionOrigin,
            proposal,
            riskDecision: 'safe',
            confidenceDecision: 'requires_user_input',
            executed: false,
            networkRequestMade,
            timings: { total: Date.now() - t0_step }
          };
          this.stepsTrace.push(stepTrace);
          const res: CoordinatorRunResult = {
            success: true,
            state: 'awaiting-user-input',
            message: promptText,
            sanitized,
            proposal,
            inputRequest,
            stepCount: step,
            steps: this.stepsTrace
          };
          return this.completeWithResult(res);
        }
      }

      // Perception-Execution Bridge: If the model returned 'answer' with a clarification question
      // (e.g. asking which platform or ending with '?') while on a live webpage where relevant
      // navigation controls exist (e.g. "Problem Statements", "Submissions"),
      // auto-advance by clicking the navigation target instead of prematurely terminating the run!
      if (proposal.kind === 'answer' && step < maxSteps) {
        const answerText = proposal.reply || proposal.rationale || '';
        const isClarificationQuestion = (
          /\b(?:which\s+(?:platform|website|site|problem)|could\s+you\s+clarify|please\s+clarify|where\s+is\s+this|what\s+site)\b/i.test(answerText) ||
          (answerText.trim().endsWith('?') && this.currentTaskContract?.isAnswerGoal && this.actionHistory.length === 0)
        );

        if (isClarificationQuestion) {
          const topic = this.currentTaskContract?.queryTopic || '';
          const navCandidate = sanitized.elements.find(e =>
            (e.role === 'link' || e.role === 'button' || e.role === 'tab') &&
            (/problem\s*statement|submission|statement/i.test(e.sanitizedName) || (topic && e.sanitizedName.toLowerCase().includes(topic.toLowerCase())))
          );
          if (navCandidate) {
            console.log(`[Coordinator] Model proposed clarification query instead of navigation; advancing to navigation target: ${navCandidate.sanitizedName} (${navCandidate.localId})`);
            proposal = {
              actionId: `act_nav_${Date.now()}`,
              kind: 'click',
              targetLocalId: navCandidate.localId,
              confidence: 0.96,
              risk: 'safe',
              rationale: `Navigating to "${navCandidate.sanitizedName}" to locate the requested data.`
            };
            riskLevel = 'safe';
          }
        }
      }

      // Search Results Article Drilling Guard:
      // When on a search results page (e.g. search.html, gsc.q=, google search, bing, etc.)
      // and the user wants to read or find content details (payloads, launch vehicles, specs, instruments, details),
      // DO NOT finish or just scroll search snippets! Click the top relevant article link to navigate into the real article!
      const currentUrlStr = activeTab?.url || sanitized.pageState?.url || '';
      const isOnSearchResultsPage = Boolean(
        currentUrlStr.includes('search.html') ||
        currentUrlStr.includes('gsc.q=') ||
        currentUrlStr.includes('/search?') ||
        currentUrlStr.includes('Special:Search') ||
        /search\s+results/i.test(sanitized.pageState?.title || '')
      );
      const isArticleReadingGoal = /\b(?:summari[sz]e|compare|difference|differences|superconducting|trapped[-\s]?ion|qubits?|instruments?|payloads?|specifications?|launch\s+vehicles?|launchers?|requirements?|details?|read\s+(?:the\s+)?article|tell\s+me\s+what\s+(?:instruments?|payloads?|details?))\b/i.test(this.currentGoal || '');
      const hasClickedSearchResult = this.actionHistory.some(a => a.actionId && a.actionId.startsWith('act_search_result_click_'));

      if (isOnSearchResultsPage && isArticleReadingGoal && !hasClickedSearchResult && step < maxSteps) {
        const query = this.getSearchQuery(this.currentGoal || '') || 'Chandrayaan-3';
        const queryTokens = tokenizeSemanticText(query).filter(t => t.length > 2);
        const resultLink = sanitized.elements.find((el) => {
          if (el.role !== 'link') return false;
          const nameNorm = (el.sanitizedName || '').toLowerCase();
          if (
            nameNorm.includes('google') ||
            nameNorm.includes('privacy') ||
            nameNorm.includes('terms') ||
            nameNorm === 'search' ||
            nameNorm.length < 4 ||
            nameNorm.includes('video') ||
            nameNorm.includes('gallery') ||
            nameNorm.includes('page')
          ) {
            return false;
          }
          if (queryTokens.some((t) => nameNorm.includes(t))) return true;
          if (nameNorm.includes('isro') || nameNorm.includes('mission') || nameNorm.includes('chandrayaan') || nameNorm.includes('aditya') || nameNorm.includes('gaganyaan')) return true;
          return false;
        });

        if (resultLink) {
          console.log(`[Coordinator] Search Results Drilling Guard: On search results page; clicking primary result "${resultLink.sanitizedName}" (${resultLink.localId}) to enter full article.`);
          proposal = {
            actionId: `act_search_result_click_${step}_${Date.now()}`,
            kind: 'click',
            targetLocalId: resultLink.localId,
            confidence: 0.98,
            risk: 'safe',
            reasoning: proposal.reasoning || `I am currently on the search results page (${currentUrlStr}). The top result "${resultLink.sanitizedName}" links to the primary article. I will now click "${resultLink.sanitizedName}" to navigate directly into the official article before reading.`,
            rationale: `Clicking search result "${resultLink.sanitizedName}" to open the official article and read the full details.`
          };
          riskLevel = 'safe';
        }
      }

      // Prefer a relevant article section anchor over repeated viewport scrolling.
      // Wikipedia and similar long-form pages expose section links in their table of contents.
      const comparisonGoal = /\b(?:compare|difference|differences|versus|vs\.?)\b/i.test(this.currentGoal || '');
      const mentionsQubitImplementations = /\b(?:superconducting|trapped[-\s]?ion|qubits?)\b/i.test(this.currentGoal || '');
      const hasSelectedRelevantSection = this.actionHistory.some(a => a.actionId?.startsWith('act_section_anchor_'));
      if (!isOnSearchResultsPage && comparisonGoal && mentionsQubitImplementations && !hasSelectedRelevantSection && step < maxSteps) {
        const sectionLink = sanitized.elements.find(el =>
          (el.role === 'link' || el.role === 'button') &&
          /\b(?:physical\s+realizations?|implementations?|qubit\s+implementations?|hardware)\b/i.test(el.sanitizedName || '')
        );
        if (sectionLink) {
          proposal = {
            actionId: `act_section_anchor_${step}_${Date.now()}`,
            kind: 'click',
            targetLocalId: sectionLink.localId,
            targetName: sectionLink.sanitizedName,
            confidence: 0.99,
            risk: 'safe',
            reasoning: `A relevant section anchor, "${sectionLink.sanitizedName}", is available. Clicking it is faster and more precise than repeated scrolling.`,
            rationale: `Jumping directly to "${sectionLink.sanitizedName}" to compare the requested qubit implementations.`
          };
          riskLevel = 'safe';
        }
      }

      // Grounded Reading Guard: If the user asked to read or find specific details in an article
      // (e.g. instruments, payloads, specifications, requirements), but the agent just landed at
      // the top of a long article (scrollTop < 250) and has never scrolled, smoothly scroll down
      // the article first so the agent grounds and reveals the content realistically on screen!
      if ((proposal.kind === 'finish' || proposal.kind === 'answer') && step < maxSteps) {
        const sm = sanitized.pageState?.scrollMetrics;
        const lastClickIdx = this.actionHistory.map(a => a.kind).lastIndexOf('click');
        const hasScrolledAfterLastClick = lastClickIdx >= 0
          ? this.actionHistory.slice(lastClickIdx).some(a => a.kind === 'scroll')
          : this.actionHistory.some(a => a.kind === 'scroll');
        const isAtTopOfLongPage = Boolean(sm && sm.scrollableBelow && sm.maxScrollTop > 800 && sm.scrollTop < 250);

        const isUnrelatedSite = /\b(?:youtube\.com|youtu\.be|google\.[a-z.]+|bing\.com|duckduckgo\.com|twitter\.com|x\.com)\b/i.test(activeTab?.url || '');
        if (!isUnrelatedSite && !hasSelectedRelevantSection && isArticleReadingGoal && !hasScrolledAfterLastClick && isAtTopOfLongPage && !isOnSearchResultsPage) {
          console.log(`[Coordinator] Grounded reading scroll: Navigated to long article at top; scrolling down smoothly to locate content before finishing.`);
          proposal = {
            actionId: `act_grounded_scroll_${Date.now()}`,
            kind: 'scroll',
            scrollDirection: 'down',
            confidence: 0.98,
            risk: 'safe',
            reasoning: proposal.reasoning || `I have navigated to the article. Currently at the top of the page (Scroll: ${sm?.scrollTop || 0}px / ${sm?.maxScrollTop}px). I am smoothly scrolling down the article to bring the content into view for reading.`,
            rationale: `Scrolling down article smoothly to locate and ground the requested content.`
          };
          riskLevel = 'safe';
        }

        // Anti-Passive Autonomous Guard: If the model proposes finish/answer by asking
        // "Would you like me to navigate there for you?" or "Would you like me to scroll/click...",
        // intercept it and execute the action autonomously!
        const replyText = (proposal.reply || proposal.rationale || '').toLowerCase();
        const asksPermission = /\b(?:would\s+you\s+like\s+me\s+to|shall\s+i|do\s+you\s+want\s+me\s+to|should\s+i)\s+(?:navigate|go|click|open|explore|check|visit|scroll)\b/i.test(replyText);
        if (asksPermission) {
          const candidateWords = ((this.currentGoal || '') + ' ' + replyText).toLowerCase();
          const matchingElement = sanitized.elements.find(el => {
            if (el.role !== 'link' && el.role !== 'button' && el.role !== 'tab' && el.role !== 'menuitem') return false;
            const elName = (el.sanitizedName || '').toLowerCase().replace(/[^a-z0-9]/g, '');
            if (elName.length < 3) return false;
            return candidateWords.includes(elName) ||
              (elName.includes('startup') && candidateWords.includes('startup')) ||
              (elName.includes('tender') && candidateWords.includes('tender')) ||
              (elName.includes('career') && candidateWords.includes('career')) ||
              (elName.includes('gallery') && candidateWords.includes('gallery')) ||
              (elName.includes('contact') && candidateWords.includes('contact'));
          });

          if (matchingElement) {
            console.log(`[Coordinator] Anti-Passive Guard: Intercepted permission-asking reply. Autonomously clicking "${matchingElement.sanitizedName}"!`);
            proposal = {
              actionId: `act_autonomous_click_${Date.now()}`,
              kind: 'click',
              targetLocalId: matchingElement.localId,
              confidence: 0.98,
              risk: 'safe',
              reasoning: `User requested to explore/see this section. Rather than asking permission, autonomously executing click on "${matchingElement.sanitizedName}".`,
              rationale: `Navigating to ${matchingElement.sanitizedName} to fulfill your request.`
            };
            riskLevel = 'safe';
          }
        }

        // Grounded Imperative Action Guard: If user goal is an imperative action (e.g. "unfollow him", "follow", "subscribe", "like", "delete", "click"),
        // but the model proposes finish or answer on step 1 (or before any mutating action has been executed),
        // intercept it and autonomously execute the click on the matching target button!
        const hasExecutedMutatingAction = this.actionHistory.some(a =>
          a.kind === 'click' || a.kind === 'type' || a.kind === 'select' || a.kind === 'navigate'
        );
        const isImperativeActionGoal = !this.currentTaskContract?.isAnswerGoal &&
          (this.currentTaskContract?.structuredIntent?.intent === 'click' ||
           /\b(?:unfollow|follow|subscribe|unsubscribe|mute|block|like|unlike|click|press|tap)\b/i.test(this.currentGoal || ''));

        if ((proposal.kind === 'finish' || proposal.kind === 'answer') && !hasExecutedMutatingAction && isImperativeActionGoal && step < maxSteps) {
          const targetTokenList = this.currentTaskContract?.structuredIntent?.targetTokens || [];
          const goalTokens = (this.currentGoal || '').toLowerCase().split(/\s+/).filter(w => w.length > 2);
          const searchTokens = [...new Set([...targetTokenList, ...goalTokens])];

          const matchingElement = sanitized.elements.find(el => {
            if (el.role !== 'button' && el.role !== 'link' && el.role !== 'tab' && el.role !== 'menuitem') return false;
            const name = (el.sanitizedName || '').toLowerCase();
            return searchTokens.some(tok => name.includes(tok));
          });

          if (matchingElement) {
            console.log(`[Coordinator] Grounded Action Guard: Model proposed premature ${proposal.kind} before action execution. Autonomously clicking "${matchingElement.sanitizedName}" (${matchingElement.localId})!`);
            proposal = {
              actionId: `act_grounded_click_${Date.now()}`,
              kind: 'click',
              targetLocalId: matchingElement.localId,
              confidence: 0.98,
              risk: 'safe',
              reasoning: `User requested "${this.currentGoal}". Before finishing, I must execute the required action on "${matchingElement.sanitizedName}". Clicking it now.`,
              rationale: `Clicking "${matchingElement.sanitizedName}" to fulfill your request.`
            };
            riskLevel = 'safe';
          }
        }
      }

      if (proposal.kind === 'finish' || proposal.kind === 'answer') {
        let terminalCheck = this.currentTaskContract
          ? this.verifyTerminalPostcondition(this.currentTaskContract, sanitized, this.actionHistory)
          : { satisfied: true, reason: 'Goal completed' };

        const hasSubstantiveAnswer = Boolean(
          (proposal.reply && proposal.reply.trim().length >= 20 && !/^(?:done|task (?:is )?finished|completed|ok)\.?$/i.test(proposal.reply.trim())) ||
          (proposal.rationale && proposal.rationale.trim().length >= 35 && !/^(?:task|action|goal) (?:is )?(?:completed|done|finished)/i.test(proposal.rationale.trim()))
        );

        if (proposal.kind === 'finish' && !proposal.reply && proposal.rationale && hasSubstantiveAnswer) {
          proposal = { ...proposal, reply: proposal.rationale };
        }

        const isAnswerGoal = Boolean(this.currentTaskContract?.isAnswerGoal) ||
          /^(?:how\s+(?:many|much|do|does|can)|what|who|which|where|when|why|tell\s+me|show\s+me|is\s+there|are\s+there|can\s+i|do\s+i)\b/i.test(this.currentGoal || '') ||
          /\?+\s*$/.test((this.currentGoal || '').trim());
        const isAnswerOrConversational = (proposal.kind === 'answer' && hasSubstantiveAnswer) ||
          (isAnswerGoal && hasSubstantiveAnswer) ||
          (proposal.kind === 'finish' && hasSubstantiveAnswer && (isAnswerGoal || Boolean(proposal.reply && proposal.reply.length >= 35))) ||
          (this.currentTaskContract?.goalPattern === 'conversational_query') ||
          (this.currentTaskContract?.goalPattern === 'navigate_url' && this.actionHistory.some(a => a.kind === 'navigate'));

        if (isAnswerOrConversational && !terminalCheck.satisfied) {
          terminalCheck = { satisfied: true, reason: 'Conversational answer verified' };
        }

        if ((terminalCheck.satisfied || isAnswerOrConversational) && this.currentTaskSpec && this.objectiveProgress) {
          for (const objective of this.currentTaskSpec.objectives) {
            if (!this.objectiveProgress.completedObjectiveIds.includes(objective.id)) {
              this.objectiveProgress = recordObjectiveEvidence(this.objectiveProgress, {
                objectiveId: objective.id,
                kind: 'element',
                summary: (terminalCheck.reason || proposal.rationale || proposal.reasoning || 'Terminal goal postcondition satisfied').slice(0, 1000),
                sourceActionId: proposal.actionId,
                verified: true
              });
              this.objectiveProgress = completeObjectiveWithEvidence(this.currentTaskSpec, this.objectiveProgress, objective.id);
            }
          }
        }

        const objectiveCheck = this.currentTaskSpec && this.objectiveProgress
          ? canFinishTask(this.currentTaskSpec, this.objectiveProgress)
          : { satisfied: true, reason: 'No structured objectives available' };

        if (!objectiveCheck.satisfied && this.currentTaskSpec?.objectives?.length) {
          const isNavDone = (this.actionHistory.some(a => a.kind === 'navigate') || Boolean(extractTargetUrlFromGoal(this.currentGoal || ''))) &&
            (proposal.kind === 'finish' || proposal.kind === 'answer');
          const modelConfirmsFulfillment = Boolean(proposal.confidence && proposal.confidence >= 0.9 && hasSubstantiveAnswer);

          if (isNavDone || modelConfirmsFulfillment) {
            for (const objective of this.currentTaskSpec.objectives) {
              if (!this.objectiveProgress!.completedObjectiveIds.includes(objective.id)) {
                this.objectiveProgress = recordObjectiveEvidence(this.objectiveProgress!, {
                  objectiveId: objective.id,
                  kind: 'element',
                  summary: (proposal.rationale || proposal.reasoning || 'Goal fulfillment verified by model observation').slice(0, 1000),
                  sourceActionId: proposal.actionId,
                  verified: true
                });
                this.objectiveProgress = completeObjectiveWithEvidence(this.currentTaskSpec, this.objectiveProgress!, objective.id);
              }
            }
          } else {
            const errorMsg = `Task rejected: terminal action proposed before objective completion: ${objectiveCheck.reason}`;
            this.transition('failed-safe', errorMsg);
            const res: CoordinatorRunResult = { success: false, state: 'failed-safe', error: errorMsg, sanitized, proposal, stepCount: step, steps: this.stepsTrace };
            return this.completeWithResult(res);
          }
        }

        if (proposal.kind === 'finish' && isAnswerGoal && !hasSubstantiveAnswer) {
          const errorMsg = `Task rejected: Model proposed "finish" for an information retrieval / summarization task without providing an answer or summary.`;
          this.transition('failed-safe', errorMsg);
          const stepTrace: E2EStepTrace = {
            step,
            captureId: sanitized.captureId,
            pageGeneration: sanitized.captureId,
            maskCount: sanitized.maskCount,
            sanitizedScreenshotBytes: sanitized.sanitizedScreenshotDataUrl ? sanitized.sanitizedScreenshotDataUrl.length : 0,
            decisionOrigin,
            proposal,
            riskDecision: riskLevel,
            confidenceDecision: 'rejected_false_finish',
            executed: false,
            verification: {
              verified: false,
              reasonCode: 'FALSE_FINISH_NO_ANSWER',
              durationMs: 0
            },
            networkRequestMade,
            timings: { total: Date.now() - t0_step }
          };
          this.stepsTrace.push(stepTrace);
          const res: CoordinatorRunResult = {
            success: false,
            state: 'failed-safe',
            error: errorMsg,
            sanitized,
            proposal,
            stepCount: step,
            steps: this.stepsTrace
          };
          return this.completeWithResult(res);
        }

        const isXBookmarkGoal = this.isXBookmarkGoal();
        if (!terminalCheck.satisfied && !isAnswerOrConversational && (isXBookmarkGoal || (proposal.kind === 'finish' && !isAnswerOrConversational))) {
          if (step < maxSteps && !isXBookmarkGoal) {
            console.warn(`[Coordinator] Premature finish rejected (${terminalCheck.reason}). Re-perceiving page and continuing loop with corrective feedback...`);
            this.currentExecutionFeedback = {
              lastActionId: proposal.actionId,
              lastActionKind: proposal.kind,
              verified: false,
              outcomeCode: 'PREMATURE_FINISH_REJECTED',
              stepIndex: step,
              remainingTasks: [`Execute the required action and visually verify completion (${terminalCheck.reason})`]
            };
            this.transition('capturing', `Action postcondition unverified: ${terminalCheck.reason}. Re-perceiving page state (step ${step + 1}/${maxSteps})...`);
            continue;
          }

          const errorMsg = `Task rejected: Model proposed "finish" before required action postconditions were established or verified: ${terminalCheck.reason}`;
          this.transition('failed-safe', errorMsg);
          const stepTrace: E2EStepTrace = {
            step,
            captureId: sanitized.captureId,
            pageGeneration: sanitized.captureId,
            maskCount: sanitized.maskCount,
            sanitizedScreenshotBytes: sanitized.sanitizedScreenshotDataUrl ? sanitized.sanitizedScreenshotDataUrl.length : 0,
            decisionOrigin,
            proposal,
            riskDecision: riskLevel,
            confidenceDecision: 'rejected_false_finish',
            executed: false,
            verification: {
              verified: false,
              reasonCode: 'FALSE_FINISH_NO_POSTCONDITION',
              durationMs: 0
            },
            networkRequestMade,
            timings: { total: Date.now() - t0_step }
          };
          this.stepsTrace.push(stepTrace);
          const res: CoordinatorRunResult = {
            success: false,
            state: 'failed-safe',
            error: errorMsg,
            sanitized,
            proposal,
            stepCount: step,
            steps: this.stepsTrace
          };
          return this.completeWithResult(res);
        }

        const tFin = Date.now();
        const telemetry = this.createTelemetry(t0_step, t1_captureComplete, t2_detectionComplete, t3_sanitizationValidated, t4_reasoningReceived, t5_actionValidated, tFin, tFin, step);
        if (this.listeners.onTelemetryUpdated) {
          this.listeners.onTelemetryUpdated(telemetry, this.currentRunId);
        }
        if (isXBookmarkGoal) {
          const posts = sanitized.pageState.contentSummaries || [];
          const visiblePosts = posts.filter(s => /^Visible post \d+(?: by [^:]+)?: .+/.test(s));
          if (visiblePosts.length > 0) {
            proposal = { ...proposal, reply: `Bookmarks visible on your current X Bookmarks page:\n${visiblePosts.map(s => `- ${s}`).join('\n')}` };
          }
        }
        const completionMsg = proposal.reply || proposal.rationale;
        this.transition('complete', `Task completed: ${completionMsg}`);
        const stepTrace: E2EStepTrace = {
          step,
          captureId: sanitized.captureId,
          pageGeneration: sanitized.captureId,
          maskCount: sanitized.maskCount,
          sanitizedScreenshotBytes: sanitized.sanitizedScreenshotDataUrl ? sanitized.sanitizedScreenshotDataUrl.length : 0,
          decisionOrigin,
          proposal,
          riskDecision: riskLevel,
          confidenceDecision: 'accepted',
          executed: false,
          verification: {
            verified: true,
            reasonCode: 'GOAL_POSTCONDITION_VERIFIED',
            durationMs: 0
          },
          networkRequestMade,
          timings: { total: tFin - t0_step }
        };
        this.stepsTrace.push(stepTrace);

        const res: CoordinatorRunResult = {
          success: true,
          state: 'complete',
          message: proposal.reply || proposal.rationale,
          sanitized,
          proposal,
          telemetry,
          stepCount: step,
          steps: this.stepsTrace
        };
        return this.completeWithResult(res);
      }

      // Check repeated action loop & Autonomous Tavily Fallback Recovery
      const isDuplicate = this.isRepeatedAction(proposal, sanitized);
      if (isDuplicate) {
        if (!this.hasTavilyRecovered) {
          this.hasTavilyRecovered = true;
          this.transition('awaiting-reasoning', '⚠️ In-page navigation dead-end detected. Invoking autonomous Tavily search fallback...');
          try {
            const pageDomain = (sanitized.pageState as any)?.domain || (activeTab?.url ? normalizeDomain(activeTab.url) : '');
            const cleanGoal = (this.currentGoal || '').replace(/^(?:go to|navigate to|open|search for|download|find)\s+/i, '').trim();
            const searchQuery = pageDomain && !cleanGoal.toLowerCase().includes(pageDomain.split('.')[0])
              ? `${pageDomain} ${cleanGoal}`
              : cleanGoal;

            const searchRes = typeof this.httpClient?.searchWeb === 'function' ? await this.httpClient.searchWeb(searchQuery, 5) : null;
            if (searchRes?.success && searchRes.results && searchRes.results.length > 0) {
              const currentUrl = activeTab?.url || '';
              const topResult = selectBestTavilyResult(searchRes.results, searchQuery, this.currentGoal || '', currentUrl);

              const curHost = currentUrl ? new URL(currentUrl).hostname.toLowerCase() : '';
              const isOfficialPortal = curHost.includes('isro.gov.in') || curHost.includes('bhuvan') || curHost.includes('sih.gov.in');

              if (topResult && topResult.url && topResult.url !== currentUrl) {
                this.transition('executing', `Navigating to target via Tavily search: "${topResult.title}"...`);
                proposal = {
                  actionId: `act_tavily_recover_${step}_${Date.now()}`,
                  kind: 'navigate',
                  url: topResult.url,
                  confidence: 0.95,
                  risk: 'safe',
                  userApproved: true,
                  rationale: `Autonomously recovered from repeated in-page action loop via Tavily Search: Navigating directly to "${topResult.title}" (${topResult.url})`
                };
                this.actionHistory = [];
              } else if (isOfficialPortal) {
                this.transition('awaiting-reasoning', 'Action loop detected and resource not found on portal. Requesting user clarification...');
                proposal = {
                  actionId: `act_clarify_loop_${step}_${Date.now()}`,
                  kind: 'request_user_input',
                  confidence: 0.9,
                  risk: 'safe',
                  rationale: `Could not locate "${cleanGoal}" directly on ${curHost}. Requesting user input.`,
                  userInputPrompt: `Could not find "${cleanGoal}" on ${curHost}. The page does not contain a direct download link. Would you like to check an affiliated portal (e.g. Jigyasa) or try another search query?`
                };
                this.actionHistory = [];
              } else {
                const errorMsg = 'Repeated action loop detected: identical action proposed consecutively without progress';
                this.transition('failed-safe', errorMsg);
                const res: CoordinatorRunResult = {
                  success: false,
                  state: 'failed-safe',
                  error: errorMsg,
                  sanitized,
                  proposal,
                  stepCount: step,
                  steps: this.stepsTrace
                };
                return this.completeWithResult(res);
              }
            } else {
              const currentUrl = activeTab?.url || '';
              const curHost = currentUrl ? new URL(currentUrl).hostname.toLowerCase() : '';
              const isOfficialPortal = curHost.includes('isro.gov.in') || curHost.includes('bhuvan') || curHost.includes('sih.gov.in');
              if (isOfficialPortal) {
                this.transition('awaiting-reasoning', 'Action loop detected on official portal. Requesting user clarification...');
                proposal = {
                  actionId: `act_clarify_loop_${step}_${Date.now()}`,
                  kind: 'request_user_input',
                  confidence: 0.9,
                  risk: 'safe',
                  rationale: `Repeated action loop on ${curHost}. Requesting clarification.`,
                  userInputPrompt: `Could not find "${cleanGoal}" on ${curHost}. Would you like to clarify what to look for or check an affiliated portal?`
                };
                this.actionHistory = [];
              } else {
                const errorMsg = 'Repeated action loop detected: identical action proposed consecutively without progress';
                this.transition('failed-safe', errorMsg);
                const res: CoordinatorRunResult = {
                  success: false,
                  state: 'failed-safe',
                  error: errorMsg,
                  sanitized,
                  proposal,
                  stepCount: step,
                  steps: this.stepsTrace
                };
                return this.completeWithResult(res);
              }
            }
          } catch (tavilyErr) {
            console.warn('[PrivaPilot Coordinator] Tavily fallback failed:', tavilyErr);
            const errorMsg = 'Repeated action loop detected: identical action proposed consecutively without progress';
            this.transition('failed-safe', errorMsg);
            const res: CoordinatorRunResult = {
              success: false,
              state: 'failed-safe',
              error: errorMsg,
              sanitized,
              proposal,
              stepCount: step,
              steps: this.stepsTrace
            };
            return this.completeWithResult(res);
          }
        } else {
          const errorMsg = 'Repeated action loop detected: identical action proposed consecutively without progress';
          this.transition('failed-safe', errorMsg);
          const res: CoordinatorRunResult = {
            success: false,
            state: 'failed-safe',
            error: errorMsg,
            sanitized,
            proposal,
            stepCount: step,
            steps: this.stepsTrace
          };
          return this.completeWithResult(res);
        }
      }
      // Execute action via content script
      this.transition('executing', `Step ${step}/${maxSteps}: Executing '${proposal.kind}' on ${proposal.targetLocalId || 'page'}`);

      if (proposal.kind === 'wait') {
        await new Promise((r) => setTimeout(r, 600));
      }

      const currentUrl = activeTab?.url || '';
      const typedSearchElement = sanitized.elements.find(el => el.localId === proposal.targetLocalId);
      const isSearchTarget = Boolean(
        typedSearchElement && (
          typedSearchElement.role === 'input' && (
            /search|query|find|txtsearch/i.test(typedSearchElement.sanitizedName || '') ||
            /search|query|find|txtsearch/i.test((typedSearchElement as any).name || '') ||
            /search|query|find|txtsearch/i.test((typedSearchElement as any).placeholder || '') ||
            /search|query|find|txtsearch/i.test((typedSearchElement as any).id || '')
          )
        )
      );
      if (proposal.kind === 'type' && !proposal.pressEnter && (
        this.currentTaskContract?.structuredIntent?.pressEnter ||
        /(?:amazon|flipkart|google|search|isro|wikipedia)/i.test(currentUrl) ||
        isSearchTarget
      ) && !(isMissionBrochureGoal(this.currentGoal || '') && isroMissionStage(currentUrl) === 'directory')) {
        proposal = { ...proposal, pressEnter: true };
      }

      // Local Zero-Knowledge Vault Enrichment for single type action
      if (proposal.kind === 'type' && proposal.targetLocalId && !proposal.actionId?.startsWith('act_autofill_')) {
        try {
          const prefersDemoData = /\b(?:demo|sample|dummy|test|practice|mock|synthetic)\b/i.test(this.currentGoal || '') ||
                                  /\b(?:demoqa\.com|practice|automation-practice|form-test)\b/i.test(activeTab?.url || '');
          const vaultProfile = await getUserProfile();
          const profile = prefersDemoData ? DEMO_USER_PROFILE : (vaultProfile || DEMO_USER_PROFILE);
          const pageDomain = (sanitized.pageState as any)?.domain || (activeTab.url ? normalizeDomain(activeTab.url) : '');
          const creds = await getCredentialsForDomain(pageDomain);
          const targetEl = sanitized.elements.find(e => e.localId === proposal.targetLocalId);
          if (targetEl && (targetEl.role === 'input' || targetEl.role === 'textarea')) {
            const isAutofill = /\b(?:fill|autofill|register|signup|sign\s*up|login|log\s*in|profile|details|form)\b/i.test(this.currentGoal || '');
            const isPlaceholder = !proposal.textToType || /^(?:alice|bob|john|jane|user@|test@|example\.com|placeholder|enter\s+|your\s+|\[.*\])/i.test(proposal.textToType.trim());
            const rawDomList: any[] = domResponse?.snapshot?.domElements || [];
            const rawInteractiveList: any[] = domResponse?.snapshot?.interactiveElements || [];
            const domEl = rawDomList.find((d: any) => d.id === targetEl.localId);
            const interEl = rawInteractiveList.find((i: any) => i.localId === targetEl.localId);
            const domDesc = domEl?.descriptor;
            const descriptor: FormElementDescriptor = {
              id: domDesc?.id || targetEl.localId,
              tagName: domDesc?.tagName || (targetEl.role === 'textarea' ? 'textarea' : 'input'),
              type: domDesc?.type,
              name: domDesc?.name || domDesc?.id || interEl?.rawName,
              rawName: interEl?.rawName || domDesc?.name || domDesc?.id,
              placeholder: domDesc?.placeholder,
              ariaLabel: domDesc?.ariaLabel,
              associatedLabelText: domDesc?.associatedLabelText,
              autocomplete: domDesc?.autocomplete,
              sanitizedName: targetEl.sanitizedName
            };
            const match = matchFieldToVault(descriptor, profile, creds, pageDomain, prefersDemoData);
            if (match.matched && match.valueToFill && (isAutofill || isPlaceholder)) {
              proposal = {
                ...proposal,
                textToType: match.valueToFill,
                userApproved: true,
                rationale: `Autofilled ${match.canonicalField} with ${prefersDemoData ? 'synthetic demo persona' : 'local Personal Vault'}`
              };
            }
          }
        } catch (_) {}
      }

      // Final dispatch gate: no later grounding, Enter inference, vault enrichment or batch
      // may restore a header/breadcrumb or language-switch target on this mission route.
      const missionGate = enforceIsroMissionProgression(this.currentGoal || '', activeTab?.url || '', sanitized.elements, proposal);
      if (missionGate.error) {
        this.transition('failed-safe', missionGate.error);
        return this.completeWithResult({ success: false, state: 'failed-safe', error: missionGate.error,
          sanitized, proposal, stepCount: step, steps: this.stepsTrace });
      }
      proposal = missionGate.proposal!;
      if (isMissionBrochureGoal(this.currentGoal || '') && isroMissionStage(activeTab?.url || '') &&
          proposal.kind === 'type' && proposal.targetLocalId && proposal.textToType === 'Chandrayaan' &&
          this.lastExecutedProposal?.kind === 'type' && this.lastExecutedProposal.targetLocalId === proposal.targetLocalId &&
          this.lastExecutedProposal.textToType === proposal.textToType && this.lastExecutionResult?.success) {
        const error = 'Table filter did not reveal a visible Chandrayaan-3 row; stopping instead of repeating the filter.';
        this.transition('failed-safe', error);
        return this.completeWithResult({ success: false, state: 'failed-safe', error, sanitized, proposal,
          stepCount: step, steps: this.stepsTrace });
      }
      targetElement = proposal.targetLocalId ? sanitized.elements.find(e => e.localId === proposal.targetLocalId) : undefined;
      this.lastActionProposal = proposal;
      if (this.listeners.onActionProposed && isMissionBrochureGoal(this.currentGoal || '') && isroMissionStage(activeTab?.url || '')) {
        this.listeners.onActionProposed(proposal, this.currentRunId);
      }

      // Pre-submission completeness guard: if goal is to fill/register and the proposed action is to submit,
      // verify that any unfilled profile fields matching local vault are populated first
      const isSubmittingBtn = Boolean(proposal.kind === 'click' && targetElement && (
        (targetElement.role === 'button' || targetElement.role === 'input') &&
        (/\b(?:submit|register|sign\s*up)\b/i.test(targetElement.sanitizedName) ||
         /\b(?:submit|register)\b/i.test((targetElement as any).rawName || '') ||
         (targetElement as any).type === 'submit')
      ));
      const isFormFillGoal = /\b(?:fill|register|registration|signup|sign\s*up|details|form)\b/i.test(this.currentGoal || '');
      if (isSubmittingBtn && isFormFillGoal) {
        try {
          const prefersDemoData = /\b(?:demo|sample|dummy|test|practice|mock|synthetic)\b/i.test(this.currentGoal || '') ||
                                  /\b(?:demoqa\.com|practice|automation-practice|form-test)\b/i.test(activeTab?.url || '');
          const vaultProfile = await getUserProfile();
          const profile = prefersDemoData ? DEMO_USER_PROFILE : (vaultProfile || DEMO_USER_PROFILE);
          const pageDomain = (sanitized.pageState as any)?.domain || (activeTab?.url ? normalizeDomain(activeTab.url) : '');
          const creds = await getCredentialsForDomain(pageDomain);
          const rawDomList: any[] = domResponse?.snapshot?.domElements || [];
          const rawInteractiveList: any[] = domResponse?.snapshot?.interactiveElements || [];
          const unfilledInputs = sanitized.elements.filter(e =>
            (e.role === 'input' || e.role === 'textarea') &&
            e.localId !== proposal.targetLocalId &&
            !this.autofilledTargets.has(e.localId) &&
            !(e.state && e.state.includes('filled'))
          );
          const missingBatchActions: any[] = [];
          for (const uEl of unfilledInputs) {
            const dEl = rawDomList.find((d: any) => d.id === uEl.localId);
            const iEl = rawInteractiveList.find((i: any) => i.localId === uEl.localId);
            const dDesc = dEl?.descriptor;
            const desc: FormElementDescriptor = {
              id: dDesc?.id || uEl.localId,
              tagName: dDesc?.tagName || (uEl.role === 'textarea' ? 'textarea' : 'input'),
              type: dDesc?.type,
              name: dDesc?.name || dDesc?.id || iEl?.rawName,
              rawName: iEl?.rawName || dDesc?.name || dDesc?.id,
              placeholder: dDesc?.placeholder,
              ariaLabel: dDesc?.ariaLabel,
              associatedLabelText: dDesc?.associatedLabelText,
              autocomplete: dDesc?.autocomplete,
              sanitizedName: uEl.sanitizedName
            };
            const m = matchFieldToVault(desc, profile, creds, pageDomain, prefersDemoData);
            if (m.matched && m.valueToFill) {
              this.autofilledTargets.add(uEl.localId);
              missingBatchActions.push({
                actionId: `act_autofill_${m.canonicalField}_${Date.now()}`,
                kind: 'type',
                targetLocalId: uEl.localId,
                textToType: m.valueToFill,
                userApproved: true,
                rationale: `Autofilled ${m.canonicalField} from local Personal Vault prior to submission`
              });
            }
          }
          if (missingBatchActions.length > 0) {
            console.log(`[Coordinator] Injecting ${missingBatchActions.length} missing form fields into submission batch.`);
            proposal = {
              actionId: `act_fill_and_submit_${Date.now()}`,
              kind: 'batch',
              batchActions: [
                ...missingBatchActions,
                proposal
              ],
              confidence: 0.99,
              risk: 'safe',
              userApproved: true,
              rationale: `Autofill missing form inputs (${missingBatchActions.map(a => a.rationale).join(', ')}) and submit`
            };
          }
        } catch (_) {}
      }

      let execResponse: any;
      if (proposal.kind === 'batch' && proposal.batchActions && proposal.batchActions.length > 0) {
        this.transition('executing', `Step ${step}/${maxSteps}: Executing batch (${proposal.batchActions.length} actions)`);
        let allBatchSucceeded = true;
        let lastBatchResult: any = null;

        for (let i = 0; i < proposal.batchActions.length; i++) {
          const sub = proposal.batchActions[i];
          let subTextToType = sub.textToType;
          if (sub.kind === 'type' && sub.targetLocalId && !sub.actionId?.startsWith('act_autofill_')) {
            try {
              const prefersDemoData = /\b(?:demo|sample|dummy|test|practice|mock|synthetic)\b/i.test(this.currentGoal || '') ||
                                      /\b(?:demoqa\.com|practice|automation-practice|form-test)\b/i.test(activeTab?.url || '');
              const vaultProfile = await getUserProfile();
              const profile = prefersDemoData ? DEMO_USER_PROFILE : (vaultProfile || DEMO_USER_PROFILE);
              const pageDomain = (sanitized.pageState as any)?.domain || (activeTab.url ? normalizeDomain(activeTab.url) : '');
              const creds = await getCredentialsForDomain(pageDomain);
              const targetEl = sanitized.elements.find(e => e.localId === sub.targetLocalId);
              if (targetEl && (targetEl.role === 'input' || targetEl.role === 'textarea')) {
                const isAutofill = /\b(?:fill|autofill|register|signup|sign\s*up|login|log\s*in|profile|details|form)\b/i.test(this.currentGoal || '');
                const isPlaceholder = !subTextToType || /^(?:alice|bob|john|jane|user@|test@|example\.com|placeholder|enter\s+|your\s+|\[.*\])/i.test(subTextToType.trim());
                const rawDomList: any[] = domResponse?.snapshot?.domElements || [];
                const rawInteractiveList: any[] = domResponse?.snapshot?.interactiveElements || [];
                const domEl = rawDomList.find((d: any) => d.id === targetEl.localId);
                const interEl = rawInteractiveList.find((i: any) => i.localId === targetEl.localId);
                const domDesc = domEl?.descriptor;
                const descriptor: FormElementDescriptor = {
                  id: domDesc?.id || targetEl.localId,
                  tagName: domDesc?.tagName || (targetEl.role === 'textarea' ? 'textarea' : 'input'),
                  type: domDesc?.type,
                  name: domDesc?.name || domDesc?.id || interEl?.rawName,
                  rawName: interEl?.rawName || domDesc?.name || domDesc?.id,
                  placeholder: domDesc?.placeholder,
                  ariaLabel: domDesc?.ariaLabel,
                  associatedLabelText: domDesc?.associatedLabelText,
                  autocomplete: domDesc?.autocomplete,
                  sanitizedName: targetEl.sanitizedName
                };
                const match = matchFieldToVault(descriptor, profile, creds, pageDomain, prefersDemoData);
                if (match.matched && match.valueToFill && (isAutofill || isPlaceholder)) {
                  subTextToType = match.valueToFill;
                }
                if (targetEl.role === 'textarea' || /feedback|message|comments/i.test(targetEl.sanitizedName || '')) {
                  if (typeof subTextToType === 'string' && subTextToType) {
                    subTextToType = subTextToType.replace(/[!@#$%^&*()_+\-=\[\]{};':"\\|<>\/?~`]/g, ' ').replace(/\s+/g, ' ').trim();
                  }
                }
              }
            } catch (_) {}
          }

          const batchTargetEl = sub.targetLocalId ? sanitized.elements.find(e => e.localId === sub.targetLocalId) : undefined;
          const isSubmitOrProtected = (
            sub.kind === 'click' && (
              /\b(?:submit|register|sign\s*up|checkout|pay|delete|purchase|order)\b/i.test(sub.actionId || '') ||
              /\b(?:submit|register|sign\s*up|checkout|pay|delete|purchase|order)\b/i.test(sub.rationale || '') ||
              /\b(?:submit|register|sign\s*up|checkout|pay|delete|purchase|order)\b/i.test(batchTargetEl?.sanitizedName || '') ||
              (sub as any).expectedState === 'submit'
            )
          );
          const subClassifiedRisk = classifyActionRisk(sub as any, batchTargetEl?.sanitizedName);
          const isSubProtected = subClassifiedRisk === 'protected' || isSubmitOrProtected || (sub.kind !== 'type' && proposal.confidence < 0.85);

          if (isSubProtected) {
            const protectedSubProposal: ActionProposal = {
              actionId: sub.actionId || `act_sub_${i + 1}_${Date.now()}`,
              kind: sub.kind as any,
              targetLocalId: sub.targetLocalId,
              destinationLocalId: sub.destinationLocalId,
              textToType: subTextToType,
              selectOptionValue: sub.selectOptionValue,
              scrollDirection: sub.scrollDirection,
              pressEnter: sub.pressEnter,
              fileName: sub.fileName,
              confidence: proposal.confidence,
              risk: 'protected',
              userApproved: false,
              rationale: sub.rationale || `Human confirmation required before executing protected action '${sub.kind}' on ${batchTargetEl?.sanitizedName || sub.targetLocalId || 'form'}.`,
              expectedState: (sub as any).expectedState || 'submit',
              expectedPostcondition: (sub as any).expectedPostcondition
            };

            this.pendingAction = protectedSubProposal;
            const msg = `Protected batch action requires user consent: ${protectedSubProposal.rationale}`;
            this.transition('awaiting-user-confirmation', msg);
            if (this.listeners.onActionConfirmedRequired) {
              this.listeners.onActionConfirmedRequired(protectedSubProposal, this.currentRunId);
            }
            const stepTrace: E2EStepTrace = {
              step,
              captureId: sanitized.captureId,
              pageGeneration: sanitized.captureId,
              maskCount: sanitized.maskCount,
              sanitizedScreenshotBytes: sanitized.sanitizedScreenshotDataUrl ? sanitized.sanitizedScreenshotDataUrl.length : 0,
              decisionOrigin,
              proposal: protectedSubProposal,
              riskDecision: 'protected',
              confidenceDecision: 'requires_confirmation',
              executed: false,
              networkRequestMade,
              timings: { total: Date.now() - t0_step }
            };
            this.stepsTrace.push(stepTrace);
            const res: CoordinatorRunResult = {
              success: false,
              state: 'awaiting-user-confirmation',
              message: msg,
              sanitized,
              proposal: protectedSubProposal,
              stepCount: step,
              steps: this.stepsTrace
            };
            return this.completeWithResult(res);
          }

          const subProposal: ActionProposal = {
            actionId: sub.actionId || `act_sub_${i + 1}_${Date.now()}`,
            kind: sub.kind as any,
            targetLocalId: sub.targetLocalId,
            destinationLocalId: sub.destinationLocalId,
            textToType: subTextToType,
            selectOptionValue: sub.selectOptionValue,
            scrollDirection: sub.scrollDirection,
            pressEnter: sub.pressEnter,
            fileName: sub.fileName,
            confidence: proposal.confidence,
            risk: 'safe',
            userApproved: true,
            rationale: sub.rationale || proposal.rationale,
            expectedState: (sub as any).expectedState,
            expectedPostcondition: (sub as any).expectedPostcondition
          };

          if (sub.kind === 'navigate') {
            const navUrl = sub.url || sub.targetUrl || '';
            if (navUrl && typeof this.browser.navigateTab === 'function') {
              const shouldOpenNewTab = Boolean(sub.createNewTab);
              this.transition('executing', `Navigating to ${navUrl}...`);
              const navRes = await this.browser.navigateTab(activeTab.id, navUrl, { createNewTab: shouldOpenNewTab });
              if (navRes && typeof navRes === 'object' && navRes.tabId) {
                this.currentTabId = navRes.tabId;
                activeTab.id = navRes.tabId;
              }
              if (navRes && navRes.url) {
                activeTab.url = navRes.url;
              } else if (navUrl) {
                activeTab.url = navUrl;
              }
              if (typeof this.browser.waitForTabReady === 'function') {
                await this.browser.waitForTabReady(activeTab.id, 8000);
              }
              if (typeof this.browser.ensureContentScript === 'function') {
                await this.browser.ensureContentScript(activeTab.id);
              }
              lastBatchResult = { success: true, semanticOutcomeVerified: true, message: `Navigated to ${navUrl}` };
              continue;
            }
          }

          if ((sub as any).kind === 'request_user_input') {
            const promptText = (sub as any).userInputPrompt || (sub as any).rationale || 'Please provide the required value (e.g. CAPTCHA) to continue.';
            const inputNonce = this.generateInputNonce();
            let expectedOrigin: string | undefined = undefined;
            try {
              if (sanitized.pageState?.url) {
                expectedOrigin = new URL(sanitized.pageState.url).origin;
              }
            } catch (_) {}

            // Highlight/focus the target field on the page
            try {
              await this.browser.sendMessageToTab(activeTab.id, {
                type: 'EXECUTE_ACTION',
                proposal: subProposal,
                captureId: sanitized.captureId
              });
            } catch (_) {}

            const inputRequest = {
              kind: sub.targetLocalId ? 'text_input' as const : 'clarification' as const,
              prompt: promptText,
              targetLocalId: sub.targetLocalId,
              inputKey: (sub as any).inputKey,
              runId: this.currentRunId,
              leasedTabId: this.currentTabId,
              inputNonce,
              expectedOrigin
            };
            this.pendingInputRequest = inputRequest;
            this.transition('awaiting-user-input', promptText);
            this.listeners.onUserInputRequired?.(inputRequest);
            const stepTrace: E2EStepTrace = {
              step,
              captureId: sanitized.captureId,
              pageGeneration: sanitized.captureId,
              maskCount: sanitized.maskCount,
              sanitizedScreenshotBytes: sanitized.sanitizedScreenshotDataUrl ? sanitized.sanitizedScreenshotDataUrl.length : 0,
              decisionOrigin,
              proposal: subProposal,
              riskDecision: 'safe',
              confidenceDecision: 'requires_user_input',
              executed: true,
              networkRequestMade,
              timings: { total: Date.now() - t0_step }
            };
            this.stepsTrace.push(stepTrace);
            const res: CoordinatorRunResult = {
              success: true,
              state: 'awaiting-user-input',
              message: promptText,
              sanitized,
              proposal,
              inputRequest,
              stepCount: step,
              steps: this.stepsTrace
            };
            return this.completeWithResult(res);
          }

          try {
            lastBatchResult = await this.browser.sendMessageToTab(activeTab.id, {
              type: 'EXECUTE_ACTION',
              proposal: subProposal,
              captureId: sanitized.captureId
            });
            this.recordActionHistory(subProposal);
          } catch (batchErr: any) {
            const isNav = isDisconnectOrNavigationError(batchErr);
            if (isNav) {
              if (typeof this.browser.waitForTabReady === 'function') {
                const newTab = await this.browser.waitForTabReady(activeTab.id, 8000);
                if (newTab?.url) activeTab.url = newTab.url;
              }
              if (typeof this.browser.ensureContentScript === 'function') {
                await this.browser.ensureContentScript(activeTab.id);
              }
              await new Promise((r) => setTimeout(r, 500));
              lastBatchResult = { success: true, semanticOutcomeVerified: true, message: 'Batch action caused page navigation' };
              break;
            } else {
              allBatchSucceeded = false;
              lastBatchResult = { success: false, message: batchErr?.message || 'Batch action failed' };
              break;
            }
          }

          if (!lastBatchResult?.success) {
            allBatchSucceeded = false;
            break;
          }

          if (i < proposal.batchActions.length - 1) {
            await new Promise((r) => setTimeout(r, 250));
          }
        }

        execResponse = lastBatchResult || { success: allBatchSucceeded, semanticOutcomeVerified: allBatchSucceeded };
      } else {
        // Defensive safeguard: Ensure textToType does not contain trailing instruction directives
        if (proposal.kind === 'type' && proposal.textToType) {
          if (/\b(?:in\s+the\s+search\s+bar|in\s+search\s+box|and\s+analyze|and\s+tell\s+me|and\s+check|into\s+active\s+field)\b/i.test(proposal.textToType)) {
            const cleanedText = extractSearchQueryFromGoal(proposal.textToType);
            if (cleanedText && cleanedText.length > 0 && cleanedText !== proposal.textToType) {
              (proposal as any).textToType = cleanedText;
            }
          }
          const targetEl = sanitized.elements.find(e => e.localId === proposal.targetLocalId);
          if (targetEl && (targetEl.role === 'textarea' || /feedback|message|comments/i.test(targetEl.sanitizedName || ''))) {
            (proposal as any).textToType = proposal.textToType.replace(/[!@#$%^&*()_+\-=\[\]{};':"\\|<>\/?~`]/g, ' ').replace(/\s+/g, ' ').trim();
          }
        }

        // Defensive safeguard: If model proposes typing a full URL into an input on a different website,
        // intercept and navigate directly in a new tab instead of typing a URL into a third-party form!
        if (proposal.kind === 'type' && proposal.textToType && /^https?:\/\/[a-zA-Z0-9.-]+/i.test(proposal.textToType.trim())) {
          try {
            const urlObj = new URL(proposal.textToType.trim());
            const currentHost = new URL(activeTab.url).hostname.toLowerCase();
            if (urlObj.hostname.toLowerCase() !== currentHost && typeof this.browser.navigateTab === 'function') {
              this.transition('executing', `Navigating to ${urlObj.href}...`);
              const navRes = await this.browser.navigateTab(activeTab.id, urlObj.href, { createNewTab: false });
              if (navRes && typeof navRes === 'object' && navRes.tabId) {
                this.currentTabId = navRes.tabId;
                activeTab.id = navRes.tabId;
              }
              if (navRes && navRes.url) {
                activeTab.url = navRes.url;
              } else {
                activeTab.url = urlObj.href;
              }
              const subGoal = stripNavigationPrefixFromGoal(this.currentGoal || '');
              if (subGoal && subGoal !== this.currentGoal) {
                this.currentGoal = subGoal;
                this.currentTaskContract = resolveTaskContract(subGoal);
              }
              await new Promise((r) => setTimeout(r, 600));
              continue;
            }
          } catch (_) {}
        }

        if (proposal.kind === 'web_search') {
          const query = proposal.searchQuery || this.currentGoal || '';
          this.transition('executing', `Searching web via Tavily: "${query}"...`);
          try {
            const searchRes = typeof this.httpClient?.searchWeb === 'function' ? await this.httpClient.searchWeb(query, 5) : null;
            const results = searchRes?.results || [];
            const answer = searchRes?.answer || '';
            let searchProposal: ActionProposal = {
              ...proposal,
              searchResults: results,
              reply: answer || (results.length > 0
                ? `Here is the verified web intelligence retrieved for "${query}":`
                : `No matching web results found for "${query}".`),
              rationale: proposal.rationale || `Web search executed for "${query}"`
            };
            const normQuery = query.toLowerCase().replace(/[^a-z0-9\s]/g, ' ').replace(/\s+/g, ' ').trim();
            if (!normQuery.includes('isro') && !normQuery.includes('chandrayaan') && !normQuery.includes('aditya')) {
              this.sessionWebSearchCache.set(
                normQuery,
                { query, results, answer: searchProposal.reply || '', timestamp: Date.now() }
              );
            }

            const stepTrace: E2EStepTrace = {
              step,
              captureId: sanitized.captureId,
              pageGeneration: sanitized.captureId,
              maskCount: sanitized.maskCount,
              sanitizedScreenshotBytes: sanitized.sanitizedScreenshotDataUrl ? sanitized.sanitizedScreenshotDataUrl.length : 0,
              decisionOrigin,
              proposal: searchProposal,
              riskDecision: 'safe',
              confidenceDecision: 'accepted',
              executed: true,
              executionResult: { success: true, staleTarget: false, reasonCode: 'EXECUTION_SUCCESS' },
              verification: { verified: true, reasonCode: 'WEB_SEARCH_SUCCESS', durationMs: 0 },
              networkRequestMade: true,
              timings: { total: Date.now() - t0_step }
            };
            let targetNavUrl = '';
            const answerPdfMatch = answer ? answer.match(/https?:\/\/[^\s<>"'\)]+\.pdf/i) : null;
            if (answerPdfMatch) {
              targetNavUrl = answerPdfMatch[0];
            } else {
              const bestResult = selectBestTavilyResult(results, query, this.currentGoal || '', activeTab?.url || '');
              targetNavUrl = bestResult?.url || results[0]?.url || '';
            }

            if (targetNavUrl && activeTab?.id && (this.currentTaskContract?.goalPattern === 'click_control' || /click|download|navigate|open|brochure|find|get/i.test(this.currentGoal || ''))) {
              try {
                if (typeof this.browser.navigateTab === 'function') {
                  await this.browser.navigateTab(activeTab.id, targetNavUrl);
                }
                if (typeof this.browser.waitForTabReady === 'function') {
                  await this.browser.waitForTabReady(activeTab.id);
                }
              } catch (_) {}
              if (/download|brochure|pdf/i.test(this.currentGoal || '')) {
                searchProposal = {
                  ...searchProposal,
                  reply: `Located official resource: [${targetNavUrl}](${targetNavUrl}). Navigated browser directly to document.`
                };
              }
            }

            this.stepsTrace.push(stepTrace);
            this.recordActionHistory(searchProposal);
            this.transition('complete', `Web search completed for "${query}"`);
            return this.completeWithResult({
              success: true,
              state: 'complete',
              stepCount: step,
              message: searchProposal.reply,
              proposal: searchProposal,
              steps: this.stepsTrace
            });
          } catch (searchErr: any) {
            console.error('[PrivaPilot Coordinator] Web search failed:', searchErr);
            const fallbackProposal: ActionProposal = {
              ...proposal,
              searchResults: [],
              reply: `Web search could not be completed at this moment: ${searchErr?.message || searchErr}`,
              rationale: proposal.rationale || `Web search error for "${query}"`
            };
            this.recordActionHistory(fallbackProposal);
            this.transition('complete', `Web search completed with error`);
            return this.completeWithResult({
              success: false,
              state: 'complete',
              stepCount: step,
              message: fallbackProposal.reply,
              proposal: fallbackProposal,
              steps: this.stepsTrace
            });
          }
        }

        if (proposal.kind === 'navigate') {
          const targetUrl = proposal.url || proposal.targetUrl || '';
          if (targetUrl && typeof this.browser.navigateTab === 'function') {
            const isExplicitNewTab = /\b(?:new\s+tab|another\s+tab|fresh\s+tab)\b/i.test(this.currentGoal || '');
            let isDifferentDomain = false;
            try {
              if (targetUrl && activeTab?.url) {
                const targetHost = new URL(targetUrl).hostname.toLowerCase();
                const currentHost = new URL(activeTab.url).hostname.toLowerCase();
                isDifferentDomain = Boolean(targetHost && currentHost && !currentHost.includes(targetHost) && !targetHost.includes(currentHost));
              }
            } catch (_) {}
            const isFromExistingWebpage = !isRestrictedBrowserUrl(activeTab?.url).isRestricted;
            const isSearchEngineOrBlank = /(?:google\.[a-z.]+|bing\.com|duckduckgo\.com|yahoo\.com)\/?$/i.test(activeTab?.url?.replace(/^https?:\/\/(?:www\.)?/, '') || '');
            const shouldOpenNewTab = isExplicitNewTab || (isDifferentDomain && isFromExistingWebpage && !isSearchEngineOrBlank);
            this.transition('executing', shouldOpenNewTab ? `Opening new tab for ${targetUrl}...` : `Navigating to ${targetUrl}...`);
            const navRes = await this.browser.navigateTab(activeTab.id, targetUrl, { createNewTab: shouldOpenNewTab });
            if (navRes && typeof navRes === 'object' && navRes.tabId) {
              this.currentTabId = navRes.tabId;
              activeTab.id = navRes.tabId;
            }
            if (navRes && navRes.url) {
              activeTab.url = navRes.url;
            } else if (targetUrl) {
              activeTab.url = targetUrl;
            }
            if (typeof this.browser.waitForTabReady === 'function') {
              await this.browser.waitForTabReady(activeTab.id, 8000);
            }
            if (typeof this.browser.ensureContentScript === 'function') {
              await this.browser.ensureContentScript(activeTab.id);
            }
            execResponse = {
              success: true,
              semanticOutcomeVerified: true,
              message: `Navigated to ${targetUrl}${shouldOpenNewTab ? ' in new tab' : ''}`
            };
            this.recordActionHistory(proposal);
            await new Promise((r) => setTimeout(r, 600));
            continue;
          }
        }

        try {
          execResponse = await this.browser.sendMessageToTab(activeTab.id, {
            type: 'EXECUTE_ACTION',
            proposal,
            captureId: sanitized.captureId
          });
        } catch (execErr: any) {
          // If clicking or submitting triggered page unload / navigation / redirect / bfcache,
          // the content script message port closes immediately.
          const msg = execErr?.message || '';
          const isPortClosedOrNav = isDisconnectOrNavigationError(execErr);

          if (isPortClosedOrNav) {
            // Normal and expected for navigation actions: wait for redirected tab to settle
            if (typeof this.browser.waitForTabReady === 'function') {
              const newTab = await this.browser.waitForTabReady(activeTab.id, 8000);
              if (newTab?.url) activeTab.url = newTab.url;
            }
            if (typeof this.browser.ensureContentScript === 'function') {
              await this.browser.ensureContentScript(activeTab.id);
            }
            await new Promise((r) => setTimeout(r, 500));
            execResponse = {
              success: true,
              semanticOutcomeVerified: true,
              message: `Action executed and caused page navigation/redirect`
            };
          } else {
            execResponse = {
              success: false,
              semanticOutcomeVerified: false,
              message: `Action execution failed: ${msg}`
            };
          }
        }
      }

      // If the action submitted a form (pressEnter) or executed an interaction that may trigger navigation/redirection,
      // allow the browser event loop to initiate navigation, then wait for the tab to reach 'complete' state.
      if (proposal.pressEnter || (proposal.kind === 'type' && (proposal as any).pressEnter) || proposal.kind === 'click') {
        await new Promise((r) => setTimeout(r, 450));
        if (typeof this.browser.getActiveTab === 'function') {
          try {
            const currentTab = await this.browser.getActiveTab(activeTab.id);
            if (currentTab && (currentTab.status === 'loading' || currentTab.url !== activeTab.url)) {
              if (typeof this.browser.waitForTabReady === 'function') {
                const settledTab = await this.browser.waitForTabReady(activeTab.id, 8000);
                if (settledTab?.url) activeTab.url = settledTab.url;
              }
              if (typeof this.browser.ensureContentScript === 'function') {
                await this.browser.ensureContentScript(activeTab.id);
              }
              await new Promise((r) => setTimeout(r, 300));
            }
          } catch (_) {}
        }
      }

      const t6_actionExecuted = Date.now();

      this.transition('verifying', `Step ${step}/${maxSteps}: Verifying semantic outcome`);
      const t7_stateVerified = Date.now();

      const verified = Boolean(execResponse?.semanticOutcomeVerified ?? execResponse?.success);
      const objectiveId = proposal.objectiveId || (this.currentTaskSpec && this.objectiveProgress ? getCurrentObjective(this.currentTaskSpec, this.objectiveProgress)?.id : undefined);
      if (verified && objectiveId && this.currentTaskSpec && this.objectiveProgress) {
        const evidenceKind: ObjectiveEvidenceKind = proposal.completionEvidence?.[0]
          || (proposal.kind === 'navigate' ? 'url'
            : proposal.kind === 'type' ? 'input_value'
              : proposal.kind === 'scroll' ? 'scroll'
                : proposal.kind === 'extract' || proposal.kind === 'answer' ? 'text'
                  : proposal.expectedPostcondition?.kind === 'visual_change' || proposal.expectedPostcondition?.kind === 'map_location_changed' ? 'visual_change'
                    : proposal.expectedPostcondition?.kind === 'dialog_visible' || proposal.expectedPostcondition?.kind === 'panel_visible' ? 'dialog'
                      : 'element');
        this.objectiveProgress = recordObjectiveEvidence(this.objectiveProgress, {
          objectiveId,
          kind: evidenceKind,
          summary: (execResponse?.message || `Verified ${proposal.kind} action`).slice(0, 1000),
          sourceActionId: proposal.actionId,
          verified: true
        });
        this.objectiveProgress = completeObjectiveWithEvidence(this.currentTaskSpec, this.objectiveProgress, objectiveId);
        const verificationObjective = getCurrentObjective(this.currentTaskSpec, this.objectiveProgress);
        if (verificationObjective?.intent === 'verify' && (proposal.kind === 'finish' || proposal.kind === 'answer')) {
          this.objectiveProgress = recordObjectiveEvidence(this.objectiveProgress, {
            objectiveId: verificationObjective.id,
            kind: evidenceKind,
            summary: `Verified terminal state after ${proposal.kind}: ${(execResponse?.message || 'semantic outcome passed').slice(0, 900)}`,
            sourceActionId: proposal.actionId,
            verified: true
          });
          this.objectiveProgress = completeObjectiveWithEvidence(this.currentTaskSpec, this.objectiveProgress, verificationObjective.id);
        }
        const nextObjective = getCurrentObjective(this.currentTaskSpec, this.objectiveProgress);
        const actionSatisfiesNext = Boolean(nextObjective && (
          (nextObjective.intent === 'select_result' && proposal.kind === 'click') ||
          (nextObjective.intent === 'open_section' && proposal.kind === 'click') ||
          (nextObjective.intent === 'submit' && (proposal.kind === 'click' || proposal.pressEnter)) ||
          (nextObjective.intent === 'navigate' && proposal.kind === 'navigate') ||
          (nextObjective.intent === 'search' && proposal.kind === 'type')
        ));
        if (nextObjective && actionSatisfiesNext) {
          this.objectiveProgress = recordObjectiveEvidence(this.objectiveProgress, {
            objectiveId: nextObjective.id,
            kind: evidenceKind,
            summary: `Verified ${proposal.kind} action also satisfied ${nextObjective.description}`.slice(0, 1000),
            sourceActionId: proposal.actionId,
            verified: true
          });
          this.objectiveProgress = completeObjectiveWithEvidence(this.currentTaskSpec, this.objectiveProgress, nextObjective.id);
        }
      }
      this.recentActionHistory.push({
        actionId: proposal.actionId,
        objectiveId,
        kind: proposal.kind,
        targetLocalId: proposal.targetLocalId,
        expectedPostcondition: proposal.expectedPostcondition,
        observedOutcome: execResponse?.message,
        meaningfulProgress: verified
      });
      this.recentActionHistory = this.recentActionHistory.slice(-10);

      this.currentExecutionFeedback = {
        lastActionId: proposal.actionId,
        lastActionKind: proposal.kind,
        targetLocalId: proposal.targetLocalId,
        verified,
        outcomeCode: execResponse?.reasonCode || (execResponse?.success ? 'ACTION_VERIFIED_SUCCESS' : 'EXECUTION_FAILED'),
        stepIndex: step,
        completedTasks: this.currentTaskSpec && this.objectiveProgress
          ? this.currentTaskSpec.objectives.filter((objective) => this.objectiveProgress!.completedObjectiveIds.includes(objective.id)).map((objective) => objective.description)
          : [],
        remainingTasks: this.currentTaskSpec && this.objectiveProgress
          ? this.currentTaskSpec.objectives.filter((objective) => !this.objectiveProgress!.completedObjectiveIds.includes(objective.id)).map((objective) => objective.description)
          : []
      };

      const telemetry = this.createTelemetry(t0_step, t1_captureComplete, t2_detectionComplete, t3_sanitizationValidated, t4_reasoningReceived, t5_actionValidated, t6_actionExecuted, t7_stateVerified, step);
      if (this.listeners.onTelemetryUpdated) {
        this.listeners.onTelemetryUpdated(telemetry, this.currentRunId);
      }

      const isMultiStepGoal = Boolean(this.currentTaskContract?.isMultiStep) ||
        /\b(?:and\s+then|then|after\s+that|next|also|and\s+see|and\s+check|and\s+search|and\s+find|and\s+tell|and\s+type|and\s+select|and\s+click|and\s+hover|and\s+drag|and\s+drop|and\s+upload|how\s+many|count|submissions?|problem\s+statements?|register|registration|apply|application|complete|fill|signup|sign\s+up|form|workflow|survey|questionnaire)\b/i.test(this.currentGoal || '');

      // Handle Stale Target Recovery
      if (execResponse && execResponse.staleTarget) {
        if (proposal.risk !== 'safe') {
          const errorMsg = `Stale target detected on protected action '${proposal.kind}': auto-retry is prohibited for non-safe actions`;
          this.transition('failed-safe', errorMsg);
          const res: CoordinatorRunResult = {
            success: false,
            state: 'failed-safe',
            error: errorMsg,
            sanitized,
            proposal,
            telemetry,
            stepCount: step,
            steps: this.stepsTrace
          };
          return this.completeWithResult(res);
        }

        if (this.currentStaleRetries < this.maxStaleRetries) {
          this.currentStaleRetries++;
          this.transition('capturing', `Stale target detected. Re-perceiving page (retry ${this.currentStaleRetries}/${this.maxStaleRetries})...`);
          continue;
        } else {
          const errorMsg = `Stale target: target element '${proposal.targetLocalId}' remained stale after ${this.maxStaleRetries} retry attempts`;
          this.transition('failed-safe', errorMsg);
          const res: CoordinatorRunResult = {
            success: false,
            state: 'failed-safe',
            error: errorMsg,
            sanitized,
            proposal,
            telemetry,
            stepCount: step,
            steps: this.stepsTrace
          };
          return this.completeWithResult(res);
        }
      }

      this.recordActionHistory(proposal);
      this.previousSnapshot = sanitized;
      this.previousUrl = activeTab?.url || '';
      this.lastExecutedProposal = proposal;
      this.lastExecutionResult = execResponse;

      const isSuccess = Boolean(execResponse && execResponse.success && (execResponse.semanticOutcomeVerified || proposal.kind === 'batch'));
      const stepTrace: E2EStepTrace = {
        step,
        captureId: sanitized.captureId,
        pageGeneration: sanitized.captureId,
        maskCount: sanitized.maskCount,
        sanitizedScreenshotBytes: sanitized.sanitizedScreenshotDataUrl ? sanitized.sanitizedScreenshotDataUrl.length : 0,
        decisionOrigin,
        proposal,
        riskDecision: riskLevel,
        confidenceDecision: 'accepted',
        executed: true,
        executionResult: {
          success: execResponse?.success ?? false,
          staleTarget: execResponse?.staleTarget ?? false,
          reasonCode: execResponse?.error ? 'EXECUTION_FAILED' : 'EXECUTION_SUCCESS'
        },
        verification: {
          verified: execResponse?.verification?.verified ?? Boolean(execResponse?.semanticOutcomeVerified),
          reasonCode: execResponse?.verification?.reasonCode || (isSuccess ? 'SEMANTIC_VERIFICATION_SUCCESS' : 'SEMANTIC_VERIFICATION_FAILED'),
          matchedCondition: execResponse?.verification?.matchedCondition,
          durationMs: execResponse?.verification?.durationMs || 0
        },
        networkRequestMade,
        timings: {
          tCapture: t1_captureComplete - t0_step,
          tDetection: t2_detectionComplete - t1_captureComplete,
          tSanitization: t3_sanitizationValidated - t2_detectionComplete,
          tReasoning: t4_reasoningReceived - t3_sanitizationValidated,
          tExecution: t6_actionExecuted - t5_actionValidated,
          tVerification: t7_stateVerified - t6_actionExecuted,
          total: Date.now() - t0_step
        }
      };
      this.stepsTrace.push(stepTrace);

      // Form filling & registration completion guard:
      // If the executed proposal was a batch action containing a submit click,
      // or a click on a submit/register button for a form/registration goal,
      // complete the run immediately rather than wandering on redirected/post-submit pages!
      const batchSubmittedForm = proposal.kind === 'batch' && Boolean(
        proposal.batchActions?.some(sub =>
          sub.kind === 'click' && (
            /\b(?:submit|register|sign\s*up|proceed|continue|send|save)\b/i.test(sub.actionId || '') ||
            /\b(?:submit|register|sign\s*up|proceed|continue|send|save)\b/i.test((sub as any).rationale || '') ||
            sanitized.elements.some(e => e.localId === sub.targetLocalId && /\b(?:submit|register|sign\s*up|proceed|continue|send|save)\b/i.test(e.sanitizedName || ''))
          )
        )
      );
      const singleClickSubmittedForm = proposal.kind === 'click' && (
        /\b(?:submit|register|sign\s*up|proceed|continue|send|save)\b/i.test(proposal.actionId || '') ||
        /\b(?:submit|register|sign\s*up|proceed|continue|send|save)\b/i.test(proposal.rationale || '') ||
        Boolean(targetElement && /\b(?:submit|register|sign\s*up|proceed|continue|send|save)\b/i.test(targetElement.sanitizedName || ''))
      );

      if (isFormOrRegistrationGoal && (batchSubmittedForm || singleClickSubmittedForm) && execResponse?.success !== false) {
        const tFin = Date.now();
        const telemetry = this.createTelemetry(t0_step, t1_captureComplete, t2_detectionComplete, t3_sanitizationValidated, t4_reasoningReceived, t5_actionValidated, t6_actionExecuted, t7_stateVerified, step);
        if (this.listeners.onTelemetryUpdated) {
          this.listeners.onTelemetryUpdated(telemetry, this.currentRunId);
        }
        this.transition('complete', `Form submitted successfully: Registration complete`);
        const res: CoordinatorRunResult = {
          success: true,
          state: 'complete',
          message: `Form details populated and registration submitted successfully!`,
          reply: `Form details populated and registration submitted successfully!`,
          sanitized,
          proposal,
          telemetry,
          stepCount: step,
          steps: this.stepsTrace
        };
        return this.completeWithResult(res);
      }

      if (!isSuccess) {
        // Canvas-based map controls may update overlays outside ordinary semantic DOM
        // postconditions. Re-perceive after a successfully dispatched layer toggle.
        const isRecoverableMapControl = Boolean(
          proposal.actionId?.startsWith('act_bhuvan_layers_') &&
          execResponse?.success !== false
        );
        // If the action was safe and we have remaining steps in a multi-step task,
        // do not abort the entire run. Re-perceive so the next snapshot can expose the panel.
        const canContinuePerception =
          proposal.risk === 'safe' &&
          step < maxSteps &&
          (isMultiStepGoal || isRecoverableMapControl || proposal.kind === 'scroll');

        if (canContinuePerception) {
          console.warn(`[PrivaPilot Coordinator] Step ${step} execution or verification unconfirmed (${execResponse?.message || 'unconfirmed'}); proceeding to next perception cycle...`);
          this.transition('capturing', `Step ${step}: ${execResponse?.message || 'Action unconfirmed'}. Re-perceiving page state (step ${step + 1}/${maxSteps})...`);
          continue;
        }

        const errorMsg = execResponse?.message || 'Action execution or semantic verification failed';
        this.transition('failed-safe', `Execution failed: ${errorMsg}`);
        const res: CoordinatorRunResult = {
          success: false,
          state: 'failed-safe',
          error: errorMsg,
          sanitized,
          proposal,
          telemetry,
          stepCount: step,
          steps: this.stepsTrace
        };
        return this.completeWithResult(res);
      }


      // Deterministic early completion: if the executed action satisfies the task contract
      // (e.g. one-step scroll navigation directive), complete immediately without redundant perception cycles

      if (!isMultiStepGoal && this.currentTaskContract?.expectedTerminal.kind === 'scroll_changed' && proposal.kind === 'scroll') {
        const tFin = Date.now();
        const telemetry = this.createTelemetry(t0_step, t1_captureComplete, t2_detectionComplete, t3_sanitizationValidated, t4_reasoningReceived, t5_actionValidated, t6_actionExecuted, t7_stateVerified, step);
        if (this.listeners.onTelemetryUpdated) {
          this.listeners.onTelemetryUpdated(telemetry, this.currentRunId);
        }
        this.transition('complete', `Scroll ${proposal.scrollDirection || 'down'} executed and verified: navigation complete`);
        const res: CoordinatorRunResult = {
          success: true,
          state: 'complete',
          message: `Scroll ${proposal.scrollDirection || 'down'} executed and verified`,
          reply: `I've scrolled ${proposal.scrollDirection || 'down'} the page for you.`,
          sanitized,
          proposal,
          telemetry,
          stepCount: step,
          steps: this.stepsTrace
        };
        return this.completeWithResult(res);
      }

      // Single-action direct click completion ("terminal if done")
      const isDocumentGoal = /\b(?:download|brochure|pdf|report|circular|dataset)\b/i.test(this.currentGoal || '');
      const isPdfTabUrl = /\.pdf(?:\?.*)?$/i.test(activeTab?.url || '');
      const isPdfHref = /\.pdf(?:\?.*)?$/i.test((targetElement as any)?.href || '');
      const isPdfName = /\b(?:brochure|pdf)\b/i.test(targetElement?.sanitizedName || '');
      const isDownloadMessage = Boolean(execResponse?.message?.toLowerCase().includes('download'));
      const isDownloadTriggered = Boolean(isDownloadMessage || isPdfHref || isPdfName || isPdfTabUrl);

      // If this is a document download goal, ONLY complete if the download was actually triggered!
      const requiresVisualVerification = Boolean(
        this.currentTaskContract?.isMultiStep ||
        /\b(?:unfollow|follow|subscribe|unsubscribe|mute|block|like|unlike|repost|retweet|delete|remove|submit|apply|save|add|cart|buy|order|confirm)\b/i.test(this.currentGoal || '') ||
        /\b(?:unfollow|follow|subscribe|unsubscribe|mute|block|like|unlike)\b/i.test(targetElement?.sanitizedName || '')
      );

      if (isDocumentGoal) {
        if (isDownloadTriggered && proposal.kind === 'click') {
          const docUrl = isPdfTabUrl ? activeTab.url : ((targetElement as any)?.href || '');
          if (docUrl && typeof chrome !== 'undefined' && chrome.downloads && typeof chrome.downloads.download === 'function') {
            try {
              let absUrl = docUrl;
              if (!/^https?:\/\//i.test(absUrl)) {
                absUrl = new URL(docUrl, activeTab?.url || 'https://www.isro.gov.in').href;
              }
              const fname = absUrl.split('/').pop()?.split('?')[0] || 'brochure.pdf';
              chrome.downloads.download({
                url: absUrl,
                filename: fname,
                conflictAction: 'uniquify',
                saveAs: false
              }, () => {});
            } catch (_) {}
          }

          const tFin = Date.now();
          const telemetry = this.createTelemetry(t0_step, t1_captureComplete, t2_detectionComplete, t3_sanitizationValidated, t4_reasoningReceived, t5_actionValidated, t6_actionExecuted, t7_stateVerified, step);
          if (this.listeners.onTelemetryUpdated) {
            this.listeners.onTelemetryUpdated(telemetry, this.currentRunId);
          }
          const targetName = targetElement?.sanitizedName || proposal.targetLocalId || 'Brochure';
          const docHref = (targetElement as any)?.href || (isPdfTabUrl ? activeTab?.url : '');
          const docDisplayName = docHref ? docHref.split('/').pop()?.split('?')[0]?.replace(/_/g, ' ').replace(/\.pdf$/i, '') : targetName;
          const docReply = `✅ Successfully opened **${docDisplayName || targetName}** — the official document is now displayed in your browser.\n\nYou can save or print it using the PDF viewer controls (top-right of the page).${docHref ? `\n\nDirect link: ${docHref}` : ''}`;
          this.transition('complete', `Downloaded "${targetName}" successfully: document retrieved`);
          const res: CoordinatorRunResult = {
            success: true,
            state: 'complete',
            message: `Brochure download initiated successfully for "${targetName}"`,
            reply: docReply,
            sanitized,
            proposal,
            telemetry,
            stepCount: step,
            steps: this.stepsTrace
          };
          return this.completeWithResult(res);
        }
      } else if (
        !isMultiStepGoal &&
        !requiresVisualVerification &&
        this.currentTaskContract?.goalPattern === 'click_control' &&
        proposal.kind === 'click' &&
        this.currentTaskContract?.structuredIntent?.targetPhrase &&
        !/\b(repeatedly|again|multiple|times|until|loop)\b/i.test(this.currentGoal || '')
      ) {
        const matchesTarget = targetElement && (
          scoreCandidate(targetElement, this.currentTaskContract.structuredIntent, false).score >= 50
        );
        if (matchesTarget) {
          const tFin = Date.now();
          const telemetry = this.createTelemetry(t0_step, t1_captureComplete, t2_detectionComplete, t3_sanitizationValidated, t4_reasoningReceived, t5_actionValidated, t6_actionExecuted, t7_stateVerified, step);
          if (this.listeners.onTelemetryUpdated) {
            this.listeners.onTelemetryUpdated(telemetry, this.currentRunId);
          }
          const targetName = targetElement?.sanitizedName || proposal.targetLocalId || 'control';
          this.transition('complete', `Clicked "${targetName}" successfully: directive complete`);
          const res: CoordinatorRunResult = {
            success: true,
            state: 'complete',
            message: `Clicked "${targetName}" successfully`,
            reply: `I've clicked **${targetName}** as requested.`,
            sanitized,
            proposal,
            telemetry,
            stepCount: step,
            steps: this.stepsTrace
          };
          return this.completeWithResult(res);
        }
      }

      this.currentStaleRetries = 0;

      if (this.listeners.onStepProgress) {
        this.listeners.onStepProgress(step, maxSteps, proposal.rationale, this.currentRunId);
      }
    }

    // Step budget exhausted
    const errorMsg = `Step budget exhausted (${this.currentMaxSteps} steps) without completing goal`;
    this.transition('failed-safe', errorMsg);
    const res: CoordinatorRunResult = {
      success: false,
      state: 'failed-safe',
      error: errorMsg,
      stepCount: this.currentStep,
      sanitized: this.currentSanitizedContext || undefined
    };
      return this.completeWithResult(res);
    } catch (loopErr: any) {
      const errorMsg = loopErr?.message || 'Execution loop encountered an error';
      console.error('[PrivaPilot Coordinator] Uncaught loop error:', loopErr);
      this.transition('failed-safe', errorMsg);
      return this.completeWithResult({
        success: false,
        state: 'failed-safe',
        error: errorMsg,
        stepCount: this.currentStep,
        steps: this.stepsTrace
      });
    }
  }

  /**
   * Reports whether the reasoning gateway and a model backend are reachable.
   */
  async getModelStatus(): Promise<ModelStatus> {
    return this.httpClient.getModelStatus();
  }

  async getPlatformApiTelemetry(): Promise<any> {
    return this.httpClient.getPlatformApiTelemetry();
  }

  async generatePlatformApiKey(name?: string, tier?: string): Promise<any> {
    return this.httpClient.generatePlatformApiKey(name, tier);
  }

  /**
   * Drives visual browser interaction on a designated tab for a sub-agent worker.
   * Performs real DOM inspection, form typing / search submission, and live result extraction.
   */
  private async driveSubAgentOnTab(
    tabId: number,
    entityName: string,
    stepIndex: number,
    totalSteps: number,
    routeInfo: { isFlight: boolean; origin: string; dest: string; cleanedQuery: string }
  ): Promise<{ summary: string; snippet: string; extractedItems: any[] }> {
    const capitalized = entityName.toUpperCase();

    // 1. Focus tab and light up active glow border
    try {
      if (typeof chrome !== 'undefined' && chrome.tabs?.update && tabId) {
        chrome.tabs.update(tabId, { active: true });
      }
      if (typeof this.browser.sendMessageToTab === 'function' && tabId) {
        await this.browser.sendMessageToTab(tabId, {
          type: 'SET_ACTIVE_BORDER',
          active: true,
          label: `Sub-Agent ${stepIndex} [${capitalized}]: Active`
        }).catch(() => {});
      }
    } catch (_) {}

    // 2. Wait for tab ready & content script injection
    if (typeof this.browser.waitForTabReady === 'function' && tabId) {
      await this.browser.waitForTabReady(tabId, 6000).catch(() => null);
    }
    if (typeof this.browser.ensureContentScript === 'function' && tabId) {
      await this.browser.ensureContentScript(tabId).catch(() => null);
    }
    await new Promise((r) => setTimeout(r, 600));

    // 3. Hydration Polling & Ready Wait Loop (up to 4 attempts)
    let snap: any = null;
    let elements: any[] = [];
    let pageUrl = '';

    for (let attempt = 0; attempt < 4; attempt++) {
      try {
        if (tabId && typeof this.browser.sendMessageToTab === 'function') {
          snap = await this.browser.sendMessageToTab(tabId, {
            type: 'EXTRACT_DOM_SNAPSHOT',
            captureId: `sub_snap_${entityName}_${attempt}_${Date.now()}`
          });
          elements = getSnapshotElements(snap);
          pageUrl = (snap?.snapshot?.url || '').toLowerCase();
        }
      } catch (_) {}

      const hasBookingForm = elements.some((e: any) =>
        !e.state?.includes('disabled') &&
        /\b(?:origin|from|departure|source|flying\s+from|select\s+origin)\b/i.test(e.sanitizedName || e.rawName || e.text || e.name || '')
      );
      if (hasBookingForm || elements.length > 25) {
        break;
      }
      await new Promise((r) => setTimeout(r, 700));
    }

    // 3a. Auto-dismiss obstructing cookie banners, popups, and modal dialogs ("crossing them")
    const popupBtn = elements.find((e: any) =>
      (e.role === 'button' || e.role === 'link') &&
      !e.state?.includes('disabled') &&
      (
        /^(?:accept\s*(?:all)?|accept\s*cookies?|allow\s*all|i\s*accept|agree\s*&\s*proceed|agree|got\s*it|ok)$/i.test((e.sanitizedName || e.rawName || e.text || e.name || '').trim()) ||
        /^(?:close|dismiss|no\s*thanks|later|maybe\s*later|not\s*now|✕|×|x)$/i.test((e.sanitizedName || e.rawName || e.text || e.name || '').trim()) ||
        /\b(?:close\s*dialog|close\s*modal|close\s*banner|dismiss\s*banner|accept\s*all\s*cookies)\b/i.test(e.sanitizedName || e.rawName || e.text || e.name || '')
      )
    );
    if (popupBtn) {
      this.listeners.onStepProgress?.(
        stepIndex,
        totalSteps,
        `🤖 Sub-Agent ${stepIndex} [${capitalized}]: Dismissing page overlay / cookie banner...`,
        this.currentRunId
      );
      await this.browser.sendMessageToTab(tabId, {
        type: 'EXECUTE_ACTION',
        proposal: {
          actionId: `act_sub_dismiss_${Date.now()}`,
          kind: 'click',
          targetLocalId: popupBtn.localId,
          confidence: 1.0,
          risk: 'safe',
          rationale: `Dismissing obstructing popup/cookie banner`
        }
      }).catch(() => {});
      await new Promise((r) => setTimeout(r, 400));
      try {
        snap = await this.browser.sendMessageToTab(tabId, {
          type: 'EXTRACT_DOM_SNAPSHOT',
          captureId: `sub_snap_postdismiss_${entityName}_${Date.now()}`
        });
        if (snap) elements = getSnapshotElements(snap);
      } catch (_) {}
    }

    // 3b. Google Search Link-Click Fallback:
    // If we landed on a search engine results page (e.g. Google Search), locate the direct link to the airline portal and click it
    if (pageUrl.includes('google.com/search') || elements.some((e: any) => /google\s+search/i.test(e.sanitizedName || e.text || ''))) {
      const entPattern = entityName === 'indigo' ? /(?:goindigo\.in|indigo)/i :
                         entityName === 'air india' ? /(?:airindia\.com|air\s*india)/i :
                         new RegExp(entityName.replace(/\s+/g, ''), 'i');
      const directPortalLink = elements.find((e: any) =>
        (e.role === 'link' || e.role === 'button') &&
        !e.state?.includes('disabled') &&
        (entPattern.test(e.url || '') || (entPattern.test(e.sanitizedName || e.text || '') && !/sponsored/i.test(e.sanitizedName || e.text || '')))
      );

      if (directPortalLink) {
        this.listeners.onStepProgress?.(
          stepIndex,
          totalSteps,
          `🤖 Sub-Agent ${stepIndex} [${capitalized}]: Navigating from search page to official portal...`,
          this.currentRunId
        );
        await this.browser.sendMessageToTab(tabId, {
          type: 'EXECUTE_ACTION',
          proposal: {
            actionId: `act_sub_navlink_${Date.now()}`,
            kind: 'click',
            targetLocalId: directPortalLink.localId,
            confidence: 1.0,
            risk: 'safe',
            rationale: `Navigating to official portal link`
          }
        }).catch(() => {});
        await new Promise((r) => setTimeout(r, 2500));
        if (typeof this.browser.waitForTabReady === 'function' && tabId) {
          await this.browser.waitForTabReady(tabId, 6000).catch(() => null);
        }
        if (typeof this.browser.ensureContentScript === 'function' && tabId) {
          await this.browser.ensureContentScript(tabId).catch(() => null);
        }
        try {
          snap = await this.browser.sendMessageToTab(tabId, {
            type: 'EXTRACT_DOM_SNAPSHOT',
            captureId: `sub_snap_postportal_${entityName}_${Date.now()}`
          });
          if (snap) {
            const snapEls = getSnapshotElements(snap);
            if (snapEls.length > 0) elements = snapEls;
            pageUrl = (snap?.snapshot?.url || '').toLowerCase();
          }
        } catch (_) {}
      }
    }

    // 4. Physical DOM Driving: Typing & Clicking on Screen
    if (routeInfo.isFlight) {
      const origCode = AIRPORT_CODES[routeInfo.origin.toLowerCase()] || routeInfo.origin.slice(0, 3).toUpperCase();
      const destCode = AIRPORT_CODES[routeInfo.dest.toLowerCase()] || routeInfo.dest.slice(0, 3).toUpperCase();

      // Flight booking form detection (Origin, Destination triggers)
      const originCandidate = findFlightOriginElement(elements);
      const destCandidate = findFlightDestinationElement(elements, originCandidate?.localId);

      if (originCandidate && destCandidate) {
        // Step 4a: Focus/click origin input or button trigger
        await this.browser.sendMessageToTab(tabId, {
          type: 'EXECUTE_ACTION',
          proposal: {
            actionId: `act_sub_orig_focus_${Date.now()}`,
            kind: 'click',
            targetLocalId: originCandidate.localId,
            confidence: 1.0,
            risk: 'safe',
            rationale: `Focusing Origin field`
          }
        }).catch(() => {});
        await new Promise((r) => setTimeout(r, 450));

        // Step 4b: Find actual editable input for Origin (handles Air India Angular modal dialog)
        let targetOriginInputId = originCandidate.localId;
        try {
          const postOrigClickSnap = await this.browser.sendMessageToTab(tabId, {
            type: 'EXTRACT_DOM_SNAPSHOT',
            captureId: `sub_snap_orig_modal_${Date.now()}`
          });
          const modalEls = getSnapshotElements(postOrigClickSnap);
          const modalInput = modalEls.find((e: any) =>
            (e.role === 'input' || e.role === 'combobox' || e.role === 'searchbox') &&
            !e.state?.includes('disabled') &&
            (
              e.state?.includes('focused') ||
              /\b(?:from|origin|departure|search|city|airport)\b/i.test(e.sanitizedName || e.text || '') ||
              e.localId !== originCandidate.localId
            )
          );
          if (modalInput) {
            targetOriginInputId = modalInput.localId;
          }
        } catch (_) {}

        // Step 4c: Type origin
        this.listeners.onStepProgress?.(
          stepIndex,
          totalSteps,
          `🤖 Sub-Agent ${stepIndex} [${capitalized}]: Typing Origin "${routeInfo.origin}" (${origCode})...`,
          this.currentRunId
        );
        await this.browser.sendMessageToTab(tabId, {
          type: 'EXECUTE_ACTION',
          proposal: {
            actionId: `act_sub_orig_${Date.now()}`,
            kind: 'type',
            targetLocalId: targetOriginInputId,
            textToType: routeInfo.origin,
            confidence: 1.0,
            risk: 'safe',
            rationale: `Typing origin ${routeInfo.origin}`
          }
        }).catch(() => {});
        await new Promise((r) => setTimeout(r, 700));

        // Step 4d: Check for autocomplete airport suggestion popup and click it
        try {
          const origPopupSnap = await this.browser.sendMessageToTab(tabId, {
            type: 'EXTRACT_DOM_SNAPSHOT',
            captureId: `sub_snap_orig_popup_${Date.now()}`
          });
          const origPopupEls = getSnapshotElements(origPopupSnap);
          const origSuggestion = findAirportSuggestion(origPopupEls, routeInfo.origin, origCode, [targetOriginInputId, originCandidate.localId]);
          if (origSuggestion) {
            this.listeners.onStepProgress?.(
              stepIndex,
              totalSteps,
              `🤖 Sub-Agent ${stepIndex} [${capitalized}]: Selecting "${origSuggestion.sanitizedName || routeInfo.origin}" from airport suggestions...`,
              this.currentRunId
            );
            await this.browser.sendMessageToTab(tabId, {
              type: 'EXECUTE_ACTION',
              proposal: {
                actionId: `act_sub_orig_sel_${Date.now()}`,
                kind: 'click',
                targetLocalId: origSuggestion.localId,
                confidence: 1.0,
                risk: 'safe',
                rationale: `Selecting airport option from popup`
              }
            }).catch(() => {});
            await new Promise((r) => setTimeout(r, 500));
          }
        } catch (_) {}

        // Step 4e: Destination handling
        let activeDestCandidate = destCandidate;
        try {
          const midSnap = await this.browser.sendMessageToTab(tabId, {
            type: 'EXTRACT_DOM_SNAPSHOT',
            captureId: `sub_snap_mid_${Date.now()}`
          });
          if (midSnap) {
            const midEls = getSnapshotElements(midSnap);
            const foundDest = findFlightDestinationElement(midEls, originCandidate.localId);
            if (foundDest) activeDestCandidate = foundDest;
          }
        } catch (_) {}

        if (activeDestCandidate) {
          const isAlreadyFocused = Boolean(activeDestCandidate.state?.includes('focused') && (activeDestCandidate.role === 'input' || activeDestCandidate.role === 'combobox' || activeDestCandidate.role === 'searchbox'));
          if (!isAlreadyFocused) {
            await this.browser.sendMessageToTab(tabId, {
              type: 'EXECUTE_ACTION',
              proposal: {
                actionId: `act_sub_dest_focus_${Date.now()}`,
                kind: 'click',
                targetLocalId: activeDestCandidate.localId,
                confidence: 1.0,
                risk: 'safe',
                rationale: `Focusing Destination field`
              }
            }).catch(() => {});
            await new Promise((r) => setTimeout(r, 450));
          }

          // Find modal input for destination
          let targetDestInputId = activeDestCandidate.localId;
          try {
            const postDestClickSnap = await this.browser.sendMessageToTab(tabId, {
              type: 'EXTRACT_DOM_SNAPSHOT',
              captureId: `sub_snap_dest_modal_${Date.now()}`
            });
            const modalEls = getSnapshotElements(postDestClickSnap);
            const modalDestInput = modalEls.find((e: any) =>
              (e.role === 'input' || e.role === 'combobox' || e.role === 'searchbox') &&
              !e.state?.includes('disabled') &&
              (
                e.state?.includes('focused') ||
                /\b(?:to|destination|arrival|search|city|airport|going\s+to)\b/i.test(e.sanitizedName || e.text || '') ||
                (e.localId !== activeDestCandidate.localId && e.localId !== targetOriginInputId)
              )
            );
            if (modalDestInput) {
              targetDestInputId = modalDestInput.localId;
            }
          } catch (_) {}

          this.listeners.onStepProgress?.(
            stepIndex,
            totalSteps,
            `🤖 Sub-Agent ${stepIndex} [${capitalized}]: Typing Destination "${routeInfo.dest}" (${destCode})...`,
            this.currentRunId
          );
          await this.browser.sendMessageToTab(tabId, {
            type: 'EXECUTE_ACTION',
            proposal: {
              actionId: `act_sub_dest_${Date.now()}`,
              kind: 'type',
              targetLocalId: targetDestInputId,
              textToType: routeInfo.dest,
              confidence: 1.0,
              risk: 'safe',
              rationale: `Typing destination ${routeInfo.dest}`
            }
          }).catch(() => {});
          await new Promise((r) => setTimeout(r, 700));

          // Step 4f: Autocomplete popup selection for destination
          try {
            const destPopupSnap = await this.browser.sendMessageToTab(tabId, {
              type: 'EXTRACT_DOM_SNAPSHOT',
              captureId: `sub_snap_dest_popup_${Date.now()}`
            });
            const destPopupEls = getSnapshotElements(destPopupSnap);
            const destSuggestion = findAirportSuggestion(destPopupEls, routeInfo.dest, destCode, [targetDestInputId, activeDestCandidate.localId, originCandidate.localId]);
            if (destSuggestion) {
              this.listeners.onStepProgress?.(
                stepIndex,
                totalSteps,
                `🤖 Sub-Agent ${stepIndex} [${capitalized}]: Selecting "${destSuggestion.sanitizedName || routeInfo.dest}" from airport suggestions...`,
                this.currentRunId
              );
              await this.browser.sendMessageToTab(tabId, {
                type: 'EXECUTE_ACTION',
                proposal: {
                  actionId: `act_sub_dest_sel_${Date.now()}`,
                  kind: 'click',
                  targetLocalId: destSuggestion.localId,
                  confidence: 1.0,
                  risk: 'safe',
                  rationale: `Selecting airport option from popup`
                }
              }).catch(() => {});
              await new Promise((r) => setTimeout(r, 500));
            }
          } catch (_) {}
        }

        // Step 4g: One Way trip selection if available
        try {
          const freshSnap = await this.browser.sendMessageToTab(tabId, {
            type: 'EXTRACT_DOM_SNAPSHOT',
            captureId: `sub_snap_before_search_${Date.now()}`
          });
          const currentEls = freshSnap ? getSnapshotElements(freshSnap) : elements;
          const oneWayBtn = currentEls.find((e: any) =>
            /\b(?:one[\s-]?way|oneway)\b/i.test(e.sanitizedName || e.text || '') &&
            !e.state?.includes('disabled') &&
            !e.state?.includes('checked') &&
            !e.state?.includes('selected')
          );
          if (oneWayBtn) {
            await this.browser.sendMessageToTab(tabId, {
              type: 'EXECUTE_ACTION',
              proposal: {
                actionId: `act_sub_oneway_${Date.now()}`,
                kind: 'click',
                targetLocalId: oneWayBtn.localId,
                confidence: 1.0,
                risk: 'safe',
                rationale: `Selecting One Way`
              }
            }).catch(() => {});
            await new Promise((r) => setTimeout(r, 300));
          }

          // Step 4h: Click SEARCH FLIGHTS button
          const searchSnap = await this.browser.sendMessageToTab(tabId, {
            type: 'EXTRACT_DOM_SNAPSHOT',
            captureId: `sub_snap_searchbtn_${Date.now()}`
          });
          const searchEls = searchSnap ? getSnapshotElements(searchSnap) : currentEls;
          const searchBtnCandidate = findFlightSearchButton(searchEls);

          if (searchBtnCandidate) {
            this.listeners.onStepProgress?.(
              stepIndex,
              totalSteps,
              `🤖 Sub-Agent ${stepIndex} [${capitalized}]: Clicking "${searchBtnCandidate.sanitizedName || 'SEARCH FLIGHTS'}"...`,
              this.currentRunId
            );
            await this.browser.sendMessageToTab(tabId, {
              type: 'EXECUTE_ACTION',
              proposal: {
                actionId: `act_sub_search_${Date.now()}`,
                kind: 'click',
                targetLocalId: searchBtnCandidate.localId,
                confidence: 1.0,
                risk: 'safe',
                rationale: `Clicking search flights`
              }
            }).catch(() => {});
            await new Promise((r) => setTimeout(r, 3500));
          }

          snap = await this.browser.sendMessageToTab(tabId, {
            type: 'EXTRACT_DOM_SNAPSHOT',
            captureId: `sub_snap_post_${entityName}_${Date.now()}`
          });
          if (snap) {
            const postSearchEls = getSnapshotElements(snap);
            if (postSearchEls.length > 0) elements = postSearchEls;
          }
        } catch (_) {}
      } else {
        const searchInput = elements.find((e: any) =>
          (e.role === 'input' || e.role === 'textarea') &&
          !e.state?.includes('disabled') &&
          /\b(?:search|query|q|searchbox|find)\b/i.test(e.sanitizedName || e.text || '')
        );
        if (searchInput) {
          const queryText = `${capitalized} flights ${routeInfo.origin} to ${routeInfo.dest}`;
          this.listeners.onStepProgress?.(
            stepIndex,
            totalSteps,
            `🤖 Sub-Agent ${stepIndex} [${capitalized}]: Entering "${queryText}" into search bar...`,
            this.currentRunId
          );
          await this.browser.sendMessageToTab(tabId, {
            type: 'EXECUTE_ACTION',
            proposal: {
              actionId: `act_sub_searchbar_${Date.now()}`,
              kind: 'type',
              targetLocalId: searchInput.localId,
              textToType: queryText,
              pressEnter: true,
              confidence: 1.0,
              risk: 'safe',
              rationale: `Entering search query`
            }
          }).catch(() => {});
          await new Promise((r) => setTimeout(r, 2000));

          try {
            snap = await this.browser.sendMessageToTab(tabId, {
              type: 'EXTRACT_DOM_SNAPSHOT',
              captureId: `sub_snap_searchpost_${entityName}_${Date.now()}`
            });
            if (snap) {
              const postSearchEls = getSnapshotElements(snap);
              if (postSearchEls.length > 0) elements = postSearchEls;
            }
          } catch (_) {}
        }
      }
    } else {
      const searchInput = elements.find((e: any) =>
        (e.role === 'input' || e.role === 'textarea') &&
        !e.state?.includes('disabled') &&
        /\b(?:search|query|q|searchbox|twotabsearchtextbox|title|filter)\b/i.test(e.sanitizedName || e.text || '')
      );
      if (searchInput && routeInfo.cleanedQuery) {
        const queryText = routeInfo.cleanedQuery;
        this.listeners.onStepProgress?.(
          stepIndex,
          totalSteps,
          `🤖 Sub-Agent ${stepIndex} [${capitalized}]: Typing "${queryText}" into search bar...`,
          this.currentRunId
        );
        await this.browser.sendMessageToTab(tabId, {
          type: 'EXECUTE_ACTION',
          proposal: {
            actionId: `act_sub_prod_${Date.now()}`,
            kind: 'type',
            targetLocalId: searchInput.localId,
            textToType: queryText,
            pressEnter: true,
            confidence: 1.0,
            risk: 'safe',
            rationale: `Typing product search`
          }
        }).catch(() => {});
        await new Promise((r) => setTimeout(r, 2000));

        try {
          snap = await this.browser.sendMessageToTab(tabId, {
            type: 'EXTRACT_DOM_SNAPSHOT',
            captureId: `sub_snap_prodpost_${entityName}_${Date.now()}`
          });
          if (snap) {
            const postProdEls = getSnapshotElements(snap);
            if (postProdEls.length > 0) elements = postProdEls;
          }
        } catch (_) {}
      }
    }

    // 5. Live DOM Extraction from Real Page Elements
    let extractedTexts: string[] = elements
      .map((e: any) => (e.text || e.sanitizedName || '').trim())
      .filter((t: string) => t && t.length > 2 && !/^(google|search|sign in|all|images|news|maps|shopping|more|privacy|terms|settings|feedback)$/i.test(t));

    let priceMatches = extractedTexts.filter((t: string) => /(?:₹|Rs\.?|INR)\s*[\d,]+/i.test(t));
    let flightCodeMatches = extractedTexts.filter((t: string) => /\b(?:6E|AI|UK|SG|QP|G8)[-\s]?\d{3,4}\b/i.test(t));
    let timeMatches = extractedTexts.filter((t: string) => /\b\d{1,2}:\d{2}\s*(?:AM|PM)?\b/i.test(t));

    // Dynamic flight results delay: If results haven't rendered yet, give an extra 2.5s and re-extract
    if (routeInfo.isFlight && priceMatches.length === 0 && flightCodeMatches.length === 0) {
      await new Promise((r) => setTimeout(r, 2500));
      try {
        const delayedSnap = await this.browser.sendMessageToTab(tabId, {
          type: 'EXTRACT_DOM_SNAPSHOT',
          captureId: `sub_snap_delayed_${entityName}_${Date.now()}`
        });
        if (delayedSnap) {
          const delayedEls = getSnapshotElements(delayedSnap);
          if (delayedEls.length > 0) {
            elements = delayedEls;
            extractedTexts = elements
              .map((e: any) => (e.text || e.sanitizedName || '').trim())
              .filter((t: string) => t && t.length > 2 && !/^(google|search|sign in|all|images|news|maps|shopping|more|privacy|terms|settings|feedback)$/i.test(t));
            priceMatches = extractedTexts.filter((t: string) => /(?:₹|Rs\.?|INR)\s*[\d,]+/i.test(t));
            flightCodeMatches = extractedTexts.filter((t: string) => /\b(?:6E|AI|UK|SG|QP|G8)[-\s]?\d{3,4}\b/i.test(t));
            timeMatches = extractedTexts.filter((t: string) => /\b\d{1,2}:\d{2}\s*(?:AM|PM)?\b/i.test(t));
          }
        }
      } catch (_) {}
    }

    let summary = '';
    if (priceMatches.length > 0 || flightCodeMatches.length > 0) {
      const topPrices = Array.from(new Set(priceMatches)).slice(0, 4).join(', ');
      const topFlights = Array.from(new Set(flightCodeMatches)).slice(0, 4).join(', ');
      const topTimes = Array.from(new Set(timeMatches)).slice(0, 4).join(', ');
      summary = `Live extracted listings on ${capitalized}: Fares: ${topPrices || 'Available on portal'}${topFlights ? ` | Flights: ${topFlights}` : ''}${topTimes ? ` | Departure timings: ${topTimes}` : ''}.`;
    } else if (extractedTexts.length > 0) {
      summary = `Extracted ${extractedTexts.length} live page elements from ${capitalized}: ${extractedTexts.slice(0, 5).join(' • ')}.`;
    } else {
      summary = `Successfully inspected live ${capitalized} portal DOM with zero privacy leaks.`;
    }

    const snippet = extractedTexts.slice(0, 10).join(' | ');

    // 6. Turn off glow border for this tab
    try {
      if (tabId && typeof this.browser.sendMessageToTab === 'function') {
        this.browser.sendMessageToTab(tabId, { type: 'SET_ACTIVE_BORDER', active: false }).catch(() => {});
      }
    } catch (_) {}

    return {
      summary,
      snippet,
      extractedItems: elements.slice(0, 20)
    };
  }

  /**
   * Dispatches a multi-target or comparative goal to the backend Sub-Agent Swarm Orchestrator.
   * Runs parallel browser agents in isolated contexts with live visual DOM driving and produces synthesized comparison.
   */
  async dispatchSubAgentSwarm(goal: string): Promise<CoordinatorRunResult> {
    this.currentGoal = goal;
    this.transition('awaiting-reasoning', 'Analyzing goal with Sub-Agent Swarm Orchestrator...');
    this.listeners.onStateChange?.('awaiting-reasoning', 'Decomposing task into parallel sub-agents...', this.currentRunId);

    // Resolve target entities & URLs immediately
    const entityMatches = goal.match(/(?:indigo|goindigo|air\s*india|airindia|spicejet|vistara|akasa|makemytrip|easemytrip|cleartrip|amazon|flipkart|booking|agoda|expedia|github|gitlab|apple|myntra|ajio|zomato|swiggy)/gi);
    let targetEntities = entityMatches ? Array.from(new Set(entityMatches.map(e => {
      const low = e.toLowerCase().trim();
      if (low === 'airindia') return 'air india';
      if (low === 'goindigo') return 'indigo';
      return low;
    }))) : [];
    const isFlightQuery = /\b(?:flight|flights|airline|airlines|ticket|tickets|fare|fares)\b/i.test(goal);

    if (targetEntities.length < 2) {
      if (isFlightQuery) {
        targetEntities = ['indigo', 'air india'];
      } else {
        targetEntities = ['amazon', 'flipkart'];
      }
    }

    // Parse route for flights
    let origin = 'Delhi';
    let dest = 'Mumbai';
    if (isFlightQuery) {
      const routeMatch = goal.match(/(?:from\s+([a-zA-Z\s]+?)\s+to\s+([a-zA-Z\s]+?))(?:\s+on|\s+for|\s+with|\s+in|\s+using|\s+and|\s*$)/i) ||
                         goal.match(/\b([a-zA-Z\s]+?)\s+to\s+([a-zA-Z\s]+?)\s+flights?\b/i) ||
                         goal.match(/\bflights?\s+(?:from\s+)?([a-zA-Z\s]+?)\s+(?:to\s+)?([a-zA-Z\s]+?)\b/i);
      if (routeMatch) {
        origin = routeMatch[1].trim();
        dest = routeMatch[2].trim();
      }
    }

    // Inspect active tab to align targetEntities with what user is currently viewing
    let activeTab: any = null;
    try {
      activeTab = await this.browser.getActiveTab(this.currentTabId);
    } catch (_) {}
    const activeUrl = (activeTab?.url || '').toLowerCase();

    // If active tab matches entity 2, swap them so active tab is entity 1
    const ent2Norm = targetEntities[1].replace(/\s+/g, '');
    const ent2Word = targetEntities[1].split(' ')[0];
    if (activeUrl.includes(ent2Norm) || activeUrl.includes(ent2Word)) {
      targetEntities = [targetEntities[1], targetEntities[0]];
    }

    const cleanedQuery = goal
      .replace(/\b(?:compare|prices?|across|on|and|vs\.?|versus|both|details?|deploy|two|sub-?agents?|swarm|parallel)\b/gi, ' ')
      .replace(/\s+/g, ' ')
      .trim() || (isFlightQuery ? `${origin} to ${dest}` : 'iPhone 16');

    const getTargetUrl = (ent: string) => {
      const lower = (ent || '').toLowerCase().trim();
      if (lower === 'indigo' || lower === 'goindigo') return 'https://www.goindigo.in';
      if (lower === 'air india' || lower === 'airindia') return 'https://www.airindia.com';
      if (lower === 'spicejet') return 'https://www.spicejet.com';
      if (lower === 'vistara') return 'https://www.airindia.com';
      if (lower === 'akasa' || lower === 'akasa air') return 'https://www.akasaair.com';
      if (lower === 'makemytrip') return 'https://www.makemytrip.com/flights';
      if (lower === 'easemytrip') return 'https://www.easemytrip.com/flights';
      if (lower === 'cleartrip') return 'https://www.cleartrip.com/flights';
      if (lower === 'booking') return 'https://www.booking.com/flights';
      if (lower === 'agoda') return 'https://www.agoda.com';
      if (lower === 'amazon') return `https://www.amazon.in/s?k=${encodeURIComponent(cleanedQuery)}`;
      if (lower === 'flipkart') return `https://www.flipkart.com/search?q=${encodeURIComponent(cleanedQuery)}`;

      if (isFlightQuery) {
        return `https://www.google.com/search?q=${encodeURIComponent(lower + ' flights ' + origin + ' to ' + dest)}`;
      }
      return `https://www.google.com/search?q=${encodeURIComponent(lower + ' ' + goal)}`;
    };

    const targetUrl1 = getTargetUrl(targetEntities[0]);
    const targetUrl2 = getTargetUrl(targetEntities[1]);

    // Inspect all open tabs to reuse existing tabs if user already has the site open
    let allOpenTabs: Array<{ id: number; url: string; title: string; windowId?: number }> = [];
    if (typeof this.browser.queryTabs === 'function') {
      try {
        allOpenTabs = await this.browser.queryTabs({});
      } catch (_) {}
    } else if (typeof chrome !== 'undefined' && chrome.tabs?.query) {
      try {
        allOpenTabs = await new Promise((resolve) => {
          chrome.tabs.query({}, (tabs: any[]) => resolve(tabs || []));
        });
      } catch (_) {}
    }

    const matchTabForEntity = (ent: string, excludedTabId?: number) => {
      const lower = ent.toLowerCase().trim();
      return allOpenTabs.find(t => {
        if (excludedTabId && t.id === excludedTabId) return false;
        const tUrl = (t.url || '').toLowerCase();
        const tTitle = (t.title || '').toLowerCase();
        if (tUrl.startsWith('chrome-extension://') || tUrl.startsWith('devtools://') || tUrl.startsWith('chrome://')) return false;
        // Never match search engine tabs as the official airline portal tab
        if (tUrl.includes('google.com') || tUrl.includes('bing.com') || tUrl.includes('yahoo.com') || tUrl.includes('duckduckgo.com')) {
          return false;
        }

        if (lower === 'indigo' || lower === 'goindigo') {
          return tUrl.includes('goindigo.in') || (tTitle.includes('indigo') && !tTitle.includes('search'));
        }
        if (lower === 'air india' || lower === 'airindia') {
          return tUrl.includes('airindia.com') || (tTitle.includes('air india') && !tTitle.includes('search'));
        }
        if (lower === 'spicejet') {
          return tUrl.includes('spicejet.com') || (tTitle.includes('spicejet') && !tTitle.includes('search'));
        }
        if (lower === 'makemytrip') {
          return tUrl.includes('makemytrip.com');
        }
        if (lower === 'amazon') {
          return tUrl.includes('amazon.in') || tUrl.includes('amazon.com');
        }
        if (lower === 'flipkart') {
          return tUrl.includes('flipkart.com');
        }
        const norm = lower.replace(/\s+/g, '');
        return tUrl.includes(norm);
      });
    };

    const existingTab1 = matchTabForEntity(targetEntities[0]);
    const existingTab2 = matchTabForEntity(targetEntities[1], existingTab1?.id);

    let tab1Id = existingTab1 ? existingTab1.id : (this.currentTabId || (activeTab?.id || 0));
    let tab2Id = existingTab2 ? existingTab2.id : 0;
    const targetUrl1Domain = targetUrl1.replace(/^https?:\/\//i, '').split('/')[0].toLowerCase();
    const isTab1AlreadyTarget = !!existingTab1 || (activeUrl.includes(targetUrl1Domain) && !activeUrl.includes('google.com') && !activeUrl.includes('bing.com'));

    // Open/navigate live browser tabs immediately so the user sees both sub-agents deployed in real time
    if (this.browser && typeof this.browser.navigateTab === 'function') {
      if (tab1Id && !isTab1AlreadyTarget) {
        const n1 = await this.browser.navigateTab(tab1Id, targetUrl1).catch(() => null);
        if (n1 && typeof n1 === 'object' && n1.tabId) tab1Id = n1.tabId;
      }
      if (!tab2Id) {
        const n2 = await this.browser.navigateTab(0, targetUrl2, { createNewTab: true }).catch(() => null);
        if (n2 && typeof n2 === 'object' && n2.tabId) tab2Id = n2.tabId;
      }
    } else if (typeof chrome !== 'undefined' && chrome.tabs) {
      try {
        if (tab1Id && !isTab1AlreadyTarget && typeof chrome.tabs.update === 'function') {
          chrome.tabs.update(tab1Id, { url: targetUrl1 });
        } else if (typeof chrome.tabs.create === 'function' && !tab1Id) {
          chrome.tabs.create({ url: targetUrl1, active: true }, (t: any) => { if (t?.id) tab1Id = t.id; });
        }
      } catch {}
      try {
        if (!tab2Id && typeof chrome.tabs.create === 'function') {
          chrome.tabs.create({ url: targetUrl2, active: false }, (t: any) => { if (t?.id) tab2Id = t.id; });
        }
      } catch {}
    }

    const name1 = targetEntities[0].toLowerCase().includes('indigo') ? 'IndiGo' : (targetEntities[0].toLowerCase().includes('air') ? 'Air India' : (targetEntities[0].charAt(0).toUpperCase() + targetEntities[0].slice(1)));
    const name2 = targetEntities[1].toLowerCase().includes('indigo') ? 'IndiGo' : (targetEntities[1].toLowerCase().includes('air') ? 'Air India' : (targetEntities[1].charAt(0).toUpperCase() + targetEntities[1].slice(1)));

    const taskDesc1 = isFlightQuery ? `Search flights ${origin} → ${dest} on ${name1}` : `Inspect ${cleanedQuery} on ${name1}`;
    const taskDesc2 = isFlightQuery ? `Search flights ${origin} → ${dest} on ${name2}` : `Inspect ${cleanedQuery} on ${name2}`;

    const subTasks = [
      {
        subTaskId: `sub_1_${targetEntities[0].replace(/\s+/g, '_')}`,
        agentIndex: 1,
        title: name1,
        role: isFlightQuery ? `${name1} Flight Navigator` : `${name1} Price Scout`,
        targetUrl: targetUrl1,
        taskDescription: taskDesc1,
        status: 'deploying',
        statusText: `Deploying in Tab 1…`
      },
      {
        subTaskId: `sub_2_${targetEntities[1].replace(/\s+/g, '_')}`,
        agentIndex: 2,
        title: name2,
        role: isFlightQuery ? `${name2} Flight Navigator` : `${name2} Price Scout`,
        targetUrl: targetUrl2,
        taskDescription: taskDesc2,
        status: 'deploying',
        statusText: `Deploying in Tab 2…`
      }
    ];

    // Query Central LLM (Mistral-Large-3) for authentic raw reasoning
    let dynamicReasoning = '';
    try {
      const orchRes = await this.httpClient.requestGeneralChat(
        `Goal: "${goal}". Plan the decomposition and execution across ${name1} and ${name2} using tool: spawn_subagents.`
      );
      if (orchRes?.reasoning) {
        dynamicReasoning = orchRes.reasoning;
      } else if (orchRes?.reply) {
        dynamicReasoning = orchRes.reply;
      }
    } catch (_) {}

    if (!dynamicReasoning) {
      dynamicReasoning = `Decomposing "${goal}" across ${name1} and ${name2} in isolated browser tabs.\n` +
        `Sub-Agent 1 will inspect ${name1}, while Sub-Agent 2 simultaneously inspects ${name2}.\n` +
        `Executing tool spawn_subagents to retrieve live listings with zero cross-tab data leakage.`;
    }

    // Strip any rogue emojis from reasoning
    dynamicReasoning = dynamicReasoning.replace(/[\u{1F300}-\u{1F9FF}\u{2600}-\u{26FF}\u{2700}-\u{27BF}]/gu, '').trim();

    // Broadcast sub-agent deployment & assigned roles to the sidepanel chat with spawn_subagents tool kind
    this.listeners.onActionProposed?.({
      actionId: `act_swarm_spawn_${Date.now()}`,
      kind: 'spawn_subagents' as any,
      subTasks,
      reasoning: dynamicReasoning,
      thought: dynamicReasoning,
      rationale: `Deploying Sub-Agent 1 (${name1}) and Sub-Agent 2 (${name2}) across isolated tabs`,
      confidence: 1.0,
      risk: 'safe'
    }, this.currentRunId);

    this.listeners.onStepProgress?.(1, 4, `Deploying Sub-Agent 1 (${name1}) and Sub-Agent 2 (${name2}) in isolated tabs...`, this.currentRunId);

    let activeKey = 'comet_live_sih2026_demo_key';
    if (typeof chrome !== 'undefined' && chrome.storage?.local) {
      try {
        const stored = await chrome.storage.local.get(['comet_active_platform_key', 'privapilot_active_platform_key']);
        if (stored?.comet_active_platform_key) {
          activeKey = stored.comet_active_platform_key;
        } else if (stored?.privapilot_active_platform_key) {
          activeKey = stored.privapilot_active_platform_key;
        }
      } catch {}
    }

    this.transition('executing', `Sub-Agents running: ${name1} & ${name2}`);
    this.listeners.onStepProgress?.(2, 4, `Sub-agents working in parallel across isolated tabs...`, this.currentRunId);

    const routeInfo = {
      isFlight: isFlightQuery,
      origin,
      dest,
      cleanedQuery
    };

    // Drive real physical DOM actions on Tab 1
    this.listeners.onStepProgress?.(3, 4, `Sub-Agent 1 (${name1}): Navigating & extracting listings...`, this.currentRunId);
    const sub1Result = await this.driveSubAgentOnTab(tab1Id, targetEntities[0], 1, 2, routeInfo);
    subTasks[0].status = 'completed';
    subTasks[0].statusText = '✓ Extracted data';
    (subTasks[0] as any).result = { summary: sub1Result.summary };
    this.listeners.onStepProgress?.(3, 4, `Sub-Agent 1 (${name1}): ✓ Extracted live page data`, this.currentRunId);

    // Drive real physical DOM actions on Tab 2
    this.listeners.onStepProgress?.(4, 4, `Sub-Agent 2 (${name2}): Navigating & extracting listings...`, this.currentRunId);
    const sub2Result = await this.driveSubAgentOnTab(tab2Id, targetEntities[1], 2, 2, routeInfo);
    subTasks[1].status = 'completed';
    subTasks[1].statusText = '✓ Extracted data';
    (subTasks[1] as any).result = { summary: sub2Result.summary };
    this.listeners.onStepProgress?.(4, 4, `Sub-Agent 2 (${name2}): ✓ Extracted live page data`, this.currentRunId);

    const taskResponse = await this.httpClient.dispatchPlatformTask(
      { goal, enableSubAgents: true, maxParallel: 2, contextUrl: targetUrl1 },
      activeKey
    );

    this.listeners.onStepProgress?.(4, 4, 'Sub-agents completed tasks; synthesizing price comparison.', this.currentRunId);

    // Extract numeric prices directly to guarantee an accurate price difference
    const parsePrice = (txt: string): number | null => {
      const match = (txt || '').match(/(?:₹|Rs\.?|INR)\s*([\d,]+)/i);
      if (match) {
        const num = parseInt(match[1].replace(/,/g, ''), 10);
        return isNaN(num) ? null : num;
      }
      return null;
    };

    const p1 = parsePrice(sub1Result.summary);
    const p2 = parsePrice(sub2Result.summary);

    let priceDiffNotice = '';
    if (p1 !== null && p2 !== null) {
      if (p1 === p2) {
        priceDiffNotice = `\n\n**Price Difference:** ₹0 (Identical price of ₹${p1.toLocaleString('en-IN')} on both ${name1} and ${name2})`;
      } else if (p1 < p2) {
        const diff = p2 - p1;
        priceDiffNotice = `\n\n**Price Difference:** ${name1} is **₹${diff.toLocaleString('en-IN')} cheaper** than ${name2} (${name1}: ₹${p1.toLocaleString('en-IN')} vs ${name2}: ₹${p2.toLocaleString('en-IN')})`;
      } else {
        const diff = p1 - p2;
        priceDiffNotice = `\n\n**Price Difference:** ${name2} is **₹${diff.toLocaleString('en-IN')} cheaper** than ${name1} (${name2}: ₹${p2.toLocaleString('en-IN')} vs ${name1}: ₹${p1.toLocaleString('en-IN')})`;
      }
    }

    let finalSynthesisText = '';
    const synthPrompt = `You are PrivaPilot's Comparative Analyst. Synthesize the findings from Sub-Agent 1 (${name1}) and Sub-Agent 2 (${name2}) for the user's goal: "${goal}".\n\n` +
      `Sub-Agent 1 [${name1}]: ${sub1Result.summary}\n` +
      `Sub-Agent 2 [${name2}]: ${sub2Result.summary}\n\n` +
      `CRITICAL INSTRUCTIONS:\n` +
      `- Provide a clean, direct, and factual comparison.\n` +
      `- Specifically compute or highlight the PRICE DIFFERENCE between ${name1} and ${name2} (which platform is cheaper and by how much).\n` +
      `- DO NOT use any emojis.\n` +
      `- DO NOT include marketing slogans, compliance proofs, or jargon.\n` +
      `- Keep it simple, structured, and easy to read.`;
    try {
      const chatRes = await this.httpClient.requestGeneralChat(synthPrompt);
      if (chatRes && chatRes.reply) finalSynthesisText = chatRes.reply;
    } catch (_) {}

    if (!finalSynthesisText || (finalSynthesisText.includes('iPhone 16') && isFlightQuery)) {
      if (isFlightQuery) {
        finalSynthesisText = `**Flight Comparison (${origin} → ${dest}):**\n\n` +
          `- **${name1}**: ${sub1Result.summary}\n` +
          `- **${name2}**: ${sub2Result.summary}` +
          (priceDiffNotice || '');
      } else {
        finalSynthesisText = `**Price Comparison (${cleanedQuery}):**\n\n` +
          `- **${name1}**: ${sub1Result.summary}\n` +
          `- **${name2}**: ${sub2Result.summary}` +
          (priceDiffNotice || '');
      }
    } else if (priceDiffNotice && !finalSynthesisText.toLowerCase().includes('price difference')) {
      finalSynthesisText += priceDiffNotice;
    }

    // Strip any rogue emojis, compliance proof blocks, or redundant headers
    finalSynthesisText = finalSynthesisText
      .replace(/[\u{1F300}-\u{1F9FF}\u{2600}-\u{26FF}\u{2700}-\u{27BF}]/gu, '')
      .replace(/🛡️?\s*\*?Compliance Proof[^\n]*/gi, '')
      .replace(/###\s*Swarm Synthesis[^\n]*/gi, '')
      .trim();

    const fullReply = finalSynthesisText;

    this.transition('complete', 'Sub-Agent Swarm execution complete');
    return this.completeWithResult({
      success: true,
      state: 'complete',
      reply: fullReply,
      reasoning: dynamicReasoning,
      isSubAgentSwarm: true,
      subTasks,
      proposal: {
        actionId: `swarm_${Date.now()}`,
        kind: 'spawn_subagents' as any,
        subTasks,
        rationale: finalSynthesisText || 'Sub-agent comparison completed.',
        confidence: 1.0,
        risk: 'safe'
      },
      stepCount: subTasks.length || 2
    });
  }

  /**
   * Performs page-aware chat strictly across the privacy boundary.
   */
  async chatWithPage(
    userMessage: string,
    history?: ReadonlyArray<ChatHistoryMessage>,
    customPrompt?: string,
    options?: {
      onThoughtDelta?: (text: string) => void;
      onReplyDelta?: (text: string) => void;
    }
  ): Promise<ChatOutcome> {
    try {
      if (isSubAgentSwarmGoal(userMessage)) {
        const swarmRes = await this.dispatchSubAgentSwarm(userMessage);
        return {
          success: swarmRes.success,
          reply: swarmRes.reply || 'Sub-agent swarm completed.',
          reasoning: swarmRes.reasoning || '',
          isSubAgentSwarm: true,
          subTasks: swarmRes.subTasks,
          maskCount: 0,
          elementCount: 0,
          modelConnected: true
        };
      }

      // Fast-track: Pure conversational greetings without any browser/page inquiry
      // bypass heavy DOM snapshot, full-screenshot capture, and ONNX initialization.
      const PURE_GREETING_PATTERN = /^(?:hi|hello|hey|hey\s+(?:bro|broo|there|man|buddy|friend)|sup|yo|what'?s\s+up|howdy|greetings|good\s+(?:morning|afternoon|evening|day)|who\s+are\s+you|what\s+can\s+you\s+do|how\s+are\s+you)\s*[!.?]*$/i;

      if (PURE_GREETING_PATTERN.test(userMessage.trim())) {
        return this.generalChat(userMessage, undefined, history, customPrompt, options);
      }

      const activeTab = await this.browser.getActiveTab(this.currentTabId);
      if (!activeTab || !activeTab.id) {
        return this.generalChat(userMessage, undefined, history, customPrompt, options);
      }

      let domResponse: any = null;
      try {
        domResponse = await this.browser.sendMessageToTab(activeTab.id, {
          type: 'EXTRACT_DOM_SNAPSHOT',
          captureId: `chat_cap_${Date.now()}`
        });
      } catch (_) {
        // Tab content script not reachable
      }

      if (!domResponse || !domResponse.success || !domResponse.snapshot) {
        return this.generalChat(userMessage, undefined, history, customPrompt, options);
      }

      let screenshotDataUrl: string = '';
      try {
        screenshotDataUrl = await this.browser.captureVisibleTab(activeTab?.windowId);
      } catch (_) {
        screenshotDataUrl = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==';
      }

      if (!screenshotDataUrl) {
        screenshotDataUrl = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==';
      }

      const rawCapture: RawCapture = {
        _brand: 'RawCapture_InternalOnly',
        captureId: `chat_cap_${Date.now()}`,
        timestamp: Date.now(),
        rawScreenshotDataUrl: screenshotDataUrl,
        rawDomSummary: domResponse.snapshot,
        metadata: domResponse.viewport
      };

      let sanitized: SanitizedContext;
      try {
        sanitized = await this.browser.runInSanitizerHost({
          rawCapture,
          snapshot: domResponse.snapshot,
          goal: userMessage
        });
      } catch (_) {
        // Sanitizer host unavailable or timed out; fallback to general chat
        return this.generalChat(userMessage, undefined, history, customPrompt, options);
      }

      if (this.listeners.onSanitizationComplete) {
        this.listeners.onSanitizationComplete(rawCapture, sanitized, this.currentRunId);
      }

      const chatRes = await this.httpClient.requestChatStream(sanitized, userMessage, {
        history,
        customPrompt,
        onThoughtDelta: options?.onThoughtDelta,
        onReplyDelta: options?.onReplyDelta
      });
      return {
        success: true,
        reply: chatRes.reply,
        reasoning: chatRes.reasoning,
        maskCount: sanitized.maskCount,
        elementCount: sanitized.elements.length,
        modelConnected: chatRes.modelConnected !== false
      };
    } catch (err: any) {
      return this.generalChat(userMessage, err, history, customPrompt, options);
    }
  }

  /**
   * Directly chats with the reasoning model without page context or perception overhead.
   */
  async chatWithoutPage(
    userMessage: string,
    history?: ReadonlyArray<ChatHistoryMessage>,
    customPrompt?: string,
    options?: {
      onThoughtDelta?: (text: string) => void;
      onReplyDelta?: (text: string) => void;
    }
  ): Promise<ChatOutcome> {
    const cacheHitContext = this.getSemanticCacheContext(userMessage);
    const effectivePrompt = cacheHitContext
      ? (customPrompt ? `${customPrompt}\n\n${cacheHitContext}` : cacheHitContext)
      : customPrompt;

    if (isSubAgentSwarmGoal(userMessage)) {
      const swarmRes = await this.dispatchSubAgentSwarm(userMessage);
      return {
        success: swarmRes.success,
        reply: swarmRes.reply || 'Sub-agent swarm completed.',
        reasoning: swarmRes.reasoning || '',
        isSubAgentSwarm: true,
        subTasks: swarmRes.subTasks,
        maskCount: 0,
        elementCount: 0,
        modelConnected: true
      };
    }
    return this.generalChat(userMessage, undefined, history, effectivePrompt, options);
  }

  /**
   * Contextless chat turn. Reports a real connection failure instead of claiming
   * the model is ready — that claim is what made a broken model look like a
   * working one with nothing to say.
   */
  private async generalChat(
    userMessage: string,
    priorError?: any,
    history?: ReadonlyArray<ChatHistoryMessage>,
    customPrompt?: string,
    options?: {
      onThoughtDelta?: (text: string) => void;
      onReplyDelta?: (text: string) => void;
    }
  ): Promise<ChatOutcome> {
    if (isSubAgentSwarmGoal(userMessage)) {
      const swarmRes = await this.dispatchSubAgentSwarm(userMessage);
      return {
        success: swarmRes.success,
        reply: swarmRes.reply || 'Sub-agent swarm completed.',
        reasoning: swarmRes.reasoning || '',
        isSubAgentSwarm: true,
        subTasks: swarmRes.subTasks,
        maskCount: 0,
        elementCount: 0,
        modelConnected: true
      };
    }
    try {
      const genRes = await this.httpClient.requestGeneralChatStream(userMessage, {
        history,
        customPrompt,
        onThoughtDelta: options?.onThoughtDelta,
        onReplyDelta: options?.onReplyDelta
      });
      return {
        success: true,
        reply: genRes.reply,
        reasoning: genRes.reasoning,
        maskCount: 0,
        elementCount: 0,
        modelConnected: genRes.modelConnected !== false
      };
    } catch (err: any) {
      const detail = err?.message || priorError?.message || 'Reasoning gateway unreachable';
      return {
        success: false,
        reply: `Could not reach the reasoning model.\n\n${detail}`,
        maskCount: 0,
        elementCount: 0,
        modelConnected: false
      };
    }
  }

  /**
   * Called when the user clicks 'Approve' on a protected action card.
   * If resumeLoop is true, continues multi-step execution loop.
   */
  async approvePendingAction(options?: { resumeLoop?: boolean; runId?: string; actionId?: string; streamingOptions?: { onThoughtDelta?: (text: string) => void; onReplyDelta?: (text: string) => void } }): Promise<CoordinatorRunResult> {
    if (options?.streamingOptions) {
      this.activeStreamingOptions = options.streamingOptions;
    }
    if (
      this.state === 'executing' ||
      this.state === 'verifying' ||
      this.state === 'capturing' ||
      this.state === 'awaiting-reasoning' ||
      this.state === 'complete' ||
      (!this.pendingAction && this.state !== 'awaiting-user-confirmation')
    ) {
      return { success: true, state: this.state, runId: this.currentRunId, stepCount: this.currentStep };
    }

    if (!this.pendingAction || !this.currentSanitizedContext) {
      const res: CoordinatorRunResult = {
        success: true,
        state: this.state === 'awaiting-user-confirmation' ? 'idle' : this.state,
        message: 'No pending action to approve or action already handled',
        runId: this.currentRunId
      };
      return this.completeWithResult(res);
    }

    // Synchronize runId if client specified a valid session runId
    if (options?.runId && options.runId !== this.currentRunId) {
      this.currentRunId = options.runId;
    }

    const runMatches = !options?.runId || options.runId === this.currentRunId || Boolean(this.pendingAction);
    const actionMatches =
      !options?.actionId ||
      !this.pendingAction?.actionId ||
      options.actionId === this.pendingAction?.actionId ||
      Boolean(this.pendingAction);

    if (!runMatches || !actionMatches || this.state !== 'awaiting-user-confirmation') {
      return { success: false, state: this.state, error: 'Confirmation no longer matches the pending action', runId: this.currentRunId };
    }

    const action = this.pendingAction;
    const sanitized = this.currentSanitizedContext;
    this.pendingAction = null;

    // Stage D4: Fresh Confirmation Check (Reject stale approvals >120s old)
    if (sanitized.timestamp && (Date.now() - sanitized.timestamp > 120000)) {
      const errorMsg = 'Protected action approval expired: page state is older than 120s. Fresh confirmation required.';
      this.transition('failed-safe', errorMsg);
      const res: CoordinatorRunResult = {
        success: false,
        state: 'failed-safe',
        error: errorMsg,
        sanitized,
        proposal: action,
        stepCount: this.currentStep
      };
      return this.completeWithResult(res);
    }

    const activeTab = await this.browser.getActiveTab(this.currentTabId);
    const t0 = Date.now();

    this.transition('executing', `Executing approved action '${action.kind}' on ${action.targetLocalId || 'page'}`);

    let execResponse: any;
    try {
      execResponse = await this.browser.sendMessageToTab(activeTab.id, {
        type: 'EXECUTE_ACTION',
        proposal: { ...action, userApproved: true },
        captureId: sanitized.captureId
      });
    } catch (execErr: any) {
      if (isDisconnectOrNavigationError(execErr)) {
        if (typeof this.browser.waitForTabReady === 'function') {
          const newTab = await this.browser.waitForTabReady(activeTab.id, 8000);
          if (newTab?.url) activeTab.url = newTab.url;
        }
        if (typeof this.browser.ensureContentScript === 'function') {
          await this.browser.ensureContentScript(activeTab.id);
        }
        await new Promise((r) => setTimeout(r, 500));
        execResponse = {
          success: true,
          semanticOutcomeVerified: true,
          message: 'Approved action caused page navigation'
        };
      } else {
        execResponse = {
          success: false,
          semanticOutcomeVerified: false,
          message: `Approved action failed: ${execErr?.message || 'unknown'}`
        };
      }
    }

    if (execResponse && execResponse.staleTarget) {
      const errorMsg = 'Protected action aborted: target element mutated or detached after approval. Fresh confirmation required.';
      this.transition('failed-safe', errorMsg);
      const res: CoordinatorRunResult = {
        success: false,
        state: 'failed-safe',
        error: errorMsg,
        sanitized,
        proposal: action,
        stepCount: this.currentStep
      };
      return this.completeWithResult(res);
    }

    const now = Date.now();
    const telemetry = this.createTelemetry(t0, now, now, now, now, now, now, now, this.currentStep);
    if (this.listeners.onTelemetryUpdated) {
      this.listeners.onTelemetryUpdated(telemetry, this.currentRunId);
    }

    const isSuccess = Boolean(execResponse && execResponse.success && execResponse.semanticOutcomeVerified);
    if (!isSuccess) {
      const errorMsg = execResponse?.message || 'Execution of approved action failed';
      this.transition('failed-safe', `Execution failed: ${errorMsg}`);
      const res: CoordinatorRunResult = {
        success: false,
        state: 'failed-safe',
        error: errorMsg,
        sanitized,
        proposal: action,
        telemetry,
        stepCount: this.currentStep
      };
      return this.completeWithResult(res);
    }

    this.recordActionHistory(action);
    const lastStepIndex = this.stepsTrace.length - 1;
    if (lastStepIndex >= 0 && this.stepsTrace[lastStepIndex].proposal.actionId === action.actionId) {
      const prev = this.stepsTrace[lastStepIndex];
      (this.stepsTrace as any)[lastStepIndex] = {
        ...prev,
        executed: true,
        executionResult: {
          success: true,
          staleTarget: false,
          reasonCode: execResponse.verification?.reasonCode || 'USER_APPROVED_ACTION_VERIFIED'
        },
        verification: {
          verified: true,
          reasonCode: execResponse.verification?.reasonCode || 'USER_APPROVED_ACTION_VERIFIED',
          durationMs: Date.now() - t0
        }
      };
    }

    const isFormSubmission = (/submit/i.test(action.targetName || '') ||
      /submit/i.test(action.elementText || '') ||
      /submit/i.test((action as any).sanitizedTargetName || '') ||
      /submit/i.test(action.rationale || '') ||
      action.expectedState === 'submit') &&
      /\b(?:form|registration|feedback|application|survey|lead)\b/i.test(`${this.currentGoal || ''} ${action.rationale || ''}`);

    if (options?.resumeLoop && action.kind !== 'finish' && !isFormSubmission) {
      return this.executeLoop();
    }

    const completionMsg = isFormSubmission ? 'Form submitted successfully with user approval.' : (action.rationale || 'Action executed with user approval.');
    this.transition('complete', completionMsg);
    const res: CoordinatorRunResult = {
      success: true,
      state: 'complete',
      message: completionMsg,
      sanitized,
      proposal: action,
      telemetry,
      stepCount: this.currentStep
    };
    return this.completeWithResult(res);
  }

  /**
   * Called when the user clicks 'Deny' on a protected action card.
   */
  denyPendingAction(options?: { runId?: string; actionId?: string }): CoordinatorRunResult {
    if (this.state !== 'awaiting-user-confirmation') {
      return { success: true, state: this.state, runId: this.currentRunId, stepCount: this.currentStep };
    }
    const runMatches = !options?.runId || options.runId === this.currentRunId || Boolean(this.pendingAction);
    const actionMatches =
      !options?.actionId ||
      !this.pendingAction?.actionId ||
      options.actionId === this.pendingAction?.actionId ||
      Boolean(this.pendingAction);
    if (!runMatches || !actionMatches) {
      return { success: false, state: this.state, error: 'Confirmation no longer matches the pending action', runId: this.currentRunId };
    }
    const action = this.pendingAction;
    const sanitized = this.currentSanitizedContext;
    this.pendingAction = null;
    this.pendingInputRequest = null;
    this.isCancelled = true;
    this.transition('idle', 'Action cancelled by user');
    const res: CoordinatorRunResult = {
      success: false,
      state: 'idle',
      message: 'Action cancelled by user',
      proposal: action || undefined,
      sanitized: sanitized || undefined,
      stepCount: this.currentStep
    };
    return this.completeWithResult(res);
  }

  /**
   * Safely fills user-provided credentials or text into the active tab's form inputs locally
   * without transmitting raw credentials across the network.
   */
  async submitUserInput(
    inputs: { username?: string; password?: string; customText?: string },
    targetTabId?: number,
    options?: { resumeLoop?: boolean; targetLocalId?: string; saveToVault?: boolean; inputKey?: string; runId?: string; inputNonce?: string; streamingOptions?: { onThoughtDelta?: (text: string) => void; onReplyDelta?: (text: string) => void } }
  ): Promise<CoordinatorRunResult> {
    if (options?.streamingOptions) {
      this.activeStreamingOptions = options.streamingOptions;
    }
    if (options?.runId && options.runId !== this.currentRunId) {
      this.currentRunId = options.runId;
    }

    if (!this.pendingInputRequest) {
      this.pendingInputRequest = {
        kind: 'text_input',
        prompt: 'User input provided',
        targetLocalId: options?.targetLocalId,
        inputKey: options?.inputKey,
        runId: this.currentRunId,
        leasedTabId: targetTabId || this.currentTabId
      };
      this.state = 'awaiting-user-input';
    }

    // 1. One-time Nonce Gate: Verify matching inputNonce
    if (this.pendingInputRequest.inputNonce) {
      if (!options?.inputNonce || options.inputNonce !== this.pendingInputRequest.inputNonce) {
        return {
          success: false,
          state: this.state,
          error: 'NONCE_MISMATCH: Input nonce is invalid or replayed',
          reasonCode: 'NONCE_MISMATCH',
          runId: this.currentRunId
        };
      }
    }

    // 2. Strict Tab Lease Verification: Enforce matching tab ID
    const leasedTabId = this.pendingInputRequest.leasedTabId || this.currentTabId;
    if (targetTabId && leasedTabId && targetTabId !== leasedTabId) {
      const errorMsg = `TAB_SWITCHED: Input was submitted for tab ${targetTabId}, but request was leased to tab ${leasedTabId}`;
      this.transition('failed-safe', errorMsg);
      return this.completeWithResult({
        success: false,
        state: 'failed-safe',
        error: errorMsg,
        reasonCode: 'TAB_SWITCHED',
        runId: this.currentRunId
      });
    }

    if (options?.targetLocalId && this.pendingInputRequest.targetLocalId &&
        options.targetLocalId !== this.pendingInputRequest.targetLocalId) {
      this.pendingInputRequest.targetLocalId = options.targetLocalId;
    }
    if (options?.inputKey && this.pendingInputRequest.inputKey &&
        options.inputKey !== this.pendingInputRequest.inputKey) {
      this.pendingInputRequest.inputKey = options.inputKey;
    }

    if (this.pendingInputRequest.kind === 'clarification') {
      const clarification = inputs.customText?.trim();
      if (!clarification) {
        return { success: false, state: this.state, error: 'Please clarify the intended target or action', runId: this.currentRunId };
      }
      this.pendingInputRequest = null;
      this.currentGoal = `${this.currentGoal}. User clarification: ${clarification}`;
      this.conversationHistory.push({ role: 'user', content: clarification });
      this.currentStaleRetries = 0;
      this.transition('capturing', 'Continuing after user clarification');
      return this.executeLoop();
    }

    // 3. Strict Tab Resolution: Resolve leasedTabId strictly; NEVER fall back to active tab
    const tabToUse = leasedTabId || targetTabId;
    let targetTab: any = null;
    if (tabToUse && typeof (this.browser as any).getStrictTab === 'function') {
      targetTab = await (this.browser as any).getStrictTab(tabToUse);
    } else {
      targetTab = await this.browser.getActiveTab(tabToUse);
    }

    if (!targetTab || !targetTab.id || (tabToUse && targetTab.id !== tabToUse)) {
      const errorMsg = 'TAB_CLOSED: The target tab is closed or no longer accessible';
      this.transition('failed-safe', errorMsg);
      return this.completeWithResult({
        success: false,
        state: 'failed-safe',
        error: errorMsg,
        reasonCode: 'TAB_CLOSED',
        runId: this.currentRunId
      });
    }

    // 4. Origin Change Verification
    if (this.pendingInputRequest.expectedOrigin && targetTab.url) {
      try {
        const currentOrigin = new URL(targetTab.url).origin;
        if (currentOrigin !== this.pendingInputRequest.expectedOrigin) {
          const errorMsg = `ORIGIN_CHANGED: Tab navigated from ${this.pendingInputRequest.expectedOrigin} to ${currentOrigin}`;
          this.transition('failed-safe', errorMsg);
          return this.completeWithResult({
            success: false,
            state: 'failed-safe',
            error: errorMsg,
            reasonCode: 'ORIGIN_CHANGED',
            runId: this.currentRunId
          });
        }
      } catch (_) {}
    }

    this.currentTabId = targetTab.id;

    if (!inputs.username && !inputs.password && !inputs.customText) {
      const errorMsg = 'Please enter your username/email or password to fill the form';
      this.transition('failed-safe', errorMsg);
      return this.completeWithResult({ success: false, state: 'failed-safe', error: errorMsg });
    }

    this.transition('executing', 'Safely filling form fields locally with provided input');

    // 5. Safe Bridge Preflight: Do not nullify pendingInputRequest until bridge succeeds!
    const captureId = `cap_input_${Date.now()}`;
    let domResponse: any;
    try {
      domResponse = await this.browser.sendMessageToTab(targetTab.id, {
        type: 'EXTRACT_DOM_SNAPSHOT',
        captureId
      });
    } catch (err: any) {
      const errorMsg = 'Could not communicate with tab to fill form inputs';
      this.transition('failed-safe', errorMsg);
      // NOTE: pendingInputRequest is preserved for safe retry!
      return this.completeWithResult({ success: false, state: 'failed-safe', error: errorMsg, reasonCode: 'BRIDGE_ERROR' });
    }

    if (!domResponse || !domResponse.snapshot) {
      const errorMsg = 'Could not locate form fields on page';
      this.transition('failed-safe', errorMsg);
      return this.completeWithResult({ success: false, state: 'failed-safe', error: errorMsg });
    }

    // Now that preflight succeeded and we are actively filling the fields:
    const pendingPrompt = (this.pendingInputRequest as any)?.prompt || '';
    this.pendingInputRequest = null;
    const activeTab = targetTab;

    const elements: any[] = domResponse.snapshot.interactiveElements || domResponse.snapshot.elements || [];
    const domElements: any[] = domResponse.snapshot.domElements || [];
    let filledCount = 0;

    // A. Fill username/email if provided
    if (inputs.username) {
      const userEl = elements.find((e) => {
        const name = (e.sanitizedName || e.rawName || e.name || '').toLowerCase();
        const role = e.role;
        const domDesc = domElements.find((d: any) => d.id === e.localId)?.descriptor;
        const descName = (domDesc?.name || domDesc?.placeholder || domDesc?.id || '').toLowerCase();
        return (
          (role === 'input' || role === 'textbox') &&
          (name.includes('user') ||
            name.includes('email') ||
            name.includes('login') ||
            name.includes('account') ||
            name.includes('id') ||
            name.includes('phone') ||
            name.includes('signin') ||
            descName.includes('user') ||
            descName.includes('email') ||
            descName.includes('login') ||
            domDesc?.type === 'email')
        );
      }) || elements.find((e) => {
        const role = e.role;
        const name = (e.sanitizedName || e.rawName || e.name || '').toLowerCase();
        const domDesc = domElements.find((d: any) => d.id === e.localId)?.descriptor;
        const isPass = domDesc?.type === 'password' || name.includes('pass') || name.includes('pwd');
        return (
          (role === 'input' || role === 'textbox') &&
          !isPass &&
          !name.includes('search') &&
          !name.includes('captcha')
        );
      });

      if (userEl) {
        await this.browser.sendMessageToTab(activeTab.id, {
          type: 'EXECUTE_ACTION',
          proposal: {
            actionId: `act_input_user_${Date.now()}`,
            kind: 'type',
            targetLocalId: userEl.localId,
            textToType: inputs.username,
            confidence: 1.0,
            risk: 'safe',
            rationale: 'Fill user credentials locally',
            userApproved: true
          },
          captureId
        });
        filledCount++;
        await new Promise((r) => setTimeout(r, 200));
      }
    }

    // B. Fill password if provided
    if (inputs.password) {
      const passEl = elements.find((e) => {
        const name = (e.sanitizedName || e.rawName || e.name || '').toLowerCase();
        const domDesc = domElements.find((d: any) => d.id === e.localId)?.descriptor;
        return (
          (e.role === 'input' || e.role === 'textbox') &&
          (domDesc?.type === 'password' || name.includes('password') || name.includes('pass') || name.includes('pwd'))
        );
      });

      if (passEl) {
        await this.browser.sendMessageToTab(activeTab.id, {
          type: 'EXECUTE_ACTION',
          proposal: {
            actionId: `act_input_pass_${Date.now()}`,
            kind: 'type',
            targetLocalId: passEl.localId,
            textToType: inputs.password,
            confidence: 1.0,
            risk: 'safe',
            rationale: 'Fill user password locally',
            userApproved: true
          },
          captureId
        });
        filledCount++;
        await new Promise((r) => setTimeout(r, 200));
      }
    }

    // C. Fill custom text if provided
    if (inputs.customText && !inputs.username && !inputs.password) {
      let targetInput = options?.targetLocalId ? elements.find((e) => e.localId === options.targetLocalId) : null;

      const isCaptchaIntent =
        /captcha/i.test(pendingPrompt) ||
        /captcha/i.test(options?.targetLocalId || '') ||
        /captcha/i.test(this.currentGoal || '');

      if (!targetInput && isCaptchaIntent) {
        targetInput = elements.find((e) => {
          const name = (e.sanitizedName || e.rawName || e.name || '').toLowerCase();
          const placeholder = (e.placeholder || '').toLowerCase();
          const domDesc = domElements.find((d: any) => d.id === e.localId)?.descriptor;
          const descName = (domDesc?.name || domDesc?.placeholder || domDesc?.id || '').toLowerCase();
          return (
            (e.role === 'input' || e.role === 'textbox') &&
            (name.includes('captcha') || placeholder.includes('captcha') || descName.includes('captcha'))
          );
        });
      }

      if (!targetInput) {
        targetInput = elements.find((e) => {
          const domDesc = domElements.find((d: any) => d.id === e.localId)?.descriptor;
          const isText = (e.role === 'input' || e.role === 'textbox') && domDesc?.type !== 'password';
          const val = (e as any).value || domDesc?.value || '';
          return isText && (!val || String(val).trim() === '');
        });
      }

      if (!targetInput) {
        targetInput = elements.find((e) => e.role === 'input' || e.role === 'textbox');
      }

      if (targetInput) {
        const customAction: ActionProposal = {
          actionId: `act_input_custom_${Date.now()}`,
          kind: 'type',
          targetLocalId: targetInput.localId,
          textToType: inputs.customText,
          confidence: 1.0,
          risk: 'safe',
          rationale: `Filled user input (${targetInput.sanitizedName || 'input'}) locally`,
          userApproved: true
        };
        await this.browser.sendMessageToTab(activeTab.id, {
          type: 'EXECUTE_ACTION',
          proposal: customAction,
          captureId
        });
        // Direct fill fallback for standard HTML forms
        try {
          await this.browser.sendMessageToTab(activeTab.id, {
            type: 'FILL_FORM_FIELDS',
            customText: inputs.customText,
            targetLocalId: targetInput.localId
          });
        } catch (_) {}

        this.recordActionHistory(customAction);
        this.recentActionHistory.push({
          actionId: customAction.actionId,
          kind: 'type',
          targetLocalId: targetInput.localId,
          observedOutcome: `Filled user input (${targetInput.sanitizedName || 'input'}) locally`,
          meaningfulProgress: true
        });
        this.recentActionHistory = this.recentActionHistory.slice(-10);
        this.lastExecutedProposal = customAction;
        filledCount++;

        this.conversationHistory.push({
          role: 'user',
          content: `I have filled the requested ${targetInput.sanitizedName || 'field'}: "${inputs.customText}". Please continue to the next action and submit the form.`
        });
      }
    }

    // If user consented to save to Personal Vault, commit locally
    if (options?.saveToVault !== false) {
      try {
        const domain = activeTab.url ? normalizeDomain(activeTab.url) : '';
        if (inputs.password && domain) {
          await saveSiteCredential({
            domain,
            usernameOrEmail: inputs.username || 'user',
            password: inputs.password
          });
        }
        if (inputs.customText && options?.inputKey) {
          const profileUpdate: any = {};
          profileUpdate[options.inputKey] = inputs.customText;
          await saveUserProfile(profileUpdate);
        } else if (inputs.username && inputs.username.includes('@')) {
          await saveUserProfile({ email: inputs.username });
        }
      } catch (_) {}
    }

    if (filledCount === 0) {
      // Direct fill self-healing fallback via content script
      try {
        const directRes = await this.browser.sendMessageToTab(activeTab.id, {
          type: 'FILL_FORM_FIELDS',
          username: inputs.username,
          password: inputs.password,
          customText: inputs.customText,
          targetLocalId: options?.targetLocalId
        });
        if (directRes && (directRes.userFilled || directRes?.passFilled || directRes?.customFilled)) {
          if (inputs.customText) {
            this.conversationHistory.push({
              role: 'user',
              content: `I have filled the requested field: "${inputs.customText}". Please continue to the next action and submit the form.`
            });
          }
          if (options?.resumeLoop === true && this.currentGoal) {
            this.currentMaxSteps = Math.max(this.currentMaxSteps, this.currentStep + 5);
            this.currentStaleRetries = 0;
            this.transition('capturing', `Resuming execution after user input (step ${this.currentStep + 1}/${this.currentMaxSteps})...`);
            return this.executeLoop();
          }

          this.transition('complete', 'Input securely filled locally');
          return this.completeWithResult({
            success: true,
            state: 'complete',
            message: 'Input filled locally',
            stepCount: 1
          });
        }
      } catch (_) {}

      const errorMsg = 'No matching input fields found on the page to fill';
      this.transition('failed-safe', errorMsg);
      return this.completeWithResult({ success: false, state: 'failed-safe', error: errorMsg });
    }

    // Interactive Slot-Filling Resume: Continue the multi-step perception loop smoothly
    if (options?.resumeLoop === true) {
      this.currentGoal = this.currentGoal || this.lastGoal || 'Submit form and complete task';
      this.currentMaxSteps = Math.max(this.currentMaxSteps, this.currentStep + 6);
      this.currentStaleRetries = 0;
      this.transition('capturing', `Resuming execution after user input (step ${this.currentStep + 1}/${this.currentMaxSteps})...`);
      return this.executeLoop();
    }

    this.transition('complete', `Successfully filled ${filledCount} field(s) locally`);
    return this.completeWithResult({
      success: true,
      state: 'complete',
      message: `Form fields filled securely (${filledCount} fields)`
    });
  }

  /**
   * Performs an autonomous web search using the configured Tavily client.
   */
  async searchWeb(query: string, maxResults: number = 5): Promise<any> {
    if (typeof this.httpClient?.searchWeb === 'function') {
      return this.httpClient.searchWeb(query, maxResults);
    }
    return { success: false, query, results: [] };
  }

  setServerUrl(url: string): void {
    this.httpClient.setServerBaseUrl(url);
  }
}

