/**
 * @privapilot/extension - Background Service Worker Main Entry
 */

import { RunCoordinator } from './coordinator.js';
import { toSanitizedNetworkPayload } from '@privapilot/protocol';
import {
  loadVault,
  saveUserProfile,
  saveSiteCredential,
  deleteSiteCredential
} from '../vault/index.js';

declare const chrome: any;

const coordinator = new RunCoordinator();

// Open Chrome Side Panel on extension icon click
if (typeof chrome !== 'undefined' && chrome.sidePanel && typeof chrome.sidePanel.setPanelBehavior === 'function') {
  chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true }).catch(() => {});
}

// Stream coordinator lifecycle events to Extension UI (Sidepanel/HUD)
coordinator.setListeners({
  onStateChange: (state, message, runId) => {
    if (typeof chrome !== 'undefined' && chrome.runtime?.sendMessage) {
      chrome.runtime.sendMessage({ type: 'COORDINATOR_STATE_CHANGED', state, message, runId }).catch(() => {});
    }
  },
  onSanitizationComplete: (raw, sanitized, runId) => {
    if (typeof chrome !== 'undefined' && chrome.runtime?.sendMessage) {
      chrome.runtime.sendMessage({
        type: 'COORDINATOR_SANITIZATION_COMPLETE',
        runId,
        networkPayload: toSanitizedNetworkPayload(sanitized),
        payloadDigestSha256: sanitized.payloadDigestSha256,
        maskCount: sanitized.maskCount,
        elementCount: sanitized.elements.length,
        sanitizedScreenshot: sanitized.sanitizedScreenshotDataUrl,
        rawScreenshot: raw.rawScreenshotDataUrl,
        elements: sanitized.elements,
        timestamp: sanitized.timestamp
      }).catch(() => {});
    }
  },
  onActionProposed: (action, runId) => {
    if (typeof chrome !== 'undefined' && chrome.runtime?.sendMessage) {
      chrome.runtime.sendMessage({ type: 'COORDINATOR_ACTION_PROPOSED', action, runId }).catch(() => {});
    }
  },
  onActionConfirmedRequired: (action, runId) => {
    if (typeof chrome !== 'undefined' && chrome.runtime?.sendMessage) {
      chrome.runtime.sendMessage({ type: 'COORDINATOR_CONFIRMATION_REQUIRED', action, runId }).catch(() => {});
    }
  },
  onUserInputRequired: (request) => {
    if (typeof chrome !== 'undefined' && chrome.runtime?.sendMessage) {
      chrome.runtime.sendMessage({ type: 'COORDINATOR_USER_INPUT_REQUIRED', request }).catch(() => {});
    }
  },
  onTelemetryUpdated: (telemetry, runId) => {
    if (typeof chrome !== 'undefined' && chrome.runtime?.sendMessage) {
      chrome.runtime.sendMessage({ type: 'COORDINATOR_TELEMETRY_UPDATED', telemetry, runId }).catch(() => {});
    }
  },
  onStepProgress: (step, maxSteps, message, runId) => {
    if (typeof chrome !== 'undefined' && chrome.runtime?.sendMessage) {
      chrome.runtime.sendMessage({ type: 'COORDINATOR_STEP_PROGRESS', step, maxSteps, message, runId }).catch(() => {});
    }
  }
});

async function handleSidepanelRequest(message: any): Promise<any> {
  if (message.type === 'START_AGENT_RUN') {
    return coordinator.startRun(message.goal || 'Safe assistance', {
      runId: message.runId,
      maxSteps: message.maxSteps,
      tabId: message.tabId
    });
  }

  if (message.type === 'GENERAL_CHAT') {
    return coordinator.chatWithoutPage(message.message || '', message.history);
  }

  if (message.type === 'CHAT_WITH_PAGE') {
    return coordinator.chatWithPage(message.message || '', message.history);
  }

  if (message.type === 'SUBMIT_USER_INPUT') {
    return coordinator.submitUserInput(
      message.inputs || {},
      message.tabId,
      {
        resumeLoop: message.resumeLoop ?? true,
        targetLocalId: message.targetLocalId,
        saveToVault: message.saveToVault,
        inputKey: message.inputKey
      }
    );
  }

  if (message.type === 'GET_VAULT_DATA') {
    const vault = await loadVault();
    return { success: true, vault };
  }

  if (message.type === 'SAVE_VAULT_PROFILE') {
    await saveUserProfile(message.profile || {});
    return { success: true };
  }

  if (message.type === 'SAVE_SITE_CREDENTIAL') {
    await saveSiteCredential(message.credential);
    return { success: true };
  }

  if (message.type === 'DELETE_SITE_CREDENTIAL') {
    await deleteSiteCredential(message.domain, message.username);
    return { success: true };
  }

  if (message.type === 'CANCEL_RUN' || message.type === 'STOP_RUN') {
    coordinator.cancelRun();
    return { success: true, state: 'idle', message: 'Run cancelled by user' };
  }

  throw new Error(`Unsupported side-panel request: ${message?.type || 'unknown'}`);
}

// A named port keeps the MV3 service worker alive for the full model request and
// avoids one-shot runtime message response races with content/offscreen contexts.
if (typeof chrome !== 'undefined' && chrome.runtime?.onConnect) {
  chrome.runtime.onConnect.addListener((port: any) => {
    if (port.name !== 'privapilot-sidepanel') return;

    port.onMessage.addListener((message: any) => {
      const requestId = message?.requestId;
      if (!requestId) return;

      handleSidepanelRequest(message).then((response) => {
        port.postMessage({ requestId, response });
      }).catch((err) => {
        port.postMessage({
          requestId,
          response: {
            success: false,
            state: 'failed-safe',
            reply: `Could not reach the reasoning model: ${err?.message || 'unknown error'}`,
            error: err?.message || 'Request failed',
            maskCount: 0,
            elementCount: 0,
            modelConnected: false
          }
        });
      });
    });
  });
}

if (typeof chrome !== 'undefined' && chrome.runtime && chrome.runtime.onMessage) {
  chrome.runtime.onMessage.addListener((message: any, _sender: any, sendResponse: (res: any) => void) => {
    if (message?.target && message.target !== 'privapilot-background') {
      return false;
    }

    if (message.type === 'CANCEL_RUN' || message.type === 'STOP_RUN') {
      coordinator.cancelRun();
      sendResponse({ success: true, state: 'idle', message: 'Run cancelled by user' });
      return true;
    }

    if (message.type === 'START_AGENT_RUN') {
      coordinator.startRun(message.goal || 'Safe assistance', {
        runId: message.runId,
        maxSteps: message.maxSteps,
        tabId: message.tabId
      }).then((result) => {
        sendResponse(result);
      }).catch((err) => {
        sendResponse({ success: false, state: 'failed-safe', error: err.message });
      });
      return true;
    }

    if (message.type === 'GENERAL_CHAT') {
      coordinator.chatWithoutPage(message.message || '', message.history).then((res) => {
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
      coordinator.chatWithPage(message.message || '', message.history).then((res) => {
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

    if (message.type === 'SET_SERVER_URL') {
      coordinator.setServerUrl(message.url);
      sendResponse({ success: true, url: message.url });
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

    if (message.type === 'SUBMIT_USER_INPUT') {
      coordinator.submitUserInput(
        message.inputs || {},
        message.tabId,
        {
          resumeLoop: message.resumeLoop ?? true,
          targetLocalId: message.targetLocalId,
          saveToVault: message.saveToVault,
          inputKey: message.inputKey
        }
      ).then((result) => {
        sendResponse(result);
      }).catch((err) => {
        sendResponse({ success: false, state: 'failed-safe', error: err.message });
      });
      return true;
    }

    if (message.type === 'GET_VAULT_DATA') {
      loadVault().then((vault) => {
        sendResponse({ success: true, vault });
      }).catch((err) => {
        sendResponse({ success: false, error: err.message });
      });
      return true;
    }

    if (message.type === 'SAVE_VAULT_PROFILE') {
      saveUserProfile(message.profile || {}).then(() => {
        sendResponse({ success: true });
      }).catch((err) => {
        sendResponse({ success: false, error: err.message });
      });
      return true;
    }

    if (message.type === 'SAVE_SITE_CREDENTIAL') {
      saveSiteCredential(message.credential).then(() => {
        sendResponse({ success: true });
      }).catch((err) => {
        sendResponse({ success: false, error: err.message });
      });
      return true;
    }

    if (message.type === 'DELETE_SITE_CREDENTIAL') {
      deleteSiteCredential(message.domain, message.username).then(() => {
        sendResponse({ success: true });
      }).catch((err) => {
        sendResponse({ success: false, error: err.message });
      });
      return true;
    }

    if (message.type === 'GET_STATE') {
      sendResponse({ state: coordinator.getState() });
      return true;
    }

    if (message.type === 'GET_LAST_RESULT') {
      sendResponse(coordinator.getLastResult());
      return true;
    }

    return false;
  });
}
