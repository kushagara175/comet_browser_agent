/**
 * @privapilot/extension - Classical region proposal
 *
 * Proposes candidate regions inside a surface the DOM cannot describe - a canvas, a
 * cross-origin iframe, a closed shadow root - so the ViT has something bounded to
 * look at.
 *
 * **This is classical computer vision, not a detector.** A coarse grid is scored by
 * local gradient energy and the emptiest cells are dropped. Describing it as object
 * detection would be a claim the code does not support; what it does is decide where
 * on an otherwise opaque surface it is worth spending a 200 ms inference.
 *
 * Region count is capped because each proposal costs a full ViT forward pass. Left
 * uncapped, a large canvas would quietly turn one perception step into ten seconds.
 */
export interface ProposedRegion {
    readonly id: string;
    readonly x: number;
    readonly y: number;
    readonly width: number;
    readonly height: number;
    /** Mean local gradient magnitude - how much structure the cell contains. */
    readonly energy: number;
}
export interface ProposalOptions {
    /** Hard ceiling on proposals, since each one costs an inference. */
    readonly maxRegions?: number;
    /** Cells below this share of the strongest cell's energy are dropped as empty. */
    readonly relativeEnergyFloor?: number;
    /** Never propose a region smaller than this; the model sees 224x224 anyway. */
    readonly minCellPx?: number;
}
/**
 * Proposes regions inside one surface box on the screenshot canvas.
 *
 * Returns [] when the surface is too small to divide or carries no structure at all,
 * which is the correct answer for a blank canvas: there is nothing there to read, and
 * spending inferences to confirm that would be waste.
 */
export declare function proposeRegions(canvas: HTMLCanvasElement | OffscreenCanvas, surface: {
    x: number;
    y: number;
    width: number;
    height: number;
}, options?: ProposalOptions): ProposedRegion[];
//# sourceMappingURL=region-proposer.d.ts.map