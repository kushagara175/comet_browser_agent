/**
 * @privapilot/extension - Content Script Main Entry Point
 */

import { ElementExtractor } from './element-extractor.js';
import { ActionExecutor } from './action-executor.js';
import { SemanticStateVerifier } from './verifier.js';
import { OverlayRenderer } from './overlay-renderer.js';
import { ActionProposal } from '@privapilot/protocol';

declare const chrome: any;

const extractor = new ElementExtractor();
const overlay = new OverlayRenderer();
let currentCaptureId: string | null = null;
let currentElementMap = new Map<string, HTMLElement>();

// Listen for messages from background coordinator
if (typeof chrome !== 'undefined' && chrome.runtime && chrome.runtime.onMessage) {
  chrome.runtime.onMessage.addListener((message: any, _sender: any, sendResponse: (res: any) => void) => {
    // Runtime messages are broadcast to extension contexts. Only claim commands
    // intended for this content script; otherwise it can win the response race
    // against the background worker with an empty response.
    if (message?.type !== 'EXTRACT_DOM_SNAPSHOT' && message?.type !== 'EXECUTE_ACTION') {
      return false;
    }

    handleMessage(message).then(sendResponse).catch((err) => {
      sendResponse({ success: false, error: err.message });
    });
    return true; // Keep message channel open for async response
  });
}

export async function handleMessage(message: any): Promise<any> {
  if (message.type === 'EXTRACT_DOM_SNAPSHOT') {
    const extracted = extractor.extractSnapshot(document);
    const captureId = message.captureId || `cap_${Date.now()}`;
    currentCaptureId = captureId;
    currentElementMap = extracted.elementMap;

    return {
      success: true,
      captureId,
      snapshot: extracted.snapshot,
      viewport: {
        viewportWidth: window.innerWidth,
        viewportHeight: window.innerHeight,
        screenshotWidth: window.innerWidth * (window.devicePixelRatio || 1),
        screenshotHeight: window.innerHeight * (window.devicePixelRatio || 1),
        devicePixelRatio: window.devicePixelRatio || 1,
        scrollX: window.scrollX || 0,
        scrollY: window.scrollY || 0,
        captureTimestamp: Date.now()
      }
    };
  }

  if (message.type === 'EXECUTE_ACTION') {
    const proposal: ActionProposal = message.proposal;

    // 1. Guard against executing on an element map from a different capture
    if (message.captureId && currentCaptureId && message.captureId !== currentCaptureId) {
      return {
        success: false,
        actionId: proposal.actionId,
        semanticOutcomeVerified: false,
        staleTarget: true,
        message: 'Stale target: element map is from a different capture'
      };
    }

    const targetEl = proposal.targetLocalId ? currentElementMap.get(proposal.targetLocalId) : null;

    // 2. Highlight target if present
    if (targetEl) {
      overlay.highlightTargetElement(targetEl, proposal.kind.toUpperCase());
    }

    // Capture safe pre-action semantic snapshot BEFORE execution
    const preSnapshot = SemanticStateVerifier.captureSnapshot(targetEl, document);

    // 3. Dispatch synthetic DOM action
    const execResult = ActionExecutor.execute(proposal, currentElementMap);
    if (!execResult.success) {
      return {
        success: false,
        actionId: proposal.actionId,
        semanticOutcomeVerified: false,
        staleTarget: execResult.staleTarget ?? (!targetEl && Boolean(proposal.targetLocalId)),
        message: execResult.message || 'Action execution failed',
        reasonCode: execResult.reasonCode || 'EXECUTION_FAILED'
      };
    }

    // 4. Semantically verify post-action state with explicit bounded postconditions
    const verification = await SemanticStateVerifier.verifyOutcome(proposal, targetEl, preSnapshot, { timeoutMs: 2500 });
    const isSuccess = execResult.success && verification.verified;

    return {
      success: isSuccess,
      actionId: proposal.actionId,
      semanticOutcomeVerified: verification.verified,
      reasonCode: verification.reasonCode,
      message: isSuccess ? execResult.message : verification.message,
      verification: {
        verified: verification.verified,
        reasonCode: verification.reasonCode,
        durationMs: verification.details?.durationMs,
        matchedCondition: verification.details?.matchedCondition
      }
    };
  }

  if (message.type === 'CLEAR_OVERLAYS') {
    overlay.clear();
    return { success: true };
  }

  return { success: false, error: `Unknown message type: ${message.type}` };
}
