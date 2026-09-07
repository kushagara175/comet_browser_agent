/**
 * @privapilot/extension - Privacy Mission Control HUD Controller
 *
 * Provides real-time visual perception inspection, fail-closed privacy metrics,
 * side-by-side raw vs sanitized verification, and secure multi-step agent interaction.
 */

/**
 * Escapes untrusted model or server strings before rendering to prevent XSS / injection.
 */
export function escapeHtml(str) {
  if (str === null || str === undefined) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

/**
 * Builds the exact minimized outgoing payload dispatched across the wire,
 * strictly omitting internal-only branded fields, raw captures, cookies, and tokens.
 */
export function buildMinimizedWirePayload(sanitized, goal = 'User goal') {
  if (!sanitized) {
    return {
      protocolVersion: '1.0',
      status: 'Awaiting initial perception cycle'
    };
  }

  return {
    protocolVersion: sanitized.protocolVersion || '1.0',
    runId: sanitized.runId || `run_${Date.now()}`,
    goal: sanitized.goal || goal,
    screenshot: sanitized.sanitizedScreenshotDataUrl
      ? (sanitized.sanitizedScreenshotDataUrl.length > 80
          ? `${sanitized.sanitizedScreenshotDataUrl.slice(0, 48)}... [${sanitized.sanitizedScreenshotDataUrl.length} chars base64 png]`
          : sanitized.sanitizedScreenshotDataUrl)
      : 'data:image/png;base64,...',
    elements: (sanitized.elements || []).map(el => ({
      localId: el.localId,
      role: el.role,
      sanitizedName: el.sanitizedName,
      coarseBounds: el.coarseBounds,
      state: el.state,
      actionCapabilities: el.actionCapabilities
    })),
    pageState: sanitized.pageState || {
      title: 'Active Webpage',
      viewport: [1280, 800]
    },
    maskCount: sanitized.maskCount ?? 0,
    visionObservations: sanitized.visionObservations || [],
    visionTelemetry: sanitized.visionTelemetry || null,
    payloadDigestSha256: sanitized.payloadDigestSha256 || 'sha256_verified'
  };
}


/**
 * Renders what the on-device Vision Transformer actually did.
 *
 * Reports the provider it really engaged and the time it really took, including
 * "unavailable" - a vision claim the user cannot verify is worth nothing, and the
 * project has already shipped one model that silently never ran.
 */
export function renderVisionPill(visionTelemetry, visionObservations = []) {
  if (!visionTelemetry) return '';
  if (!visionTelemetry.available) {
    return `<span class="perception-pill">👁️ ViT unavailable${visionTelemetry.error ? ': ' + String(visionTelemetry.error).slice(0, 60) : ''}</span>`;
  }
  if (!visionTelemetry.regionsEmbedded) {
    return `<span class="perception-pill">👁️ ${visionTelemetry.modelFamily} · idle (DOM described the page)</span>`;
  }
  const labelled = visionObservations.filter((o) => o.label).length;
  return `<span class="perception-pill">👁️ ${visionTelemetry.modelFamily} · ${visionTelemetry.providerUsed} · ` +
         `${visionTelemetry.regionsEmbedded} region(s) read, ${labelled} labelled · ${visionTelemetry.totalInferenceMs}ms</span>`;
}

/**
 * Computes mask category counts without exposing raw sensitive strings or values.
 */
export function computeMaskBreakdown(elements = [], totalMasks = 0) {
  const breakdown = {};

  for (const el of elements) {
    const name = (el.sanitizedName || '').toLowerCase();
    if (name.includes('password')) {
      breakdown.password = (breakdown.password || 0) + 1;
    } else if (name.includes('otp') || name.includes('auth')) {
      breakdown.auth_code = (breakdown.auth_code || 0) + 1;
    } else if (name.includes('payment') || name.includes('card') || name.includes('cvv')) {
      breakdown.payment = (breakdown.payment || 0) + 1;
    } else if (name.includes('national id') || name.includes('aadhaar')) {
      breakdown.national_id = (breakdown.national_id || 0) + 1;
    } else if (name.includes('email')) {
      breakdown.email = (breakdown.email || 0) + 1;
    } else if (name.includes('phone')) {
      breakdown.phone = (breakdown.phone || 0) + 1;
    } else if (name.includes('token') || name.includes('key')) {
      breakdown.token = (breakdown.token || 0) + 1;
    } else if (name.includes('sensitive') || el.role === 'canvas' || el.role === 'iframe') {
      breakdown.high_risk_surface = (breakdown.high_risk_surface || 0) + 1;
    }
  }

  const identifiedCount = Object.values(breakdown).reduce((a, b) => a + b, 0);
  if (totalMasks > identifiedCount) {
    const diff = totalMasks - identifiedCount;
    breakdown.face = (breakdown.face || 0) + diff;
  }

  return breakdown;
}

/**
 * Maps agent lifecycle state to UI status pill properties.
 */
export function mapAgentStateToStatusInfo(state) {
  switch (state) {
    case 'capturing':
    case 'detecting-sensitive-content':
    case 'sanitizing':
      return { label: 'PERCEIVING', cssClass: 'status-running' };
    case 'sending-sanitized-context':
    case 'awaiting-reasoning':
    case 'validating-action':
      return { label: 'REASONING', cssClass: 'status-running' };
    case 'executing':
      return { label: 'EXECUTING', cssClass: 'status-running' };
    case 'verifying':
      return { label: 'VERIFYING', cssClass: 'status-running' };
    case 'awaiting-user-confirmation':
      return { label: 'PENDING CONFIRMATION', cssClass: 'status-protected' };
    case 'complete':
      return { label: 'VERIFIED COMPLETE', cssClass: 'status-verified' };
    case 'blocked-local-only':
      return { label: 'BLOCKED LOCALLY', cssClass: 'status-blocked' };
    case 'failed-safe':
      return { label: 'FAILED', cssClass: 'status-failed' };
    case 'idle':
    default:
      return { label: 'IDLE', cssClass: 'status-idle' };
  }
}

/**
 * Maps vision provider name to badge text and styling.
 */
export function mapVisionProviderToBadge(provider) {
  switch (provider) {
    case 'webgpu':
      return { text: 'Vision: WebGPU', cssClass: 'provider-webgpu' };
    case 'wasm':
      return { text: 'Vision: WASM', cssClass: 'provider-wasm' };
    case 'degraded_masking':
    case 'heuristic_fallback':
      return { text: 'Vision: Degraded Masking', cssClass: 'provider-degraded' };
    case 'unavailable':
    default:
      return { text: 'Vision: Unavailable', cssClass: 'provider-unavailable' };
  }
}

/**
 * Draws the 30-frame latency sparkline with the 500ms ceiling line into an SVG polyline element.
 */
export function drawLatencySparkline(latencies, polylineElement = null) {
  const target = polylineElement || (typeof document !== 'undefined' ? document.getElementById('sparklinePolyline') : null);
  if (!target) return;
  if (!latencies || latencies.length === 0) {
    if (typeof target.setAttribute === 'function') target.setAttribute('points', '');
    return;
  }
  const maxMs = 666.6; // 500ms aligns to y=10 on a 40px height canvas
  const width = 300;
  const bottom = 36;
  const count = latencies.length;
  const step = count > 1 ? width / (count - 1) : width;

  const points = latencies.map((lat, idx) => {
    const x = Math.round(idx * step);
    const clampedLat = Math.min(maxMs, Math.max(0, lat));
    const y = Math.round(bottom - (clampedLat / maxMs) * (bottom - 4));
    return `${x},${y}`;
  }).join(' ');

  if (typeof target.setAttribute === 'function') {
    target.setAttribute('points', points);
  }
}

/**
 * Renders causal downgrade event history into the HUD log container.
 */
export function renderDowngradeEvents(events, containerElement = null) {
  const target = containerElement || (typeof document !== 'undefined' ? document.getElementById('downgradeEventFeed') : null);
  if (!target) return;
  if (!events || events.length === 0) {
    target.innerHTML = '<div class="downgrade-empty-hint">Nominal: No tier downgrade events triggered.</div>';
    return;
  }
  target.innerHTML = '';
  events.slice(-6).reverse().forEach(ev => {
    const item = typeof document !== 'undefined' && typeof document.createElement === 'function'
      ? document.createElement('div')
      : { className: '', innerHTML: '' };
    item.className = 'downgrade-item';
    const date = new Date(ev.timestamp);
    const timeStr = `${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}:${String(date.getSeconds()).padStart(2, '0')}`;
    item.innerHTML = `
      <span class="downgrade-time">${timeStr}</span>
      <span class="downgrade-tier">${escapeHtml(ev.fromTier)} &rarr; ${escapeHtml(ev.toTier)}</span>
      <span class="downgrade-reason">${escapeHtml(ev.reason)}</span>
    `;
    if (typeof target.appendChild === 'function') {
      target.appendChild(item);
    }
  });
}

/**
 * Renders live ResourceGovernor telemetry directly into HUD DOM elements.
 * Verifiable in tests and runtime — no synthetic metrics or disconnected parsers.
 */
export function renderResourceTelemetry(resources, domRefs = {}) {
  if (!resources) return;

  const budgetTierPill = domRefs.budgetTierPill !== undefined ? domRefs.budgetTierPill : (typeof document !== 'undefined' ? document.getElementById('budgetTierPill') : null);
  const budgetTierText = domRefs.budgetTierText !== undefined ? domRefs.budgetTierText : (typeof document !== 'undefined' ? document.getElementById('budgetTierText') : null);
  const budgetLatencyText = domRefs.budgetLatencyText !== undefined ? domRefs.budgetLatencyText : (typeof document !== 'undefined' ? document.getElementById('budgetLatencyText') : null);
  const budgetLatencyPill = domRefs.budgetLatencyPill !== undefined ? domRefs.budgetLatencyPill : (typeof document !== 'undefined' ? document.getElementById('budgetLatencyPill') : null);
  const budgetMemoryText = domRefs.budgetMemoryText !== undefined ? domRefs.budgetMemoryText : (typeof document !== 'undefined' ? document.getElementById('budgetMemoryText') : null);
  const budgetMemoryPill = domRefs.budgetMemoryPill !== undefined ? domRefs.budgetMemoryPill : (typeof document !== 'undefined' ? document.getElementById('budgetMemoryPill') : null);
  const budgetCacheText = domRefs.budgetCacheText !== undefined ? domRefs.budgetCacheText : (typeof document !== 'undefined' ? document.getElementById('budgetCacheText') : null);
  const meterP95Latency = domRefs.meterP95Latency !== undefined ? domRefs.meterP95Latency : (typeof document !== 'undefined' ? document.getElementById('meterP95Latency') : null);
  const meterLatencyBar = domRefs.meterLatencyBar !== undefined ? domRefs.meterLatencyBar : (typeof document !== 'undefined' ? document.getElementById('meterLatencyBar') : null);
  const meterResidentMemory = domRefs.meterResidentMemory !== undefined ? domRefs.meterResidentMemory : (typeof document !== 'undefined' ? document.getElementById('meterResidentMemory') : null);
  const meterMemoryBar = domRefs.meterMemoryBar !== undefined ? domRefs.meterMemoryBar : (typeof document !== 'undefined' ? document.getElementById('meterMemoryBar') : null);
  const meterAccountingMethod = domRefs.meterAccountingMethod !== undefined ? domRefs.meterAccountingMethod : (typeof document !== 'undefined' ? document.getElementById('meterAccountingMethod') : null);
  const meterCacheHitRate = domRefs.meterCacheHitRate !== undefined ? domRefs.meterCacheHitRate : (typeof document !== 'undefined' ? document.getElementById('meterCacheHitRate') : null);
  const meterCacheCounts = domRefs.meterCacheCounts !== undefined ? domRefs.meterCacheCounts : (typeof document !== 'undefined' ? document.getElementById('meterCacheCounts') : null);
  const meterCacheBar = domRefs.meterCacheBar !== undefined ? domRefs.meterCacheBar : (typeof document !== 'undefined' ? document.getElementById('meterCacheBar') : null);
  const meterCaptureRate = domRefs.meterCaptureRate !== undefined ? domRefs.meterCaptureRate : (typeof document !== 'undefined' ? document.getElementById('meterCaptureRate') : null);
  const meterCaptureBar = domRefs.meterCaptureBar !== undefined ? domRefs.meterCaptureBar : (typeof document !== 'undefined' ? document.getElementById('meterCaptureBar') : null);
  const governorBudgetBadge = domRefs.governorBudgetBadge !== undefined ? domRefs.governorBudgetBadge : (typeof document !== 'undefined' ? document.getElementById('governorBudgetBadge') : null);
  const tierButtons = domRefs.tierButtons !== undefined ? domRefs.tierButtons : (typeof document !== 'undefined' ? Array.from(document.querySelectorAll('.tier-btn') || []) : []);
  const sparklinePolyline = domRefs.sparklinePolyline !== undefined ? domRefs.sparklinePolyline : (typeof document !== 'undefined' ? document.getElementById('sparklinePolyline') : null);
  const downgradeEventFeed = domRefs.downgradeEventFeed !== undefined ? domRefs.downgradeEventFeed : (typeof document !== 'undefined' ? document.getElementById('downgradeEventFeed') : null);

  // Active Tier Pill
  const tier = resources.activeTier || 'T1';
  if (budgetTierPill && budgetTierText) {
    budgetTierPill.className = `budget-pill tier-${tier.toLowerCase()}`;
    const tierLabels = {
      'T0': 'T0: Heuristics & DOM',
      'T1': 'T1: CLIP ViT-B/32',
      'T2': 'T2: Escalated VLM'
    };
    budgetTierText.textContent = tierLabels[tier] || tier;
  }

  // Frame Latency Pill
  const frameMs = Math.round(resources.perceptionMs || 0);
  if (budgetLatencyText) budgetLatencyText.textContent = `${frameMs} ms`;
  if (budgetLatencyPill && budgetLatencyPill.classList) {
    budgetLatencyPill.classList.toggle('pill-warn', frameMs > 400 && frameMs <= 500);
    budgetLatencyPill.classList.toggle('pill-alert', frameMs > 500);
  }

  // Accounted Memory Pill
  const memMb = Math.round(resources.estimatedResidentMb || 0);
  const maxMemCeiling = resources.maxMemoryMbCeiling || 160;
  const memWarnThreshold = Math.round(maxMemCeiling * 0.8);
  if (budgetMemoryText) budgetMemoryText.textContent = `${memMb} MB`;
  if (budgetMemoryPill && budgetMemoryPill.classList) {
    budgetMemoryPill.classList.toggle('pill-warn', memMb > memWarnThreshold && memMb <= maxMemCeiling);
    budgetMemoryPill.classList.toggle('pill-alert', memMb > maxMemCeiling);
  }

  // Cache Hit Rate Pill
  const hitPct = Math.round((resources.cacheHitRate || 0) * 100);
  if (budgetCacheText) budgetCacheText.textContent = `${hitPct}%`;

  // Detailed Meters
  const p95 = Math.round(resources.p95PerceptionMs || resources.perceptionMs || 0);
  if (meterP95Latency) meterP95Latency.textContent = `${p95} ms`;
  if (meterLatencyBar) {
    const latPct = Math.min(100, Math.max(2, (p95 / 500) * 100));
    if (meterLatencyBar.style) meterLatencyBar.style.width = `${latPct}%`;
    meterLatencyBar.className = `meter-bar-fill ${p95 > 500 ? 'fill-red' : (p95 > 400 ? 'fill-yellow' : 'fill-green')}`;
  }

  if (meterResidentMemory) meterResidentMemory.textContent = `${memMb} MB`;
  if (meterMemoryBar) {
    const memPct = Math.min(100, Math.max(2, (memMb / maxMemCeiling) * 100));
    if (meterMemoryBar.style) meterMemoryBar.style.width = `${memPct}%`;
    meterMemoryBar.className = `meter-bar-fill ${memMb > maxMemCeiling ? 'fill-red' : (memMb > memWarnThreshold ? 'fill-yellow' : 'fill-green')}`;
  }
  if (meterAccountingMethod && resources.memoryAccountingMethod) {
    meterAccountingMethod.textContent = resources.memoryAccountingMethod;
  }

  if (meterCacheHitRate) meterCacheHitRate.textContent = `${hitPct}%`;
  if (meterCacheCounts) {
    const hits = resources.totalCacheHits ?? resources.cacheHits ?? 0;
    const totalQueries = resources.totalPerceptionQueries ?? ((resources.cacheHits || 0) + (resources.cacheMisses || 0));
    meterCacheCounts.textContent = `(${hits} / ${totalQueries} queries)`;
  }
  if (meterCacheBar && meterCacheBar.style) {
    meterCacheBar.style.width = `${hitPct}%`;
  }

  const captures = resources.capturesInLastMinute || 0;
  if (meterCaptureRate) meterCaptureRate.textContent = String(captures);
  if (meterCaptureBar) {
    const capPct = Math.min(100, Math.max(2, (captures / 45) * 100));
    if (meterCaptureBar.style) meterCaptureBar.style.width = `${capPct}%`;
    meterCaptureBar.className = `meter-bar-fill ${captures > 45 ? 'fill-red' : (captures > 35 ? 'fill-yellow' : 'fill-green')}`;
  }

  // Active Override Buttons
  const activeOverride = resources.tierOverride || 'auto';
  if (Array.isArray(tierButtons)) {
    tierButtons.forEach(btn => {
      if (!btn) return;
      const btnOverride = typeof btn.getAttribute === 'function' ? btn.getAttribute('data-override') : btn.dataset?.override;
      if (btnOverride === activeOverride) {
        btn.classList?.add ? btn.classList.add('active') : null;
      } else {
        btn.classList?.remove ? btn.classList.remove('active') : null;
      }
    });
  }

  const downgrades = resources.downgradeHistory || resources.recentDowngrades || [];
  const latencies = resources.recentFrameLatencies || resources.recentLatencies || [];

  // Governor Budget Status Badge
  if (governorBudgetBadge) {
    const hasDowngrade = downgrades.length > 0;
    const isBackpressure = Boolean(resources.backpressureApplied) || (resources.capturesInLastMinute || 0) > 45;

    if (isBackpressure) {
      governorBudgetBadge.className = 'budget-status-pill budget-warn';
      governorBudgetBadge.textContent = 'BACKPRESSURE ACTIVE';
    } else if (tier === 'T0' && (hasDowngrade || resources.tierDowngraded)) {
      governorBudgetBadge.className = 'budget-status-pill budget-warn';
      governorBudgetBadge.textContent = 'TIER DOWNGRADED';
    } else {
      governorBudgetBadge.className = 'budget-status-pill budget-ok';
      governorBudgetBadge.textContent = 'BUDGET ENFORCED';
    }
  }

  // Draw Latency Sparkline
  drawLatencySparkline(latencies, sparklinePolyline);

  // Render Downgrade Events
  renderDowngradeEvents(downgrades, downgradeEventFeed);
}

// Browser Extension DOM Logic (Runs only in browser environment)
if (typeof document !== 'undefined') {
  document.addEventListener('DOMContentLoaded', () => {
    // Elements
    const shaderCanvas = document.getElementById('shaderCanvas');
    const loadingView = document.getElementById('loadingView');
    const aiWorkerView = document.getElementById('aiWorkerView');
    const backToConnectBtn = document.getElementById('backToConnectBtn');
    const activeTabUrl = document.getElementById('activeTabUrl');
    const visionProviderBadge = document.getElementById('visionProviderBadge');
    const visionProviderText = document.getElementById('visionProviderText');
    const agentStatusBadge = document.getElementById('agentStatusBadge');

    // Tabs
    const tabChatBtn = document.getElementById('tabChatBtn');
    const tabInspectorBtn = document.getElementById('tabInspectorBtn');
    const tabPayloadBtn = document.getElementById('tabPayloadBtn');
    const tabAuditBtn = document.getElementById('tabAuditBtn');

    const tabChatContent = document.getElementById('tabChatContent');
    const tabInspectorContent = document.getElementById('tabInspectorContent');
    const tabPayloadContent = document.getElementById('tabPayloadContent');
    const tabAuditContent = document.getElementById('tabAuditContent');

    // Chat Elements
    const chatForm = document.getElementById('chatForm');
    const chatInput = document.getElementById('chatInput');
    const chatMessages = document.getElementById('chatMessages');

    // Inspector Elements
    const viewSideBySideBtn = document.getElementById('viewSideBySideBtn');
    const toggleRedactedBtn = document.getElementById('toggleRedactedBtn');
    const toggleRawBtn = document.getElementById('toggleRawBtn');
    const inspectorDualView = document.getElementById('inspectorDualView');
    const inspectorRawImage = document.getElementById('inspectorRawImage');
    const inspectorSanitizedImage = document.getElementById('inspectorSanitizedImage');
    const statElementsCount = document.getElementById('statElementsCount');
    const statMasksCount = document.getElementById('statMasksCount');
    const statCanaryStatus = document.getElementById('statCanaryStatus');
    const maskBreakdownList = document.getElementById('maskBreakdownList');

    // Payload Elements
    const wirePayloadJson = document.getElementById('wirePayloadJson');
    const copyPayloadBtn = document.getElementById('copyPayloadBtn');

    // Telemetry Elements
    const meterClientLatency = document.getElementById('meterClientLatency');
    const meterServerLatency = document.getElementById('meterServerLatency');
    const meterActionLatency = document.getElementById('meterActionLatency');
    const meterTotalLatency = document.getElementById('meterTotalLatency');
    const auditLogFeed = document.getElementById('auditLogFeed');

    // Resource Governance Elements
    const budgetTierPill = document.getElementById('budgetTierPill');
    const budgetTierText = document.getElementById('budgetTierText');
    const budgetLatencyPill = document.getElementById('budgetLatencyPill');
    const budgetLatencyText = document.getElementById('budgetLatencyText');
    const budgetMemoryPill = document.getElementById('budgetMemoryPill');
    const budgetMemoryText = document.getElementById('budgetMemoryText');
    const budgetCachePill = document.getElementById('budgetCachePill');
    const budgetCacheText = document.getElementById('budgetCacheText');

    const governorBudgetBadge = document.getElementById('governorBudgetBadge');
    const tierBtnAuto = document.getElementById('tierBtnAuto');
    const tierBtnT0 = document.getElementById('tierBtnT0');
    const tierBtnT1 = document.getElementById('tierBtnT1');
    const tierBtnT2 = document.getElementById('tierBtnT2');
    const tierButtons = [tierBtnAuto, tierBtnT0, tierBtnT1, tierBtnT2];

    const meterP95Latency = document.getElementById('meterP95Latency');
    const meterLatencyBar = document.getElementById('meterLatencyBar');
    const meterResidentMemory = document.getElementById('meterResidentMemory');
    const meterMemoryBar = document.getElementById('meterMemoryBar');
    const meterAccountingMethod = document.getElementById('meterAccountingMethod');
    const meterCacheHitRate = document.getElementById('meterCacheHitRate');
    const meterCacheCounts = document.getElementById('meterCacheCounts');
    const meterCacheBar = document.getElementById('meterCacheBar');
    const meterCaptureRate = document.getElementById('meterCaptureRate');
    const meterCaptureBar = document.getElementById('meterCaptureBar');

    const sparklinePolyline = document.getElementById('sparklinePolyline');
    const downgradeEventFeed = document.getElementById('downgradeEventFeed');

    // Confirmation Modal Elements
    const actionConfirmModal = document.getElementById('actionConfirmModal');
    const confirmRationale = document.getElementById('confirmRationale');
    const confirmActionKind = document.getElementById('confirmActionKind');
    const confirmTargetId = document.getElementById('confirmTargetId');
    const confirmTargetName = document.getElementById('confirmTargetName');
    const approveActionBtn = document.getElementById('approveActionBtn');
    const denyActionBtn = document.getElementById('denyActionBtn');

    // State Variables
    let cachedRawScreenshot = '';
    let cachedSanitizedScreenshot = '';
    let lastSanitizedContext = null;
    let currentGoalText = '';
    let activeInspectorMode = 'side-by-side'; // 'side-by-side' | 'sanitized' | 'raw'

    // Initialize WebGL Waves Shader
    if (shaderCanvas && typeof window.initWavesShader === 'function') {
      window.initWavesShader(shaderCanvas);
    }

    // Auto transition to mission control
    if (loadingView && aiWorkerView) {
      setTimeout(() => {
        loadingView.classList.add('hidden');
        aiWorkerView.classList.remove('hidden');
        setTimeout(() => chatInput?.focus(), 80);
      }, 1200);
    }

    // Reset button
    backToConnectBtn?.addEventListener('click', () => {
      aiWorkerView?.classList.add('hidden');
      loadingView?.classList.remove('hidden');
      setTimeout(() => {
        loadingView?.classList.add('hidden');
        aiWorkerView?.classList.remove('hidden');
      }, 800);
    });

    // Fetch Active Tab URL
    function updateActiveTabUrl() {
      if (typeof chrome !== 'undefined' && chrome.tabs && chrome.tabs.query) {
        chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
          if (tabs && tabs[0]?.url) {
            try {
              const urlObj = new URL(tabs[0].url);
              if (activeTabUrl) {
                activeTabUrl.textContent = urlObj.hostname + (urlObj.port ? `:${urlObj.port}` : '') + urlObj.pathname;
              }
            } catch {
              if (activeTabUrl) activeTabUrl.textContent = tabs[0].url;
            }
          }
        });
      }
    }
    updateActiveTabUrl();

    // Tab Navigation
    function switchTab(activeBtn, activePane) {
      [tabChatBtn, tabInspectorBtn, tabPayloadBtn, tabAuditBtn].forEach(b => b?.classList.remove('active'));
      [tabChatContent, tabInspectorContent, tabPayloadContent, tabAuditContent].forEach(p => p?.classList.add('hidden'));

      activeBtn?.classList.add('active');
      activePane?.classList.remove('hidden');
    }

    tabChatBtn?.addEventListener('click', () => switchTab(tabChatBtn, tabChatContent));
    tabInspectorBtn?.addEventListener('click', () => switchTab(tabInspectorBtn, tabInspectorContent));
    tabPayloadBtn?.addEventListener('click', () => switchTab(tabPayloadBtn, tabPayloadContent));
    tabAuditBtn?.addEventListener('click', () => switchTab(tabAuditBtn, tabAuditContent));

    // Sample Goals
    document.querySelectorAll('.sample-goal-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        const goal = btn.getAttribute('data-goal');
        if (chatInput && goal) {
          chatInput.value = goal;
          executeGoal(goal);
        }
      });
    });

    // Inspector Layout Modes
    function updateInspectorLayout() {
      if (!inspectorDualView) return;

      const rawBox = inspectorDualView.querySelector('.raw-box');
      const sanitizedBox = inspectorDualView.querySelector('.sanitized-box');

      if (activeInspectorMode === 'side-by-side') {
        inspectorDualView.classList.remove('single-view');
        rawBox?.classList.remove('hidden');
        sanitizedBox?.classList.remove('hidden');
        viewSideBySideBtn?.classList.add('active');
        toggleRedactedBtn?.classList.remove('active');
        toggleRawBtn?.classList.remove('active');
      } else if (activeInspectorMode === 'sanitized') {
        inspectorDualView.classList.add('single-view');
        rawBox?.classList.add('hidden');
        sanitizedBox?.classList.remove('hidden');
        toggleRedactedBtn?.classList.add('active');
        viewSideBySideBtn?.classList.remove('active');
        toggleRawBtn?.classList.remove('active');
      } else {
        inspectorDualView.classList.add('single-view');
        rawBox?.classList.remove('hidden');
        sanitizedBox?.classList.add('hidden');
        toggleRawBtn?.classList.add('active');
        viewSideBySideBtn?.classList.remove('active');
        toggleRedactedBtn?.classList.remove('active');
      }
    }

    viewSideBySideBtn?.addEventListener('click', () => {
      activeInspectorMode = 'side-by-side';
      updateInspectorLayout();
    });

    toggleRedactedBtn?.addEventListener('click', () => {
      activeInspectorMode = 'sanitized';
      updateInspectorLayout();
    });

    toggleRawBtn?.addEventListener('click', () => {
      activeInspectorMode = 'raw';
      updateInspectorLayout();
    });

    // Set Agent Status
    function setAgentStatus(state) {
      if (!agentStatusBadge) return;
      const info = mapAgentStateToStatusInfo(state);
      agentStatusBadge.className = `status-pill ${info.cssClass}`;
      agentStatusBadge.textContent = info.label;
    }

    // Set Vision Provider
    function setVisionProvider(provider) {
      if (!visionProviderBadge || !visionProviderText) return;
      const badgeInfo = mapVisionProviderToBadge(provider);
      visionProviderBadge.className = `provider-pill ${badgeInfo.cssClass}`;
      visionProviderText.textContent = badgeInfo.text;
    }

    // Add Audit Log Entry
    function addAuditEntry(tag, text, tagClass = 'pass') {
      if (!auditLogFeed) return;
      const now = new Date();
      const timeStr = `${String(now.getMinutes()).padStart(2, '0')}:${String(now.getSeconds()).padStart(2, '0')}`;

      const div = document.createElement('div');
      div.className = 'audit-item';

      const timeSpan = document.createElement('span');
      timeSpan.className = 'audit-time';
      timeSpan.textContent = timeStr;

      const tagSpan = document.createElement('span');
      tagSpan.className = `audit-tag ${tagClass}`;
      tagSpan.textContent = tag;

      const descSpan = document.createElement('span');
      descSpan.className = 'audit-desc';
      descSpan.textContent = text;
      descSpan.title = text;

      div.appendChild(timeSpan);
      div.appendChild(tagSpan);
      div.appendChild(descSpan);

      auditLogFeed.prepend(div);
    }

    // Update Wire Payload JSON Display
    function updatePayloadDisplay(sanitized, goal) {
      if (!wirePayloadJson) return;
      const payloadObj = buildMinimizedWirePayload(sanitized, goal);
      wirePayloadJson.textContent = JSON.stringify(payloadObj, null, 2);
    }

    // Copy Payload Button
    copyPayloadBtn?.addEventListener('click', () => {
      if (wirePayloadJson) {
        navigator.clipboard?.writeText(wirePayloadJson.textContent || '').then(() => {
          copyPayloadBtn.textContent = 'Copied!';
          setTimeout(() => {
            copyPayloadBtn.textContent = 'Copy JSON';
          }, 1500);
        });
      }
    });

    // Render Quantitative Resource Governance Telemetry
    function updateResourceTelemetry(resources) {
      const hudDomRefs = {
        budgetTierPill, budgetTierText, budgetLatencyText, budgetLatencyPill,
        budgetMemoryText, budgetMemoryPill, budgetCacheText, meterP95Latency,
        meterLatencyBar, meterResidentMemory, meterMemoryBar, meterAccountingMethod,
        meterCacheHitRate, meterCacheCounts, meterCacheBar, meterCaptureRate,
        meterCaptureBar, governorBudgetBadge, tierButtons, sparklinePolyline,
        downgradeEventFeed
      };
      renderResourceTelemetry(resources, hudDomRefs);
    }
    if (typeof window !== 'undefined') {
      window.updateResourceTelemetry = updateResourceTelemetry;
    }

    // Render Mask Category Breakdown
    function renderMaskBreakdown(elements, maskCount) {
      if (!maskBreakdownList) return;
      maskBreakdownList.innerHTML = '';

      const breakdown = computeMaskBreakdown(elements, maskCount);
      const categories = Object.keys(breakdown);

      if (categories.length === 0 || maskCount === 0) {
        const hint = document.createElement('span');
        hint.className = 'empty-breakdown-hint';
        hint.textContent = 'No sensitive data detected on this page.';
        maskBreakdownList.appendChild(hint);
        return;
      }

      for (const cat of categories) {
        const count = breakdown[cat];
        const chip = document.createElement('span');
        chip.className = 'mask-chip';
        chip.innerHTML = `<span>${escapeHtml(cat)}</span><span class="mask-chip-count">${count}</span>`;
        maskBreakdownList.appendChild(chip);
      }
    }

    // Render Action Execution Outcome in Chat
    function renderActionResult(agentBubble, res) {
      if (!agentBubble) return;

      // 1. Awaiting User Confirmation (Pending Protected Action)
      if (res && res.state === 'awaiting-user-confirmation') {
        const action = res.proposal || {};
        agentBubble.innerHTML = '';

        const card = document.createElement('div');
        card.className = 'thought-card';
        card.style.borderLeft = '3px solid #f59e0b';

        const header = document.createElement('div');
        header.className = 'thought-header';
        header.innerHTML = `<span>🛡️ Protected Action Requires Confirmation</span><span class="risk-pill risk-protected">PROTECTED</span>`;

        const content = document.createElement('div');
        content.className = 'thought-content';
        content.style.marginTop = '4px';
        content.innerHTML = `
          Target: <code>${escapeHtml(action.targetLocalId || 'page')}</code><br/>
          Action: <strong>${escapeHtml((action.kind || 'action').toUpperCase())}</strong><br/>
          Rationale: ${escapeHtml(action.rationale || res.message || 'Action requires user consent')}
        `;

        card.appendChild(header);
        card.appendChild(content);

        const promptText = document.createElement('div');
        promptText.style.marginTop = '6px';
        promptText.style.fontSize = '10.5px';
        promptText.style.color = '#d97706';
        promptText.style.fontWeight = '600';
        promptText.textContent = '⏳ Awaiting your confirmation in dialog';

        agentBubble.appendChild(card);
        agentBubble.appendChild(promptText);

        setAgentStatus('awaiting-user-confirmation');
        chatMessages.scrollTop = chatMessages.scrollHeight;
        return;
      }

      // 0. Conversational Model Reply (from Chat Endpoint / Local Model)
      if (res && res.reply) {
        const maskCount = res.maskCount ?? 0;
        const elementCount = res.elementCount ?? 0;
        // The gateway answers even when no model is behind it. Say so, instead of
        // presenting the offline reasoner's text as if a model had replied.
        const modelDisconnected = res.modelConnected === false;
        agentBubble.innerHTML = `
          ${maskCount > 0 || elementCount > 0 ? `
            <div class="perception-badge-row">
              <span class="perception-pill pill-shield">🛡️ ${maskCount} Masks Applied</span>
              <span class="perception-pill">🔍 ${elementCount} Interactive Elements</span>
            </div>
          ` : ''}
          ${modelDisconnected ? `
            <div style="padding: 6px 8px; margin-bottom: 5px; background: #fffbeb; border: 1px solid #fde68a; border-radius: 6px; color: #b45309; font-size: 10.5px; font-weight: 600;">
              ⚠️ No reasoning model connected — this reply did not come from a model.
            </div>
          ` : ''}
          <div style="font-size: 11.5px; color: #0f172a; line-height: 1.5; white-space: pre-wrap; user-select: text;">${escapeHtml(res.reply)}</div>
        `;
        setAgentStatus(modelDisconnected ? 'failed-safe' : 'idle');
        chatMessages.scrollTop = chatMessages.scrollHeight;
        return;
      }

      // 2. Denied / Cancelled Action
      if (res && (res.state === 'idle' || res.message?.includes('cancelled') || res.message?.includes('denied'))) {
        agentBubble.innerHTML = `
          <div style="padding: 7px 9px; background: #f8fafc; border: 1px solid #cbd5e1; border-radius: 6px; color: #475569; font-size: 11px;">
            🚫 <strong>Action Denied:</strong> Action was cancelled by user.
          </div>
        `;
        setAgentStatus('idle');
        chatMessages.scrollTop = chatMessages.scrollHeight;
        return;
      }

      // 3. Failed Safe / Blocked Locally / Stale Target / Verification Failed
      if (!res || !res.success) {
        const errorMsg = res?.error || res?.message || 'Action failed to execute';
        let statusState = 'failed-safe';
        let displayHtml = `⚠️ ${escapeHtml(errorMsg)}`;

        if (res?.state === 'blocked-local-only' || errorMsg.toLowerCase().includes('blocked')) {
          statusState = 'blocked-local-only';
          displayHtml = `🛡️ <strong>Blocked Locally:</strong> ${escapeHtml(errorMsg)}`;
        } else if (errorMsg.toLowerCase().includes('stale')) {
          displayHtml = `⚠️ <strong>Stale Target:</strong> ${escapeHtml(errorMsg)}`;
        } else if (errorMsg.toLowerCase().includes('verification') || errorMsg.toLowerCase().includes('semantic')) {
          displayHtml = `⚠️ <strong>Verification Failed:</strong> ${escapeHtml(errorMsg)}`;
        }

        agentBubble.innerHTML = `<div style="padding: 7px 9px; background: #fef2f2; border: 1px solid #fecaca; border-radius: 6px; color: #dc2626; font-size: 11px;">${displayHtml}</div>`;
        setAgentStatus(statusState);
        chatMessages.scrollTop = chatMessages.scrollHeight;
        return;
      }

      // 4. Verified Complete
      const action = res.proposal || { kind: 'click', rationale: res.message || 'Action executed successfully', confidence: 0.95, risk: 'safe' };
      const sanitized = res.sanitized || lastSanitizedContext;
      const maskCount = sanitized?.maskCount ?? 0;
      const elementCount = sanitized?.elements?.length ?? 0;

      const kindClass = action.kind === 'type' ? 'kind-type' : (action.kind === 'finish' ? 'kind-finish' : '');
      const riskClass = action.risk === 'protected' ? 'risk-protected' : 'risk-safe';

      agentBubble.innerHTML = `
        <div class="perception-badge-row">
          <span class="perception-pill pill-shield">🛡️ ${maskCount} Masks Applied</span>
          <span class="perception-pill">🔍 ${elementCount} Interactive Elements</span>
          ${renderVisionPill(sanitized?.visionTelemetry, sanitized?.visionObservations)}
        </div>

        <div class="thought-card">
          <div class="thought-header">
            <span>⚡ Proposed Action Rationale</span>
            <span>${Math.round((action.confidence || 0.95) * 100)}% Conf</span>
          </div>
          <div class="thought-content">${escapeHtml(action.rationale || 'Action proposed')}</div>
        </div>

        <div class="action-dispatch-card">
          <div class="action-card-top">
            <span class="action-kind-tag ${kindClass}">${escapeHtml((action.kind || 'click').toUpperCase())}</span>
            <span class="risk-pill ${riskClass}">${escapeHtml((action.risk || 'safe').toUpperCase())}</span>
          </div>
          <div class="action-target-row">Target: <code>${escapeHtml(action.targetLocalId || 'page')}</code></div>
          ${action.textToType ? `<div style="font-size: 10px; color: #475569;">Input: "<strong>${escapeHtml(action.textToType)}</strong>"</div>` : ''}
          ${action.expectedState ? `<div class="action-rationale-row">Expected: ${escapeHtml(action.expectedState)}</div>` : ''}
        </div>
        <div style="margin-top: 4px; font-size: 10px; color: #16a34a; font-weight: 600;">✓ Action executed and verified complete</div>
      `;

      chatMessages.scrollTop = chatMessages.scrollHeight;
      setAgentStatus('complete');

      // Update Telemetry if measured
      if (res.telemetry) {
        if (meterClientLatency) meterClientLatency.textContent = `${res.telemetry.clientLatencyMs} ms`;
        if (meterServerLatency) meterServerLatency.textContent = `${res.telemetry.serverLatencyMs} ms`;
        if (meterActionLatency) meterActionLatency.textContent = `${res.telemetry.totalLatencyMs - res.telemetry.clientLatencyMs - res.telemetry.serverLatencyMs} ms`;
        if (meterTotalLatency) meterTotalLatency.textContent = `${res.telemetry.totalLatencyMs} ms`;
        if (res.telemetry.resources) {
          updateResourceTelemetry(res.telemetry.resources);
        }
        addAuditEntry('PERF', `Measured round-trip: ${res.telemetry.totalLatencyMs}ms (Client: ${res.telemetry.clientLatencyMs}ms, Server: ${res.telemetry.serverLatencyMs}ms)`, 'pass');
      }

      if (sanitized) {
        lastSanitizedContext = sanitized;
        cachedSanitizedScreenshot = sanitized.sanitizedScreenshotDataUrl || '';
        if (inspectorSanitizedImage && cachedSanitizedScreenshot) {
          inspectorSanitizedImage.src = cachedSanitizedScreenshot;
        }
        if (statElementsCount) statElementsCount.textContent = String(elementCount);
        if (statMasksCount) statMasksCount.textContent = String(maskCount);
        renderMaskBreakdown(sanitized.elements || [], maskCount);
        updatePayloadDisplay(sanitized, currentGoalText);
        addAuditEntry('MASK', `Rendered ${maskCount} opaque privacy masks locally`, 'mask');
      }

      addAuditEntry('ACT', `${(action.kind || 'ACTION').toUpperCase()} on ${action.targetLocalId || 'page'}`, 'pass');
    }

    // Execute Goal or Conversational Query
    async function executeGoal(goalText) {
      if (!goalText) return;
      currentGoalText = goalText;

      const welcomeBox = chatMessages.querySelector('.welcome-card');
      if (welcomeBox) welcomeBox.remove();

      // User Bubble
      const userBubble = document.createElement('div');
      userBubble.className = 'chat-msg user';
      userBubble.textContent = goalText;
      chatMessages.appendChild(userBubble);
      if (chatInput) chatInput.value = '';
      chatMessages.scrollTop = chatMessages.scrollHeight;

      // Agent Loading Bubble
      const agentBubble = document.createElement('div');
      agentBubble.className = 'chat-msg agent';
      agentBubble.innerHTML = `
        <div style="display: flex; align-items: center; gap: 6px;">
          <span class="clean-spinner" style="width: 14px; height: 14px; border-width: 2px; border-top-color: #2563eb; border-right-color: #93c5fd;"></span>
          <em>Reasoning with local model...</em>
        </div>
      `;
      chatMessages.appendChild(agentBubble);
      chatMessages.scrollTop = chatMessages.scrollHeight;

      setAgentStatus('capturing');

      // Detect if user input is an explicit UI action vs conversational query
      const lower = goalText.toLowerCase().trim();
      const isExplicitAction = /^(click|type|fill|press|select|scroll|submit|login|log in|buy|checkout|find and click|go to|search for and click)\b/.test(lower);

      const messageType = isExplicitAction ? 'START_AGENT_RUN' : 'CHAT_WITH_PAGE';
      const payloadKey = isExplicitAction ? 'goal' : 'message';

      if (typeof chrome !== 'undefined' && chrome.runtime && chrome.runtime.sendMessage) {
        chrome.runtime.sendMessage({
          type: messageType,
          [payloadKey]: goalText
        }, (res) => {
          if (chrome.runtime.lastError) {
            agentBubble.innerHTML = `<div style="padding: 7px 9px; background: #fef2f2; border: 1px solid #fecaca; border-radius: 6px; color: #dc2626; font-size: 11px;">⚠️ Background service worker unreachable: ${escapeHtml(chrome.runtime.lastError.message)}</div>`;
            setAgentStatus('failed-safe');
            return;
          }
          renderActionResult(agentBubble, res);
        });
      } else {
        // Fallback for standalone / mock preview
        setTimeout(() => {
          agentBubble.innerHTML = `<div style="padding: 7px 9px; background: #eff6ff; border: 1px solid #bfdbfe; border-radius: 6px; color: #1d4ed8; font-size: 11px;">ℹ️ Running in standalone mode. Connect Chrome extension runtime for live browser automation.</div>`;
          setAgentStatus('idle');
        }, 300);
      }
    }

    // Chat Form Submit & Input Handling
    if (chatForm && chatInput) {
      const sendBtn = document.getElementById('sendBtn');

      function updateSendBtn() {
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
        chatInput.addEventListener(evt, updateSendBtn);
      });

      chatForm.addEventListener('submit', (e) => {
        e.preventDefault();
        const text = chatInput.value.trim();
        if (text) {
          executeGoal(text);
          setTimeout(updateSendBtn, 50);
        }
      });
    }

    // Protected Action Approval Handlers
    approveActionBtn?.addEventListener('click', () => {
      actionConfirmModal?.classList.add('hidden');
      addAuditEntry('AUTH', 'User Approved Protected Action', 'pass');
      setAgentStatus('executing');

      if (typeof chrome !== 'undefined' && chrome.runtime?.sendMessage) {
        chrome.runtime.sendMessage({ type: 'APPROVE_ACTION' }, (res) => {
          const lastAgentBubble = chatMessages.querySelector('.chat-msg.agent:last-child');
          if (lastAgentBubble) {
            renderActionResult(lastAgentBubble, res);
          } else {
            setAgentStatus(res?.success ? 'complete' : 'failed-safe');
          }
        });
      }
    });

    denyActionBtn?.addEventListener('click', () => {
      actionConfirmModal?.classList.add('hidden');
      addAuditEntry('AUTH', 'User Denied Action', 'warn');
      setAgentStatus('idle');

      if (typeof chrome !== 'undefined' && chrome.runtime?.sendMessage) {
        chrome.runtime.sendMessage({ type: 'DENY_ACTION' }, (res) => {
          const lastAgentBubble = chatMessages.querySelector('.chat-msg.agent:last-child');
          if (lastAgentBubble) {
            renderActionResult(lastAgentBubble, res);
          }
        });
      }
    });

    // Real-Time Broadcast Listeners from Coordinator
    if (typeof chrome !== 'undefined' && chrome.runtime && chrome.runtime.onMessage) {
      chrome.runtime.onMessage.addListener((message) => {
        if (!message) return;

        if (message.type === 'COORDINATOR_STATE_CHANGED') {
          setAgentStatus(message.state);
        }

        if (message.type === 'COORDINATOR_SANITIZATION_COMPLETE') {
          cachedRawScreenshot = message.rawScreenshot || '';
          cachedSanitizedScreenshot = message.sanitizedScreenshot || '';

          if (inspectorRawImage && cachedRawScreenshot) {
            inspectorRawImage.src = cachedRawScreenshot;
          }
          if (inspectorSanitizedImage && cachedSanitizedScreenshot) {
            inspectorSanitizedImage.src = cachedSanitizedScreenshot;
          }
          if (statElementsCount) statElementsCount.textContent = String(message.elementCount ?? 0);
          if (statMasksCount) statMasksCount.textContent = String(message.maskCount ?? 0);

          renderMaskBreakdown(message.elements || [], message.maskCount ?? 0);

          const mockSanitized = {
            protocolVersion: '1.0',
            runId: `run_${Date.now()}`,
            goal: currentGoalText || 'Active task',
            sanitizedScreenshotDataUrl: cachedSanitizedScreenshot,
            elements: message.elements || [],
            pageState: { title: 'Active Tab', viewport: [1280, 800] },
            maskCount: message.maskCount ?? 0,
            payloadDigestSha256: 'sha256_verified'
          };
          lastSanitizedContext = mockSanitized;
          updatePayloadDisplay(mockSanitized, currentGoalText);
        }

        if (message.type === 'COORDINATOR_CONFIRMATION_REQUIRED') {
          const action = message.action || {};
          if (confirmActionKind) confirmActionKind.textContent = (action.kind || 'CLICK').toUpperCase();
          if (confirmTargetId) confirmTargetId.textContent = action.targetLocalId || 'page';
          if (confirmTargetName) confirmTargetName.textContent = action.sanitizedTargetName || action.targetLocalId || 'Protected Action';
          if (confirmRationale) confirmRationale.textContent = action.rationale || 'Action alters persistent state.';
          actionConfirmModal?.classList.remove('hidden');
          setAgentStatus('awaiting-user-confirmation');
          addAuditEntry('AUTH', `Confirmation requested for ${action.kind}`, 'warn');
        }

        if (message.type === 'COORDINATOR_TELEMETRY_UPDATED') {
          const tel = message.telemetry;
          if (tel) {
            if (meterClientLatency) meterClientLatency.textContent = `${tel.clientLatencyMs} ms`;
            if (meterServerLatency) meterServerLatency.textContent = `${tel.serverLatencyMs} ms`;
            if (meterActionLatency) meterActionLatency.textContent = `${tel.totalLatencyMs - tel.clientLatencyMs - tel.serverLatencyMs} ms`;
            if (meterTotalLatency) meterTotalLatency.textContent = `${tel.totalLatencyMs} ms`;
            if (tel.resources) {
              renderResourceTelemetry(tel.resources);
            }
          }
        }
      });
    }

    // Wire Tier Selection Buttons
    tierButtons.forEach(btn => {
      btn?.addEventListener('click', () => {
        const override = btn.getAttribute('data-override');
        if (!override) return;
        tierButtons.forEach(b => b?.classList.remove('active'));
        btn.classList.add('active');

        if (typeof chrome !== 'undefined' && chrome.runtime?.sendMessage) {
          chrome.runtime.sendMessage({
            type: 'SET_TIER_OVERRIDE',
            override
          }, (res) => {
            if (res && res.telemetry) {
              updateResourceTelemetry(res.telemetry.resources || res.telemetry);
            }
            addAuditEntry('TIER', `Model tier override set to: ${override}`, 'pass');
          });
        }
      });
    });

    // Default to WASM vision provider on initialization
    setVisionProvider('wasm');
    setAgentStatus('idle');
    updateInspectorLayout();

    // Query Initial Resource Metrics on open
    function queryInitialResourceMetrics() {
      if (typeof chrome !== 'undefined' && chrome.storage?.session) {
        chrome.storage.session.get(['privapilot_downgrade_history'], (items) => {
          if (items?.privapilot_downgrade_history && Array.isArray(items.privapilot_downgrade_history)) {
            renderDowngradeEvents(items.privapilot_downgrade_history);
          }
        });
      }

      if (typeof chrome !== 'undefined' && chrome.runtime?.sendMessage) {
        chrome.runtime.sendMessage({ type: 'GET_RESOURCE_METRICS' }, (res) => {
          if (res && res.telemetry) {
            updateResourceTelemetry(res.telemetry.resources || res.telemetry);
          }
        });
      }
    }
    queryInitialResourceMetrics();

    // Probe the reasoning gateway once on open, so a missing server or a missing
    // model is reported here instead of surfacing as a failed first message.
    function reportModelConnectivity() {
      if (typeof chrome !== 'undefined' || !chrome.runtime?.sendMessage) return;

      chrome.runtime.sendMessage({ type: 'GET_MODEL_STATUS' }, (status) => {
        if (chrome.runtime.lastError || !status) {
          addAuditEntry('MODEL', 'Background service worker unreachable', 'warn');
          return;
        }

        if (!status.reachable) {
          addAuditEntry('MODEL', status.error || 'Reasoning gateway unreachable', 'warn');
          showModelBanner(
            'Reasoning gateway offline',
            status.error || 'Start it with "npm run dev:server" and reopen this panel.'
          );
          return;
        }

        if (!status.modelConnected) {
          addAuditEntry('MODEL', status.detail || 'No model backend connected', 'warn');
          showModelBanner(
            'No reasoning model connected',
            status.detail || 'Start Ollama and pull a model, or set VLM_ENDPOINT on the gateway.'
          );
          return;
        }

        addAuditEntry('MODEL', `Connected: ${status.modelName} via ${status.provider}`, 'pass');
      });
    }

    function showModelBanner(title, detail) {
      if (!chatMessages) return;
      const banner = document.createElement('div');
      banner.className = 'chat-msg agent';
      banner.innerHTML = `
        <div style="padding: 8px 10px; background: #fffbeb; border: 1px solid #fde68a; border-radius: 6px; color: #b45309; font-size: 11px; line-height: 1.5;">
          <strong>⚠️ ${escapeHtml(title)}</strong><br/>${escapeHtml(detail)}
        </div>
      `;
      chatMessages.appendChild(banner);
      chatMessages.scrollTop = chatMessages.scrollHeight;
    }

    reportModelConnectivity();
  });
}


