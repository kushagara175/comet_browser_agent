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
            if (typeof window !== 'undefined') {
                const delta = proposal.scrollDirection === 'up' ? -400 : 400;
                if (proposal.scrollDirection === 'top') {
                    window.scrollTo(0, 0);
                    document.documentElement?.scrollTo(0, 0);
                    document.body?.scrollTo(0, 0);
                }
                else if (proposal.scrollDirection === 'bottom') {
                    const maxScroll = Math.max(document.body?.scrollHeight || 0, document.documentElement?.scrollHeight || 0, 10000);
                    window.scrollTo(0, maxScroll);
                    document.documentElement?.scrollTo(0, maxScroll);
                    document.body?.scrollTo(0, maxScroll);
                }
                else {
                    const prevY = window.scrollY || document.documentElement?.scrollTop || document.body?.scrollTop || 0;
                    window.scrollBy(0, delta);
                    const newY = window.scrollY || document.documentElement?.scrollTop || document.body?.scrollTop || 0;
                    if (newY === prevY) {
                        const scrollable = document.querySelector('main, [role="main"], .main-content, #main, .content, .container, body');
                        if (scrollable && typeof scrollable.scrollBy === 'function') {
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
        // 3. Stale / missing targetLocalId validation
        if (!proposal.targetLocalId) {
            return {
                actionId: proposal.actionId,
                success: false,
                timestamp,
                semanticOutcomeVerified: false,
                message: 'Missing targetLocalId for DOM action'
            };
        }
        const targetEl = elementMap.get(proposal.targetLocalId);
        if (!targetEl) {
            return {
                actionId: proposal.actionId,
                success: false,
                timestamp,
                semanticOutcomeVerified: false,
                staleTarget: true,
                message: `Target element '${proposal.targetLocalId}' is stale or not found in DOM`
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
            return {
                actionId: proposal.actionId,
                success: false,
                timestamp,
                semanticOutcomeVerified: false,
                staleTarget: true,
                message: `Target element '${proposal.targetLocalId}' is hidden or invisible`
            };
        }
        // 6. Disabled target validation
        const isDisabled = targetEl.disabled === true ||
            targetEl.hasAttribute?.('disabled') ||
            targetEl.getAttribute?.('aria-disabled') === 'true';
        if (isDisabled) {
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
                if (MouseEventCtor) {
                    targetEl.dispatchEvent(new MouseEventCtor('mousedown', { bubbles: true, cancelable: true, composed: true }));
                    targetEl.dispatchEvent(new MouseEventCtor('mouseup', { bubbles: true, cancelable: true, composed: true }));
                }
                if (typeof targetEl.click === 'function') {
                    targetEl.click();
                }
                else if (EventCtor) {
                    targetEl.dispatchEvent(new EventCtor('click', { bubbles: true, cancelable: true, composed: true }));
                }
                return {
                    actionId: proposal.actionId,
                    success: true,
                    timestamp,
                    semanticOutcomeVerified: true,
                    message: `Clicked element '${proposal.targetLocalId}'`
                };
            }
            // TYPE ACTION
            if (proposal.kind === 'type' && proposal.textToType !== undefined) {
                const tag = targetEl.tagName.toLowerCase();
                const isInputOrTextArea = tag === 'input' || tag === 'textarea';
                const isContentEditable = targetEl.isContentEditable ||
                    targetEl.getAttribute?.('contenteditable') === 'true' ||
                    targetEl.getAttribute?.('role') === 'textbox';
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
                    const inputType = (targetEl.getAttribute?.('type') || 'text').toLowerCase();
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
                    const nonTextTypes = ['button', 'submit', 'reset', 'image', 'checkbox', 'radio', 'hidden'];
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
                // Dispatch keydown
                if (KeyboardEventCtor) {
                    targetEl.dispatchEvent(new KeyboardEventCtor('keydown', {
                        bubbles: true,
                        cancelable: true,
                        composed: true,
                        key: 'Process'
                    }));
                }
                const textToType = proposal.textToType;
                // Apply native prototype value setter
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
                        key: 'Process'
                    }));
                    if (proposal.pressEnter) {
                        targetEl.dispatchEvent(new KeyboardEventCtor('keydown', { key: 'Enter', code: 'Enter', keyCode: 13, which: 13, bubbles: true, cancelable: true }));
                        targetEl.dispatchEvent(new KeyboardEventCtor('keypress', { key: 'Enter', code: 'Enter', keyCode: 13, which: 13, bubbles: true, cancelable: true }));
                        targetEl.dispatchEvent(new KeyboardEventCtor('keyup', { key: 'Enter', code: 'Enter', keyCode: 13, which: 13, bubbles: true, cancelable: true }));
                        // Detect if this input is a client-side filter / search input or inside an ASP.NET wrapper form
                        const isSearchFilterInput = (targetEl.getAttribute?.('type') || '').toLowerCase() === 'search' ||
                            targetEl.hasAttribute?.('aria-controls') ||
                            Boolean(targetEl.closest?.('.dataTables_filter, .dataTable, .table-filter, [class*="filter" i]'));
                        const form = targetEl.form || (typeof targetEl.closest === 'function' ? targetEl.closest('form') : null);
                        const isAspnetWrapperForm = Boolean(form && (form.id === 'aspnetForm' || form.name === 'aspnetForm' || (form.getAttribute?.('action') || '').includes('.aspx')));
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
                            const searchBtn = container?.querySelector?.('button[aria-label*="search" i], button[title*="search" i], [role="button"][aria-label*="search" i]');
                            if (searchBtn && typeof searchBtn.click === 'function') {
                                try {
                                    searchBtn.click();
                                }
                                catch (_) { }
                            }
                        }
                    }
                }
                // Stagehand pattern: Dispatch synthetic blur event for modern SPAs to trigger field validation
                const FocusEventCtor = win?.FocusEvent || (typeof FocusEvent !== 'undefined' ? FocusEvent : null);
                if (FocusEventCtor) {
                    try {
                        targetEl.dispatchEvent(new FocusEventCtor('blur', { bubbles: false, cancelable: false, composed: true }));
                    }
                    catch (_) { }
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