/**
 * PrivaPilot Extension Sidepanel Controller
 *
 * Implements:
 * 1. View 1 (Onboarding / Connection) <-> View 2 (Mission Control HUD) transitions
 * 2. 3-Tab Navigation (Chat | Dual-Pane Inspector | Telemetry & Audit)
 * 3. Real-Time Coordinator Event Streaming (State, Sanitization, Actions, Confirmation, Telemetry)
 * 4. Protected Action Interlock (Approve / Deny modal)
 */

document.addEventListener('DOMContentLoaded', () => {
  // --- View 1 Elements ---
  const connectionView = document.getElementById('connectionView');
  const aiWorkerView = document.getElementById('aiWorkerView');
  const continueBtn = document.getElementById('continueBtn');
  const copyTokenBtn = document.getElementById('copyTokenBtn');
  const activeTabUrl = document.getElementById('activeTabUrl');

  // --- View 2 Header & Tabs ---
  const backToConnectBtn = document.getElementById('backToConnectBtn');
  const agentStatusBadge = document.getElementById('agentStatusBadge');
  const privacyStatusText = document.getElementById('privacyStatusText');
  const maskCountBadge = document.getElementById('maskCountBadge');

  const tabChatBtn = document.getElementById('tabChatBtn');
  const tabInspectorBtn = document.getElementById('tabInspectorBtn');
  const tabAuditBtn = document.getElementById('tabAuditBtn');

  const tabChatContent = document.getElementById('tabChatContent');
  const tabInspectorContent = document.getElementById('tabInspectorContent');
  const tabAuditContent = document.getElementById('tabAuditContent');

  // --- Chat View Elements ---
  const chatForm = document.getElementById('chatForm');
  const chatInput = document.getElementById('chatInput');
  const chatMessages = document.getElementById('chatMessages');

  // --- Inspector Elements ---
  const toggleRedactedBtn = document.getElementById('toggleRedactedBtn');
  const toggleRawBtn = document.getElementById('toggleRawBtn');
  const inspectorImage = document.getElementById('inspectorImage');
  const redactionOverlayBadge = document.getElementById('redactionOverlayBadge');
  const statElementsCount = document.getElementById('statElementsCount');
  const statMasksCount = document.getElementById('statMasksCount');

  // --- Telemetry & Audit Elements ---
  const meterClientLatency = document.getElementById('meterClientLatency');
  const meterServerLatency = document.getElementById('meterServerLatency');
  const meterTotalLatency = document.getElementById('meterTotalLatency');
  const auditLogFeed = document.getElementById('auditLogFeed');

  // --- Confirmation Modal Elements ---
  const actionConfirmModal = document.getElementById('actionConfirmModal');
  const confirmRationale = document.getElementById('confirmRationale');
  const confirmActionKind = document.getElementById('confirmActionKind');
  const confirmTargetName = document.getElementById('confirmTargetName');
  const approveActionBtn = document.getElementById('approveActionBtn');
  const denyActionBtn = document.getElementById('denyActionBtn');

  // Internal State
  let cachedRawScreenshot = '';
  let cachedSanitizedScreenshot = '';
  let activeInspectorMode = 'sanitized';

  // 1. Fetch Active Tab URL
  function fetchActiveTabUrl() {
    if (typeof chrome !== 'undefined' && chrome.tabs && chrome.tabs.query) {
      chrome.tabs.query({ active: true, lastFocusedWindow: true }, (tabs) => {
        if (tabs && tabs[0]?.url) {
          activeTabUrl.innerText = tabs[0].url;
          activeTabUrl.href = tabs[0].url;
        } else if (activeTabUrl) {
          activeTabUrl.innerText = 'http://localhost:4500/';
          activeTabUrl.href = 'http://localhost:4500/';
        }
      });
    }
  }

  fetchActiveTabUrl();

  // 2. View 1 <-> View 2 Transitions
  if (continueBtn) {
    continueBtn.addEventListener('click', () => {
      connectionView?.classList.add('hidden');
      aiWorkerView?.classList.remove('hidden');
      setTimeout(() => chatInput?.focus(), 100);
    });
  }

  if (backToConnectBtn) {
    backToConnectBtn.addEventListener('click', () => {
      aiWorkerView?.classList.add('hidden');
      connectionView?.classList.remove('hidden');
    });
  }

  // 3. Tab Switching
  function switchTab(activeTab, activePane) {
    [tabChatBtn, tabInspectorBtn, tabAuditBtn].forEach(b => b?.classList.remove('active'));
    [tabChatContent, tabInspectorContent, tabAuditContent].forEach(p => p?.classList.add('hidden'));

    activeTab?.classList.add('active');
    activePane?.classList.remove('hidden');
  }

  tabChatBtn?.addEventListener('click', () => switchTab(tabChatBtn, tabChatContent));
  tabInspectorBtn?.addEventListener('click', () => switchTab(tabInspectorBtn, tabInspectorContent));
  tabAuditBtn?.addEventListener('click', () => switchTab(tabAuditBtn, tabAuditContent));

  // 4. Sample Goal Buttons
  document.querySelectorAll('.sample-goal-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const goal = btn.getAttribute('data-goal');
      if (chatInput && goal) {
        chatInput.value = goal;
        chatForm?.dispatchEvent(new Event('submit'));
      }
    });
  });

  // 5. Dual-Pane Inspector Toggle
  function updateInspectorImage() {
    if (!inspectorImage) return;

    if (activeInspectorMode === 'sanitized') {
      inspectorImage.src = cachedSanitizedScreenshot || 'data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" width="320" height="200"><rect width="100%" height="100%" fill="%230f172a"/><text x="50%" y="50%" dominant-baseline="middle" text-anchor="middle" fill="%2338bdf8" font-family="sans-serif" font-size="12">[Sanitized Screenshot - Opaque Masks Applied]</text></svg>';
      toggleRedactedBtn?.classList.add('active');
      toggleRawBtn?.classList.remove('active');
      if (redactionOverlayBadge) {
        redactionOverlayBadge.innerText = 'Sanitized Context (Wire Only)';
        redactionOverlayBadge.style.color = '#38bdf8';
        redactionOverlayBadge.style.borderColor = '#38bdf8';
      }
    } else {
      inspectorImage.src = cachedRawScreenshot || 'data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" width="320" height="200"><rect width="100%" height="100%" fill="%23ffffff"/><text x="50%" y="50%" dominant-baseline="middle" text-anchor="middle" fill="%23ef4444" font-family="sans-serif" font-size="12">[Raw Screenshot - Strictly Local to Browser]</text></svg>';
      toggleRawBtn?.classList.add('active');
      toggleRedactedBtn?.classList.remove('active');
      if (redactionOverlayBadge) {
        redactionOverlayBadge.innerText = 'Raw Capture (Strictly Local)';
        redactionOverlayBadge.style.color = '#ef4444';
        redactionOverlayBadge.style.borderColor = '#ef4444';
      }
    }
  }

  toggleRedactedBtn?.addEventListener('click', () => {
    activeInspectorMode = 'sanitized';
    updateInspectorImage();
  });

  toggleRawBtn?.addEventListener('click', () => {
    activeInspectorMode = 'raw';
    updateInspectorImage();
  });

  // 6. Audit Trail Logging Helper
  function addAuditEntry(tag, text, tagClass = 'tag-pass') {
    if (!auditLogFeed) return;
    const now = new Date();
    const timeStr = `${String(now.getMinutes()).padStart(2, '0')}:${String(now.getSeconds()).padStart(2, '0')}`;

    const div = document.createElement('div');
    div.className = 'audit-item';
    div.innerHTML = `
      <span class="audit-time">${timeStr}</span>
      <span class="audit-tag ${tagClass}">${tag}</span>
      <span class="audit-desc" title="${text}">${text}</span>
    `;
    auditLogFeed.prepend(div);
  }

  // 7. Chat Form Submission
  if (chatForm && chatInput && chatMessages) {
    chatForm.addEventListener('submit', (e) => {
      e.preventDefault();
      const text = chatInput.value.trim();
      if (!text) return;

      const emptyState = chatMessages.querySelector('.ai-empty-state');
      if (emptyState) emptyState.remove();

      // User message
      const userBubble = document.createElement('div');
      userBubble.className = 'chat-msg user';
      userBubble.innerText = text;
      chatMessages.appendChild(userBubble);
      chatInput.value = '';
      chatMessages.scrollTop = chatMessages.scrollHeight;

      // Agent initial thinking
      const agentBubble = document.createElement('div');
      agentBubble.id = `msg_${Date.now()}`;
      agentBubble.className = 'chat-msg agent';
      agentBubble.innerHTML = '<em>Scanning DOM & evaluating privacy boundaries...</em>';
      chatMessages.appendChild(agentBubble);
      chatMessages.scrollTop = chatMessages.scrollHeight;

      if (agentStatusBadge) {
        agentStatusBadge.className = 'status-indicator-running';
        agentStatusBadge.innerText = 'Scanning';
      }

      addAuditEntry('RUN', `Agent run started: "${text}"`, 'tag-mask');

      if (typeof chrome !== 'undefined' && chrome.runtime?.sendMessage) {
        chrome.runtime.sendMessage({
          type: 'START_AGENT_RUN',
          goal: text
        }, (res) => {
          if (!res || !res.success) {
            agentBubble.innerHTML = `<span style="color:#ef4444;">Run encountered error: ${res?.error || 'Execution stopped'}</span>`;
            if (agentStatusBadge) {
              agentStatusBadge.className = 'status-indicator-idle';
              agentStatusBadge.innerText = 'Idle';
            }
          }
        });
      }
    });
  }

  // 8. Protected Action Confirm / Deny Handlers
  approveActionBtn?.addEventListener('click', () => {
    actionConfirmModal?.classList.add('hidden');
    addAuditEntry('USER', 'User Approved Protected Action', 'tag-pass');
    if (typeof chrome !== 'undefined' && chrome.runtime?.sendMessage) {
      chrome.runtime.sendMessage({ type: 'APPROVE_ACTION' });
    }
  });

  denyActionBtn?.addEventListener('click', () => {
    actionConfirmModal?.classList.add('hidden');
    addAuditEntry('USER', 'User Denied Action', 'tag-warn');
    if (agentStatusBadge) {
      agentStatusBadge.className = 'status-indicator-idle';
      agentStatusBadge.innerText = 'Cancelled';
    }
    if (typeof chrome !== 'undefined' && chrome.runtime?.sendMessage) {
      chrome.runtime.sendMessage({ type: 'DENY_ACTION' });
    }
  });

  // 9. Real-Time Coordinator Event Listener
  if (typeof chrome !== 'undefined' && chrome.runtime?.onMessage) {
    chrome.runtime.onMessage.addListener((message) => {
      // A. State Changes
      if (message.type === 'COORDINATOR_STATE_CHANGED') {
        if (agentStatusBadge) {
          const isRunning = message.state !== 'idle' && message.state !== 'complete' && message.state !== 'failed-safe';
          agentStatusBadge.className = isRunning ? 'status-indicator-running' : 'status-indicator-idle';
          agentStatusBadge.innerText = message.state;
        }

        if (message.message) {
          addAuditEntry('STATE', `${message.state}: ${message.message}`, 'tag-pass');
        }

        if (message.state === 'complete') {
          const lastAgentMsg = chatMessages.querySelector('.chat-msg.agent:last-child');
          if (lastAgentMsg) {
            lastAgentMsg.innerHTML += `<br><small style="color:#16a34a; font-weight:bold;">✓ Complete: ${message.message || 'Task finished'}</small>`;
            chatMessages.scrollTop = chatMessages.scrollHeight;
          }
        }
      }

      // B. Sanitization Complete (Dual-Pane Screenshot & Masks)
      if (message.type === 'COORDINATOR_SANITIZATION_COMPLETE') {
        cachedRawScreenshot = message.rawScreenshot || '';
        cachedSanitizedScreenshot = message.sanitizedScreenshot || '';

        if (maskCountBadge) maskCountBadge.innerText = `${message.maskCount || 0} Masks`;
        if (statMasksCount) statMasksCount.innerText = String(message.maskCount || 0);
        if (statElementsCount) statElementsCount.innerText = String(message.elementCount || 0);

        updateInspectorImage();
        addAuditEntry('MASK', `Applied ${message.maskCount} opaque masks & blurs`, 'tag-mask');
      }

      // C. Action Proposed
      if (message.type === 'COORDINATOR_ACTION_PROPOSED') {
        const action = message.action;
        const lastAgentMsg = chatMessages.querySelector('.chat-msg.agent:last-child');
        if (lastAgentMsg) {
          lastAgentMsg.innerHTML = `<strong>Action:</strong> <span style="color:#2563eb;">${action.kind.toUpperCase()}</span> (${action.targetLocalId || 'page'})<br><small style="color:#475569;">${action.rationale}</small>`;
          chatMessages.scrollTop = chatMessages.scrollHeight;
        }
        addAuditEntry('ACT', `${action.kind.toUpperCase()} on ${action.targetLocalId || 'target'}`, 'tag-pass');
      }

      // D. Protected Action Confirmation Required
      if (message.type === 'COORDINATOR_CONFIRMATION_REQUIRED') {
        const action = message.action;
        if (confirmActionKind) confirmActionKind.innerText = action.kind.toUpperCase();
        if (confirmTargetName) confirmTargetName.innerText = action.targetLocalId || 'Protected Action';
        if (confirmRationale) confirmRationale.innerText = action.rationale;
        actionConfirmModal?.classList.remove('hidden');

        if (agentStatusBadge) {
          agentStatusBadge.className = 'status-indicator-protected';
          agentStatusBadge.innerText = 'Approval Needed';
        }
        addAuditEntry('AUTH', `Confirmation required for ${action.kind}`, 'tag-warn');
      }

      // E. Telemetry Metrics Update
      if (message.type === 'COORDINATOR_TELEMETRY_UPDATED') {
        const t = message.telemetry;
        if (meterClientLatency) meterClientLatency.innerText = `${t.clientLatencyMs} ms`;
        if (meterServerLatency) meterServerLatency.innerText = `${t.serverLatencyMs} ms`;
        if (meterTotalLatency) meterTotalLatency.innerText = `${t.totalLatencyMs} ms`;

        addAuditEntry('PERF', `Round-trip: ${t.totalLatencyMs}ms (Client: ${t.clientLatencyMs}ms, Server: ${t.serverLatencyMs}ms)`, 'tag-pass');
      }
    });
  }

  // 10. Copy Token Button
  if (copyTokenBtn) {
    copyTokenBtn.addEventListener('click', () => {
      const dummyToken = 'tok_privapilot_secure_' + Math.random().toString(36).substring(2, 10);
      navigator.clipboard.writeText(dummyToken).then(() => {
        const span = copyTokenBtn.querySelector('span');
        if (span) {
          span.innerText = 'Copied!';
          setTimeout(() => span.innerText = 'Token', 1500);
        }
      });
    });
  }
});
