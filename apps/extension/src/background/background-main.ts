/**
 * @privapilot/extension - Background Service Worker Main Entry
 */

import { RunCoordinator } from './coordinator.js';

declare const chrome: any;

const coordinator = new RunCoordinator();

if (typeof chrome !== 'undefined' && chrome.runtime && chrome.runtime.onMessage) {
  chrome.runtime.onMessage.addListener((message: any, _sender: any, sendResponse: (res: any) => void) => {
    if (message.type === 'START_AGENT_RUN') {
      coordinator.startRun(message.goal || 'Safe assistance').then(() => {
        sendResponse({ success: true, state: coordinator.getState() });
      }).catch((err) => {
        sendResponse({ success: false, error: err.message });
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
