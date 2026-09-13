/**
 * @privapilot/server - Closed Request Payload Schema Validator
 *
 * Implements strict closed recursive schemas for /api/v1/reason and /api/v1/chat.
 * Rejects every unknown root or nested key, prototype-pollution attempts,
 * enforces bounded lengths, counts, decoded screenshot sizes, explicit allowlists,
 * and duplicate/contradiction checks without reflecting submitted values.
 */
const ALLOWED_REASONING_ROOT_KEYS = new Set([
    'protocolVersion',
    'runId',
    'goal',
    'screenshot',
    'elements',
    'pageState',
    'redactionManifest'
]);
const ALLOWED_CHAT_ROOT_KEYS = new Set([
    'protocolVersion',
    'message',
    'elements',
    'sanitizedTitle',
    'maskCount',
    'history'
]);
const ALLOWED_ELEMENT_KEYS = new Set([
    'localId',
    'role',
    'sanitizedName',
    'coarseBounds',
    'state',
    'actionCapabilities',
    'containerContext',
    'nearestHeading',
    'isInsideDialog'
]);
const ALLOWED_PAGE_STATE_KEYS = new Set([
    'title',
    'viewport',
    'visibleDialogCount',
    'dialogTitles',
    'statusSummaries',
    'routeFingerprint',
    'postconditionSummary',
    'counters',
    'contentSummaries',
    'domain'
]);
const ALLOWED_MANIFEST_KEYS = new Set([
    'manifestVersion',
    'totalRegions',
    'categoryCounts',
    'methodCounts',
    'placeholderConvention',
    'geometrySemantics',
    'pixelVerificationPerformed',
    'pixelVerificationPassed',
    'uninspectableSurfacePolicy',
    'visionAttempted',
    'visionSucceeded',
    'visionProvider',
    'visionModel',
    'durationMs'
]);
const VALID_ROLES = new Set([
    'button',
    'link',
    'input',
    'select',
    'textarea',
    'checkbox',
    'radio',
    'menuitem',
    'tab',
    'heading',
    'dialog',
    'generic'
]);
const VALID_ELEMENT_STATES = new Set([
    'enabled',
    'disabled',
    'visible',
    'checked',
    'focused'
]);
const VALID_ACTION_CAPABILITIES = new Set([
    'click',
    'type',
    'select',
    'scroll',
    'hover',
    'drag',
    'upload'
]);
const PROHIBITED_PROPERTY_NAMES = new Set([
    '__proto__',
    'constructor',
    'prototype'
]);
const PROHIBITED_SCRIPT_PATTERNS = [
    /<script\b/i,
    /javascript:/i,
    /vbscript:/i,
    /data:text\/html/i,
    /on\w+\s*=/i,
    /\beval\s*\(/i,
    /\bexpression\s*\(/i
];
const LOCAL_ID_REGEX = /^[a-zA-Z0-9_-]{1,64}$/;
const RUN_ID_REGEX = /^[a-zA-Z0-9_-]{1,128}$/;
const SCREENSHOT_DATA_URL_REGEX = /^data:image\/(?:png|jpeg|webp);base64,([A-Za-z0-9+/=]+)$/;
const MAX_DECODED_SCREENSHOT_BYTES = 4 * 1024 * 1024; // 4MB
/**
 * Checks if a value is a genuine plain JSON object without prototype tampering.
 */
function isPlainObject(val) {
    if (!val || typeof val !== 'object' || Array.isArray(val)) {
        return false;
    }
    const proto = Object.getPrototypeOf(val);
    if (proto !== null && proto !== Object.prototype) {
        return false;
    }
    if (Object.getOwnPropertySymbols(val).length > 0) {
        return false;
    }
    return true;
}
/**
 * Checks if a string contains prohibited executable or script patterns.
 */
function hasProhibitedScriptPattern(str) {
    return PROHIBITED_SCRIPT_PATTERNS.some((pattern) => pattern.test(str));
}
/**
 * Validates a single element against the strict closed SanitizedElement schema.
 */
function validateElement(el, index, isChat = false) {
    if (!isPlainObject(el)) {
        return { isValid: false, errorMessage: `Element at index ${index} must be an object` };
    }
    // Reject unknown or prohibited nested element keys
    const ownKeys = Object.getOwnPropertyNames(el);
    for (const k of ownKeys) {
        if (PROHIBITED_PROPERTY_NAMES.has(k) || !ALLOWED_ELEMENT_KEYS.has(k)) {
            return {
                isValid: false,
                errorMessage: `Closed schema violation: Unknown nested element property at index ${index}`
            };
        }
    }
    // localId
    if (!el.localId || typeof el.localId !== 'string') {
        return { isValid: false, errorMessage: `Element at index ${index} is missing a valid "localId"` };
    }
    if (!LOCAL_ID_REGEX.test(el.localId) || el.localId.startsWith('#') || el.localId.startsWith('.')) {
        return {
            isValid: false,
            errorMessage: `Invalid localId format at index ${index}. Raw selectors prohibited`
        };
    }
    // role
    if (el.role === undefined) {
        if (!isChat) {
            return { isValid: false, errorMessage: `Invalid or missing role at index ${index}` };
        }
    }
    else {
        if (typeof el.role !== 'string' || !VALID_ROLES.has(el.role)) {
            return { isValid: false, errorMessage: `Invalid role at index ${index}` };
        }
    }
    // sanitizedName
    if (el.sanitizedName !== undefined) {
        if (typeof el.sanitizedName !== 'string' || el.sanitizedName.length > 120) {
            return { isValid: false, errorMessage: `sanitizedName at index ${index} must be a string up to 120 chars` };
        }
        if (hasProhibitedScriptPattern(el.sanitizedName)) {
            return { isValid: false, errorMessage: `sanitizedName at index ${index} contains prohibited script patterns` };
        }
    }
    // coarseBounds: [x, y, w, h] between 0 and 1
    if (el.coarseBounds !== undefined) {
        if (!Array.isArray(el.coarseBounds) || el.coarseBounds.length !== 4) {
            return { isValid: false, errorMessage: `coarseBounds at index ${index} must be an array of 4 numbers [x, y, w, h]` };
        }
        for (let b = 0; b < 4; b++) {
            const val = el.coarseBounds[b];
            if (typeof val !== 'number' || !Number.isFinite(val) || Number.isNaN(val) || val < 0 || val > 1) {
                return { isValid: false, errorMessage: `coarseBounds values at index ${index} must be numbers between 0 and 1` };
            }
        }
    }
    // state
    if (el.state !== undefined) {
        if (!Array.isArray(el.state)) {
            return { isValid: false, errorMessage: `state at index ${index} must be an array` };
        }
        const seenStates = new Set();
        for (let sIdx = 0; sIdx < el.state.length; sIdx++) {
            const s = el.state[sIdx];
            if (typeof s !== 'string' || !VALID_ELEMENT_STATES.has(s)) {
                return { isValid: false, errorMessage: `Invalid state value at index ${index}` };
            }
            if (seenStates.has(s)) {
                return { isValid: false, errorMessage: `Duplicate state value at index ${index}` };
            }
            seenStates.add(s);
        }
        if (seenStates.has('enabled') && seenStates.has('disabled')) {
            return {
                isValid: false,
                errorMessage: `Contradictory element state at index ${index}: cannot be both enabled and disabled`
            };
        }
    }
    // actionCapabilities
    if (el.actionCapabilities !== undefined) {
        if (!Array.isArray(el.actionCapabilities)) {
            return { isValid: false, errorMessage: `actionCapabilities at index ${index} must be an array` };
        }
        const seenCaps = new Set();
        for (let cIdx = 0; cIdx < el.actionCapabilities.length; cIdx++) {
            const cap = el.actionCapabilities[cIdx];
            if (typeof cap !== 'string' || !VALID_ACTION_CAPABILITIES.has(cap)) {
                return { isValid: false, errorMessage: `Invalid actionCapability value at index ${index}` };
            }
            if (seenCaps.has(cap)) {
                return { isValid: false, errorMessage: `Duplicate actionCapability value at index ${index}` };
            }
            seenCaps.add(cap);
        }
    }
    // containerContext
    if (el.containerContext !== undefined) {
        if (typeof el.containerContext !== 'string' || el.containerContext.length > 300) {
            return { isValid: false, errorMessage: `containerContext at index ${index} must be a string up to 300 chars` };
        }
        if (hasProhibitedScriptPattern(el.containerContext)) {
            return { isValid: false, errorMessage: `Unsafe characters or script patterns prohibited in containerContext at index ${index}` };
        }
    }
    // nearestHeading
    if (el.nearestHeading !== undefined) {
        if (typeof el.nearestHeading !== 'string' || el.nearestHeading.length > 120) {
            return { isValid: false, errorMessage: `nearestHeading at index ${index} must be a string up to 120 chars` };
        }
        if (hasProhibitedScriptPattern(el.nearestHeading)) {
            return { isValid: false, errorMessage: `Unsafe characters or script patterns prohibited in nearestHeading at index ${index}` };
        }
    }
    // isInsideDialog
    if (el.isInsideDialog !== undefined && typeof el.isInsideDialog !== 'boolean') {
        return { isValid: false, errorMessage: `isInsideDialog at index ${index} must be a boolean` };
    }
    return { isValid: true };
}
/**
 * Validates /api/v1/reason incoming payload against closed recursive schema.
 */
export function validateSanitizedPayload(body) {
    if (!isPlainObject(body)) {
        return { isValid: false, errorMessage: 'Request body must be a JSON object' };
    }
    // 1. Closed Schema: Reject unknown or prohibited root keys
    const rootKeys = Object.getOwnPropertyNames(body);
    for (const key of rootKeys) {
        if (PROHIBITED_PROPERTY_NAMES.has(key) || !ALLOWED_REASONING_ROOT_KEYS.has(key)) {
            return {
                isValid: false,
                errorMessage: 'Closed schema violation: Unknown property is prohibited'
            };
        }
    }
    // 2. Validate Protocol Version
    if (body.protocolVersion !== '1.0') {
        return {
            isValid: false,
            errorMessage: 'Unsupported protocol version. Expected "1.0"'
        };
    }
    // 3. Validate runId
    if (typeof body.runId !== 'string' || !RUN_ID_REGEX.test(body.runId)) {
        return {
            isValid: false,
            errorMessage: 'Invalid or missing "runId"'
        };
    }
    // 4. Validate Goal
    if (typeof body.goal !== 'string' || body.goal.trim().length === 0 || body.goal.length > 2000) {
        return { isValid: false, errorMessage: 'Field "goal" must be a non-empty string under 2000 characters' };
    }
    if (hasProhibitedScriptPattern(body.goal)) {
        return { isValid: false, errorMessage: 'Field "goal" contains prohibited script patterns' };
    }
    // 5. Validate Screenshot Data URL & Decoded Size Limit
    if (typeof body.screenshot !== 'string' || body.screenshot.length === 0) {
        return { isValid: false, errorMessage: 'Field "screenshot" must be a non-empty sanitized image string' };
    }
    const screenshotMatch = body.screenshot.match(SCREENSHOT_DATA_URL_REGEX);
    if (!screenshotMatch) {
        return {
            isValid: false,
            errorMessage: 'Field "screenshot" must be a valid base64 data URL (e.g. data:image/png;base64,...)'
        };
    }
    const base64Data = screenshotMatch[1];
    let padding = 0;
    if (base64Data.endsWith('==')) {
        padding = 2;
    }
    else if (base64Data.endsWith('=')) {
        padding = 1;
    }
    const decodedSize = Math.max(1, Math.floor((base64Data.length * 3) / 4) - padding);
    if (decodedSize > MAX_DECODED_SCREENSHOT_BYTES) {
        return { isValid: false, errorMessage: 'Field "screenshot" exceeds maximum allowed size of 4MB' };
    }
    // 6. Validate pageState recursively
    if (body.pageState === undefined || !isPlainObject(body.pageState)) {
        return { isValid: false, errorMessage: 'Field "pageState" must be an object' };
    }
    const pageStateKeys = Object.getOwnPropertyNames(body.pageState);
    for (const pKey of pageStateKeys) {
        if (PROHIBITED_PROPERTY_NAMES.has(pKey) || !ALLOWED_PAGE_STATE_KEYS.has(pKey)) {
            return { isValid: false, errorMessage: 'Closed schema violation: Unknown pageState property' };
        }
    }
    if (typeof body.pageState.title !== 'string' || body.pageState.title.length > 200) {
        return { isValid: false, errorMessage: 'pageState.title must be a string up to 200 characters' };
    }
    if (hasProhibitedScriptPattern(body.pageState.title)) {
        return { isValid: false, errorMessage: 'pageState.title contains prohibited script patterns' };
    }
    if (!Array.isArray(body.pageState.viewport) || body.pageState.viewport.length !== 2) {
        return { isValid: false, errorMessage: 'pageState.viewport must be an array of [width, height]' };
    }
    const [vpWidth, vpHeight] = body.pageState.viewport;
    if (typeof vpWidth !== 'number' ||
        !Number.isFinite(vpWidth) ||
        Number.isNaN(vpWidth) ||
        vpWidth <= 0 ||
        vpWidth > 100000 ||
        typeof vpHeight !== 'number' ||
        !Number.isFinite(vpHeight) ||
        Number.isNaN(vpHeight) ||
        vpHeight <= 0 ||
        vpHeight > 100000) {
        return { isValid: false, errorMessage: 'pageState.viewport dimensions must be positive finite numbers' };
    }
    if (body.pageState.visibleDialogCount !== undefined) {
        if (typeof body.pageState.visibleDialogCount !== 'number' || !Number.isInteger(body.pageState.visibleDialogCount) || body.pageState.visibleDialogCount < 0) {
            return { isValid: false, errorMessage: 'pageState.visibleDialogCount must be a non-negative integer' };
        }
    }
    if (body.pageState.dialogTitles !== undefined) {
        if (!Array.isArray(body.pageState.dialogTitles) || body.pageState.dialogTitles.length > 50) {
            return { isValid: false, errorMessage: 'pageState.dialogTitles must be an array up to 50 items' };
        }
        for (const title of body.pageState.dialogTitles) {
            if (typeof title !== 'string' || title.length > 200 || hasProhibitedScriptPattern(title)) {
                return { isValid: false, errorMessage: 'pageState.dialogTitles contains invalid or unsafe string' };
            }
        }
    }
    if (body.pageState.statusSummaries !== undefined) {
        if (!Array.isArray(body.pageState.statusSummaries) || body.pageState.statusSummaries.length > 50) {
            return { isValid: false, errorMessage: 'pageState.statusSummaries must be an array up to 50 items' };
        }
        for (const summary of body.pageState.statusSummaries) {
            if (typeof summary !== 'string' || summary.length > 300 || hasProhibitedScriptPattern(summary)) {
                return { isValid: false, errorMessage: 'pageState.statusSummaries contains invalid or unsafe string' };
            }
        }
    }
    if (body.pageState.routeFingerprint !== undefined) {
        if (typeof body.pageState.routeFingerprint !== 'string' || body.pageState.routeFingerprint.length > 200 || hasProhibitedScriptPattern(body.pageState.routeFingerprint)) {
            return { isValid: false, errorMessage: 'pageState.routeFingerprint must be a safe string up to 200 characters' };
        }
    }
    if (body.pageState.postconditionSummary !== undefined) {
        if (typeof body.pageState.postconditionSummary !== 'string' || body.pageState.postconditionSummary.length > 500 || hasProhibitedScriptPattern(body.pageState.postconditionSummary)) {
            return { isValid: false, errorMessage: 'pageState.postconditionSummary must be a safe string up to 500 characters' };
        }
    }
    if (body.pageState.counters !== undefined) {
        if (!Array.isArray(body.pageState.counters) || body.pageState.counters.length > 50) {
            return { isValid: false, errorMessage: 'pageState.counters must be an array up to 50 items' };
        }
        for (const c of body.pageState.counters) {
            if (!isPlainObject(c) || typeof c.label !== 'string' || typeof c.value !== 'string' || c.label.length > 200 || c.value.length > 200) {
                return { isValid: false, errorMessage: 'pageState.counters items must have label and value strings up to 200 characters' };
            }
            if (hasProhibitedScriptPattern(c.label) || hasProhibitedScriptPattern(c.value)) {
                return { isValid: false, errorMessage: 'pageState.counters contains invalid or unsafe string' };
            }
        }
    }
    if (body.pageState.contentSummaries !== undefined) {
        if (!Array.isArray(body.pageState.contentSummaries) || body.pageState.contentSummaries.length > 50) {
            return { isValid: false, errorMessage: 'pageState.contentSummaries must be an array up to 50 items' };
        }
        for (const s of body.pageState.contentSummaries) {
            if (typeof s !== 'string' || s.length > 500 || hasProhibitedScriptPattern(s)) {
                return { isValid: false, errorMessage: 'pageState.contentSummaries contains invalid or unsafe string' };
            }
        }
    }
    if (body.pageState.domain !== undefined) {
        if (typeof body.pageState.domain !== 'string' || body.pageState.domain.length > 100 || hasProhibitedScriptPattern(body.pageState.domain)) {
            return { isValid: false, errorMessage: 'pageState.domain must be a safe string up to 100 characters' };
        }
    }
    // 6b. Validate redactionManifest if present
    if (body.redactionManifest !== undefined) {
        if (!isPlainObject(body.redactionManifest)) {
            return { isValid: false, errorMessage: 'Field "redactionManifest" must be an object' };
        }
        const manifestKeys = Object.getOwnPropertyNames(body.redactionManifest);
        for (const mKey of manifestKeys) {
            if (PROHIBITED_PROPERTY_NAMES.has(mKey) || !ALLOWED_MANIFEST_KEYS.has(mKey)) {
                return { isValid: false, errorMessage: 'Closed schema violation: Unknown redactionManifest property' };
            }
        }
        const m = body.redactionManifest;
        if (m.manifestVersion !== '1.0') {
            return { isValid: false, errorMessage: 'redactionManifest.manifestVersion must be "1.0"' };
        }
        if (typeof m.totalRegions !== 'number' || m.totalRegions < 0 || !Number.isInteger(m.totalRegions)) {
            return { isValid: false, errorMessage: 'redactionManifest.totalRegions must be a non-negative integer' };
        }
        if (m.placeholderConvention !== undefined && m.placeholderConvention !== '[REDACTED]') {
            return { isValid: false, errorMessage: 'redactionManifest.placeholderConvention must be "[REDACTED]"' };
        }
        if (m.geometrySemantics !== undefined && m.geometrySemantics !== 'clamped_css_pixels') {
            return { isValid: false, errorMessage: 'redactionManifest.geometrySemantics must be "clamped_css_pixels"' };
        }
        if (m.uninspectableSurfacePolicy !== undefined && m.uninspectableSurfacePolicy !== 'fail_closed') {
            return { isValid: false, errorMessage: 'redactionManifest.uninspectableSurfacePolicy must be "fail_closed"' };
        }
        // Validate categoryCounts consistency
        if (m.categoryCounts !== undefined) {
            if (!isPlainObject(m.categoryCounts)) {
                return { isValid: false, errorMessage: 'redactionManifest.categoryCounts must be an object' };
            }
            const cc = m.categoryCounts;
            const piiText = typeof cc.piiText === 'number' ? cc.piiText : 0;
            const domInput = typeof cc.domInput === 'number' ? cc.domInput : 0;
            const face = typeof cc.face === 'number' ? cc.face : 0;
            const surface = typeof cc.surface === 'number' ? cc.surface : 0;
            if (piiText + domInput + face + surface !== m.totalRegions) {
                return { isValid: false, errorMessage: 'Contradictory manifest: categoryCounts sum does not match totalRegions' };
            }
        }
        // Validate methodCounts consistency
        if (m.methodCounts !== undefined) {
            if (!isPlainObject(m.methodCounts)) {
                return { isValid: false, errorMessage: 'redactionManifest.methodCounts must be an object' };
            }
            const mc = m.methodCounts;
            const opaqueBox = typeof mc.opaqueBox === 'number' ? mc.opaqueBox : 0;
            const spatialBlur = typeof mc.spatialBlur === 'number' ? mc.spatialBlur : 0;
            if (opaqueBox + spatialBlur !== m.totalRegions) {
                return { isValid: false, errorMessage: 'Contradictory manifest: methodCounts sum does not match totalRegions' };
            }
        }
        // Screenshot transmission requires verified passed pixel check
        if (body.screenshot && m.pixelVerificationPerformed !== undefined) {
            if (!m.pixelVerificationPerformed || !m.pixelVerificationPassed) {
                return { isValid: false, errorMessage: 'Privacy violation: Screenshot payload requires passed pixel verification gate' };
            }
        }
    }
    // 7. Validate Elements
    if (!Array.isArray(body.elements)) {
        return { isValid: false, errorMessage: 'Field "elements" must be an array' };
    }
    if (body.elements.length > 200) {
        return { isValid: false, errorMessage: 'Field "elements" exceeds maximum allowed count of 200 elements' };
    }
    const seenLocalIds = new Set();
    for (let i = 0; i < body.elements.length; i++) {
        const el = body.elements[i];
        const elRes = validateElement(el, i, false);
        if (!elRes.isValid) {
            return { isValid: false, errorMessage: elRes.errorMessage };
        }
        if (seenLocalIds.has(el.localId)) {
            return { isValid: false, errorMessage: `Duplicate element localId at index ${i}` };
        }
        seenLocalIds.add(el.localId);
    }
    return {
        isValid: true,
        payload: body
    };
}
/**
 * Validates /api/v1/chat incoming payload against closed schema.
 */
export function validateSanitizedChatPayload(body) {
    if (!isPlainObject(body)) {
        return { isValid: false, errorMessage: 'Request body must be a JSON object' };
    }
    // 1. Closed Schema: Reject unknown or prohibited root keys
    const rootKeys = Object.getOwnPropertyNames(body);
    for (const key of rootKeys) {
        if (PROHIBITED_PROPERTY_NAMES.has(key) || !ALLOWED_CHAT_ROOT_KEYS.has(key)) {
            return {
                isValid: false,
                errorMessage: 'Closed schema violation: Unknown property is prohibited'
            };
        }
    }
    // 2. Protocol Version
    if (body.protocolVersion !== '1.0') {
        return {
            isValid: false,
            errorMessage: 'Unsupported protocol version. Expected "1.0"'
        };
    }
    // 3. Message
    if (typeof body.message !== 'string' || body.message.trim().length === 0) {
        return { isValid: false, errorMessage: 'Field "message" must be a non-empty string' };
    }
    if (body.message.length > 2000) {
        return { isValid: false, errorMessage: 'Field "message" exceeds maximum length of 2000 characters' };
    }
    if (hasProhibitedScriptPattern(body.message)) {
        return { isValid: false, errorMessage: 'Field "message" contains prohibited script patterns' };
    }
    // 4. Sanitized Title
    if (body.sanitizedTitle !== undefined) {
        if (typeof body.sanitizedTitle !== 'string' || body.sanitizedTitle.length > 200) {
            return { isValid: false, errorMessage: 'Field "sanitizedTitle" must be a string up to 200 characters' };
        }
        if (hasProhibitedScriptPattern(body.sanitizedTitle)) {
            return { isValid: false, errorMessage: 'Field "sanitizedTitle" contains prohibited script patterns' };
        }
    }
    // 5. Mask Count
    if (body.maskCount !== undefined) {
        if (typeof body.maskCount !== 'number' || !Number.isInteger(body.maskCount) || body.maskCount < 0) {
            return { isValid: false, errorMessage: 'Field "maskCount" must be a non-negative integer' };
        }
    }
    // 6. Elements
    if (body.elements !== undefined) {
        if (!Array.isArray(body.elements)) {
            return { isValid: false, errorMessage: 'Field "elements" must be an array' };
        }
        if (body.elements.length > 100) {
            return { isValid: false, errorMessage: 'Field "elements" exceeds maximum allowed count of 100 elements' };
        }
        const seenLocalIds = new Set();
        for (let i = 0; i < body.elements.length; i++) {
            const el = body.elements[i];
            const elRes = validateElement(el, i, true);
            if (!elRes.isValid) {
                return { isValid: false, errorMessage: elRes.errorMessage };
            }
            if (seenLocalIds.has(el.localId)) {
                return { isValid: false, errorMessage: `Duplicate element localId at index ${i}` };
            }
            seenLocalIds.add(el.localId);
        }
    }
    // 7. History (Multi-turn conversational context)
    if (body.history !== undefined) {
        if (!Array.isArray(body.history)) {
            return { isValid: false, errorMessage: 'Field "history" must be an array' };
        }
        if (body.history.length > 30) {
            return { isValid: false, errorMessage: 'Field "history" exceeds maximum allowed count of 30 messages' };
        }
        for (let i = 0; i < body.history.length; i++) {
            const entry = body.history[i];
            if (!isPlainObject(entry)) {
                return { isValid: false, errorMessage: `History entry at index ${i} must be an object` };
            }
            const entryKeys = Object.getOwnPropertyNames(entry);
            for (const k of entryKeys) {
                if (k !== 'role' && k !== 'content') {
                    return { isValid: false, errorMessage: `History entry at index ${i} contains unknown property "${k}"` };
                }
            }
            if (entry.role !== 'user' && entry.role !== 'assistant') {
                return { isValid: false, errorMessage: `History entry at index ${i} role must be "user" or "assistant"` };
            }
            if (typeof entry.content !== 'string') {
                return { isValid: false, errorMessage: `History entry at index ${i} content must be a string` };
            }
            if (entry.content.length > 4000) {
                return { isValid: false, errorMessage: `History entry at index ${i} content exceeds maximum length of 4000 characters` };
            }
            if (hasProhibitedScriptPattern(entry.content)) {
                return { isValid: false, errorMessage: `History entry at index ${i} contains prohibited script patterns` };
            }
        }
    }
    return {
        isValid: true,
        payload: body
    };
}
//# sourceMappingURL=payload-validator.js.map