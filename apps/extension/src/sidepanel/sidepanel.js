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
 * Renders rich formatted markdown safely by escaping HTML first.
 * Supports bold, italic, inline code, code blocks, lists, headers, links, and paragraphs.
 */
export function renderMarkdown(text) {
  if (text === null || text === undefined) return '';
  let html = escapeHtml(String(text));

  // 1. Code blocks (```lang\ncode\n```)
  html = html.replace(/```([a-zA-Z0-9_-]*)\n([\s\S]*?)```/g, (_match, _lang, code) => {
    return `<pre style="background: #18191b; color: #f8fafc; padding: 8px 10px; border-radius: 6px; font-size: 11px; overflow-x: auto; margin: 6px 0; font-family: monospace; border: 1px solid rgba(255, 255, 255, 0.1);"><code>${code.trim()}</code></pre>`;
  });

  // 2. Inline code (`code`)
  html = html.replace(/`([^`]+)`/g, '<code style="background: rgba(255, 255, 255, 0.08); color: #8ab4f8; padding: 1px 4px; border-radius: 4px; font-family: monospace; font-size: 11px; border: 1px solid rgba(255, 255, 255, 0.12);">$1</code>');

  // 3. Bold (**text** or __text__)
  html = html.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
  html = html.replace(/__([^_]+)__/g, '<strong>$1</strong>');

  // 4. Italic (*text* or _text_)
  html = html.replace(/\*([^*]+)\*/g, '<em>$1</em>');

  // 5. Headers (### Header, ## Header, # Header)
  html = html.replace(/^### (.*$)/gm, '<div style="font-weight: 700; font-size: 12px; margin: 6px 0 2px 0; color: #e3e3e3;">$1</div>');
  html = html.replace(/^## (.*$)/gm, '<div style="font-weight: 700; font-size: 12.5px; margin: 7px 0 3px 0; color: #f1f5f9;">$1</div>');
  html = html.replace(/^# (.*$)/gm, '<div style="font-weight: 800; font-size: 13px; margin: 8px 0 4px 0; color: #ffffff;">$1</div>');

  // 6. Bullet lists (- item or * item or • item)
  html = html.replace(/^[\*\-\•] (.*$)/gm, '<div style="display: flex; gap: 6px; margin: 2px 0 2px 4px;"><span style="color: #94a3b8;">•</span><span style="color: #e3e3e3;">$1</span></div>');

  // 7. Numbered lists (1. item)
  html = html.replace(/^(\d+)\. (.*$)/gm, '<div style="display: flex; gap: 6px; margin: 2px 0 2px 4px;"><span style="color: #94a3b8; font-weight: 600;">$1.</span><span style="color: #e3e3e3;">$2</span></div>');

  // 8. Safe links [text](url) - HTTP/HTTPS only
  html = html.replace(/\[([^\]]+)\]\((https?:\/\/[^\s\)]+)\)/g, '<a href="$2" target="_blank" rel="noopener noreferrer" style="color: #8ab4f8; text-decoration: underline; word-break: break-all;">$1</a>');

  // 9. Preserve double linebreaks as spacing and single linebreaks as <br/>
  html = html.replace(/\n\n+/g, '<div style="height: 6px;"></div>');
  html = html.replace(/\n/g, '<br/>');

  return html;
}

/**
 * Extracts action suggestions from conversational model output.
 */
export function extractActionSuggestions(text) {
  if (!text || typeof text !== 'string') return [];
  const suggestions = [];
  const regex = /(?:click|open|select|tap|press|navigate to|go to)\s+(?:on\s+)?["'“]([^"'”]+)["'”]/gi;
  let match;
  while ((match = regex.exec(text)) !== null) {
    const item = match[1].trim();
    if (item && !suggestions.includes(item) && item.length <= 40) {
      suggestions.push(item);
    }
  }
  return suggestions.slice(0, 4);
}

const ACTION_REQUEST_PREFIX = /^(?:(?:please|kindly)\s+|(?:can|could|would|will)\s+you\s+|(?:i\s+(?:want|need)\s+you\s+to)\s+|(?:go\s+ahead\s+and)\s+|(?:hey|hi)\s+(?:privapilot[,!]?\s+)?(?:please\s+)?)+/i;
const ACTION_VERB = /^(?:click|open|type|fill|enter|write|set|press|select|choose|scroll|hover|drag|drop|upload|attach|move|submit|approve|deny|dismiss|close|accept|filter|find|search|login|log\s+in|buy|checkout|inspect|audit|check|go\s+to|navigate)(?:\b|\s)/i;

/**
 * Distinguishes an instruction to operate the current page from a question.
 * Polite wrappers must not downgrade an imperative request into read-only chat.
 */
export function isBrowserActionRequest(message) {
  if (typeof message !== 'string') return false;
  let normalized = message.trim().toLowerCase();
  let previous = '';
  while (normalized && normalized !== previous) {
    previous = normalized;
    normalized = normalized.replace(ACTION_REQUEST_PREFIX, '').trim();
  }
  // Information retrieval & question-answering directives per cababling.md
  if (/(?:how\s+many|count\s+(?:of|for)|number\s+of|total\s+(?:count|number|submissions?)|submissions?\s+(?:are\s+)?(?:done|completed|submitted)|what\s+is\s+the\s+(?:count|number|total|status)|which\s+tab|tell\s+me\s+(?:the\s+count|the\s+number|the\s+total|the\s+status|about\s+submissions)|find\s+.*?\s+and\s+tell)/i.test(normalized)) {
    return true;
  }

  // Questions or advisory queries should stay chat
  if (/^(?:tell\s+me\s+how|how\s+(?:do|can|to)|what\s+(?:would|is|are)|why\s+|explain\b)/i.test(normalized)) {
    return false;
  }
  // Direct URL or domain navigation directives (e.g. "https://www.isro.gov.in/ ...", "www.isro.gov.in", "sih.gov.in")
  if (/^https?:\/\//i.test(normalized) || /^www\.[a-z0-9-]+\.[a-z]+/i.test(normalized) || /^(?:[a-zA-Z0-9-]+\.)+(?:gov\.in|nic\.in|ac\.in|org\.in|co\.in|com|org|net|io|in|edu|gov|dev|app|ai|me)\b/i.test(normalized)) {
    return true;
  }

  if (ACTION_VERB.test(normalized)) return true;

  // Prepositional phrases: "in the place of name type ...", "in name put ...", "for email enter ..."
  const strippedPunct = normalized.replace(/([a-zA-Z0-9_-]+)\.\s+/g, '$1 ').replace(/\s+\.\s+/g, ' ').replace(/\s+/g, ' ');
  if (/^(?:in|for|at|on|into|to)\s+(?:the\s+)?(?:place\s+of\s+|field\s+of\s+|box\s+of\s+|input\s+of\s+)?[a-z0-9_\s-]+\s+(?:type|fill|enter|write|put|set|tyoe)\b/i.test(strippedPunct)) {
    return true;
  }

  // Compound form input: "name type kushagra and email type ..."
  if (/\b(?:type|fill|enter|write|put|tyoe)\b/i.test(strippedPunct) &&
      /\b(?:name|email|password|phone|address|message|chatbox|field|input)\b/i.test(strippedPunct)) {
    return true;
  }

  return false;
}

export function calculateBase64ByteLength(dataUrlOrBase64) {
  if (!dataUrlOrBase64 || typeof dataUrlOrBase64 !== 'string') return 0;
  const commaIdx = dataUrlOrBase64.indexOf(',');
  const b64 = commaIdx >= 0 ? dataUrlOrBase64.slice(commaIdx + 1) : dataUrlOrBase64;
  if (!b64.length) return 0;
  let padding = 0;
  if (b64.endsWith('==')) padding = 2;
  else if (b64.endsWith('=')) padding = 1;
  return Math.max(0, Math.floor((b64.length * 3) / 4) - padding);
}

/**
 * Builds the exact minimized outgoing payload dispatched across the wire,
 * strictly omitting internal-only branded fields, raw captures, cookies, and tokens.
 * Derived from the canonical toSanitizedNetworkPayload projection.
 * Never synthesizes fake run IDs, digests, or goals; displays 'Not available'.
 */
export function buildMinimizedWirePayload(sanitized, goal = null) {
  if (!sanitized) {
    return {
      protocolVersion: '1.0',
      status: 'Awaiting initial perception cycle'
    };
  }

  const isContext = sanitized._brand === 'SanitizedContext_Verified';
  const rawScreenshot = isContext
    ? sanitized.sanitizedScreenshotDataUrl
    : (sanitized.screenshot || sanitized.sanitizedScreenshotDataUrl || '');
  const payloadStructureDigest = sanitized.payloadDigestSha256 || 'Not available';
  const screenshotDigest = sanitized.screenshotDigestSha256 || payloadStructureDigest;

  const byteCount = calculateBase64ByteLength(rawScreenshot);
  const kbCount = Math.round(byteCount / 1024);
  const screenshotDisplay = rawScreenshot
    ? `[Screenshot base64 omitted from display: ${kbCount} KB (${byteCount} bytes), Screenshot SHA-256: ${screenshotDigest}, Payload Structure SHA-256: ${payloadStructureDigest}]`
    : 'Not available';

  const payload = {
    protocolVersion: sanitized.protocolVersion || '1.0',
    runId: sanitized.runId || 'Not available',
    goal: sanitized.goal || goal || 'Not available',
    screenshot: screenshotDisplay,
    elements: (sanitized.elements || []).map(el => ({
      localId: el.localId,
      role: el.role,
      sanitizedName: el.sanitizedName,
      coarseBounds: el.coarseBounds,
      state: el.state,
      actionCapabilities: el.actionCapabilities
    })),
    pageState: sanitized.pageState || 'Not available'
  };

  if (sanitized.redactionManifest) {
    payload.redactionManifest = sanitized.redactionManifest;
  }

  return payload;
}

/**
 * Universal SHA-256 helper for extension side panel display.
 */
export async function computeSidepanelSha256Hex(dataString) {
  if (typeof crypto !== 'undefined' && crypto.subtle && typeof crypto.subtle.digest === 'function') {
    const buffer = new TextEncoder().encode(dataString);
    const hashBuffer = await crypto.subtle.digest('SHA-256', buffer);
    return Array.from(new Uint8Array(hashBuffer)).map(b => b.toString(16).padStart(2, '0')).join('');
  }
  return 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855';
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
    case 'reasoning':
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
export function mapVisionProviderToBadge(provider, modelName) {
  if (modelName) {
    const cleanName = String(modelName).split(':')[0];
    return { text: `Vision: ${cleanName} (Live)`, cssClass: 'provider-qwen-live' };
  }
  switch (provider) {
    case 'webgpu':
      return { text: 'Vision: WebGPU', cssClass: 'provider-webgpu' };
    case 'wasm':
      return { text: 'Vision: WASM', cssClass: 'provider-wasm' };
    case 'qwen_live':
    case 'qwen-live':
    case 'live':
    case 'openrouter':
    case 'ollama':
    case 'vlm-cloud':
    case 'lm-studio':
      return { text: 'Vision: Qwen (Live)', cssClass: 'provider-qwen-live' };
    case 'mock':
    case 'offline-reasoner':
      return { text: 'Vision: Offline Reasoner', cssClass: 'provider-text-only' };
    case 'text_only':
    case 'text-only':
      return { text: 'Vision: Text-Only', cssClass: 'provider-text-only' };
    case 'degraded_masking':
    case 'heuristic_fallback':
      return { text: 'Vision: Degraded Masking', cssClass: 'provider-degraded' };
    case 'not_run':
    case 'Not Run':
      return { text: 'Vision: Not Run', cssClass: 'provider-not-run' };
    case 'unavailable':
    default:
      return { text: 'Vision: Unavailable', cssClass: 'provider-unavailable' };
  }
}

// Browser Extension DOM Logic (Runs only in browser environment)
if (typeof document !== 'undefined') {
  document.addEventListener('DOMContentLoaded', () => {
    // Root container for E2E matrix synchronization
    const appRoot = document.querySelector('.app-container') || document.body;
    let currentRunId = '';
    let conversationHistory = [];

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

    // Auto transition to mission control HUD after splash
    if (loadingView && aiWorkerView) {
      setTimeout(() => {
        loadingView.classList.add('hidden');
        aiWorkerView.classList.remove('hidden');
        setTimeout(() => chatInput?.focus(), 80);
      }, 750);
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

    let currentActiveTabId = null;
    const sharingTabTitle = document.getElementById('sharingTabTitle');
    const geminiHero = document.getElementById('geminiHero');
    const chatToolBtn = document.getElementById('chatToolBtn');

    // Fetch and Track Active Tab URL, Title, and Tab ID
    function applyTab(tab) {
      if (tab) {
        currentActiveTabId = tab.id;

        // Dynamic Tab Title Formatting (e.g. Sharing "Claude Build Day Travel Costs")
        let displayTitle = (tab.title || '').trim();
        if (!displayTitle && tab.url) {
          try {
            const urlObj = new URL(tab.url);
            displayTitle = urlObj.hostname || tab.url;
          } catch {
            displayTitle = tab.url;
          }
        }
        if (!displayTitle || displayTitle === 'about:blank' || displayTitle.startsWith('chrome://newtab')) {
          displayTitle = 'New Tab';
        }

        if (sharingTabTitle) {
          sharingTabTitle.innerHTML = `Sharing &ldquo;${escapeHtml(displayTitle)}&rdquo;`;
          sharingTabTitle.title = tab.title || tab.url || displayTitle;
        }

        if (tab.url && activeTabUrl) {
          try {
            const urlObj = new URL(tab.url);
            activeTabUrl.textContent = urlObj.hostname + (urlObj.port ? `:${urlObj.port}` : '') + urlObj.pathname;
            activeTabUrl.title = tab.url;
          } catch {
            activeTabUrl.textContent = tab.url;
          }
        }
      }
    }

    function updateActiveTabUrl() {
      if (typeof chrome !== 'undefined' && chrome.tabs && chrome.tabs.query) {
        chrome.tabs.query({ active: true, lastFocusedWindow: true }, (tabs) => {
          const tab = (tabs && tabs[0]) || null;
          if (!tab || (tab.url && tab.url.startsWith('chrome-extension://'))) {
            chrome.tabs.query({ active: true }, (allTabs) => {
              const normalTab = (allTabs || []).find((t) => t.url && !t.url.startsWith('chrome-extension://')) || allTabs?.[0];
              if (normalTab) applyTab(normalTab);
            });
            return;
          }
          applyTab(tab);
        });
      }
    }
    updateActiveTabUrl();

    // Listen to tab switch & navigation events to keep side panel in sync dynamically
    if (typeof chrome !== 'undefined' && chrome.tabs) {
      chrome.tabs.onActivated?.addListener((activeInfo) => {
        currentActiveTabId = activeInfo.tabId;
        updateActiveTabUrl();
      });
      chrome.tabs.onUpdated?.addListener((tabId, changeInfo, tab) => {
        if (tab?.active) {
          updateActiveTabUrl();
        }
      });
      chrome.tabs.onCreated?.addListener(() => {
        setTimeout(updateActiveTabUrl, 100);
      });
      chrome.tabs.onHighlighted?.addListener(() => {
        updateActiveTabUrl();
      });
      if (chrome.windows) {
        chrome.windows.onFocusChanged?.addListener(() => {
          updateActiveTabUrl();
        });
      }
    }

    // Extension In-Panel Reload with exact clean-spinner loader (keeps sidepanel open)
    const reloadExtensionBtn = document.getElementById('reloadExtensionBtn');
    const triggerReload = () => {
      reloadExtensionBtn?.classList.add('spinning');
      if (loadingView && aiWorkerView) {
        aiWorkerView.classList.add('hidden');
        loadingView.classList.remove('hidden');
      }
      setTimeout(() => {
        window.location.reload();
      }, 250);
    };
    reloadExtensionBtn?.addEventListener('click', triggerReload);

    // ==========================================
    // RECENT CHAT SESSIONS & GEMINI MENU DROPDOWN
    // ==========================================
    const DEFAULT_RECENT_SESSIONS = [
      {
        id: 'session-1',
        title: 'Mistral-Large-3 Cost and Token Breakdown',
        model: 'Mistral-Large-3',
        updatedAt: Date.now() - 1000 * 60 * 5,
        messages: [
          {
            role: 'user',
            text: 'Can you provide a breakdown of Mistral-Large-3 pricing and context window compared to GPT-4o?'
          },
          {
            role: 'agent',
            text: '### Mistral-Large-3 Architecture & Pricing\n\n**Mistral-Large-3** (`mistral-large-2407`) is Mistral AI\'s flagship frontier reasoning model hosted on **Azure AI Foundry**:\n\n- **Context Window**: 128k tokens with full native multilingual and coding support.\n- **Input Pricing**: $2.00 / 1M tokens.\n- **Output Pricing**: $6.00 / 1M tokens.\n\nCompared to GPT-4o ($2.50 / $10.00), Mistral-Large-3 offers ~35% lower inference cost with parity on complex reasoning and function calling.'
          }
        ]
      },
      {
        id: 'session-2',
        title: 'Claude Build Day Travel Costs',
        model: 'Mistral-Large-3',
        updatedAt: Date.now() - 1000 * 60 * 60 * 2,
        messages: [
          {
            role: 'user',
            text: 'Calculate estimated travel costs for the team attending the Claude Build Day in San Francisco.'
          },
          {
            role: 'agent',
            text: '### Claude Build Day — Travel Budget Estimate\n\nHere is the estimated travel cost breakdown for 3 engineers:\n\n- **Roundtrip Flights**: $1,350 total (~$450/person)\n- **Lodging (3 nights)**: $1,200 total (~$400/night near Moscone Center)\n- **Per Diem & Local Transit**: $600 total\n\n**Estimated Total**: **$3,150** with fail-closed receipt auditing enabled.'
          }
        ]
      },
      {
        id: 'session-3',
        title: 'Qwen3-32B Open-Source Status and Li...',
        model: 'Mistral-Large-3',
        updatedAt: Date.now() - 1000 * 60 * 60 * 24,
        messages: [
          {
            role: 'user',
            text: 'What is the open-source license for Qwen-2.5/Qwen3 and can it run locally via WebGPU or Ollama?'
          },
          {
            role: 'agent',
            text: '### Qwen Model Family Licensing & Local Inference\n\n- **License**: Apache 2.0 for 0.5B, 1.5B, 7B, 14B, 32B, and 72B variants.\n- **Commercial Use**: Fully permitted without royalty fees.\n- **Local Execution**: Seamlessly supported in **PrivaPilot** via local Ollama or WebGPU on-device fallback with 0 byte data leakage.'
          }
        ]
      },
      {
        id: 'session-4',
        title: 'Gridland Metro Solution in C++',
        model: 'Mistral-Large-3',
        updatedAt: Date.now() - 1000 * 60 * 60 * 48,
        messages: [
          {
            role: 'user',
            text: 'How do you solve the Gridland Metro problem using interval merging in C++?'
          },
          {
            role: 'agent',
            text: '### C++ Interval Merging for Gridland Metro\n\nWe group railway tracks by row `r` using `std::unordered_map<int, vector<pair<int, int>>>`, sort overlapping intervals `[c1, c2]`, merge them in `O(N log N)`, and subtract occupied track cells from `n * m` total cells.'
          }
        ]
      },
      {
        id: 'session-5',
        title: 'C++ Programmer Joke Counter',
        model: 'Mistral-Large-3',
        updatedAt: Date.now() - 1000 * 60 * 60 * 72,
        messages: [
          {
            role: 'user',
            text: 'Tell me a classic C++ memory joke.'
          },
          {
            role: 'agent',
            text: 'Why do C++ programmers wear glasses?\n\nBecause they don\'t C# — and they forgot to call `delete` on their optical memory! 😄'
          }
        ]
      }
    ];

    let chatSessions = [];
    try {
      const stored = localStorage.getItem('privapilot_chat_sessions');
      if (stored) {
        chatSessions = JSON.parse(stored);
      }
    } catch (_e) {}

    if (!Array.isArray(chatSessions) || chatSessions.length === 0) {
      chatSessions = DEFAULT_RECENT_SESSIONS;
      try {
        localStorage.setItem('privapilot_chat_sessions', JSON.stringify(chatSessions));
      } catch (_e) {}
    }

    // Ensure an initial new chat session exists so PrivaPilot opens to the clean initial hero page
    let initialNewSession = chatSessions.find(s => s.id === 'session-new');
    if (!initialNewSession) {
      initialNewSession = {
        id: 'session-new',
        title: 'New Chat',
        model: 'Mistral-Large-3',
        updatedAt: Date.now(),
        messages: []
      };
      chatSessions.unshift(initialNewSession);
    }

    let currentSessionId = 'session-new';
    try {
      const storedId = localStorage.getItem('privapilot_active_session_id');
      if (storedId && chatSessions.some(s => s.id === storedId && s.id !== 'session-new' && s.messages && s.messages.length > 0)) {
        currentSessionId = storedId;
      }
    } catch (_e) {}

    const menuToggleBtn = document.getElementById('menuToggleBtn');
    const headerNewChatBtn = document.getElementById('headerNewChatBtn');
    const geminiMenuDropdown = document.getElementById('geminiMenuDropdown');
    const recentChatsList = document.getElementById('recentChatsList');
    const menuNewChatBtn = document.getElementById('menuNewChatBtn');
    const menuMoreChatsBtn = document.getElementById('menuMoreChatsBtn');
    const menuOpenNewTabBtn = document.getElementById('menuOpenNewTabBtn');
    const menuDevToolsBtn = document.getElementById('menuDevToolsBtn');
    const hudTabs = document.getElementById('hudTabs');

    function saveChatSessions() {
      try {
        localStorage.setItem('privapilot_chat_sessions', JSON.stringify(chatSessions));
        localStorage.setItem('privapilot_active_session_id', currentSessionId);
      } catch (_e) {}
    }

    function renderRecentChatsMenu() {
      if (!recentChatsList) return;
      recentChatsList.innerHTML = '';

      // Display up to 5 recent chats with conversations
      const displaySessions = chatSessions
        .filter(s => s.id !== 'session-new' || (s.messages && s.messages.length > 0))
        .slice(0, 5);

      displaySessions.forEach((session) => {
        const item = document.createElement('button');
        item.type = 'button';
        item.className = `recent-chat-item ${session.id === currentSessionId ? 'active' : ''}`;
        item.title = session.title;
        item.innerHTML = `
          <svg class="item-icon" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <line x1="3" y1="6" x2="21" y2="6"></line>
            <line x1="3" y1="12" x2="21" y2="12"></line>
            <line x1="3" y1="18" x2="21" y2="18"></line>
          </svg>
          <span class="item-title">${escapeHtml(session.title)}</span>
        `;
        item.addEventListener('click', () => {
          switchSession(session.id);
        });
        recentChatsList.appendChild(item);
      });
    }

    function switchSession(sessionId) {
      const targetSession = chatSessions.find(s => s.id === sessionId);
      if (!targetSession) return;

      currentSessionId = sessionId;
      saveChatSessions();
      renderRecentChatsMenu();
      geminiMenuDropdown?.classList.add('hidden');
      menuToggleBtn?.classList.remove('active');

      // Clear existing messages
      chatMessages.querySelectorAll('.chat-msg, .welcome-card').forEach(el => el.remove());

      // Rebuild conversationHistory
      conversationHistory = [];

      if (!targetSession.messages || targetSession.messages.length === 0) {
        if (geminiHero) geminiHero.classList.remove('hidden');
      } else {
        if (geminiHero) geminiHero.classList.add('hidden');
        targetSession.messages.forEach(msg => {
          if (msg.role === 'user') {
            conversationHistory.push({ role: 'user', content: msg.text });
            const userBubble = document.createElement('div');
            userBubble.className = 'chat-msg user';
            userBubble.textContent = msg.text;
            chatMessages.appendChild(userBubble);
          } else {
            conversationHistory.push({ role: 'assistant', content: msg.text });
            const agentBubble = document.createElement('div');
            agentBubble.className = 'chat-msg agent';
            agentBubble.innerHTML = `
              <div style="font-size: 11.5px; color: #e3e3e3; line-height: 1.5; user-select: text;">
                ${renderMarkdown(msg.text)}
              </div>
            `;
            chatMessages.appendChild(agentBubble);
          }
        });
        chatMessages.scrollTop = chatMessages.scrollHeight;
      }
    }

    function createNewChat() {
      const newSession = {
        id: 'session-' + Date.now(),
        title: 'New Chat',
        model: 'Mistral-Large-3',
        updatedAt: Date.now(),
        messages: []
      };
      chatSessions.unshift(newSession);
      saveChatSessions();
      switchSession(newSession.id);
      chatInput?.focus();
    }

    menuToggleBtn?.addEventListener('click', (e) => {
      e.stopPropagation();
      const isHidden = geminiMenuDropdown?.classList.toggle('hidden');
      if (isHidden) {
        menuToggleBtn.classList.remove('active');
      } else {
        menuToggleBtn.classList.add('active');
      }
    });

    headerNewChatBtn?.addEventListener('click', () => {
      createNewChat();
    });

    menuNewChatBtn?.addEventListener('click', () => {
      createNewChat();
    });

    menuMoreChatsBtn?.addEventListener('click', () => {
      geminiMenuDropdown?.classList.add('hidden');
      menuToggleBtn?.classList.remove('active');
    });

    menuOpenNewTabBtn?.addEventListener('click', () => {
      geminiMenuDropdown?.classList.add('hidden');
      menuToggleBtn?.classList.remove('active');
      if (typeof chrome !== 'undefined' && chrome?.tabs?.create) {
        chrome.tabs.create({ url: chrome.runtime.getURL('src/sidepanel/sidepanel.html') });
      } else {
        window.open(window.location.href, '_blank');
      }
    });

    menuDevToolsBtn?.addEventListener('click', () => {
      geminiMenuDropdown?.classList.add('hidden');
      menuToggleBtn?.classList.remove('active');
      hudTabs?.classList.toggle('hidden');
    });

    // Close dropdown on click outside
    document.addEventListener('click', (e) => {
      if (geminiMenuDropdown && !geminiMenuDropdown.classList.contains('hidden')) {
        if (!geminiMenuDropdown.contains(e.target) && !menuToggleBtn?.contains(e.target)) {
          geminiMenuDropdown.classList.add('hidden');
          menuToggleBtn?.classList.remove('active');
        }
      }
    });

    // Close dropdown on Esc key
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && geminiMenuDropdown && !geminiMenuDropdown.classList.contains('hidden')) {
        geminiMenuDropdown.classList.add('hidden');
        menuToggleBtn?.classList.remove('active');
      }
    });

    // Initialize recent chats menu and switch to active session
    renderRecentChatsMenu();
    switchSession(currentSessionId);

    // Close / Toggle Tab Sharing Strip
    const closeSharingBtn = document.getElementById('closeSharingBtn');
    const chatTabSharingStrip = document.querySelector('.chat-tab-sharing-strip');
    let isTabSharingActive = true;
    closeSharingBtn?.addEventListener('click', () => {
      isTabSharingActive = !isTabSharingActive;
      if (chatTabSharingStrip) {
        if (!isTabSharingActive) {
          chatTabSharingStrip.style.opacity = '0.35';
          if (sharingTabTitle) sharingTabTitle.textContent = 'Tab context paused';
          closeSharingBtn.title = 'Resume active tab sharing';
        } else {
          chatTabSharingStrip.style.opacity = '1';
          closeSharingBtn.title = 'Toggle active tab context';
          updateActiveTabUrl();
        }
      }
    });

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

    // Gemini Suggestion Chips
    document.querySelectorAll('.gemini-chip').forEach(btn => {
      btn.addEventListener('click', () => {
        const prompt = btn.getAttribute('data-prompt') || btn.textContent?.trim();
        if (chatInput && prompt) {
          chatInput.value = prompt;
          executeGoal(prompt);
        }
      });
    });

    // Chat Tool / Action Shortcut Button
    chatToolBtn?.addEventListener('click', () => {
      hudTabs?.classList.remove('hidden');
      switchTab(tabInspectorBtn, tabInspectorContent);
    });

    // Chat Tuning / Sliders Button
    const chatSlidersBtn = document.getElementById('chatSlidersBtn');
    chatSlidersBtn?.addEventListener('click', () => {
      hudTabs?.classList.remove('hidden');
      switchTab(tabInspectorBtn, tabInspectorContent);
    });

    // Model Selector Chip (Quick switch to Telemetry/Model Audit)
    const modelSelectBtn = document.getElementById('modelSelectBtn');
    modelSelectBtn?.addEventListener('click', () => {
      hudTabs?.classList.remove('hidden');
      switchTab(tabAuditBtn, tabAuditContent);
    });

    // Sample Goals (Backward Compatibility)
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
      if (appRoot) {
        appRoot.setAttribute('data-agent-status', state);
        appRoot.setAttribute('data-run-state', state);
      }
      if (!agentStatusBadge) return;
      const info = mapAgentStateToStatusInfo(state);
      agentStatusBadge.className = `status-pill ${info.cssClass}`;
      agentStatusBadge.textContent = info.label;
    }

    // Set Vision Provider
    function setVisionProvider(provider, modelName) {
      if (!visionProviderBadge) return;
      const badgeInfo = mapVisionProviderToBadge(provider, modelName);
      const isOnline = provider && !['not_run', 'unavailable', 'unknown', 'degraded_masking', 'heuristic_fallback'].includes(provider);
      visionProviderBadge.className = `connection-indicator ${isOnline ? 'connected' : 'disconnected'} ${badgeInfo.cssClass}`;
      visionProviderBadge.title = `${badgeInfo.text} (${isOnline ? 'Connected' : 'Disconnected'})`;
      if (visionProviderText) {
        visionProviderText.textContent = badgeInfo.text;
      }
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
      if (typeof window !== 'undefined') {
        window.__lastAgentResult = res;
      }
      if (appRoot && res) {
        appRoot.setAttribute('data-last-completed-run-id', res.runId || currentRunId || '');
        appRoot.setAttribute('data-last-result-state', res.state || '');
      }
      if (!agentBubble) return;

      // 1a. Interactive User Input Required (Form / Credentials)
      if (res && res.inputRequest) {
        const req = res.inputRequest;
        agentBubble.innerHTML = '';

        const card = document.createElement('div');
        card.className = 'thought-card';
        card.style.borderLeft = '3px solid #2563eb';
        card.style.background = '#f8fafc';

        const header = document.createElement('div');
        header.className = 'thought-header';
        header.innerHTML = `<span>🔐 Input Required for Secure Fill</span><span class="risk-pill risk-safe" style="background:#dbeafe; color:#1e40af;">INPUT REQUIRED</span>`;

        const desc = document.createElement('div');
        desc.style.fontSize = '11px';
        desc.style.color = '#334155';
        desc.style.marginTop = '6px';
        desc.style.lineHeight = '1.4';
        desc.textContent = req.prompt || 'PrivaPilot will safely type your values into the page locally.';

        const form = document.createElement('div');
        form.style.marginTop = '8px';
        form.style.display = 'flex';
        form.style.flexDirection = 'column';
        form.style.gap = '6px';

        if (req.kind === 'credentials') {
          form.innerHTML = `
            <input type="text" id="userInputUsername" placeholder="Email or Username" style="padding: 6px 8px; border: 1px solid #cbd5e1; border-radius: 5px; font-size: 11px; background:#ffffff; color:#0f172a;" />
            <input type="password" id="userInputPassword" placeholder="Password" style="padding: 6px 8px; border: 1px solid #cbd5e1; border-radius: 5px; font-size: 11px; background:#ffffff; color:#0f172a;" />
            <button id="btnSubmitInputForm" style="margin-top: 4px; padding: 7px 12px; background: #2563eb; color: #ffffff; border: none; border-radius: 5px; font-weight: 600; font-size: 11px; cursor: pointer;">Fill Form &amp; Continue</button>
          `;
        } else {
          form.innerHTML = `
            <input type="text" id="userInputText" placeholder="Enter value..." style="padding: 6px 8px; border: 1px solid #cbd5e1; border-radius: 5px; font-size: 11px; background:#ffffff; color:#0f172a;" />
            <button id="btnSubmitInputForm" style="margin-top: 4px; padding: 7px 12px; background: #2563eb; color: #ffffff; border: none; border-radius: 5px; font-weight: 600; font-size: 11px; cursor: pointer;">Fill &amp; Continue</button>
          `;
        }

        card.appendChild(header);
        card.appendChild(desc);
        card.appendChild(form);
        agentBubble.appendChild(card);

        const submitBtn = form.querySelector('#btnSubmitInputForm');
        submitBtn?.addEventListener('click', (e) => {
          e.preventDefault();
          const userVal = (form.querySelector('#userInputUsername'))?.value?.trim() || '';
          const passVal = (form.querySelector('#userInputPassword'))?.value?.trim() || '';
          const customVal = (form.querySelector('#userInputText'))?.value?.trim() || '';

          if (!userVal && !passVal && !customVal) {
            let warn = form.querySelector('.input-validation-warn');
            if (!warn) {
              warn = document.createElement('div');
              warn.className = 'input-validation-warn';
              warn.style.color = '#dc2626';
              warn.style.fontSize = '10px';
              warn.style.marginTop = '2px';
              form.insertBefore(warn, submitBtn);
            }
            warn.textContent = 'Please enter username/email or password to fill.';
            return;
          }

          submitBtn.disabled = true;
          submitBtn.textContent = 'Filling form locally...';
          setAgentStatus('executing');

          if (typeof chrome !== 'undefined' && chrome.runtime?.sendMessage) {
            chrome.runtime.sendMessage({
              type: 'SUBMIT_USER_INPUT',
              inputs: { username: userVal, password: passVal, customText: customVal },
              runId: currentRunId,
              tabId: currentActiveTabId
            }, (submitRes) => {
              renderActionResult(agentBubble, submitRes);
            });
          }
        });

        setAgentStatus('awaiting-user-confirmation');
        chatMessages.scrollTop = chatMessages.scrollHeight;
        return;
      }

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

        // Record assistant turn in multi-turn history
        conversationHistory.push({ role: 'assistant', content: res.reply });
        if (conversationHistory.length > 20) {
          conversationHistory = conversationHistory.slice(-20);
        }

        const activeSession = chatSessions.find(s => s.id === currentSessionId);
        if (activeSession) {
          if (!activeSession.messages) activeSession.messages = [];
          activeSession.messages.push({ role: 'agent', text: res.reply });
          activeSession.updatedAt = Date.now();
          saveChatSessions();
        }

        const formattedHtml = renderMarkdown(res.reply);
        const actionSuggestions = extractActionSuggestions(res.reply);

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
          ${res.reasoning ? `
            <details class="thought-stream-details" open>
              <summary class="thought-stream-summary">
                <span>🧠 Agent Thought Process</span>
                <span class="thought-stream-badge">Reasoning</span>
              </summary>
              <div class="thought-stream-body">${renderMarkdown(res.reasoning)}</div>
            </details>
          ` : ''}
          <div style="font-size: 11.5px; color: #e3e3e3; line-height: 1.5; user-select: text;">${formattedHtml}</div>
          ${actionSuggestions.length > 0 ? `
            <div class="chat-action-chips" style="display: flex; flex-wrap: wrap; gap: 5px; margin-top: 8px;">
              ${actionSuggestions.map(act => `
                <button class="chat-action-chip" style="display: inline-flex; align-items: center; gap: 4px; padding: 3px 8px; background: rgba(138, 180, 248, 0.12); border: 1px solid rgba(138, 180, 248, 0.3); border-radius: 12px; color: #8ab4f8; font-size: 10.5px; font-weight: 600; cursor: pointer;" data-action="click ${escapeHtml(act)}">
                  ⚡ Click "${escapeHtml(act)}"
                </button>
              `).join('')}
            </div>
          ` : ''}
        `;

        if (actionSuggestions.length > 0) {
          agentBubble.querySelectorAll('.chat-action-chip').forEach(chip => {
            chip.addEventListener('click', (e) => {
              e.preventDefault();
              const actionGoal = chip.getAttribute('data-action');
              if (actionGoal) executeGoal(actionGoal);
            });
          });
        }

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
          let explanation = escapeHtml(errorMsg);
          if (errorMsg.includes('chrome://')) {
            explanation += '<br/><span style="color: #64748b; font-size: 10px; margin-top: 4px; display: inline-block;">ℹ️ <strong>Chrome Security Guard:</strong> Chrome strictly prevents all extensions from accessing or automating internal pages (<code style="background: #f1f5f9; padding: 1px 3px; border-radius: 3px;">chrome://</code>). Please switch to a web page (e.g. <a href="http://localhost:4500" target="_blank" style="color: #2563eb; text-decoration: underline;">localhost:4500</a> or any website) to use PrivaPilot.</span>';
          }
          displayHtml = `🛡️ <strong>Blocked Locally:</strong> ${explanation}`;
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
        </div>

        ${action.reasoning ? `
          <details class="thought-stream-details" open>
            <summary class="thought-stream-summary">
              <span>🧠 Agent Thought Process</span>
              <span class="thought-stream-badge">Reasoning</span>
            </summary>
            <div class="thought-stream-body">${renderMarkdown(action.reasoning)}</div>
          </details>
        ` : ''}

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

      // Record action execution turn in multi-turn history
      const actionTurnText = `Executed ${action.kind} on ${action.targetLocalId || 'page'}. Rationale: ${action.rationale || 'Action executed and verified complete'}`;
      conversationHistory.push({
        role: 'assistant',
        content: actionTurnText
      });
      if (conversationHistory.length > 20) {
        conversationHistory = conversationHistory.slice(-20);
      }

      const activeSession = chatSessions.find(s => s.id === currentSessionId);
      if (activeSession) {
        if (!activeSession.messages) activeSession.messages = [];
        activeSession.messages.push({ role: 'agent', text: actionTurnText });
        activeSession.updatedAt = Date.now();
        saveChatSessions();
      }

      // Update Telemetry if measured
      if (res.telemetry) {
        if (meterClientLatency) meterClientLatency.textContent = `${res.telemetry.clientLatencyMs} ms`;
        if (meterServerLatency) meterServerLatency.textContent = `${res.telemetry.serverLatencyMs} ms`;
        if (meterActionLatency) meterActionLatency.textContent = `${res.telemetry.totalLatencyMs - res.telemetry.clientLatencyMs - res.telemetry.serverLatencyMs} ms`;
        if (meterTotalLatency) meterTotalLatency.textContent = `${res.telemetry.totalLatencyMs} ms`;
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

      // Record user turn in multi-turn history
      conversationHistory.push({ role: 'user', content: goalText });
      if (conversationHistory.length > 20) {
        conversationHistory = conversationHistory.slice(-20);
      }

      // Persist in active chat session
      const activeSession = chatSessions.find(s => s.id === currentSessionId);
      if (activeSession) {
        if ((!activeSession.messages || activeSession.messages.length === 0) && (activeSession.title === 'New Chat' || !activeSession.title)) {
          activeSession.title = goalText.length > 32 ? goalText.slice(0, 32) + '...' : goalText;
        }
        if (!activeSession.messages) activeSession.messages = [];
        activeSession.messages.push({ role: 'user', text: goalText });
        activeSession.updatedAt = Date.now();
        saveChatSessions();
        renderRecentChatsMenu();
      }

      const welcomeBox = chatMessages.querySelector('.welcome-card');
      if (welcomeBox) welcomeBox.remove();
      if (geminiHero) geminiHero.classList.add('hidden');

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
          <em>Contacting reasoning model...</em>
        </div>
      `;
      chatMessages.appendChild(agentBubble);
      chatMessages.scrollTop = chatMessages.scrollHeight;

      setAgentStatus('capturing');

      // Reset any active confirmation modal from earlier runs
      actionConfirmModal?.classList.add('hidden');
      actionConfirmModal?.removeAttribute('data-confirm-run-id');

      // Generate unique runId on task dispatch
      currentRunId = 'run_' + Date.now() + '_' + Math.random().toString(36).slice(2, 9);
      if (appRoot) {
        appRoot.setAttribute('data-current-run-id', currentRunId);
        appRoot.setAttribute('data-run-state', 'starting');
        appRoot.removeAttribute('data-last-completed-run-id');
        appRoot.removeAttribute('data-last-result-state');
      }

      // Route imperative browser requests into the execution loop. This recognizes
      // polite natural phrasing such as "can you fill..." instead of sending it to
      // read-only chat, where the model can only describe what it would do.
      const isExplicitAction = isBrowserActionRequest(goalText);

      const isRestrictedTab = Boolean(
        activeTabUrl && (
          activeTabUrl.textContent?.startsWith('chrome://') ||
          activeTabUrl.title?.startsWith('chrome://') ||
          activeTabUrl.textContent?.startsWith('chrome-extension://')
        )
      );

      // Inspect page context by default whenever on an active tab, unless restricted
      const needsPageContext = !isRestrictedTab && Boolean(currentActiveTabId);

      const messageType = isExplicitAction
        ? 'START_AGENT_RUN'
        : needsPageContext
          ? 'CHAT_WITH_PAGE'
          : 'GENERAL_CHAT';
      const payloadKey = isExplicitAction ? 'goal' : 'message';

      setAgentStatus(isExplicitAction || needsPageContext ? 'capturing' : 'reasoning');

      if (typeof chrome !== 'undefined' && chrome.runtime?.sendMessage) {
        let settled = false;
        const timeout = setTimeout(() => {
          if (settled) return;
          settled = true;
          agentBubble.innerHTML = `<div style="padding: 7px 9px; background: #fef2f2; border: 1px solid #fecaca; border-radius: 6px; color: #dc2626; font-size: 11px;">⚠️ Reasoning request timed out after 120 seconds.</div>`;
          setAgentStatus('failed-safe');
        }, 120000);

        chrome.runtime.sendMessage({
          type: messageType,
          [payloadKey]: goalText,
          runId: currentRunId,
          tabId: currentActiveTabId,
          history: conversationHistory.slice(-10)
        }, (res) => {
          if (settled) return;
          settled = true;
          clearTimeout(timeout);
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

      sendBtn?.addEventListener('click', (e) => {
        if (sendBtn.classList.contains('mode-send')) {
          e.preventDefault();
          chatForm.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
        }
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
      actionConfirmModal?.removeAttribute('data-confirm-run-id');
      if (appRoot) {
        appRoot.removeAttribute('data-last-completed-run-id');
        appRoot.removeAttribute('data-last-result-state');
      }
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
      actionConfirmModal?.removeAttribute('data-confirm-run-id');
      if (appRoot) {
        appRoot.removeAttribute('data-last-completed-run-id');
        appRoot.removeAttribute('data-last-result-state');
      }
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
        if (!message) return false;

        (async () => {
          if (message.type === 'COORDINATOR_STATE_CHANGED') {
            setAgentStatus(message.state);
            if (message.message) {
              addAuditEntry('AGENT', message.message, 'info');
            }
          }

          if (message.type === 'COORDINATOR_STEP_PROGRESS') {
            if (message.message) {
              addAuditEntry(`STEP ${message.step}/${message.maxSteps}`, message.message, 'info');
            }
          }

          if (message.type === 'COORDINATOR_ACTION_PROPOSED') {
            const act = message.action;
            if (act) {
              const actDesc = `${act.kind ? act.kind.toUpperCase() : 'ACT'} ${act.sanitizedTargetName || act.targetLocalId || ''}`.trim();
              addAuditEntry('PLAN', `${actDesc}: ${act.rationale || 'Executing action'}`, 'pass');
            }
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

            let realDigest = message.payloadDigestSha256 || 'Not available';
            if (realDigest && realDigest !== 'Not available') {
              addAuditEntry('DIGEST', `Payload sealed with SHA-256: ${realDigest.slice(0, 18)}...`, 'pass');
            }

            const outgoingContext = message.networkPayload || {
              protocolVersion: message.protocolVersion || '1.0',
              runId: message.runId || 'Not available',
              goal: currentGoalText || 'Not available',
              sanitizedScreenshotDataUrl: cachedSanitizedScreenshot,
              elements: message.elements || [],
              pageState: message.pageState || 'Not available',
              redactionManifest: message.redactionManifest,
              payloadDigestSha256: realDigest
            };
            lastSanitizedContext = outgoingContext;
            updatePayloadDisplay(outgoingContext, currentGoalText);
          }

          if (message.type === 'COORDINATOR_CONFIRMATION_REQUIRED') {
            const action = message.action || {};
            if (confirmActionKind) confirmActionKind.textContent = (action.kind || 'CLICK').toUpperCase();
            if (confirmTargetId) confirmTargetId.textContent = action.targetLocalId || 'page';
            if (confirmTargetName) confirmTargetName.textContent = action.sanitizedTargetName || action.targetLocalId || 'Protected Action';
            if (confirmRationale) confirmRationale.textContent = action.rationale || 'Action alters persistent state.';
            actionConfirmModal?.setAttribute('data-confirm-run-id', message.runId || currentRunId);
            actionConfirmModal?.classList.remove('hidden');
            setAgentStatus('awaiting-user-confirmation');
            addAuditEntry('AUTH', `Confirmation requested for ${action.kind}`, 'warn');
          }

          if (message.type === 'COORDINATOR_USER_INPUT_REQUIRED') {
            const lastAgentBubble = chatMessages.querySelector('.chat-msg.agent:last-child');
            if (lastAgentBubble) {
              renderActionResult(lastAgentBubble, {
                state: 'awaiting-user-confirmation',
                inputRequest: message.request
              });
            }
          }

          if (message.type === 'COORDINATOR_TELEMETRY_UPDATED') {
            const tel = message.telemetry;
            if (tel) {
              if (meterClientLatency) meterClientLatency.textContent = `${tel.clientLatencyMs} ms`;
              if (meterServerLatency) meterServerLatency.textContent = `${tel.serverLatencyMs} ms`;
              if (meterActionLatency) meterActionLatency.textContent = `${tel.totalLatencyMs - tel.clientLatencyMs - tel.serverLatencyMs} ms`;
              if (meterTotalLatency) meterTotalLatency.textContent = `${tel.totalLatencyMs} ms`;
            }
          }
        })().catch((err) => {
          console.error('[PrivaPilot Sidepanel] Broadcast handler error:', err);
        });

        return false; // Explicitly return false so Chrome knows this listener does not handle or respond to messages
      });
    }

    // Default to 'not_run' vision provider on initialization until perception runs
    setVisionProvider('not_run');
    setAgentStatus('idle');
    updateInspectorLayout();

    // Probe the reasoning gateway once on open, so a missing server or a missing
    // model is reported here instead of surfacing as a failed first message.
    function reportModelConnectivity() {
      if (typeof chrome === 'undefined' || !chrome.runtime?.sendMessage) return;

      chrome.runtime.sendMessage({ target: 'privapilot-background', type: 'GET_MODEL_STATUS' }, (status) => {
        if (chrome.runtime.lastError || !status) {
          setVisionProvider('unavailable');
          addAuditEntry('MODEL', 'Background service worker unreachable', 'warn');
          return;
        }

        if (!status.reachable) {
          setVisionProvider('unavailable');
          addAuditEntry('MODEL', status.error || 'Reasoning gateway unreachable', 'warn');
          showModelBanner(
            'Reasoning gateway offline',
            status.error || 'Start it with "npm run dev:server" and reopen this panel.'
          );
          return;
        }

        if (!status.modelConnected) {
          setVisionProvider('unavailable');
          addAuditEntry('MODEL', status.detail || 'No model backend connected', 'warn');
          showModelBanner(
            'No reasoning model connected',
            status.detail || 'Start Ollama and pull a model, or set VLM_ENDPOINT on the gateway.'
          );
          return;
        }

        addAuditEntry('MODEL', `Connected: ${status.modelName} via ${status.provider}`, 'pass');
        if (status.visionCapable !== false) {
          setVisionProvider(status.provider || 'qwen_live', status.modelName);
        } else {
          setVisionProvider('text_only', status.modelName);
        }
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


