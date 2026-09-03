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
import { classifyActionRisk, validateActionProposal } from '@privapilot/protocol';
import { WebExtensionAdapter } from '../browser/browser-adapter.js';
import { ReasoningHttpClient } from './http-client.js';
import { AuditLogger } from './audit-logger.js';
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
    getLastResult() {
        return this.lastRunResult;
    }
    cancelRun() {
        this.isCancelled = true;
        this.transition('idle', 'Run cancelled by user');
    }
    transition(next, msg) {
        this.state = next;
        if (this.listeners.onStateChange) {
            this.listeners.onStateChange(next, msg);
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
    createTelemetry(t0, t1, t2, t3, t4, t5, t6, t7, step) {
        const stepClientMs = (t3 - t0) + (t7 - t5);
        const stepServerMs = t4 - t3;
        this.cumulativeClientLatency += stepClientMs;
        this.cumulativeServerLatency += stepServerMs;
        return {
            runId: `run_${this.t0_runStart}`,
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
        if (this.state !== 'idle' &&
            this.state !== 'complete' &&
            this.state !== 'failed-safe' &&
            this.state !== 'blocked-local-only' &&
            this.state !== 'awaiting-user-confirmation') {
            const errorMsg = 'Cannot start new run: an agent run is already in progress';
            const res = { success: false, state: this.state, error: errorMsg };
            this.lastRunResult = res;
            return res;
        }
        this.currentGoal = goal;
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
            this.lastRunResult = res;
            return res;
        }
        while (this.currentStep < this.currentMaxSteps) {
            if (this.isCancelled) {
                this.transition('idle', 'Run cancelled by user');
                const res = { success: false, state: 'idle', message: 'Run cancelled by user' };
                this.lastRunResult = res;
                return res;
            }
            this.currentStep++;
            const step = this.currentStep;
            const maxSteps = this.currentMaxSteps;
            const t0_step = Date.now();
            // Step 1: Capture active tab DOM & screenshot (fresh captureId each cycle)
            this.transition('capturing', `Step ${step}/${maxSteps}: Capturing active tab DOM & screenshot`);
            const activeTab = await this.browser.getActiveTab();
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
                this.lastRunResult = res;
                return res;
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
                this.lastRunResult = res;
                return res;
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
                this.lastRunResult = res;
                return res;
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
                this.lastRunResult = res;
                return res;
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
                const userSafeMsg = 'Sensitive content may be present in an area that cannot be inspected safely. No context was sent.';
                this.transition('blocked-local-only', userSafeMsg);
                const res = {
                    success: false,
                    state: 'blocked-local-only',
                    error: userSafeMsg,
                    stepCount: step
                };
                this.lastRunResult = res;
                return res;
            }
            const t3_sanitizationValidated = Date.now();
            this.currentSanitizedContext = sanitized;
            if (this.listeners.onSanitizationComplete) {
                this.listeners.onSanitizationComplete(rawCapture, sanitized);
            }
            // Step 3: Server Reasoning over Sanitized Context Only
            this.transition('sending-sanitized-context', `Step ${step}/${maxSteps}: Transmitting sanitized context`);
            this.transition('awaiting-reasoning', `Step ${step}/${maxSteps}: Awaiting reasoning action`);
            let proposal;
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
                this.lastRunResult = res;
                return res;
            }
            const t4_reasoningReceived = Date.now();
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
                this.lastRunResult = res;
                return res;
            }
            // Step 5: Risk Classification
            const targetElement = sanitized.elements.find(e => e.localId === proposal.targetLocalId);
            const riskLevel = classifyActionRisk(proposal, targetElement?.sanitizedName);
            if (riskLevel === 'blocked') {
                const errorMsg = `Action blocked by client safety policy: ${proposal.rationale}`;
                this.transition('failed-safe', errorMsg);
                const res = {
                    success: false,
                    state: 'failed-safe',
                    error: errorMsg,
                    sanitized,
                    proposal,
                    stepCount: step
                };
                this.lastRunResult = res;
                return res;
            }
            if (riskLevel === 'protected') {
                this.pendingAction = proposal;
                const msg = `Protected action requires user consent: ${proposal.rationale}`;
                this.transition('awaiting-user-confirmation', msg);
                if (this.listeners.onActionConfirmedRequired) {
                    this.listeners.onActionConfirmedRequired(proposal);
                }
                const res = {
                    success: false,
                    state: 'awaiting-user-confirmation',
                    message: msg,
                    sanitized,
                    proposal,
                    stepCount: step
                };
                this.lastRunResult = res;
                return res;
            }
            // Step 6: Safe Action Execution
            if (this.listeners.onActionProposed) {
                this.listeners.onActionProposed(proposal);
            }
            if (proposal.kind === 'finish') {
                const tFin = Date.now();
                const telemetry = this.createTelemetry(t0_step, t1_captureComplete, t2_detectionComplete, t3_sanitizationValidated, t4_reasoningReceived, t5_actionValidated, tFin, tFin, step);
                if (this.listeners.onTelemetryUpdated) {
                    this.listeners.onTelemetryUpdated(telemetry);
                }
                this.transition('complete', `Task completed: ${proposal.rationale}`);
                const res = {
                    success: true,
                    state: 'complete',
                    message: proposal.rationale,
                    sanitized,
                    proposal,
                    telemetry,
                    stepCount: step
                };
                this.lastRunResult = res;
                return res;
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
                    stepCount: step
                };
                this.lastRunResult = res;
                return res;
            }
            // Execute action via content script
            this.transition('executing', `Step ${step}/${maxSteps}: Executing '${proposal.kind}' on ${proposal.targetLocalId || 'page'}`);
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
                this.listeners.onTelemetryUpdated(telemetry);
            }
            // Handle Stale Target Recovery
            if (execResponse && execResponse.staleTarget) {
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
                        stepCount: step
                    };
                    this.lastRunResult = res;
                    return res;
                }
            }
            this.recordActionHistory(proposal);
            const isSuccess = Boolean(execResponse && execResponse.success && execResponse.semanticOutcomeVerified);
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
                    stepCount: step
                };
                this.lastRunResult = res;
                return res;
            }
            this.currentStaleRetries = 0;
            if (this.listeners.onStepProgress) {
                this.listeners.onStepProgress(step, maxSteps, proposal.rationale);
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
        this.lastRunResult = res;
        return res;
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
            const activeTab = await this.browser.getActiveTab();
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
                this.listeners.onSanitizationComplete(rawCapture, sanitized);
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
            this.lastRunResult = res;
            return res;
        }
        const action = this.pendingAction;
        const sanitized = this.currentSanitizedContext;
        this.pendingAction = null;
        const activeTab = await this.browser.getActiveTab();
        const t0 = Date.now();
        this.transition('executing', `Executing approved action '${action.kind}' on ${action.targetLocalId || 'page'}`);
        const execResponse = await this.browser.sendMessageToTab(activeTab.id, {
            type: 'EXECUTE_ACTION',
            proposal: action,
            captureId: sanitized.captureId
        });
        const now = Date.now();
        const telemetry = this.createTelemetry(t0, now, now, now, now, now, now, now, this.currentStep);
        if (this.listeners.onTelemetryUpdated) {
            this.listeners.onTelemetryUpdated(telemetry);
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
            this.lastRunResult = res;
            return res;
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
        this.lastRunResult = res;
        return res;
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
        this.lastRunResult = res;
        return res;
    }
}
//# sourceMappingURL=coordinator.js.map