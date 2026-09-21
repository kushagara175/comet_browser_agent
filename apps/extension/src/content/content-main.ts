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

interface TrappedDialog {
  type: 'alert' | 'confirm' | 'prompt';
  message: string;
  timestamp: number;
}

const capturedDialogs: TrappedDialog[] = [];

// Native Dialog Immunity: Trap alert, confirm, and prompt to avoid freezing the tab
if (typeof window !== 'undefined') {
  window.addEventListener('privapilot-native-dialog', ((e: CustomEvent) => {
    if (e.detail && typeof e.detail.message === 'string') {
      capturedDialogs.push({
        type: e.detail.type || 'alert',
        message: e.detail.message.slice(0, 200),
        timestamp: Date.now()
      });
      if (capturedDialogs.length > 10) capturedDialogs.shift();
    }
  }) as EventListener);

  try {
    window.alert = (msg?: any) => {
      const text = String(msg || '');
      capturedDialogs.push({ type: 'alert', message: text.slice(0, 200), timestamp: Date.now() });
      if (capturedDialogs.length > 10) capturedDialogs.shift();
    };

    window.confirm = (msg?: any) => {
      const text = String(msg || '');
      capturedDialogs.push({ type: 'confirm', message: text.slice(0, 200), timestamp: Date.now() });
      if (capturedDialogs.length > 10) capturedDialogs.shift();
      return true;
    };

    window.prompt = (msg?: any, defaultText?: string) => {
      const text = String(msg || '');
      capturedDialogs.push({ type: 'prompt', message: text.slice(0, 200), timestamp: Date.now() });
      if (capturedDialogs.length > 10) capturedDialogs.shift();
      return defaultText || '';
    };
  } catch {}
}

// Listen for messages from background coordinator
if (typeof chrome !== 'undefined' && chrome.runtime && chrome.runtime.onMessage) {
  chrome.runtime.onMessage.addListener((message: any, _sender: any, sendResponse: (res: any) => void) => {
    // Runtime messages are broadcast to extension contexts. Only claim commands
    // intended for this content script; otherwise it can win the response race
    // against the background worker with an empty response.
    if (
      message?.type !== 'EXTRACT_DOM_SNAPSHOT' &&
      message?.type !== 'EXECUTE_ACTION' &&
      message?.type !== 'CLEAR_OVERLAYS' &&
      message?.type !== 'FILL_FORM_FIELDS' &&
      message?.type !== 'UPLOAD_FILE' &&
      message?.type !== 'SET_ACTIVE_BORDER'
    ) {
      return false;
    }

    // Only the top-level window must extract the page DOM and manage global overlays!
    // Subframes/iframes (e.g. YouTube embeds, tracking iframes) must never hijack page perception.
    if (typeof window !== 'undefined' && window.top && window !== window.top) {
      if (
        message?.type === 'EXTRACT_DOM_SNAPSHOT' ||
        message?.type === 'EXECUTE_ACTION' ||
        message?.type === 'FILL_FORM_FIELDS'
      ) {
        return false;
      }
    }

    handleMessage(message).then(sendResponse).catch((err) => {
      sendResponse({ success: false, error: err.message });
    });
    return true; // Keep message channel open for async response
  });
}

export async function handleMessage(message: any): Promise<any> {
  if (message.type === 'SET_ACTIVE_BORDER') {
    if (message.active) {
      overlay.showAgentWorkingGlow(message.label || 'PrivaPilot Agent Active');
    } else {
      overlay.hideAgentWorkingGlow();
    }
    return { success: true };
  }

  if (message.type === 'CLEAR_OVERLAYS') {
    overlay.clear();
    overlay.hideAgentWorkingGlow();
    overlay.disableSafetyShield();
    overlay.hideCursor(0);
    return { success: true };
  }

  if (message.type === 'EXTRACT_DOM_SNAPSHOT') {
    overlay.hideAgentWorkingGlow();
    const extracted = extractor.extractSnapshot(document);
    const captureId = message.captureId || `cap_${Date.now()}`;
    currentCaptureId = captureId;
    currentElementMap = extracted.elementMap;

    // Merge recent captured native dialogs into snapshot
    const activeTrapped = capturedDialogs.filter((d) => Date.now() - d.timestamp < 30000);
    const trappedTitles = activeTrapped.map((d) => `${d.type.toUpperCase()}: ${d.message}`);
    const mergedDialogTitles = [...(extracted.snapshot.dialogTitles || []), ...trappedTitles];
    const mergedDialogCount = (extracted.snapshot.visibleDialogCount || 0) + trappedTitles.length;

    const elementsWithAliases = (extracted.snapshot.interactiveElements || []).map((e: any) => ({
      ...e,
      text: e.text || e.rawName || '',
      sanitizedName: e.sanitizedName || e.rawName || '',
      name: e.name || e.rawName || '',
      rawName: e.rawName || ''
    }));

    const snapshot = {
      ...extracted.snapshot,
      visibleDialogCount: mergedDialogCount,
      dialogTitles: mergedDialogTitles,
      interactiveElements: elementsWithAliases,
      elements: elementsWithAliases
    };

    return {
      success: true,
      captureId,
      snapshot,
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

  if (message.type === 'FILL_FORM_FIELDS') {
    const { username, password } = message;
    let userFilled = false;
    let passFilled = false;

    // A. Find username/email field
    if (username) {
      const userSelectors = [
        'input[type="email"]',
        'input#email',
        'input#username',
        'input#user',
        'input#login',
        'input[name*="email" i]',
        'input[name*="username" i]',
        'input[name*="user" i]',
        'input[name*="login" i]',
        'input[placeholder*="email" i]',
        'input[placeholder*="username" i]',
        'input[placeholder*="user" i]',
        'input[placeholder*="login" i]',
        'input[aria-label*="email" i]',
        'input[aria-label*="username" i]'
      ];
      let userEl: HTMLInputElement | null = null;
      for (const sel of userSelectors) {
        userEl = document.querySelector(sel) as HTMLInputElement;
        if (userEl && !userEl.disabled && !userEl.readOnly) break;
      }
      if (!userEl) {
        const allInputs = Array.from(document.querySelectorAll('input:not([type="password"]):not([type="hidden"]):not([type="submit"]):not([type="button"]):not([type="checkbox"]):not([type="radio"])')) as HTMLInputElement[];
        userEl = allInputs.find(i => !i.disabled && !i.readOnly && i.offsetParent !== null) || null;
      }
      if (userEl) {
        ActionExecutor.execute({
          actionId: `act_fill_user_${Date.now()}`,
          kind: 'type',
          targetLocalId: 'direct_user_fill',
          textToType: username,
          confidence: 1.0,
          risk: 'safe',
          userApproved: true,
          rationale: 'Direct fill username/email'
        }, new Map([['direct_user_fill', userEl]]));
        userFilled = true;
      }
    }

    // B. Find password field
    if (password) {
      const passSelectors = [
        'input[type="password"]',
        'input#password',
        'input#pass',
        'input#pwd',
        'input[name*="password" i]',
        'input[name*="pass" i]',
        'input[name*="pwd" i]',
        'input[placeholder*="password" i]',
        'input[aria-label*="password" i]'
      ];
      let passEl: HTMLInputElement | null = null;
      for (const sel of passSelectors) {
        passEl = document.querySelector(sel) as HTMLInputElement;
        if (passEl && !passEl.disabled && !passEl.readOnly) break;
      }
      if (passEl) {
        ActionExecutor.execute({
          actionId: `act_fill_pass_${Date.now()}`,
          kind: 'type',
          targetLocalId: 'direct_pass_fill',
          textToType: password,
          confidence: 1.0,
          risk: 'safe',
          userApproved: true,
          rationale: 'Direct fill password'
        }, new Map([['direct_pass_fill', passEl]]));
        passFilled = true;
      }
    }

    return {
      success: userFilled || passFilled,
      userFilled,
      passFilled,
      message: userFilled && passFilled
        ? 'Successfully filled username and password'
        : (userFilled ? 'Filled username' : (passFilled ? 'Filled password' : 'No matching input fields found'))
    };
  }

  if (message.type === 'EXECUTE_ACTION') {
    const proposal: ActionProposal = message.proposal;
    overlay.showAgentWorkingGlow(proposal?.kind ? `PrivaPilot: ${proposal.kind.toUpperCase()}` : 'PrivaPilot Active');
    overlay.enableSafetyShield(proposal?.kind ? `PrivaPilot: ${proposal.kind.toUpperCase()}` : 'PrivaPilot Automating Page...');

    try {
      // 1. Target element resolution with live self-healing
      let targetEl = proposal.targetLocalId ? currentElementMap.get(proposal.targetLocalId) : null;

      // If target is missing from current map or detached from DOM, self-heal immediately
      if (proposal.targetLocalId && (!targetEl || !targetEl.isConnected)) {
        const refreshed = extractor.extractSnapshot(document);
        currentElementMap = refreshed.elementMap;
        currentCaptureId = message.captureId || currentCaptureId;
        targetEl = currentElementMap.get(proposal.targetLocalId) || null;

        // Heuristic self-healing: if still not found by localId, match by semantic text or rationale
        if (!targetEl) {
          const targetTextMatch = (proposal.rationale || '').match(/["']([^"']+)["']/);
          const targetSearch = targetTextMatch ? targetTextMatch[1].toLowerCase().trim() : '';
          if (targetSearch) {
            for (const el of currentElementMap.values()) {
              const elText = (el.innerText || el.getAttribute('aria-label') || el.getAttribute('placeholder') || '').toLowerCase();
              if (el.isConnected && (elText === targetSearch || elText.includes(targetSearch))) {
                targetEl = el;
                break;
              }
            }
          }
        }
      }

      // Guard against stale capture only if target cannot be found in live DOM
      if (!targetEl && proposal.targetLocalId) {
        return {
          success: false,
          actionId: proposal.actionId,
          semanticOutcomeVerified: false,
          staleTarget: true,
          message: `Target element '${proposal.targetLocalId}' not found in live DOM after self-healing retry`
        };
      }

      // 2. Highlight target and glide AI agent cursor if present
      if (targetEl) {
        if (typeof targetEl.scrollIntoView === 'function') {
          try {
            targetEl.scrollIntoView({ behavior: 'auto', block: 'nearest', inline: 'nearest' });
          } catch (_) {}
        }
        overlay.highlightTargetElement(targetEl, proposal.kind.toUpperCase(), 1200);
        // Smoothly glide the visual AI agent cursor to the targeted element
        await overlay.glideCursorTo(targetEl, proposal.kind.toUpperCase(), (proposal as any).textToType);
      }

      // Capture safe pre-action semantic snapshot BEFORE execution
      const preSnapshot = SemanticStateVerifier.captureSnapshot(targetEl, document);

      // 3. Dispatch synthetic DOM action with physical click/drag simulation
      if (proposal.kind === 'click' && targetEl) {
        await overlay.animateClickPress();
      } else if (proposal.kind === 'drag_and_drop' && targetEl) {
        const destEl = (proposal as any).destinationLocalId ? currentElementMap.get((proposal as any).destinationLocalId) : null;
        if (destEl) {
          await overlay.animateDrag(targetEl, destEl);
        }
      }

      const execResult = ActionExecutor.execute(proposal, currentElementMap);
      if (proposal.kind === 'scroll') {
        // Allow browser smooth scroll interpolation to glide realistically and settle
        await new Promise((r) => setTimeout(r, 450));
      }

      // Visual feedback: Flash green dispatched ring on target and trigger typing badge
      if (targetEl && execResult.success) {
        if (proposal.kind === 'type') {
          overlay.triggerTypingBadge();
        }
        overlay.flashActionDispatched();
      } else {
        overlay.clear();
      }

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
    } finally {
      // Re-enable external user interaction and keep cursor resting naturally on screen
      overlay.disableSafetyShield();
      overlay.hideCursor(15000);
    }
  }

  if (message.type === 'CLEAR_OVERLAYS') {
    overlay.clear();
    overlay.hideAgentWorkingGlow();
    overlay.disableSafetyShield();
    overlay.hideCursor(0);
    return { success: true };
  }

  if (message.type === 'UPLOAD_FILE') {
    const { targetLocalId, fileName } = message;
    let targetEl = targetLocalId ? currentElementMap.get(targetLocalId) : null;
    if (!targetEl) {
      targetEl = document.querySelector('input[type="file"]') as HTMLElement;
    }
    if (!targetEl) {
      return { success: false, message: 'No file input element found in live DOM' };
    }
    const result = ActionExecutor.execute({
      actionId: `act_upload_${Date.now()}`,
      kind: 'type',
      targetLocalId: targetLocalId || 'direct_file_upload',
      textToType: fileName || 'submission.pdf',
      confidence: 1.0,
      risk: 'safe',
      userApproved: true,
      rationale: 'Direct file upload'
    }, new Map([[targetLocalId || 'direct_file_upload', targetEl]]));
    return result;
  }

  return { success: false, error: `Unknown message type: ${message.type}` };
}
