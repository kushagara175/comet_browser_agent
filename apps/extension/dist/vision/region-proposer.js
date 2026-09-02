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
const DEFAULTS = {
    maxRegions: 6,
    relativeEnergyFloor: 0.15,
    minCellPx: 48
};
/** Mean absolute luminance gradient over a cell - a proxy for "is anything here". */
function cellEnergy(data, stride, x0, y0, w, h) {
    if (w < 2 || h < 2)
        return 0;
    let sum = 0;
    let pairs = 0;
    for (let y = y0; y < y0 + h - 1; y++) {
        for (let x = x0; x < x0 + w - 1; x++) {
            const i = (y * stride + x) * 4;
            const r = (i + 4);
            const d = (i + stride * 4);
            const lum = 0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2];
            const lumR = 0.299 * data[r] + 0.587 * data[r + 1] + 0.114 * data[r + 2];
            const lumD = 0.299 * data[d] + 0.587 * data[d + 1] + 0.114 * data[d + 2];
            sum += Math.abs(lum - lumR) + Math.abs(lum - lumD);
            pairs += 2;
        }
    }
    return pairs === 0 ? 0 : sum / pairs;
}
/**
 * Proposes regions inside one surface box on the screenshot canvas.
 *
 * Returns [] when the surface is too small to divide or carries no structure at all,
 * which is the correct answer for a blank canvas: there is nothing there to read, and
 * spending inferences to confirm that would be waste.
 */
export function proposeRegions(canvas, surface, options = {}) {
    const opts = { ...DEFAULTS, ...options };
    const ctx = canvas.getContext('2d');
    if (!ctx || typeof ctx.getImageData !== 'function')
        return [];
    const cw = canvas.width;
    const ch = canvas.height;
    const sx = Math.max(0, Math.min(cw - 1, Math.floor(surface.x)));
    const sy = Math.max(0, Math.min(ch - 1, Math.floor(surface.y)));
    const sw = Math.max(1, Math.min(cw - sx, Math.floor(surface.width)));
    const sh = Math.max(1, Math.min(ch - sy, Math.floor(surface.height)));
    if (sw < opts.minCellPx || sh < opts.minCellPx)
        return [];
    let img;
    try {
        img = ctx.getImageData(sx, sy, sw, sh);
    }
    catch {
        return [];
    }
    // Grid shaped by the surface's own aspect ratio, so a wide banner is split into
    // columns rather than forced into squares.
    const cols = Math.max(1, Math.min(4, Math.floor(sw / opts.minCellPx)));
    const rows = Math.max(1, Math.min(4, Math.floor(sh / opts.minCellPx)));
    if (cols * rows <= 1) {
        // Too small to subdivide: the whole surface is the only sensible proposal.
        const energy = cellEnergy(img.data, sw, 0, 0, sw, sh);
        return energy > 0 ? [{ id: 'r0', x: sx, y: sy, width: sw, height: sh, energy }] : [];
    }
    const cellW = Math.floor(sw / cols);
    const cellH = Math.floor(sh / rows);
    const cells = [];
    for (let r = 0; r < rows; r++) {
        for (let c = 0; c < cols; c++) {
            const x0 = c * cellW;
            const y0 = r * cellH;
            const w = c === cols - 1 ? sw - x0 : cellW;
            const h = r === rows - 1 ? sh - y0 : cellH;
            cells.push({
                id: `r${r}c${c}`,
                x: sx + x0,
                y: sy + y0,
                width: w,
                height: h,
                energy: cellEnergy(img.data, sw, x0, y0, w, h)
            });
        }
    }
    const peak = cells.reduce((m, c) => Math.max(m, c.energy), 0);
    if (peak <= 0)
        return [];
    return cells
        .filter((c) => c.energy >= peak * opts.relativeEnergyFloor)
        .sort((a, b) => b.energy - a.energy)
        .slice(0, opts.maxRegions)
        .map((c) => ({ ...c, energy: Math.round(c.energy * 100) / 100 }));
}
//# sourceMappingURL=region-proposer.js.map