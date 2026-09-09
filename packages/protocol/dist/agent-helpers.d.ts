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
export declare function setNativeControlledValue(element: any, value: string): boolean;
/**
 * Dispatches a complete synthetic Drag and Drop sequence between source and target elements.
 */
export declare function dispatchSyntheticDragAndDrop(source: any, target: any, options?: DragDropOptions): boolean;
/**
 * Uploads file content to an input element using synthetic DataTransfer file injection.
 */
export declare function dispatchSyntheticFileUpload(inputElement: any, fileSpec: FileUploadSpec): boolean;
/**
 * Dispatches synthetic hover event chain (mouseenter, mouseover, mousemove) to activate
 * dropdown menus, tooltips, and interactive hover states.
 */
export declare function dispatchSyntheticHover(element: any): boolean;
/**
 * Traverses a document or element tree to find all open shadow roots recursively.
 */
export declare function collectOpenShadowRoots(root: any): any[];
//# sourceMappingURL=agent-helpers.d.ts.map