/**
 * @privapilot/pii-rules - Outbound Privacy Boundary URL and Optional Text Scrubber
 *
 * Enforces strict redaction on all outbound communication channels:
 * - URL paths, query parameters, fragments, userinfo, and tokens
 * - Optional text fields: postcondition summary, action history, custom prompt, conversation history, search results
 * - Preserves safe domain and navigation context needed for autonomous browsing tasks
 */

import { SanitizedNetworkPayload } from '@privapilot/protocol';
import { scanTextForPII } from './regex-patterns.js';
import { scrubText } from './scrubber.js';

const EMAIL_PATTERN = /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}\b/i;
const CANARY_PATTERN = /\b(?:SECRET_CANARY[A-Za-z0-9_]*|CANARY_PRIVAPILOT[A-Za-z0-9_]*)\b/i;
const JWT_PATTERN = /\beyJ[A-Za-z0-9-_]+\.eyJ[A-Za-z0-9-_]+\.[A-Za-z0-9-_]+\b/;
const SECRET_KEY_PATTERN = /\b(?:sk_live_|ghp_|akIA|xox[baprs]-|AIza)[A-Za-z0-9_]{16,}\b/;
const HIGH_ENTROPY_HEX_PATTERN = /^[0-9a-fA-F]{16,}$/;
const HIGH_ENTROPY_TOKEN_PATTERN = /^[A-Za-z0-9+/_=-]{20,}$/;

const SENSITIVE_QUERY_PARAM_REGEX = /(?:^|[_-])(?:token|secret|auth|key|password|pwd|pass|session|jwt|code|signature|sig|credential|private|hash|apikey|api_key|access_token|id_token|refresh_token|bearer)(?:$|[_-])/i;
const PII_QUERY_PARAM_REGEX = /(?:^|[_-])(?:email|mail|user|username|account|phone|mobile|tel|card|cvv|pan|aadhaar|ssn|dob|birth)(?:$|[_-])/i;

const TOKEN_PATH_PRECURSORS = new Set([
  'token', 'tokens', 'reset', 'password-reset', 'auth', 'session', 'sessions',
  'invite', 'invites', 'verify', 'verification', 'key', 'keys', 'secret',
  'apikey', 'otp', 'code', 'confirmation'
]);

function decodeSafe(val: string): string {
  try {
    return decodeURIComponent(val);
  } catch {
    return val;
  }
}

function sanitizeSegment(segment: string, prevSegment: string): string {
  if (!segment) return '';
  const decoded = decodeSafe(segment);

  // 1. Canary check
  if (CANARY_PATTERN.test(decoded) || CANARY_PATTERN.test(segment)) {
    return '[REDACTED_TOKEN]';
  }

  // 2. Email check (raw or encoded)
  if (EMAIL_PATTERN.test(decoded) || EMAIL_PATTERN.test(segment) || decoded.includes('@')) {
    const scrubbed = scrubText(decoded);
    return scrubbed.includes('[REDACTED_EMAIL]') ? scrubbed : '[REDACTED_EMAIL]';
  }

  // 3. JWT or secret key check
  if (JWT_PATTERN.test(decoded) || SECRET_KEY_PATTERN.test(decoded)) {
    return '[REDACTED_TOKEN]';
  }

  // 4. Precursor check: e.g. /reset/<token> or /verify/<hash>
  if (TOKEN_PATH_PRECURSORS.has(prevSegment.toLowerCase()) && decoded.length >= 8 && /^[A-Za-z0-9_-]{8,}$/.test(decoded)) {
    return '[REDACTED_TOKEN]';
  }

  // 5. Standalone high-entropy hex (e.g. 24+ hex digits)
  if (/^[0-9a-fA-F]{24,}$/.test(decoded)) {
    return '[REDACTED_TOKEN]';
  }

  // 6. Generic high-entropy token segment (>= 32 alphanumeric/base64 chars without extension)
  if (decoded.length >= 32 && /^[A-Za-z0-9_-]{32,}$/.test(decoded) && !/\.(?:html|php|aspx|json|xml|pdf|txt)$/i.test(decoded)) {
    return '[REDACTED_TOKEN]';
  }

  // 7. Standard PII check (phone, PAN, Aadhaar)
  const matches = scanTextForPII(decoded);
  if (matches.length > 0) {
    return scrubText(decoded);
  }

  return segment;
}

function sanitizeQueryParam(key: string, value: string): string {
  if (!value) return value;
  const decoded = decodeSafe(value);

  // If value is a URL, recursively sanitize
  if (/^https?:\/\//i.test(decoded)) {
    return sanitizeOutboundUrl(decoded);
  }

  // Canary check
  if (CANARY_PATTERN.test(decoded) || CANARY_PATTERN.test(value)) {
    return '[REDACTED_TOKEN]';
  }

  // Key is explicitly a token / secret key
  if (SENSITIVE_QUERY_PARAM_REGEX.test(key)) {
    return '[REDACTED_TOKEN]';
  }

  // Key is explicitly PII
  if (PII_QUERY_PARAM_REGEX.test(key)) {
    if (EMAIL_PATTERN.test(decoded) || decoded.includes('@')) {
      return '[REDACTED_EMAIL]';
    }
    return scrubText(decoded);
  }

  // Value contains email
  if (EMAIL_PATTERN.test(decoded) || EMAIL_PATTERN.test(value) || (decoded.includes('@') && decoded.includes('.'))) {
    const scrubbed = scrubText(decoded);
    return scrubbed.includes('[REDACTED_EMAIL]') ? scrubbed : '[REDACTED_EMAIL]';
  }

  // Value is JWT or secret key
  if (JWT_PATTERN.test(decoded) || SECRET_KEY_PATTERN.test(decoded)) {
    return '[REDACTED_TOKEN]';
  }

  // Value is high-entropy hex (>= 16 chars) or long token (>= 20 chars)
  if (HIGH_ENTROPY_HEX_PATTERN.test(decoded) || (decoded.length >= 24 && HIGH_ENTROPY_TOKEN_PATTERN.test(decoded))) {
    return '[REDACTED_TOKEN]';
  }

  // PII in value
  const matches = scanTextForPII(decoded);
  if (matches.length > 0) {
    return scrubText(decoded);
  }

  return value;
}

function sanitizeQueryString(queryString: string): string {
  if (!queryString || queryString === '?') return '';
  const search = queryString.startsWith('?') ? queryString.slice(1) : queryString;
  if (!search) return '';

  const pairs = search.split('&');
  const sanitizedPairs: string[] = [];

  for (const pair of pairs) {
    if (!pair) continue;
    const eqIdx = pair.indexOf('=');
    if (eqIdx === -1) {
      if (SENSITIVE_QUERY_PARAM_REGEX.test(pair) || CANARY_PATTERN.test(pair)) {
        sanitizedPairs.push(`${pair}=[REDACTED_TOKEN]`);
      } else if (EMAIL_PATTERN.test(decodeSafe(pair))) {
        sanitizedPairs.push('[REDACTED_EMAIL]');
      } else {
        sanitizedPairs.push(pair);
      }
    } else {
      const key = pair.slice(0, eqIdx);
      const val = pair.slice(eqIdx + 1);
      sanitizedPairs.push(`${key}=${sanitizeQueryParam(key, val)}`);
    }
  }

  return sanitizedPairs.length > 0 ? `?${sanitizedPairs.join('&')}` : '';
}

function sanitizeFragment(hashString: string): string {
  if (!hashString || hashString === '#') return '';
  const hash = hashString.startsWith('#') ? hashString.slice(1) : hashString;
  if (!hash) return '';

  if (hash.includes('=')) {
    // Query-like fragment (e.g. #access_token=...&id_token=...)
    const sanitizedQuery = sanitizeQueryString(`?${hash}`);
    return sanitizedQuery ? `#${sanitizedQuery.slice(1)}` : '';
  }

  if (hash.startsWith('/')) {
    // Route-like fragment (e.g. #/user/alice@example.com)
    const segments = hash.split('/');
    const safeSegments = segments.map((seg, idx) => sanitizeSegment(seg, idx > 0 ? segments[idx - 1] : ''));
    return `#${safeSegments.join('/')}`;
  }

  // Anchor name: check for canary, token, email
  const decoded = decodeSafe(hash);
  if (CANARY_PATTERN.test(decoded) || JWT_PATTERN.test(decoded) || SECRET_KEY_PATTERN.test(decoded)) {
    return '#[REDACTED_TOKEN]';
  }
  if (EMAIL_PATTERN.test(decoded) || decoded.includes('@')) {
    return '#[REDACTED_EMAIL]';
  }
  const matches = scanTextForPII(decoded);
  if (matches.length > 0) {
    return `#${scrubText(decoded)}`;
  }

  return hashString;
}

/**
 * Sanitizes an absolute or relative URL string for safe transmission across outbound boundaries.
 * Preserves safe domain, protocol, and clean navigation path hierarchy while redacting
 * emails, tokens, secrets, userinfo, and PII from paths, query strings, and fragments.
 */
export function sanitizeOutboundUrl(rawUrl: string): string {
  if (!rawUrl || typeof rawUrl !== 'string') return '';
  const trimmed = rawUrl.trim();
  if (!trimmed) return '';

  // Safe browser internal schemes
  if (/^(?:chrome|about|edge|brave):/i.test(trimmed)) {
    if (trimmed === 'about:blank' || trimmed.startsWith('chrome://newtab')) {
      return trimmed;
    }
  }

  try {
    const parsed = new URL(trimmed);

    // Strip credentials
    parsed.username = '';
    parsed.password = '';

    // Sanitize path segments
    const segments = parsed.pathname.split('/');
    const sanitizedSegments = segments.map((seg, idx) =>
      sanitizeSegment(seg, idx > 0 ? segments[idx - 1] : '')
    );
    const safePathname = sanitizedSegments.join('/');

    // Sanitize query string
    const safeSearch = sanitizeQueryString(parsed.search);

    // Sanitize fragment
    const safeHash = sanitizeFragment(parsed.hash);

    const result = `${parsed.protocol}//${parsed.host}${safePathname}${safeSearch}${safeHash}`;
    if (result.length <= 2048) {
      return result;
    }
    const base = `${parsed.protocol}//${parsed.host}${safePathname}`;
    if (base.length >= 2048) {
      return base.slice(0, 2048);
    }
    const remaining = 2048 - base.length;
    return `${base}${safeSearch.slice(0, remaining)}`;
  } catch {
    // Relative or invalid URL - scrub text
    const scrubbed = scrubOptionalText(trimmed);
    return scrubbed.length > 2048 ? scrubbed.slice(0, 2048) : scrubbed;
  }
}

/**
 * Replaces all embedded URLs in a free-form string with their sanitized representations.
 */
export function sanitizeUrlsInText(text: string): string {
  if (!text || typeof text !== 'string') return text;
  return text.replace(/https?:\/\/[^\s"'<>)]+/gi, (matchedUrl) => {
    return sanitizeOutboundUrl(matchedUrl);
  });
}

/**
 * Scrubs optional metadata and text fields before egress.
 * Sanitizes embedded URLs, strips canary secrets, and replaces detected PII/tokens with redaction markers.
 */
export function scrubOptionalText(text: string): string {
  if (!text || typeof text !== 'string') return text;

  // 1. Sanitize all URLs embedded in text
  const urlSanitized = sanitizeUrlsInText(text);

  // 2. Scrub PII and known tokens using scanTextForPII / scrubText
  let scrubbed = scrubText(urlSanitized);

  // 3. Catch standalone secret key / token patterns in text
  scrubbed = scrubbed
    .replace(/(?:bearer\s+)[A-Za-z0-9_\-\.]{8,}/gi, 'Bearer [REDACTED_TOKEN]')
    .replace(/\b(?:SECRET_CANARY[A-Za-z0-9_]*|CANARY_PRIVAPILOT[A-Za-z0-9_]*)\b/gi, '[REDACTED_TOKEN]')
    .replace(/\beyJ[A-Za-z0-9-_]+\.eyJ[A-Za-z0-9-_]+\.[A-Za-z0-9-_]+\b/g, '[REDACTED_TOKEN]')
    .replace(/\b(?:sk_live_|ghp_|akIA|sec_|secret_|tok_|token_|api_key_|apikey_|key_)[A-Za-z0-9_]{3,}\b/gi, '[REDACTED_TOKEN]')
    .replace(/\b(?:token|secret|key|apiKey|auth|session|password|jwt)[_:\s=]+(?:['"]?)([A-Za-z0-9_\-\.]{8,})(?:['"]?)/gi, (match, val) => match.replace(val, '[REDACTED_TOKEN]'))
    .replace(/\b[0-9a-fA-F]{24,}\b/g, '[REDACTED_TOKEN]');

  return scrubbed;
}

/**
 * Scrubs conversation history messages for safe outbound transmission.
 */
export function scrubHistory(
  history?: ReadonlyArray<{ role: 'user' | 'assistant'; content: string }>
): Array<{ role: 'user' | 'assistant'; content: string }> | undefined {
  if (!history || !Array.isArray(history)) return undefined;
  return history.map((item) => ({
    role: item.role,
    content: scrubOptionalText(item.content || '')
  }));
}

/**
 * Scrubs an entire SanitizedNetworkPayload to guarantee that no unredacted URLs,
 * tokens, or PII can escape over the wire.
 */
export function sanitizeOutboundPayload(payload: SanitizedNetworkPayload): SanitizedNetworkPayload {
  const result: any = { ...payload };

  if (result.goal) {
    result.goal = scrubOptionalText(result.goal);
  }

  if (Array.isArray(result.elements)) {
    result.elements = result.elements.map((el: any) => ({
      ...el,
      sanitizedName: el.sanitizedName ? scrubOptionalText(el.sanitizedName) : el.sanitizedName
    }));
  }

  if (result.pageState && typeof result.pageState === 'object') {
    const ps: any = { ...result.pageState };
    if (ps.title) ps.title = scrubOptionalText(ps.title);
    if (ps.pageTitle) ps.pageTitle = scrubOptionalText(ps.pageTitle);
    if (ps.url) ps.url = sanitizeOutboundUrl(ps.url);
    if (ps.canonicalUrl) ps.canonicalUrl = sanitizeOutboundUrl(ps.canonicalUrl);
    if (ps.postconditionSummary) ps.postconditionSummary = scrubOptionalText(ps.postconditionSummary);
    if (Array.isArray(ps.dialogTitles)) ps.dialogTitles = ps.dialogTitles.map(scrubOptionalText);
    if (Array.isArray(ps.statusSummaries)) ps.statusSummaries = ps.statusSummaries.map(scrubOptionalText);
    if (Array.isArray(ps.contentSummaries)) ps.contentSummaries = ps.contentSummaries.map(scrubOptionalText);

    if (ps.stateDelta && typeof ps.stateDelta === 'object') {
      const sd: any = { ...ps.stateDelta };
      if (sd.previousUrl) sd.previousUrl = sanitizeOutboundUrl(sd.previousUrl);
      if (sd.currentUrl) sd.currentUrl = sanitizeOutboundUrl(sd.currentUrl);
      if (sd.observedOutcome) sd.observedOutcome = scrubOptionalText(sd.observedOutcome);
      if (sd.dialogOpened) sd.dialogOpened = scrubOptionalText(sd.dialogOpened);
      if (sd.previousAction && typeof sd.previousAction === 'object') {
        const pa: any = { ...sd.previousAction };
        if (pa.targetName) pa.targetName = scrubOptionalText(pa.targetName);
        if (pa.textToType) pa.textToType = scrubOptionalText(pa.textToType);
        if (pa.expectedState) pa.expectedState = scrubOptionalText(pa.expectedState);
        sd.previousAction = pa;
      }
      ps.stateDelta = sd;
    }
    result.pageState = ps;
  }

  if (result.history && Array.isArray(result.history)) {
    result.history = scrubHistory(result.history);
  }

  if (result.customPrompt) {
    result.customPrompt = scrubOptionalText(result.customPrompt);
  }

  if (result.executionFeedback && typeof result.executionFeedback === 'object') {
    const ef: any = { ...result.executionFeedback };
    if (Array.isArray(ef.completedTasks)) ef.completedTasks = ef.completedTasks.map(scrubOptionalText);
    if (Array.isArray(ef.remainingTasks)) ef.remainingTasks = ef.remainingTasks.map(scrubOptionalText);
    if (ef.outcomeCode) ef.outcomeCode = scrubOptionalText(ef.outcomeCode);
    result.executionFeedback = ef;
  }

  if (result.observedOutcome) {
    result.observedOutcome = scrubOptionalText(result.observedOutcome);
  }

  if (result.recentActionHistory && Array.isArray(result.recentActionHistory)) {
    result.recentActionHistory = result.recentActionHistory.map((item: any) => {
      const copy: any = { ...item };
      if (copy.observedOutcome) copy.observedOutcome = scrubOptionalText(copy.observedOutcome);
      return copy;
    });
  }

  if (result.searchResults && Array.isArray(result.searchResults)) {
    result.searchResults = result.searchResults.map((r: any) => ({
      ...r,
      url: sanitizeOutboundUrl(r.url),
      title: scrubOptionalText(r.title || ''),
      content: scrubOptionalText(r.content || '')
    }));
  }

  if (result.taskSpecification && typeof result.taskSpecification === 'object') {
    const ts: any = { ...result.taskSpecification };
    if (ts.goal) ts.goal = scrubOptionalText(ts.goal);
    if (ts.contextUrl) ts.contextUrl = sanitizeOutboundUrl(ts.contextUrl);
    if (Array.isArray(ts.tasksToDo)) ts.tasksToDo = ts.tasksToDo.map(scrubOptionalText);
    if (Array.isArray(ts.tasksNotToDo)) ts.tasksNotToDo = ts.tasksNotToDo.map(scrubOptionalText);
    if (ts.successCriteria) ts.successCriteria = scrubOptionalText(ts.successCriteria);
    if (Array.isArray(ts.subAgentTasks)) {
      ts.subAgentTasks = ts.subAgentTasks.map((st: any) => ({
        ...st,
        targetEntityOrUrl: sanitizeOutboundUrl(st.targetEntityOrUrl || ''),
        goal: scrubOptionalText(st.goal || '')
      }));
    }
    result.taskSpecification = ts;
  }

  if (result.currentObjective && typeof result.currentObjective === 'object') {
    const co: any = { ...result.currentObjective };
    if (co.description) co.description = scrubOptionalText(co.description);
    if (co.targetPhrase) co.targetPhrase = scrubOptionalText(co.targetPhrase);
    if (co.extractedValue) co.extractedValue = scrubOptionalText(co.extractedValue);
    result.currentObjective = co;
  }

  if (result.objectiveProgress && typeof result.objectiveProgress === 'object') {
    const op: any = { ...result.objectiveProgress };
    if (Array.isArray(op.evidence)) {
      op.evidence = op.evidence.map((ev: any) => ({
        ...ev,
        summary: scrubOptionalText(ev.summary || '')
      }));
    }
    result.objectiveProgress = op;
  }

  if (result.previousAction && typeof result.previousAction === 'object') {
    const pa: any = { ...result.previousAction };
    if (pa.targetName) pa.targetName = scrubOptionalText(pa.targetName);
    result.previousAction = pa;
  }

  return result;
}
