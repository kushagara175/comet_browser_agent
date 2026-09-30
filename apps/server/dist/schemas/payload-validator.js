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
    'redactionManifest',
    'history',
    'customPrompt',
    'executionFeedback',
    'taskSpecification',
    'objectiveProgress',
    'currentObjective',
    'previousAction',
    'expectedPostcondition',
    'observedOutcome',
    'meaningfulProgress',
    'recentActionHistory',
    'searchResults'
]);
const ALLOWED_CHAT_ROOT_KEYS = new Set([
    'protocolVersion',
    'message',
    'elements',
    'sanitizedTitle',
    'maskCount',
    'history',
    'customPrompt'
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
    'isInsideDialog',
    'verticalOffset',
    'inViewport'
]);
const ALLOWED_PAGE_STATE_KEYS = new Set([
    'title',
    'pageTitle',
    'viewport',
    'visibleDialogCount',
    'dialogTitles',
    'statusSummaries',
    'routeFingerprint',
    'postconditionSummary',
    'counters',
    'contentSummaries',
    'domain',
    'scrollMetrics',
    'url',
    'canonicalUrl',
    'stateDelta',
    'pageZone'
]);
const ALLOWED_STATE_DELTA_KEYS = new Set([
    'previousAction',
    'urlChanged',
    'previousUrl',
    'currentUrl',
    'elementsAddedCount',
    'elementsRemovedCount',
    'scrollDeltaY',
    'dialogOpened',
    'observedOutcome',
    'verificationPassed'
]);
const ALLOWED_PREVIOUS_ACTION_KEYS = new Set([
    'kind',
    'targetName',
    'targetLocalId',
    'textToType',
    'expectedState'
]);
const ALLOWED_SCROLL_METRICS_KEYS = new Set([
    'scrollTop',
    'scrollHeight',
    'clientHeight',
    'maxScrollTop',
    'scrollableBelow',
    'scrollableAbove',
    'pixelsBelow',
    'pixelsAbove'
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
    'categoryBreakdown',
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
    'focused',
    'filled'
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
    /\bon(?:load|error|click|mouse\w+|key\w+|focus|blur|change|submit|reset|select|contextmenu|drag\w*|drop|wheel|scroll|touch\w*|animation\w*|transition\w*)\s*=/i,
    /\beval\s*\(/i,
    /\bexpression\s*\(/i
];
const LOCAL_ID_REGEX = /^[a-zA-Z0-9_-]{1,64}$/;
const RUN_ID_REGEX = /^[a-zA-Z0-9_-]{1,128}$/;
const SCREENSHOT_DATA_URL_REGEX = /^data:image\/(?:png|jpeg|webp);base64,([A-Za-z0-9+/=]+)$/;
const MAX_DECODED_SCREENSHOT_BYTES = 4 * 1024 * 1024; // 4MB
const OBJECTIVE_ID_REGEX = /^[a-zA-Z0-9_-]{1,128}$/;
const VALID_OBJECTIVE_INTENTS = new Set(['navigate', 'search', 'select_result', 'open_section', 'inspect', 'extract', 'compare', 'summarize', 'fill', 'submit', 'download', 'verify']);
const VALID_OBJECTIVE_STATUSES = new Set(['pending', 'active', 'completed', 'blocked', 'failed']);
const VALID_EVIDENCE_KINDS = new Set(['url', 'element', 'text', 'input_value', 'dialog', 'attribute', 'scroll', 'visual_change']);
function validateSafeString(value, maxLength) {
    return typeof value === 'string' && value.length <= maxLength && !hasProhibitedScriptPattern(value);
}
function hasOnlyKeys(value, allowed) {
    return isPlainObject(value) && Object.getOwnPropertyNames(value).every((key) => !PROHIBITED_PROPERTY_NAMES.has(key) && allowed.has(key));
}
function validateObjective(objective) {
    const keys = new Set(['id', 'sequence', 'intent', 'description', 'targetPhrase', 'extractedValue', 'expectedEvidence', 'status', 'dependsOn']);
    if (!hasOnlyKeys(objective, keys))
        return 'Closed schema violation: Invalid objective property';
    if (!OBJECTIVE_ID_REGEX.test(objective.id || ''))
        return 'Objective id is invalid';
    if (!Number.isInteger(objective.sequence) || objective.sequence < 1 || objective.sequence > 1000)
        return 'Objective sequence is invalid';
    if (!VALID_OBJECTIVE_INTENTS.has(objective.intent))
        return 'Objective intent is invalid';
    if (!validateSafeString(objective.description, 500) || objective.description.trim().length === 0)
        return 'Objective description is invalid';
    if (objective.targetPhrase !== undefined && !validateSafeString(objective.targetPhrase, 200))
        return 'Objective targetPhrase is invalid';
    if (objective.extractedValue !== undefined && !validateSafeString(objective.extractedValue, 1000))
        return 'Objective extractedValue is invalid';
    if (!Array.isArray(objective.expectedEvidence) || objective.expectedEvidence.length < 1 || objective.expectedEvidence.length > 10 || objective.expectedEvidence.some((item) => !validateSafeString(item, 300)))
        return 'Objective expectedEvidence is invalid';
    if (!VALID_OBJECTIVE_STATUSES.has(objective.status))
        return 'Objective status is invalid';
    if (objective.dependsOn !== undefined && (!Array.isArray(objective.dependsOn) || objective.dependsOn.length > 10 || objective.dependsOn.some((item) => !OBJECTIVE_ID_REGEX.test(item))))
        return 'Objective dependsOn is invalid';
    return undefined;
}
function validateExpectedPostcondition(postcondition) {
    if (!isPlainObject(postcondition) || typeof postcondition.kind !== 'string')
        return 'Expected postcondition is invalid';
    const keysByKind = {
        dialog_visible: new Set(['kind', 'dialogId']), panel_visible: new Set(['kind', 'namePattern']), element_visible: new Set(['kind', 'targetLocalId', 'namePattern']),
        element_count_changed: new Set(['kind', 'minimumDelta']), visual_change: new Set(['kind', 'minimumChangeRatio']), map_location_changed: new Set(['kind', 'locationPattern']),
        search_results_visible: new Set(['kind', 'queryPattern']), content_visible: new Set(['kind', 'textPattern']), url_changed: new Set(['kind', 'expectedPathFragment']),
        attribute_changed: new Set(['kind', 'attributeName', 'expectedValue']), value_present: new Set(['kind', 'expectedValueFragment']), select_changed: new Set(['kind', 'expectedOptionValue']),
        status_changed: new Set(['kind', 'statusId']), scroll_changed: new Set(['kind', 'direction']), visibility_changed: new Set(['kind', 'targetLocalId', 'state']), answer_supported: new Set(['kind', 'queryTopic'])
    };
    const allowed = keysByKind[postcondition.kind];
    if (!allowed || !hasOnlyKeys(postcondition, allowed))
        return 'Closed schema violation: Invalid expected postcondition property';
    for (const value of Object.values(postcondition))
        if (typeof value === 'string' && !validateSafeString(value, 500))
            return 'Expected postcondition contains unsafe text';
    return undefined;
}
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
    // verticalOffset
    if (el.verticalOffset !== undefined) {
        if (el.verticalOffset !== 'in_view' && el.verticalOffset !== 'above' && el.verticalOffset !== 'below') {
            return { isValid: false, errorMessage: `verticalOffset at index ${index} must be 'in_view', 'above', or 'below'` };
        }
    }
    // inViewport
    if (el.inViewport !== undefined && typeof el.inViewport !== 'boolean') {
        return { isValid: false, errorMessage: `inViewport at index ${index} must be a boolean` };
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
            return { isValid: false, errorMessage: `Closed schema violation: Unknown pageState property "${pKey}"` };
        }
    }
    if (typeof body.pageState.title !== 'string' || body.pageState.title.length > 200) {
        return { isValid: false, errorMessage: 'pageState.title must be a string up to 200 characters' };
    }
    if (hasProhibitedScriptPattern(body.pageState.title)) {
        return { isValid: false, errorMessage: 'pageState.title contains prohibited script patterns' };
    }
    if (body.pageState.pageTitle !== undefined) {
        if (typeof body.pageState.pageTitle !== 'string' || body.pageState.pageTitle.length > 200) {
            return { isValid: false, errorMessage: 'pageState.pageTitle must be a string up to 200 characters' };
        }
        if (hasProhibitedScriptPattern(body.pageState.pageTitle)) {
            return { isValid: false, errorMessage: 'pageState.pageTitle contains prohibited script patterns' };
        }
    }
    if (body.pageState.canonicalUrl !== undefined) {
        if (typeof body.pageState.canonicalUrl !== 'string' || body.pageState.canonicalUrl.length > 2048) {
            return { isValid: false, errorMessage: 'pageState.canonicalUrl must be a string up to 2048 characters' };
        }
        if (hasProhibitedScriptPattern(body.pageState.canonicalUrl)) {
            return { isValid: false, errorMessage: 'pageState.canonicalUrl contains prohibited script patterns' };
        }
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
    if (body.pageState.pageZone !== undefined) {
        const validZones = new Set(['private_workspace', 'hybrid', 'public_broadcast']);
        if (typeof body.pageState.pageZone !== 'string' || !validZones.has(body.pageState.pageZone)) {
            return { isValid: false, errorMessage: 'pageState.pageZone must be private_workspace, hybrid, or public_broadcast' };
        }
    }
    if (body.pageState.scrollMetrics !== undefined) {
        if (!isPlainObject(body.pageState.scrollMetrics)) {
            return { isValid: false, errorMessage: 'pageState.scrollMetrics must be an object' };
        }
        const smKeys = Object.getOwnPropertyNames(body.pageState.scrollMetrics);
        for (const k of smKeys) {
            if (PROHIBITED_PROPERTY_NAMES.has(k) || !ALLOWED_SCROLL_METRICS_KEYS.has(k)) {
                return { isValid: false, errorMessage: 'Closed schema violation: Unknown scrollMetrics property' };
            }
        }
        const sm = body.pageState.scrollMetrics;
        const numFields = ['scrollTop', 'scrollHeight', 'clientHeight', 'maxScrollTop', 'pixelsBelow', 'pixelsAbove'];
        for (const f of numFields) {
            if (typeof sm[f] !== 'number' || !Number.isFinite(sm[f]) || sm[f] < 0) {
                return { isValid: false, errorMessage: `pageState.scrollMetrics.${f} must be a non-negative number` };
            }
        }
        if (typeof sm.scrollableBelow !== 'boolean' || typeof sm.scrollableAbove !== 'boolean') {
            return { isValid: false, errorMessage: 'pageState.scrollMetrics scrollable flags must be booleans' };
        }
    }
    if (body.pageState.url !== undefined) {
        if (typeof body.pageState.url !== 'string') {
            return { isValid: false, errorMessage: 'pageState.url must be a safe string up to 2048 characters' };
        }
        if (body.pageState.url.length > 2048) {
            body.pageState.url = body.pageState.url.slice(0, 2048);
        }
        if (hasProhibitedScriptPattern(body.pageState.url)) {
            return { isValid: false, errorMessage: 'pageState.url must be a safe string up to 2048 characters' };
        }
    }
    if (body.pageState.stateDelta !== undefined) {
        if (!isPlainObject(body.pageState.stateDelta)) {
            return { isValid: false, errorMessage: 'pageState.stateDelta must be an object' };
        }
        const sdKeys = Object.getOwnPropertyNames(body.pageState.stateDelta);
        for (const k of sdKeys) {
            if (PROHIBITED_PROPERTY_NAMES.has(k) || !ALLOWED_STATE_DELTA_KEYS.has(k)) {
                return { isValid: false, errorMessage: 'Closed schema violation: Unknown stateDelta property' };
            }
        }
        const sd = body.pageState.stateDelta;
        if (sd.urlChanged !== undefined && typeof sd.urlChanged !== 'boolean') {
            return { isValid: false, errorMessage: 'pageState.stateDelta.urlChanged must be a boolean' };
        }
        if (sd.previousUrl !== undefined) {
            if (typeof sd.previousUrl !== 'string') {
                return { isValid: false, errorMessage: 'pageState.stateDelta.previousUrl must be a safe string up to 2048 characters' };
            }
            if (sd.previousUrl.length > 2048) {
                sd.previousUrl = sd.previousUrl.slice(0, 2048);
            }
            if (hasProhibitedScriptPattern(sd.previousUrl)) {
                return { isValid: false, errorMessage: 'pageState.stateDelta.previousUrl must be a safe string up to 2048 characters' };
            }
        }
        if (sd.currentUrl !== undefined) {
            if (typeof sd.currentUrl !== 'string') {
                return { isValid: false, errorMessage: 'pageState.stateDelta.currentUrl must be a safe string up to 2048 characters' };
            }
            if (sd.currentUrl.length > 2048) {
                sd.currentUrl = sd.currentUrl.slice(0, 2048);
            }
            if (hasProhibitedScriptPattern(sd.currentUrl)) {
                return { isValid: false, errorMessage: 'pageState.stateDelta.currentUrl must be a safe string up to 2048 characters' };
            }
        }
        if (sd.elementsAddedCount !== undefined && (typeof sd.elementsAddedCount !== 'number' || !Number.isFinite(sd.elementsAddedCount))) {
            return { isValid: false, errorMessage: 'pageState.stateDelta.elementsAddedCount must be a number' };
        }
        if (sd.elementsRemovedCount !== undefined && (typeof sd.elementsRemovedCount !== 'number' || !Number.isFinite(sd.elementsRemovedCount))) {
            return { isValid: false, errorMessage: 'pageState.stateDelta.elementsRemovedCount must be a number' };
        }
        if (sd.scrollDeltaY !== undefined && (typeof sd.scrollDeltaY !== 'number' || !Number.isFinite(sd.scrollDeltaY))) {
            return { isValid: false, errorMessage: 'pageState.stateDelta.scrollDeltaY must be a number' };
        }
        if (sd.dialogOpened !== undefined && (typeof sd.dialogOpened !== 'string' || sd.dialogOpened.length > 200 || hasProhibitedScriptPattern(sd.dialogOpened))) {
            return { isValid: false, errorMessage: 'pageState.stateDelta.dialogOpened must be a safe string up to 200 characters' };
        }
        if (sd.observedOutcome !== undefined && (typeof sd.observedOutcome !== 'string' || sd.observedOutcome.length > 1000 || hasProhibitedScriptPattern(sd.observedOutcome))) {
            return { isValid: false, errorMessage: 'pageState.stateDelta.observedOutcome must be a safe string up to 1000 characters' };
        }
        if (sd.verificationPassed !== undefined && typeof sd.verificationPassed !== 'boolean') {
            return { isValid: false, errorMessage: 'pageState.stateDelta.verificationPassed must be a boolean' };
        }
        if (sd.previousAction !== undefined) {
            if (!isPlainObject(sd.previousAction)) {
                return { isValid: false, errorMessage: 'pageState.stateDelta.previousAction must be an object' };
            }
            const paKeys = Object.getOwnPropertyNames(sd.previousAction);
            for (const pk of paKeys) {
                if (PROHIBITED_PROPERTY_NAMES.has(pk) || !ALLOWED_PREVIOUS_ACTION_KEYS.has(pk)) {
                    return { isValid: false, errorMessage: 'Closed schema violation: Unknown previousAction property' };
                }
            }
            const pa = sd.previousAction;
            if (typeof pa.kind !== 'string' || pa.kind.length > 50 || hasProhibitedScriptPattern(pa.kind)) {
                return { isValid: false, errorMessage: 'pageState.stateDelta.previousAction.kind must be a safe string up to 50 characters' };
            }
            if (pa.targetName !== undefined && (typeof pa.targetName !== 'string' || pa.targetName.length > 200 || hasProhibitedScriptPattern(pa.targetName))) {
                return { isValid: false, errorMessage: 'pageState.stateDelta.previousAction.targetName must be a safe string up to 200 characters' };
            }
            if (pa.targetLocalId !== undefined && (typeof pa.targetLocalId !== 'string' || pa.targetLocalId.length > 100 || hasProhibitedScriptPattern(pa.targetLocalId))) {
                return { isValid: false, errorMessage: 'pageState.stateDelta.previousAction.targetLocalId must be a safe string up to 100 characters' };
            }
            if (pa.textToType !== undefined && (typeof pa.textToType !== 'string' || pa.textToType.length > 1000 || hasProhibitedScriptPattern(pa.textToType))) {
                return { isValid: false, errorMessage: 'pageState.stateDelta.previousAction.textToType must be a safe string up to 1000 characters' };
            }
            if (pa.expectedState !== undefined && (typeof pa.expectedState !== 'string' || pa.expectedState.length > 200 || hasProhibitedScriptPattern(pa.expectedState))) {
                return { isValid: false, errorMessage: 'pageState.stateDelta.previousAction.expectedState must be a safe string up to 200 characters' };
            }
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
        if (m.categoryBreakdown !== undefined) {
            if (!isPlainObject(m.categoryBreakdown)) {
                return { isValid: false, errorMessage: 'redactionManifest.categoryBreakdown must be an object' };
            }
        }
        // Screenshot transmission requires verified passed pixel check
        if (body.screenshot && (m.totalRegions ?? 0) > 0 && m.pixelVerificationPerformed !== undefined) {
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
    // 9. Validate customPrompt if present
    if (body.customPrompt !== undefined) {
        if (typeof body.customPrompt !== 'string' || body.customPrompt.length > 4000) {
            return { isValid: false, errorMessage: 'Field "customPrompt" must be a string up to 4000 characters' };
        }
        if (hasProhibitedScriptPattern(body.customPrompt)) {
            return { isValid: false, errorMessage: 'Field "customPrompt" contains prohibited script patterns' };
        }
    }
    if (body.taskSpecification !== undefined) {
        const spec = body.taskSpecification;
        const specKeys = new Set(['goal', 'extractedSearchQuery', 'objectives', 'tasksToDo', 'tasksNotToDo', 'successCriteria', 'requiresSubAgents', 'subAgentTasks']);
        if (!hasOnlyKeys(spec, specKeys) || !validateSafeString(spec.goal, 2000) || !Array.isArray(spec.objectives) || spec.objectives.length < 1 || spec.objectives.length > 50) {
            return { isValid: false, errorMessage: 'Field "taskSpecification" is invalid' };
        }
        const objectiveIds = new Set();
        for (const objective of spec.objectives) {
            const error = validateObjective(objective);
            if (error)
                return { isValid: false, errorMessage: error };
            if (objectiveIds.has(objective.id))
                return { isValid: false, errorMessage: 'Duplicate objective id' };
            objectiveIds.add(objective.id);
        }
        for (const objective of spec.objectives) {
            if ((objective.dependsOn || []).some((id) => !objectiveIds.has(id) || id === objective.id))
                return { isValid: false, errorMessage: 'Objective dependency is invalid' };
        }
        for (const field of ['tasksToDo', 'tasksNotToDo']) {
            if (spec[field] !== undefined && (!Array.isArray(spec[field]) || spec[field].length > 50 || spec[field].some((item) => !validateSafeString(item, 500))))
                return { isValid: false, errorMessage: `taskSpecification.${field} is invalid` };
        }
        if (!Array.isArray(spec.tasksNotToDo) || !validateSafeString(spec.successCriteria, 1000))
            return { isValid: false, errorMessage: 'Task specification guardrails or success criteria are invalid' };
        if (spec.extractedSearchQuery !== undefined && !validateSafeString(spec.extractedSearchQuery, 500))
            return { isValid: false, errorMessage: 'taskSpecification.extractedSearchQuery is invalid' };
        if (spec.requiresSubAgents !== undefined && typeof spec.requiresSubAgents !== 'boolean')
            return { isValid: false, errorMessage: 'taskSpecification.requiresSubAgents must be boolean' };
        if (spec.subAgentTasks !== undefined) {
            const subKeys = new Set(['subAgentId', 'targetEntityOrUrl', 'goal']);
            if (!Array.isArray(spec.subAgentTasks) || spec.subAgentTasks.length > 20 || spec.subAgentTasks.some((item) => !hasOnlyKeys(item, subKeys) || !validateSafeString(item.subAgentId, 128) || !validateSafeString(item.targetEntityOrUrl, 2048) || !validateSafeString(item.goal, 2000)))
                return { isValid: false, errorMessage: 'taskSpecification.subAgentTasks is invalid' };
        }
    }
    if (body.currentObjective !== undefined) {
        const error = validateObjective(body.currentObjective);
        if (error)
            return { isValid: false, errorMessage: error };
    }
    if (body.objectiveProgress !== undefined) {
        const progress = body.objectiveProgress;
        const progressKeys = new Set(['currentObjectiveId', 'completedObjectiveIds', 'blockedObjectiveIds', 'attemptCountByObjective', 'evidence']);
        if (!hasOnlyKeys(progress, progressKeys))
            return { isValid: false, errorMessage: 'Closed schema violation: Invalid objectiveProgress property' };
        if (progress.currentObjectiveId !== undefined && !OBJECTIVE_ID_REGEX.test(progress.currentObjectiveId))
            return { isValid: false, errorMessage: 'objectiveProgress.currentObjectiveId is invalid' };
        for (const field of ['completedObjectiveIds', 'blockedObjectiveIds']) {
            if (!Array.isArray(progress[field]) || progress[field].length > 50 || progress[field].some((item) => !OBJECTIVE_ID_REGEX.test(item)))
                return { isValid: false, errorMessage: `objectiveProgress.${field} is invalid` };
        }
        if (!isPlainObject(progress.attemptCountByObjective) || Object.keys(progress.attemptCountByObjective).length > 50 || Object.entries(progress.attemptCountByObjective).some(([id, count]) => !OBJECTIVE_ID_REGEX.test(id) || !Number.isInteger(count) || count < 0 || count > 100))
            return { isValid: false, errorMessage: 'objectiveProgress.attemptCountByObjective is invalid' };
        const evidenceKeys = new Set(['objectiveId', 'kind', 'summary', 'sourceActionId', 'verified']);
        if (!Array.isArray(progress.evidence) || progress.evidence.length > 100 || progress.evidence.some((item) => !hasOnlyKeys(item, evidenceKeys) || !OBJECTIVE_ID_REGEX.test(item.objectiveId || '') || !VALID_EVIDENCE_KINDS.has(item.kind) || !validateSafeString(item.summary, 1000) || (item.sourceActionId !== undefined && !validateSafeString(item.sourceActionId, 128)) || typeof item.verified !== 'boolean'))
            return { isValid: false, errorMessage: 'objectiveProgress.evidence is invalid' };
    }
    const actionKeys = new Set(['actionId', 'objectiveId', 'kind', 'targetLocalId', 'targetName']);
    if (body.previousAction !== undefined && (!hasOnlyKeys(body.previousAction, actionKeys) || !validateSafeString(body.previousAction.actionId, 128) || !validateSafeString(body.previousAction.kind, 64)))
        return { isValid: false, errorMessage: 'previousAction is invalid' };
    if (body.expectedPostcondition !== undefined) {
        const error = validateExpectedPostcondition(body.expectedPostcondition);
        if (error)
            return { isValid: false, errorMessage: error };
    }
    if (body.observedOutcome !== undefined && !validateSafeString(body.observedOutcome, 1000))
        return { isValid: false, errorMessage: 'observedOutcome is invalid' };
    if (body.meaningfulProgress !== undefined && typeof body.meaningfulProgress !== 'boolean')
        return { isValid: false, errorMessage: 'meaningfulProgress must be boolean' };
    if (body.recentActionHistory !== undefined) {
        const historyKeys = new Set(['actionId', 'objectiveId', 'kind', 'targetLocalId', 'expectedPostcondition', 'observedOutcome', 'meaningfulProgress']);
        if (!Array.isArray(body.recentActionHistory) || body.recentActionHistory.length > 10)
            return { isValid: false, errorMessage: 'recentActionHistory is invalid' };
        for (const item of body.recentActionHistory) {
            if (!hasOnlyKeys(item, historyKeys) || !validateSafeString(item.actionId, 128) || !validateSafeString(item.kind, 64) || typeof item.meaningfulProgress !== 'boolean')
                return { isValid: false, errorMessage: 'recentActionHistory entry is invalid' };
            if (item.expectedPostcondition !== undefined) {
                const error = validateExpectedPostcondition(item.expectedPostcondition);
                if (error)
                    return { isValid: false, errorMessage: error };
            }
        }
    }
    if (body.searchResults !== undefined) {
        if (!Array.isArray(body.searchResults) || body.searchResults.length > 20)
            return { isValid: false, errorMessage: 'searchResults is invalid' };
        const searchKeys = new Set(['title', 'url', 'content', 'score']);
        for (const item of body.searchResults) {
            if (!isPlainObject(item) || !hasOnlyKeys(item, searchKeys))
                return { isValid: false, errorMessage: 'searchResults entry is invalid' };
            if (!validateSafeString(item.title, 500) || !validateSafeString(item.url, 2000) || !validateSafeString(item.content, 5000)) {
                return { isValid: false, errorMessage: 'searchResults entry strings are invalid' };
            }
            if (item.score !== undefined && (typeof item.score !== 'number' || Number.isNaN(item.score))) {
                return { isValid: false, errorMessage: 'searchResults score is invalid' };
            }
        }
    }
    // 10. Validate executionFeedback if present
    if (body.executionFeedback !== undefined) {
        if (!isPlainObject(body.executionFeedback)) {
            return { isValid: false, errorMessage: 'Field "executionFeedback" must be an object' };
        }
        const efKeys = Object.getOwnPropertyNames(body.executionFeedback);
        const ALLOWED_FEEDBACK_KEYS = new Set([
            'lastActionId',
            'lastActionKind',
            'targetLocalId',
            'verified',
            'outcomeCode',
            'stepIndex',
            'completedTasks',
            'remainingTasks'
        ]);
        for (const efK of efKeys) {
            if (PROHIBITED_PROPERTY_NAMES.has(efK) || !ALLOWED_FEEDBACK_KEYS.has(efK)) {
                return { isValid: false, errorMessage: 'Closed schema violation: Unknown executionFeedback property' };
            }
        }
        const ef = body.executionFeedback;
        if (ef.lastActionId !== undefined && (typeof ef.lastActionId !== 'string' || ef.lastActionId.length > 128)) {
            return { isValid: false, errorMessage: 'executionFeedback.lastActionId must be a string up to 128 chars' };
        }
        if (ef.lastActionKind !== undefined && (typeof ef.lastActionKind !== 'string' || ef.lastActionKind.length > 64)) {
            return { isValid: false, errorMessage: 'executionFeedback.lastActionKind must be a string up to 64 chars' };
        }
        if (ef.targetLocalId !== undefined && (typeof ef.targetLocalId !== 'string' || ef.targetLocalId.length > 128)) {
            return { isValid: false, errorMessage: 'executionFeedback.targetLocalId must be a string up to 128 chars' };
        }
        if (ef.verified !== undefined && typeof ef.verified !== 'boolean') {
            return { isValid: false, errorMessage: 'executionFeedback.verified must be a boolean' };
        }
        if (ef.outcomeCode !== undefined && (typeof ef.outcomeCode !== 'string' || ef.outcomeCode.length > 128)) {
            return { isValid: false, errorMessage: 'executionFeedback.outcomeCode must be a string up to 128 chars' };
        }
        if (ef.stepIndex !== undefined && (typeof ef.stepIndex !== 'number' || !Number.isFinite(ef.stepIndex))) {
            return { isValid: false, errorMessage: 'executionFeedback.stepIndex must be a number' };
        }
        if (ef.completedTasks !== undefined && (!Array.isArray(ef.completedTasks) || ef.completedTasks.length > 50)) {
            return { isValid: false, errorMessage: 'executionFeedback.completedTasks must be an array up to 50 items' };
        }
        if (ef.remainingTasks !== undefined && (!Array.isArray(ef.remainingTasks) || ef.remainingTasks.length > 50)) {
            return { isValid: false, errorMessage: 'executionFeedback.remainingTasks must be an array up to 50 items' };
        }
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
    // 8. Custom Prompt if present
    if (body.customPrompt !== undefined) {
        if (typeof body.customPrompt !== 'string' || body.customPrompt.length > 4000) {
            return { isValid: false, errorMessage: 'Field "customPrompt" must be a string up to 4000 characters' };
        }
        if (hasProhibitedScriptPattern(body.customPrompt)) {
            return { isValid: false, errorMessage: 'Field "customPrompt" contains prohibited script patterns' };
        }
    }
    return {
        isValid: true,
        payload: body
    };
}
const ALLOWED_PLATFORM_TASK_KEYS = new Set([
    'protocolVersion',
    'goal',
    'contextUrl',
    'enableSubAgents',
    'maxParallel',
    'privacyTier',
    'requireHumanApproval'
]);
/**
 * Validates a PlatformTaskRequest against closed schema.
 */
export function validatePlatformTaskRequest(body) {
    if (!isPlainObject(body)) {
        return { isValid: false, errorMessage: 'Request payload must be a JSON object' };
    }
    for (const k of Object.getOwnPropertyNames(body)) {
        if (PROHIBITED_PROPERTY_NAMES.has(k) || !ALLOWED_PLATFORM_TASK_KEYS.has(k)) {
            return { isValid: false, errorMessage: `Closed schema violation: Unknown property "${k}" is prohibited` };
        }
    }
    if (body.protocolVersion !== '1.0') {
        return { isValid: false, errorMessage: 'Unsupported protocol version. Expected "1.0"' };
    }
    if (typeof body.goal !== 'string' || !body.goal.trim()) {
        return { isValid: false, errorMessage: 'Field "goal" must be a non-empty string' };
    }
    if (body.goal.length > 2000) {
        return { isValid: false, errorMessage: 'Field "goal" exceeds maximum length of 2000 characters' };
    }
    if (hasProhibitedScriptPattern(body.goal)) {
        return { isValid: false, errorMessage: 'Field "goal" contains prohibited script patterns' };
    }
    if (body.contextUrl !== undefined) {
        if (typeof body.contextUrl !== 'string') {
            return { isValid: false, errorMessage: 'Field "contextUrl" must be a string up to 2048 characters' };
        }
        if (body.contextUrl.length > 2048) {
            body.contextUrl = body.contextUrl.slice(0, 2048);
        }
        if (hasProhibitedScriptPattern(body.contextUrl)) {
            return { isValid: false, errorMessage: 'Field "contextUrl" contains prohibited script patterns' };
        }
    }
    if (body.maxParallel !== undefined) {
        if (typeof body.maxParallel !== 'number' || !Number.isInteger(body.maxParallel) || body.maxParallel < 1 || body.maxParallel > 4) {
            return { isValid: false, errorMessage: 'Field "maxParallel" must be an integer between 1 and 4' };
        }
    }
    if (body.privacyTier !== undefined) {
        if (body.privacyTier !== 'strict_dpdp' && body.privacyTier !== 'standard') {
            return { isValid: false, errorMessage: 'Field "privacyTier" must be "strict_dpdp" or "standard"' };
        }
    }
    return {
        isValid: true,
        payload: body
    };
}
const ALLOWED_PLAN_KEYS = new Set(['protocolVersion', 'goal', 'contextUrl']);
/**
 * Validates a PlanRequest against closed schema.
 */
export function validatePlanRequest(body) {
    if (!isPlainObject(body)) {
        return { isValid: false, errorMessage: 'Request payload must be a JSON object' };
    }
    for (const k of Object.getOwnPropertyNames(body)) {
        if (PROHIBITED_PROPERTY_NAMES.has(k) || !ALLOWED_PLAN_KEYS.has(k)) {
            return { isValid: false, errorMessage: `Closed schema violation: Unknown property "${k}" is prohibited` };
        }
    }
    if (body.protocolVersion !== '1.0') {
        return { isValid: false, errorMessage: 'Unsupported protocol version. Expected "1.0"' };
    }
    if (typeof body.goal !== 'string' || !body.goal.trim()) {
        return { isValid: false, errorMessage: 'Field "goal" must be a non-empty string' };
    }
    if (body.goal.length > 2000) {
        return { isValid: false, errorMessage: 'Field "goal" exceeds maximum length of 2000 characters' };
    }
    if (hasProhibitedScriptPattern(body.goal)) {
        return { isValid: false, errorMessage: 'Field "goal" contains prohibited script patterns' };
    }
    return {
        isValid: true,
        payload: body
    };
}
const ALLOWED_SYNTHESIZE_KEYS = new Set(['protocolVersion', 'originalGoal', 'subTaskResults']);
/**
 * Validates a SynthesizeRequest against closed schema.
 */
export function validateSynthesizeRequest(body) {
    if (!isPlainObject(body)) {
        return { isValid: false, errorMessage: 'Request payload must be a JSON object' };
    }
    for (const k of Object.getOwnPropertyNames(body)) {
        if (PROHIBITED_PROPERTY_NAMES.has(k) || !ALLOWED_SYNTHESIZE_KEYS.has(k)) {
            return { isValid: false, errorMessage: `Closed schema violation: Unknown property "${k}" is prohibited` };
        }
    }
    if (body.protocolVersion !== '1.0') {
        return { isValid: false, errorMessage: 'Unsupported protocol version. Expected "1.0"' };
    }
    if (typeof body.originalGoal !== 'string' || !body.originalGoal.trim()) {
        return { isValid: false, errorMessage: 'Field "originalGoal" must be a non-empty string' };
    }
    if (hasProhibitedScriptPattern(body.originalGoal)) {
        return { isValid: false, errorMessage: 'Field "originalGoal" contains prohibited script patterns' };
    }
    if (!Array.isArray(body.subTaskResults)) {
        return { isValid: false, errorMessage: 'Field "subTaskResults" must be an array' };
    }
    return {
        isValid: true,
        payload: body
    };
}
//# sourceMappingURL=payload-validator.js.map