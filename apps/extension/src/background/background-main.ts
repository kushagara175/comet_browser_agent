/**
 * @privapilot/extension - Background Service Worker Main Entry
 */

import { RunCoordinator } from './coordinator.js';

declare const chrome: any;

const coordinator = new RunCoordinator();

// Open Chrome Side Panel on extension icon click
if (typeof chrome !== 'undefined' && chrome.sidePanel && typeof chrome.sidePanel.setPanelBehavior === 'function') {
  chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true }).catch(() => {});
}

// Stream coordinator lifecycle events to Extension UI (Sidepanel/HUD)
coordinator.setListeners({
  onStateChange: (state, message) => {
    if (typeof chrome !== 'undefined' && chrome.runtime?.sendMessage) {
      chrome.runtime.sendMessage({ type: 'COORDINATOR_STATE_CHANGED', state, message }).catch(() => {});
    }
  },
  onSanitizationComplete: (raw, sanitized) => {
    if (typeof chrome !== 'undefined' && chrome.runtime?.sendMessage) {
      chrome.runtime.sendMessage({
        type: 'COORDINATOR_SANITIZATION_COMPLETE',
        maskCount: sanitized.maskCount,
        elementCount: sanitized.elements.length,
        sanitizedScreenshot: sanitized.sanitizedScreenshotDataUrl,
        rawScreenshot: raw.rawScreenshotDataUrl,
        elements: sanitized.elements,
        timestamp: sanitized.timestamp
      }).catch(() => {});
    }
  },
  onActionProposed: (action) => {
    if (typeof chrome !== 'undefined' && chrome.runtime?.sendMessage) {
      chrome.runtime.sendMessage({ type: 'COORDINATOR_ACTION_PROPOSED', action }).catch(() => {});
    }
  },
  onActionConfirmedRequired: (action) => {
    if (typeof chrome !== 'undefined' && chrome.runtime?.sendMessage) {
      chrome.runtime.sendMessage({ type: 'COORDINATOR_CONFIRMATION_REQUIRED', action }).catch(() => {});
    }
  },
  onTelemetryUpdated: (telemetry) => {
    if (typeof chrome !== 'undefined' && chrome.runtime?.sendMessage) {
      chrome.runtime.sendMessage({ type: 'COORDINATOR_TELEMETRY_UPDATED', telemetry }).catch(() => {});
    }
  }
});

function isTrustedExtensionUi(sender: any): boolean {
  const isExtensionUrl = typeof sender?.url === 'string' && (
    sender.url.startsWith(`chrome-extension://${chrome.runtime.id}/sidepanel/`) ||
    sender.url.startsWith(`chrome-extension://${chrome.runtime.id}/src/sidepanel/`)
  );
  const isNotWebTab = !sender?.tab || (
    typeof sender.tab.url === 'string' &&
    sender.tab.url.startsWith(`chrome-extension://${chrome.runtime.id}/`)
  );
  return Boolean(
    sender &&
    sender.id === chrome.runtime.id &&
    isExtensionUrl &&
    isNotWebTab
  );
}

if (typeof chrome !== 'undefined' && chrome.runtime && chrome.runtime.onMessage) {
  chrome.runtime.onMessage.addListener((message: any, sender: any, sendResponse: (res: any) => void) => {
    if (message.type === 'START_AGENT_RUN') {
      coordinator.startRun(message.goal || 'Safe assistance').then((result) => {
        sendResponse(result);
      }).catch((err) => {
        sendResponse({ success: false, state: 'failed-safe', error: err.message });
      });
      return true;
    }

    if (message.type === 'CHAT_WITH_PAGE') {
      coordinator.chatWithPage(message.message || '').then((res) => {
        sendResponse(res);
      }).catch((err) => {
        sendResponse({
          success: false,
          reply: `Chat failed before any context left the browser: ${err?.message || 'unknown error'}`,
          maskCount: 0,
          elementCount: 0,
          modelConnected: false
        });
      });
      return true;
    }

    if (message.type === 'GET_MODEL_STATUS') {
      coordinator.getModelStatus().then((status) => {
        sendResponse(status);
      }).catch((err) => {
        sendResponse({ reachable: false, error: err?.message || 'Model status check failed' });
      });
      return true;
    }

    if (message.type === 'APPROVE_ACTION') {
      coordinator.approvePendingAction({ resumeLoop: message.resumeLoop ?? true }).then((result) => {
        sendResponse(result);
      }).catch((err) => {
        sendResponse({ success: false, state: 'failed-safe', error: err.message });
      });
      return true;
    }

    if (message.type === 'DENY_ACTION') {
      const result = coordinator.denyPendingAction();
      sendResponse(result);
      return true;
    }

    if (message.type === 'GET_STATE') {
      sendResponse({ state: coordinator.getState() });
      return true;
    }

    if (message.type === 'SET_TIER_OVERRIDE') {
      // Security: Only trusted extension UI (side panel) can alter perception tiers.
      // Hostile content scripts or web pages cannot blind the perception layer.
      if (!isTrustedExtensionUi(sender)) {
        sendResponse({
          success: false,
          error: 'Unauthorized: SET_TIER_OVERRIDE permitted only from trusted extension UI (sidepanel)'
        });
        return true;
      }
      coordinator.setTierOverride(message.override || 'auto');
      const telemetry = coordinator.getGovernor().getTelemetry();
      sendResponse({ success: true, telemetry });
      return true;
    }

    if (message.type === 'GET_RESOURCE_METRICS') {
      const telemetry = coordinator.getGovernor().getTelemetry();
      sendResponse({ success: true, telemetry });
      return true;
    }

    if (message.type === 'RUN_PERCEPTION_CYCLE') {
      if (!isTrustedExtensionUi(sender)) {
        sendResponse({
          success: false,
          error: 'Unauthorized: RUN_PERCEPTION_CYCLE permitted only from trusted extension UI (sidepanel)'
        });
        return true;
      }

      coordinator.runSinglePerceptionCycle(message.goal || 'Inspect page').then((res) => {
        sendResponse(res);
      }).catch((err) => {
        sendResponse({ success: false, error: err?.message || 'Perception pass failed' });
      });
      return true;
    }

    if (message.type === 'RESET_CAPTURE_WINDOW') {
      if (!isTrustedExtensionUi(sender)) {
        sendResponse({ success: false, error: 'Unauthorized: RESET_CAPTURE_WINDOW permitted only from trusted extension UI' });
        return true;
      }

      coordinator.getGovernor().resetCaptureTimestamps();
      sendResponse({ success: true, telemetry: coordinator.getGovernor().getTelemetry() });
      return true;
    }

    return false;
  });
}
