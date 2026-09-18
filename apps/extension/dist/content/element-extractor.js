/**
 * @privapilot/extension - Content Script DOM Element Extractor
 *
 * Scans the active document, extracts interactive elements and sensitive node descriptors,
 * and assigns ephemeral local IDs (e.g. "el_1", "el_2").
 */
import { scanTextForPII } from '@privapilot/pii-rules';
const TEXT_NODE_TYPE = typeof Node !== 'undefined' ? Node.TEXT_NODE : 3;
const ELEMENT_NODE_TYPE = typeof Node !== 'undefined' ? Node.ELEMENT_NODE : 1;
const SHOW_TEXT_FILTER = typeof NodeFilter !== 'undefined' ? NodeFilter.SHOW_TEXT : 4;
/**
 * Measures exact client rectangles for a text range, handling text nodes, multi-line wrapping,
 * and nested inline elements (e.g. <span>, <b>, <em>).
 */
export function measureTextRangeRects(doc, nodeOrContainer, startIndex, endIndex, viewportWidth, viewportHeight) {
    try {
        const range = doc.createRange();
        if (nodeOrContainer.nodeType === TEXT_NODE_TYPE) {
            const textLen = (nodeOrContainer.nodeValue || '').length;
            const safeStart = Math.max(0, Math.min(startIndex, textLen));
            const safeEnd = Math.max(safeStart, Math.min(endIndex, textLen));
            range.setStart(nodeOrContainer, safeStart);
            range.setEnd(nodeOrContainer, safeEnd);
        }
        else if (nodeOrContainer.nodeType === ELEMENT_NODE_TYPE) {
            // Find start and end positions across descendant text nodes
            let currentOffset = 0;
            let startNode = null;
            let startOffset = 0;
            let endNode = null;
            let endOffset = 0;
            const walker = doc.createTreeWalker(nodeOrContainer, SHOW_TEXT_FILTER);
            let child = walker.nextNode();
            while (child) {
                const textLen = child.nodeValue?.length || 0;
                if (!startNode && currentOffset + textLen >= startIndex) {
                    startNode = child;
                    startOffset = startIndex - currentOffset;
                }
                if (!endNode && currentOffset + textLen >= endIndex) {
                    endNode = child;
                    endOffset = endIndex - currentOffset;
                    break;
                }
                currentOffset += textLen;
                child = walker.nextNode();
            }
            if (!startNode || !endNode) {
                return [];
            }
            range.setStart(startNode, Math.max(0, Math.min(startOffset, startNode.nodeValue?.length || 0)));
            range.setEnd(endNode, Math.max(0, Math.min(endOffset, endNode.nodeValue?.length || 0)));
        }
        else {
            return [];
        }
        const clientRects = range.getClientRects();
        const resultRects = [];
        for (let i = 0; i < clientRects.length; i++) {
            const r = clientRects[i];
            // Clip rectangles to the visible viewport
            const left = Math.max(0, Math.min(r.left !== undefined ? r.left : r.x, viewportWidth));
            const top = Math.max(0, Math.min(r.top !== undefined ? r.top : r.y, viewportHeight));
            const right = Math.max(0, Math.min((r.right !== undefined ? r.right : (r.x + r.width)), viewportWidth));
            const bottom = Math.max(0, Math.min((r.bottom !== undefined ? r.bottom : (r.y + r.height)), viewportHeight));
            const width = right - left;
            const height = bottom - top;
            // Discard empty or invalid rectangles
            if (width > 0.5 && height > 0.5 && Number.isFinite(width) && Number.isFinite(height)) {
                resultRects.push({
                    x: left,
                    y: top,
                    width,
                    height
                });
            }
        }
        if (resultRects.length === 0) {
            const b = range.getBoundingClientRect();
            const left = Math.max(0, Math.min(b.left !== undefined ? b.left : b.x, viewportWidth));
            const top = Math.max(0, Math.min(b.top !== undefined ? b.top : b.y, viewportHeight));
            const right = Math.max(0, Math.min((b.right !== undefined ? b.right : (b.x + b.width)), viewportWidth));
            const bottom = Math.max(0, Math.min((b.bottom !== undefined ? b.bottom : (b.y + b.height)), viewportHeight));
            const width = right - left;
            const height = bottom - top;
            if (width > 0.5 && height > 0.5 && Number.isFinite(width) && Number.isFinite(height)) {
                resultRects.push({ x: left, y: top, width, height });
            }
        }
        return resultRects;
    }
    catch {
        return [];
    }
}
export class ElementExtractor {
    elementMap = new Map();
    counter = 0;
    extractSnapshot(doc = document) {
        this.elementMap.clear();
        this.counter = 0;
        const domElements = [];
        const textNodes = [];
        const imageElements = [];
        const surfaces = [];
        const interactiveElements = [];
        const viewportWidth = (doc.defaultView?.innerWidth) || (doc.documentElement?.clientWidth) || 1280;
        const viewportHeight = (doc.defaultView?.innerHeight) || (doc.documentElement?.clientHeight) || 720;
        let surfaceCounter = 0;
        // Helper to recursively process a document or same-origin frame with coordinate offsets
        const processDocumentLevel = (currentDoc, offset = { x: 0, y: 0 }, depth = 0) => {
            // 1. Extract interactive controls & form inputs (including custom dropdowns, comboboxes, and tabs)
            const candidates = currentDoc.querySelectorAll('button, a, input, select, textarea, [role="button"], [role="link"], [role="tab"], [role="combobox"], [role="searchbox"], [contenteditable="true"], [role="listbox"], [role="menuitem"], [aria-haspopup="listbox"], [tabindex="0"], [draggable="true"], [role="slider"], [aria-grabbed]');
            candidates.forEach((node) => {
                const el = node;
                // Overlay Safety: Never extract extension overlays, HUD controls, or debug containers
                if ((typeof el.closest === 'function' && el.closest('.privapilot-overlay, .privapilot-hud, #privapilot-root, [data-privapilot-ignore]')) ||
                    (typeof el.getAttribute === 'function' && el.getAttribute('data-privapilot-ignore') === 'true') ||
                    (el.classList && typeof el.classList.contains === 'function' && el.classList.contains('privapilot-overlay'))) {
                    return;
                }
                const rect = el.getBoundingClientRect();
                if (rect.width === 0 || rect.height === 0)
                    return; // Skip hidden elements
                this.counter++;
                const localId = `el_${this.counter}`;
                this.elementMap.set(localId, el);
                // Determine role (prioritizing native tag semantics)
                let role = 'generic';
                const tag = el.tagName.toLowerCase();
                const roleAttr = (typeof el.getAttribute === 'function' ? el.getAttribute('role') || '' : '').toLowerCase();
                const ariaHasPopup = (typeof el.getAttribute === 'function' ? el.getAttribute('aria-haspopup') || '' : '').toLowerCase();
                if (tag === 'input') {
                    const type = (typeof el.getAttribute === 'function' ? el.getAttribute('type') || 'text' : 'text').toLowerCase();
                    if (type === 'checkbox')
                        role = 'checkbox';
                    else if (type === 'radio')
                        role = 'radio';
                    else if (type === 'button' || type === 'submit' || type === 'reset')
                        role = 'button';
                    else
                        role = 'input';
                }
                else if (tag === 'textarea' || roleAttr === 'searchbox' || el.isContentEditable || el.getAttribute?.('contenteditable') === 'true') {
                    role = 'textarea';
                }
                else if (tag === 'select' || roleAttr === 'listbox' || (!el.matches?.('input') && (roleAttr === 'combobox' || ariaHasPopup === 'listbox'))) {
                    role = 'select';
                }
                else if (tag === 'button' || roleAttr === 'button') {
                    role = 'button';
                }
                else if (tag === 'a' || roleAttr === 'link') {
                    role = 'link';
                }
                else if (roleAttr === 'tab') {
                    role = 'tab';
                }
                else if (roleAttr === 'menuitem') {
                    role = 'menuitem';
                }
                // Determine capabilities
                const caps = ['click', 'hover'];
                if (role === 'input' || role === 'textarea' || tag === 'input' || tag === 'textarea' || el.isContentEditable) {
                    const inputType = (typeof el.getAttribute === 'function' ? el.getAttribute('type') || '' : '').toLowerCase();
                    if (inputType !== 'checkbox' && inputType !== 'radio' && inputType !== 'button' && inputType !== 'submit' && inputType !== 'image') {
                        caps.push('type');
                    }
                    if (inputType === 'file')
                        caps.push('upload');
                }
                if (role === 'select' || tag === 'select' || roleAttr === 'combobox')
                    caps.push('select');
                const isDraggable = el.getAttribute?.('draggable') === 'true' || el.getAttribute?.('role') === 'slider' || (typeof el.getAttribute === 'function' && el.getAttribute('aria-grabbed') !== null);
                if (isDraggable)
                    caps.push('drag');
                // Safe Semantic Name Derivation (NEVER use live input/textarea/select .value property or attribute)
                let rawName = '';
                let associatedLabelText = '';
                if (tag === 'input' || tag === 'textarea' || tag === 'select') {
                    // 1. Associated <label for="id">
                    if (el.id) {
                        try {
                            const escapedId = typeof CSS !== 'undefined' && CSS.escape ? CSS.escape(el.id) : el.id;
                            const labelEl = currentDoc.querySelector?.(`label[for="${escapedId}"]`);
                            if (labelEl)
                                associatedLabelText = labelEl.innerText?.trim() || '';
                        }
                        catch (_) { }
                    }
                    // 2. Parent/wrapping <label>
                    if (!associatedLabelText) {
                        const parentLabel = typeof el.closest === 'function' ? el.closest('label') : null;
                        if (parentLabel)
                            associatedLabelText = parentLabel.innerText?.trim() || '';
                    }
                    // 3. aria-labelledby
                    if (!associatedLabelText) {
                        const labelledBy = typeof el.getAttribute === 'function' ? el.getAttribute('aria-labelledby') : null;
                        if (labelledBy) {
                            try {
                                const labelEl = currentDoc.getElementById?.(labelledBy);
                                if (labelEl)
                                    associatedLabelText = labelEl.innerText?.trim() || '';
                            }
                            catch (_) { }
                        }
                    }
                    const ariaLabel = (typeof el.getAttribute === 'function' ? el.getAttribute('aria-label') || '' : '').trim();
                    const placeholder = (typeof el.getAttribute === 'function' ? el.getAttribute('placeholder') || '' : '').trim();
                    const title = (typeof el.getAttribute === 'function' ? el.getAttribute('title') || '' : '').trim();
                    const nameAttr = (typeof el.getAttribute === 'function' ? el.getAttribute('name') || '' : '').trim();
                    const typeAttr = (typeof el.getAttribute === 'function' ? el.getAttribute('type') || '' : '').trim().toLowerCase();
                    const ariaControls = (typeof el.getAttribute === 'function' ? el.getAttribute('aria-controls') || '' : '').trim();
                    rawName = associatedLabelText || ariaLabel || placeholder || title || (typeAttr === 'search' ? 'Search' : '') || (ariaControls.toLowerCase().includes('table') ? 'Search' : '') || nameAttr || role;
                }
                else {
                    // For buttons, links, custom clickable controls
                    const textContent = el.innerText?.trim() || '';
                    const aria = (typeof el.getAttribute === 'function' ? el.getAttribute('aria-label')?.trim() || el.getAttribute('title')?.trim() : '') || '';
                    let childName = '';
                    if (!textContent && !aria) {
                        const svgChild = el.querySelector('svg');
                        if (svgChild) {
                            childName = svgChild.getAttribute('aria-label') || svgChild.querySelector('title')?.textContent?.trim() || '';
                        }
                        if (!childName) {
                            const imgChild = el.querySelector('img');
                            if (imgChild) {
                                childName = imgChild.getAttribute('alt') || imgChild.getAttribute('title') || '';
                            }
                        }
                        if (!childName && typeof el.getAttribute === 'function' && el.getAttribute('type') === 'submit') {
                            childName = 'Submit';
                        }
                        if (!childName) {
                            const searchForm = typeof el.closest === 'function' ? el.closest('form, [role="search"]') : null;
                            if (searchForm) {
                                childName = 'Search';
                            }
                        }
                    }
                    rawName = textContent || aria || childName || role;
                }
                // Extract container / row context (e.g. table row, card, list item)
                let containerContext;
                try {
                    const container = typeof el.closest === 'function' ? el.closest('tr, [role="row"], li, .card, [role="article"], td, [role="gridcell"]') : null;
                    if (container) {
                        const rawContext = container.innerText || container.textContent || '';
                        const cleanTokens = rawContext
                            .replace(rawName, '')
                            .replace(/\s+/g, ' ')
                            .trim()
                            .slice(0, 180);
                        if (cleanTokens.length > 0) {
                            containerContext = cleanTokens;
                        }
                    }
                }
                catch (_) { }
                // Active Dialog & Heading context
                const isInsideDialog = Boolean(typeof el.closest === 'function' && el.closest('dialog, [role="dialog"], [role="alertdialog"], .modal, .dialog'));
                let nearestHeading;
                try {
                    const heading = typeof el.closest === 'function' ? el.closest('section, article, div, main')?.querySelector?.('h1, h2, h3, h4, [role="heading"]') : null;
                    if (heading && heading !== el) {
                        const hText = heading.innerText?.trim();
                        if (hText && hText.length < 80)
                            nearestHeading = hText;
                    }
                }
                catch (_) { }
                // Vertical offset relative to viewport
                let verticalOffset = 'in_view';
                if (rect.bottom < 0) {
                    verticalOffset = 'above';
                }
                else if (rect.top > viewportHeight) {
                    verticalOffset = 'below';
                }
                const inViewport = verticalOffset === 'in_view' && rect.right > 0 && rect.left < viewportWidth;
                interactiveElements.push({
                    localId,
                    role,
                    rawName,
                    boundingBox: { x: rect.x + offset.x, y: rect.y + offset.y, width: rect.width, height: rect.height },
                    state: ['visible', el.disabled ? 'disabled' : 'enabled'],
                    actionCapabilities: caps,
                    containerContext,
                    nearestHeading,
                    isInsideDialog,
                    verticalOffset,
                    inViewport
                });
                // Also record descriptor for DOM sensitivity analysis
                const isEditable = tag === 'input' || tag === 'textarea' || tag === 'select' || el.isContentEditable || el.getAttribute('contenteditable') === 'true';
                if (isEditable) {
                    const liveVal = el.value !== undefined ? el.value : (el.textContent || undefined);
                    const liveValueStr = typeof liveVal === 'string' ? liveVal : undefined;
                    domElements.push({
                        id: localId,
                        descriptor: {
                            tagName: tag,
                            type: el.getAttribute('type') || undefined,
                            name: el.getAttribute('name') || undefined,
                            id: el.id || undefined,
                            autocomplete: el.getAttribute('autocomplete') || undefined,
                            placeholder: el.getAttribute('placeholder') || undefined,
                            ariaLabel: el.getAttribute('aria-label') || undefined,
                            associatedLabelText: associatedLabelText || undefined,
                            value: liveValueStr
                        },
                        boundingClientRect: { x: rect.x + offset.x, y: rect.y + offset.y, width: rect.width, height: rect.height }
                    });
                    // Zero-Trust Live Input Value Protection:
                    // If an input or textarea has a live entered value, ensure its visual box is captured for PII masking
                    if (liveValueStr && liveValueStr.trim().length > 0 && rect.width > 0 && rect.height > 0) {
                        const inputValTrimmed = liveValueStr.trim();
                        const valMatches = scanTextForPII(inputValTrimmed);
                        const boxX = rect.x + offset.x;
                        const boxY = rect.y + offset.y;
                        textNodes.push({
                            id: `input_val_${localId}`,
                            text: inputValTrimmed,
                            boundingClientRect: { x: boxX, y: boxY, width: rect.width, height: rect.height },
                            matchedRanges: [{
                                    category: valMatches.length > 0 ? valMatches[0].category : 'username',
                                    startIndex: 0,
                                    endIndex: inputValTrimmed.length,
                                    rects: [{ x: boxX, y: boxY, width: rect.width, height: rect.height }]
                                }]
                        });
                    }
                }
            });
            // 2. Extract Visible Text Nodes & Compute Range Bounding Boxes
            const textWalker = currentDoc.createTreeWalker ? currentDoc.createTreeWalker(currentDoc.body || currentDoc, SHOW_TEXT_FILTER) : null;
            if (textWalker) {
                let textNode = textWalker.nextNode();
                let textIdx = 0;
                const visitedContainers = new Set();
                while (textNode) {
                    const content = textNode.nodeValue || '';
                    const trimmed = content.trim();
                    const parent = textNode.parentElement;
                    if (trimmed.length > 2 && parent && parent.tagName !== 'SCRIPT' && parent.tagName !== 'STYLE' && parent.tagName !== 'NOSCRIPT') {
                        const parentRect = parent.getBoundingClientRect();
                        if (parentRect.width > 0 && parentRect.height > 0) {
                            textIdx++;
                            const nodeId = `txt_${depth}_${textIdx}`;
                            // Check if parent element represents user account identity (e.g. User-Name header on X, user-menu button on Claude/ChatGPT, account header on Flipkart)
                            const isAccountIdentity = Boolean(typeof parent.closest === 'function' &&
                                parent.closest('[data-testid="User-Name"], [data-testid="user-menu-button"], [data-testid="profile-button"], [data-testid*="user-profile" i], [class*="user-name" i], [class*="username" i], [class*="account-name" i], a[href*="/account" i], a[href*="/profile" i], [aria-label*="account" i], [aria-label*="profile" i], [title*="profile" i], [title*="account" i], [class*="account" i], [class*="profile" i], [class*="user" i], [data-testid*="account" i], [data-testid*="profile" i]'));
                            // Check if parent element represents delivery address / shipping location widget
                            const isDeliveryAddressContainer = Boolean(typeof parent.closest === 'function' &&
                                parent.closest('[class*="deliver" i], [id*="deliver" i], [class*="address" i], [id*="address" i], [class*="location" i], [id*="location" i], [class*="pincode" i], [id*="pincode" i]'));
                            // Scan text node for PII matches
                            let matches = scanTextForPII(content);
                            if (matches.length === 0 && isDeliveryAddressContainer && trimmed.length > 2 && trimmed.length < 120 &&
                                (/\b(?:home|work|office|deliver|katra|nagar|colony|road|street|\d{5,6})\b/i.test(trimmed))) {
                                matches = [{
                                        category: 'address',
                                        startIndex: 0,
                                        endIndex: content.length,
                                        matchedLength: content.length,
                                        confidence: 0.95
                                    }];
                            }
                            else if (matches.length === 0 && isAccountIdentity && trimmed.length > 1 && trimmed.length < 80 &&
                                !/^(?:login|sign in|sign up|register|cart|orders|notifications|help|wishlist|explore|become a seller)$/i.test(trimmed)) {
                                matches = [{
                                        category: 'username',
                                        startIndex: 0,
                                        endIndex: content.length,
                                        matchedLength: content.length,
                                        confidence: 0.95
                                    }];
                            }
                            let matchedRanges = undefined;
                            if (matches.length > 0) {
                                matchedRanges = matches.map((match) => {
                                    const rects = measureTextRangeRects(doc, textNode, match.startIndex, match.endIndex, viewportWidth, viewportHeight);
                                    // Apply coordinate offset to range rects
                                    const offsetRects = rects.map(r => ({ ...r, x: r.x + offset.x, y: r.y + offset.y }));
                                    return {
                                        category: match.category,
                                        startIndex: match.startIndex,
                                        endIndex: match.endIndex,
                                        rects: offsetRects,
                                        ...(parentRect.height <= 60 ? {
                                            fallbackParentRect: {
                                                x: Math.max(0, parentRect.x + offset.x),
                                                y: Math.max(0, parentRect.y + offset.y),
                                                width: Math.min(parentRect.width, viewportWidth - Math.max(0, parentRect.x + offset.x)),
                                                height: Math.min(parentRect.height, viewportHeight - Math.max(0, parentRect.y + offset.y))
                                            }
                                        } : {})
                                    };
                                });
                            }
                            textNodes.push({
                                id: nodeId,
                                text: trimmed,
                                boundingClientRect: { x: parentRect.x + offset.x, y: parentRect.y + offset.y, width: parentRect.width, height: parentRect.height },
                                matchedRanges
                            });
                            // Check if parent container has nested inline markup spanning across text nodes (only small inline wrappers, never layout blocks or cards)
                            const isSmallInlineWrapper = parent.children.length > 0 &&
                                !visitedContainers.has(parent) &&
                                parentRect.height <= 50 &&
                                parentRect.width <= 600 &&
                                parent.tagName !== 'ARTICLE' &&
                                parent.tagName !== 'MAIN' &&
                                parent.tagName !== 'SECTION';
                            if (isSmallInlineWrapper) {
                                visitedContainers.add(parent);
                                const containerText = parent.textContent || '';
                                const containerMatches = scanTextForPII(containerText);
                                for (const cm of containerMatches) {
                                    const isCovered = matchedRanges?.some(mr => mr.category === cm.category);
                                    if (!isCovered) {
                                        const containerRects = measureTextRangeRects(doc, parent, cm.startIndex, cm.endIndex, viewportWidth, viewportHeight);
                                        const offsetContainerRects = containerRects.map(r => ({ ...r, x: r.x + offset.x, y: r.y + offset.y }));
                                        textIdx++;
                                        textNodes.push({
                                            id: `txt_cont_${depth}_${textIdx}`,
                                            text: containerText,
                                            boundingClientRect: { x: parentRect.x + offset.x, y: parentRect.y + offset.y, width: parentRect.width, height: parentRect.height },
                                            matchedRanges: [{
                                                    category: cm.category,
                                                    startIndex: cm.startIndex,
                                                    endIndex: cm.endIndex,
                                                    rects: offsetContainerRects,
                                                    ...(parentRect.height <= 40 ? {
                                                        fallbackParentRect: {
                                                            x: Math.max(0, parentRect.x + offset.x),
                                                            y: Math.max(0, parentRect.y + offset.y),
                                                            width: Math.min(parentRect.width, viewportWidth - Math.max(0, parentRect.x + offset.x)),
                                                            height: Math.min(parentRect.height, viewportHeight - Math.max(0, parentRect.y + offset.y))
                                                        }
                                                    } : {})
                                                }]
                                        });
                                    }
                                }
                            }
                        }
                    }
                    textNode = textWalker.nextNode();
                }
            }
            // 3. Extract Images / Avatars for Face Detection (Only actual visual media, not layout cards)
            const images = currentDoc.querySelectorAll('img, svg, [role="img"], .avatar, .profile-photo, .profile-pic, ' +
                '[data-testid*="avatar" i], [data-testid*="UserAvatar" i], [data-testid*="user-avatar" i], ' +
                '[data-testid*="user-menu" i], [class*="avatar" i], [class*="profile-photo" i], [class*="profile-pic" i]');
            images.forEach((img, idx) => {
                const el = img;
                const tagName = (el.tagName || '').toUpperCase();
                const role = el.getAttribute?.('role') || '';
                const rect = el.getBoundingClientRect();
                if (rect.width <= 0 || rect.height <= 0)
                    return;
                if (rect.width > 240 || rect.height > 240)
                    return;
                const classText = (el.getAttribute?.('class') ??
                    (typeof el.className === 'string' ? el.className : '')).toLowerCase();
                const testId = (el.getAttribute?.('data-testid') || '').toLowerCase();
                const alt = (el.getAttribute?.('alt') || '').toLowerCase();
                const ariaLabel = (el.getAttribute?.('aria-label') || '').toLowerCase();
                const src = (el.getAttribute?.('src') || el.getAttribute?.('srcset') || '').toLowerCase();
                const isAvatar = classText.includes('avatar') ||
                    classText.includes('profile') ||
                    classText.includes('user-pic') ||
                    classText.includes('user-img') ||
                    classText.includes('user-photo') ||
                    classText.includes('user-image') ||
                    classText.includes('author-img') ||
                    classText.includes('gravatar') ||
                    testId.includes('avatar') ||
                    testId.includes('useravatar') ||
                    testId.includes('profile-pic') ||
                    alt.includes('avatar') ||
                    alt.includes('profile') ||
                    alt.includes('user photo') ||
                    alt.includes('author') ||
                    ariaLabel.includes('avatar') ||
                    ariaLabel.includes('profile') ||
                    ariaLabel.includes('account') ||
                    src.includes('profile_images') ||
                    src.includes('avatar') ||
                    src.includes('gravatar.com') ||
                    src.includes('avatars.githubusercontent') ||
                    src.includes('googleusercontent.com') ||
                    Boolean(typeof el.closest === 'function' && el.closest('[data-testid*="UserAvatar" i], [data-testid*="avatar" i], [data-testid*="user-avatar" i], [data-testid*="user-menu" i], [data-testid*="user-profile" i], a[href*="/account" i], a[href*="/profile" i], [aria-label*="account" i], [aria-label*="profile" i], [class*="account" i], [class*="profile" i], [class*="user-info" i], [class*="user-header" i], [class*="user-badge" i]'));
                const isVisualMedia = tagName === 'IMG' ||
                    tagName === 'SVG' ||
                    role === 'img' ||
                    isAvatar;
                if (!isVisualMedia)
                    return;
                imageElements.push({
                    id: `img_${depth}_${idx + 1}`,
                    isProfilePhotoOrAvatar: isAvatar,
                    boundingClientRect: { x: rect.x + offset.x, y: rect.y + offset.y, width: rect.width, height: rect.height }
                });
            });
            // 4. Granular High-Risk & Uninspectable Surfaces
            // 4a. Canvases (2D Canvas vs WebGL Canvas)
            const canvases = currentDoc.querySelectorAll('canvas');
            canvases.forEach((c) => {
                const rect = c.getBoundingClientRect();
                if (rect.width > 0 && rect.height > 0) {
                    surfaceCounter++;
                    let isWebGL = false;
                    try {
                        const webglMarker = (c.getAttribute('data-engine') || '').toLowerCase();
                        isWebGL = webglMarker.includes('webgl') || c.classList.contains('webgl') || c.__webgl__ === true;
                    }
                    catch { }
                    surfaces.push({
                        id: `cvs_${surfaceCounter}`,
                        surfaceType: isWebGL ? 'webgl_canvas' : 'canvas',
                        isCrossOriginOrUninspectable: true,
                        inspectionStatus: isWebGL ? 'uninspectable_canvas' : 'uninspectable_canvas',
                        reason: isWebGL ? 'webgl_hardware_canvas' : 'uninspected_2d_canvas',
                        boundingClientRect: { x: rect.x + offset.x, y: rect.y + offset.y, width: rect.width, height: rect.height }
                    });
                }
            });
            // 4b. Video Streams & Players
            const videos = currentDoc.querySelectorAll('video');
            videos.forEach((v) => {
                const rect = v.getBoundingClientRect();
                if (rect.width > 0 && rect.height > 0) {
                    surfaceCounter++;
                    surfaces.push({
                        id: `vid_${surfaceCounter}`,
                        surfaceType: 'video',
                        isCrossOriginOrUninspectable: true,
                        inspectionStatus: 'uninspectable_media',
                        reason: 'video_media_stream',
                        boundingClientRect: { x: rect.x + offset.x, y: rect.y + offset.y, width: rect.width, height: rect.height }
                    });
                }
            });
            // 4c. Embedded PDF & Browser Plugin Content
            const plugins = currentDoc.querySelectorAll('embed, object, applet');
            plugins.forEach((p) => {
                const rect = p.getBoundingClientRect();
                if (rect.width > 0 && rect.height > 0) {
                    surfaceCounter++;
                    const typeAttr = (p.getAttribute('type') || '').toLowerCase();
                    const srcAttr = (p.getAttribute('src') || p.getAttribute('data') || '').toLowerCase();
                    const isPdf = typeAttr.includes('pdf') || srcAttr.endsWith('.pdf');
                    surfaces.push({
                        id: `plugin_${surfaceCounter}`,
                        surfaceType: isPdf ? 'pdf' : 'plugin',
                        isCrossOriginOrUninspectable: true,
                        inspectionStatus: 'uninspectable_plugin',
                        reason: isPdf ? 'embedded_pdf_document' : 'browser_plugin_content',
                        boundingClientRect: { x: rect.x + offset.x, y: rect.y + offset.y, width: rect.width, height: rect.height }
                    });
                }
            });
            // 4d. Closed Shadow Roots / Inaccessible Custom Elements
            const allElements = currentDoc.querySelectorAll('*');
            allElements.forEach((el) => {
                const isClosedShadow = el.__closedShadowRoot__ === true || el.getAttribute('data-closed-shadow') === 'true';
                if (isClosedShadow) {
                    const rect = el.getBoundingClientRect();
                    if (rect.width > 0 && rect.height > 0) {
                        surfaceCounter++;
                        surfaces.push({
                            id: `shadow_${surfaceCounter}`,
                            surfaceType: 'shadow_root',
                            isCrossOriginOrUninspectable: true,
                            inspectionStatus: 'uninspectable_closed_shadow',
                            reason: 'closed_shadow_root_inaccessible',
                            boundingClientRect: { x: rect.x + offset.x, y: rect.y + offset.y, width: rect.width, height: rect.height }
                        });
                    }
                }
            });
            // 4e. Images Likely to Contain Sensitive Text
            const textImages = currentDoc.querySelectorAll('img[class*="receipt"], img[class*="invoice"], img[class*="document"], img[class*="statement"], img[class*="card"], img[class*="scanned"], img[class*="id"], img[class*="doc"], [data-has-text="true"], img[alt*="scanned" i], img[alt*="document" i], img[alt*="sensitive" i]');
            textImages.forEach((img) => {
                const rect = img.getBoundingClientRect();
                if (rect.width > 0 && rect.height > 0) {
                    surfaceCounter++;
                    surfaces.push({
                        id: `img_text_${surfaceCounter}`,
                        surfaceType: 'image_text',
                        isCrossOriginOrUninspectable: true,
                        inspectionStatus: 'uninspectable_image_text',
                        reason: 'image_text_candidate',
                        boundingClientRect: { x: rect.x + offset.x, y: rect.y + offset.y, width: rect.width, height: rect.height }
                    });
                }
            });
            // 4f. Iframes (Same-Origin Permitted vs Cross-Origin Inaccessible)
            const iframes = currentDoc.querySelectorAll('iframe');
            iframes.forEach((f) => {
                const rect = f.getBoundingClientRect();
                const iframeOffset = { x: rect.x + offset.x, y: rect.y + offset.y };
                // Ignore invisible tracking pixels, zero/sub-pixel size, or completely offscreen helper frames (e.g. Google CSE, beacons)
                if (rect.width <= 2 || rect.height <= 2 || iframeOffset.x + rect.width <= 0 || iframeOffset.y + rect.height <= 0) {
                    return;
                }
                if (rect.width > 0 && rect.height > 0) {
                    surfaceCounter++;
                    let isSameOrigin = false;
                    let innerDoc = null;
                    try {
                        innerDoc = f.contentDocument || f.contentWindow?.document || null;
                        if (innerDoc && (innerDoc.body || innerDoc.documentElement)) {
                            isSameOrigin = true;
                        }
                    }
                    catch {
                        isSameOrigin = false;
                        innerDoc = null;
                    }
                    if (isSameOrigin && innerDoc && depth < 5) {
                        // Permitted same-origin frame -> Record inspectable status and recurse!
                        surfaces.push({
                            id: `ifr_${surfaceCounter}`,
                            surfaceType: 'iframe',
                            isCrossOriginOrUninspectable: false,
                            inspectionStatus: 'inspected_same_origin',
                            reason: 'same_origin_frame_inspected',
                            boundingClientRect: { x: iframeOffset.x, y: iframeOffset.y, width: rect.width, height: rect.height }
                        });
                        processDocumentLevel(innerDoc, iframeOffset, depth + 1);
                    }
                    else {
                        // Check if this cross-origin iframe is an advertisement / promotional banner
                        const fSrc = typeof f.getAttribute === 'function' ? f.getAttribute('src') : (f.src || '');
                        const fName = typeof f.getAttribute === 'function' ? f.getAttribute('name') : (f.name || '');
                        const fTitle = typeof f.getAttribute === 'function' ? f.getAttribute('title') : (f.title || '');
                        const fClass = typeof f.getAttribute === 'function' ? f.getAttribute('class') : (f.className || '');
                        const adMarkers = `${f.id || ''} ${fName || ''} ${fTitle || ''} ${fClass || ''} ${fSrc || ''}`.toLowerCase();
                        const isAdFrame = /\b(?:google_ad|googlesyndication|doubleclick|adnxs|adservice|ad-slot|adsystem|ads-|aswift|taboola|outbrain|criteo|pubmatic|rubicon|adform|advertisement|banner-ad)\b|google_ads_iframe|godaddy/i.test(adMarkers);
                        if (isAdFrame) {
                            // Ignore commercial ad iframes from intrusive blackout masking
                            return;
                        }
                        // Real cross-origin or inaccessible frame -> Mark high risk surface to mask fail-closed!
                        surfaces.push({
                            id: `ifr_${surfaceCounter}`,
                            surfaceType: 'iframe',
                            isCrossOriginOrUninspectable: true,
                            inspectionStatus: 'uninspectable_cross_origin',
                            reason: 'cross_origin_or_inaccessible_iframe',
                            boundingClientRect: { x: iframeOffset.x, y: iframeOffset.y, width: rect.width, height: rect.height }
                        });
                    }
                }
            });
            // 4g. Open Shadow DOM Roots Piercing (Web Components & Custom Elements)
            if (depth < 6) {
                try {
                    const shadowCandidates = currentDoc.querySelectorAll('*');
                    shadowCandidates.forEach((node) => {
                        const shadowRoot = node.shadowRoot;
                        if (shadowRoot && typeof shadowRoot.querySelectorAll === 'function') {
                            processDocumentLevel(shadowRoot, offset, depth + 1);
                        }
                    });
                }
                catch {
                    // Gracefully continue in environments where Shadow DOM access is restricted
                }
            }
        };
        // Execute top-level extraction
        processDocumentLevel(doc, { x: 0, y: 0 }, 0);
        // Extract structured page-state landmarks
        let visibleDialogCount = 0;
        const dialogTitles = [];
        try {
            const dialogCandidates = doc.querySelectorAll('dialog, [role="dialog"], [aria-modal="true"], [id*="drawer"], [class*="drawer"]');
            dialogCandidates.forEach((node) => {
                const el = node;
                const isHidden = el.hidden ||
                    el.getAttribute?.('aria-hidden') === 'true' ||
                    el.classList?.contains('hidden') ||
                    (typeof getComputedStyle !== 'undefined' && getComputedStyle(el).display === 'none') ||
                    (typeof getComputedStyle !== 'undefined' && getComputedStyle(el).visibility === 'hidden');
                if (!isHidden && (el.offsetParent !== null || el.offsetWidth > 0 || el.offsetHeight > 0)) {
                    visibleDialogCount++;
                    const title = el.getAttribute('aria-label') || el.querySelector('h1, h2, h3, h4, [class*="title"]')?.textContent?.trim() || '';
                    if (title) {
                        dialogTitles.push(title.slice(0, 100));
                    }
                }
            });
        }
        catch {
            // Bounded fallback in non-standard DOM environments
        }
        const statusSummaries = [];
        try {
            const statusNodes = doc.querySelectorAll('[role="status"], [role="alert"], .badge');
            statusNodes.forEach((node) => {
                const text = (node.textContent || '').trim().slice(0, 150);
                if (text) {
                    statusSummaries.push(text);
                }
            });
        }
        catch {
            // Bounded fallback
        }
        const counters = [];
        const contentSummaries = [];
        try {
            // Extract statistics cards, counters, and metrics
            const counterNodes = doc.querySelectorAll('.counter, .count, [class*="stat"], [class*="metric"], [class*="badge"], [data-count]');
            counterNodes.forEach((node) => {
                const text = (node.textContent || '').trim().replace(/\s+/g, ' ');
                const numMatch = text.match(/\b\d[\d,.]*\b/);
                if (numMatch && text.length < 100) {
                    const label = text.replace(numMatch[0], '').trim() || 'Counter';
                    counters.push({ label: label.slice(0, 60), value: numMatch[0] });
                }
            });
            // Extract visible headings
            const headings = doc.querySelectorAll('h1, h2, h3, h4');
            headings.forEach((h) => {
                const text = (h.textContent || '').trim().replace(/\s+/g, ' ');
                if (text && text.length > 2 && text.length < 120) {
                    contentSummaries.push(`Heading: ${text}`);
                }
            });
            // Extract table row counts
            const tables = doc.querySelectorAll('table, [role="table"], [role="grid"]');
            tables.forEach((tbl, idx) => {
                const rows = tbl.querySelectorAll('tr, [role="row"]');
                const headers = Array.from(tbl.querySelectorAll('th, [role="columnheader"]'))
                    .map(th => (th.textContent || '').trim())
                    .filter(Boolean)
                    .slice(0, 6);
                contentSummaries.push(`Table ${idx + 1}: ${rows.length > 0 ? rows.length - 1 : 0} records; columns: [${headers.join(', ')}]`);
            });
        }
        catch {
            // Bounded fallback
        }
        const routeFingerprint = typeof doc.location !== 'undefined' && doc.location?.pathname
            ? doc.location.pathname.slice(0, 50)
            : '/';
        const domain = typeof doc.location !== 'undefined' && doc.location?.hostname
            ? doc.location.hostname.slice(0, 100)
            : undefined;
        const win = doc.defaultView || (typeof window !== 'undefined' ? window : null);
        const docElem = doc.documentElement;
        const bodyElem = doc.body;
        const scrollTop = Math.max(0, Math.round(win?.scrollY ?? docElem?.scrollTop ?? bodyElem?.scrollTop ?? 0));
        const scrollHeight = Math.max(viewportHeight, Math.round(docElem?.scrollHeight ?? bodyElem?.scrollHeight ?? viewportHeight));
        const clientHeight = Math.max(1, Math.round(win?.innerHeight ?? docElem?.clientHeight ?? viewportHeight));
        const maxScrollTop = Math.max(0, scrollHeight - clientHeight);
        const scrollableBelow = scrollTop < maxScrollTop - 2;
        const scrollableAbove = scrollTop > 2;
        const pixelsBelow = Math.max(0, maxScrollTop - scrollTop);
        const pixelsAbove = Math.max(0, scrollTop);
        const scrollMetrics = {
            scrollTop,
            scrollHeight,
            clientHeight,
            maxScrollTop,
            scrollableBelow,
            scrollableAbove,
            pixelsBelow,
            pixelsAbove
        };
        // Bound interactive controls to at most 180 elements (strictly below closed schema 200 limit)
        let cappedInteractiveElements = interactiveElements;
        if (cappedInteractiveElements.length > 180) {
            cappedInteractiveElements = [...cappedInteractiveElements].sort((a, b) => {
                const aDialog = a.isInsideDialog ? 1 : 0;
                const bDialog = b.isInsideDialog ? 1 : 0;
                if (aDialog !== bDialog)
                    return bDialog - aDialog;
                const roleScore = (r) => {
                    if (r === 'input' || r === 'textarea' || r === 'select')
                        return 4;
                    if (r === 'button')
                        return 3;
                    if (r === 'tab' || r === 'menuitem')
                        return 2;
                    return 1;
                };
                const aScore = roleScore(a.role);
                const bScore = roleScore(b.role);
                if (aScore !== bScore)
                    return bScore - aScore;
                const aInView = a.boundingBox && a.boundingBox.y >= 0 && a.boundingBox.y <= viewportHeight ? 1 : 0;
                const bInView = b.boundingBox && b.boundingBox.y >= 0 && b.boundingBox.y <= viewportHeight ? 1 : 0;
                if (aInView !== bInView)
                    return bInView - aInView;
                return (a.boundingBox?.y || 0) - (b.boundingBox?.y || 0);
            }).slice(0, 180);
        }
        return {
            snapshot: {
                domElements,
                textNodes,
                imageElements,
                surfaces,
                interactiveElements: cappedInteractiveElements,
                pageTitle: doc.title ? doc.title.slice(0, 150) : 'Page',
                visibleDialogCount,
                dialogTitles,
                statusSummaries,
                counters: counters.slice(0, 20),
                contentSummaries: contentSummaries.slice(0, 15),
                routeFingerprint,
                domain,
                scrollMetrics
            },
            elementMap: this.elementMap
        };
    }
}
//# sourceMappingURL=element-extractor.js.map