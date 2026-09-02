/**
 * @privapilot/benchmark - Fixture DOM Parser
 *
 * Converts a static fixture HTML string into the same element descriptor shape the
 * live extension hands to the real detectors. This exists so the benchmark can call
 * `analyzeDomElementSensitivity` and friends directly instead of re-implementing
 * detection with fixture-specific string matching, which would make the harness
 * grade its own hardcoded constants rather than the shipped code.
 *
 * Layout note: a static string has no layout. Boxes here are a deterministic
 * synthetic layout, adequate for mask-policy checks but NOT a substitute for real
 * browser geometry. Anything that genuinely depends on layout is reported as
 * unmeasured rather than estimated. See docs/AUDIT_LOCAL_VS_DEFERRED.md.
 */
function attr(attrs, key) {
    const m = new RegExp(`${key}\\s*=\\s*["']([^"']*)["']`, 'i').exec(attrs);
    return m ? m[1] : undefined;
}
/** Row height and pitch for the synthetic layout. */
const ROW_H = 0.06;
const ROW_PITCH = 0.08;
const ROW_TOP = 0.12;
/**
 * Extracts `<label for="id">text</label>` associations so keyword rules can see
 * the label a screen reader would announce, exactly as the live extractor does.
 */
function buildLabelMap(html) {
    const labels = new Map();
    const labelRegex = /<label\s+([^>]*)>([\s\S]*?)<\/label>/gi;
    let m;
    while ((m = labelRegex.exec(html)) !== null) {
        const forId = attr(m[1], 'for');
        if (forId) {
            labels.set(forId, m[2].replace(/<[^>]+>/g, '').trim());
        }
    }
    return labels;
}
export function parseFixtureDocument(html) {
    const labels = buildLabelMap(html);
    const elements = [];
    let row = 0;
    const nextBox = (w = 0.8) => {
        const box = [0.1, ROW_TOP + row * ROW_PITCH, w, ROW_H];
        row++;
        return box;
    };
    // Inputs, textareas and selects
    const fieldRegex = /<(input|textarea|select)\s+([^>]*?)\/?>/gi;
    let match;
    while ((match = fieldRegex.exec(html)) !== null) {
        const tagName = match[1].toLowerCase();
        const attrs = match[2];
        const id = attr(attrs, 'id');
        const type = (attr(attrs, 'type') || (tagName === 'input' ? 'text' : tagName)).toLowerCase();
        const placeholder = attr(attrs, 'placeholder');
        const name = attr(attrs, 'name');
        const ariaLabel = attr(attrs, 'aria-label');
        const associatedLabelText = id ? labels.get(id) : undefined;
        elements.push({
            tagName,
            type,
            id,
            name,
            autocomplete: attr(attrs, 'autocomplete'),
            inputmode: attr(attrs, 'inputmode'),
            placeholder,
            ariaLabel,
            associatedLabelText,
            value: attr(attrs, 'value'),
            className: attr(attrs, 'class'),
            normBox: nextBox(),
            role: tagName === 'input' ? 'input' : tagName,
            displayName: placeholder || associatedLabelText || ariaLabel || name || id || `${tagName} field`
        });
    }
    // Buttons
    const buttonRegex = /<button\s*([^>]*)>([\s\S]*?)<\/button>/gi;
    while ((match = buttonRegex.exec(html)) !== null) {
        const attrs = match[1];
        const text = match[2].replace(/<[^>]+>/g, '').trim();
        elements.push({
            tagName: 'button',
            id: attr(attrs, 'id'),
            ariaLabel: attr(attrs, 'aria-label'),
            className: attr(attrs, 'class'),
            textContent: text,
            normBox: nextBox(0.3),
            role: 'button',
            displayName: text || attr(attrs, 'aria-label') || attr(attrs, 'id') || 'Button'
        });
    }
    // Uninspectable / high-risk surfaces
    for (const tag of ['canvas', 'iframe']) {
        const surfaceRegex = new RegExp(`<${tag}\\s*([^>]*)>`, 'gi');
        while ((match = surfaceRegex.exec(html)) !== null) {
            elements.push({
                tagName: tag,
                id: attr(match[1], 'id'),
                className: attr(match[1], 'class'),
                normBox: [0.1, 0.2, 0.7, 0.3],
                role: tag,
                displayName: tag === 'canvas' ? 'Canvas Graphic Area' : 'External Frame'
            });
        }
    }
    // Images (avatars and scanned documents are handled by their own detectors)
    // Quoted attribute values may contain ">" (an SVG data URI does), so consume
    // quoted strings explicitly instead of stopping at the first ">".
    const imgRegex = /<img\s+((?:"[^"]*"|'[^']*'|[^>])*?)\/?>/gi;
    while ((match = imgRegex.exec(html)) !== null) {
        const attrs = match[1];
        elements.push({
            tagName: 'img',
            id: attr(attrs, 'id'),
            className: attr(attrs, 'class'),
            ariaLabel: attr(attrs, 'alt'),
            normBox: [0.1, 0.2, 0.2, 0.2],
            role: 'img',
            displayName: attr(attrs, 'alt') || attr(attrs, 'id') || 'Image'
        });
    }
    // Text outside tags, keeping the offset so detections can report real positions
    const textSegments = [];
    const textRegex = />([^<]+)</g;
    while ((match = textRegex.exec(html)) !== null) {
        const raw = match[1];
        if (raw.trim().length > 0) {
            textSegments.push({ text: raw, startIndex: match.index + 1 });
        }
    }
    return { elements, textSegments };
}
//# sourceMappingURL=fixture-parser.js.map