/**
 * @privapilot/protocol - Agent Helpers & Synthetic Event Orchestration
 *
 * Implements resilient browser interaction helpers ported and adapted from
 * top-tier browser agent harnesses (browser-use/browser-harness):
 * - Framework-resilient controlled input value setting (React 15/16+ fibers, Vue, Angular)
 * - Synthetic Drag-and-Drop event chains with DataTransfer
 * - Direct FileUpload synthesis for <input type="file"> via DataTransfer
 * - Hover / Mouse Pointer dispatch sequences
 * - Shadow DOM traversal & open root discovery
 */

export interface DragDropOptions {
  readonly data?: Record<string, string>;
  readonly dropEffect?: 'none' | 'copy' | 'link' | 'move';
}

export interface FileUploadSpec {
  readonly fileName: string;
  readonly content: string;
  readonly mimeType?: string;
  readonly lastModified?: number;
}

/**
 * Resiliently sets an input or textarea value across modern reactive frameworks
 * (React, Vue, Angular, Svelte) by invoking native prototype setters and dispatching
 * synthetic bubbling and composed events.
 */
export function setNativeControlledValue(
  element: any,
  value: string
): boolean {
  if (!element) return false;

  try {
    const isTextArea = element.tagName === 'TEXTAREA';
    const proto = isTextArea
      ? (typeof window !== 'undefined' ? (window as any).HTMLTextAreaElement?.prototype : null)
      : (typeof window !== 'undefined' ? (window as any).HTMLInputElement?.prototype : null);

    const nativeSetter = proto
      ? Object.getOwnPropertyDescriptor(proto, 'value')?.set
      : null;

    if (nativeSetter) {
      nativeSetter.call(element, value);
    } else {
      element.value = value;
    }

    if (typeof element.dispatchEvent === 'function') {
      // Dispatch both 'input' and 'change' events
      const InputEventCtor = (typeof window !== 'undefined' && (window as any).InputEvent) || (typeof window !== 'undefined' ? (window as any).Event : null);
      if (InputEventCtor) {
        const inputEvt = new InputEventCtor('input', { bubbles: true, cancelable: true, composed: true });
        element.dispatchEvent(inputEvt);

        const EventCtor = typeof window !== 'undefined' ? (window as any).Event : null;
        if (EventCtor) {
          const changeEvt = new EventCtor('change', { bubbles: true, cancelable: true, composed: true });
          element.dispatchEvent(changeEvt);
        }
      }
    }

    return true;
  } catch {
    // Fallback: direct assignment
    try {
      element.value = value;
      return true;
    } catch {
      return false;
    }
  }
}

/**
 * Dispatches a complete synthetic Drag and Drop sequence between source and target elements.
 */
export function dispatchSyntheticDragAndDrop(
  source: any,
  target: any,
  options?: DragDropOptions
): boolean {
  if (!source || !target) return false;

  try {
    // Synthetic DataTransfer fallback
    let dataTransfer: any;
    if (typeof (globalThis as any).DataTransfer === 'function') {
      dataTransfer = new (globalThis as any).DataTransfer();
    } else {
      const store = new Map<string, string>();
      dataTransfer = {
        data: store,
        dropEffect: options?.dropEffect || 'move',
        effectAllowed: 'all',
        types: [] as string[],
        setData(format: string, data: string) {
          store.set(format, data);
          if (!this.types.includes(format)) this.types.push(format);
        },
        getData(format: string) {
          return store.get(format) || '';
        },
        clearData(format?: string) {
          if (format) {
            store.delete(format);
            this.types = this.types.filter((t: string) => t !== format);
          } else {
            store.clear();
            this.types = [];
          }
        }
      };
    }

    if (options?.data) {
      for (const [key, val] of Object.entries(options.data)) {
        dataTransfer.setData(key, val);
      }
    }

    const createDragEvent = (type: string) => {
      const DragEventCtor = (typeof window !== 'undefined' && (window as any).DragEvent) || (typeof window !== 'undefined' ? (window as any).CustomEvent : null);
      if (DragEventCtor) {
        return new DragEventCtor(type, {
          bubbles: true,
          cancelable: true,
          composed: true,
          dataTransfer,
          detail: 0
        });
      }
      return null;
    };

    // Sequence: dragstart on source -> dragenter on target -> dragover on target -> drop on target -> dragend on source
    const dragStart = createDragEvent('dragstart');
    if (dragStart) source.dispatchEvent(dragStart);

    const dragEnter = createDragEvent('dragenter');
    if (dragEnter) target.dispatchEvent(dragEnter);

    const dragOver = createDragEvent('dragover');
    if (dragOver) target.dispatchEvent(dragOver);

    const drop = createDragEvent('drop');
    if (drop) target.dispatchEvent(drop);

    const dragEnd = createDragEvent('dragend');
    if (dragEnd) source.dispatchEvent(dragEnd);

    return true;
  } catch {
    return false;
  }
}

/**
 * Uploads file content to an input element using synthetic DataTransfer file injection.
 */
export function dispatchSyntheticFileUpload(
  inputElement: any,
  fileSpec: FileUploadSpec
): boolean {
  if (!inputElement) return false;

  try {
    const mimeType = fileSpec.mimeType || 'text/plain';
    let fileObj: any;

    if (typeof (globalThis as any).File === 'function') {
      const blobParts = [fileSpec.content];
      fileObj = new (globalThis as any).File(blobParts, fileSpec.fileName, {
        type: mimeType,
        lastModified: fileSpec.lastModified || Date.now()
      });
    } else {
      fileObj = {
        name: fileSpec.fileName,
        type: mimeType,
        size: fileSpec.content.length,
        lastModified: fileSpec.lastModified || Date.now()
      };
    }

    if (typeof (globalThis as any).DataTransfer === 'function') {
      const dt = new (globalThis as any).DataTransfer();
      if (dt.items && typeof dt.items.add === 'function') {
        dt.items.add(fileObj);
      }
      inputElement.files = dt.files;
    } else {
      // Mock assignment for test environments
      inputElement.files = [fileObj];
    }

    // Trigger change and input events
    const EventCtor = typeof window !== 'undefined' ? (window as any).Event : null;
    if (EventCtor && typeof inputElement.dispatchEvent === 'function') {
      inputElement.dispatchEvent(new EventCtor('input', { bubbles: true, cancelable: true, composed: true }));
      inputElement.dispatchEvent(new EventCtor('change', { bubbles: true, cancelable: true, composed: true }));
    }

    return true;
  } catch {
    return false;
  }
}

/**
 * Dispatches synthetic hover event chain (mouseenter, mouseover, mousemove) to activate
 * dropdown menus, tooltips, and interactive hover states.
 */
export function dispatchSyntheticHover(element: any): boolean {
  if (!element || typeof element.dispatchEvent !== 'function') return false;

  try {
    const MouseEventCtor = typeof window !== 'undefined' ? (window as any).MouseEvent : null;
    if (!MouseEventCtor) return false;

    const mouseEnter = new MouseEventCtor('mouseenter', { bubbles: false, cancelable: true, composed: true });
    element.dispatchEvent(mouseEnter);

    const mouseOver = new MouseEventCtor('mouseover', { bubbles: true, cancelable: true, composed: true });
    element.dispatchEvent(mouseOver);

    const mouseMove = new MouseEventCtor('mousemove', { bubbles: true, cancelable: true, composed: true });
    element.dispatchEvent(mouseMove);

    return true;
  } catch {
    return false;
  }
}

/**
 * Traverses a document or element tree to find all open shadow roots recursively.
 */
export function collectOpenShadowRoots(root: any): any[] {
  const shadowRoots: any[] = [];
  if (!root) return shadowRoots;

  const walker = (node: any) => {
    if (!node) return;
    if (node.shadowRoot) {
      shadowRoots.push(node.shadowRoot);
      walker(node.shadowRoot);
    }
    const children = node.children || [];
    for (let i = 0; i < children.length; i++) {
      walker(children[i]);
    }
  };

  walker(root);
  return shadowRoots;
}
