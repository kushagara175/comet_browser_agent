/**
 * PrivaPilot Extension HUD Controller
 *
 * Provides clean real-time interaction between Chrome page, in-browser privacy pipeline,
 * and the local reasoning model.
 */

document.addEventListener('DOMContentLoaded', () => {
  // Elements
  const shaderCanvas = document.getElementById('shaderCanvas');
  const loadingView = document.getElementById('loadingView');
  const aiWorkerView = document.getElementById('aiWorkerView');
  const backToConnectBtn = document.getElementById('backToConnectBtn');

  // Initialize WebGL Waves Shader Background
  if (shaderCanvas && typeof window.initWavesShader === 'function') {
    window.initWavesShader(shaderCanvas);
  }

  // Auto transition from View 0 (Connect to Valley Loading) -> AI WorkerView (HUD Chat) after 3 seconds
  if (loadingView && aiWorkerView) {
    setTimeout(() => {
      loadingView.classList.add('hidden');
      aiWorkerView.classList.remove('hidden');
      setTimeout(() => chatInput?.focus(), 80);
    }, 3000);
  }

  const agentStatusBadge = document.getElementById('agentStatusBadge');
  const activeTabUrl = document.getElementById('activeTabUrl');
  const maskCountBadge = document.getElementById('maskCountBadge');
  const maskCountText = document.getElementById('maskCountText');
  const toggleVoiceBtn = document.getElementById('toggleVoiceBtn');

  if (backToConnectBtn) {
    backToConnectBtn.addEventListener('click', () => {
      aiWorkerView?.classList.add('hidden');
      loadingView?.classList.remove('hidden');
      setTimeout(() => {
        loadingView?.classList.add('hidden');
        aiWorkerView?.classList.remove('hidden');
      }, 1500);
    });
  }

  // Tabs
  const tabChatBtn = document.getElementById('tabChatBtn');
  const tabInspectorBtn = document.getElementById('tabInspectorBtn');
  const tabAuditBtn = document.getElementById('tabAuditBtn');

  const tabChatContent = document.getElementById('tabChatContent');
  const tabInspectorContent = document.getElementById('tabInspectorContent');
  const tabAuditContent = document.getElementById('tabAuditContent');

  // Chat Elements
  const chatForm = document.getElementById('chatForm');
  const chatInput = document.getElementById('chatInput');
  const chatMessages = document.getElementById('chatMessages');

  // Inspector Elements
  const toggleRedactedBtn = document.getElementById('toggleRedactedBtn');
  const toggleRawBtn = document.getElementById('toggleRawBtn');
  const inspectorImage = document.getElementById('inspectorImage');
  const redactionOverlayBadge = document.getElementById('redactionOverlayBadge');
  const statElementsCount = document.getElementById('statElementsCount');
  const statMasksCount = document.getElementById('statMasksCount');

  // Telemetry Elements
  const meterClientLatency = document.getElementById('meterClientLatency');
  const meterServerLatency = document.getElementById('meterServerLatency');
  const meterTotalLatency = document.getElementById('meterTotalLatency');
  const auditLogFeed = document.getElementById('auditLogFeed');

  // Confirmation Modal
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
  let voiceEnabled = false;

  // 1. Voice Narration Toggle
  if (toggleVoiceBtn) {
    toggleVoiceBtn.addEventListener('click', () => {
      voiceEnabled = !voiceEnabled;
      toggleVoiceBtn.classList.toggle('active', voiceEnabled);
      const label = toggleVoiceBtn.querySelector('.voice-label');
      if (label) label.innerText = voiceEnabled ? 'Voice ON' : 'Voice';
      if (voiceEnabled) {
        speakNarration('PrivaPilot voice narration enabled.');
      } else if (typeof window !== 'undefined' && window.speechSynthesis) {
        window.speechSynthesis.cancel();
      }
    });
  }

  function speakNarration(text) {
    if (!voiceEnabled || typeof window === 'undefined' || !window.speechSynthesis) return;
    try {
      window.speechSynthesis.cancel();
      const utterance = new SpeechSynthesisUtterance(text);
      utterance.rate = 1.05;
      utterance.pitch = 1.0;
      window.speechSynthesis.speak(utterance);
    } catch {
      // Speech synthesis fallback
    }
  }

  // 2. Fetch Active Tab URL
  function fetchActiveTabUrl() {
    if (typeof chrome !== 'undefined' && chrome.tabs && chrome.tabs.query) {
      chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
        if (tabs && tabs[0]?.url) {
          try {
            const urlObj = new URL(tabs[0].url);
            if (activeTabUrl) activeTabUrl.innerText = urlObj.hostname + (urlObj.port ? ':' + urlObj.port : '') + urlObj.pathname;
          } catch {
            if (activeTabUrl) activeTabUrl.innerText = tabs[0].url;
          }
        }
      });
    }
  }

  fetchActiveTabUrl();

  // 3. Tab Switching
  function switchTab(activeBtn, activePane) {
    [tabChatBtn, tabInspectorBtn, tabAuditBtn].forEach(b => b?.classList.remove('active'));
    [tabChatContent, tabInspectorContent, tabAuditContent].forEach(p => p?.classList.add('hidden'));

    activeBtn?.classList.add('active');
    activePane?.classList.remove('hidden');
  }

  tabChatBtn?.addEventListener('click', () => switchTab(tabChatBtn, tabChatContent));
  tabInspectorBtn?.addEventListener('click', () => switchTab(tabInspectorBtn, tabInspectorContent));
  tabAuditBtn?.addEventListener('click', () => switchTab(tabAuditBtn, tabAuditContent));

  // 4. Quick Goal Chips
  document.querySelectorAll('.sample-goal-btn, .quick-chip').forEach(btn => {
    btn.addEventListener('click', () => {
      const goal = btn.getAttribute('data-goal');
      if (chatInput && goal) {
        chatInput.value = goal;
        executeGoal(goal);
      }
    });
  });

  // 5. Dual-Pane Inspector Toggle
  function updateInspectorImage() {
    if (!inspectorImage) return;

    if (activeInspectorMode === 'sanitized') {
      inspectorImage.src = cachedSanitizedScreenshot || 'data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" width="320" height="180"><rect width="100%" height="100%" fill="%230f172a"/><text x="50%" y="50%" dominant-baseline="middle" text-anchor="middle" fill="%2338bdf8" font-family="sans-serif" font-size="12">Sanitized Viewport (Zero Sensitive Leaks)</text></svg>';
      toggleRedactedBtn?.classList.add('active');
      toggleRawBtn?.classList.remove('active');
      if (redactionOverlayBadge) redactionOverlayBadge.innerText = 'Sanitized Wire View';
    } else {
      inspectorImage.src = cachedRawScreenshot || 'data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" width="320" height="180"><rect width="100%" height="100%" fill="%231e293b"/><text x="50%" y="50%" dominant-baseline="middle" text-anchor="middle" fill="%23ef4444" font-family="sans-serif" font-size="12">Raw Capture (Strictly Local on Device)</text></svg>';
      toggleRawBtn?.classList.add('active');
      toggleRedactedBtn?.classList.remove('active');
      if (redactionOverlayBadge) redactionOverlayBadge.innerText = 'Raw Local Capture';
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

  // 6. Audit Trail Logging
  function addAuditEntry(tag, text, tagClass = 'pass') {
    if (!auditLogFeed) return;
    const now = new Date();
    const timeStr = `${String(now.getMinutes()).padStart(2, '0')}:${String(now.getSeconds()).padStart(2, '0')}`;

    const div = document.createElement('div');
    div.className = 'audit-entry';
    div.innerHTML = `
      <span class="ae-time">${timeStr}</span>
      <span class="ae-tag ${tagClass}">${tag}</span>
      <span class="ae-desc" title="${text}">${text}</span>
    `;
    auditLogFeed.prepend(div);
  }

  // 7. Update Status Indicator
  function setAgentStatus(status, label) {
    if (!agentStatusBadge) return;
    agentStatusBadge.className = `status-pill ${status}`;
    agentStatusBadge.innerText = label;
  }

  // 8. Render Agent Completed Action
  function renderActionResult(agentBubble, res) {
    if (!agentBubble) return;

    if (!res || !res.success) {
      agentBubble.innerHTML = `<span style="color: #dc2626; font-weight: 600;">⚠️ ${res?.error || 'Action failed to execute'}</span>`;
      setAgentStatus('idle', 'Failed');
      return;
    }

    const action = res.proposal || { kind: 'click', rationale: res.message || 'Action executed successfully', confidence: 0.95, risk: 'safe' };
    const sanitized = res.sanitized;
    const maskCount = sanitized?.maskCount ?? 0;
    const elementCount = sanitized?.elements?.length ?? 0;

    const kindClass = action.kind === 'type' ? 'kind-type' : (action.kind === 'finish' ? 'kind-finish' : '');
    const riskClass = action.risk === 'protected' ? 'risk-protected' : 'risk-safe';

    agentBubble.innerHTML = `
      <div class="perception-badge-row">
        <span class="perception-pill pill-shield">🛡️ ${maskCount} Masks Applied</span>
        <span class="perception-pill">🔍 ${elementCount} Elements Identified</span>
      </div>

      <div class="thought-card">
        <div class="thought-header">
          <span>🧠 Model Chain-of-Thought</span>
          <span>${Math.round((action.confidence || 0.95) * 100)}% Conf</span>
        </div>
        <div class="thought-content">${action.rationale}</div>
      </div>

      <div class="action-dispatch-card">
        <div class="action-card-top">
          <span class="action-kind-tag ${kindClass}">${(action.kind || 'click').toUpperCase()}</span>
          <span class="risk-pill ${riskClass}">${(action.risk || 'safe').toUpperCase()}</span>
        </div>
        <div class="action-target-row">Target: <code>${action.targetLocalId || 'page'}</code></div>
        ${action.textToType ? `<div style="font-size: 10.5px; color: #475569;">Input: "<strong>${action.textToType}</strong>"</div>` : ''}
        ${action.expectedState ? `<div class="action-rationale-row">Expected: ${action.expectedState}</div>` : ''}
      </div>
      <div style="margin-top: 4px; font-size: 10.5px; color: #16a34a; font-weight: 600;">✓ Action executed on page</div>
    `;

    chatMessages.scrollTop = chatMessages.scrollHeight;
    setAgentStatus('success', 'Complete');

    // Update mask count pill
    if (maskCountText) maskCountText.innerText = `${maskCount} Masks`;

    // Update Telemetry & Inspector
    if (res.telemetry) {
      if (meterClientLatency) meterClientLatency.innerText = `${res.telemetry.clientLatencyMs} ms`;
      if (meterServerLatency) meterServerLatency.innerText = `${res.telemetry.serverLatencyMs} ms`;
      if (meterTotalLatency) meterTotalLatency.innerText = `${res.telemetry.totalLatencyMs} ms`;
      addAuditEntry('PERF', `Round-trip ${res.telemetry.totalLatencyMs}ms (Client: ${res.telemetry.clientLatencyMs}ms, VLM: ${res.telemetry.serverLatencyMs}ms)`, 'pass');
    }

    if (sanitized) {
      cachedSanitizedScreenshot = sanitized.sanitizedScreenshotDataUrl || '';
      if (statElementsCount) statElementsCount.innerText = String(elementCount);
      if (statMasksCount) statMasksCount.innerText = String(maskCount);
      updateInspectorImage();
      addAuditEntry('MASK', `Applied ${maskCount} opaque masks on-device`, 'mask');
    }

    if (res.rawCapture) {
      cachedRawScreenshot = res.rawCapture.rawScreenshotDataUrl || '';
    }

    addAuditEntry('ACT', `${(action.kind || 'action').toUpperCase()} on ${action.targetLocalId || 'element'}`, 'pass');

    // Voice Narration
    if (action.rationale) {
      speakNarration(`Executed ${action.kind} on ${action.targetLocalId || 'page'}. ${action.rationale}`);
    }
  }

  // 9. Execute Goal via Backend Chat API
  async function executeGoal(goalText) {
    if (!goalText) return;

    // Clean welcome box
    const welcomeBox = chatMessages.querySelector('.welcome-card');
    if (welcomeBox) welcomeBox.remove();

    // Append User Bubble
    const userBubble = document.createElement('div');
    userBubble.className = 'chat-msg user';
    userBubble.innerText = goalText;
    chatMessages.appendChild(userBubble);
    if (chatInput) chatInput.value = '';
    chatMessages.scrollTop = chatMessages.scrollHeight;

    // Append Agent Thinking Bubble
    const agentBubble = document.createElement('div');
    agentBubble.className = 'chat-msg agent';
    agentBubble.innerHTML = `
      <div style="display: flex; align-items: center; gap: 6px;">
        <span style="font-size: 14px;">⚡</span>
        <em>Thinking...</em>
      </div>
    `;
    chatMessages.appendChild(agentBubble);
    chatMessages.scrollTop = chatMessages.scrollHeight;

    try {
      const response = await fetch('http://localhost:4501/api/v1/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: goalText })
      });

      if (response.ok) {
        const data = await response.json();
        agentBubble.innerHTML = '';
        agentBubble.innerText = data.reply || 'No response.';
      } else {
        agentBubble.innerHTML = '';
        agentBubble.innerText = '⚠️ Server error. Please try again.';
      }
    } catch (err) {
      agentBubble.innerHTML = '';
      agentBubble.innerText = '⚠️ Cannot reach server. Is it running on localhost:4501?';
    }

    chatMessages.scrollTop = chatMessages.scrollHeight;
  }

  // 10. Chat Form Submit & Dynamic Mic/Send Icon Handler
  if (chatForm && chatInput) {
    const sendBtn = document.getElementById('sendBtn');

    function updateSendBtnState() {
      const hasText = chatInput.value.trim().length > 0;
      if (hasText) {
        sendBtn?.classList.add('mode-send');
        sendBtn?.classList.remove('mode-mic');
      } else {
        sendBtn?.classList.add('mode-mic');
        sendBtn?.classList.remove('mode-send');
      }
    }

    ['input', 'keyup', 'change', 'paste', 'focus'].forEach(evt => {
      chatInput.addEventListener(evt, updateSendBtnState);
    });

    updateSendBtnState();

    chatForm.addEventListener('submit', (e) => {
      e.preventDefault();
      const text = chatInput.value.trim();
      if (text) {
        executeGoal(text);
        setTimeout(updateSendBtnState, 50);
      }
    });
  }

  // 11. Protected Action Approval Handlers
  approveActionBtn?.addEventListener('click', () => {
    actionConfirmModal?.classList.add('hidden');
    addAuditEntry('AUTH', 'User Approved Protected Action', 'pass');
    if (typeof chrome !== 'undefined' && chrome.runtime?.sendMessage) {
      chrome.runtime.sendMessage({ type: 'APPROVE_ACTION' }, (res) => {
        setAgentStatus('success', 'Approved');
      });
    }
  });

  denyActionBtn?.addEventListener('click', () => {
    actionConfirmModal?.classList.add('hidden');
    addAuditEntry('AUTH', 'User Denied Action', 'warn');
    setAgentStatus('idle', 'Cancelled');
    if (typeof chrome !== 'undefined' && chrome.runtime?.sendMessage) {
      chrome.runtime.sendMessage({ type: 'DENY_ACTION' });
    }
  });

  // 12. Real-Time Broadcast Listener (for Confirmation Dialogs)
  if (typeof chrome !== 'undefined' && chrome.runtime && chrome.runtime.onMessage) {
    chrome.runtime.onMessage.addListener((message) => {
      if (message.type === 'COORDINATOR_CONFIRMATION_REQUIRED') {
        const action = message.action;
        if (confirmActionKind) confirmActionKind.innerText = (action.kind || 'click').toUpperCase();
        if (confirmTargetName) confirmTargetName.innerText = action.targetLocalId || 'Protected Action';
        if (confirmRationale) confirmRationale.innerText = action.rationale || 'State-altering action';
        actionConfirmModal?.classList.remove('hidden');
        setAgentStatus('protected', 'Approval Needed');
        addAuditEntry('AUTH', `Confirmation required for ${action.kind}`, 'warn');
      }
    });
  }
});

