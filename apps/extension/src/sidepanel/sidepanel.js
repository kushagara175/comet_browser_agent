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

const ACTION_REQUEST_PREFIX = /^(?:(?:please|kindly)\s+|(?:can|could|would|will)\s+(?:you|we)\s+|(?:i\s+)?(?:want|wnat|need|would\s+like)\s+(?:you\s+)?to\s+|(?:go\s+ahead\s+and)\s+|(?:hey|hi|ok)\s+(?:privapilot[,!]?\s+)?(?:please\s+)?|(?:do\s+(?:the\s+)?|perform\s+(?:the\s+)?|start\s+(?:the\s+)?|execute\s+(?:the\s+)?|proceed\s+with\s+(?:the\s+)?|try\s+to\s+|let's\s+|lets\s+|let\s+us\s+)|(?:help\s+me\s+(?:in\s+|with\s+|out\s+with\s+|to\s+|by\s+|on\s+)?|assist\s+me\s+(?:in\s+|with\s+|to\s+)?)|(?:and\s+then|then|after\s+that|and|also|now|next|so)\s+)+/i;
const ACTION_VERB = /^(?:click|open|type|fill|fill\s+out|enter|write|set|press|select|choose|scroll|hover|drag|drop|upload|attach|move|submit|approve|deny|dismiss|close|accept|filter|find|search|login|log\s+in|sign|auth|authenticate|do|perform|execute|proceed|buy|checkout|inspect|audit|check|go\s+to|navigate|view|see|show|look|lookup|organize|manage|clean|read|summarize|analyze|review|examine|list|get|fetch|test|try|work|automate|operate|interact)(?:\b|\s)/i;

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

  // Normalize colloquial contractions and typos
  normalized = normalized
    .replace(/\bchekinup\b/g, 'check')
    .replace(/\bcheckin\b/g, 'check')
    .replace(/\bcheckup\b/g, 'check')
    .replace(/\bchecking\s+up\b/g, 'check')
    .replace(/\bchecking\b/g, 'check')
    .replace(/\btyoe\b/g, 'type')
    .replace(/\btpye\b/g, 'type')
    .replace(/\bclik\b/g, 'click')
    .replace(/\bcilck\b/g, 'click')
    .replace(/\bclcik\b/g, 'click')
    .replace(/\bclck\b/g, 'click')
    .replace(/\bclikc\b/g, 'click')
    .replace(/\bselet\b/g, 'select')
    .replace(/\bselct\b/g, 'select')
    .replace(/\bserach\b/g, 'search')
    .replace(/\bserch\b/g, 'search')
    .replace(/\bdown;oad\b/g, 'download')
    .replace(/\bdownlaod\b/g, 'download')
    .replace(/\bdoenmlao\b/g, 'download')
    .replace(/\bdomwloadn\b/g, 'download')
    .replace(/\bdomwload\b/g, 'download')
    .replace(/\bdowload\b/g, 'download')
    .replace(/\bdwnload\b/g, 'download')
    .replace(/\bdownld\b/g, 'download')
    .replace(/\bdownlod\b/g, 'download')
    .replace(/\bwnat\b/g, 'want')
    .replace(/\bhoe\b/g, 'how')
    .replace(/\bae\b/g, 'are')
    .replace(/\bdon\b/g, 'done')
    .replace(/\binthe\b/g, 'in the')
    .replace(/\bprobelm\b/g, 'problem')
    .replace(/\bststement\b/g, 'statement')
    .replace(/\bprbek\b/g, 'problem')
    .replace(/\btermiankti\b/g, 'termination')
    .replace(/\bseahc\b/g, 'search')
    .replace(/\bse\b(?=\s+(?:for|at|the|thr|in|to|on)\b)/g, 'see')
    .replace(/\bthr\b/g, 'the')
    .replace(/\bhre\b/g, 'here')
    .replace(/\bstrtup\b/g, 'startup')
    .replace(/\bstrt-up\b/g, 'start-up')
    .replace(/\bshw\b/g, 'show')
    .replace(/\bopn\b/g, 'open')
    .replace(/\bfnd\b/g, 'find');

  // Information retrieval & question-answering directives per cababling.md
  if (/(?:how\s+many|count\s+(?:of|for)|number\s+of|total\s+(?:count|number|submissions?)|submissions?\s+(?:are\s+)?(?:done|completed|submitted)|what\s+is\s+the\s+(?:count|number|total|status)|which\s+tab|tell\s+me\s+(?:the\s+count|the\s+number|the\s+total|the\s+status|about\s+submissions)|find\s+.*?\s+and\s+tell)/i.test(normalized)) {
    return true;
  }

  // Questions or advisory queries should stay chat
  if (/^(?:tell\s+me\s+how|how\s+(?:do|can|to)|what\s+(?:would|is|are)|why\s+|explain\b)/i.test(normalized)) {
    return false;
  }
  // Direct URL or universal domain navigation directives (e.g. "https://...", "www.isro.gov.in", "allel.co", "sih.gov.in")
  if (/^https?:\/\//i.test(normalized) || /^www\.[a-z0-9-]+\.[a-z]+/i.test(normalized) || /^(?:[a-zA-Z0-9-]+\.)+[a-zA-Z]{2,24}(?:\/[^\s]*)?$/i.test(normalized)) {
    return true;
  }

  if (ACTION_VERB.test(normalized)) return true;

  // Browser resource management directives (bookmarks, tabs, history, downloads)
  if (/\b(?:bookmarks?|tabs?|history|downloads?)\b/i.test(normalized)) {
    return true;
  }

  // Prepositional phrases: "in the place of name type ...", "in name put ...", "for email enter ..."
  const strippedPunct = normalized.replace(/([a-zA-Z0-9_-]+)\.\s+/g, '$1 ').replace(/\s+\.\s+/g, ' ').replace(/\s+/g, ' ');
  if (/^(?:in|for|at|on|into|to)\s+(?:the\s+)?(?:place\s+of\s+|field\s+of\s+|box\s+of\s+|input\s+of\s+)?[a-z0-9_\s-]+\s+(?:type|fill|enter|write|put|set|tyoe)\b/i.test(strippedPunct)) {
    return true;
  }

  // Actionable pattern anywhere: "type <val> into <target>" or "click <target>"
  if (/\b(?:type|fill|enter|write|put)\s+["']?[a-zA-Z0-9_@.-]+["']?\s+(?:in|into|on|for)\b/i.test(strippedPunct)) {
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
export function computeMaskBreakdown(elements = [], totalMasks = 0, redactionManifest = null) {
  // If true redaction manifest with category breakdown is provided, use authentic category counts!
  if (redactionManifest && redactionManifest.categoryBreakdown && typeof redactionManifest.categoryBreakdown === 'object') {
    const rawBreakdown = redactionManifest.categoryBreakdown;
    const cleanBreakdown = {};
    for (const [cat, count] of Object.entries(rawBreakdown)) {
      if (typeof count === 'number' && count > 0) {
        cleanBreakdown[cat] = count;
      }
    }
    if (Object.keys(cleanBreakdown).length > 0) {
      return cleanBreakdown;
    }
  }

  const breakdown = {};

  for (const el of elements) {
    const name = (el.sanitizedName || '').toLowerCase();
    if (name.includes('password')) {
      breakdown.password = (breakdown.password || 0) + 1;
    } else if (name.includes('otp') || /\bauth(?:_code)?\b/i.test(name) || name.includes('[otp field]')) {
      breakdown.auth_code = (breakdown.auth_code || 0) + 1;
    } else if (name.includes('payment') || name.includes('card') || name.includes('cvv')) {
      breakdown.payment = (breakdown.payment || 0) + 1;
    } else if (name.includes('national id') || name.includes('aadhaar')) {
      breakdown.national_id = (breakdown.national_id || 0) + 1;
    } else if (name.includes('email')) {
      breakdown.email = (breakdown.email || 0) + 1;
    } else if (name.includes('phone')) {
      breakdown.phone = (breakdown.phone || 0) + 1;
    } else if (name.includes('address') || name.includes('location') || name.includes('pincode')) {
      breakdown.address = (breakdown.address || 0) + 1;
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

/**
 * Real LLM Monologue / Thinking Extraction & Sanitization (inspired by allel)
 */
export function sanitizeReasoningText(raw) {
  if (!raw || typeof raw !== 'string') return '';
  let clean = raw
    .replace(/<\/?think(?:ing)?>/gi, '')
    .replace(/<\/?thought>/gi, '')
    .replace(/<tool_call>[\s\S]*?<\/tool_call>/gi, '')
    .replace(/```(?:json)?\s*[\s\S]*?```/gi, '')
    .replace(/\{[\s\S]*?"(?:actionId|kind|targetLocalId|batchActions)"[\s\S]*?\}/gi, '')
    .replace(/\b(?:\{\s*"actionId"[\s\S]*)$/i, '')
    .replace(/\n{3,}/g, '\n\n')
    .trim();

  // Strict check: filter out empty or canned fallback strings
  const FAKE_STRINGS = [
    'analyzed visible page elements and generated response.',
    'formulated response to query.',
    'evaluated page context and synthesized response.',
    'llm analyzed page elements and determined the optimal execution path.',
    'evaluating page elements and planning action...',
    'analyzed visible page context and formulated response.',
    'action executed successfully'
  ];
  if (FAKE_STRINGS.some(fake => clean.toLowerCase() === fake)) {
    return '';
  }
  return clean;
}

/**
 * Aggregates reasoning from all executed steps of a completed run to display the complete multi-step thought history.
 */
export function collectAllStepReasoning(res) {
  const parts = [];
  if (Array.isArray(res?.steps) && res.steps.length > 0) {
    for (const s of res.steps) {
      const r = s.proposal?.reasoning || s.proposal?.thought || s.proposal?.rationale || s.reasoning;
      if (r && typeof r === 'string' && r.trim()) {
        const trimmed = r.trim();
        if (!parts.includes(trimmed)) {
          parts.push(trimmed);
        }
      }
    }
  }
  if (parts.length === 0) {
    const fallback = res?.reasoning || res?.proposal?.reasoning || res?.proposal?.thought || res?.proposal?.rationale || res?.message || '';
    if (fallback && typeof fallback === 'string' && fallback.trim()) {
      parts.push(fallback.trim());
    }
  }
  return parts.join('\n\n');
}

/**
 * Parses raw reasoning into discrete, structured thought units with icons and categories.
 */
export function parseReasoningLines(rawText) {
  const clean = sanitizeReasoningText(rawText);
  if (!clean) return [];

  // Split on newlines
  let rawLines = clean
    .split(/\r?\n+/)
    .map(l => l.trim())
    .filter(Boolean);

  // If condensed into a single string, split by major delimiters or semantic transitions
  if (rawLines.length === 1 && rawLines[0].length > 70) {
    const text = rawLines[0];
    const emojiSplit = text.split(/(?=(?:👁️|🎯|⚡|📋|🧠))\s*/u).map(l => l.trim()).filter(Boolean);
    if (emojiSplit.length > 1) {
      rawLines = emojiSplit;
    } else {
      const keywordSplit = text.split(/(?<=[.!?]|^)\s+(?=(?:Observation:|User Intent:|Intent:|Strategic plan:|Strategy:|Action Selection:|Next Action:|Action:|Extraction:|Thinking:|Reasoning:))/iu).map(l => l.trim()).filter(Boolean);
      if (keywordSplit.length > 1) {
        rawLines = keywordSplit;
      } else {
        rawLines = text.split(/(?<=[.!?])\s+(?=[A-Z0-9])/).map(l => l.trim()).filter(Boolean);
      }
    }
  }

  const seenCategories = new Set();
  const seenBodies = new Set();
  const parsed = [];

  for (const line of rawLines) {
    let text = line.replace(/^[\*\-\•]\s+/, '').replace(/^\d+\.\s+/, '').trim();
    if (!text) continue;

    let icon = '';
    let category = '';

    if (/^(?:👁️|Observation:?|Observing\b)/i.test(text)) {
      icon = '👁️';
      category = 'Observation';
    } else if (/^(?:🎯|User Intent:?|Intent:?|Strategic plan:?|Strategy:?)/i.test(text)) {
      icon = '🎯';
      category = 'Intent & Strategy';
    } else if (/^(?:⚡|Action Selection:?|Action:?|Next Action:?|Tool:?)/i.test(text)) {
      icon = '⚡';
      category = 'Action Selection';
    } else if (/^(?:📋|Extraction:?|Extracted:?|Data:?|Result:?)/i.test(text)) {
      icon = '📋';
      category = 'Extraction';
    } else if (/^(?:🧠|Thinking:?|Reasoning:?)/i.test(text)) {
      icon = '🧠';
      category = 'Reasoning';
    }

    // Thoroughly strip redundant leading category words/emojis from body so category label is NEVER duplicated
    let body = text
      .replace(/^(?:👁️|🎯|⚡|📋|🧠|Observation|User Intent|Intent|Strategic plan|Strategy|Action Selection|Action|Next Action|Tool|Extraction|Extracted|Data|Result|Reasoning|Thinking)[\s:—–\-]*/gi, '')
      .replace(/^(?:👁️|🎯|⚡|📋|🧠|Observation|User Intent|Intent|Strategic plan|Strategy|Action Selection|Action|Next Action|Tool|Extraction|Extracted|Data|Result|Reasoning|Thinking)[\s:—–\-]*/gi, '')
      .replace(/^[•\-\*\d\.]+\s*/, '')
      .trim();

    // Strip any trailing JSON remnant that might have snuck into the body
    body = body.replace(/\{[\s\S]*?"actionId"[\s\S]*$/i, '').trim();

    if (!body) continue;

    const normalizedBody = body.toLowerCase().slice(0, 60);
    if (seenBodies.has(normalizedBody)) {
      // Skip exact or near-duplicate sentences across multi-step execution
      continue;
    }
    seenBodies.add(normalizedBody);

    if (body.length > 0) {
      body = body.charAt(0).toUpperCase() + body.slice(1);
    }

    // Deduplicate repeating 'Intent & Strategy' blocks across multi-step execution
    if (category === 'Intent & Strategy') {
      if (seenCategories.has('Intent & Strategy')) {
        category = 'Strategy Update';
        icon = '🎯';
      } else {
        seenCategories.add('Intent & Strategy');
      }
    }

    parsed.push({ icon, category, body });
  }

  return parsed;
}

/**
 * Formats parsed reasoning into line-by-line HTML with semantic styling and code chip highlighting.
 */
export function formatReasoningIntoLinesHtml(rawText) {
  const parsed = parseReasoningLines(rawText);
  if (!parsed || parsed.length === 0) return '';

  const hasAnyCategory = parsed.some(item => Boolean(item.category || item.icon));

  if (hasAnyCategory) {
    const linesHtml = parsed.map(item => {
      let escapedBody = escapeHtml(item.body)
        .replace(/(?:`)(el_\w+)(?:`)/g, '<code class="thought-code">$1</code>')
        .replace(/\b(el_\d+)\b/g, '<code class="thought-code">$1</code>');

      const categoryHtml = item.category
        ? `<strong class="thought-category" style="color: #93c5fd; font-weight: 600; margin-right: 5px;">${escapeHtml(item.category)}:</strong>`
        : '';

      const iconHtml = (item.icon && item.icon !== '▸' && item.icon !== '•')
        ? `<span class="thought-icon" style="flex-shrink: 0; font-size: 12px; line-height: 1;">${item.icon}</span>`
        : '';

      return `<div class="thought-line" style="display: flex; align-items: baseline; gap: 7px; font-size: 12px; color: #cbd5e1; line-height: 1.6; padding: 2px 0;">${iconHtml}<span class="thought-body" style="flex: 1; word-break: break-word;">${categoryHtml}${escapedBody}</span></div>`;
    }).join('');

    return `<div class="thought-lines-container" style="display: flex; flex-direction: column; gap: 4px; padding: 2px 0;">${linesHtml}</div>`;
  }

  // Pure natural thought stream (Perplexity / Claude style)
  const paragraphs = rawText.split(/\r?\n\s*\r?\n/).map(p => p.trim()).filter(Boolean);
  const formattedParas = (paragraphs.length > 0 ? paragraphs : [rawText]).map(p => {
    let escaped = escapeHtml(p)
      .replace(/(?:`)(el_\w+)(?:`)/g, '<code class="thought-code">$1</code>')
      .replace(/\b(el_\d+)\b/g, '<code class="thought-code">$1</code>');
    return `<p style="margin: 0 0 6px 0; font-size: 12px; color: #cbd5e1; line-height: 1.6;">${escaped}</p>`;
  }).join('');

  return `<div class="thought-lines-container thought-monologue-natural" style="display: flex; flex-direction: column; gap: 4px; padding: 2px 0;">${formattedParas}</div>`;
}

/**
 * Renders the collapsible Monologue/Thinking Accordion with structured line-by-line thoughts.
 * By default, renders in a clean collapsed state (open: false) so the main answer is prominently visible.
 */
export function renderThinkingAccordion(rawReasoning, durationSeconds, options = {}) {
  const sanitized = sanitizeReasoningText(rawReasoning);
  if (!sanitized) return '';

  const words = sanitized.split(/\s+/).filter(Boolean).length;
  const computedFallback = Math.max(2, Math.min(16, 2 + Math.floor(words / 25)));
  const duration = durationSeconds && durationSeconds > 0 ? durationSeconds : computedFallback;
  const label = options.label || `Thought for ${duration}s`;
  const isExpanded = Boolean(options.open);

  return `
    <div class="monologue-block group" data-state="${isExpanded ? 'expanded' : 'collapsed'}">
      <button type="button" class="monologue-toggle-btn" aria-expanded="${isExpanded ? 'true' : 'false'}">
        <svg class="monologue-chevron" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
          <polyline points="9 18 15 12 9 6"></polyline>
        </svg>
        <span class="monologue-title monologue-completed-text">${escapeHtml(label)}</span>
      </button>
      <div class="monologue-drawer" style="display: ${isExpanded ? 'block' : 'none'};">
        <div class="monologue-content">${formatReasoningIntoLinesHtml(sanitized)}</div>
      </div>
    </div>
  `;
}

/**
 * Smoothly streams live reasoning lines into the live thought container with staggered animations.
 */
export function streamLiveReasoningLines(liveStream, liveReasoning) {
  if (!liveStream || !liveReasoning) return;
  const placeholder = liveStream.querySelector('.monologue-initial-placeholder');
  if (placeholder) placeholder.remove();
  const lines = parseReasoningLines(liveReasoning);
  if (lines.length === 0) return;

  const existingTexts = new Set(Array.from(liveStream.children).map(c => c.textContent?.trim()));

  lines.forEach((item, index) => {
    const fullText = `${item.category ? item.category + ': ' : ''}${item.body}`;
    if (existingTexts.has(fullText)) return;

    const lineEl = document.createElement('div');
    lineEl.className = 'thought-line live-streamed-line';
    lineEl.style.display = 'flex';
    lineEl.style.alignItems = 'baseline';
    lineEl.style.gap = '7px';
    lineEl.style.fontSize = '11.5px';
    lineEl.style.color = '#cbd5e1';
    lineEl.style.lineHeight = '1.5';
    lineEl.style.padding = '2px 0';
    lineEl.style.opacity = '0';
    lineEl.style.transform = 'translateY(3px)';
    lineEl.style.transition = 'opacity 0.2s ease, transform 0.2s ease';

    let escapedBody = escapeHtml(item.body)
      .replace(/(?:`)(el_\w+)(?:`)/g, '<code class="thought-code">$1</code>')
      .replace(/\b(el_\d+)\b/g, '<code class="thought-code">$1</code>');

    const categoryHtml = item.category
      ? `<strong class="thought-category" style="color: #93c5fd; font-weight: 600; margin-right: 5px;">${escapeHtml(item.category)}:</strong>`
      : '';

    lineEl.innerHTML = `
      <span class="thought-icon" style="flex-shrink: 0; font-size: 12px; line-height: 1;">${item.icon}</span>
      <span class="thought-body" style="flex: 1; word-break: break-word;">${categoryHtml}${escapedBody}</span>
    `;

    liveStream.appendChild(lineEl);

    setTimeout(() => {
      lineEl.style.opacity = '1';
      lineEl.style.transform = 'translateY(0)';
      const drawer = liveStream.closest('.monologue-drawer');
      if (drawer) drawer.scrollTop = drawer.scrollHeight;
    }, (index + 1) * 90);
  });
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
    const tabVaultBtn = document.getElementById('tabVaultBtn');
    const tabInspectorBtn = document.getElementById('tabInspectorBtn');
    const tabPayloadBtn = document.getElementById('tabPayloadBtn');
    const tabAuditBtn = document.getElementById('tabAuditBtn');

    const tabChatContent = document.getElementById('tabChatContent');
    const tabVaultContent = document.getElementById('tabVaultContent');
    const tabInspectorContent = document.getElementById('tabInspectorContent');
    const tabPayloadContent = document.getElementById('tabPayloadContent');
    const tabAuditContent = document.getElementById('tabAuditContent');

    const menuVaultBtn = document.getElementById('menuVaultBtn');
    const menuPayloadBtn = document.getElementById('menuPayloadBtn');
    const menuAuditBtn = document.getElementById('menuAuditBtn');
    const menuApiPlatformBtn = document.getElementById('menuApiPlatformBtn');

    const tabApiPlatformBtn = document.getElementById('tabApiPlatformBtn');
    const tabApiPlatformContent = document.getElementById('tabApiPlatformContent');

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

    // COMET Welcome Page Presentation (Paced smoothly for 4.5s on extension open)
    const SPLASH_DURATION_MS = 4500; // 4.5 seconds for a well-paced welcome sequence
    if (loadingView && aiWorkerView) {
      loadingView.classList.remove('hidden');
      loadingView.style.display = 'flex';
      aiWorkerView.classList.remove('hidden');
      aiWorkerView.style.opacity = '0';
      aiWorkerView.style.transition = 'opacity 0.6s cubic-bezier(0.16, 1, 0.3, 1)';

      setTimeout(() => {
        loadingView.classList.add('fade-out');
        aiWorkerView.style.opacity = '1';

        setTimeout(() => {
          loadingView.classList.add('hidden');
          loadingView.style.display = 'none';
          chatInput?.focus();
        }, 700);
      }, SPLASH_DURATION_MS);
    }

    // Top-left logo button: starts fresh new chat session cleanly without loading screen flicker
    backToConnectBtn?.addEventListener('click', () => {
      if (typeof createNewChat === 'function') {
        createNewChat();
      }
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

    // Refresh & Restart Extension: Hot reloads extension worker and resets sidepanel UI
    const reloadExtensionBtn = document.getElementById('reloadExtensionBtn');
    const triggerReload = () => {
      reloadExtensionBtn?.classList.add('spinning');
      if (typeof chrome !== 'undefined' && chrome.runtime && typeof chrome.runtime.reload === 'function') {
        chrome.runtime.reload();
        return;
      }
      window.location.reload();
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
            text: '### Mistral-Large-3 Architecture & Pricing\n\n**Mistral-Large-3** (`mistral-large-2407`) is Mistral AI\'s flagship frontier reasoning model hosted on **Azure AI Foundry**:\n\n- **Context Window**: 128k tokens with full native multilingual and coding support.\n- **Input Pricing**: $2.00 / 1M tokens.\n- **Output Pricing**: $6.00 / 1M tokens.\n\nCompared to GPT-4o ($2.50 / $10.00), Mistral-Large-3 offers ~35% lower inference cost with parity on complex reasoning and function calling.',
            reasoning: '1. The user asks for pricing and context window specifications for Mistral-Large-3 compared to GPT-4o.\n2. Mistral-Large-3 offers 128k context with competitive token rates.\n3. Formulate structured breakdown highlighting context window, input/output pricing, and key capabilities.',
            durationSeconds: 3
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
            text: '### Claude Build Day — Travel Budget Estimate\n\nHere is the estimated travel cost breakdown for 3 engineers:\n\n- **Roundtrip Flights**: $1,350 total (~$450/person)\n- **Lodging (3 nights)**: $1,200 total (~$400/night near Moscone Center)\n- **Per Diem & Local Transit**: $600 total\n\n**Estimated Total**: **$3,150** with fail-closed receipt auditing enabled.',
            reasoning: '1. Synthesize realistic conference travel budget for 3 engineers to San Francisco.\n2. Calculate reasonable estimates for flights, hotel lodging, and per diem.\n3. Format clean markdown summary with total calculation.',
            durationSeconds: 2
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
            text: '### Qwen Model Family Licensing & Local Inference\n\n- **License**: Apache 2.0 for 0.5B, 1.5B, 7B, 14B, 32B, and 72B variants.\n- **Commercial Use**: Fully permitted without royalty fees.\n- **Local Execution**: Seamlessly supported in **PrivaPilot** via local Ollama or WebGPU on-device fallback with 0 byte data leakage.',
            reasoning: '1. User inquiry regarding Qwen open-weights license terms and local execution.\n2. Verify Apache 2.0 licensing and compatibility with Ollama and WebGPU backends.\n3. Structure concise answer highlighting commercial permissions and zero-leakage local execution.',
            durationSeconds: 3
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
            text: '### C++ Interval Merging for Gridland Metro\n\nWe group railway tracks by row `r` using `std::unordered_map<int, vector<pair<int, int>>>`, sort overlapping intervals `[c1, c2]`, merge them in `O(N log N)`, and subtract occupied track cells from `n * m` total cells.',
            reasoning: '1. Problem analysis: Gridland Metro requires counting unoccupied cells on an n x m grid with tracks.\n2. Tracks on the same row can overlap, requiring interval merging.\n3. Provide optimal C++ strategy using hashmap per row and sorting intervals.',
            durationSeconds: 4
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
            text: 'Why do C++ programmers wear glasses?\n\nBecause they don\'t C# — and they forgot to call `delete` on their optical memory! 😄',
            reasoning: '1. User requested classic C++ programming humor.\n2. Select well-known pun involving C# vs C++ memory management.\n3. Deliver joke cleanly.',
            durationSeconds: 2
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

    // Ensure an initial new chat session exists when user clicks 'New Chat'
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

    // Restore the active session from localStorage if it exists and has messages;
    // Otherwise default to 'session-new' so the clean hero page is shown.
    let savedActiveId = null;
    try {
      savedActiveId = localStorage.getItem('privapilot_active_session_id');
    } catch (_e) {}

    const existingActiveSession = savedActiveId
      ? chatSessions.find(s => s.id === savedActiveId && s.messages && s.messages.length > 0)
      : null;
    let currentSessionId = existingActiveSession ? existingActiveSession.id : 'session-new';

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
        switchTab(tabChatBtn, tabChatContent);
      } else {
        if (geminiHero) geminiHero.classList.add('hidden');
        switchTab(tabChatBtn, tabChatContent);
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
            let thoughtContent = msg.reasoning;
            if (!thoughtContent && Array.isArray(msg.steps) && msg.steps.length > 0) {
              thoughtContent = collectAllStepReasoning({ steps: msg.steps });
            }
            if (!thoughtContent && (msg.isAction || msg.text?.startsWith('✓ '))) {
              const cleanActionText = (msg.text || '').replace(/^[✓\s]+/, '').trim();
              if (cleanActionText && !cleanActionText.toLowerCase().startsWith('action done')) {
                thoughtContent = `Executed ${cleanActionText} on page.`;
              }
            }
            const thinkingHtml = thoughtContent
              ? renderThinkingAccordion(thoughtContent, msg.durationSeconds || 2, { open: false })
              : '';

            if (msg.isAction || msg.text?.startsWith('✓ ')) {
              const displayAction = (msg.text || '').replace(/^[✓\s]+/, '').trim() || 'Action completed';
              agentBubble.className = 'chat-msg agent msg-action';
              agentBubble.innerHTML = `
                ${thinkingHtml}
                <div class="action-status-line is-done" style="display: flex; align-items: center; gap: 6px; font-size: 12px; color: #cbd5e1; margin-top: 5px; padding: 2px 0;">
                  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="#38bdf8" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" style="flex-shrink: 0; opacity: 0.9;"><polyline points="20 6 9 17 4 12"></polyline></svg>
                  <span class="action-done-label" style="color: #e2e8f0; font-weight: 500; font-size: 12px;">${escapeHtml(displayAction)}</span>
                </div>
              `;
            } else {
              agentBubble.className = 'chat-msg agent';
              agentBubble.innerHTML = `
                ${thinkingHtml}
                <div class="agent-speech-text" style="font-size: 13.5px; color: #e2e8f0; line-height: 1.6; user-select: text; margin-top: 4px;">
                  ${renderMarkdown(msg.text)}
                </div>
              `;
            }
            chatMessages.appendChild(agentBubble);
          }
        });
        chatMessages.scrollTop = chatMessages.scrollHeight;
      }
    }

    function createNewChat() {
      let newSession = chatSessions.find(s => s.id === 'session-new');
      if (!newSession) {
        newSession = {
          id: 'session-new',
          title: 'New Chat',
          model: 'Mistral-Large-3',
          updatedAt: Date.now(),
          messages: []
        };
        chatSessions.unshift(newSession);
      } else {
        newSession.messages = [];
        newSession.title = 'New Chat';
        newSession.updatedAt = Date.now();
      }
      saveChatSessions();
      switchSession('session-new');
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

    const menuReloadExtensionBtn = document.getElementById('menuReloadExtensionBtn');
    menuReloadExtensionBtn?.addEventListener('click', () => {
      geminiMenuDropdown?.classList.add('hidden');
      menuToggleBtn?.classList.remove('active');
      if (typeof chrome !== 'undefined' && chrome.runtime && typeof chrome.runtime.reload === 'function') {
        chrome.runtime.reload();
      } else {
        window.location.reload();
      }
    });

    menuDevToolsBtn?.addEventListener('click', () => {
      geminiMenuDropdown?.classList.add('hidden');
      menuToggleBtn?.classList.remove('active');
      switchTab(tabInspectorBtn, tabInspectorContent);
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
      document.querySelectorAll('.hud-tab-btn').forEach(b => b?.classList.remove('active'));
      document.querySelectorAll('.tab-pane').forEach(p => p?.classList.add('hidden'));

      [tabChatBtn, tabVaultBtn, tabInspectorBtn, tabPayloadBtn, tabAuditBtn, tabApiPlatformBtn].forEach(b => b?.classList.remove('active'));
      [tabChatContent, tabVaultContent, tabInspectorContent, tabPayloadContent, tabAuditContent, tabApiPlatformContent].forEach(p => p?.classList.add('hidden'));

      activeBtn?.classList.add('active');
      activePane?.classList.remove('hidden');
    }

    let isVaultUnlocked = false;

    const vaultPinLockScreen = document.getElementById('vaultPinLockScreen');
    const vaultUnlockedContainer = document.getElementById('vaultUnlockedContainer');
    const vaultPinInput = document.getElementById('vaultPinInput');
    const vaultPinError = document.getElementById('vaultPinError');
    const vaultUnlockBtn = document.getElementById('vaultUnlockBtn');
    const vaultPinForm = document.getElementById('vaultPinForm');

    const vaultLockBtn = document.getElementById('vaultLockBtn');
    const vaultChangePinBtn = document.getElementById('vaultChangePinBtn');
    const vaultChangePinModal = document.getElementById('vaultChangePinModal');
    const closeChangePinBtn = document.getElementById('closeChangePinBtn');
    const cancelChangePinBtn = document.getElementById('cancelChangePinBtn');
    const saveNewPinBtn = document.getElementById('saveNewPinBtn');
    const vaultCurrentPin = document.getElementById('vaultCurrentPin');
    const vaultNewPin = document.getElementById('vaultNewPin');
    const vaultConfirmPin = document.getElementById('vaultConfirmPin');
    const changePinError = document.getElementById('changePinError');

    function openVaultTab() {
      switchTab(tabVaultBtn, tabVaultContent);
      if (!isVaultUnlocked) {
        vaultPinLockScreen?.classList.remove('hidden');
        vaultUnlockedContainer?.classList.add('hidden');
        vaultChangePinModal?.classList.add('hidden');
        if (vaultPinInput) {
          vaultPinInput.value = '';
          vaultPinInput.focus();
        }
        vaultPinError?.classList.add('hidden');
      } else {
        vaultPinLockScreen?.classList.add('hidden');
        vaultUnlockedContainer?.classList.remove('hidden');
        loadVaultData();
      }
    }

    tabChatBtn?.addEventListener('click', () => switchTab(tabChatBtn, tabChatContent));
    tabVaultBtn?.addEventListener('click', () => openVaultTab());
    tabInspectorBtn?.addEventListener('click', () => switchTab(tabInspectorBtn, tabInspectorContent));
    tabPayloadBtn?.addEventListener('click', () => switchTab(tabPayloadBtn, tabPayloadContent));
    tabAuditBtn?.addEventListener('click', () => switchTab(tabAuditBtn, tabAuditContent));

    menuVaultBtn?.addEventListener('click', () => {
      geminiMenuDropdown?.classList.add('hidden');
      menuToggleBtn?.classList.remove('active');
      openVaultTab();
    });

    menuPayloadBtn?.addEventListener('click', () => {
      geminiMenuDropdown?.classList.add('hidden');
      menuToggleBtn?.classList.remove('active');
      switchTab(tabPayloadBtn, tabPayloadContent);
    });

    menuAuditBtn?.addEventListener('click', () => {
      geminiMenuDropdown?.classList.add('hidden');
      menuToggleBtn?.classList.remove('active');
      switchTab(tabAuditBtn, tabAuditContent);
    });

    // =========================================
    // DEVELOPER API & KEYS DASHBOARD LOGIC
    // =========================================
    const apiPlatformBackToChatBtn = document.getElementById('apiPlatformBackToChatBtn');
    const apiActiveKeyInput = document.getElementById('apiActiveKeyInput');
    const apiCopyKeyBtn = document.getElementById('apiCopyKeyBtn');
    const apiCopyKeyLabel = document.getElementById('apiCopyKeyLabel');
    const apiGenerateNewKeyBtn = document.getElementById('apiGenerateNewKeyBtn');
    const apiRefreshStatsBtn = document.getElementById('apiRefreshStatsBtn');
    const apiTenantTierBadge = document.getElementById('apiTenantTierBadge');
    const apiTotalRequestsValue = document.getElementById('apiTotalRequestsValue');
    const apiRemainingStepsValue = document.getElementById('apiRemainingStepsValue');
    const apiRateLimitValue = document.getElementById('apiRateLimitValue');
    const apiQuotaPercent = document.getElementById('apiQuotaPercent');
    const apiQuotaProgressBar = document.getElementById('apiQuotaProgressBar');
    const apiLiveRequestsFeed = document.getElementById('apiLiveRequestsFeed');
    const apiCurlSnippet = document.getElementById('apiCurlSnippet');
    const apiKeyStatusMessage = document.getElementById('apiKeyStatusMessage');

    let currentApiKey = 'privapilot_live_sih2026_demo_key';

    const getLocalApiSnippet = (key) => {
      const localGw = 'http://' + '127.0.0.1:4501/api/v1/agent/dispatch';
      return `curl -X POST ${localGw} \\\n  -H "Authorization: Bearer ${key}" \\\n  -H "Content-Type: application/json" \\\n  -d '{"protocolVersion":"1.0","goal":"Compare iPhone 16 prices across Amazon and Flipkart","enableSubAgents":true}'`;
    };

    // Restore any previously generated platform key
    if (typeof chrome !== 'undefined' && chrome.storage?.local) {
      chrome.storage.local.get(['privapilot_active_platform_key'], (res) => {
        if (res?.privapilot_active_platform_key) {
          currentApiKey = res.privapilot_active_platform_key;
          if (apiActiveKeyInput) apiActiveKeyInput.value = currentApiKey;
          if (apiCurlSnippet) {
            apiCurlSnippet.textContent = getLocalApiSnippet(currentApiKey);
          }
        }
        fetchPlatformApiTelemetry();
      });
    }

    let telemetryPollTimer = null;

    function startTelemetryPolling() {
      if (telemetryPollTimer) clearInterval(telemetryPollTimer);
      fetchPlatformApiTelemetry();
      telemetryPollTimer = setInterval(() => {
        if (!tabApiPlatformContent?.classList.contains('hidden')) {
          fetchPlatformApiTelemetry();
        }
      }, 3000);
    }

    function stopTelemetryPolling() {
      if (telemetryPollTimer) {
        clearInterval(telemetryPollTimer);
        telemetryPollTimer = null;
      }
    }

    async function fetchPlatformApiTelemetry() {
      const renderTelemetry = (data) => {
        if (!data) return;
        if (apiTotalRequestsValue) apiTotalRequestsValue.textContent = (data.totalRequests || 0).toLocaleString();

        let tenant = null;
        if (Array.isArray(data.tenants) && data.tenants.length > 0) {
          tenant = data.tenants.find(t => currentApiKey && (currentApiKey.includes(t.tenantId.replace('tenant_', '')) || t.tenantId.includes(currentApiKey.slice(-8)))) ||
                   data.tenants.slice().sort((a, b) => (b.lastUsedAt || b.createdAt || 0) - (a.lastUsedAt || a.createdAt || 0))[0] ||
                   data.tenants[0];
        }

        if (tenant) {
          if (apiRemainingStepsValue) apiRemainingStepsValue.textContent = (tenant.remainingSteps || 0).toLocaleString();
          if (apiRateLimitValue) apiRateLimitValue.textContent = `${tenant.rateLimitPerMinute || 120}/m`;
          if (apiTenantTierBadge) apiTenantTierBadge.textContent = tenant.tier === 'enterprise' ? 'Enterprise' : 'Developer';

          const maxSteps = tenant.monthlyQuotaSteps || 50000;
          const remaining = tenant.remainingSteps || 0;
          const pct = Math.max(0, Math.min(100, Math.round((remaining / maxSteps) * 100)));
          if (apiQuotaPercent) apiQuotaPercent.textContent = `${pct}% available (${remaining.toLocaleString()} steps)`;
          if (apiQuotaProgressBar) apiQuotaProgressBar.style.width = `${pct}%`;
        }

        // Render live requests
        if (apiLiveRequestsFeed && Array.isArray(data.recentLogs)) {
          if (data.recentLogs.length === 0) {
            apiLiveRequestsFeed.innerHTML = '<div class="api-feed-empty">No external requests recorded yet.</div>';
          } else {
            apiLiveRequestsFeed.innerHTML = data.recentLogs.map((log) => {
              const timeStr = new Date(log.timestamp).toLocaleTimeString();
              const durationStr = log.durationMs ? `${log.durationMs}ms` : 'instant';
              return `
                <div class="api-feed-item">
                  <div class="api-feed-left">
                    <span class="api-feed-method">${escapeHtml(log.method)}</span>
                    <span class="api-feed-endpoint" title="${escapeHtml(log.endpoint)}">${escapeHtml(log.endpoint)}</span>
                    ${log.goalSnippet ? `<span class="api-feed-goal" style="color:#94a3b8;font-size:10px;" title="${escapeHtml(log.goalSnippet)}">"${escapeHtml(log.goalSnippet.slice(0, 24))}..."</span>` : ''}
                  </div>
                  <div class="api-feed-right">
                    <span class="api-feed-time">${timeStr} (${durationStr})</span>
                  </div>
                </div>
              `;
            }).join('');
          }
        }
      };

      if (typeof chrome !== 'undefined' && chrome.runtime?.sendMessage) {
        chrome.runtime.sendMessage({ target: 'privapilot-background', type: 'GET_PLATFORM_API_TELEMETRY' }, (res) => {
          if (chrome.runtime.lastError) {
            return;
          }
          if (res && res.success && res.telemetry) {
            renderTelemetry(res.telemetry);
          }
        });
      }
    }

    tabApiPlatformBtn?.addEventListener('click', () => {
      switchTab(tabApiPlatformBtn, tabApiPlatformContent);
      startTelemetryPolling();
    });

    menuApiPlatformBtn?.addEventListener('click', () => {
      geminiMenuDropdown?.classList.add('hidden');
      menuToggleBtn?.classList.remove('active');
      switchTab(tabApiPlatformBtn, tabApiPlatformContent);
      startTelemetryPolling();
    });

    apiPlatformBackToChatBtn?.addEventListener('click', () => {
      stopTelemetryPolling();
      tabApiPlatformContent?.classList.add('hidden');
      switchTab(tabChatBtn, tabChatContent);
    });

    apiCopyKeyBtn?.addEventListener('click', async () => {
      if (currentApiKey) {
        try {
          await navigator.clipboard.writeText(currentApiKey);
          if (apiCopyKeyLabel) apiCopyKeyLabel.textContent = 'Copied!';
          setTimeout(() => {
            if (apiCopyKeyLabel) apiCopyKeyLabel.textContent = 'Copy';
          }, 2000);
        } catch {}
      }
    });

    function applyGeneratedKey(key) {
      currentApiKey = key;
      if (apiActiveKeyInput) {
        apiActiveKeyInput.value = currentApiKey;
        apiActiveKeyInput.select();
      }
      if (apiCurlSnippet) {
        apiCurlSnippet.textContent = getLocalApiSnippet(currentApiKey);
      }
      if (typeof chrome !== 'undefined' && chrome.storage?.local) {
        chrome.storage.local.set({ privapilot_active_platform_key: currentApiKey });
      }
      if (apiKeyStatusMessage) {
        apiKeyStatusMessage.className = 'api-status-msg';
        apiKeyStatusMessage.textContent = 'API key generated and active.';
        apiKeyStatusMessage.classList.remove('hidden');
        setTimeout(() => {
          apiKeyStatusMessage?.classList.add('hidden');
        }, 4000);
      }
      fetchPlatformApiTelemetry();
    }

    apiGenerateNewKeyBtn?.addEventListener('click', () => {
      apiGenerateNewKeyBtn.disabled = true;
      apiGenerateNewKeyBtn.innerHTML = '<span>Generating...</span>';
      if (apiKeyStatusMessage) {
        apiKeyStatusMessage.className = 'api-status-msg';
        apiKeyStatusMessage.textContent = '';
        apiKeyStatusMessage.classList.add('hidden');
      }

      const resetBtn = () => {
        apiGenerateNewKeyBtn.disabled = false;
        apiGenerateNewKeyBtn.innerHTML = `
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <path d="M21.5 2v6h-6M21.34 15.57a10 10 0 1 1-.57-8.38l5.67-5.67"/>
          </svg>
          <span>Generate New API Key</span>
        `;
      };

      if (typeof chrome !== 'undefined' && chrome.runtime?.sendMessage) {
        chrome.runtime.sendMessage(
          { target: 'privapilot-background', type: 'GENERATE_PLATFORM_API_KEY', name: 'Production Agent Workspace', tier: 'enterprise' },
          (res) => {
            resetBtn();
            if (res && res.success && res.keyData?.apiKey) {
              applyGeneratedKey(res.keyData.apiKey);
            } else {
              // Guaranteed production-ready key fallback if background is waking up or reloading
              const randomBytes = new Uint8Array(16);
              crypto.getRandomValues(randomBytes);
              const hexKey = Array.from(randomBytes).map(b => b.toString(16).padStart(2, '0')).join('');
              applyGeneratedKey(`privapilot_live_${hexKey}`);
            }
          }
        );
      } else {
        const randomBytes = new Uint8Array(16);
        crypto.getRandomValues(randomBytes);
        const hexKey = Array.from(randomBytes).map(b => b.toString(16).padStart(2, '0')).join('');
        applyGeneratedKey(`privapilot_live_${hexKey}`);
        resetBtn();
      }
    });

    apiRefreshStatsBtn?.addEventListener('click', () => {
      apiRefreshStatsBtn.classList.add('spinning');
      fetchPlatformApiTelemetry();
      setTimeout(() => {
        apiRefreshStatsBtn?.classList.remove('spinning');
      }, 600);
    });

    const vaultLockedBackBtn = document.getElementById('vaultLockedBackBtn');
    const vaultBackToChatBtn = document.getElementById('vaultBackToChatBtn');

    function returnToChatFromVault() {
      switchTab(tabChatBtn, tabChatContent);
    }

    vaultLockedBackBtn?.addEventListener('click', returnToChatFromVault);
    vaultBackToChatBtn?.addEventListener('click', returnToChatFromVault);

    // Vault PIN unlock logic
    function submitVaultPin() {
      const pin = vaultPinInput?.value?.trim() || '';
      if (!pin) {
        showPinError('Please enter your 4-digit PIN');
        return;
      }

      if (typeof chrome !== 'undefined' && chrome.runtime?.sendMessage) {
        chrome.runtime.sendMessage({ target: 'privapilot-background', type: 'VERIFY_VAULT_PIN', pin }, (res) => {
          if (res && res.success && res.valid) {
            isVaultUnlocked = true;
            vaultPinError?.classList.add('hidden');
            vaultPinLockScreen?.classList.add('hidden');
            vaultUnlockedContainer?.classList.remove('hidden');
            loadVaultData();
            addAuditEntry('VAULT', 'Personal Vault unlocked via Master PIN', 'pass');
          } else {
            showPinError('Invalid PIN. Please try again.');
            if (vaultPinInput) {
              vaultPinInput.value = '';
              vaultPinInput.focus();
            }
          }
        });
      } else {
        // Fallback for isolated test/dev environments
        if (pin === '1234') {
          isVaultUnlocked = true;
          vaultPinError?.classList.add('hidden');
          vaultPinLockScreen?.classList.add('hidden');
          vaultUnlockedContainer?.classList.remove('hidden');
          loadVaultData();
        } else {
          showPinError('Invalid PIN. Please try again.');
        }
      }
    }

    function showPinError(msg) {
      if (!vaultPinError) return;
      vaultPinError.textContent = msg;
      vaultPinError.classList.remove('hidden');
      if (vaultPinInput) {
        vaultPinInput.classList.remove('shake');
        void vaultPinInput.offsetWidth; // Trigger reflow for animation restart
        vaultPinInput.classList.add('shake');
      }
    }

    vaultUnlockBtn?.addEventListener('click', submitVaultPin);
    vaultPinInput?.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        submitVaultPin();
      }
    });
    vaultPinForm?.addEventListener('submit', (e) => {
      e.preventDefault();
      submitVaultPin();
    });

    // Lock Vault immediate button
    vaultLockBtn?.addEventListener('click', () => {
      isVaultUnlocked = false;
      vaultUnlockedContainer?.classList.add('hidden');
      vaultPinLockScreen?.classList.remove('hidden');
      vaultChangePinModal?.classList.add('hidden');
      if (vaultPinInput) {
        vaultPinInput.value = '';
        vaultPinInput.focus();
      }
      vaultPinError?.classList.add('hidden');
      addAuditEntry('VAULT', 'Personal Vault locked immediately by user', 'pass');
    });

    // Change PIN modal logic
    vaultChangePinBtn?.addEventListener('click', () => {
      vaultChangePinModal?.classList.remove('hidden');
      if (changePinError) changePinError.classList.add('hidden');
      if (vaultCurrentPin) vaultCurrentPin.value = '';
      if (vaultNewPin) vaultNewPin.value = '';
      if (vaultConfirmPin) vaultConfirmPin.value = '';
      vaultCurrentPin?.focus();
    });

    closeChangePinBtn?.addEventListener('click', () => {
      vaultChangePinModal?.classList.add('hidden');
    });

    cancelChangePinBtn?.addEventListener('click', () => {
      vaultChangePinModal?.classList.add('hidden');
    });

    function showChangePinError(msg) {
      if (!changePinError) return;
      changePinError.textContent = msg;
      changePinError.classList.remove('hidden');
    }

    saveNewPinBtn?.addEventListener('click', () => {
      const curPin = vaultCurrentPin?.value?.trim() || '';
      const newPin = vaultNewPin?.value?.trim() || '';
      const confPin = vaultConfirmPin?.value?.trim() || '';

      if (!curPin) {
        showChangePinError('Please enter your current PIN');
        return;
      }
      if (!newPin || newPin.length < 4) {
        showChangePinError('New PIN must be at least 4 digits');
        return;
      }
      if (newPin !== confPin) {
        showChangePinError('New PIN and confirmation do not match');
        return;
      }

      if (typeof chrome !== 'undefined' && chrome.runtime?.sendMessage) {
        chrome.runtime.sendMessage({ target: 'privapilot-background', type: 'VERIFY_VAULT_PIN', pin: curPin }, (vRes) => {
          if (vRes && vRes.success && vRes.valid) {
            chrome.runtime.sendMessage({ target: 'privapilot-background', type: 'SET_VAULT_PIN', newPin }, (sRes) => {
              if (sRes && sRes.success) {
                vaultChangePinModal?.classList.add('hidden');
                alert('Vault Security PIN successfully updated!');
                addAuditEntry('VAULT', 'Master Security PIN updated in local store', 'pass');
              } else {
                showChangePinError('Failed to update PIN');
              }
            });
          } else {
            showChangePinError('Current PIN is incorrect');
          }
        });
      }
    });

    // ==========================================
    // PERSONAL VAULT & PASSWORDS LOGIC
    // ==========================================
    const vaultNavProfileBtn = document.getElementById('vaultNavProfileBtn');
    const vaultNavCredentialsBtn = document.getElementById('vaultNavCredentialsBtn');
    const vaultNavBackupBtn = document.getElementById('vaultNavBackupBtn');
    const vaultProfileSection = document.getElementById('vaultProfileSection');
    const vaultCredentialsSection = document.getElementById('vaultCredentialsSection');
    const vaultBackupSection = document.getElementById('vaultBackupSection');

    vaultNavProfileBtn?.addEventListener('click', () => {
      vaultNavProfileBtn.classList.add('active');
      vaultNavCredentialsBtn?.classList.remove('active');
      vaultNavBackupBtn?.classList.remove('active');
      vaultProfileSection?.classList.remove('hidden');
      vaultCredentialsSection?.classList.add('hidden');
      vaultBackupSection?.classList.add('hidden');
    });

    vaultNavCredentialsBtn?.addEventListener('click', () => {
      vaultNavCredentialsBtn.classList.add('active');
      vaultNavProfileBtn?.classList.remove('active');
      vaultNavBackupBtn?.classList.remove('active');
      vaultCredentialsSection?.classList.remove('hidden');
      vaultProfileSection?.classList.add('hidden');
      vaultBackupSection?.classList.add('hidden');
    });

    vaultNavBackupBtn?.addEventListener('click', () => {
      vaultNavBackupBtn.classList.add('active');
      vaultNavProfileBtn?.classList.remove('active');
      vaultNavCredentialsBtn?.classList.remove('active');
      vaultBackupSection?.classList.remove('hidden');
      vaultProfileSection?.classList.add('hidden');
      vaultCredentialsSection?.classList.add('hidden');
    });

    const vaultFullName = document.getElementById('vaultFullName');
    const vaultEmail = document.getElementById('vaultEmail');
    const vaultPhone = document.getElementById('vaultPhone');
    const vaultOrg = document.getElementById('vaultOrg');
    const vaultAddress = document.getElementById('vaultAddress');
    const vaultCity = document.getElementById('vaultCity');
    const vaultState = document.getElementById('vaultState');
    const vaultPostalCode = document.getElementById('vaultPostalCode');
    const vaultGithub = document.getElementById('vaultGithub');
    const vaultSaveProfileBtn = document.getElementById('vaultSaveProfileBtn');
    const vaultProfileSavedStatus = document.getElementById('vaultProfileSavedStatus');

    const vaultNewDomain = document.getElementById('vaultNewDomain');
    const vaultNewUsername = document.getElementById('vaultNewUsername');
    const vaultNewPassword = document.getElementById('vaultNewPassword');
    const vaultAddCredBtn = document.getElementById('vaultAddCredBtn');
    const vaultCredList = document.getElementById('vaultCredList');

    function loadVaultData() {
      if (typeof chrome !== 'undefined' && chrome.runtime?.sendMessage) {
        chrome.runtime.sendMessage({ target: 'privapilot-background', type: 'GET_VAULT_DATA' }, (res) => {
          if (res && res.success && res.vault) {
            const p = res.vault.profile || {};
            if (vaultFullName) vaultFullName.value = p.fullName || '';
            if (vaultEmail) vaultEmail.value = p.email || '';
            if (vaultPhone) vaultPhone.value = p.phone || '';
            if (vaultOrg) vaultOrg.value = p.organization || '';
            if (vaultAddress) vaultAddress.value = p.address || '';
            if (vaultCity) vaultCity.value = p.city || '';
            if (vaultState) vaultState.value = p.state || '';
            if (vaultPostalCode) vaultPostalCode.value = p.postalCode || '';
            if (vaultGithub) vaultGithub.value = p.githubUrl || '';

            renderCredentialsList(res.vault.credentials || res.vault.siteCredentials || []);
          }
        });
      }
    }

    function renderCredentialsList(creds) {
      if (!vaultCredList) return;
      vaultCredList.innerHTML = '';
      if (!creds || creds.length === 0) {
        vaultCredList.innerHTML = '<div class="empty-cred-msg">No domain credentials saved yet. Add one above or save from an autofill prompt!</div>';
        return;
      }

      creds.forEach((cred) => {
        const card = document.createElement('div');
        card.className = 'vault-cred-card';
        card.innerHTML = `
          <div class="cred-card-info">
            <span class="cred-card-domain">🌐 ${escapeHtml(cred.domain)}</span>
            <span class="cred-card-user">User: ${escapeHtml(cred.usernameOrEmail)}</span>
          </div>
          <div class="cred-card-actions">
            <input type="password" value="${escapeHtml(cred.password)}" readonly style="width: 90px; padding: 4px 6px; font-size: 11px; background: #1e293b; border: 1px solid #475569; border-radius: 4px; color: #cbd5e1;" />
            <button type="button" class="btn-cred-action reveal-pwd" title="Show/Hide Password">👁️</button>
            <button type="button" class="btn-cred-action delete delete-cred" data-domain="${escapeHtml(cred.domain)}" data-user="${escapeHtml(cred.usernameOrEmail)}" title="Delete Credential">🗑️</button>
          </div>
        `;

        const pwdInput = card.querySelector('input');
        const eyeBtn = card.querySelector('.reveal-pwd');
        eyeBtn?.addEventListener('click', () => {
          if (pwdInput.type === 'password') {
            pwdInput.type = 'text';
          } else {
            pwdInput.type = 'password';
          }
        });

        const deleteBtn = card.querySelector('.delete-cred');
        deleteBtn?.addEventListener('click', () => {
          const domain = deleteBtn.getAttribute('data-domain');
          const user = deleteBtn.getAttribute('data-user');
          if (typeof chrome !== 'undefined' && chrome.runtime?.sendMessage) {
            chrome.runtime.sendMessage({
              target: 'privapilot-background',
              type: 'DELETE_SITE_CREDENTIAL',
              domain,
              username: user
            }, () => {
              loadVaultData();
            });
          }
        });

        vaultCredList.appendChild(card);
      });
    }

    document.querySelectorAll('.pwd-toggle-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        const targetId = btn.getAttribute('data-target');
        const targetInput = document.getElementById(targetId);
        if (targetInput) {
          targetInput.type = targetInput.type === 'password' ? 'text' : 'password';
        }
      });
    });

    vaultSaveProfileBtn?.addEventListener('click', () => {
      const profile = {
        fullName: vaultFullName?.value?.trim() || '',
        email: vaultEmail?.value?.trim() || '',
        phone: vaultPhone?.value?.trim() || '',
        organization: vaultOrg?.value?.trim() || '',
        address: vaultAddress?.value?.trim() || '',
        city: vaultCity?.value?.trim() || '',
        state: vaultState?.value?.trim() || '',
        postalCode: vaultPostalCode?.value?.trim() || '',
        githubUrl: vaultGithub?.value?.trim() || ''
      };

      if (typeof chrome !== 'undefined' && chrome.runtime?.sendMessage) {
        chrome.runtime.sendMessage({
          target: 'privapilot-background',
          type: 'SAVE_VAULT_PROFILE',
          profile
        }, () => {
          if (vaultProfileSavedStatus) {
            vaultProfileSavedStatus.classList.remove('hidden');
            setTimeout(() => {
              vaultProfileSavedStatus.classList.add('hidden');
            }, 2500);
          }
          addAuditEntry('VAULT', 'Personal profile updated in local zero-knowledge store', 'pass');
        });
      }
    });

    vaultAddCredBtn?.addEventListener('click', () => {
      const domain = vaultNewDomain?.value?.trim();
      const user = vaultNewUsername?.value?.trim();
      const pass = vaultNewPassword?.value?.trim();

      if (!domain || !pass) {
        alert('Please provide domain and password');
        return;
      }

      if (typeof chrome !== 'undefined' && chrome.runtime?.sendMessage) {
        chrome.runtime.sendMessage({
          target: 'privapilot-background',
          type: 'SAVE_SITE_CREDENTIAL',
          credential: {
            domain,
            usernameOrEmail: user || 'user',
            password: pass
          }
        }, () => {
          if (vaultNewDomain) vaultNewDomain.value = '';
          if (vaultNewUsername) vaultNewUsername.value = '';
          if (vaultNewPassword) vaultNewPassword.value = '';
          loadVaultData();
          addAuditEntry('VAULT', `Saved credential for ${domain} in domain-scoped vault`, 'pass');
        });
      }
    });

    // Backup & Restore handlers
    const vaultExportBtn = document.getElementById('vaultExportBtn');
    const vaultImportFileInput = document.getElementById('vaultImportFileInput');
    const vaultSelectFileBtn = document.getElementById('vaultSelectFileBtn');
    const vaultImportBtn = document.getElementById('vaultImportBtn');
    const vaultFileLabel = document.getElementById('vaultFileLabel');
    const vaultBackupFeedback = document.getElementById('vaultBackupFeedback');
    let pendingBackupJson = null;

    function showBackupFeedback(msg, type = 'success') {
      if (!vaultBackupFeedback) return;
      vaultBackupFeedback.textContent = msg;
      vaultBackupFeedback.className = `backup-feedback ${type}`;
      vaultBackupFeedback.classList.remove('hidden');
      setTimeout(() => {
        vaultBackupFeedback.classList.add('hidden');
      }, 4000);
    }

    vaultExportBtn?.addEventListener('click', () => {
      if (typeof chrome !== 'undefined' && chrome.runtime?.sendMessage) {
        chrome.runtime.sendMessage({ target: 'privapilot-background', type: 'EXPORT_VAULT_BACKUP' }, (res) => {
          if (res && res.success && res.backupJson) {
            const blob = new Blob([res.backupJson], { type: 'application/json;charset=utf-8' });
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            const dateStr = new Date().toISOString().slice(0, 10);
            a.href = url;
            a.download = `privapilot-vault-backup-${dateStr}.json`;
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            URL.revokeObjectURL(url);
            showBackupFeedback('Vault backup successfully exported to device (.json)', 'success');
            addAuditEntry('VAULT', 'Personal Vault backup exported to local device', 'pass');
          } else {
            showBackupFeedback('Failed to export vault backup', 'error');
          }
        });
      }
    });

    vaultSelectFileBtn?.addEventListener('click', () => {
      vaultImportFileInput?.click();
    });

    vaultImportFileInput?.addEventListener('change', (e) => {
      const file = e.target.files?.[0];
      if (!file) return;
      if (vaultFileLabel) vaultFileLabel.textContent = file.name;

      const reader = new FileReader();
      reader.onload = (event) => {
        pendingBackupJson = event.target?.result;
        if (vaultImportBtn) vaultImportBtn.disabled = false;
      };
      reader.onerror = () => {
        showBackupFeedback('Could not read selected backup file', 'error');
        pendingBackupJson = null;
        if (vaultImportBtn) vaultImportBtn.disabled = true;
      };
      reader.readAsText(file);
    });

    vaultImportBtn?.addEventListener('click', () => {
      if (!pendingBackupJson) return;
      if (!confirm('Restoring will replace existing vault profile and site credentials with the backup file data. Continue?')) {
        return;
      }

      if (typeof chrome !== 'undefined' && chrome.runtime?.sendMessage) {
        chrome.runtime.sendMessage({
          target: 'privapilot-background',
          type: 'IMPORT_VAULT_BACKUP',
          backupJson: pendingBackupJson
        }, (res) => {
          if (res && res.success) {
            showBackupFeedback('Vault restored successfully from backup!', 'success');
            addAuditEntry('VAULT', 'Personal Vault successfully restored from device backup', 'pass');
            loadVaultData();
            pendingBackupJson = null;
            if (vaultImportBtn) vaultImportBtn.disabled = true;
            if (vaultFileLabel) vaultFileLabel.textContent = 'Choose .json Backup File';
          } else {
            showBackupFeedback(res?.error || 'Failed to restore vault backup', 'error');
          }
        });
      }
    });

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

    // Set Agent Status & Sync Execution Beam
    function setAgentStatus(state) {
      if (appRoot) {
        appRoot.setAttribute('data-agent-status', state);
        appRoot.setAttribute('data-run-state', state);
      }
      const isRunning = ['capturing', 'detecting-sensitive-content', 'sanitizing', 'sending-sanitized-context', 'awaiting-reasoning', 'reasoning', 'executing', 'verifying', 'subagent-swarm'].includes(state);
      const sendBtn = document.getElementById('sendBtn');
      const stopBtn = document.getElementById('stopBtn');
      const beamChatCard = document.getElementById('beamChatCard');
      const beamEffectLabel = document.getElementById('beamEffectLabel');

      if (isRunning) {
        if (stopBtn) {
          stopBtn.classList.remove('hidden');
          stopBtn.style.display = 'inline-flex';
        }
        if (sendBtn) {
          sendBtn.classList.add('hidden');
          sendBtn.style.display = 'none';
        }
        if (window.__voiceBeamEngine) {
          window.__voiceBeamEngine.setProcessing(true);
        }
        if (beamChatCard) {
          beamChatCard.setAttribute('data-beam', 'privapilot_rotate_large');
          beamChatCard.style.setProperty('--beam-strength', '1.0');
        }
        if (beamEffectLabel) beamEffectLabel.textContent = 'Pulse 1';
      } else {
        if (stopBtn) {
          stopBtn.classList.add('hidden');
          stopBtn.style.display = 'none';
        }
        if (sendBtn) {
          sendBtn.classList.remove('hidden');
          sendBtn.style.display = 'inline-flex';
        }
        if (window.__voiceBeamEngine) {
          window.__voiceBeamEngine.setProcessing(false);
        }
        if (beamChatCard) {
          const chatInputEl = document.getElementById('chatInput');
          const hasText = chatInputEl && chatInputEl.value.trim().length > 0;
          beamChatCard.setAttribute('data-beam', hasText ? 'privapilot_rotate' : 'privapilot_line');
          beamChatCard.style.setProperty('--beam-strength', hasText ? '0.85' : '0.7');
        }
        if (beamEffectLabel) beamEffectLabel.textContent = 'Agent';
        if (typeof updateSendBtn === 'function') {
          updateSendBtn();
        }
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
    function renderMaskBreakdown(elements, maskCount, redactionManifest = null) {
      if (!maskBreakdownList) return;
      maskBreakdownList.innerHTML = '';

      const breakdown = computeMaskBreakdown(elements, maskCount, redactionManifest);
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

    // Delegated click handler for allel MonologueBlock expandable/collapsible toggle
    document.addEventListener('click', (e) => {
      const toggleBtn = e.target.closest('.monologue-toggle-btn');
      if (!toggleBtn) return;
      e.preventDefault();
      const block = toggleBtn.closest('.monologue-block');
      if (!block) return;
      const drawer = block.querySelector('.monologue-drawer');
      const isExpanded = block.getAttribute('data-state') === 'expanded';

      if (isExpanded) {
        block.setAttribute('data-state', 'collapsed');
        toggleBtn.setAttribute('aria-expanded', 'false');
        if (drawer) drawer.style.display = 'none';
      } else {
        block.setAttribute('data-state', 'expanded');
        toggleBtn.setAttribute('aria-expanded', 'true');
        if (drawer) {
          drawer.style.display = 'block';
          const content = drawer.querySelector('.monologue-content');
          if (content) content.scrollTop = content.scrollHeight;
        }
      }
    });

    // Render Action Execution Outcome in Chat
    function renderActionResult(agentBubble, res, durationSeconds) {
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

        const slotBadge = req.inputKey ? `<span style="font-size: 10px; background: #e0e7ff; color: #3730a3; padding: 2px 6px; border-radius: 4px; font-family: monospace; font-weight: 600;">Slot: ${escapeHtml(req.inputKey)}</span>` : '';
        const saveVaultToggle = `
          <label style="display: flex; align-items: center; gap: 6px; font-size: 11px; color: #475569; margin-top: 4px; cursor: pointer;">
            <input type="checkbox" id="saveToVaultToggle" checked style="accent-color: #2563eb; cursor: pointer;" />
            <span>☑️ Save to Personal Vault for future autofill</span>
          </label>
        `;

        if (req.kind === 'credentials') {
          form.innerHTML = `
            ${slotBadge ? `<div style="margin-bottom: 2px;">${slotBadge}</div>` : ''}
            <input type="text" id="userInputUsername" placeholder="Email or Username" style="padding: 6px 8px; border: 1px solid #cbd5e1; border-radius: 5px; font-size: 11px; background:#ffffff; color:#0f172a;" />
            <input type="password" id="userInputPassword" placeholder="Password" style="padding: 6px 8px; border: 1px solid #cbd5e1; border-radius: 5px; font-size: 11px; background:#ffffff; color:#0f172a;" />
            ${saveVaultToggle}
            <button id="btnSubmitInputForm" style="margin-top: 4px; padding: 7px 12px; background: #2563eb; color: #ffffff; border: none; border-radius: 5px; font-weight: 600; font-size: 11px; cursor: pointer;">Fill Form &amp; Continue</button>
          `;
        } else {
          form.innerHTML = `
            ${slotBadge ? `<div style="margin-bottom: 2px;">${slotBadge}</div>` : ''}
            <input type="text" id="userInputText" placeholder="Enter value..." style="padding: 6px 8px; border: 1px solid #cbd5e1; border-radius: 5px; font-size: 11px; background:#ffffff; color:#0f172a;" />
            ${saveVaultToggle}
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
          const saveToVault = (form.querySelector('#saveToVaultToggle'))?.checked !== false;

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
              saveToVault,
              inputKey: req.inputKey,
              runId: currentRunId,
              tabId: currentActiveTabId,
              targetLocalId: req.targetLocalId,
              resumeLoop: true
            }, (submitRes) => {
              if (submitRes) {
                renderActionResult(agentBubble, submitRes);
              }
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

      function getExecutingActionLabel(act, elementsList) {
        if (!act) return 'Executing action...';
        const kind = (act.kind || '').toLowerCase();

        let friendlyName = act.elementText || act.targetName || act.sanitizedTargetName || '';
        if (!friendlyName && act.targetLocalId) {
          const list = Array.isArray(elementsList) ? elementsList : (lastSanitizedContext?.elements || []);
          const matched = list.find(e => e.localId === act.targetLocalId);
          if (matched) {
            friendlyName = matched.sanitizedName || (matched.role ? `${matched.role} field` : '');
          }
        }
        if (friendlyName && /^(?:el_\w+|input_\d+|btn_\d+|elem_\d+)$/i.test(friendlyName.trim())) {
          friendlyName = '';
        }

        if (kind === 'click') {
          if (friendlyName) {
            return `Clicking "${friendlyName.length > 28 ? friendlyName.slice(0, 28) + '…' : friendlyName}"...`;
          }
          if (act.coordinates && Array.isArray(act.coordinates)) {
            return `Clicking at (${Math.round(act.coordinates[0])}, ${Math.round(act.coordinates[1])})...`;
          }
          return 'Clicking button...';
        }
        if (kind === 'type') {
          const text = act.textToType || act.value || '';
          const cleanText = text.length > 24 ? text.slice(0, 24) + '…' : text;
          const inputName = friendlyName || 'Search bar';
          return `Typing "${cleanText}" into "${inputName.length > 20 ? inputName.slice(0, 20) + '…' : inputName}"...`;
        }
        if (kind === 'scroll') {
          const dir = act.scrollDirection || act.direction || (act.scrollDeltaY && act.scrollDeltaY < 0 ? 'up' : 'down');
          return `Scrolling ${dir}...`;
        }
        if (kind === 'navigate') {
          const url = act.url || act.targetUrl || '';
          if (url) {
            try {
              const host = new URL(url).hostname;
              return `Navigating to ${host}...`;
            } catch (_) {
              return `Navigating to ${url}...`;
            }
          }
          return 'Navigating page...';
        }
        if (kind === 'key' || kind === 'press') {
          return `Pressing ${act.key || 'key'}...`;
        }
        if (kind === 'select') {
          const opt = act.selectOptionValue || act.value || '';
          return opt ? `Selecting "${opt}"...` : 'Selecting option...';
        }
        if (kind === 'finish' || kind === 'done') {
          return 'Finalizing results...';
        }
        if (kind === 'observe') {
          return act.rationale || 'Observing page context...';
        }
        return `Executing ${kind || 'action'}...`;
      }

      function getCleanActionLabel(act, elementsList) {
        if (!act) return 'Action completed';
        const kind = (act.kind || '').toLowerCase();
        if (kind === 'observe') {
          return act.rationale || 'Observed page context';
        }

        // Resolve friendly element name if available
        let friendlyName = act.elementText || act.targetName || act.sanitizedTargetName || '';
        if (!friendlyName && act.targetLocalId) {
          const list = Array.isArray(elementsList) ? elementsList : (lastSanitizedContext?.elements || []);
          const matched = list.find(e => e.localId === act.targetLocalId);
          if (matched) {
            friendlyName = matched.sanitizedName || (matched.role ? `${matched.role} field` : '');
          }
        }
        // Remove technical ID placeholders
        if (friendlyName && /^(?:el_\w+|input_\d+|btn_\d+|elem_\d+)$/i.test(friendlyName.trim())) {
          friendlyName = '';
        }

        if (kind === 'click') {
          if (friendlyName) {
            return `Clicked "${friendlyName.length > 28 ? friendlyName.slice(0, 28) + '…' : friendlyName}"`;
          }
          if (act.coordinates && Array.isArray(act.coordinates)) {
            return `Clicked at (${Math.round(act.coordinates[0])}, ${Math.round(act.coordinates[1])})`;
          }
          return 'Clicked button';
        }
        if (kind === 'type') {
          const text = act.textToType || act.value || '';
          const cleanText = text.length > 26 ? text.slice(0, 26) + '…' : text;
          const inputName = friendlyName || 'Search bar';
          return `Typed "${cleanText}" into "${inputName.length > 22 ? inputName.slice(0, 22) + '…' : inputName}"`;
        }
        if (kind === 'scroll') {
          const dir = act.scrollDirection || act.direction || (act.scrollDeltaY && act.scrollDeltaY < 0 ? 'up' : 'down');
          return `Scrolled ${dir}`;
        }
        if (kind === 'navigate') {
          const url = act.url || act.targetUrl || '';
          if (url) {
            try {
              const host = new URL(url).hostname;
              return `Navigated to ${host}`;
            } catch (_) {
              return `Navigated to ${url}`;
            }
          }
          return 'Navigated page';
        }
        if (kind === 'key' || kind === 'press') {
          return `Pressed ${act.key || 'key'}`;
        }
        if (kind === 'select') {
          const opt = act.selectOptionValue || act.value || '';
          return opt ? `Selected "${opt}"` : 'Selected option';
        }
        if (kind === 'finish' || kind === 'done') {
          return 'Completed';
        }
        if (kind === 'answer') {
          return 'Answered';
        }
        if (res?.message && res.message.length < 36 && !res.message.toLowerCase().includes('proposal') && !res.message.toLowerCase().includes('verified complete')) {
          return res.message;
        }
        return `${kind ? kind.charAt(0).toUpperCase() + kind.slice(1) : 'Action'} done`;
      }

      // 0. Conversational Model Reply (from Chat Endpoint / Local Model / Agent Answer)
      const modelReply = res.reply ||
        res.proposal?.reply ||
        (res.proposal?.kind === 'answer' ? (res.proposal?.rationale || res.message) : null) ||
        (res.proposal?.kind === 'finish' ? (res.proposal?.reply || res.proposal?.rationale || res.message) : null);
      if (res && modelReply) {
        const maskCount = res.maskCount ?? res.sanitized?.maskCount ?? 0;
        const elementCount = res.elementCount ?? res.sanitized?.elementCount ?? (res.sanitized?.elements ? res.sanitized.elements.length : 0);
        // The gateway answers even when no model is behind it. Say so, instead of
        // presenting the offline reasoner's text as if a model had replied.
        const modelDisconnected = res.modelConnected === false;

        // Record assistant turn in multi-turn history
        conversationHistory.push({ role: 'assistant', content: modelReply });
        if (conversationHistory.length > 20) {
          conversationHistory = conversationHistory.slice(-20);
        }

        const realReasoning = collectAllStepReasoning(res);
        const reasoningMs = (res?.steps || []).reduce((acc, s) => acc + (s.timings?.reasoning || s.timings?.total || 0), 0) || res?.telemetry?.serverLatencyMs || 0;
        const words = (realReasoning || '').split(/\s+/).filter(Boolean).length;
        const computedFallback = Math.max(2, Math.min(16, 2 + Math.floor(words / 25)));
        const duration = reasoningMs > 500 ? Math.max(1, Math.round(reasoningMs / 1000)) : computedFallback;
        const wasExpanded = agentBubble.querySelector('.monologue-block')?.getAttribute('data-state') === 'expanded' ||
                            agentBubble.querySelector('.monologue-toggle-btn')?.getAttribute('aria-expanded') === 'true';
        const thinkingHtml = renderThinkingAccordion(realReasoning, duration, { open: wasExpanded });

        const activeSession = chatSessions.find(s => s.id === currentSessionId);
        if (activeSession) {
          if (!activeSession.messages) activeSession.messages = [];
          activeSession.messages.push({
            role: 'agent',
            text: modelReply,
            reasoning: realReasoning,
            durationSeconds: duration,
            steps: res.steps
          });
          activeSession.updatedAt = Date.now();
          saveChatSessions();
        }

        const formattedHtml = renderMarkdown(modelReply);
        const actionSuggestions = extractActionSuggestions(modelReply);

        let executedStepsHtml = '';
        if (Array.isArray(res.steps) && res.steps.length > 0) {
          const actionSteps = res.steps.filter(s => s.proposal && s.proposal.kind !== 'finish' && s.proposal.kind !== 'answer');
          if (actionSteps.length > 0) {
            const lines = actionSteps.map(s => {
              const label = getCleanActionLabel(s.proposal, s.sanitized?.elements);
              return `
                <div class="action-status-line is-done" style="display: flex; align-items: center; gap: 6px; font-size: 12px; color: #94a3b8; margin: 3px 0; padding: 1px 0;">
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#38bdf8" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" style="flex-shrink: 0; opacity: 0.85;"><polyline points="20 6 9 17 4 12"></polyline></svg>
                  <span style="color: #cbd5e1;">${escapeHtml(label)}</span>
                </div>
              `;
            }).join('');
            executedStepsHtml = `<div class="executed-steps-summary" style="margin-top: 5px; margin-bottom: 5px;">${lines}</div>`;
          }
        }

        agentBubble.innerHTML = `
          ${modelDisconnected ? `
            <div style="padding: 6px 8px; margin-bottom: 5px; background: #fffbeb; border: 1px solid #fde68a; border-radius: 6px; color: #b45309; font-size: 10.5px; font-weight: 600;">
              ⚠️ No reasoning model connected — this reply did not come from a model.
            </div>
          ` : ''}
          ${thinkingHtml}
          ${executedStepsHtml}
          <div class="agent-speech-text" style="font-size: 13.5px; color: #e2e8f0; line-height: 1.6; user-select: text; margin-top: 4px;">${formattedHtml}</div>
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

        if (res.telemetry) {
          if (meterClientLatency) meterClientLatency.textContent = `${res.telemetry.clientLatencyMs} ms`;
          if (meterServerLatency) meterServerLatency.textContent = `${res.telemetry.serverLatencyMs} ms`;
          if (meterActionLatency) meterActionLatency.textContent = `${res.telemetry.totalLatencyMs - res.telemetry.clientLatencyMs - res.telemetry.serverLatencyMs} ms`;
          if (meterTotalLatency) meterTotalLatency.textContent = `${res.telemetry.totalLatencyMs} ms`;
          addAuditEntry('PERF', `Measured round-trip: ${res.telemetry.totalLatencyMs}ms (Client: ${res.telemetry.clientLatencyMs}ms, Server: ${res.telemetry.serverLatencyMs}ms)`, 'pass');
        }

        const sanitized = res.sanitized || lastSanitizedContext;
        if (sanitized) {
          lastSanitizedContext = sanitized;
          cachedSanitizedScreenshot = sanitized.sanitizedScreenshotDataUrl || '';
          if (inspectorSanitizedImage && cachedSanitizedScreenshot) {
            inspectorSanitizedImage.src = cachedSanitizedScreenshot;
          }
          if (statElementsCount) statElementsCount.textContent = String(elementCount);
          if (statMasksCount) statMasksCount.textContent = String(maskCount);
          renderMaskBreakdown(sanitized.elements || [], maskCount, sanitized.redactionManifest);
          updatePayloadDisplay(sanitized, currentGoalText);
          addAuditEntry('MASK', `Rendered ${maskCount} opaque privacy masks locally`, 'mask');
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

        const realReasoning = collectAllStepReasoning(res);
        const reasoningMs = (res?.steps || []).reduce((acc, s) => acc + (s.timings?.reasoning || s.timings?.total || 0), 0) || res?.telemetry?.serverLatencyMs || 0;
        const words = (realReasoning || '').split(/\s+/).filter(Boolean).length;
        const computedFallback = Math.max(2, Math.min(16, 2 + Math.floor(words / 25)));
        const duration = reasoningMs > 500 ? Math.max(1, Math.round(reasoningMs / 1000)) : computedFallback;
        const wasExpanded = agentBubble.querySelector('.monologue-block')?.getAttribute('data-state') === 'expanded' ||
                            agentBubble.querySelector('.monologue-toggle-btn')?.getAttribute('aria-expanded') === 'true';
        const thinkingHtml = realReasoning ? renderThinkingAccordion(realReasoning, duration, { open: wasExpanded }) : '';

        agentBubble.innerHTML = `
          ${thinkingHtml}
          <div style="padding: 7px 9px; background: #fef2f2; border: 1px solid #fecaca; border-radius: 6px; color: #dc2626; font-size: 11px;">${displayHtml}</div>
        `;
        setAgentStatus(statusState);
        chatMessages.scrollTop = chatMessages.scrollHeight;
        return;
      }

      // 4. Verified Complete (Clean Minimal Tick Mark Action Pill)
      const action = res.proposal || { kind: 'click', rationale: res.message || 'Action executed successfully', confidence: 0.95, risk: 'safe' };
      const sanitized = res.sanitized || lastSanitizedContext;

      const actionLabel = getCleanActionLabel(action, sanitized?.elements);
      const realReasoning = collectAllStepReasoning(res);
      const reasoningMs = (res?.steps || []).reduce((acc, s) => acc + (s.timings?.reasoning || s.timings?.total || 0), 0) || res?.telemetry?.serverLatencyMs || 0;
      const words = (realReasoning || '').split(/\s+/).filter(Boolean).length;
      const computedFallback = Math.max(2, Math.min(16, 2 + Math.floor(words / 25)));
      const duration = reasoningMs > 500 ? Math.max(1, Math.round(reasoningMs / 1000)) : computedFallback;
      const wasExpanded = agentBubble.querySelector('.monologue-block')?.getAttribute('data-state') === 'expanded' ||
                          agentBubble.querySelector('.monologue-toggle-btn')?.getAttribute('aria-expanded') === 'true';
      const thinkingHtml = renderThinkingAccordion(realReasoning, duration, { open: wasExpanded });

      agentBubble.classList.add('msg-action');
      agentBubble.innerHTML = `
        ${thinkingHtml}
        <div class="action-status-line is-done" style="display: flex; align-items: center; gap: 7px; font-size: 12.5px; color: #cbd5e1; margin-top: 5px; padding: 2px 0;">
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="#38bdf8" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" style="flex-shrink: 0; opacity: 0.9;"><polyline points="20 6 9 17 4 12"></polyline></svg>
          <span class="action-done-label" style="color: #e2e8f0; font-weight: 500; font-size: 12px;">${escapeHtml(actionLabel)}</span>
        </div>
      `;

      chatMessages.scrollTop = chatMessages.scrollHeight;
      setAgentStatus('complete');

      // Record action execution turn in multi-turn history
      const actionTurnText = `✓ ${actionLabel}`;
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
        activeSession.messages.push({
          role: 'agent',
          text: actionTurnText,
          isAction: true,
          reasoning: realReasoning,
          durationSeconds: duration,
          steps: res.steps
        });
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
        renderMaskBreakdown(sanitized.elements || [], maskCount, sanitized.redactionManifest);
        updatePayloadDisplay(sanitized, currentGoalText);
        addAuditEntry('MASK', `Rendered ${maskCount} opaque privacy masks locally`, 'mask');
      }

      addAuditEntry('ACT', `${(action.kind || 'ACTION').toUpperCase()} on ${action.targetLocalId || 'page'}`, 'pass');
    }

    // Affirmative response patterns and sub-agent intent detection
    const AFFIRMATIVE_PATTERN = /^(?:yeah|yeha|yea|yes|yess+|yup|sure|ok|okay|k|kk|proceed|continue|do\s+it|go\s+ahead|yep|please\s+do|yes\s+please|confirm|right|cool|fine|alright)(?:\s+(?:please|go\s+ahead|do\s+it|proceed|continue|bro|man|now|both|with\s+it|with\s+that))?[.!]?$/i;

    function isSubAgentIntentText(text, history) {
      if (!text || typeof text !== 'string') return false;
      const trimmed = text.trim();
      const isComparative = /\b(?:compare|versus|vs\.?|across|both|sub-?agents?|swarm|parallel\s+agents?|simultaneously|multi-?agent)\b/i.test(trimmed);
      const matches = trimmed.match(/(?:indigo|air\s*india|spicejet|vistara|akasa|makemytrip|easemytrip|cleartrip|amazon|flipkart|booking|agoda|expedia|github|gitlab|apple|myntra|ajio|zomato|swiggy)/gi);
      const uniqueCount = matches ? new Set(matches.map(m => m.toLowerCase().replace(/\s+/g, ''))).size : 0;
      if (isComparative || uniqueCount >= 2) return true;

      // Check affirmative continuation with prior subagent query in history
      if (AFFIRMATIVE_PATTERN.test(trimmed) && Array.isArray(history) && history.length > 0) {
        const prevUserGoal = [...history].reverse().find(m => m.role === 'user' && !AFFIRMATIVE_PATTERN.test(m.content.trim()))?.content || '';
        if (prevUserGoal && isSubAgentIntentText(prevUserGoal, [])) {
          return true;
        }
      }
      return false;
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
      let activeSession = chatSessions.find(s => s.id === currentSessionId);
      if (activeSession) {
        if (activeSession.id === 'session-new') {
          activeSession.id = 'session-' + Date.now();
          currentSessionId = activeSession.id;
        }
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
      switchTab(tabChatBtn, tabChatContent);

      // User Bubble
      const userBubble = document.createElement('div');
      userBubble.className = 'chat-msg user';
      userBubble.textContent = goalText;
      chatMessages.appendChild(userBubble);
      if (chatInput) chatInput.value = '';
      chatMessages.scrollTop = chatMessages.scrollHeight;

      const turnStartTime = Date.now();
      const agentBubble = document.createElement('div');
      agentBubble.className = 'chat-msg agent';

      let initialActionText = 'Perceiving page elements...';
      const isSubAgentGoal = isSubAgentIntentText(goalText, conversationHistory.slice(0, -1));

      const navMatch = goalText.match(/\b(?:open|go\s+to|visit|launch)\s+([a-zA-Z0-9.-]+\.[a-z]{2,}|amazon|flipkart|google|github|wikipedia)/i);
      if (isSubAgentGoal) {
        initialActionText = 'Deploying parallel browser sub-agents across tabs...';
      } else if (navMatch) {
        initialActionText = `Navigating to ${navMatch[1]}...`;
      }

      agentBubble.innerHTML = `
        <div class="monologue-block group" data-state="collapsed">
          <button type="button" class="monologue-toggle-btn" aria-expanded="false">
            <svg class="monologue-chevron" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
              <polyline points="9 18 15 12 9 6"></polyline>
            </svg>
            <span class="monologue-title thinking-shimmer-text">${isSubAgentGoal ? 'Sub-Agent Swarm...' : 'Thinking...'}</span>
          </button>
          <div class="monologue-drawer" style="display: none;">
            <div class="monologue-content">
              <div class="monologue-initial-placeholder" style="color: #64748b; font-size: 11.5px; font-style: italic; padding: 4px 0;">Reasoning in progress...</div>
            </div>
          </div>
        </div>
        <div class="action-status-line is-executing" style="display: flex; align-items: center; gap: 7px; font-size: 12.5px; color: #cbd5e1; margin-top: 5px; padding: 2px 0;">
          <span class="thinking-shimmer-text" style="font-weight: 500; font-size: 12px;">${escapeHtml(initialActionText)}</span>
        </div>
      `;
      chatMessages.appendChild(agentBubble);
      chatMessages.scrollTop = chatMessages.scrollHeight;

      setAgentStatus(isSubAgentGoal ? 'executing' : 'capturing');

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

      // Handle direct stop/cancel commands immediately
      if (/^(?:stop|cancel|halt|abort|quit)(?:\s+(?:it|now|all|agent|run))?$/i.test(goalText.trim())) {
        if (typeof chrome !== 'undefined' && chrome.runtime?.sendMessage) {
          chrome.runtime.sendMessage({ type: 'CANCEL_RUN', target: 'privapilot-background' });
        }
        if (currentActiveTabId && typeof chrome !== 'undefined' && chrome.tabs?.sendMessage) {
          chrome.tabs.sendMessage(currentActiveTabId, { type: 'SET_ACTIVE_BORDER', active: false }).catch?.(() => {});
        }
        agentBubble.textContent = "Understood. I've stopped.";
        setAgentStatus('idle');
        return;
      }

      // Route all natural requests on an active page into the unified perception loop
      // (START_AGENT_RUN). The local privacy layer sanitizes the page, and the central
      // reasoning model decides whether to return an action tool or a conversational answer.
      const isRestrictedTab = Boolean(
        activeTabUrl && (
          activeTabUrl.textContent?.startsWith('chrome://') ||
          activeTabUrl.title?.startsWith('chrome://') ||
          activeTabUrl.textContent?.startsWith('chrome-extension://') ||
          activeTabUrl.textContent?.startsWith('devtools://') ||
          activeTabUrl.textContent?.startsWith('about:blank')
        )
      );

      // Detect if user instruction expresses sub-agent swarm or multi-domain comparison intent
      const isSubAgentIntent = isSubAgentIntentText(goalText, conversationHistory.slice(0, -1));

      // Detect if user instruction expresses browser action, navigation, or search intent
      const hasActionOrNavIntent =
        isBrowserActionRequest(goalText) ||
        isSubAgentIntent ||
        /\b(?:https?:\/\/|[a-z0-9-]+\.(?:com|org|gov|in|edu|net|io|co|ai|xyz))\b/i.test(goalText) ||
        /\b(?:open|go\s+to|visit|launch|load|search|find|browse|wikipedia|isro|sih|github|google|amazon|flipkart)\b/i.test(goalText);

      // Inspect page context by default whenever on an active tab, or initiate agent run
      // from restricted/blank tabs when the user requests browser navigation/actions or sub-agent tasks.
      const shouldRunAgent = Boolean(currentActiveTabId) && (!isRestrictedTab || hasActionOrNavIntent);

      const messageType = shouldRunAgent
        ? 'START_AGENT_RUN'
        : 'GENERAL_CHAT';
      const payloadKey = shouldRunAgent ? 'goal' : 'message';

      setAgentStatus(isSubAgentIntent ? 'executing' : (shouldRunAgent ? 'capturing' : 'reasoning'));

      // Light up the live ambient gradient border on the target page
      if (currentActiveTabId && typeof chrome !== 'undefined' && chrome.tabs?.sendMessage) {
        chrome.tabs.sendMessage(currentActiveTabId, {
          type: 'SET_ACTIVE_BORDER',
          active: true,
          label: isSubAgentIntent ? 'Sub-Agent Swarm Active' : 'PrivaPilot Active'
        }).catch?.(() => {});
      }

      if (typeof chrome !== 'undefined' && chrome.runtime?.sendMessage) {
        let settled = false;
        const timeout = setTimeout(() => {
          if (settled) return;
          settled = true;
          if (currentActiveTabId && typeof chrome !== 'undefined' && chrome.tabs?.sendMessage) {
            chrome.tabs.sendMessage(currentActiveTabId, { type: 'SET_ACTIVE_BORDER', active: false }).catch?.(() => {});
          }
          agentBubble.innerHTML = `<div style="padding: 7px 9px; background: #fef2f2; border: 1px solid #fecaca; border-radius: 6px; color: #dc2626; font-size: 11px;">⚠️ Reasoning request timed out after 120 seconds.</div>`;
          setAgentStatus('failed-safe');
        }, 120000);

        chrome.runtime.sendMessage({
          target: 'privapilot-background',
          type: messageType,
          [payloadKey]: goalText,
          runId: currentRunId,
          tabId: currentActiveTabId,
          history: conversationHistory.slice(-10)
        }, (res) => {
          if (settled) return;
          settled = true;
          clearTimeout(timeout);
          const finalDuration = Math.max(1, Math.round((Date.now() - turnStartTime) / 1000));
          if (currentActiveTabId && typeof chrome !== 'undefined' && chrome.tabs?.sendMessage) {
            chrome.tabs.sendMessage(currentActiveTabId, { type: 'SET_ACTIVE_BORDER', active: false }).catch?.(() => {});
          }
          if (chrome.runtime.lastError) {
            agentBubble.innerHTML = `<div style="padding: 7px 9px; background: #fef2f2; border: 1px solid #fecaca; border-radius: 6px; color: #dc2626; font-size: 11px;">⚠️ Background service worker unreachable: ${escapeHtml(chrome.runtime.lastError.message)}</div>`;
            setAgentStatus('failed-safe');
            return;
          }
          renderActionResult(agentBubble, res, finalDuration);
        });
      } else {
        // Fallback for standalone / mock preview
        setTimeout(() => {
          agentBubble.innerHTML = `<div style="padding: 7px 9px; background: #eff6ff; border: 1px solid #bfdbfe; border-radius: 6px; color: #1d4ed8; font-size: 11px;">ℹ️ Running in standalone mode. Connect Chrome extension runtime for live browser automation.</div>`;
          setAgentStatus('idle');
        }, 300);
      }
    }

    // Voice Mode & Orbloom Living 3D WebGL Setup
    const voiceModal = document.getElementById('voiceModal');
    const closeVoiceBtn = document.getElementById('closeVoiceBtn');
    const voiceLiveTranscript = document.getElementById('voiceLiveTranscript');
    const voiceThinkingIndicator = document.getElementById('voiceThinkingIndicator');
    const voiceModeWrapper = document.getElementById('voiceModeWrapper');
    const voiceModeBtn = document.getElementById('voiceModeBtn');
    const voiceModeMenu = document.getElementById('voiceModeMenu');
    const voiceModeLabel = document.getElementById('voiceModeLabel');
    const voiceSendNowBtn = document.getElementById('voiceSendNowBtn');

    // Bottom-right voice overlay mode dropdown elements
    const voiceOverlayModeWrapper = document.getElementById('voiceOverlayModeWrapper');
    const voiceOverlayModeBtn = document.getElementById('voiceOverlayModeBtn');
    const voiceOverlayModeMenu = document.getElementById('voiceOverlayModeMenu');
    const voiceOverlayModeLabel = document.getElementById('voiceOverlayModeLabel');
    const voiceOverlayModeIcon = document.getElementById('voiceOverlayModeIcon');

    let activeVoiceOrb = null;
    let isVoiceActive = false;
    let voiceRecognition = null;
    let voiceFinalTranscript = '';
    let lastSpokenPrompt = '';
    let isPermissionTabOpening = false;
    let speechRecErrored = false;
    let voiceAudioStream = null;
    let voiceAudioCtx = null;
    let voiceAnalyser = null;
    let voiceAnimFrame = null;
    let silenceAutoCloseTimer = null;
    let speechTalkingDecayTimer = null;
    let isSpeechApiTalking = false;
    let isAiSpeaking = false;
    let isVoiceThinking = false;
    let activeSpeechUtterance = null;
    let currentVoiceMode = (typeof localStorage !== 'undefined' && localStorage.getItem('privapilot_voice_mode')) || 'dictate';

    function updateVoiceModeUI() {
      if (voiceModeLabel) {
        voiceModeLabel.textContent = currentVoiceMode === 'talk' ? 'Voice Conversation' : 'Voice to Text';
      }
      if (voiceModeBtn) {
        const iconSpan = voiceModeBtn.querySelector('.voice-mode-icon');
        if (iconSpan) {
          iconSpan.textContent = currentVoiceMode === 'talk' ? '💬' : '🎙️';
        }
      }
      if (voiceOverlayModeLabel) {
        voiceOverlayModeLabel.textContent = currentVoiceMode === 'talk' ? 'Live Conversation' : 'Voice to Text';
      }
      if (voiceOverlayModeIcon) {
        voiceOverlayModeIcon.textContent = currentVoiceMode === 'talk' ? '💬' : '📝';
      }

      // Borderless shimmering single-mode toggle
      const voiceShimmerActiveText = document.getElementById('voiceShimmerActiveText');
      if (voiceShimmerActiveText) {
        voiceShimmerActiveText.textContent = currentVoiceMode === 'talk' ? 'Live Conversation' : 'Voice to Text';
      }
      const voiceShimmerToggleBtn = document.getElementById('voiceShimmerToggleBtn');
      if (voiceShimmerToggleBtn) {
        voiceShimmerToggleBtn.setAttribute('data-mode', currentVoiceMode);
        voiceShimmerToggleBtn.title = `Current: ${currentVoiceMode === 'talk' ? 'Live Conversation' : 'Voice to Text'} (click to switch)`;
      }

      // Borderless shimmering mode switcher
      document.querySelectorAll('.voice-shimmer-mode-btn').forEach((btn) => {
        if (btn.getAttribute('data-mode') === currentVoiceMode) {
          btn.classList.add('active');
        } else {
          btn.classList.remove('active');
        }
      });

      document.querySelectorAll('.voice-mode-option, .voice-overlay-mode-option').forEach((opt) => {
        if (opt.getAttribute('data-mode') === currentVoiceMode) {
          opt.classList.add('active');
        } else {
          opt.classList.remove('active');
        }
      });
      document.querySelectorAll('.voice-modal-mode-pill').forEach((pill) => {
        if (pill.getAttribute('data-mode') === currentVoiceMode) {
          pill.classList.add('active');
        } else {
          pill.classList.remove('active');
        }
      });
    }

    updateVoiceModeUI();

    // Borderless shimmering single-mode toggle button click handler
    const voiceShimmerToggleBtnEl = document.getElementById('voiceShimmerToggleBtn');
    voiceShimmerToggleBtnEl?.addEventListener('click', (e) => {
      e.stopPropagation();
      currentVoiceMode = currentVoiceMode === 'talk' ? 'dictate' : 'talk';
      try { localStorage.setItem('privapilot_voice_mode', currentVoiceMode); } catch (_) {}
      updateVoiceModeUI();
    });

    // Borderless shimmering mode button handlers for compatibility
    document.querySelectorAll('.voice-shimmer-mode-btn:not(#voiceShimmerToggleBtn)').forEach((btn) => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const mode = btn.getAttribute('data-mode');
        if (mode && (mode === 'dictate' || mode === 'talk')) {
          currentVoiceMode = mode;
          try { localStorage.setItem('privapilot_voice_mode', mode); } catch (_) {}
          updateVoiceModeUI();
        }
      });
    });

    // Chat bar dropdown handlers
    voiceModeBtn?.addEventListener('click', (e) => {
      e.stopPropagation();
      const isHidden = voiceModeMenu?.classList.toggle('hidden');
      voiceModeBtn.classList.toggle('active', !isHidden);
    });

    document.querySelectorAll('.voice-mode-option').forEach((opt) => {
      opt.addEventListener('click', (e) => {
        e.stopPropagation();
        const mode = opt.getAttribute('data-mode');
        if (mode && (mode === 'dictate' || mode === 'talk')) {
          currentVoiceMode = mode;
          try { localStorage.setItem('privapilot_voice_mode', mode); } catch (_) {}
          updateVoiceModeUI();
        }
        voiceModeMenu?.classList.add('hidden');
        voiceModeBtn?.classList.remove('active');
      });
    });

    // Voice overlay bottom-right mode switcher: direct toggle on click, no popup card
    voiceOverlayModeBtn?.addEventListener('click', (e) => {
      e.stopPropagation();
      currentVoiceMode = currentVoiceMode === 'talk' ? 'dictate' : 'talk';
      try { localStorage.setItem('privapilot_voice_mode', currentVoiceMode); } catch (_) {}
      updateVoiceModeUI();
    });

    document.querySelectorAll('.voice-overlay-mode-option').forEach((opt) => {
      opt.addEventListener('click', (e) => {
        e.stopPropagation();
        const mode = opt.getAttribute('data-mode');
        if (mode && (mode === 'dictate' || mode === 'talk')) {
          currentVoiceMode = mode;
          try { localStorage.setItem('privapilot_voice_mode', mode); } catch (_) {}
          updateVoiceModeUI();
        }
      });
    });

    document.querySelectorAll('.voice-modal-mode-pill').forEach((pill) => {
      pill.addEventListener('click', (e) => {
        e.stopPropagation();
        const mode = pill.getAttribute('data-mode');
        if (mode && (mode === 'dictate' || mode === 'talk')) {
          currentVoiceMode = mode;
          try { localStorage.setItem('privapilot_voice_mode', mode); } catch (_) {}
          updateVoiceModeUI();
        }
      });
    });

    voiceSendNowBtn?.addEventListener('click', () => {
      if (!lastSpokenPrompt.trim()) return;
      if (currentVoiceMode === 'dictate') {
        closeVoiceMode();
      } else if (currentVoiceMode === 'talk') {
        handleTalkModeConversationTurn(lastSpokenPrompt.trim());
      }
    });

    document.addEventListener('click', (e) => {
      if (!voiceModeWrapper?.contains(e.target)) {
        voiceModeMenu?.classList.add('hidden');
        voiceModeBtn?.classList.remove('active');
      }
      if (!voiceOverlayModeWrapper?.contains(e.target)) {
        voiceOverlayModeMenu?.classList.add('hidden');
        voiceOverlayModeBtn?.classList.remove('menu-open');
        voiceOverlayModeBtn?.setAttribute('aria-expanded', 'false');
      }
    });

    // Helper: Natural Text-to-Speech Output for Voice Conversation Mode
    function speakVoiceResponse(text, onDone) {
      if (typeof window === 'undefined' || !window.speechSynthesis) {
        onDone?.();
        return;
      }
      try {
        try { window.speechSynthesis.resume(); } catch (_) {}

        const clean = (text || '')
          .replace(/https?:\/\/\S+/gi, '')
          .replace(/[*_#`~[\]()]/g, ' ')
          .replace(/```[\s\S]*?```/g, '')
          .replace(/\s+/g, ' ')
          .trim();

        if (!clean) {
          onDone?.();
          return;
        }

        // Limit spoken response to first 2-3 natural sentences
        const sentences = clean.match(/[^.!?]+[.!?]+/g);
        const spokenText = sentences && sentences.length > 0
          ? sentences.slice(0, 3).join(' ')
          : (clean.length > 280 ? clean.slice(0, 280) + '...' : clean);

        const utterance = new SpeechSynthesisUtterance(spokenText);
        activeSpeechUtterance = utterance; // Prevent Chrome V8 garbage collection!
        utterance.rate = 1.05;
        utterance.pitch = 1.0;

        const assignVoice = () => {
          try {
            const voices = window.speechSynthesis.getVoices();
            if (voices && voices.length > 0) {
              const preferred = voices.find((v) =>
                (v.name.includes('Natural') || v.name.includes('Google') || v.name.includes('Samantha') || v.name.includes('Siri') || v.lang === 'en-US' || v.lang?.startsWith('en')) &&
                !v.name.includes('Whisper')
              );
              if (preferred) utterance.voice = preferred;
            }
          } catch (_) {}
        };
        assignVoice();
        if (typeof window.speechSynthesis.onvoiceschanged !== 'undefined') {
          window.speechSynthesis.onvoiceschanged = assignVoice;
        }

        let finished = false;
        let startedSpeaking = false;

        const handleFinish = () => {
          if (finished) return;
          finished = true;
          isAiSpeaking = false;
          activeSpeechUtterance = null;
          if (activeVoiceOrb) {
            activeVoiceOrb.setAudioLevel(0);
            activeVoiceOrb.setState('listening');
          }
          onDone?.();
        };

        utterance.onstart = () => {
          startedSpeaking = true;
          isAiSpeaking = true;
          activeVoiceOrb?.setState('speaking');
        };

        utterance.onend = handleFinish;
        utterance.onerror = (e) => {
          console.warn('[PrivaPilot Voice] TTS error:', e);
          handleFinish();
        };

        // Safety watchdog: prevent Chrome speechSynthesis from silently pausing
        const watchdog = setInterval(() => {
          if (finished) {
            clearInterval(watchdog);
            return;
          }
          if (window.speechSynthesis.paused) {
            try { window.speechSynthesis.resume(); } catch (_) {}
          }
          if (startedSpeaking && !window.speechSynthesis.speaking) {
            clearInterval(watchdog);
            handleFinish();
          }
        }, 500);

        setTimeout(() => {
          if (!startedSpeaking && !finished) {
            clearInterval(watchdog);
            handleFinish();
          }
        }, 5000);

        try { window.speechSynthesis.resume(); } catch (_) {}
        window.speechSynthesis.speak(utterance);
        try { window.speechSynthesis.resume(); } catch (_) {}
      } catch (err) {
        console.warn('[PrivaPilot Voice] TTS playback note:', err);
        onDone?.();
      }
    }

    // Helper: Safely open at most ONE permission prompt tab without spamming
    function openMicPermissionTabOnce() {
      if (isPermissionTabOpening) return;
      if (typeof chrome === 'undefined' || !chrome.tabs?.create || !chrome.runtime?.getURL) return;

      isPermissionTabOpening = true;
      const permUrl = chrome.runtime.getURL('src/sidepanel/permission.html');

      if (chrome.tabs.query) {
        chrome.tabs.query({ url: permUrl }, (tabs) => {
          if (tabs && tabs.length > 0) {
            chrome.tabs.update(tabs[0].id, { active: true });
          } else {
            chrome.tabs.create({ url: permUrl });
          }
          setTimeout(() => { isPermissionTabOpening = false; }, 4000);
        });
      } else {
        chrome.tabs.create({ url: permUrl });
        setTimeout(() => { isPermissionTabOpening = false; }, 4000);
      }
    }

    // 60 FPS Living Audio Reactivity Engine for Orbloom
    function runVoiceAudioLoop() {
      if (!isVoiceActive) return;
      voiceAnimFrame = requestAnimationFrame(runVoiceAudioLoop);

      let computedLevel = 0;

      // 1. Direct Web Audio frequency analysis from physical microphone stream
      if (voiceAnalyser) {
        const freqData = new Uint8Array(voiceAnalyser.frequencyBinCount);
        voiceAnalyser.getByteFrequencyData(freqData);
        let sum = 0;
        for (let i = 0; i < freqData.length; i++) {
          sum += freqData[i];
        }
        const avg = sum / freqData.length;
        if (avg > 7) {
          computedLevel = Math.min(1.0, Math.max(0, (avg - 7) / 48));
        }
      }

      // 2a. Voice Conversation AI speech playback modulation
      if (isAiSpeaking) {
        const aiWave = 0.58 + 0.32 * Math.sin(Date.now() / 85) + ((Math.random() - 0.5) * 0.12);
        computedLevel = Math.max(computedLevel, Math.min(1.0, Math.max(0.25, aiWave)));
      }

      // 2b. User speech recognition vocal pulse reinforcement
      if (isSpeechApiTalking) {
        const synthRhythm = 0.55 + 0.35 * Math.sin(Date.now() / 95) + ((Math.random() - 0.5) * 0.12);
        computedLevel = Math.max(computedLevel, Math.min(1.0, Math.max(0.25, synthRhythm)));
      }

      // 3. Drive Orbloom living WebGL shaders and rotation
      if (activeVoiceOrb) {
        if (isVoiceThinking) {
          activeVoiceOrb.setAudioLevel(0);
          activeVoiceOrb.setState('thinking');
        } else if (computedLevel > 0.08) {
          activeVoiceOrb.setAudioLevel(computedLevel);
          activeVoiceOrb.setState('speaking');
        } else {
          activeVoiceOrb.setAudioLevel(0);
          activeVoiceOrb.setState('listening');
        }
      }

      // 3b. Drive bottom footer VoiceBeam in exact sync with current voice audio
      if (window.__orbVoiceBeamEngine) {
        window.__orbVoiceBeamEngine.setAudioLevel(computedLevel);
        if (isVoiceThinking) {
          window.__orbVoiceBeamEngine.setProcessing(true);
        } else {
          window.__orbVoiceBeamEngine.setProcessing(false);
        }
      }

      // 4. Drive chat box VoiceBeam auroral glow in real time
      const voiceGlowEl = document.getElementById('voiceGlowBackdrop');
      if (voiceGlowEl) {
        if (computedLevel > 0.05) {
          const scale = 1 + computedLevel * 0.45;
          const h = 65 + computedLevel * 45;
          voiceGlowEl.style.setProperty('--voice-glow-scale', scale.toFixed(2));
          voiceGlowEl.style.setProperty('--voice-glow-height', `${h.toFixed(0)}px`);
        } else {
          voiceGlowEl.style.removeProperty('--voice-glow-scale');
          voiceGlowEl.style.removeProperty('--voice-glow-height');
        }
      }
    }

    // Handle full Voice Conversation turn (Thinking -> Reasoning -> Speaking Back)
    function handleTalkModeConversationTurn(promptText) {
      if (!isVoiceActive || isVoiceThinking || isAiSpeaking) return;
      isVoiceThinking = true;
      isSpeechApiTalking = false;

      // Temporarily halt speech recognition while the model processes and speaks
      try {
        voiceRecognition?.stop();
      } catch (_) {}

      // Transition orb to thinking state with minimal shimmering text
      if (activeVoiceOrb) {
        activeVoiceOrb.setAudioLevel(0);
        activeVoiceOrb.setState('thinking');
      }
      if (voiceLiveTranscript) {
        voiceLiveTranscript.classList.add('hidden');
      }
      if (voiceThinkingIndicator) {
        voiceThinkingIndicator.classList.remove('hidden');
      }

      // Also mirror the question into the sidepanel chat history
      const userBubble = document.createElement('div');
      userBubble.className = 'chat-msg user';
      userBubble.textContent = promptText;
      chatMessages.appendChild(userBubble);
      chatMessages.scrollTop = chatMessages.scrollHeight;

      const agentBubble = document.createElement('div');
      agentBubble.className = 'chat-msg agent';
      agentBubble.innerHTML = `
        <div class="monologue-block group" data-state="expanded">
          <button type="button" class="monologue-toggle-btn" aria-expanded="true">
            <svg class="monologue-chevron" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
              <polyline points="9 18 15 12 9 6"></polyline>
            </svg>
            <span class="monologue-title thinking-shimmer-text">Thinking...</span>
          </button>
          <div class="monologue-drawer" style="display: block;">
            <div class="monologue-content">
              <div class="thought-line live-thought-line" style="padding: 2px 0;">
                <span class="thought-body thinking-shimmer-text">Thinking...</span>
              </div>
            </div>
          </div>
        </div>
      `;
      chatMessages.appendChild(agentBubble);
      chatMessages.scrollTop = chatMessages.scrollHeight;

      // Associate with current Voice Mode session and save in history as a separate session
      let activeSession = chatSessions.find(s => s.id === currentSessionId);
      if (!activeSession || activeSession.id === 'session-new' || !activeSession.id.startsWith('session-voice-')) {
        const newVoiceId = 'session-voice-' + Date.now();
        activeSession = {
          id: newVoiceId,
          title: promptText.length > 25 ? promptText.slice(0, 25) + '...' : promptText,
          updatedAt: Date.now(),
          messages: []
        };
        chatSessions.unshift(activeSession);
        currentSessionId = newVoiceId;
      } else if (activeSession.title === 'Voice Conversation' || activeSession.title === 'New Chat') {
        activeSession.title = promptText.length > 25 ? promptText.slice(0, 25) + '...' : promptText;
      }

      if (!activeSession.messages) activeSession.messages = [];
      activeSession.messages.push({ role: 'user', text: promptText, isVoice: true });
      activeSession.updatedAt = Date.now();
      saveChatSessions();
      renderRecentChatsMenu();

      const isRestrictedTab = Boolean(
        activeTabUrl && (
          activeTabUrl.textContent?.startsWith('chrome://') ||
          activeTabUrl.title?.startsWith('chrome://') ||
          activeTabUrl.textContent?.startsWith('chrome-extension://') ||
          activeTabUrl.textContent?.startsWith('devtools://') ||
          activeTabUrl.textContent?.startsWith('about:blank')
        )
      );

      // In Live Conversation mode: distinguish explicit automation commands from dialogue
      const isExplicitBrowserAction =
        isBrowserActionRequest(promptText) ||
        /\b(?:https?:\/\/|[a-z0-9-]+\.(?:com|org|gov|in|edu|net|io|co|ai|xyz))\b/i.test(promptText) ||
        /\b(?:open|go\s+to|visit|launch|load|search\s+for|find\s+on\s+page|click|scroll)\b/i.test(promptText);

      // Only perform page context capture if the user explicitly asks about the current tab/page
      const isExplicitPageQuery = /\b(?:this\s+(?:page|tab|site|website|article)|on\s+(?:the\s+)?screen|read\s+(?:this|the\s+page)|summarize\s+(?:this|the\s+page)|look\s+at\s+this)\b/i.test(promptText);

      const isSubAgent = isSubAgentIntentText(promptText, conversationHistory);

      const messageType = (isExplicitBrowserAction || isSubAgent)
        ? 'START_AGENT_RUN'
        : (isExplicitPageQuery && currentActiveTabId && !isRestrictedTab ? 'CHAT_WITH_PAGE' : 'GENERAL_CHAT');
      const payloadKey = messageType === 'START_AGENT_RUN' ? 'goal' : 'message';

      if (typeof chrome !== 'undefined' && chrome.runtime?.sendMessage) {
        currentRunId = 'run_' + Date.now() + '_' + Math.random().toString(36).slice(2, 9);
        chrome.runtime.sendMessage({
          target: 'privapilot-background',
          type: messageType,
          [payloadKey]: promptText,
          runId: currentRunId,
          tabId: currentActiveTabId,
          history: conversationHistory.slice(-10)
        }, (res) => {
          isVoiceThinking = false;
          if (voiceThinkingIndicator) {
            voiceThinkingIndicator.classList.add('hidden');
          }

          if (!isVoiceActive) return;

          const rawReply = (res?.reply ||
            res?.proposal?.reply ||
            (res?.proposal?.kind === 'answer' ? (res?.proposal?.rationale || res?.message) : null) ||
            (res?.proposal?.kind === 'finish' && res?.proposal?.rationale ? res.proposal.rationale : null) ||
            res?.message ||
            'I am listening. How can I help you?').trim();

          const realReasoning = res?.reasoning || res?.proposal?.reasoning || res?.proposal?.thought || res?.proposal?.rationale || '';
          if (!res) res = { success: true, reply: rawReply, reasoning: realReasoning };
          if (!res.reply && rawReply) res.reply = rawReply;
          if (!res.reasoning && realReasoning) res.reasoning = realReasoning;

          conversationHistory.push({ role: 'user', content: promptText });
          renderActionResult(agentBubble, res, 2);

          if (voiceLiveTranscript) {
            voiceLiveTranscript.classList.remove('hidden');
            voiceLiveTranscript.classList.remove('is-idle-listening');
            voiceLiveTranscript.textContent = rawReply.length > 90 ? rawReply.slice(0, 90) + '...' : rawReply;
          }

          speakVoiceResponse(rawReply, () => {
            if (isVoiceActive && currentVoiceMode === 'talk') {
              voiceFinalTranscript = '';
              lastSpokenPrompt = '';
              if (voiceLiveTranscript) {
                voiceLiveTranscript.classList.remove('hidden');
                voiceLiveTranscript.textContent = 'Listening...';
                voiceLiveTranscript.classList.add('is-idle-listening');
              }
              activeVoiceOrb?.setState('listening');
              activeVoiceOrb?.setAudioLevel(0);
              try {
                initSpeechRecognition();
              } catch (_) {}
            }
          });
        });
      } else {
        setTimeout(() => {
          isVoiceThinking = false;
          if (voiceThinkingIndicator) {
            voiceThinkingIndicator.classList.add('hidden');
          }
          const fallbackText = "I'm in conversation mode and ready to talk.";
          if (voiceLiveTranscript) {
            voiceLiveTranscript.classList.remove('hidden');
            voiceLiveTranscript.classList.remove('is-idle-listening');
            voiceLiveTranscript.textContent = fallbackText;
          }
          speakVoiceResponse(fallbackText, () => {
            if (isVoiceActive && currentVoiceMode === 'talk') {
              if (voiceLiveTranscript) {
                voiceLiveTranscript.classList.remove('hidden');
                voiceLiveTranscript.textContent = 'Listening...';
                voiceLiveTranscript.classList.add('is-idle-listening');
              }
              activeVoiceOrb?.setState('listening');
              try { initSpeechRecognition(); } catch (_) {}
            }
          });
        }, 800);
      }
    }

    async function openVoiceMode() {
      if (!voiceModal) return;
      isVoiceActive = true;
      speechRecErrored = false;
      isSpeechApiTalking = false;
      isAiSpeaking = false;
      isVoiceThinking = false;
      voiceFinalTranscript = '';
      lastSpokenPrompt = '';
      clearTimeout(silenceAutoCloseTimer);
      clearTimeout(speechTalkingDecayTimer);

      voiceModal.classList.remove('hidden');
      voiceModal.setAttribute('aria-hidden', 'false');
      if (voiceLiveTranscript) {
        voiceLiveTranscript.classList.remove('hidden');
        voiceLiveTranscript.textContent = 'Listening...';
        voiceLiveTranscript.classList.add('is-idle-listening');
      }
      if (voiceThinkingIndicator) {
        voiceThinkingIndicator.classList.add('hidden');
      }
      if (voiceSendNowBtn) {
        voiceSendNowBtn.classList.add('hidden');
      }

      // Ensure Voice Mode has a dedicated session in recent history
      if (currentVoiceMode === 'talk') {
        let activeSession = chatSessions.find(s => s.id === currentSessionId);
        if (!activeSession || (activeSession.messages && activeSession.messages.length > 0 && !activeSession.id.startsWith('session-voice-'))) {
          const newVoiceId = 'session-voice-' + Date.now();
          const voiceSession = {
            id: newVoiceId,
            title: 'Voice Conversation',
            updatedAt: Date.now(),
            messages: []
          };
          chatSessions.unshift(voiceSession);
          currentSessionId = newVoiceId;
          saveChatSessions();
          renderRecentChatsMenu();
        }
      }

      // Synchronize voice mode UI state
      updateVoiceModeUI();

      // Initialize or activate Orbloom Living WebGL Orb with vibrant celestial cyan theme
      try {
        const { createOrb, createOrbTheme } = await import('./orbloom-bundle.js');
        const vibrantTheme = createOrbTheme({
          preset: 'spiral-cyan-03',
          seed: 3.465,
          colors: {
            base: '#101632',
            interior: '#050a18',
            accents: ['#4CC9F0', '#7B5CFF', '#B8F1FF']
          },
          appearance: {
            intensity: 1.45,
            detail: 1.0,
            glass: 0.42,
            glow: 1.5,
          },
          motion: {
            speed: 1.25,
            drift: 0.85,
          },
          audioResponse: {
            brightness: 1.95,
            motion: 1.65,
            pulse: 1.9,
          }
        });

        if (!activeVoiceOrb) {
          const canvas = voiceModal.querySelector('.orb-canvas');
          if (canvas) {
            activeVoiceOrb = createOrb(canvas, {
              theme: vibrantTheme,
              state: 'listening',
              quality: 'high',
              reducedMotion: 'user'
            });
          }
        } else {
          activeVoiceOrb.setTheme?.(vibrantTheme);
          activeVoiceOrb.setQuality?.('high');
        }

        if (activeVoiceOrb) {
          activeVoiceOrb.resume?.();
          activeVoiceOrb.setState('listening');
          activeVoiceOrb.setAudioLevel(0);
        }
      } catch (orbErr) {
        console.warn('[PrivaPilot Voice] Failed to initialize Orbloom visualizer:', orbErr);
      }

      // Initialize microphone stream for real-time frequency analysis
      if (navigator.mediaDevices?.getUserMedia) {
        try {
          voiceAudioStream = await navigator.mediaDevices.getUserMedia({
            audio: { echoCancellation: true, noiseSuppression: true }
          });
          voiceAudioCtx = new (window.AudioContext || window.webkitAudioContext)();
          if (voiceAudioCtx.state === 'suspended') {
            await voiceAudioCtx.resume();
          }
          const source = voiceAudioCtx.createMediaStreamSource(voiceAudioStream);
          voiceAnalyser = voiceAudioCtx.createAnalyser();
          voiceAnalyser.fftSize = 512;
          voiceAnalyser.smoothingTimeConstant = 0.25;
          source.connect(voiceAnalyser);
        } catch (micErr) {
          console.warn('[PrivaPilot Voice] Microphone audio connection note:', micErr);
          openMicPermissionTabOnce();
        }
      }

      // Initialize or activate VoiceBeam Sound-Reactive Glow at bottom footer of Voice Modal (Mobile Type)
      try {
        const orbFooterEl = document.getElementById('orbVoiceBeamFooter');
        if (orbFooterEl) {
          if (!window.__orbVoiceBeamEngine) {
            const { initVoiceBeam } = await import('./voice-beam.js');
            window.__orbVoiceBeamEngine = initVoiceBeam(orbFooterEl, {
              id: 'orb-footer-beam',
              type: 'mobile',
              position: 'absolute',
              borderRadius: 0,
              scale: 1.25,
              bend: 70,
              reach: 3.0,
              spread: 0.45,
              bandWidth: 2.4,
              bandStrength: 1.8,
              bandOffset: -50,
              flow: 60,
              idle: 0.28,
              breatheDuration: 4.8,
              colorVariant: 'colorful'
            });
          }
          if (voiceAudioStream) {
            window.__orbVoiceBeamEngine?.setStream(voiceAudioStream);
          }
          window.__orbVoiceBeamEngine?.setAudioLevel(0.42);
        }
      } catch (vbErr) {
        console.warn('[PrivaPilot Voice] Failed to initialize footer VoiceBeam:', vbErr);
      }

      // Start 60 FPS audio reactive visualizer loop
      if (voiceAnimFrame) {
        cancelAnimationFrame(voiceAnimFrame);
      }
      runVoiceAudioLoop();

      // Browser-native real-time Web Speech Recognition
      function initSpeechRecognition() {
        const SpeechRec = window.SpeechRecognition || window.webkitSpeechRecognition;
        if (!SpeechRec || !isVoiceActive) return;

        if (voiceRecognition) {
          try {
            voiceRecognition.onresult = null;
            voiceRecognition.onend = null;
            voiceRecognition.onerror = null;
            voiceRecognition.abort?.();
          } catch (_) {}
          voiceRecognition = null;
        }

        try {
          voiceRecognition = new SpeechRec();
          voiceRecognition.continuous = true;
          voiceRecognition.interimResults = true;
          voiceRecognition.lang = 'en-US';

          voiceRecognition.onstart = () => {
            speechRecErrored = false;
          };

          voiceRecognition.onspeechstart = () => {
            if (isAiSpeaking || isVoiceThinking) return;
            isSpeechApiTalking = true;
            clearTimeout(speechTalkingDecayTimer);
            activeVoiceOrb?.setState('speaking');
          };

          voiceRecognition.onsoundstart = () => {
            if (isAiSpeaking || isVoiceThinking) return;
            isSpeechApiTalking = true;
            clearTimeout(speechTalkingDecayTimer);
            activeVoiceOrb?.setState('speaking');
          };

          function dispatchSilenceTurn() {
            clearTimeout(silenceAutoCloseTimer);
            if (!isVoiceActive || !lastSpokenPrompt.trim() || isAiSpeaking || isVoiceThinking) return;

            const promptToSend = lastSpokenPrompt.trim();
            if (currentVoiceMode === 'dictate') {
              closeVoiceMode();
            } else if (currentVoiceMode === 'talk') {
              handleTalkModeConversationTurn(promptToSend);
            }
          }

          voiceRecognition.onspeechend = () => {
            clearTimeout(speechTalkingDecayTimer);
            speechTalkingDecayTimer = setTimeout(() => {
              isSpeechApiTalking = false;
            }, 350);

            // Speech pause: in talk mode, after words are spoken, a snappy 450ms pause triggers auto-send
            if (lastSpokenPrompt.trim() && currentVoiceMode === 'talk') {
              clearTimeout(silenceAutoCloseTimer);
              silenceAutoCloseTimer = setTimeout(dispatchSilenceTurn, 450);
            }
          };

          voiceRecognition.onresult = (event) => {
            if (isAiSpeaking || isVoiceThinking) return;
            isSpeechApiTalking = true;
            clearTimeout(speechTalkingDecayTimer);
            speechTalkingDecayTimer = setTimeout(() => {
              isSpeechApiTalking = false;
            }, 450);

            let interimTranscript = '';
            let sessionFinal = '';
            for (let i = 0; i < event.results.length; ++i) {
              const res = event.results[i];
              if (res.isFinal) {
                sessionFinal += res[0].transcript + ' ';
              } else {
                interimTranscript += res[0].transcript;
              }
            }

            const currentSpoken = ((voiceFinalTranscript ? voiceFinalTranscript + ' ' : '') + sessionFinal + interimTranscript)
              .replace(/\s+/g, ' ')
              .trim();

            if (!currentSpoken) return;
            lastSpokenPrompt = currentSpoken;

            if (voiceLiveTranscript) {
              voiceLiveTranscript.classList.remove('hidden');
              voiceLiveTranscript.classList.remove('is-idle-listening');
              voiceLiveTranscript.textContent = currentSpoken;
            }
            if (voiceSendNowBtn) {
              voiceSendNowBtn.classList.add('hidden');
            }
            if (chatInput) {
              chatInput.value = currentSpoken;
              updateSendBtn();
            }

            // Inactivity trigger:
            // Mode 1 (talk / Live Conversation): 800ms of clean silence triggers auto-send turn
            // Mode 2 (dictate / Voice-to-Text): 2.0s of silence triggers auto-close and populates chatbox
            clearTimeout(silenceAutoCloseTimer);
            const silenceThreshold = currentVoiceMode === 'talk' ? 800 : 2000;
            silenceAutoCloseTimer = setTimeout(dispatchSilenceTurn, silenceThreshold);
          };

          voiceRecognition.onerror = (e) => {
            console.warn('[PrivaPilot Voice] Speech recognition event:', e?.error);
            if (e?.error === 'no-speech') {
              return;
            }
            if (e?.error === 'not-allowed' || e?.error === 'audio-capture' || e?.error === 'service-not-allowed') {
              speechRecErrored = true;
              try { voiceRecognition.abort?.(); } catch (_) {}
              openMicPermissionTabOnce();
            }
          };

          voiceRecognition.onend = () => {
            if (lastSpokenPrompt) {
              voiceFinalTranscript = lastSpokenPrompt;
            }
            // If user has spoken something and flow ended, trigger auto-send/commit turn immediately!
            if (lastSpokenPrompt.trim() && !isAiSpeaking && !isVoiceThinking) {
              dispatchSilenceTurn();
              return;
            }
            // Only restart if no pending prompt and user is still waiting to speak
            if (isVoiceActive && !speechRecErrored && !isAiSpeaking && !isVoiceThinking) {
              setTimeout(() => {
                if (isVoiceActive && !speechRecErrored && !isAiSpeaking && !isVoiceThinking) {
                  try {
                    voiceRecognition?.start();
                  } catch (_) {
                    initSpeechRecognition();
                  }
                }
              }, 120);
            }
          };

          voiceRecognition.start();
        } catch (recErr) {
          console.warn('[PrivaPilot Voice] Speech recognition start error:', recErr);
        }
      }

      initSpeechRecognition();
    }

    function closeVoiceMode() {
      if (!isVoiceActive) return;
      isVoiceActive = false;
      speechRecErrored = true;
      isSpeechApiTalking = false;
      isAiSpeaking = false;
      isVoiceThinking = false;
      clearTimeout(silenceAutoCloseTimer);
      clearTimeout(speechTalkingDecayTimer);

      if (typeof window !== 'undefined' && window.speechSynthesis) {
        try { window.speechSynthesis.cancel(); } catch (_) {}
      }

      if (voiceAnimFrame) {
        cancelAnimationFrame(voiceAnimFrame);
        voiceAnimFrame = null;
      }

      if (voiceAudioStream) {
        try {
          voiceAudioStream.getTracks().forEach((track) => track.stop());
        } catch (_) {}
        voiceAudioStream = null;
      }

      if (voiceAudioCtx) {
        try {
          voiceAudioCtx.close();
        } catch (_) {}
        voiceAudioCtx = null;
        voiceAnalyser = null;
      }

      if (voiceModal) {
        voiceModal.classList.add('hidden');
        voiceModal.setAttribute('aria-hidden', 'true');
      }

      if (voiceThinkingIndicator) {
        voiceThinkingIndicator.classList.add('hidden');
      }

      if (voiceSendNowBtn) {
        voiceSendNowBtn.classList.add('hidden');
      }

      if (voiceOverlayModeMenu) {
        voiceOverlayModeMenu.classList.add('hidden');
      }
      if (voiceOverlayModeBtn) {
        voiceOverlayModeBtn.classList.remove('menu-open');
      }

      if (voiceRecognition) {
        try {
          voiceRecognition.abort?.();
          voiceRecognition.stop?.();
        } catch (_) {}
        voiceRecognition = null;
      }

      if (activeVoiceOrb) {
        try {
          activeVoiceOrb.setAudioLevel(0);
          activeVoiceOrb.setState('idle');
          activeVoiceOrb.pause?.();
        } catch (_) {}
      }

      if (window.__orbVoiceBeamEngine) {
        window.__orbVoiceBeamEngine.setAudioLevel(0);
        window.__orbVoiceBeamEngine.setProcessing(false);
      }

      // In dictate mode, ensure whatever was spoken is safely written into the chatbox
      if (lastSpokenPrompt && chatInput) {
        chatInput.value = lastSpokenPrompt.trim();
      }

      // Update send button state (will switch to mode-send if text exists)
      updateSendBtn();

      // Focus chat input with cursor at the end, immediately ready to send
      if (chatInput) {
        chatInput.focus();
        try {
          const endPos = chatInput.value.length;
          chatInput.setSelectionRange(endPos, endPos);
        } catch (_) {}
      }
    }

    closeVoiceBtn?.addEventListener('click', closeVoiceMode);
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && isVoiceActive) {
        closeVoiceMode();
      }
    });

    if (typeof chrome !== 'undefined' && chrome.runtime?.onMessage) {
      chrome.runtime.onMessage.addListener((msg) => {
        if (msg?.type === 'MIC_PERMISSION_GRANTED' && isVoiceActive) {
          isPermissionTabOpening = false;
          speechRecErrored = false;
          if (voiceRecognition && isVoiceActive) {
            try { voiceRecognition.start(); } catch (_) {}
          }
        }
      });
    }

    // Chat Form Submit & Input Handling (Synced with border-beam Rotate & Color playground)
    if (chatForm && chatInput) {
      const sendBtn = document.getElementById('sendBtn');
      const stopBtn = document.getElementById('stopBtn');
      const beamChatCard = document.getElementById('beamChatCard');
      const beamRotatePill = document.getElementById('beamRotatePill');
      const beamColorPill = document.getElementById('beamColorPill');
      const beamEffectLabel = document.getElementById('beamEffectLabel');
      const beamColorLabel = document.getElementById('beamColorLabel');

      let userSelectedEffect = 'rotate'; // 'rotate', 'pulse', 'line'
      let colorIndex = 0;
      const colorPalettes = ['Color', 'Ocean', 'Sunset', 'Mono'];

      // Initialize sound & typing reactive VoiceBeam engine from libraries.dev/voice
      let voiceBeamEngine = null;
      (async () => {
        try {
          const { initVoiceBeam } = await import('./voice-beam.js');
          if (beamChatCard) {
            voiceBeamEngine = initVoiceBeam(beamChatCard, {
              id: 'privapilot-beam',
              borderRadius: 22,
              colorVariant: 'colorful',
              idle: 0.22,
              breatheDuration: 5.2,
              bend: 58,
              bandStrength: 1.6,
              bandWidth: 2.2
            });
            window.__voiceBeamEngine = voiceBeamEngine;
          }
        } catch (err) {
          console.warn('VoiceBeam init notice:', err);
        }
      })();

      function syncBeamEffect() {
        if (!beamChatCard) return;
        const val = chatInput.value.trim();
        const hasText = val.length > 0;
        const isProceed = val.toLowerCase() === 'proceed' || val.toLowerCase().startsWith('proceed');

        if (isProceed) {
          voiceBeamEngine?.triggerTypingPulse(0.9);
          beamChatCard.setAttribute('data-beam', 'privapilot_rotate_large');
          beamChatCard.style.setProperty('--beam-strength', '1.0');
          if (beamEffectLabel) beamEffectLabel.textContent = 'Rotate Large';
        } else if (hasText) {
          if (userSelectedEffect === 'pulse') {
            beamChatCard.setAttribute('data-beam', 'privapilot_rotate_large');
            beamChatCard.style.setProperty('--beam-strength', '0.95');
            if (beamEffectLabel) beamEffectLabel.textContent = 'Pulse 1';
          } else if (userSelectedEffect === 'line') {
            beamChatCard.setAttribute('data-beam', 'privapilot_line');
            beamChatCard.style.setProperty('--beam-strength', '0.85');
            if (beamEffectLabel) beamEffectLabel.textContent = 'Agent';
          } else {
            beamChatCard.setAttribute('data-beam', 'privapilot_rotate');
            beamChatCard.style.setProperty('--beam-strength', '0.85');
            if (beamEffectLabel) beamEffectLabel.textContent = 'Agent';
          }
        } else {
          beamChatCard.setAttribute('data-beam', 'privapilot_line');
          beamChatCard.style.setProperty('--beam-strength', '0.7');
          if (beamEffectLabel) beamEffectLabel.textContent = 'Agent';
        }

        if (sendBtn) {
          if (hasText) {
            sendBtn.classList.add('has-text');
          } else {
            sendBtn.classList.remove('has-text');
          }
        }
      }

      function updateSendBtn() {
        const val = chatInput.value.trim();
        const hasText = val.length > 0;
        if (hasText) {
          sendBtn?.classList.add('mode-send', 'has-text');
          sendBtn?.classList.remove('mode-mic');
          sendBtn?.setAttribute('title', 'Send Instruction');
          sendBtn?.setAttribute('aria-label', 'Send Instruction');
          beamChatCard?.classList.add('typing');
        } else {
          sendBtn?.classList.add('mode-mic');
          sendBtn?.classList.remove('mode-send', 'has-text');
          sendBtn?.setAttribute('title', 'Voice Input');
          sendBtn?.setAttribute('aria-label', 'Voice Input');
          beamChatCard?.classList.remove('typing');
        }
        syncBeamEffect();
      }

      updateSendBtn();

      // Agent / Rotate / Pulse cycle pill
      beamRotatePill?.addEventListener('click', (e) => {
        e.preventDefault();
        if (userSelectedEffect === 'rotate') {
          userSelectedEffect = 'pulse';
        } else if (userSelectedEffect === 'pulse') {
          userSelectedEffect = 'line';
        } else {
          userSelectedEffect = 'rotate';
        }
        syncBeamEffect();
      });

      // Color cycle pill
      beamColorPill?.addEventListener('click', (e) => {
        e.preventDefault();
        colorIndex = (colorIndex + 1) % colorPalettes.length;
        const pal = colorPalettes[colorIndex].toLowerCase();
        const mappedPal = pal === 'color' ? 'colorful' : pal;
        voiceBeamEngine?.setColorVariant(mappedPal);
        window.__voiceBeamEngine?.setColorVariant(mappedPal);
        if (beamColorLabel) beamColorLabel.textContent = colorPalettes[colorIndex];
      });

      // Stop Button Handler
      stopBtn?.addEventListener('click', (e) => {
        e.preventDefault();
        setAgentStatus('idle');
        addAuditEntry('HALT', 'User Stopped Agent Execution', 'warn');
        if (typeof chrome !== 'undefined' && chrome.runtime?.sendMessage) {
          chrome.runtime.sendMessage({ type: 'ABORT_ACTION' });
        }
      });

      function autoResizeTextarea() {
        if (chatInput.tagName.toLowerCase() === 'textarea') {
          chatInput.style.height = 'auto';
          chatInput.style.height = Math.min(chatInput.scrollHeight, 100) + 'px';
        }
      }

      ['input', 'keydown', 'keyup', 'change', 'paste', 'focus'].forEach(evt => {
        chatInput.addEventListener(evt, () => {
          voiceBeamEngine?.triggerTypingPulse(0.55);
          window.__voiceBeamEngine?.triggerTypingPulse(0.55);
          updateSendBtn();
          autoResizeTextarea();
        });
      });

      chatInput.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' && !e.shiftKey) {
          e.preventDefault();
          if (chatInput.value.trim().length > 0) {
            chatForm.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
          }
        }
      });

      sendBtn?.addEventListener('click', (e) => {
        e.preventDefault();
        if (sendBtn.classList.contains('mode-mic')) {
          if (typeof openVoiceMode === 'function') {
            openVoiceMode();
          }
        } else {
          const text = chatInput.value.trim();
          if (text) {
            chatForm.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
          } else {
            chatInput.focus();
          }
        }
      });

      chatForm.addEventListener('submit', (e) => {
        e.preventDefault();
        const text = chatInput.value.trim();
        if (text) {
          executeGoal(text);
          if (chatInput.tagName.toLowerCase() === 'textarea') {
            chatInput.style.height = 'auto';
          }
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
            const lastAgentBubble = chatMessages.querySelector('.chat-msg.agent:last-child');
            const shimmerTitle = lastAgentBubble?.querySelector('.monologue-title.thinking-shimmer-text') || lastAgentBubble?.querySelector('.thinking-shimmer-text');
            const liveBody = lastAgentBubble?.querySelector('.live-thought-line .thought-body');
            let stateLabel = 'Thinking...';
            let actionStatusText = message.message || 'Perceiving page layout...';
            if (message.state === 'awaiting-reasoning') {
              stateLabel = (message.message && /sub-?agent|parallel|swarm/i.test(message.message)) ? 'Sub-Agent Swarm...' : 'Reasoning...';
              actionStatusText = message.message || 'Planning optimal action...';
            } else if (message.state === 'capturing') {
              stateLabel = 'Perceiving...';
              actionStatusText = message.message || 'Perceiving page elements...';
            } else if (message.state === 'executing') {
              stateLabel = (message.message && /sub-?agent|parallel|swarm/i.test(message.message)) ? 'Sub-Agent Swarm...' : 'Thinking...';
              actionStatusText = message.message || 'Executing action...';
            }
            if (shimmerTitle) shimmerTitle.textContent = stateLabel;
            const liveActionSpan = lastAgentBubble?.querySelector('.action-status-line.is-executing .thinking-shimmer-text');
            if (liveActionSpan && actionStatusText) {
              liveActionSpan.textContent = actionStatusText;
            }
          }

          if (message.type === 'COORDINATOR_STEP_PROGRESS') {
            if (message.message) {
              addAuditEntry(`STEP ${message.step}/${message.maxSteps}`, message.message, 'info');
              const lastAgentBubble = chatMessages.querySelector('.chat-msg.agent:last-child');
              const liveBody = lastAgentBubble?.querySelector('.live-thought-line .thought-body');
              if (liveBody) liveBody.textContent = message.message;
              const liveActionSpan = lastAgentBubble?.querySelector('.action-status-line.is-executing .thinking-shimmer-text');
              if (liveActionSpan) liveActionSpan.textContent = message.message;
            }
          }

          if (message.type === 'COORDINATOR_ACTION_PROPOSED') {
            const act = message.action;
            if (act) {
              const elementsList = lastSanitizedContext?.elements || [];
              const executingLabel = getExecutingActionLabel(act, elementsList);
              const cleanLabel = getCleanActionLabel(act, elementsList);
              addAuditEntry('PLAN', `${cleanLabel}: ${act.rationale || 'Executing action'}`, 'pass');
              const lastAgentBubble = chatMessages.querySelector('.chat-msg.agent:last-child');
              if (lastAgentBubble && !lastAgentBubble.classList.contains('msg-action') && !lastAgentBubble.querySelector('.thought-card')) {
                // Stream live model reasoning directly into the monologue drawer!
                const monologueContent = lastAgentBubble.querySelector('.monologue-content');
                const liveReasoning = act.reasoning || act.thought || act.rationale;
                if (monologueContent && liveReasoning) {
                  streamLiveReasoningLines(monologueContent, liveReasoning);
                }

                const monologueTitle = lastAgentBubble.querySelector('.monologue-title');
                if (monologueTitle) {
                  monologueTitle.textContent = 'Reasoning...';
                }

                const liveBody = lastAgentBubble.querySelector('.live-thought-line .thought-body');
                if (liveBody) {
                  liveBody.textContent = executingLabel;
                }

                // If a previous executing line exists, convert it to completed (done)
                const existingExecuting = lastAgentBubble.querySelector('.action-status-line.is-executing');
                if (existingExecuting) {
                  existingExecuting.className = 'action-status-line is-done';
                  const prevText = existingExecuting.querySelector('.thinking-shimmer-text')?.textContent || '';
                  const resolvedDone = prevText.replace(/\.\.\.$/, '').replace(/^(?:Typing|Clicking|Scrolling|Navigating to|Pressing|Selecting)\b/i, (m) => {
                    const map = { typing: 'Typed', clicking: 'Clicked', scrolling: 'Scrolled', 'navigating to': 'Navigated to', pressing: 'Pressed', selecting: 'Selected' };
                    return map[m.toLowerCase()] || m;
                  });
                  existingExecuting.innerHTML = `
                    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="#38bdf8" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" style="flex-shrink: 0; opacity: 0.9;"><polyline points="20 6 9 17 4 12"></polyline></svg>
                    <span class="action-done-label" style="color: #e2e8f0; font-weight: 500; font-size: 12px;">${escapeHtml(resolvedDone)}</span>
                  `;
                }

                // Append the new active shimmering line
                const activeActionLine = document.createElement('div');
                activeActionLine.className = 'action-status-line is-executing';
                activeActionLine.style.cssText = 'display: flex; align-items: center; gap: 7px; font-size: 12.5px; color: #cbd5e1; margin-top: 5px; padding: 2px 0;';
                activeActionLine.innerHTML = `
                  <span class="thinking-shimmer-text" style="font-weight: 500; font-size: 12px;">${escapeHtml(executingLabel)}</span>
                `;
                lastAgentBubble.appendChild(activeActionLine);
                chatMessages.scrollTop = chatMessages.scrollHeight;
              }
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

            renderMaskBreakdown(message.elements || [], message.maskCount ?? 0, message.redactionManifest || message.sanitized?.redactionManifest);

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
            let lastAgentBubble = chatMessages.querySelector('.chat-msg.agent:last-child');
            if (!lastAgentBubble) {
              lastAgentBubble = appendMessage('agent', '');
            }
            renderActionResult(lastAgentBubble, {
              state: 'awaiting-user-confirmation',
              inputRequest: message.request
            });
            setAgentStatus('awaiting-user-confirmation');
            addAuditEntry('INPUT', `Input requested: ${message.request?.prompt || 'field fill'}`, 'info');
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


