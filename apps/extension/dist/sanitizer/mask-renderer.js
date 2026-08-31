/**
 * @privapilot/extension - Mask and Blur Canvas Renderer
 *
 * Renders opaque privacy masks and face blurs directly onto the screenshot pixel buffer.
 */
export class MaskRenderer {
    /**
     * Applies irreversible privacy masks and real face blurs directly onto the screenshot canvas.
     *
     * Enforces:
     * 1. Two-pass rendering: Blur pass first, opaque mask pass second (opaque masks always win).
     * 2. Strict bounds clamping to prevent sampling outside canvas boundaries.
     * 3. Irreversible block pixelation and color averaging for human faces.
     * 4. 100% opaque deep-slate blackouts for credentials, PII, payment data, and uninspectable surfaces.
     * 5. Fail-closed error handling if canvas operations fail.
     */
    static renderMasks(imageCanvas, regions) {
        const ctx = imageCanvas.getContext('2d');
        if (!ctx) {
            throw new Error('Canvas 2D context unavailable for sanitization rendering');
        }
        const canvasWidth = imageCanvas.width || 1280;
        const canvasHeight = imageCanvas.height || 720;
        // Split regions into two passes:
        // Pass 1: Face blur / pixelation regions (applied first so opaque masks can safely overlap)
        // Pass 2: Opaque blackout masks (text, credentials, payment data, uninspectable surfaces)
        const blurRegions = regions.filter((r) => r.method === 'gaussian_blur' && r.category === 'face');
        const opaqueRegions = regions.filter((r) => r.method !== 'gaussian_blur' || r.category !== 'face');
        let maskCount = 0;
        // --- PASS 1: Real Irreversible Face Blur / Block Pixelation ---
        for (const region of blurRegions) {
            const box = region.screenshotBox;
            // Conservative padding (minimum 8px) clamped strictly to canvas bounds
            const padding = 8;
            const x = Math.max(0, Math.min(canvasWidth - 1, Math.floor(box.x - padding)));
            const y = Math.max(0, Math.min(canvasHeight - 1, Math.floor(box.y - padding)));
            const w = Math.max(1, Math.min(canvasWidth - x, Math.ceil(box.width + padding * 2)));
            const h = Math.max(1, Math.min(canvasHeight - y, Math.ceil(box.height + padding * 2)));
            if (w <= 0 || h <= 0)
                continue;
            try {
                // Apply mathematical block pixelation averaging if getImageData is available
                if (typeof ctx.getImageData === 'function' && typeof ctx.putImageData === 'function') {
                    const imgData = ctx.getImageData(x, y, w, h);
                    const data = imgData.data;
                    // Block Pixelation: Average color in 16x16 blocks (or adaptive block size for small boxes)
                    const blockSize = Math.max(8, Math.min(24, Math.floor(Math.min(w, h) / 4)));
                    for (let by = 0; by < h; by += blockSize) {
                        for (let bx = 0; bx < w; bx += blockSize) {
                            let rSum = 0, gSum = 0, bSum = 0, aSum = 0;
                            let count = 0;
                            const bw = Math.min(blockSize, w - bx);
                            const bh = Math.min(blockSize, h - by);
                            // Calculate block average
                            for (let py = 0; py < bh; py++) {
                                for (let px = 0; px < bw; px++) {
                                    const idx = ((by + py) * w + (bx + px)) * 4;
                                    rSum += data[idx];
                                    gSum += data[idx + 1];
                                    bSum += data[idx + 2];
                                    aSum += data[idx + 3];
                                    count++;
                                }
                            }
                            const rAvg = Math.round(rSum / count);
                            const gAvg = Math.round(gSum / count);
                            const bAvg = Math.round(bSum / count);
                            const aAvg = Math.round(aSum / count);
                            // Fill block with average
                            for (let py = 0; py < bh; py++) {
                                for (let px = 0; px < bw; px++) {
                                    const idx = ((by + py) * w + (bx + px)) * 4;
                                    data[idx] = rAvg;
                                    data[idx + 1] = gAvg;
                                    data[idx + 2] = bAvg;
                                    data[idx + 3] = aAvg;
                                }
                            }
                        }
                    }
                    ctx.putImageData(imgData, x, y);
                }
                else {
                    // Fallback if getImageData is not implemented: draw frosted privacy blackout
                    ctx.save();
                    ctx.fillStyle = 'rgba(120, 140, 160, 0.98)';
                    ctx.fillRect(x, y, w, h);
                    ctx.restore();
                }
                // Draw subtle privacy badge over the blurred region
                ctx.save();
                ctx.strokeStyle = 'rgba(56, 189, 248, 0.6)';
                ctx.lineWidth = 1;
                ctx.strokeRect(x, y, w, h);
                if (w >= 40 && h >= 16) {
                    ctx.fillStyle = 'rgba(15, 23, 42, 0.85)';
                    ctx.fillRect(x + 2, y + 2, Math.min(w - 4, 85), 14);
                    ctx.fillStyle = '#38bdf8';
                    ctx.font = 'bold 9px sans-serif';
                    ctx.fillText('[FACE BLUR]', x + 5, y + 12);
                }
                ctx.restore();
                maskCount++;
            }
            catch (err) {
                throw new Error(`Face blur rendering failed at (${x}, ${y}, ${w}, ${h}): ${err.message}`);
            }
        }
        // --- PASS 2: Opaque Privacy Blackout Masks (Text, PII, Credentials, Cards, Surfaces) ---
        for (const region of opaqueRegions) {
            const box = region.screenshotBox;
            // Clamp strictly to canvas bounds
            const x = Math.max(0, Math.min(canvasWidth - 1, Math.floor(box.x)));
            const y = Math.max(0, Math.min(canvasHeight - 1, Math.floor(box.y)));
            const w = Math.max(1, Math.min(canvasWidth - x, Math.ceil(box.width)));
            const h = Math.max(1, Math.min(canvasHeight - y, Math.ceil(box.height)));
            if (w <= 0 || h <= 0)
                continue;
            try {
                ctx.save();
                // Solid opaque blackout mask (Alpha = 1.0)
                ctx.fillStyle = '#0f172a'; // Deep slate (RGB: 15, 23, 42)
                ctx.fillRect(x, y, w, h);
                // High contrast border
                ctx.strokeStyle = '#38bdf8';
                ctx.lineWidth = 1;
                ctx.strokeRect(x, y, w, h);
                // Category Tag Pill
                if (w > 45 && h > 12) {
                    ctx.fillStyle = '#38bdf8';
                    ctx.font = 'bold 9px sans-serif';
                    const label = `[REDACTED: ${region.category.toUpperCase()}]`;
                    ctx.fillText(label, x + 3, y + Math.min(11, h - 2));
                }
                ctx.restore();
                maskCount++;
            }
            catch (err) {
                throw new Error(`Opaque mask rendering failed at (${x}, ${y}, ${w}, ${h}): ${err.message}`);
            }
        }
        // Export to Data URL (fail closed if canvas export fails)
        let dataUrl;
        if (typeof imageCanvas.toDataURL === 'function') {
            dataUrl = imageCanvas.toDataURL('image/png');
        }
        else {
            throw new Error('Canvas export unavailable: HTMLCanvasElement with toDataURL required for mask rendering');
        }
        if (!dataUrl || !dataUrl.startsWith('data:image/png;base64,')) {
            throw new Error('Sanitized screenshot export failed: invalid data URL produced');
        }
        return {
            sanitizedScreenshotDataUrl: dataUrl,
            renderedMaskCount: maskCount
        };
    }
}
//# sourceMappingURL=mask-renderer.js.map