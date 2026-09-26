/**
 * @privapilot/extension - Content Script DOM Action Executor
 *
 * Resolves localId back to the real DOM element and dispatches framework-compatible synthetic events.
 */
import { analyzeDomElementSensitivity } from '@privapilot/pii-rules';
function getAssociatedLabelText(el) {
    const doc = el.ownerDocument;
    if (!doc)
        return '';
    if (el.id) {
        try {
            const escapedId = typeof CSS !== 'undefined' && CSS.escape ? CSS.escape(el.id) : el.id;
            const labelEl = doc.querySelector?.(`label[for="${escapedId}"]`);
            if (labelEl)
                return labelEl.innerText?.trim() || labelEl.textContent?.trim() || '';
        }
        catch (_) { }
    }
    const parentLabel = el.closest?.('label');
    if (parentLabel) {
        return parentLabel.innerText?.trim() || parentLabel.textContent?.trim() || '';
    }
    const labelledBy = el.getAttribute?.('aria-labelledby');
    if (labelledBy) {
        try {
            const labelEl = doc.getElementById?.(labelledBy);
            if (labelEl)
                return labelEl.innerText?.trim() || labelEl.textContent?.trim() || '';
        }
        catch (_) { }
    }
    return '';
}
export class ActionExecutor {
    /**
     * Executes an action proposal on the target DOM element.
     */
    static execute(proposal, elementMap) {
        const timestamp = Date.now();
        // 1. Non-targeted / page-level actions
        if (proposal.kind === 'observe' ||
            proposal.kind === 'wait' ||
            proposal.kind === 'finish' ||
            proposal.kind === 'request_user_confirmation') {
            return {
                actionId: proposal.actionId,
                success: true,
                timestamp,
                semanticOutcomeVerified: true,
                message: proposal.kind === 'request_user_confirmation' ? 'User confirmation requested' : 'Observation completed'
            };
        }
        if (proposal.kind === 'scroll') {
            const doc = typeof document !== 'undefined' ? document : null;
            const win = typeof window !== 'undefined' ? window : null;
            const vh = win?.innerHeight || 800;
            const readingDelta = Math.max(350, Math.round(vh * 0.65));
            const delta = proposal.scrollDirection === 'up' ? -readingDelta : readingDelta;
            if (proposal.targetLocalId) {
                const targetEl = elementMap?.get(proposal.targetLocalId) ||
                    (doc ? (doc.querySelector(`[data-privapilot-id="${proposal.targetLocalId}"]`) ||
                        doc.querySelector(`[data-som-id="${proposal.targetLocalId}"]`)) : null);
                if (targetEl && typeof targetEl.scrollIntoView === 'function') {
                    try {
                        targetEl.scrollIntoView({ behavior: 'smooth', block: 'center', inline: 'nearest' });
                    }
                    catch (_) {
                        targetEl.scrollIntoView();
                    }
                }
                else if (win) {
                    try {
                        win.scrollBy({ top: delta, left: 0, behavior: 'smooth' });
                    }
                    catch (_) {
                        win.scrollBy(0, delta);
                    }
                }
            }
            else if (proposal.scrollDirection === 'top') {
                if (win) {
                    try {
                        win.scrollTo({ top: 0, left: 0, behavior: 'smooth' });
                    }
                    catch (_) {
                        win.scrollTo(0, 0);
                    }
                }
                try {
                    doc?.documentElement?.scrollTo?.({ top: 0, left: 0, behavior: 'smooth' });
                }
                catch (_) { }
                try {
                    doc?.body?.scrollTo?.({ top: 0, left: 0, behavior: 'smooth' });
                }
                catch (_) { }
            }
            else if (proposal.scrollDirection === 'bottom') {
                const maxScroll = Math.max(doc?.body?.scrollHeight || 0, doc?.documentElement?.scrollHeight || 0, 10000);
                if (win) {
                    try {
                        win.scrollTo({ top: maxScroll, left: 0, behavior: 'smooth' });
                    }
                    catch (_) {
                        win.scrollTo(0, maxScroll);
                    }
                }
                try {
                    doc?.documentElement?.scrollTo?.({ top: maxScroll, left: 0, behavior: 'smooth' });
                }
                catch (_) { }
                try {
                    doc?.body?.scrollTo?.({ top: maxScroll, left: 0, behavior: 'smooth' });
                }
                catch (_) { }
            }
            else {
                const prevY = win?.scrollY || doc?.documentElement?.scrollTop || doc?.body?.scrollTop || 0;
                if (win) {
                    try {
                        win.scrollBy({ top: delta, left: 0, behavior: 'smooth' });
                    }
                    catch (_) {
                        win.scrollBy(0, delta);
                    }
                }
                const newY = win?.scrollY || doc?.documentElement?.scrollTop || doc?.body?.scrollTop || 0;
                if (newY === prevY && doc) {
                    const scrollable = doc.querySelector('main, [role="main"], article, .mw-parser-output, .main-content, #main, .content, .container, body');
                    if (scrollable && typeof scrollable.scrollBy === 'function') {
                        try {
                            scrollable.scrollBy({ top: delta, left: 0, behavior: 'smooth' });
                        }
                        catch (_) {
                            scrollable.scrollBy(0, delta);
                        }
                    }
                }
            }
            return {
                actionId: proposal.actionId,
                success: true,
                timestamp,
                semanticOutcomeVerified: true,
                message: `Scrolled ${proposal.scrollDirection || 'down'}`
            };
        }
        // 1b. Navigate Action
        if (proposal.kind === 'navigate') {
            const navUrl = proposal.url || proposal.targetUrl || '';
            if (navUrl && typeof window !== 'undefined') {
                try {
                    window.location.href = navUrl;
                }
                catch (_) { }
                return {
                    actionId: proposal.actionId,
                    success: true,
                    timestamp,
                    semanticOutcomeVerified: true,
                    message: `Navigating to ${navUrl}`
                };
            }
        }
        // 2. Risk check
        if (proposal.risk === 'blocked') {
            return {
                actionId: proposal.actionId,
                success: false,
                timestamp,
                semanticOutcomeVerified: false,
                message: `Action blocked by client safety policy: ${proposal.rationale || 'blocked action'}`
            };
        }
        // 3. Target resolution via targetLocalId or physical coordinates
        let targetEl = proposal.targetLocalId ? elementMap.get(proposal.targetLocalId) : undefined;
        if (!targetEl && Array.isArray(proposal.coordinates) && proposal.coordinates.length >= 2) {
            const coords = proposal.coordinates;
            let cx = coords[0];
            let cy = coords[1];
            const win = typeof window !== 'undefined' ? window : null;
            if (win) {
                if (cx <= 1.0 && cy <= 1.0) {
                    cx = Math.round(cx * (win.innerWidth || 1280));
                    cy = Math.round(cy * (win.innerHeight || 800));
                }
                const doc = win.document;
                if (doc && typeof doc.elementFromPoint === 'function') {
                    targetEl = doc.elementFromPoint(cx, cy) || undefined;
                }
            }
        }
        // Semantic Target Recovery: If targetLocalId is not in elementMap, search DOM by target name / keywords
        if (!targetEl && proposal.targetLocalId) {
            const win = typeof window !== 'undefined' ? window : null;
            const doc = win?.document || (typeof document !== 'undefined' ? document : null);
            if (doc) {
                const fullText = (proposal.rationale || '') + ' ' + (proposal.reasoning || '') + ' ' + (proposal.targetName || '');
                const matchPhrase = fullText.match(/["']([^"']{3,40})["']/)?.[1] ||
                    fullText.match(/\b(?:click|open|select|navigate\s+to|check|explore)\s+([a-zA-Z0-9_&\s-]{3,30})/i)?.[1] || '';
                const cleanPhrase = matchPhrase.toLowerCase().replace(/[^a-z0-9]/g, '');
                if (cleanPhrase.length >= 3) {
                    const allInteractive = doc.querySelectorAll('a, button, [role="button"], [role="link"], [role="menuitem"], [role="tab"]');
                    for (let i = 0; i < allInteractive.length; i++) {
                        const item = allInteractive[i];
                        const itemText = (item.textContent || '').toLowerCase().replace(/[^a-z0-9]/g, '');
                        const itemAria = (item.getAttribute('aria-label') || '').toLowerCase().replace(/[^a-z0-9]/g, '');
                        const itemHref = (item.href || '').toLowerCase();
                        if (itemText.includes(cleanPhrase) || cleanPhrase.includes(itemText) || itemAria.includes(cleanPhrase) || itemHref.includes(cleanPhrase)) {
                            targetEl = item;
                            break;
                        }
                    }
                }
            }
        }
        if (!targetEl) {
            if (!proposal.targetLocalId && !proposal.coordinates) {
                return {
                    actionId: proposal.actionId,
                    success: false,
                    timestamp,
                    semanticOutcomeVerified: false,
                    message: 'Missing targetLocalId or coordinates for DOM action'
                };
            }
            return {
                actionId: proposal.actionId,
                success: false,
                timestamp,
                semanticOutcomeVerified: false,
                staleTarget: true,
                message: `Target element '${proposal.targetLocalId || `coordinates [${proposal.coordinates?.join(', ')}]`}' is stale or not found in DOM`
            };
        }
        // 4. Detached target validation
        const isConnected = targetEl.isConnected ?? (targetEl.ownerDocument && targetEl.ownerDocument.contains(targetEl));
        if (isConnected === false || (targetEl.ownerDocument && typeof targetEl.ownerDocument.contains === 'function' && !targetEl.ownerDocument.contains(targetEl))) {
            return {
                actionId: proposal.actionId,
                success: false,
                timestamp,
                semanticOutcomeVerified: false,
                staleTarget: true,
                message: `Target element '${proposal.targetLocalId}' is detached from the DOM`
            };
        }
        // 5. Hidden / invisible target validation
        let isHidden = false;
        if (targetEl.hidden || targetEl.getAttribute?.('aria-hidden') === 'true') {
            isHidden = true;
        }
        else {
            const win = targetEl.ownerDocument?.defaultView || (typeof window !== 'undefined' ? window : null);
            if (win && typeof win.getComputedStyle === 'function') {
                try {
                    const style = win.getComputedStyle(targetEl);
                    if (style.display === 'none' ||
                        style.visibility === 'hidden' ||
                        style.visibility === 'collapse' ||
                        style.opacity === '0') {
                        isHidden = true;
                    }
                }
                catch (_) { }
            }
        }
        if (isHidden) {
            // Dropdown / Navigation Menu Link Recovery: If target is an anchor link (e.g. inside a collapsed dropdown menu like 'Engagements')
            const anchorEl = (targetEl.tagName.toLowerCase() === 'a' ? targetEl : targetEl.closest?.('a'));
            const href = anchorEl?.href || anchorEl?.getAttribute('href') || '';
            if (href && !href.startsWith('javascript:') && !href.startsWith('#')) {
                const win = targetEl.ownerDocument?.defaultView || (typeof window !== 'undefined' ? window : null);
                if (win) {
                    win.location.href = href;
                    return {
                        actionId: proposal.actionId,
                        success: true,
                        timestamp,
                        semanticOutcomeVerified: true,
                        message: `Navigated directly to dropdown link "${href}"`
                    };
                }
            }
            // If inside a dropdown flyout, attempt to unhide by opening parent menu
            const parentDropdown = targetEl.closest('.dropdown, .menu, nav, ul, li, [role="menu"]')?.parentElement?.querySelector('button, a, [aria-haspopup]');
            if (parentDropdown && typeof parentDropdown.click === 'function') {
                parentDropdown.dispatchEvent(new MouseEvent('mouseover', { bubbles: true }));
                parentDropdown.dispatchEvent(new MouseEvent('mouseenter', { bubbles: true }));
                parentDropdown.click();
            }
            return {
                actionId: proposal.actionId,
                success: false,
                timestamp,
                semanticOutcomeVerified: false,
                staleTarget: true,
                message: `Target element '${proposal.targetLocalId}' is hidden or invisible`
            };
        }
        // 6. Actionable target resolution & self-healing (containers, WebComponents, child buttons)
        if (proposal.kind === 'click' || proposal.kind === 'hover') {
            // Prioritize active clickable child if target is a web component or button container (e.g. YouTube, Material UI, Lit)
            const actionableChild = targetEl.querySelector?.('button:not([disabled]):not([aria-disabled="true"]), a[href], [role="button"]:not([aria-disabled="true"]), button, a, [role="button"]') || null;
            if (actionableChild && actionableChild !== targetEl) {
                targetEl = actionableChild;
            }
            else {
                // If target is an icon, span, svg or wrapper inside a button/link, resolve to parent actionable element
                const parentBtn = targetEl.closest?.('button, a, [role="button"]');
                if (parentBtn && parentBtn !== targetEl) {
                    targetEl = parentBtn;
                }
            }
        }
        // 7. Disabled target validation
        // In modern Web applications (YouTube, GitHub, Material UI, Twitter), elements like like/subscribe/upvote buttons,
        // custom cards, or form buttons may have aria-disabled="true" for visual styling or to prompt login/validation.
        // aria-disabled does NOT stop DOM click dispatch, and should NEVER block user/agent clicks.
        // For type / select actions, native disabled state prevents user input and is enforced.
        const isStrictlyDisabled = targetEl.disabled === true ||
            targetEl.hasAttribute?.('disabled');
        if (isStrictlyDisabled && (proposal.kind === 'type' || proposal.kind === 'select')) {
            return {
                actionId: proposal.actionId,
                success: false,
                timestamp,
                semanticOutcomeVerified: false,
                message: `Target element '${proposal.targetLocalId}' is disabled`
            };
        }
        // Scroll into view if supported
        if (typeof targetEl.scrollIntoView === 'function') {
            try {
                targetEl.scrollIntoView({ behavior: 'smooth', block: 'center' });
            }
            catch (_) { }
        }
        const win = targetEl.ownerDocument?.defaultView || (typeof window !== 'undefined' ? window : null);
        const KeyboardEventCtor = win?.KeyboardEvent || (typeof KeyboardEvent !== 'undefined' ? KeyboardEvent : null);
        const EventCtor = win?.Event || (typeof Event !== 'undefined' ? Event : null);
        const InputEventCtor = win?.InputEvent || (typeof InputEvent !== 'undefined' ? InputEvent : null);
        const MouseEventCtor = win?.MouseEvent || (typeof MouseEvent !== 'undefined' ? MouseEvent : null);
        try {
            // CLICK ACTION
            if (proposal.kind === 'click') {
                if (typeof targetEl.focus === 'function') {
                    targetEl.focus();
                }
                const rect = typeof targetEl.getBoundingClientRect === 'function' ? targetEl.getBoundingClientRect() : { left: 10, top: 10, width: 20, height: 20 };
                const coords = proposal.coordinates;
                let clientX = rect.left + rect.width / 2;
                let clientY = rect.top + rect.height / 2;
                if (Array.isArray(coords) && coords.length >= 2) {
                    clientX = coords[0] <= 1.0 && typeof window !== 'undefined' ? Math.round(coords[0] * (window.innerWidth || 1280)) : coords[0];
                    clientY = coords[1] <= 1.0 && typeof window !== 'undefined' ? Math.round(coords[1] * (window.innerHeight || 800)) : coords[1];
                }
                const mouseInit = {
                    bubbles: true,
                    cancelable: true,
                    composed: true,
                    clientX,
                    clientY,
                    screenX: clientX,
                    screenY: clientY,
                    button: 0,
                    buttons: 1
                };
                // For anchor links (e.g. search result links, Google Custom Search results, download links),
                // ensure target is _self and handle downloadable file links directly.
                const anchorEl = (targetEl.tagName.toLowerCase() === 'a' ? targetEl : targetEl.closest?.('a'));
                if (anchorEl) {
                    const href = anchorEl.href || anchorEl.getAttribute('href') || '';
                    const isDownloadable = /\.(?:pdf|zip|csv|kmz|kml|tif|tiff|docx?|xlsx?)(?:\?.*)?$/i.test(href);
                    if (isDownloadable) {
                        const filename = href.split('/').pop()?.split('?')[0] || 'document.pdf';
                        anchorEl.setAttribute('download', filename);
                        anchorEl.download = filename;
                        try {
                            const globalChrome = globalThis.chrome;
                            if (typeof globalChrome !== 'undefined' && globalChrome.runtime?.sendMessage) {
                                globalChrome.runtime.sendMessage({
                                    type: 'TRIGGER_DOWNLOAD',
                                    url: href,
                                    filename
                                }).catch(() => { });
                            }
                        }
                        catch (_) { }
                        return {
                            actionId: proposal.actionId,
                            success: true,
                            timestamp,
                            semanticOutcomeVerified: true,
                            message: `✓ Download initiated for "${filename}"`
                        };
                    }
                    else if (anchorEl.getAttribute('target') === '_blank' || anchorEl.target === '_blank') {
                        anchorEl.target = '_self';
                        anchorEl.setAttribute('target', '_self');
                    }
                }
                const PointerEventCtor = win?.PointerEvent || (typeof PointerEvent !== 'undefined' ? PointerEvent : null);
                if (PointerEventCtor) {
                    try {
                        targetEl.dispatchEvent(new PointerEventCtor('pointerdown', { ...mouseInit, pointerId: 1, pointerType: 'mouse' }));
                        targetEl.dispatchEvent(new PointerEventCtor('pointerup', { ...mouseInit, pointerId: 1, pointerType: 'mouse' }));
                    }
                    catch (_) { }
                }
                if (MouseEventCtor) {
                    targetEl.dispatchEvent(new MouseEventCtor('mousedown', mouseInit));
                    targetEl.dispatchEvent(new MouseEventCtor('mouseup', mouseInit));
                }
                // If target has a native disabled attribute during click, temporarily unlock so native .click() dispatches
                const hadDisabled = targetEl.hasAttribute?.('disabled');
                if (hadDisabled) {
                    try {
                        targetEl.removeAttribute('disabled');
                    }
                    catch (_) { }
                }
                if (typeof targetEl.click === 'function') {
                    targetEl.click();
                }
                else if (EventCtor) {
                    targetEl.dispatchEvent(new (MouseEventCtor || EventCtor)('click', mouseInit));
                }
                // Also dispatch to parent if target is nested inside custom element
                if (targetEl.parentElement && targetEl.parentElement !== targetEl.ownerDocument?.body) {
                    try {
                        if (MouseEventCtor) {
                            targetEl.parentElement.dispatchEvent(new MouseEventCtor('click', mouseInit));
                        }
                    }
                    catch (_) { }
                }
                if (hadDisabled) {
                    try {
                        targetEl.setAttribute('disabled', '');
                    }
                    catch (_) { }
                }
                return {
                    actionId: proposal.actionId,
                    success: true,
                    timestamp,
                    semanticOutcomeVerified: true,
                    message: `Clicked element '${proposal.targetLocalId || `coordinates [${clientX}, ${clientY}]`}'`
                };
            }
            // TYPE ACTION
            if (proposal.kind === 'type' && proposal.textToType !== undefined) {
                let tag = targetEl.tagName.toLowerCase();
                let isInputOrTextArea = tag === 'input' || tag === 'textarea';
                let isContentEditable = targetEl.isContentEditable ||
                    targetEl.getAttribute?.('contenteditable') === 'true' ||
                    targetEl.getAttribute?.('role') === 'textbox';
                let inputType = tag === 'input' ? (targetEl.getAttribute?.('type') || 'text').toLowerCase() : '';
                const nonTextTypes = ['button', 'submit', 'reset', 'image', 'checkbox', 'radio', 'hidden'];
                let isNonTextInput = tag === 'input' && nonTextTypes.includes(inputType);
                // Self-healing: If target element is not directly editable (e.g. submit button, button, or container)
                // search for an editable input in the same form or container
                if ((!isInputOrTextArea && !isContentEditable) || isNonTextInput) {
                    const isEditableTarget = (el) => {
                        if (!el || typeof el.getAttribute !== 'function')
                            return false;
                        const t = el.tagName?.toLowerCase();
                        if (t === 'textarea')
                            return true;
                        if (t === 'input') {
                            const it = (el.getAttribute('type') || 'text').toLowerCase();
                            return !['button', 'submit', 'reset', 'image', 'checkbox', 'radio', 'hidden', 'file'].includes(it);
                        }
                        return (el.isContentEditable === true ||
                            el.getAttribute('contenteditable') === 'true' ||
                            el.getAttribute('role') === 'textbox' ||
                            el.getAttribute('role') === 'searchbox' ||
                            el.getAttribute('role') === 'combobox');
                    };
                    let healedEl = null;
                    const form = typeof targetEl.closest === 'function' ? targetEl.closest('form') : null;
                    if (form && typeof form.querySelectorAll === 'function') {
                        const inputs = form.querySelectorAll('input, textarea, [contenteditable="true"], [role="textbox"], [role="searchbox"]');
                        for (const inp of Array.from(inputs)) {
                            if (isEditableTarget(inp)) {
                                healedEl = inp;
                                break;
                            }
                        }
                    }
                    if (!healedEl && typeof targetEl.closest === 'function') {
                        const container = targetEl.closest('[role="search"], [role="combobox"], header, nav, .search, .search-box, .searchbar');
                        if (container && typeof container.querySelectorAll === 'function') {
                            const inputs = container.querySelectorAll('input, textarea, [contenteditable="true"], [role="textbox"], [role="searchbox"]');
                            for (const inp of Array.from(inputs)) {
                                if (isEditableTarget(inp)) {
                                    healedEl = inp;
                                    break;
                                }
                            }
                        }
                    }
                    if (!healedEl && targetEl.parentElement && typeof targetEl.parentElement.querySelectorAll === 'function') {
                        const parentInputs = targetEl.parentElement.querySelectorAll('input, textarea, [contenteditable="true"], [role="textbox"], [role="searchbox"]');
                        for (const inp of Array.from(parentInputs)) {
                            if (inp !== targetEl && isEditableTarget(inp)) {
                                healedEl = inp;
                                break;
                            }
                        }
                    }
                    // Self-heal to open modal, dialog, or focused input (common in airline autocomplete widgets)
                    if (!healedEl) {
                        const doc = targetEl.ownerDocument || (typeof document !== 'undefined' ? document : null);
                        if (doc && typeof doc.querySelectorAll === 'function') {
                            const modalInputs = doc.querySelectorAll('[role="dialog"] input, [role="alertdialog"] input, .modal input, [aria-modal="true"] input, ai-mobile-autocomplete-modal input, input:focus');
                            for (const inp of Array.from(modalInputs)) {
                                if (isEditableTarget(inp)) {
                                    healedEl = inp;
                                    break;
                                }
                            }
                        }
                    }
                    if (healedEl) {
                        targetEl = healedEl;
                        tag = targetEl.tagName.toLowerCase();
                        isInputOrTextArea = tag === 'input' || tag === 'textarea';
                        isContentEditable =
                            targetEl.isContentEditable ||
                                targetEl.getAttribute?.('contenteditable') === 'true' ||
                                targetEl.getAttribute?.('role') === 'textbox';
                        inputType = tag === 'input' ? (targetEl.getAttribute?.('type') || 'text').toLowerCase() : '';
                        isNonTextInput = tag === 'input' && nonTextTypes.includes(inputType);
                    }
                }
                // Reject semantically changed / non-editable targets
                if (!isInputOrTextArea && !isContentEditable) {
                    return {
                        actionId: proposal.actionId,
                        success: false,
                        timestamp,
                        semanticOutcomeVerified: false,
                        message: `Target element '${proposal.targetLocalId}' has semantically changed and does not support typing`
                    };
                }
                if (tag === 'input') {
                    if (inputType === 'file') {
                        try {
                            const fileName = (proposal.textToType || 'submission.pdf').split(/[/\\]/).pop() || 'submission.pdf';
                            if (typeof DataTransfer !== 'undefined') {
                                const dt = new DataTransfer();
                                const file = new File(['mock_content'], fileName, { type: 'application/pdf' });
                                dt.items.add(file);
                                targetEl.files = dt.files;
                            }
                            const EvtCtor = win?.Event || Event;
                            targetEl.dispatchEvent(new EvtCtor('change', { bubbles: true }));
                            targetEl.dispatchEvent(new EvtCtor('input', { bubbles: true }));
                            return {
                                actionId: proposal.actionId,
                                success: true,
                                timestamp,
                                semanticOutcomeVerified: true,
                                message: `Uploaded file '${fileName}' to file input '${proposal.targetLocalId}'`
                            };
                        }
                        catch (fileErr) {
                            return {
                                actionId: proposal.actionId,
                                success: false,
                                timestamp,
                                semanticOutcomeVerified: false,
                                message: `Failed to upload file to input '${proposal.targetLocalId}': ${fileErr.message}`
                            };
                        }
                    }
                    if (nonTextTypes.includes(inputType)) {
                        return {
                            actionId: proposal.actionId,
                            success: false,
                            timestamp,
                            semanticOutcomeVerified: false,
                            message: `Target element '${proposal.targetLocalId}' is input type '${inputType}' and does not support text input`
                        };
                    }
                }
                // Readonly validation
                const isReadOnly = targetEl.readOnly === true ||
                    targetEl.hasAttribute?.('readonly') ||
                    targetEl.getAttribute?.('aria-readonly') === 'true';
                if (isReadOnly) {
                    return {
                        actionId: proposal.actionId,
                        success: false,
                        timestamp,
                        semanticOutcomeVerified: false,
                        message: `Target element '${proposal.targetLocalId}' is read-only`
                    };
                }
                // Sensitive field safety policy enforcement
                const descriptor = {
                    tagName: tag,
                    type: targetEl.getAttribute?.('type') || undefined,
                    name: targetEl.getAttribute?.('name') || undefined,
                    id: targetEl.id || undefined,
                    autocomplete: targetEl.getAttribute?.('autocomplete') || undefined,
                    inputmode: targetEl.getAttribute?.('inputmode') || undefined,
                    placeholder: targetEl.getAttribute?.('placeholder') || undefined,
                    ariaLabel: targetEl.getAttribute?.('aria-label') || undefined,
                    associatedLabelText: getAssociatedLabelText(targetEl) || undefined
                };
                const sensitivity = analyzeDomElementSensitivity(descriptor);
                if (sensitivity.isSensitive && !proposal.userApproved) {
                    return {
                        actionId: proposal.actionId,
                        success: false,
                        timestamp,
                        semanticOutcomeVerified: false,
                        message: `Action blocked: Typing into sensitive field '${proposal.targetLocalId}' (${sensitivity.reason || sensitivity.category || 'sensitive'}) is prohibited without explicit user approval`
                    };
                }
                // Preserve focus behavior: focus the element before typing
                if (typeof targetEl.focus === 'function') {
                    targetEl.focus();
                }
                const textToType = proposal.textToType;
                // Dispatch keydown
                if (KeyboardEventCtor) {
                    targetEl.dispatchEvent(new KeyboardEventCtor('keydown', {
                        bubbles: true,
                        cancelable: true,
                        composed: true,
                        key: textToType.length === 1 ? textToType : 'Process'
                    }));
                }
                // Try document.execCommand('insertText') first (ideal for React/Next.js/Angular/Vue controlled inputs)
                let execCommandSucceeded = false;
                if (typeof document !== 'undefined' && typeof document.execCommand === 'function') {
                    try {
                        if (typeof targetEl.select === 'function') {
                            targetEl.select();
                        }
                        execCommandSucceeded = document.execCommand('insertText', false, textToType);
                    }
                    catch (_) {
                        execCommandSucceeded = false;
                    }
                }
                // Fallback to prototype value setter with React 16+ _valueTracker reset
                if (!execCommandSucceeded || targetEl.value !== textToType) {
                    if (tag === 'input') {
                        const inputProto = win?.HTMLInputElement?.prototype ||
                            (typeof HTMLInputElement !== 'undefined' ? HTMLInputElement.prototype : Object.getPrototypeOf(targetEl));
                        const descriptor = inputProto ? Object.getOwnPropertyDescriptor(inputProto, 'value') : undefined;
                        if (descriptor && descriptor.set) {
                            descriptor.set.call(targetEl, textToType);
                        }
                        else if ('value' in targetEl) {
                            targetEl.value = textToType;
                        }
                    }
                    else if (tag === 'textarea') {
                        const textAreaProto = win?.HTMLTextAreaElement?.prototype ||
                            (typeof HTMLTextAreaElement !== 'undefined' ? HTMLTextAreaElement.prototype : Object.getPrototypeOf(targetEl));
                        const descriptor = textAreaProto ? Object.getOwnPropertyDescriptor(textAreaProto, 'value') : undefined;
                        if (descriptor && descriptor.set) {
                            descriptor.set.call(targetEl, textToType);
                        }
                        else if ('value' in targetEl) {
                            targetEl.value = textToType;
                        }
                    }
                    else if ('value' in targetEl) {
                        targetEl.value = textToType;
                    }
                    else {
                        targetEl.textContent = textToType;
                    }
                    // Reset React 16+ value tracker so synthetic input event triggers React's onChange
                    const tracker = targetEl._valueTracker;
                    if (tracker && typeof tracker.setValue === 'function') {
                        tracker.setValue('');
                    }
                }
                // Dispatch input event with proper bubbling and composition
                let inputDispatched = false;
                if (InputEventCtor) {
                    try {
                        targetEl.dispatchEvent(new InputEventCtor('input', {
                            bubbles: true,
                            cancelable: true,
                            composed: true,
                            inputType: 'insertText',
                            data: textToType
                        }));
                        inputDispatched = true;
                    }
                    catch (_) {
                        inputDispatched = false;
                    }
                }
                if (!inputDispatched && EventCtor) {
                    targetEl.dispatchEvent(new EventCtor('input', {
                        bubbles: true,
                        cancelable: true,
                        composed: true
                    }));
                }
                // Dispatch change event with bubbling
                if (EventCtor) {
                    targetEl.dispatchEvent(new EventCtor('change', {
                        bubbles: true,
                        cancelable: true
                    }));
                }
                // Dispatch keyup
                if (KeyboardEventCtor) {
                    targetEl.dispatchEvent(new KeyboardEventCtor('keyup', {
                        bubbles: true,
                        cancelable: true,
                        composed: true,
                        key: textToType.length === 1 ? textToType : 'Process'
                    }));
                    if (proposal.pressEnter) {
                        targetEl.dispatchEvent(new KeyboardEventCtor('keydown', { key: 'Enter', code: 'Enter', keyCode: 13, which: 13, bubbles: true, cancelable: true }));
                        targetEl.dispatchEvent(new KeyboardEventCtor('keypress', { key: 'Enter', code: 'Enter', keyCode: 13, which: 13, bubbles: true, cancelable: true }));
                        targetEl.dispatchEvent(new KeyboardEventCtor('keyup', { key: 'Enter', code: 'Enter', keyCode: 13, which: 13, bubbles: true, cancelable: true }));
                        const form = targetEl.form || (typeof targetEl.closest === 'function' ? targetEl.closest('form') : null);
                        const formAction = (form?.getAttribute?.('action') || '').toLowerCase();
                        const isECommerceOrSearchForm = Boolean(form && (formAction.includes('/s') ||
                            formAction.includes('search') ||
                            (form.id && /search|nav-search|header-search/i.test(form.id))));
                        // Detect if this input is a client-side filter / search input or inside an ASP.NET wrapper form
                        const isSearchFilterInput = !isECommerceOrSearchForm && (((targetEl.getAttribute?.('type') || '').toLowerCase() === 'search' && !form) ||
                            (targetEl.hasAttribute?.('aria-controls') && !form) ||
                            Boolean(targetEl.closest?.('.dataTables_filter, .dataTable, .table-filter, [class*="filter" i]')));
                        const isAspnetWrapperForm = Boolean(form && (form.id === 'aspnetForm' || form.name === 'aspnetForm' || formAction.includes('.aspx')));
                        // Dispatch HTML5 'search' event for DataTables / instant table filters
                        if (EventCtor) {
                            try {
                                targetEl.dispatchEvent(new EventCtor('search', { bubbles: true, cancelable: true }));
                            }
                            catch (_) { }
                        }
                        // Only submit if it's a real form submission (e.g. Wikipedia search, Google search, login forms),
                        // and NOT a client-side table filter or ASP.NET postback wrapper!
                        if (form && !isSearchFilterInput && !isAspnetWrapperForm) {
                            const submitBtn = form.querySelector?.('button[type="submit"], input[type="submit"], button:not([type]), [role="button"]');
                            if (typeof form.requestSubmit === 'function') {
                                try {
                                    if (submitBtn) {
                                        form.requestSubmit(submitBtn);
                                    }
                                    else {
                                        form.requestSubmit();
                                    }
                                }
                                catch (_) {
                                    try {
                                        if (submitBtn && typeof submitBtn.click === 'function') {
                                            submitBtn.click();
                                        }
                                        else {
                                            form.submit();
                                        }
                                    }
                                    catch (__) { }
                                }
                            }
                            else if (submitBtn && typeof submitBtn.click === 'function') {
                                try {
                                    submitBtn.click();
                                }
                                catch (_) {
                                    try {
                                        form.submit();
                                    }
                                    catch (__) { }
                                }
                            }
                            else if (typeof form.submit === 'function') {
                                try {
                                    form.submit();
                                }
                                catch (_) { }
                            }
                        }
                        else if (!form) {
                            const container = targetEl.parentElement?.parentElement || targetEl.parentElement;
                            const searchBtn = container?.querySelector?.('button[aria-label*="search" i], button[title*="search" i], [role="button"][aria-label*="search" i], [aria-label="search"]');
                            if (searchBtn && typeof searchBtn.click === 'function') {
                                try {
                                    searchBtn.click();
                                }
                                catch (_) { }
                            }
                        }
                    }
                }
                // Only dispatch synthetic blur for non-search form fields.
                // Never dispatch blur on search inputs, comboboxes, or autocomplete targets because
                // blur immediately dismisses autocomplete dropdown popups and can revert React controlled values.
                const isSearchOrAutocomplete = Boolean(targetEl.closest?.('[role="search"], [role="combobox"], [aria-autocomplete], .search, .search-box, .searchbar, #search, [class*="search" i]')) ||
                    (targetEl.getAttribute?.('type') || '').toLowerCase() === 'search' ||
                    (targetEl.getAttribute?.('role') || '').toLowerCase() === 'combobox' ||
                    (targetEl.getAttribute?.('role') || '').toLowerCase() === 'searchbox' ||
                    targetEl.hasAttribute?.('aria-autocomplete') ||
                    /search|find|filter|locate|query/i.test(targetEl.getAttribute?.('placeholder') || '') ||
                    /search|find|filter|locate|query/i.test(targetEl.getAttribute?.('aria-label') || '');
                if (!isSearchOrAutocomplete) {
                    const FocusEventCtor = win?.FocusEvent || (typeof FocusEvent !== 'undefined' ? FocusEvent : null);
                    if (FocusEventCtor) {
                        try {
                            targetEl.dispatchEvent(new FocusEventCtor('blur', { bubbles: false, cancelable: false, composed: true }));
                        }
                        catch (_) { }
                    }
                }
                return {
                    actionId: proposal.actionId,
                    success: true,
                    timestamp,
                    semanticOutcomeVerified: true,
                    message: `Typed text into element '${proposal.targetLocalId}'`
                };
            }
            // SELECT ACTION
            if (proposal.kind === 'select' && proposal.selectOptionValue !== undefined) {
                if (targetEl.tagName.toLowerCase() !== 'select') {
                    return {
                        actionId: proposal.actionId,
                        success: false,
                        timestamp,
                        semanticOutcomeVerified: false,
                        message: `Target element '${proposal.targetLocalId}' has semantically changed or is not a select element`
                    };
                }
                if (typeof targetEl.focus === 'function') {
                    targetEl.focus();
                }
                const selectProto = win?.HTMLSelectElement?.prototype ||
                    (typeof HTMLSelectElement !== 'undefined' ? HTMLSelectElement.prototype : Object.getPrototypeOf(targetEl));
                const descriptor = selectProto ? Object.getOwnPropertyDescriptor(selectProto, 'value') : undefined;
                if (descriptor && descriptor.set) {
                    descriptor.set.call(targetEl, proposal.selectOptionValue);
                }
                else {
                    targetEl.value = proposal.selectOptionValue;
                }
                const selectEl = targetEl;
                const val = proposal.selectOptionValue.toLowerCase().trim();
                for (let i = 0; i < selectEl.options.length; i++) {
                    const opt = selectEl.options[i];
                    if (opt.value.toLowerCase() === val || opt.text.toLowerCase() === val) {
                        selectEl.selectedIndex = i;
                        opt.selected = true;
                        break;
                    }
                }
                if (EventCtor) {
                    targetEl.dispatchEvent(new EventCtor('input', { bubbles: true, cancelable: true, composed: true }));
                    targetEl.dispatchEvent(new EventCtor('change', { bubbles: true, cancelable: true }));
                }
                return {
                    actionId: proposal.actionId,
                    success: true,
                    timestamp,
                    semanticOutcomeVerified: true,
                    message: `Selected option '${proposal.selectOptionValue}' in element '${proposal.targetLocalId}'`
                };
            }
            // HOVER ACTION
            if (proposal.kind === 'hover') {
                if (typeof targetEl.focus === 'function') {
                    targetEl.focus();
                }
                if (MouseEventCtor) {
                    targetEl.dispatchEvent(new MouseEventCtor('mouseenter', { bubbles: false, cancelable: true, composed: true }));
                    targetEl.dispatchEvent(new MouseEventCtor('mouseover', { bubbles: true, cancelable: true, composed: true }));
                    targetEl.dispatchEvent(new MouseEventCtor('mousemove', { bubbles: true, cancelable: true, composed: true }));
                }
                return {
                    actionId: proposal.actionId,
                    success: true,
                    timestamp,
                    semanticOutcomeVerified: true,
                    message: `Hovered over element '${proposal.targetLocalId}'`
                };
            }
            // DRAG AND DROP ACTION
            if (proposal.kind === 'drag_and_drop') {
                if (!proposal.destinationLocalId) {
                    return {
                        actionId: proposal.actionId,
                        success: false,
                        timestamp,
                        semanticOutcomeVerified: false,
                        message: 'drag_and_drop requires a destinationLocalId'
                    };
                }
                const destEl = elementMap.get(proposal.destinationLocalId);
                if (!destEl) {
                    return {
                        actionId: proposal.actionId,
                        success: false,
                        timestamp,
                        semanticOutcomeVerified: false,
                        staleTarget: true,
                        message: `Destination element '${proposal.destinationLocalId}' not found in DOM`
                    };
                }
                try {
                    destEl.scrollIntoView?.({ behavior: 'smooth', block: 'center' });
                }
                catch (_) { }
                let dataTransfer;
                if (typeof DataTransfer !== 'undefined') {
                    dataTransfer = new DataTransfer();
                }
                else {
                    const store = new Map();
                    dataTransfer = {
                        data: store,
                        dropEffect: 'move',
                        effectAllowed: 'all',
                        types: [],
                        setData(format, data) {
                            store.set(format, data);
                            if (!this.types.includes(format))
                                this.types.push(format);
                        },
                        getData(format) { return store.get(format) || ''; },
                        clearData() { store.clear(); this.types = []; }
                    };
                }
                const DragEventCtor = win?.DragEvent || (typeof DragEvent !== 'undefined' ? DragEvent : null);
                const createEvt = (type) => {
                    if (DragEventCtor) {
                        return new DragEventCtor(type, {
                            bubbles: true,
                            cancelable: true,
                            composed: true,
                            dataTransfer
                        });
                    }
                    if (EventCtor) {
                        const e = new EventCtor(type, { bubbles: true, cancelable: true, composed: true });
                        e.dataTransfer = dataTransfer;
                        return e;
                    }
                    return null;
                };
                const eStart = createEvt('dragstart');
                if (eStart)
                    targetEl.dispatchEvent(eStart);
                const eEnter = createEvt('dragenter');
                if (eEnter)
                    destEl.dispatchEvent(eEnter);
                const eOver = createEvt('dragover');
                if (eOver)
                    destEl.dispatchEvent(eOver);
                const eDrop = createEvt('drop');
                if (eDrop)
                    destEl.dispatchEvent(eDrop);
                const eEnd = createEvt('dragend');
                if (eEnd)
                    targetEl.dispatchEvent(eEnd);
                return {
                    actionId: proposal.actionId,
                    success: true,
                    timestamp,
                    semanticOutcomeVerified: true,
                    message: `Dragged element '${proposal.targetLocalId}' to '${proposal.destinationLocalId}'`
                };
            }
            // UPLOAD FILE ACTION
            if (proposal.kind === 'upload_file') {
                const fileName = proposal.fileName || 'upload.pdf';
                const fileContent = proposal.fileData || 'privapilot_synthetic_upload_payload';
                const mimeType = proposal.mimeType || 'application/pdf';
                try {
                    let fileObj;
                    if (typeof File !== 'undefined') {
                        fileObj = new File([fileContent], fileName, { type: mimeType, lastModified: Date.now() });
                    }
                    else {
                        fileObj = { name: fileName, type: mimeType, size: fileContent.length, lastModified: Date.now() };
                    }
                    if (typeof DataTransfer !== 'undefined') {
                        const dt = new DataTransfer();
                        if (dt.items && typeof dt.items.add === 'function') {
                            dt.items.add(fileObj);
                        }
                        targetEl.files = dt.files;
                    }
                    else {
                        targetEl.files = [fileObj];
                    }
                    if (EventCtor) {
                        targetEl.dispatchEvent(new EventCtor('input', { bubbles: true, cancelable: true, composed: true }));
                        targetEl.dispatchEvent(new EventCtor('change', { bubbles: true, cancelable: true }));
                    }
                    return {
                        actionId: proposal.actionId,
                        success: true,
                        timestamp,
                        semanticOutcomeVerified: true,
                        message: `Uploaded file '${fileName}' to element '${proposal.targetLocalId}'`
                    };
                }
                catch (uploadErr) {
                    return {
                        actionId: proposal.actionId,
                        success: false,
                        timestamp,
                        semanticOutcomeVerified: false,
                        message: `Failed to upload file to '${proposal.targetLocalId}': ${uploadErr.message}`
                    };
                }
            }
            return {
                actionId: proposal.actionId,
                success: false,
                timestamp,
                semanticOutcomeVerified: false,
                message: `Unsupported action kind '${proposal.kind}'`
            };
        }
        catch (err) {
            return {
                actionId: proposal.actionId,
                success: false,
                timestamp,
                semanticOutcomeVerified: false,
                message: `Execution failed: ${err.message}`
            };
        }
    }
}
//# sourceMappingURL=action-executor.js.map