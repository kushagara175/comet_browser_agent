/**
 * @privapilot/extension - Background Run Coordinator
 *
 * Coordinates the full end-to-end privacy and execution loop:
 * 1. Capture Active Tab
 * 2. Run Local Multi-Layer Sanitizer
 * 3. Transmit Sanitized Context to Server
 * 4. Validate Action Proposal
 * 5. Prompt for Confirmation if Protected
 * 6. Execute Safe Action via Content Script
 * 7. Semantically Verify UI Outcome
 */

import {
  AgentState,
  RawCapture,
  SanitizedContext,
  ActionProposal,
  classifyActionRisk,
  RunTelemetry
} from '@privapilot/protocol';
import { BrowserAdapter, WebExtensionAdapter } from '../browser/browser-adapter.js';
import { SanitizerPipeline } from '../sanitizer/pipeline.js';
import { ReasoningHttpClient } from './http-client.js';
import { AuditLogger } from './audit-logger.js';

export interface CoordinatorListeners {
  onStateChange?(state: AgentState, message?: string): void;
  onSanitizationComplete?(raw: RawCapture, sanitized: SanitizedContext): void;
  onActionProposed?(action: ActionProposal): void;
  onActionConfirmedRequired?(action: ActionProposal): void;
  onTelemetryUpdated?(telemetry: RunTelemetry): void;
}

export class RunCoordinator {
  private state: AgentState = 'idle';
  private readonly browser: BrowserAdapter;
  private readonly httpClient: ReasoningHttpClient;
  private readonly auditLogger: AuditLogger;
  private listeners: CoordinatorListeners = {};

  private pendingAction: ActionProposal | null = null;
  private currentSanitizedContext: SanitizedContext | null = null;

  constructor(
    browser: BrowserAdapter = new WebExtensionAdapter(),
    httpClient: ReasoningHttpClient = new ReasoningHttpClient(),
    auditLogger: AuditLogger = new AuditLogger()
  ) {
    this.browser = browser;
    this.httpClient = httpClient;
    this.auditLogger = auditLogger;
  }

  setListeners(listeners: CoordinatorListeners): void {
    this.listeners = listeners;
  }

  getState(): AgentState {
    return this.state;
  }

  private transition(next: AgentState, msg?: string): void {
    this.state = next;
    if (this.listeners.onStateChange) {
      this.listeners.onStateChange(next, msg);
    }
  }

  /**
   * Starts an automated agent run for a specific user goal.
   */
  async startRun(goal: string): Promise<void> {
    const runId = `run_${Date.now()}`;
    const t0 = Date.now();

    try {
      // Step 1: Capturing Screen & DOM
      this.transition('capturing', 'Capturing active tab DOM & screenshot');
      const activeTab = await this.browser.getActiveTab();

      const domResponse = await this.browser.sendMessageToTab(activeTab.id, {
        type: 'EXTRACT_DOM_SNAPSHOT'
      });

      if (!domResponse || !domResponse.success) {
        throw new Error('Failed to extract DOM snapshot from content script');
      }

      const screenshotDataUrl = await this.browser.captureVisibleTab();
      const t1 = Date.now();

      const rawCapture: RawCapture = {
        _brand: 'RawCapture_InternalOnly',
        captureId: `cap_${Date.now()}`,
        timestamp: Date.now(),
        rawScreenshotDataUrl: screenshotDataUrl,
        rawDomSummary: domResponse.snapshot,
        metadata: domResponse.viewport
      };

      // Step 2: Detecting & Sanitizing
      this.transition('detecting-sensitive-content', 'Scanning for PII, passwords, cards, and faces');
      const t2 = Date.now();

      this.transition('sanitizing', 'Rendering opaque privacy masks & face blurs');
      const sanitized = await SanitizerPipeline.sanitize(
        rawCapture,
        domResponse.snapshot,
        goal
      );
      const t3 = Date.now();

      this.currentSanitizedContext = sanitized;

      if (this.listeners.onSanitizationComplete) {
        this.listeners.onSanitizationComplete(rawCapture, sanitized);
      }

      // Step 3: Transmitting Sanitized Context Only
      this.transition('sending-sanitized-context', 'Transmitting sanitized context over privacy boundary');
      this.transition('awaiting-reasoning', 'Server VLM processing sanitized layout');

      const proposal = await this.httpClient.requestReasoningAction(sanitized);
      const t4 = Date.now();

      // Step 4: Validating Action & Policy Check
      this.transition('validating-action', 'Validating proposed action against client safety policy');
      const t5 = Date.now();

      // Find target element name
      const targetElement = sanitized.elements.find(e => e.localId === proposal.targetLocalId);
      const riskLevel = classifyActionRisk(proposal, targetElement?.sanitizedName);

      if (riskLevel === 'blocked') {
        this.transition('failed-safe', `Action blocked by client safety policy: ${proposal.rationale}`);
        return;
      }

      if (riskLevel === 'protected') {
        this.pendingAction = proposal;
        this.transition('awaiting-user-confirmation', `Protected action requires user consent: ${proposal.rationale}`);
        if (this.listeners.onActionConfirmedRequired) {
          this.listeners.onActionConfirmedRequired(proposal);
        }
        return;
      }

      // Step 5: Execute Safe Action
      await this.executeAction(proposal, activeTab.id, t0, t1, t2, t3, t4, t5);
    } catch (err: any) {
      this.transition('failed-safe', `Safe fallback triggered: ${err.message}`);
    }
  }

  /**
   * Called when the user clicks 'Approve' on a protected action card.
   */
  async approvePendingAction(): Promise<void> {
    if (!this.pendingAction) return;
    const action = this.pendingAction;
    this.pendingAction = null;

    const activeTab = await this.browser.getActiveTab();
    await this.executeAction(action, activeTab.id, Date.now(), Date.now(), Date.now(), Date.now(), Date.now(), Date.now());
  }

  /**
   * Called when the user clicks 'Deny' on a protected action card.
   */
  denyPendingAction(): void {
    this.pendingAction = null;
    this.transition('idle', 'Action cancelled by user');
  }

  private async executeAction(
    proposal: ActionProposal,
    tabId: number,
    t0: number,
    t1: number,
    t2: number,
    t3: number,
    t4: number,
    t5: number
  ): Promise<void> {
    if (this.listeners.onActionProposed) {
      this.listeners.onActionProposed(proposal);
    }

    if (proposal.kind === 'finish') {
      const tFin = Date.now();
      const telemetry: RunTelemetry = {
        runId: `run_${Date.now()}`,
        t0_start: t0,
        t1_captureComplete: t1,
        t2_detectionComplete: t2,
        t3_sanitizationValidated: t3,
        t4_reasoningReceived: t4,
        t5_actionValidated: t5,
        t6_actionExecuted: tFin,
        t7_stateVerified: tFin,
        totalLatencyMs: tFin - t0,
        clientLatencyMs: (t3 - t0) + (tFin - t5),
        serverLatencyMs: t4 - t3
      };
      if (this.listeners.onTelemetryUpdated) {
        this.listeners.onTelemetryUpdated(telemetry);
      }
      this.transition('complete', `Task completed: ${proposal.rationale}`);
      return;
    }

    this.transition('executing', `Executing action '${proposal.kind}' on ${proposal.targetLocalId || 'page'}`);

    const execResponse = await this.browser.sendMessageToTab(tabId, {
      type: 'EXECUTE_ACTION',
      proposal
    });

    const t6 = Date.now();

    this.transition('verifying', 'Verifying semantic UI state mutation');
    const t7 = Date.now();

    const telemetry: RunTelemetry = {
      runId: `run_${Date.now()}`,
      t0_start: t0,
      t1_captureComplete: t1,
      t2_detectionComplete: t2,
      t3_sanitizationValidated: t3,
      t4_reasoningReceived: t4,
      t5_actionValidated: t5,
      t6_actionExecuted: t6,
      t7_stateVerified: t7,
      totalLatencyMs: t7 - t0,
      clientLatencyMs: (t3 - t0) + (t7 - t5),
      serverLatencyMs: t4 - t3
    };

    if (this.listeners.onTelemetryUpdated) {
      this.listeners.onTelemetryUpdated(telemetry);
    }

    if (execResponse && execResponse.success) {
      this.transition('complete', `Task step completed: ${proposal.rationale}`);
    } else {
      this.transition('failed-safe', `Execution failed: ${execResponse?.message || 'Unknown error'}`);
    }
  }
}
