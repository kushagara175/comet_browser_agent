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

    if (message.type === 'GENERAL_CHAT') {
      coordinator.chatWithoutPage(message.message || '').then((res) => {
        sendResponse(res);
      }).catch((err) => {
        sendResponse({
          success: false,
          reply: `Could not reach the reasoning model: ${err?.message || 'unknown error'}`,
          maskCount: 0,
          elementCount: 0,
          modelConnected: false
        });
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

    return false;
  });
}
