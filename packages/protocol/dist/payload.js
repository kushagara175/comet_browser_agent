/**
 * @privapilot/protocol - Payload Contracts and Type Boundaries
 *
 * Enforces compile-time and runtime guarantees:
 * RawCapture -> DetectionReport -> SanitizedContext -> NetworkPayload
 * RawCapture CANNOT be passed to Network clients.
 */
/**
 * Converts verified SanitizedContext into canonical wire-ready SanitizedNetworkPayload.
 */
export function toSanitizedNetworkPayload(context) {
    return {
        protocolVersion: '1.0',
        runId: context.runId,
        goal: context.goal,
        screenshot: context.sanitizedScreenshotDataUrl,
        elements: context.elements,
        pageState: context.pageState,
        ...(context.redactionManifest ? { redactionManifest: context.redactionManifest } : {}),
        ...(context.history ? { history: context.history } : {}),
        ...(context.customPrompt ? { customPrompt: context.customPrompt } : {}),
        ...(context.executionFeedback ? { executionFeedback: context.executionFeedback } : {}),
        ...(context.taskSpecification ? { taskSpecification: context.taskSpecification } : {}),
        ...(context.objectiveProgress ? { objectiveProgress: context.objectiveProgress } : {}),
        ...(context.currentObjective ? { currentObjective: context.currentObjective } : {}),
        ...(context.previousAction ? { previousAction: context.previousAction } : {}),
        ...(context.expectedPostcondition ? { expectedPostcondition: context.expectedPostcondition } : {}),
        ...(context.observedOutcome !== undefined ? { observedOutcome: context.observedOutcome } : {}),
        ...(context.meaningfulProgress !== undefined ? { meaningfulProgress: context.meaningfulProgress } : {}),
        ...(context.recentActionHistory ? { recentActionHistory: context.recentActionHistory.slice(-10) } : {}),
        ...(context.searchResults ? { searchResults: context.searchResults } : {})
    };
}
export function calculateBase64ByteLength(dataUrlOrBase64) {
    if (!dataUrlOrBase64 || typeof dataUrlOrBase64 !== 'string')
        return 0;
    const commaIdx = dataUrlOrBase64.indexOf(',');
    const b64 = commaIdx >= 0 ? dataUrlOrBase64.slice(commaIdx + 1) : dataUrlOrBase64;
    if (!b64.length)
        return 0;
    let padding = 0;
    if (b64.endsWith('=='))
        padding = 2;
    else if (b64.endsWith('='))
        padding = 1;
    return Math.max(0, Math.floor((b64.length * 3) / 4) - padding);
}
/**
 * Generates canonical safe display projection directly from the exact canonical wire payload.
 * Never synthesizes fake run IDs, capture IDs, digests, viewports, or goals.
 * Displays 'Not available' for missing values.
 */
export function toSanitizedDisplayPayload(payload, options) {
    if (!payload) {
        return {
            protocolVersion: '1.0',
            status: 'Awaiting initial perception cycle'
        };
    }
    const payloadDigest = typeof options === 'string' ? options : options?.payloadDigest || 'Not available';
    const screenshotDigest = typeof options === 'object' ? options?.screenshotDigest || payloadDigest : payloadDigest;
    const screenshot = payload.screenshot || '';
    const byteCount = calculateBase64ByteLength(screenshot);
    const kbCount = Math.round(byteCount / 1024);
    const screenshotDisplay = screenshot
        ? `[Screenshot base64 omitted from display: ${kbCount} KB (${byteCount} bytes), Screenshot SHA-256: ${screenshotDigest}, Payload Structure SHA-256: ${payloadDigest}]`
        : 'Not available';
    return {
        protocolVersion: payload.protocolVersion || '1.0',
        runId: payload.runId || 'Not available',
        goal: payload.goal || 'Not available',
        screenshot: screenshotDisplay,
        elements: payload.elements || [],
        pageState: payload.pageState || 'Not available',
        ...(payload.redactionManifest ? { redactionManifest: payload.redactionManifest } : {})
    };
}
//# sourceMappingURL=payload.js.map