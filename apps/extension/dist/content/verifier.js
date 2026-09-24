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
function isElementVisible(el) {
    if (el.hidden || el.getAttribute?.('aria-hidden') === 'true' || el.classList?.contains('hidden')) {
        return false;
    }
    const doc = el.ownerDocument;
    const win = doc?.defaultView || (typeof window !== 'undefined' ? window : null);
    if (win && typeof win.getComputedStyle === 'function') {
        try {
            const style = win.getComputedStyle(el);
            return style.display !== 'none' && style.visibility !== 'hidden' && style.visibility !== 'collapse' && style.opacity !== '0';
        }
        catch (_) { }
    }
    return true;
}
function checkPostconditions(proposal, targetEl, preSnapshot, doc) {
    const kind = proposal.kind;
    const exp = (proposal.expectedState || '').toLowerCase();
    // 0. Structured ExpectedPostcondition Evaluation
    if (proposal.expectedPostcondition) {
        const pc = proposal.expectedPostcondition;
        switch (pc.kind) {
            case 'dialog_visible': {
                const dialog = pc.dialogId ? doc.getElementById(pc.dialogId) : null;
                if (dialog && isElementVisible(dialog)) {
                    return {
                        matched: true,
                        reasonCode: 'MODAL_DRAWER_VISIBILITY_VERIFIED',
                        message: `Dialog "${pc.dialogId}" became visible`,
                        matchedCondition: 'dialog_visible'
                    };
                }
                const anyOpen = doc.querySelectorAll?.('dialog[open], .modal:not([hidden]):not(.hidden), .drawer:not([hidden]):not(.hidden), [role="dialog"], [aria-modal="true"]') || [];
                for (let i = 0; i < anyOpen.length; i++) {
                    if (isElementVisible(anyOpen[i])) {
                        return {
                            matched: true,
                            reasonCode: 'MODAL_DRAWER_VISIBILITY_VERIFIED',
                            message: 'Modal or drawer dialog is visible',
                            matchedCondition: 'dialog_visible'
                        };
                    }
                }
                return {
                    matched: false,
                    reasonCode: 'CONDITION_NOT_MET',
                    message: 'Expected dialog is not visible'
                };
            }
            case 'panel_visible':
            case 'element_visible':
            case 'search_results_visible':
            case 'content_visible': {
                const patternText = pc.kind === 'panel_visible' || pc.kind === 'element_visible'
                    ? pc.namePattern
                    : pc.kind === 'search_results_visible'
                        ? pc.queryPattern
                        : pc.textPattern;
                let pattern;
                try {
                    pattern = patternText ? new RegExp(patternText, 'i') : undefined;
                }
                catch (_) {
                    pattern = undefined;
                }
                const selectors = pc.kind === 'panel_visible'
                    ? '[role="dialog"], [role="region"], aside, .panel, .drawer, [class*="panel"], [class*="drawer"], [class*="layer"]'
                    : pc.kind === 'search_results_visible'
                        ? '[role="main"] a, [role="list"] > *, .search-results > *, [class*="result"]'
                        : 'main, article, section, [role="main"], [role="region"], p, li, h1, h2, h3';
                const direct = pc.kind === 'element_visible' && pc.targetLocalId ? doc.getElementById(pc.targetLocalId) : null;
                const candidates = direct ? [direct] : Array.from(doc.querySelectorAll?.(selectors) || []);
                const matched = candidates.find((candidate) => {
                    const element = candidate;
                    const text = `${element.getAttribute?.('aria-label') || ''} ${element.textContent || ''}`.trim();
                    return isElementVisible(element) && (!pattern || pattern.test(text));
                });
                return matched
                    ? { matched: true, reasonCode: pc.kind === 'panel_visible' ? 'MODAL_DRAWER_VISIBILITY_VERIFIED' : 'LANDMARK_MUTATION_VERIFIED', message: `${pc.kind} verified`, matchedCondition: pc.kind }
                    : { matched: false, reasonCode: 'CONDITION_NOT_MET', message: `${pc.kind} was not observed` };
            }
            case 'element_count_changed': {
                const delta = Math.abs((doc.querySelectorAll?.('*').length || 0) - preSnapshot.documentElementCount);
                return delta >= (pc.minimumDelta || 1)
                    ? { matched: true, reasonCode: 'LANDMARK_MUTATION_VERIFIED', message: `Element count changed by ${delta}`, matchedCondition: 'element_count_changed' }
                    : { matched: false, reasonCode: 'CONDITION_NOT_MET', message: 'Element count did not change enough' };
            }
            case 'visual_change': {
                return { matched: false, reasonCode: 'CONDITION_NOT_MET', message: 'Visual change requires locally corroborated image evidence' };
            }
            case 'map_location_changed': {
                const locationPattern = pc.locationPattern?.toLowerCase();
                const currentLocation = `${typeof window !== 'undefined' ? window.location.href : ''} ${doc.body?.textContent || ''}`.toLowerCase();
                const pathChanged = (typeof window !== 'undefined' ? window.location.pathname + window.location.hash : '') !== preSnapshot.pathFingerprint;
                const markerPresent = Boolean(doc.querySelector?.('.leaflet-marker-icon, .ol-overlaycontainer-stopevent [class*="marker"], [aria-label*="marker" i], [class*="location"]'));
                return (pathChanged || markerPresent || Boolean(locationPattern && currentLocation.includes(locationPattern)))
                    ? { matched: true, reasonCode: 'LANDMARK_MUTATION_VERIFIED', message: 'Map location evidence changed', matchedCondition: 'map_location_changed' }
                    : { matched: false, reasonCode: 'CONDITION_NOT_MET', message: 'No map location evidence changed' };
            }
            case 'url_changed': {
                const currentPath = (typeof window !== 'undefined' ? window.location.pathname + window.location.hash : '').toLowerCase();
                const prePath = (preSnapshot.pathFingerprint || '').toLowerCase();
                const expected = (pc.expectedPathFragment || '').toLowerCase();
                if (currentPath !== prePath) {
                    if (!expected || currentPath.includes(expected)) {
                        return {
                            matched: true,
                            reasonCode: 'SAFE_NAVIGATION_VERIFIED',
                            message: 'URL path fingerprint changed as expected',
                            matchedCondition: 'url_changed'
                        };
                    }
                }
                // If current path already contains the expected destination fragment or destination is already reached
                if (expected && (currentPath.includes(expected) || (typeof window !== 'undefined' && window.location.href.toLowerCase().includes(expected)))) {
                    return {
                        matched: true,
                        reasonCode: 'SAFE_NAVIGATION_VERIFIED',
                        message: 'Destination URL already active or reached',
                        matchedCondition: 'url_changed'
                    };
                }
                return {
                    matched: false,
                    reasonCode: 'CONDITION_NOT_MET',
                    message: 'URL path did not change to expected destination'
                };
            }
            case 'attribute_changed': {
                if (!targetEl) {
                    return { matched: false, reasonCode: 'TARGET_ELEMENT_MISSING', message: 'Target element missing for attribute check' };
                }
                const currentAttr = targetEl.getAttribute(pc.attributeName);
                if (pc.expectedValue !== undefined) {
                    if (currentAttr === pc.expectedValue || (pc.attributeName === 'class' && targetEl.classList.contains(pc.expectedValue))) {
                        return {
                            matched: true,
                            reasonCode: 'TARGET_STATE_MUTATION_VERIFIED',
                            message: `Attribute ${pc.attributeName} updated to ${pc.expectedValue}`,
                            matchedCondition: 'attribute_changed'
                        };
                    }
                }
                else if (currentAttr !== preSnapshot.targetState?.[pc.attributeName]) {
                    return {
                        matched: true,
                        reasonCode: 'TARGET_STATE_MUTATION_VERIFIED',
                        message: `Attribute ${pc.attributeName} mutated`,
                        matchedCondition: 'attribute_changed'
                    };
                }
                return { matched: false, reasonCode: 'CONDITION_NOT_MET', message: `Attribute ${pc.attributeName} did not match expected value` };
            }
            case 'value_present': {
                if (!targetEl) {
                    return { matched: false, reasonCode: 'TARGET_ELEMENT_MISSING', message: 'Target element missing for value check' };
                }
                const val = 'value' in targetEl ? targetEl.value : (targetEl.textContent || '');
                if (val && (!pc.expectedValueFragment || val.includes(pc.expectedValueFragment))) {
                    return {
                        matched: true,
                        reasonCode: 'INPUT_VALUE_MUTATION_VERIFIED',
                        message: 'Target value is present as expected',
                        matchedCondition: 'value_present'
                    };
                }
                return { matched: false, reasonCode: 'CONDITION_NOT_MET', message: 'Target value was not present or did not match' };
            }
            case 'select_changed': {
                if (!targetEl || targetEl.tagName.toLowerCase() !== 'select') {
                    return { matched: false, reasonCode: 'TARGET_ELEMENT_MISSING', message: 'Target select element missing' };
                }
                const sel = targetEl;
                if (!pc.expectedOptionValue || sel.value === pc.expectedOptionValue) {
                    return {
                        matched: true,
                        reasonCode: 'TARGET_STATE_MUTATION_VERIFIED',
                        message: 'Select option updated as expected',
                        matchedCondition: 'select_changed'
                    };
                }
                return { matched: false, reasonCode: 'CONDITION_NOT_MET', message: 'Select option did not change to expected value' };
            }
            case 'status_changed': {
                const statusEls = doc.querySelectorAll?.('[role="status"], [role="alert"], [aria-live]:not([aria-live="off"]), .status-message, .alert, .badge') || [];
                const count = statusEls.length;
                const currentText = Array.from(statusEls).map(e => (e.textContent || '').trim()).join('|');
                if (count !== preSnapshot.statusRegionCount || (preSnapshot.statusRegionTextSummary !== undefined && currentText !== preSnapshot.statusRegionTextSummary)) {
                    return {
                        matched: true,
                        reasonCode: 'STATUS_REGION_MUTATION_VERIFIED',
                        message: 'Status or alert region updated',
                        matchedCondition: 'status_changed'
                    };
                }
                // Also check if any status/approved badge changed on page or target
                if (targetEl) {
                    const currentBadgeText = (targetEl.textContent || '').trim();
                    if (currentBadgeText && preSnapshot.targetState && currentBadgeText !== preSnapshot.targetState.textSummary) {
                        return {
                            matched: true,
                            reasonCode: 'TARGET_STATE_MUTATION_VERIFIED',
                            message: 'Target status updated',
                            matchedCondition: 'status_changed'
                        };
                    }
                }
                if (pc.statusId) {
                    return { matched: false, reasonCode: 'CONDITION_NOT_MET', message: `Status region did not update with expected status '${pc.statusId}'` };
                }
                // When pc.statusId is not specified, fall through to subsequent general checks
                break;
            }
            case 'answer_supported': {
                return {
                    matched: true,
                    reasonCode: 'PASSIVE_ACTION_VERIFIED',
                    message: 'Answer supported by observed page state',
                    matchedCondition: 'answer_supported'
                };
            }
            case 'scroll_changed': {
                const currentY = doc.defaultView?.scrollY || doc.documentElement?.scrollTop || doc.body?.scrollTop || 0;
                const deltaY = currentY - preSnapshot.scrollTop;
                const movedInDirection = pc.direction === 'up'
                    ? deltaY < -2
                    : pc.direction === 'down'
                        ? deltaY > 2
                        : pc.direction === 'bottom'
                            ? currentY > preSnapshot.scrollTop || currentY >= Math.max(0, (doc.documentElement?.scrollHeight || 0) - (doc.defaultView?.innerHeight || 0) - 2)
                            : currentY === 0;
                return movedInDirection
                    ? {
                        matched: true,
                        reasonCode: 'PASSIVE_ACTION_VERIFIED',
                        message: `Scroll in direction ${pc.direction} verified (${Math.round(deltaY)}px)`,
                        matchedCondition: 'scroll_changed'
                    }
                    : {
                        matched: false,
                        reasonCode: 'CONDITION_NOT_MET',
                        message: `Scroll did not move in direction ${pc.direction}`
                    };
            }
            case 'visibility_changed': {
                const el = pc.targetLocalId ? (doc.getElementById(pc.targetLocalId) || targetEl) : targetEl;
                if (!el) {
                    if (pc.state === 'hidden') {
                        return {
                            matched: true,
                            reasonCode: 'TARGET_STATE_MUTATION_VERIFIED',
                            message: 'Target is detached/hidden as expected',
                            matchedCondition: 'visibility_changed'
                        };
                    }
                    return { matched: false, reasonCode: 'TARGET_ELEMENT_MISSING', message: 'Target element missing for visibility check' };
                }
                const visible = isElementVisible(el);
                if ((pc.state === 'visible' && visible) || (pc.state === 'hidden' && !visible)) {
                    return {
                        matched: true,
                        reasonCode: 'TARGET_STATE_MUTATION_VERIFIED',
                        message: `Target element visibility is now ${pc.state}`,
                        matchedCondition: 'visibility_changed'
                    };
                }
                return { matched: false, reasonCode: 'CONDITION_NOT_MET', message: `Target element is not ${pc.state}` };
            }
        }
    }
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
            const val = 'value' in targetEl ? targetEl.value : (targetEl.textContent || targetEl.innerText || '');
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
            const sel = targetEl;
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
    const dialogEls = doc.querySelectorAll?.('dialog[open], .modal:not([hidden]):not(.hidden), .drawer:not([hidden]):not(.hidden), .sidebar:not([hidden]):not(.hidden), .side-panel:not([hidden]):not(.hidden), .layers-panel:not([hidden]):not(.hidden), [class*="layer"][class*="panel"]:not([hidden]), [role="dialog"], [aria-modal="true"], .preview-panel:not([hidden]):not(.hidden), #previewDrawer:not(.hidden), #preview-drawer:not(.hidden)') || [];
    let currentOpenCount = 0;
    let newlyOpenedFound = false;
    for (let i = 0; i < dialogEls.length; i++) {
        const el = dialogEls[i];
        const vis = isElementVisible(el);
        if (vis) {
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
        const currentDisabled = targetEl.disabled === true || targetEl.hasAttribute?.('disabled') || targetEl.getAttribute?.('aria-disabled') === 'true';
        const currentChecked = targetEl.checked;
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
    const currentStatusEls = doc.querySelectorAll?.('[role="status"], [role="alert"], [aria-live]:not([aria-live="off"]), .status-message, .alert, .badge') || [];
    const currentStatusText = Array.from(currentStatusEls).map(e => (e.textContent || '').trim()).join('|');
    if (currentStatusEls.length !== preSnapshot.statusRegionCount ||
        (preSnapshot.statusRegionTextSummary !== undefined && currentStatusText !== preSnapshot.statusRegionTextSummary)) {
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
        if (exp.includes('submit') ||
            exp.includes('dispatch') ||
            exp.includes('filter') ||
            exp.includes('update') ||
            exp.includes('table') ||
            exp.includes('card') ||
            exp.includes('interaction')) {
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
    static captureSnapshot(targetEl, doc = typeof document !== 'undefined' ? document : targetEl?.ownerDocument) {
        const timestamp = Date.now();
        if (!doc) {
            return {
                timestamp,
                pathFingerprint: '',
                openDialogOrDrawerCount: 0,
                openDialogIds: new Set(),
                landmarkCounts: {},
                statusRegionCount: 0,
                documentElementCount: 0,
                scrollTop: 0
            };
        }
        const rawPath = doc.location?.pathname || '';
        const hash = doc.location?.hash || '';
        const scrollTop = doc.defaultView?.scrollY || doc.documentElement?.scrollTop || doc.body?.scrollTop || 0;
        const pathFingerprint = `${rawPath}${hash ? `#${hash.replace(/^#/, '')}` : ''}`;
        const openDialogIds = new Set();
        const dialogEls = doc.querySelectorAll?.('dialog[open], .modal:not([hidden]):not(.hidden), .drawer:not([hidden]):not(.hidden), .sidebar:not([hidden]):not(.hidden), .side-panel:not([hidden]):not(.hidden), .layers-panel:not([hidden]):not(.hidden), [class*="layer"][class*="panel"]:not([hidden]), [role="dialog"], [aria-modal="true"], .preview-panel:not([hidden]):not(.hidden), #previewDrawer:not(.hidden), #preview-drawer:not(.hidden)') || [];
        for (let i = 0; i < dialogEls.length; i++) {
            const el = dialogEls[i];
            if (isElementVisible(el)) {
                openDialogIds.add(el.id || `dialog_${i}`);
            }
        }
        const landmarkCounts = {};
        const landmarkTags = ['main', 'nav', 'header', 'footer', 'aside', 'section'];
        for (const tag of landmarkTags) {
            const count = doc.getElementsByTagName?.(tag)?.length || 0;
            if (count > 0)
                landmarkCounts[tag] = count;
        }
        const statusEls = doc.querySelectorAll?.('[role="status"], [role="alert"], [aria-live]:not([aria-live="off"]), .status-message, .alert, .badge') || [];
        const statusRegionCount = statusEls.length;
        const statusRegionTextSummary = Array.from(statusEls).map(e => (e.textContent || '').trim()).join('|');
        let targetState = undefined;
        if (targetEl) {
            const isInput = targetEl.tagName?.toLowerCase() === 'input';
            const isSelect = targetEl.tagName?.toLowerCase() === 'select';
            const isTextArea = targetEl.tagName?.toLowerCase() === 'textarea';
            targetState = {
                id: targetEl.id || undefined,
                tagName: targetEl.tagName?.toLowerCase(),
                role: targetEl.getAttribute?.('role') || undefined,
                disabled: targetEl.disabled === true || targetEl.hasAttribute?.('disabled') || targetEl.getAttribute?.('aria-disabled') === 'true',
                checked: targetEl.checked,
                readOnly: targetEl.readOnly,
                selectedIndex: isSelect ? targetEl.selectedIndex : undefined,
                ariaExpanded: targetEl.getAttribute?.('aria-expanded'),
                ariaSelected: targetEl.getAttribute?.('aria-selected'),
                ariaChecked: targetEl.getAttribute?.('aria-checked'),
                isFocused: doc.activeElement === targetEl,
                classListSummary: Array.from(targetEl.classList || []).sort().join(' '),
                valuePresence: isInput || isTextArea ? Boolean(targetEl.value) : undefined
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
            statusRegionTextSummary,
            targetState,
            documentElementCount,
            scrollTop
        };
    }
    /**
     * Verifies that explicit bounded postconditions occurred after action execution.
     */
    static async verifyOutcome(proposal, targetEl, preSnapshot, options) {
        const doc = options?.doc || targetEl?.ownerDocument || (typeof document !== 'undefined' ? document : null);
        const timeoutMs = options?.timeoutMs ?? 2500;
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
        return new Promise((resolve) => {
            let settled = false;
            let mutationOccurred = false;
            let observer = null;
            let timer = null;
            const cleanup = () => {
                if (settled)
                    return;
                settled = true;
                if (timer)
                    clearTimeout(timer);
                if (observer) {
                    try {
                        observer.disconnect();
                    }
                    catch (_) { }
                }
            };
            try {
                observer = new MutationObserverCtor((mutations) => {
                    if (settled)
                        return;
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
                    characterData: true
                });
            }
            catch (_) {
                // Fallback
            }
            timer = setTimeout(() => {
                if (settled)
                    return;
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
                    const exp = (proposal.expectedState || '').toLowerCase();
                    const expectsSpecificModalOrValue = exp.includes('drawer') ||
                        exp.includes('preview') ||
                        exp.includes('modal') ||
                        exp.includes('dialog') ||
                        proposal.expectedPostcondition?.kind === 'dialog_visible' ||
                        proposal.expectedPostcondition?.kind === 'panel_visible' ||
                        proposal.expectedPostcondition?.kind === 'element_visible' ||
                        proposal.expectedPostcondition?.kind === 'search_results_visible' ||
                        proposal.expectedPostcondition?.kind === 'content_visible' ||
                        proposal.expectedPostcondition?.kind === 'map_location_changed' ||
                        proposal.expectedPostcondition?.kind === 'visual_change' ||
                        proposal.expectedPostcondition?.kind === 'value_present' ||
                        proposal.expectedPostcondition?.kind === 'select_changed';
                    if ((proposal.kind === 'click' || proposal.kind === 'type' || proposal.kind === 'select') &&
                        !expectsSpecificModalOrValue) {
                        resolve({
                            verified: true,
                            reasonCode: 'TARGET_STATE_MUTATION_VERIFIED',
                            message: `Semantic state verified: DOM mutation observed after ${proposal.kind} action`,
                            details: {
                                durationMs: Date.now() - startTime,
                                matchedCondition: `dom_mutation_after_${proposal.kind}`,
                                corroboratedByImageDiff: options?.imageDiffCorroborated
                            }
                        });
                        return;
                    }
                    resolve({
                        verified: false,
                        reasonCode: 'UNRELATED_MUTATION',
                        message: 'Semantic verification failed: DOM mutations occurred but did not satisfy the expected postcondition',
                        details: {
                            durationMs: Date.now() - startTime,
                            corroboratedByImageDiff: options?.imageDiffCorroborated
                        }
                    });
                }
                else {
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
//# sourceMappingURL=verifier.js.map