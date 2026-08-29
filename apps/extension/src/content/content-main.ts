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
let currentElementMap = new Map<string, HTMLElement>();

// Listen for messages from background coordinator
if (typeof chrome !== 'undefined' && chrome.runtime && chrome.runtime.onMessage) {
  chrome.runtime.onMessage.addListener((message: any, _sender: any, sendResponse: (res: any) => void) => {
    handleMessage(message).then(sendResponse).catch((err) => {
      sendResponse({ success: false, error: err.message });
    });
    return true; // Keep message channel open for async response
  });
}

export async function handleMessage(message: any): Promise<any> {
  if (message.type === 'EXTRACT_DOM_SNAPSHOT') {
    const extracted = extractor.extractSnapshot(document);
    currentElementMap = extracted.elementMap;

    return {
      success: true,
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

    // Highlight target if present
    if (proposal.targetLocalId) {
      const targetEl = currentElementMap.get(proposal.targetLocalId);
      if (targetEl) {
        overlay.highlightTargetElement(targetEl, proposal.kind.toUpperCase());
      }
    }

    const execResult = ActionExecutor.execute(proposal, currentElementMap);
    const verified = await SemanticStateVerifier.verifyOutcome(proposal.expectedState);

    return {
      success: execResult.success,
      actionId: proposal.actionId,
      semanticOutcomeVerified: verified,
      message: execResult.message
    };
  }

  if (message.type === 'CLEAR_OVERLAYS') {
    overlay.clear();
    return { success: true };
  }

  return { success: false, error: `Unknown message type: ${message.type}` };
}
