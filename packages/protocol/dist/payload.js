/**
 * @privapilot/protocol - Payload Contracts and Type Boundaries
 *
 * Enforces compile-time and runtime guarantees:
 * RawCapture -> DetectionReport -> SanitizedContext -> NetworkPayload
 * RawCapture CANNOT be passed to Network clients.
 */
/**
 * Converts a SceneGraphElement to a SanitizedElement for backward compatibility with legacy consumers.
 */
export function sceneGraphElementToSanitizedElement(sgEl) {
    let role = 'generic';
    const r = sgEl.role.toLowerCase();
    if (r === 'button')
        role = 'button';
    else if (r === 'link')
        role = 'link';
    else if (r === 'input' || r === 'text_input')
        role = 'input';
    else if (r === 'select')
        role = 'select';
    else if (r === 'textarea')
        role = 'textarea';
    else if (r === 'checkbox' || r === 'checkbox_or_toggle')
        role = 'checkbox';
    else if (r === 'radio')
        role = 'radio';
    const caps = [];
    for (const a of sgEl.affordances) {
        if (a === 'clickable' || a === 'click')
            caps.push('click');
        if (a === 'typable' || a === 'type')
            caps.push('type');
        if (a === 'selectable' || a === 'select')
            caps.push('select');
        if (a === 'scrollable' || a === 'scroll')
            caps.push('scroll');
    }
    if (caps.length === 0)
        caps.push('click');
    return {
        localId: sgEl.ref,
        role,
        sanitizedName: sgEl.labelHint || sgEl.role,
        coarseBounds: sgEl.bbox,
        state: ['visible', 'enabled'],
        actionCapabilities: caps
    };
}
/**
 * Strict Network Boundary Transform: converts a client-internal SanitizedContext
 * into a closed SanitizedNetworkPayload safe to cross the network wire.
 *
 * Privacy Invariants:
 * - Omits all internal diagnostic claims, raw dom summaries, and SceneGraphConflict records.
 * - Extracts only opaque-ref SceneGraphElements with screened labelHints.
 */
export function sanitizeContextForNetwork(sanitized, recentActions) {
    return {
        protocolVersion: sanitized.protocolVersion || '1.0',
        runId: sanitized.runId || 'run_default',
        goal: sanitized.goal || '',
        screenshot: sanitized.sanitizedScreenshotDataUrl || '',
        elements: sanitized.elements || [],
        pageState: sanitized.pageState || { title: '', viewport: [1280, 720] },
        redactionManifest: sanitized.redactionManifest,
        ...(sanitized.sceneGraph ? { sceneGraphElements: sanitized.sceneGraph.elements } : {}),
        ...(recentActions && recentActions.length ? { recentActions } : {})
    };
}
//# sourceMappingURL=payload.js.map