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
        ...(context.redactionManifest ? { redactionManifest: context.redactionManifest } : {})
    };
}
/**
 * Generates canonical safe display projection directly from the exact canonical wire payload.
 * Never synthesizes fake run IDs, capture IDs, digests, viewports, or goals.
 * Displays 'Not available' for missing values.
 */
export function toSanitizedDisplayPayload(payload, digest) {
    if (!payload) {
        return {
            protocolVersion: '1.0',
            status: 'Awaiting initial perception cycle'
        };
    }
    const screenshot = payload.screenshot || '';
    const byteCount = screenshot ? Math.round(screenshot.length * 0.75) : 0;
    const kbCount = Math.round(byteCount / 1024);
    const screenshotDisplay = screenshot
        ? `[Screenshot base64 omitted from display: ${kbCount} KB (${byteCount} bytes), SHA-256 digest: ${digest || 'Not available'}]`
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