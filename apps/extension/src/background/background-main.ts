/**
 * @privapilot/extension - Background Service Worker Main Entry
 */

import { RunCoordinator } from './coordinator.js';

declare const chrome: any;

const coordinator = new RunCoordinator();

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

if (typeof chrome !== 'undefined' && chrome.runtime && chrome.runtime.onMessage) {
  chrome.runtime.onMessage.addListener((message: any, _sender: any, sendResponse: (res: any) => void) => {
    if (message.type === 'START_AGENT_RUN') {
      coordinator.startRun(message.goal || 'Safe assistance').then((result) => {
        sendResponse(result);
      }).catch((err) => {
        sendResponse({ success: false, state: 'failed-safe', error: err.message });
      });
      return true;
    }

    if (message.type === 'APPROVE_ACTION') {
      coordinator.approvePendingAction().then(() => {
        sendResponse({ success: true });
      }).catch((err) => {
        sendResponse({ success: false, error: err.message });
      });
      return true;
    }

    if (message.type === 'DENY_ACTION') {
      coordinator.denyPendingAction();
      sendResponse({ success: true });
      return true;
    }

    if (message.type === 'GET_STATE') {
      sendResponse({ state: coordinator.getState() });
      return true;
    }

    return false;
  });
}
