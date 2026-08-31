/**
 * @privapilot/extension - Background Service Worker Main Entry
 */
import { RunCoordinator } from './coordinator.js';
const coordinator = new RunCoordinator();
// Stream coordinator lifecycle events to Extension UI (Sidepanel/HUD)
coordinator.setListeners({
    onStateChange: (state, message) => {
        if (typeof chrome !== 'undefined' && chrome.runtime?.sendMessage) {
            chrome.runtime.sendMessage({ type: 'COORDINATOR_STATE_CHANGED', state, message }).catch(() => { });
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
            }).catch(() => { });
        }
    },
    onActionProposed: (action) => {
        if (typeof chrome !== 'undefined' && chrome.runtime?.sendMessage) {
            chrome.runtime.sendMessage({ type: 'COORDINATOR_ACTION_PROPOSED', action }).catch(() => { });
        }
    },
    onActionConfirmedRequired: (action) => {
        if (typeof chrome !== 'undefined' && chrome.runtime?.sendMessage) {
            chrome.runtime.sendMessage({ type: 'COORDINATOR_CONFIRMATION_REQUIRED', action }).catch(() => { });
        }
    },
    onTelemetryUpdated: (telemetry) => {
        if (typeof chrome !== 'undefined' && chrome.runtime?.sendMessage) {
            chrome.runtime.sendMessage({ type: 'COORDINATOR_TELEMETRY_UPDATED', telemetry }).catch(() => { });
        }
    }
});
if (typeof chrome !== 'undefined' && chrome.runtime && chrome.runtime.onMessage) {
    chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
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
                    reply: 'Privacy Boundary Active: Context transmission was blocked.',
                    maskCount: 0,
                    elementCount: 0
                });
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
//# sourceMappingURL=background-main.js.map