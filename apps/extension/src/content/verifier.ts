/**
 * @privapilot/extension - Content Script Semantic State Verifier
 *
 * Implements deterministic semantic outcome validation with explicit bounded postconditions:
 * - Landmark appearance / disappearance
 * - Target element state mutations (enabled, disabled, checked, expanded, selected)
 * - Modal / drawer / dialog visibility
 * - Safe path / navigation changes (without raw URL / sensitive data transmission)
 * - Safe status text & alert region changes
 * - MutationObserver with bounded timeouts (no generic document.readyState fallbacks)
 */

import { ActionProposal } from '@privapilot/protocol';

export type VerificationReasonCode =
  | 'LANDMARK_MUTATION_VERIFIED'
  | 'TARGET_STATE_MUTATION_VERIFIED'
  | 'MODAL_DRAWER_VISIBILITY_VERIFIED'
  | 'SAFE_NAVIGATION_VERIFIED'
  | 'STATUS_REGION_MUTATION_VERIFIED'
  | 'INPUT_VALUE_MUTATION_VERIFIED'
  | 'PASSIVE_ACTION_VERIFIED'
  | 'TIMEOUT_EXPIRED'
  | 'UNRELATED_MUTATION'
  | 'NO_SEMANTIC_CHANGE_OBSERVED'
  | 'TARGET_ELEMENT_MISSING'
  | 'CONDITION_NOT_MET';

export interface TargetSemanticState {
  readonly id?: string;
  readonly tagName?: string;
  readonly role?: string;
  readonly disabled?: boolean;
  readonly checked?: boolean;
  readonly readOnly?: boolean;
  readonly selectedIndex?: number;
  readonly ariaExpanded?: string | null;
  readonly ariaSelected?: string | null;
  readonly ariaChecked?: string | null;
  readonly isFocused?: boolean;
  readonly classListSummary?: string;
  readonly valuePresence?: boolean;
}

export interface SafePreActionSnapshot {
  readonly timestamp: number;
  readonly pathFingerprint: string;
  readonly openDialogOrDrawerCount: number;
  readonly openDialogIds: ReadonlySet<string>;
  readonly landmarkCounts: Record<string, number>;
  readonly statusRegionCount: number;
  readonly targetState?: TargetSemanticState;
  readonly documentElementCount: number;
}

export interface VerificationOutcome {
  readonly verified: boolean;
  readonly reasonCode: VerificationReasonCode;
  readonly message: string;
  readonly details?: {
    readonly durationMs?: number;
    readonly matchedCondition?: string;
    readonly corroboratedByImageDiff?: boolean;
  };
}

export interface VerificationOptions {
  readonly timeoutMs?: number;
  readonly imageDiffCorroborated?: boolean;
  readonly doc?: Document;
}

function isElementVisible(el: HTMLElement): boolean {
  if (el.hidden || el.getAttribute?.('aria-hidden') === 'true' || el.classList?.contains('hidden')) {
    return false;
  }
  const doc = el.ownerDocument;
  const win = doc?.defaultView || (typeof window !== 'undefined' ? window : null);
  if (win && typeof win.getComputedStyle === 'function') {
    try {
      const style = win.getComputedStyle(el);
      return style.display !== 'none' && style.visibility !== 'hidden' && style.visibility !== 'collapse' && style.opacity !== '0';
    } catch (_) {}
  }
  return true;
}

function checkPostconditions(
  proposal: ActionProposal,
  targetEl: HTMLElement | null | undefined,
  preSnapshot: SafePreActionSnapshot,
  doc: Document
): { matched: boolean; reasonCode: VerificationReasonCode; message: string; matchedCondition?: string } {
  const kind = proposal.kind;
  const exp = (proposal.expectedState || '').toLowerCase();

  // 1. Passive actions (finish, wait, observe, scroll)
  if (kind === 'finish' || kind === 'wait' || kind === 'observe' || kind === 'scroll') {
    return {
      matched: true,
      reasonCode: 'PASSIVE_ACTION_VERIFIED',
      message: 'Passive action completed and verified',
      matchedCondition: 'passive_action'
    };
  }

  // 2. Type action verification
  if (kind === 'type') {
    if (!targetEl) {
      return {
        matched: false,
        reasonCode: 'TARGET_ELEMENT_MISSING',
        message: 'Type verification failed: target element missing'
      };
    }
    if (proposal.textToType !== undefined) {
      const val = 'value' in targetEl ? (targetEl as HTMLInputElement).value : (targetEl.textContent || targetEl.innerText || '');
      if (val && val.includes(proposal.textToType)) {
        return {
          matched: true,
          reasonCode: 'INPUT_VALUE_MUTATION_VERIFIED',
          message: 'Semantic state verified: input value updated',
          matchedCondition: 'input_value_updated'
        };
      }
    }
    return {
      matched: false,
      reasonCode: 'CONDITION_NOT_MET',
      message: 'Type verification failed: input value does not match expected text'
    };
  }

  // 3. Select action verification
  if (kind === 'select') {
    if (!targetEl) {
      return {
        matched: false,
        reasonCode: 'TARGET_ELEMENT_MISSING',
        message: 'Select verification failed: target element missing'
      };
    }
    if (targetEl.tagName.toLowerCase() === 'select') {
      const sel = targetEl as HTMLSelectElement;
      if (proposal.selectOptionValue !== undefined && sel.value === proposal.selectOptionValue) {
        return {
          matched: true,
          reasonCode: 'TARGET_STATE_MUTATION_VERIFIED',
          message: 'Select action executed and verified',
          matchedCondition: 'select_option_mutated'
        };
      }
    }
    return {
      matched: false,
      reasonCode: 'CONDITION_NOT_MET',
      message: 'Select verification failed: option value not selected'
    };
  }

  // 4. Modal / Drawer / Dialog visibility postcondition
  const dialogEls = doc.querySelectorAll?.(
    'dialog[open], .modal:not([hidden]):not(.hidden), .drawer:not([hidden]):not(.hidden), [role="dialog"], [aria-modal="true"], .preview-panel:not([hidden]):not(.hidden), #previewDrawer:not(.hidden), #preview-drawer:not(.hidden)'
  ) || [];

  let currentOpenCount = 0;
  let newlyOpenedFound = false;
  for (let i = 0; i < dialogEls.length; i++) {
    const el = dialogEls[i] as HTMLElement;
    if (isElementVisible(el)) {
      currentOpenCount++;
      const id = el.id || `dialog_${i}`;
      if (!preSnapshot.openDialogIds.has(id)) {
        newlyOpenedFound = true;
      }
    }
  }

  if (newlyOpenedFound || (currentOpenCount > preSnapshot.openDialogOrDrawerCount)) {
    return {
      matched: true,
      reasonCode: 'MODAL_DRAWER_VISIBILITY_VERIFIED',
      message: 'Semantic state verified: modal or drawer is visible',
      matchedCondition: 'modal_drawer_opened'
    };
  }

  // Check modal closing if expectedState specifies closing
  if (exp.includes('close') || exp.includes('cancel') || exp.includes('dismiss')) {
    if (currentOpenCount < preSnapshot.openDialogOrDrawerCount) {
      return {
        matched: true,
        reasonCode: 'MODAL_DRAWER_VISIBILITY_VERIFIED',
        message: 'Semantic state verified: modal or drawer dismissed',
        matchedCondition: 'modal_drawer_closed'
      };
    }
  }

  // 5. Safe Navigation / Path mutation (never transmit raw URL or query parameters)
  const rawPath = doc.location?.pathname || '';
  const hash = doc.location?.hash || '';
  const currentPathFingerprint = `${rawPath}${hash ? `#${hash.replace(/^#/, '')}` : ''}`;
  if (currentPathFingerprint && preSnapshot.pathFingerprint && currentPathFingerprint !== preSnapshot.pathFingerprint) {
    return {
      matched: true,
      reasonCode: 'SAFE_NAVIGATION_VERIFIED',
      message: 'Semantic state verified: path navigation change detected',
      matchedCondition: 'path_navigation_mutated'
    };
  }

  // 6. Target State mutation (disabled, checked, aria-expanded, aria-selected, class mutations)
  if (targetEl && preSnapshot.targetState) {
    const currentDisabled = (targetEl as any).disabled === true || targetEl.hasAttribute?.('disabled') || targetEl.getAttribute?.('aria-disabled') === 'true';
    const currentChecked = (targetEl as any).checked;
    const currentAriaExpanded = targetEl.getAttribute?.('aria-expanded');
    const currentAriaSelected = targetEl.getAttribute?.('aria-selected');
    const currentAriaChecked = targetEl.getAttribute?.('aria-checked');
    const currentClassList = Array.from(targetEl.classList || []).sort().join(' ');

    if (currentDisabled !== preSnapshot.targetState.disabled) {
      return {
        matched: true,
        reasonCode: 'TARGET_STATE_MUTATION_VERIFIED',
        message: 'Semantic state verified: target disabled state changed',
        matchedCondition: 'target_disabled_mutated'
      };
    }

    if (currentChecked !== undefined && currentChecked !== preSnapshot.targetState.checked) {
      return {
        matched: true,
        reasonCode: 'TARGET_STATE_MUTATION_VERIFIED',
        message: 'Semantic state verified: target checked state changed',
        matchedCondition: 'target_checked_mutated'
      };
    }

    if (currentAriaExpanded !== null && currentAriaExpanded !== undefined && currentAriaExpanded !== preSnapshot.targetState.ariaExpanded) {
      return {
        matched: true,
        reasonCode: 'TARGET_STATE_MUTATION_VERIFIED',
        message: 'Semantic state verified: target expansion state changed',
        matchedCondition: 'target_aria_expanded_mutated'
      };
    }

    if (currentAriaSelected !== null && currentAriaSelected !== undefined && currentAriaSelected !== preSnapshot.targetState.ariaSelected) {
      return {
        matched: true,
        reasonCode: 'TARGET_STATE_MUTATION_VERIFIED',
        message: 'Semantic state verified: target selection state changed',
        matchedCondition: 'target_aria_selected_mutated'
      };
    }

    if (currentAriaChecked !== null && currentAriaChecked !== undefined && currentAriaChecked !== preSnapshot.targetState.ariaChecked) {
      return {
        matched: true,
        reasonCode: 'TARGET_STATE_MUTATION_VERIFIED',
        message: 'Semantic state verified: target aria checked state changed',
        matchedCondition: 'target_aria_checked_mutated'
      };
    }

    if (currentClassList !== preSnapshot.targetState.classListSummary && currentClassList.length > 0) {
      return {
        matched: true,
        reasonCode: 'TARGET_STATE_MUTATION_VERIFIED',
        message: 'Semantic state verified: target class mutation occurred',
        matchedCondition: 'target_class_mutated'
      };
    }
  }

  // 7. Status Region Mutation
  const currentStatusEls = doc.querySelectorAll?.('[role="status"], [role="alert"], [aria-live]:not([aria-live="off"])') || [];
  if (currentStatusEls.length !== preSnapshot.statusRegionCount) {
    return {
      matched: true,
      reasonCode: 'STATUS_REGION_MUTATION_VERIFIED',
      message: 'Semantic state verified: status alert notification updated',
      matchedCondition: 'status_region_mutated'
    };
  }

  // 8. Landmark Structure Mutation
  const landmarkTags = ['main', 'nav', 'header', 'footer', 'aside', 'section'];
  for (const tag of landmarkTags) {
    const currentCount = doc.getElementsByTagName?.(tag)?.length || 0;
    const prevCount = preSnapshot.landmarkCounts[tag] || 0;
    if (currentCount !== prevCount) {
      return {
        matched: true,
        reasonCode: 'LANDMARK_MUTATION_VERIFIED',
        message: 'Semantic state verified: landmark structure mutated',
        matchedCondition: 'landmark_count_mutated'
      };
    }
  }

  // 9. Document Content / Generation Mutation (if document count changed)
  const currentDocCount = doc.getElementsByTagName?.('*')?.length || 0;
  if (Math.abs(currentDocCount - preSnapshot.documentElementCount) >= 1) {
    if (
      exp.includes('submit') ||
      exp.includes('dispatch') ||
      exp.includes('filter') ||
      exp.includes('update') ||
      exp.includes('table') ||
      exp.includes('card') ||
      exp.includes('interaction')
    ) {
      return {
        matched: true,
        reasonCode: 'TARGET_STATE_MUTATION_VERIFIED',
        message: 'Semantic state verified: document content mutated',
        matchedCondition: 'document_structure_mutated'
      };
    }
  }

  return {
    matched: false,
    reasonCode: 'CONDITION_NOT_MET',
    message: 'Semantic verification failed: expected postcondition was not observed'
  };
}

export class SemanticStateVerifier {
  /**
   * Captures a safe, non-sensitive pre-action semantic baseline snapshot.
   */
  static captureSnapshot(
    targetEl?: HTMLElement | null,
    doc: Document = typeof document !== 'undefined' ? document : (targetEl?.ownerDocument as Document)
  ): SafePreActionSnapshot {
    const timestamp = Date.now();
    if (!doc) {
      return {
        timestamp,
        pathFingerprint: '',
        openDialogOrDrawerCount: 0,
        openDialogIds: new Set(),
        landmarkCounts: {},
        statusRegionCount: 0,
        documentElementCount: 0
      };
    }

    const rawPath = doc.location?.pathname || '';
    const hash = doc.location?.hash || '';
    const pathFingerprint = `${rawPath}${hash ? `#${hash.replace(/^#/, '')}` : ''}`;

    const openDialogIds = new Set<string>();
    const dialogEls = doc.querySelectorAll?.(
      'dialog[open], .modal:not([hidden]):not(.hidden), .drawer:not([hidden]):not(.hidden), [role="dialog"], [aria-modal="true"], .preview-panel:not([hidden]):not(.hidden), #previewDrawer:not(.hidden), #preview-drawer:not(.hidden)'
    ) || [];

    for (let i = 0; i < dialogEls.length; i++) {
      const el = dialogEls[i] as HTMLElement;
      if (isElementVisible(el)) {
        openDialogIds.add(el.id || `dialog_${i}`);
      }
    }

    const landmarkCounts: Record<string, number> = {};
    const landmarkTags = ['main', 'nav', 'header', 'footer', 'aside', 'section'];
    for (const tag of landmarkTags) {
      const count = doc.getElementsByTagName?.(tag)?.length || 0;
      if (count > 0) landmarkCounts[tag] = count;
    }

    const statusEls = doc.querySelectorAll?.('[role="status"], [role="alert"], [aria-live]:not([aria-live="off"])') || [];
    const statusRegionCount = statusEls.length;

    let targetState: TargetSemanticState | undefined = undefined;
    if (targetEl) {
      const isInput = targetEl.tagName?.toLowerCase() === 'input';
      const isSelect = targetEl.tagName?.toLowerCase() === 'select';
      const isTextArea = targetEl.tagName?.toLowerCase() === 'textarea';

      targetState = {
        id: targetEl.id || undefined,
        tagName: targetEl.tagName?.toLowerCase(),
        role: targetEl.getAttribute?.('role') || undefined,
        disabled: (targetEl as any).disabled === true || targetEl.hasAttribute?.('disabled') || targetEl.getAttribute?.('aria-disabled') === 'true',
        checked: (targetEl as any).checked,
        readOnly: (targetEl as any).readOnly,
        selectedIndex: isSelect ? (targetEl as HTMLSelectElement).selectedIndex : undefined,
        ariaExpanded: targetEl.getAttribute?.('aria-expanded'),
        ariaSelected: targetEl.getAttribute?.('aria-selected'),
        ariaChecked: targetEl.getAttribute?.('aria-checked'),
        isFocused: doc.activeElement === targetEl,
        classListSummary: Array.from(targetEl.classList || []).sort().join(' '),
        valuePresence: isInput || isTextArea ? Boolean((targetEl as HTMLInputElement).value) : undefined
      };
    }

    const documentElementCount = doc.getElementsByTagName?.('*')?.length || 0;

    return {
      timestamp,
      pathFingerprint,
      openDialogOrDrawerCount: openDialogIds.size,
      openDialogIds,
      landmarkCounts,
      statusRegionCount,
      targetState,
      documentElementCount
    };
  }

  /**
   * Verifies that explicit bounded postconditions occurred after action execution.
   */
  static async verifyOutcome(
    proposal: ActionProposal,
    targetEl?: HTMLElement | null,
    preSnapshot?: SafePreActionSnapshot,
    options?: VerificationOptions
  ): Promise<VerificationOutcome> {
    const doc = options?.doc || (targetEl?.ownerDocument as Document) || (typeof document !== 'undefined' ? document : null);
    const timeoutMs = options?.timeoutMs ?? 150;
    const startTime = Date.now();

    const baseline = preSnapshot || SemanticStateVerifier.captureSnapshot(targetEl, doc || undefined);

    if (!doc) {
      return {
        verified: false,
        reasonCode: 'TARGET_ELEMENT_MISSING',
        message: 'Semantic verification failed: document host not available'
      };
    }

    // 1. Initial synchronous check
    const initialCheck = checkPostconditions(proposal, targetEl, baseline, doc);
    if (initialCheck.matched) {
      return {
        verified: true,
        reasonCode: initialCheck.reasonCode,
        message: initialCheck.message,
        details: {
          durationMs: Date.now() - startTime,
          matchedCondition: initialCheck.matchedCondition,
          corroboratedByImageDiff: options?.imageDiffCorroborated
        }
      };
    }

    // 2. If timeout is 0 or MutationObserver unavailable, return initial failure
    const win = doc.defaultView || (typeof window !== 'undefined' ? window : null);
    const MutationObserverCtor = win?.MutationObserver || (typeof MutationObserver !== 'undefined' ? MutationObserver : null);

    if (timeoutMs <= 0 || !MutationObserverCtor) {
      return {
        verified: false,
        reasonCode: initialCheck.reasonCode,
        message: initialCheck.message,
        details: {
          durationMs: Date.now() - startTime,
          corroboratedByImageDiff: options?.imageDiffCorroborated
        }
      };
    }

    // 3. Observe mutations with bounded timeout
    return new Promise<VerificationOutcome>((resolve) => {
      let settled = false;
      let mutationOccurred = false;
      let observer: MutationObserver | null = null;
      let timer: any = null;

      const cleanup = () => {
        if (settled) return;
        settled = true;
        if (timer) clearTimeout(timer);
        if (observer) {
          try {
            observer.disconnect();
          } catch (_) {}
        }
      };

      try {
        observer = new MutationObserverCtor((mutations) => {
          if (settled) return;
          if (mutations && mutations.length > 0) {
            mutationOccurred = true;
          }

          const check = checkPostconditions(proposal, targetEl, baseline, doc);
          if (check.matched) {
            cleanup();
            resolve({
              verified: true,
              reasonCode: check.reasonCode,
              message: check.message,
              details: {
                durationMs: Date.now() - startTime,
                matchedCondition: check.matchedCondition,
                corroboratedByImageDiff: options?.imageDiffCorroborated
              }
            });
          }
        });

        const targetNode = doc.body || doc.documentElement || doc;
        observer.observe(targetNode, {
          childList: true,
          subtree: true,
          attributes: true,
          characterData: false
        });
      } catch (_) {
        // Fallback
      }

      timer = setTimeout(() => {
        if (settled) return;
        cleanup();

        const finalCheck = checkPostconditions(proposal, targetEl, baseline, doc);
        if (finalCheck.matched) {
          resolve({
            verified: true,
            reasonCode: finalCheck.reasonCode,
            message: finalCheck.message,
            details: {
              durationMs: Date.now() - startTime,
              matchedCondition: finalCheck.matchedCondition,
              corroboratedByImageDiff: options?.imageDiffCorroborated
            }
          });
          return;
        }

        if (mutationOccurred) {
          resolve({
            verified: false,
            reasonCode: 'UNRELATED_MUTATION',
            message: 'Semantic verification failed: DOM mutations occurred but did not satisfy the expected postcondition',
            details: {
              durationMs: Date.now() - startTime,
              corroboratedByImageDiff: options?.imageDiffCorroborated
            }
          });
        } else {
          resolve({
            verified: false,
            reasonCode: 'TIMEOUT_EXPIRED',
            message: 'Semantic verification failed: bounded timeout expired without observing expected postcondition',
            details: {
              durationMs: Date.now() - startTime,
              corroboratedByImageDiff: options?.imageDiffCorroborated
            }
          });
        }
      }, timeoutMs);
    });
  }
}


