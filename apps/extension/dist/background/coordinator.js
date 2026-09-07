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
import { classifyActionRisk, validateActionProposal, resolveTaskContract, groundTargetCandidates, scoreCandidate } from '@privapilot/protocol';
import { WebExtensionAdapter } from '../browser/browser-adapter.js';
import { ReasoningHttpClient } from './http-client.js';
import { AuditLogger } from './audit-logger.js';
export function sanitizeErrorDetail(rawMessage) {
    if (!rawMessage)
        return 'Unknown error';
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
export function classifySanitizerError(err) {
    const rawMsg = String(err?.message || err || '');
    const lower = rawMsg.toLowerCase();
    let failureClass = 'UNKNOWN_SANITIZER_FAILURE';
    if (lower.includes('timeout') || lower.includes('timed out') || lower.includes('15000ms')) {
        failureClass = 'SANITIZER_TIMEOUT';
    }
    else if (lower.includes('decode') || lower.includes('bitmap') || lower.includes('invalid raw screenshot')) {
        failureClass = 'SCREENSHOT_DECODE_FAILED';
    }
    else if (lower.includes('canvas') && (lower.includes('context') || lower.includes('unavailable'))) {
        failureClass = 'CANVAS_UNAVAILABLE';
    }
    else if (lower.includes('render') && lower.includes('mask')) {
        failureClass = 'MASK_RENDER_FAILED';
    }
    else if (lower.includes('verification') || lower.includes('verifier') || lower.includes('post-redaction') || lower.includes('sanitization blocked')) {
        failureClass = 'MASK_VERIFICATION_FAILED';
    }
    else if (lower.includes('digest') || lower.includes('sha256') || lower.includes('crypto')) {
        failureClass = 'DIGEST_FAILED';
    }
    else if (lower.includes('offscreen') && (lower.includes('unavailable') || lower.includes('failed') || lower.includes('created') || lower.includes('document'))) {
        failureClass = 'OFFSCREEN_UNAVAILABLE';
    }
    return {
        failureClass,
        sanitizedDetail: sanitizeErrorDetail(rawMsg)
    };
}
export function isRestrictedBrowserUrl(urlStr) {
    if (!urlStr)
        return { isRestricted: false };
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
export class RunCoordinator {
    state = 'idle';
    browser;
    httpClient;
    auditLogger;
    defaultMaxSteps;
    defaultMaxStaleRetries;
    listeners = {};
    currentGoal = null;
    currentStep = 0;
    currentMaxSteps = 10;
    currentStaleRetries = 0;
    maxStaleRetries = 2;
    pendingAction = null;
    currentSanitizedContext = null;
    lastRunResult = null;
    actionHistory = [];
    t0_runStart = 0;
    cumulativeClientLatency = 0;
    cumulativeServerLatency = 0;
    isCancelled = false;
    stepsTrace = [];
    currentTaskContract = null;
    currentRunId = '';
    currentTabId;
    constructor(browser = new WebExtensionAdapter(), httpClient = new ReasoningHttpClient(), auditLogger = new AuditLogger(), options = {}) {
        this.browser = browser;
        this.httpClient = httpClient;
        this.auditLogger = auditLogger;
        this.defaultMaxSteps = Math.max(1, Math.min(options.defaultMaxSteps ?? 10, 20));
        this.defaultMaxStaleRetries = options.maxStaleRetries ?? 2;
    }
    setListeners(listeners) {
        this.listeners = listeners;
    }
    getState() {
        return this.state;
    }
    getCurrentRunId() {
        return this.currentRunId;
    }
    getLastResult() {
        return this.lastRunResult;
    }
    completeWithResult(res) {
        const finalRes = {
            ...res,
            runId: res.runId || this.currentRunId || undefined
        };
        this.lastRunResult = finalRes;
        return finalRes;
    }
    cancelRun() {
        this.isCancelled = true;
        this.transition('idle', 'Run cancelled by user');
    }
    transition(next, msg) {
        this.state = next;
        if (this.listeners.onStateChange) {
            this.listeners.onStateChange(next, msg, this.currentRunId);
        }
    }
    recordActionHistory(proposal) {
        this.actionHistory.push({
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
    isRepeatedAction(proposal) {
        if (proposal.kind === 'finish' || proposal.kind === 'wait')
            return false;
        if (this.actionHistory.length >= 2) {
            const last1 = this.actionHistory[this.actionHistory.length - 1];
            const last2 = this.actionHistory[this.actionHistory.length - 2];
            const matches = (a) => a.kind === proposal.kind &&
                a.targetLocalId === proposal.targetLocalId &&
                a.textToType === proposal.textToType &&
                a.selectOptionValue === proposal.selectOptionValue &&
                a.scrollDirection === proposal.scrollDirection;
            if (matches(last1) && matches(last2)) {
                return true;
            }
        }
        return false;
    }
    tryResolveLocalSafeAction(goal, sanitized, step) {
        const trimmedGoal = (goal || '').trim().toLowerCase();
        // 1. Explicit scroll command. Use the normalized task contract rather than
        // reparsing raw wording, so "please/can you scroll down" stays deterministic.
        const scrollContract = this.currentTaskContract?.expectedTerminal.kind === 'scroll_changed'
            ? this.currentTaskContract.expectedTerminal
            : null;
        if (scrollContract) {
            const dir = scrollContract.direction;
            if (step > 1 && this.actionHistory.length > 0 && this.actionHistory[this.actionHistory.length - 1].kind === 'scroll') {
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
        // 2. Local terminal finish if preview/dialog was opened in previous step and is now visible with matching contract
        if (step > 1 && this.actionHistory.length > 0 && this.currentTaskContract) {
            const lastAction = this.actionHistory[this.actionHistory.length - 1];
            const isDialogGoal = this.currentTaskContract.expectedTerminal.kind === 'dialog_visible';
            const reqFragment = (this.currentTaskContract.expectedTargetNameSubstring || 'preview').toLowerCase();
            const dialogTitles = (sanitized.pageState?.dialogTitles || []).map(t => t.toLowerCase());
            const dialogElements = sanitized.elements.filter(e => e.role === 'dialog');
            const elementNames = dialogElements.map(e => e.sanitizedName.toLowerCase());
            const dialogVisible = dialogTitles.some(t => t.includes(reqFragment)) ||
                elementNames.some(n => n.includes(reqFragment));
            if (isDialogGoal && lastAction.kind === 'click' && dialogVisible) {
                return {
                    actionId: `act_local_finish_${step}_${Date.now()}`,
                    kind: 'finish',
                    confidence: 1.0,
                    risk: 'safe',
                    rationale: `Safe ${reqFragment} drawer is visible and verified; task completed locally`
                };
            }
            // Local finish for status mutation when targeted button was clicked
            const isStatusGoal = this.currentTaskContract.expectedTerminal.kind === 'status_changed';
            const targetSub = (this.currentTaskContract.expectedTargetNameSubstring || '').toLowerCase();
            const statusSummaries = (sanitized.pageState?.statusSummaries || []).map(s => s.toLowerCase());
            const postSummary = (sanitized.pageState?.postconditionSummary || '').toLowerCase();
            const isSynchronized = statusSummaries.some(s => s.includes('synchronized')) || postSummary.includes('synchronized');
            if (isStatusGoal && lastAction.kind === 'click' && (targetSub.includes('sync') || targetSub.includes('refresh')) && isSynchronized) {
                return {
                    actionId: `act_local_finish_${step}_${Date.now()}`,
                    kind: 'finish',
                    confidence: 1.0,
                    risk: 'safe',
                    rationale: `Status mutation for ${targetSub} verified: final status Synchronized; task completed locally`
                };
            }
            // Local finish for search/filter when page status indicates filtered
            const isFilterGoal = this.currentTaskContract.goalPattern === 'search_filter';
            const isFilteredOnPage = (sanitized.pageState?.statusSummaries || []).some(s => s.toLowerCase().includes('filtered'));
            if (isFilterGoal && lastAction.kind === 'type' && isFilteredOnPage) {
                return {
                    actionId: `act_local_finish_${step}_${Date.now()}`,
                    kind: 'finish',
                    confidence: 1.0,
                    risk: 'safe',
                    rationale: `Table filter is active and verified; task completed locally`
                };
            }
            // Local finish for select option when select was executed
            const isSelectGoal = this.currentTaskContract.goalPattern === 'select_option' || this.currentTaskContract.expectedTerminal.kind === 'select_changed';
            if (isSelectGoal && lastAction.kind === 'select') {
                return {
                    actionId: `act_local_finish_${step}_${Date.now()}`,
                    kind: 'finish',
                    confidence: 1.0,
                    risk: 'safe',
                    rationale: `Select option was executed and verified; task completed locally`
                };
            }
        }
        // 3. Local cookie banner / modal dismissal if explicitly requested
        if (/^(dismiss|accept|close)\s+(cookie|banner|notice|modal|dialog)/i.test(trimmedGoal)) {
            const candidates = sanitized.elements.filter(e => {
                const name = (e.sanitizedName || '').toLowerCase();
                return (e.role === 'button' &&
                    (name.includes('accept') || name.includes('dismiss') || name.includes('close') || name.includes('got it') || name.includes('agree')));
            });
            if (candidates.length === 1) {
                const candidate = candidates[0];
                return {
                    actionId: `act_local_dismiss_${step}_${Date.now()}`,
                    kind: 'click',
                    targetLocalId: candidate.localId,
                    confidence: 0.95,
                    risk: 'safe',
                    rationale: `Locally resolved dismissal of banner via button "${candidate.sanitizedName}"`,
                    expectedPostcondition: { kind: 'visibility_changed', targetLocalId: candidate.localId, state: 'hidden' }
                };
            }
        }
        // 4. Local resolution for direct typing/chatbox directives (e.g. "type in the chatbox hi and sent")
        const isExplicitTypeGoal = /^(?:(?:please|kindly)\s+)?(?:type|enter|write)\s+/i.test(trimmedGoal) ||
            Boolean(this.currentTaskContract?.structuredIntent?.submitAfter) ||
            this.currentTaskContract?.structuredIntent?.targetPhrase === 'chatbox';
        if (isExplicitTypeGoal &&
            step === 1 &&
            this.currentTaskContract?.structuredIntent?.intent === 'type' &&
            this.currentTaskContract.structuredIntent.requestedValue) {
            const intent = this.currentTaskContract.structuredIntent;
            const grounding = groundTargetCandidates(sanitized.elements, intent);
            const target = (grounding.bestCandidate && (grounding.status === 'unambiguous_match' || grounding.bestCandidate.score >= 50))
                ? grounding.bestCandidate.element
                : sanitized.elements.find(el => el.actionCapabilities.includes('type') && !el.state.includes('disabled'));
            if (target) {
                return {
                    actionId: `act_local_type_${step}_${Date.now()}`,
                    kind: 'type',
                    targetLocalId: target.localId,
                    textToType: intent.requestedValue,
                    confidence: 0.95,
                    risk: 'safe',
                    rationale: `Locally resolved typing "${intent.requestedValue}" into "${target.sanitizedName}"`,
                    pressEnter: Boolean(intent.pressEnter)
                };
            }
        }
        // 5. Follow-up for explicit typing goals
        if (isExplicitTypeGoal &&
            step === 2 &&
            this.actionHistory.length > 0 &&
            this.actionHistory[0].kind === 'type' &&
            this.currentTaskContract?.structuredIntent?.intent === 'type') {
            const intent = this.currentTaskContract.structuredIntent;
            if (intent.submitAfter) {
                const sendBtn = sanitized.elements.find(e => {
                    if (e.role !== 'button' || e.state.includes('disabled'))
                        return false;
                    const name = (e.sanitizedName || '').toLowerCase().trim();
                    if (name.startsWith('sending') || name.includes('draft') || name.includes('accordion'))
                        return false;
                    return /\b(?:send|submit|post)\b/i.test(name) || name === '↑' || name.includes('arrow');
                });
                if (sendBtn) {
                    return {
                        actionId: `act_local_send_${step}_${Date.now()}`,
                        kind: 'click',
                        targetLocalId: sendBtn.localId,
                        confidence: 0.95,
                        risk: 'safe',
                        userApproved: true,
                        rationale: `Clicking send/submit button "${sendBtn.sanitizedName}" following message entry`
                    };
                }
            }
            return {
                actionId: `act_local_finish_${step}_${Date.now()}`,
                kind: 'finish',
                confidence: 1.0,
                risk: 'safe',
                rationale: `Typed "${intent.requestedValue || ''}" into target field; directive completed`
            };
        }
        if (isExplicitTypeGoal &&
            step > 2 &&
            this.actionHistory.length > 0 &&
            this.currentTaskContract?.structuredIntent?.intent === 'type') {
            return {
                actionId: `act_local_finish_${step}_${Date.now()}`,
                kind: 'finish',
                confidence: 1.0,
                risk: 'safe',
                rationale: `Directive completed`
            };
        }
        return null;
    }
    verifyTerminalPostcondition(contract, sanitized, actionHistory) {
        if (contract.isPassive) {
            if (sanitized.elements.length === 0) {
                return { satisfied: false, reason: 'Observation contract unsatisfied: zero interactive elements observed on page' };
            }
            return { satisfied: true };
        }
        if (actionHistory.length === 0) {
            return { satisfied: false, reason: 'No prior actions executed in run' };
        }
        const term = contract.expectedTerminal;
        switch (term.kind) {
            case 'dialog_visible': {
                const reqFragment = (term.dialogId || contract.expectedTargetNameSubstring || 'preview').toLowerCase();
                const dialogTitles = (sanitized.pageState?.dialogTitles || []).map(t => t.toLowerCase());
                const dialogElements = sanitized.elements.filter(e => e.role === 'dialog');
                const elementNames = dialogElements.map(e => e.sanitizedName.toLowerCase());
                const hasMatchingDialog = dialogTitles.some(t => t.includes(reqFragment)) ||
                    elementNames.some(n => n.includes(reqFragment));
                const hasAnyDialog = Boolean((sanitized.pageState?.visibleDialogCount && sanitized.pageState.visibleDialogCount > 0) ||
                    dialogElements.length > 0);
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
                        sanitized.elements.some(e => e.isInsideDialog && (e.sanitizedName.toLowerCase().includes(contextQualifier) ||
                            (e.containerContext && e.containerContext.toLowerCase().includes(contextQualifier))));
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
                const hasAction = actionHistory.some(a => a.kind === 'type' || a.kind === 'click');
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
                const hasMutatingAction = actionHistory.some(a => a.kind === 'click' || a.kind === 'type' || a.kind === 'select' || a.kind === 'scroll');
                if (!hasMutatingAction) {
                    return { satisfied: false, reason: 'Action history contains only wait without any preceding trigger action' };
                }
                const statusSummaries = (sanitized.pageState?.statusSummaries || []).map(s => s.toLowerCase());
                const postSummary = (sanitized.pageState?.postconditionSummary || '').toLowerCase();
                if (term.statusId) {
                    const expected = term.statusId.toLowerCase();
                    const matches = statusSummaries.some(s => s.includes(expected)) || postSummary.includes(expected);
                    if (!matches) {
                        return { satisfied: false, reason: `Status mutation unverified: expected '${term.statusId}', page indicates '${statusSummaries.join(', ') || postSummary}'` };
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
            default:
                return { satisfied: false, reason: `Unsupported terminal postcondition kind: ${term.kind}` };
        }
    }
    createTelemetry(t0, t1, t2, t3, t4, t5, t6, t7, step) {
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
    /**
     * Starts an automated bounded multi-step agent run for a specific user goal.
     */
    async startRun(goal, options) {
        const requestedRunId = options?.runId || 'run_' + Date.now() + '_' + Math.random().toString(36).slice(2, 9);
        if (this.state !== 'idle' &&
            this.state !== 'complete' &&
            this.state !== 'failed-safe' &&
            this.state !== 'blocked-local-only' &&
            this.state !== 'awaiting-user-confirmation') {
            // Auto-preempt previous run cleanly so the user's new instruction can start immediately
            this.isCancelled = true;
            this.transition('idle', 'Previous run preempted by new user request');
            await new Promise((r) => setTimeout(r, 40));
        }
        this.currentRunId = requestedRunId;
        this.currentTabId = options?.tabId;
        this.currentGoal = goal;
        this.currentTaskContract = resolveTaskContract(goal);
        if (!this.currentTaskContract.supported) {
            const errorMsg = this.currentTaskContract.abstentionReason || 'Task abstained: Goal is outside closed supported task contracts';
            this.transition('failed-safe', errorMsg);
            const res = {
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
            if (this.listeners.onUserInputRequired) {
                this.listeners.onUserInputRequired({
                    kind: this.currentTaskContract.userInputKind || 'credentials',
                    prompt: inputPrompt,
                    runId: this.currentRunId
                });
            }
            const res = {
                runId: this.currentRunId,
                success: true,
                state: 'awaiting-user-confirmation',
                message: inputPrompt,
                inputRequest: {
                    kind: this.currentTaskContract.userInputKind || 'credentials',
                    prompt: inputPrompt
                },
                stepCount: 0,
                steps: []
            };
            return this.completeWithResult(res);
        }
        this.currentStep = 0;
        this.currentMaxSteps = Math.max(1, Math.min(options?.maxSteps ?? this.defaultMaxSteps, 20));
        this.maxStaleRetries = options?.maxStaleRetries ?? this.defaultMaxStaleRetries;
        this.currentStaleRetries = 0;
        this.pendingAction = null;
        this.actionHistory = [];
        this.t0_runStart = Date.now();
        this.cumulativeClientLatency = 0;
        this.cumulativeServerLatency = 0;
        this.isCancelled = false;
        this.stepsTrace = [];
        return this.executeLoop();
    }
    /**
     * Resumes the agent loop after a paused state or user approval.
     */
    async resumeRun() {
        return this.executeLoop();
    }
    async executeLoop() {
        const goal = this.currentGoal;
        if (!goal) {
            const res = { success: false, state: 'idle', error: 'No active goal' };
            return this.completeWithResult(res);
        }
        while (this.currentStep < this.currentMaxSteps) {
            if (this.isCancelled) {
                this.transition('idle', 'Run cancelled by user');
                const res = { success: false, state: 'idle', message: 'Run cancelled by user' };
                return this.completeWithResult(res);
            }
            this.currentStep++;
            const step = this.currentStep;
            const maxSteps = this.currentMaxSteps;
            const t0_step = Date.now();
            // Step 1: Capture active tab DOM & screenshot (fresh captureId each cycle)
            this.transition('capturing', `Step ${step}/${maxSteps}: Capturing active tab DOM & screenshot`);
            const activeTab = await this.browser.getActiveTab(this.currentTabId);
            // Guard: Block restricted browser surfaces (chrome://, chrome-extension://, file://, devtools://)
            const restrictedCheck = isRestrictedBrowserUrl(activeTab?.url);
            if (restrictedCheck.isRestricted) {
                const errorMsg = `Capture blocked: ${restrictedCheck.reason}`;
                this.transition('blocked-local-only', errorMsg);
                const res = {
                    success: false,
                    state: 'blocked-local-only',
                    error: errorMsg,
                    stepCount: step
                };
                return this.completeWithResult(res);
            }
            const captureId = `cap_${Date.now()}_${step}`;
            let domResponse;
            try {
                domResponse = await this.browser.sendMessageToTab(activeTab.id, {
                    type: 'EXTRACT_DOM_SNAPSHOT',
                    captureId
                });
            }
            catch (err) {
                const errorMsg = 'Could not connect to webpage. Please reload the target tab (Cmd+R / F5) so the extension content script attaches.';
                this.transition('failed-safe', errorMsg);
                const res = {
                    success: false,
                    state: 'failed-safe',
                    error: errorMsg,
                    stepCount: step
                };
                return this.completeWithResult(res);
            }
            if (!domResponse || !domResponse.success) {
                const errorMsg = 'Failed to extract DOM snapshot from content script. Please reload the tab.';
                this.transition('failed-safe', errorMsg);
                const res = {
                    success: false,
                    state: 'failed-safe',
                    error: errorMsg,
                    stepCount: step
                };
                return this.completeWithResult(res);
            }
            let screenshotDataUrl;
            try {
                screenshotDataUrl = await this.browser.captureVisibleTab();
            }
            catch (err) {
                const errorMsg = `Screenshot capture failed: ${err.message || 'Permission denied or restricted tab'}`;
                this.transition('failed-safe', errorMsg);
                const res = {
                    success: false,
                    state: 'failed-safe',
                    error: errorMsg,
                    stepCount: step
                };
                return this.completeWithResult(res);
            }
            const t1_captureComplete = Date.now();
            // Ephemeral raw capture - strictly scoped to this cycle, never persisted
            const rawCapture = {
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
            let sanitized;
            try {
                sanitized = await this.browser.runInSanitizerHost({
                    rawCapture,
                    snapshot: domResponse.snapshot,
                    goal
                });
            }
            catch (err) {
                const diagnostic = classifySanitizerError(err);
                const userSafeMsg = 'Sensitive content may be present in an area that cannot be inspected safely. No context was sent.';
                this.transition('blocked-local-only', userSafeMsg);
                const res = {
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
            // Step 3: Local Safe Action Router (Stage D6) vs Server Reasoning
            const localProposal = this.tryResolveLocalSafeAction(goal, sanitized, step);
            let proposal;
            let decisionOrigin = 'server';
            let networkRequestMade = true;
            let t4_reasoningReceived = Date.now();
            if (localProposal) {
                proposal = localProposal;
                decisionOrigin = 'local';
                networkRequestMade = false;
                t4_reasoningReceived = Date.now();
                this.transition('validating-action', `Step ${step}/${maxSteps}: Locally resolved safe action (${proposal.kind})`);
            }
            else {
                this.transition('sending-sanitized-context', `Step ${step}/${maxSteps}: Transmitting sanitized context`);
                this.transition('awaiting-reasoning', `Step ${step}/${maxSteps}: Awaiting reasoning action`);
                try {
                    proposal = await this.httpClient.requestReasoningAction(sanitized);
                }
                catch (err) {
                    const errorMsg = `Reasoning server error: ${err.message || 'Request failed'}`;
                    this.transition('failed-safe', errorMsg);
                    const res = {
                        success: false,
                        state: 'failed-safe',
                        error: errorMsg,
                        sanitized,
                        stepCount: step
                    };
                    return this.completeWithResult(res);
                }
                t4_reasoningReceived = Date.now();
            }
            // Step 4: Validating Action & Policy Check
            this.transition('validating-action', `Step ${step}/${maxSteps}: Validating proposed action`);
            const t5_actionValidated = Date.now();
            const actionValidation = validateActionProposal(proposal, sanitized.elements);
            if (!actionValidation.isValid || !actionValidation.proposal) {
                const errorMsg = `Action rejected: ${actionValidation.errorMessage || 'Invalid action proposal schema'}`;
                this.transition('failed-safe', errorMsg);
                const res = {
                    success: false,
                    state: 'failed-safe',
                    error: errorMsg,
                    sanitized,
                    proposal,
                    stepCount: step
                };
                return this.completeWithResult(res);
            }
            // Step 4b: Confidence Threshold Check (Ultra-low confidence cannot automatically execute)
            if (proposal.confidence < 0.25 && proposal.kind !== 'finish' && proposal.kind !== 'wait') {
                const errorMsg = `Action rejected: Proposal confidence (${proposal.confidence}) is below safe execution threshold (0.25)`;
                this.transition('failed-safe', errorMsg);
                const stepTrace = {
                    step,
                    captureId: sanitized.captureId,
                    pageGeneration: sanitized.captureId,
                    maskCount: sanitized.maskCount,
                    sanitizedScreenshotBytes: sanitized.sanitizedScreenshotDataUrl ? sanitized.sanitizedScreenshotDataUrl.length : 0,
                    decisionOrigin,
                    proposal,
                    riskDecision: 'safe',
                    confidenceDecision: 'rejected_low_confidence',
                    executed: false,
                    networkRequestMade,
                    timings: { total: Date.now() - t0_step }
                };
                this.stepsTrace.push(stepTrace);
                const res = {
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
            // Step 4c: Target Lookup and Validation
            let targetElement = proposal.targetLocalId
                ? sanitized.elements.find(e => e.localId === proposal.targetLocalId)
                : undefined;
            if (proposal.targetLocalId && !targetElement) {
                const errorMsg = `Action rejected: Model proposed non-existent target ID "${proposal.targetLocalId}".`;
                this.transition('failed-safe', errorMsg);
                const stepTrace = {
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
            const classifiedRisk = classifyActionRisk(proposal, targetElement?.sanitizedName);
            let riskLevel = (proposal.risk === 'blocked' || classifiedRisk === 'blocked')
                ? 'blocked'
                : (proposal.risk === 'protected' || classifiedRisk === 'protected')
                    ? 'protected'
                    : 'safe';
            if (riskLevel === 'blocked') {
                const errorMsg = `Action blocked by client safety policy: ${proposal.rationale}`;
                this.transition('failed-safe', errorMsg);
                const stepTrace = {
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
                const res = {
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
            if (structuredIntent &&
                structuredIntent.targetPhrase &&
                structuredIntent.intent === proposal.kind &&
                targetElement) {
                const grounding = groundTargetCandidates(sanitized.elements, structuredIntent, Boolean(sanitized.pageState?.visibleDialogCount && sanitized.pageState.visibleDialogCount > 0));
                // 1. Missing target check: User commanded an explicit target (e.g. "Click SIH99999") that does not exist on page
                if (grounding.status === 'no_match' && this.currentTaskContract?.goalPattern === 'click_control') {
                    const errorMsg = `Action rejected: Requested target "${structuredIntent.targetPhrase}" is not present on the current page.`;
                    this.transition('failed-safe', errorMsg);
                    const stepTrace = {
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
                // 2. Ambiguity resolution:
                if (grounding.status === 'ambiguous_match') {
                    proposal = {
                        ...proposal,
                        risk: 'protected',
                        rationale: grounding.ambiguityReason || `Ambiguous candidate: multiple controls matching "${structuredIntent.targetPhrase}". User confirmation required.`
                    };
                    riskLevel = 'protected';
                }
                // 3. Re-grounding model proposal if semantically inferior:
                if (grounding.bestCandidate && proposal.targetLocalId !== grounding.bestCandidate.element.localId) {
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
                        if (updatedClassifiedRisk === 'protected' || proposal.risk === 'protected') {
                            riskLevel = 'protected';
                        }
                    }
                }
            }
            // Step 4f: Unqualified Duplicate Candidate Ambiguity Gate
            if (targetElement && proposal.kind === 'click') {
                const duplicates = sanitized.elements.filter(e => e.localId !== targetElement.localId && e.role === targetElement.role && e.sanitizedName.toLowerCase() === targetElement.sanitizedName.toLowerCase());
                if (duplicates.length > 0 && !structuredIntent?.contextPhrase) {
                    proposal = {
                        ...proposal,
                        risk: 'protected',
                        rationale: `Ambiguous candidate: multiple controls with name "${targetElement.sanitizedName}" present on page. User confirmation required.`
                    };
                    riskLevel = 'protected';
                }
            }
            if (riskLevel === 'protected') {
                this.pendingAction = proposal;
                const msg = `Protected action requires user consent: ${proposal.rationale}`;
                this.transition('awaiting-user-confirmation', msg);
                if (this.listeners.onActionConfirmedRequired) {
                    this.listeners.onActionConfirmedRequired(proposal, this.currentRunId);
                }
                const stepTrace = {
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
                const res = {
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
            if (this.listeners.onActionProposed) {
                this.listeners.onActionProposed(proposal, this.currentRunId);
            }
            if (proposal.kind === 'finish') {
                const terminalCheck = this.currentTaskContract
                    ? this.verifyTerminalPostcondition(this.currentTaskContract, sanitized, this.actionHistory)
                    : { satisfied: false, reason: 'No task contract active' };
                if (!terminalCheck.satisfied) {
                    const errorMsg = `Task rejected: Model proposed "finish" before required action postconditions were established or verified: ${terminalCheck.reason}`;
                    this.transition('failed-safe', errorMsg);
                    const stepTrace = {
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
                    const res = {
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
                this.transition('complete', `Task completed: ${proposal.rationale}`);
                const stepTrace = {
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
                const res = {
                    success: true,
                    state: 'complete',
                    message: proposal.rationale,
                    sanitized,
                    proposal,
                    telemetry,
                    stepCount: step,
                    steps: this.stepsTrace
                };
                return this.completeWithResult(res);
            }
            // Check repeated action loop
            const isDuplicate = this.isRepeatedAction(proposal);
            if (isDuplicate) {
                const errorMsg = 'Repeated action loop detected: identical action proposed consecutively without progress';
                this.transition('failed-safe', errorMsg);
                const res = {
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
            // Execute action via content script
            this.transition('executing', `Step ${step}/${maxSteps}: Executing '${proposal.kind}' on ${proposal.targetLocalId || 'page'}`);
            if (proposal.kind === 'wait') {
                await new Promise((r) => setTimeout(r, 600));
            }
            if (proposal.kind === 'type' && !proposal.pressEnter && this.currentTaskContract?.structuredIntent?.pressEnter) {
                proposal = { ...proposal, pressEnter: true };
            }
            const execResponse = await this.browser.sendMessageToTab(activeTab.id, {
                type: 'EXECUTE_ACTION',
                proposal,
                captureId: sanitized.captureId
            });
            const t6_actionExecuted = Date.now();
            this.transition('verifying', `Step ${step}/${maxSteps}: Verifying semantic outcome`);
            const t7_stateVerified = Date.now();
            const telemetry = this.createTelemetry(t0_step, t1_captureComplete, t2_detectionComplete, t3_sanitizationValidated, t4_reasoningReceived, t5_actionValidated, t6_actionExecuted, t7_stateVerified, step);
            if (this.listeners.onTelemetryUpdated) {
                this.listeners.onTelemetryUpdated(telemetry, this.currentRunId);
            }
            // Handle Stale Target Recovery
            if (execResponse && execResponse.staleTarget) {
                if (proposal.risk !== 'safe') {
                    const errorMsg = `Stale target detected on protected action '${proposal.kind}': auto-retry is prohibited for non-safe actions`;
                    this.transition('failed-safe', errorMsg);
                    const res = {
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
                }
                else {
                    const errorMsg = `Stale target: target element '${proposal.targetLocalId}' remained stale after ${this.maxStaleRetries} retry attempts`;
                    this.transition('failed-safe', errorMsg);
                    const res = {
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
            const isSuccess = Boolean(execResponse && execResponse.success && execResponse.semanticOutcomeVerified);
            const stepTrace = {
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
            if (!isSuccess) {
                const errorMsg = execResponse?.message || 'Action execution or semantic verification failed';
                this.transition('failed-safe', `Execution failed: ${errorMsg}`);
                const res = {
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
            if (this.currentTaskContract?.expectedTerminal.kind === 'scroll_changed' && proposal.kind === 'scroll') {
                const tFin = Date.now();
                const telemetry = this.createTelemetry(t0_step, t1_captureComplete, t2_detectionComplete, t3_sanitizationValidated, t4_reasoningReceived, t5_actionValidated, t6_actionExecuted, t7_stateVerified, step);
                if (this.listeners.onTelemetryUpdated) {
                    this.listeners.onTelemetryUpdated(telemetry, this.currentRunId);
                }
                this.transition('complete', `Scroll ${proposal.scrollDirection || 'down'} executed and verified: navigation complete`);
                const res = {
                    success: true,
                    state: 'complete',
                    message: `Scroll ${proposal.scrollDirection || 'down'} executed and verified`,
                    sanitized,
                    proposal,
                    telemetry,
                    stepCount: step,
                    steps: this.stepsTrace
                };
                return this.completeWithResult(res);
            }
            // Single-action direct click completion ("terminal if done")
            if (this.currentTaskContract?.goalPattern === 'click_control' &&
                proposal.kind === 'click' &&
                this.currentTaskContract?.structuredIntent?.targetPhrase &&
                !/\b(repeatedly|again|multiple|times|until|loop)\b/i.test(this.currentGoal || '')) {
                const matchesTarget = targetElement && (scoreCandidate(targetElement, this.currentTaskContract.structuredIntent, false).score >= 50);
                if (matchesTarget) {
                    const tFin = Date.now();
                    const telemetry = this.createTelemetry(t0_step, t1_captureComplete, t2_detectionComplete, t3_sanitizationValidated, t4_reasoningReceived, t5_actionValidated, t6_actionExecuted, t7_stateVerified, step);
                    if (this.listeners.onTelemetryUpdated) {
                        this.listeners.onTelemetryUpdated(telemetry, this.currentRunId);
                    }
                    const targetName = targetElement?.sanitizedName || proposal.targetLocalId || 'control';
                    this.transition('complete', `Clicked "${targetName}" successfully: directive complete`);
                    const res = {
                        success: true,
                        state: 'complete',
                        message: `Clicked "${targetName}" successfully`,
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
        const res = {
            success: false,
            state: 'failed-safe',
            error: errorMsg,
            stepCount: this.currentStep,
            sanitized: this.currentSanitizedContext || undefined
        };
        return this.completeWithResult(res);
    }
    /**
     * Reports whether the reasoning gateway and a model backend are reachable.
     */
    async getModelStatus() {
        return this.httpClient.getModelStatus();
    }
    /**
     * Performs page-aware chat strictly across the privacy boundary.
     */
    async chatWithPage(userMessage) {
        try {
            // Fast-track: Conversational greetings/queries without page-context intent
            // bypass heavy DOM snapshot, full-screenshot capture, and ONNX initialization.
            const PAGE_CONTEXT_PATTERN = /\b(this page|current page|screen|button|form|field|input|website|site|tab|summarize|read|click|find|where|select|scroll|submit|on screen)\b/i;
            if (!PAGE_CONTEXT_PATTERN.test(userMessage.trim())) {
                return this.generalChat(userMessage);
            }
            const activeTab = await this.browser.getActiveTab(this.currentTabId);
            if (!activeTab || !activeTab.id) {
                return this.generalChat(userMessage);
            }
            let domResponse = null;
            try {
                domResponse = await this.browser.sendMessageToTab(activeTab.id, {
                    type: 'EXTRACT_DOM_SNAPSHOT',
                    captureId: `chat_cap_${Date.now()}`
                });
            }
            catch (_) {
                // Tab content script not reachable
            }
            if (!domResponse || !domResponse.success || !domResponse.snapshot) {
                return this.generalChat(userMessage);
            }
            let screenshotDataUrl = '';
            try {
                screenshotDataUrl = await this.browser.captureVisibleTab();
            }
            catch (_) {
                // Tab capture blocked or unavailable
            }
            if (!screenshotDataUrl) {
                return this.generalChat(userMessage);
            }
            const rawCapture = {
                _brand: 'RawCapture_InternalOnly',
                captureId: `chat_cap_${Date.now()}`,
                timestamp: Date.now(),
                rawScreenshotDataUrl: screenshotDataUrl,
                rawDomSummary: domResponse.snapshot,
                metadata: domResponse.viewport
            };
            let sanitized;
            try {
                sanitized = await this.browser.runInSanitizerHost({
                    rawCapture,
                    snapshot: domResponse.snapshot,
                    goal: userMessage
                });
            }
            catch (_) {
                // Sanitizer host unavailable or timed out; fallback to general chat
                return this.generalChat(userMessage);
            }
            if (this.listeners.onSanitizationComplete) {
                this.listeners.onSanitizationComplete(rawCapture, sanitized, this.currentRunId);
            }
            const chatRes = await this.httpClient.requestChat(sanitized, userMessage);
            return {
                success: true,
                reply: chatRes.reply,
                maskCount: sanitized.maskCount,
                elementCount: sanitized.elements.length,
                modelConnected: chatRes.modelConnected !== false
            };
        }
        catch (err) {
            return this.generalChat(userMessage, err);
        }
    }
    /**
     * Directly chats with the reasoning model without page context or perception overhead.
     */
    async chatWithoutPage(userMessage) {
        return this.generalChat(userMessage);
    }
    /**
     * Contextless chat turn. Reports a real connection failure instead of claiming
     * the model is ready — that claim is what made a broken model look like a
     * working one with nothing to say.
     */
    async generalChat(userMessage, priorError) {
        try {
            const genRes = await this.httpClient.requestGeneralChat(userMessage);
            return {
                success: true,
                reply: genRes.reply,
                maskCount: 0,
                elementCount: 0,
                modelConnected: genRes.modelConnected !== false
            };
        }
        catch (err) {
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
    async approvePendingAction(options) {
        if (!this.pendingAction || !this.currentSanitizedContext) {
            const res = {
                success: false,
                state: 'idle',
                error: 'No pending action to approve'
            };
            return this.completeWithResult(res);
        }
        const action = this.pendingAction;
        const sanitized = this.currentSanitizedContext;
        this.pendingAction = null;
        // Stage D4: Fresh Confirmation Check (Reject stale approvals >45s old)
        if (sanitized.timestamp && (Date.now() - sanitized.timestamp > 45000)) {
            const errorMsg = 'Protected action approval expired: page state is older than 45s. Fresh confirmation required.';
            this.transition('failed-safe', errorMsg);
            const res = {
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
        const execResponse = await this.browser.sendMessageToTab(activeTab.id, {
            type: 'EXECUTE_ACTION',
            proposal: { ...action, userApproved: true },
            captureId: sanitized.captureId
        });
        if (execResponse && execResponse.staleTarget) {
            const errorMsg = 'Protected action aborted: target element mutated or detached after approval. Fresh confirmation required.';
            this.transition('failed-safe', errorMsg);
            const res = {
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
            const res = {
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
            this.stepsTrace[lastStepIndex] = {
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
        if (options?.resumeLoop && action.kind !== 'finish') {
            return this.executeLoop();
        }
        this.transition('complete', `Approved action executed: ${action.rationale}`);
        const res = {
            success: true,
            state: 'complete',
            message: action.rationale,
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
    denyPendingAction() {
        const action = this.pendingAction;
        const sanitized = this.currentSanitizedContext;
        this.pendingAction = null;
        this.isCancelled = true;
        this.transition('idle', 'Action cancelled by user');
        const res = {
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
    async submitUserInput(inputs) {
        const activeTab = await this.browser.getActiveTab(this.currentTabId);
        this.transition('executing', 'Safely filling form fields locally with provided input');
        const captureId = `cap_input_${Date.now()}`;
        let domResponse;
        try {
            domResponse = await this.browser.sendMessageToTab(activeTab.id, {
                type: 'EXTRACT_DOM_SNAPSHOT',
                captureId
            });
        }
        catch (err) {
            const errorMsg = 'Could not communicate with tab to fill form inputs';
            this.transition('failed-safe', errorMsg);
            return this.completeWithResult({ success: false, state: 'failed-safe', error: errorMsg });
        }
        if (!domResponse || !domResponse.snapshot || !domResponse.snapshot.elements) {
            const errorMsg = 'Could not locate form fields on page';
            this.transition('failed-safe', errorMsg);
            return this.completeWithResult({ success: false, state: 'failed-safe', error: errorMsg });
        }
        const elements = domResponse.snapshot.elements;
        let filledCount = 0;
        // A. Fill username/email if provided
        if (inputs.username) {
            const userEl = elements.find((e) => {
                const name = (e.sanitizedName || '').toLowerCase();
                const role = e.role;
                return (role === 'input' || role === 'textbox') &&
                    (name.includes('user') || name.includes('email') || name.includes('login') || name.includes('account') || name.includes('id') || name.includes('phone'));
            }) || elements.find((e) => e.role === 'input' || e.role === 'textbox');
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
                const name = (e.sanitizedName || '').toLowerCase();
                return (e.role === 'input' || e.role === 'textbox') &&
                    (name.includes('password') || name.includes('pass') || name.includes('pwd'));
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
            const targetInput = elements.find((e) => e.role === 'input' || e.role === 'textbox');
            if (targetInput) {
                await this.browser.sendMessageToTab(activeTab.id, {
                    type: 'EXECUTE_ACTION',
                    proposal: {
                        actionId: `act_input_custom_${Date.now()}`,
                        kind: 'type',
                        targetLocalId: targetInput.localId,
                        textToType: inputs.customText,
                        confidence: 1.0,
                        risk: 'safe',
                        rationale: 'Fill user text locally',
                        userApproved: true
                    },
                    captureId
                });
                filledCount++;
            }
        }
        if (filledCount === 0) {
            const errorMsg = 'No matching input fields found on the page to fill';
            this.transition('failed-safe', errorMsg);
            return this.completeWithResult({ success: false, state: 'failed-safe', error: errorMsg });
        }
        this.transition('complete', `Successfully filled ${filledCount} field(s) locally`);
        return this.completeWithResult({
            success: true,
            state: 'complete',
            message: `Form fields filled securely (${filledCount} fields)`
        });
    }
    setServerUrl(url) {
        this.httpClient.setServerBaseUrl(url);
    }
}
//# sourceMappingURL=coordinator.js.map