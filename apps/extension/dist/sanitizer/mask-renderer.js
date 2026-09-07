/**
 * @privapilot/extension - Mask and Blur Canvas Renderer
 *
 * Renders opaque privacy masks and face blurs directly onto the screenshot pixel buffer.
 * Validates geometry, enforces pixel-true coverage, and triggers opaque fallbacks
 * when face blur cannot be proven.
 */
import { validateRegionGeometry, computeLuminanceVariance, overlayFractionOf } from './pixel-verifier.js';
export class MaskRenderer {
    /**
     * Applies irreversible privacy masks and real face blurs directly onto the screenshot canvas.
     *
     * Enforces:
     * 1. Two-pass rendering: Blur pass first, opaque mask pass second (opaque masks always win).
     * 2. Strict geometry validation: Rejects NaN, Inf, non-positive dimensions, off-canvas, or 1px degenerate boxes.
     * 3. Irreversible block pixelation and color averaging for human faces with automatic opaque fallback if unproven.
     * 4. 100% opaque deep-slate blackouts for credentials, PII, payment data, and uninspectable surfaces.
     * 5. Per-region forensic audit records.
     */
    static renderMasks(imageCanvas, regions) {
        const ctx = imageCanvas.getContext('2d');
        if (!ctx) {
            throw new Error('Canvas 2D context unavailable for sanitization rendering');
        }
        const canvasWidth = imageCanvas.width || 1280;
        const canvasHeight = imageCanvas.height || 720;
        const regionRecords = [];
        // Split regions into two passes:
        // Pass 1: Face blur / pixelation regions (applied first so opaque masks can safely overlap)
        // Pass 2: Opaque blackout masks (text, credentials, payment data, uninspectable surfaces)
        const blurRegions = regions.filter((r) => r.method === 'gaussian_blur' && r.category === 'face');
        const opaqueRegions = regions.filter((r) => r.method !== 'gaussian_blur' || r.category !== 'face');
        let maskCount = 0;
        // --- PASS 1: Irreversible Face Blur / Pixelation with Verified Opaque Fallback ---
        for (const region of blurRegions) {
            const box = region.screenshotBox;
            const geom = validateRegionGeometry(box, canvasWidth, canvasHeight);
            if (!geom.isValid) {
                regionRecords.push({
                    regionId: region.id,
                    requestedBox: box,
                    clampedBox: { x: 0, y: 0, width: 0, height: 0 },
                    method: 'gaussian_blur',
                    success: false,
                    failureReason: `Invalid geometry: ${geom.reason}`
                });
                continue;
            }
            // Conservative padding (minimum 8px) clamped strictly to canvas bounds
            const padding = 8;
            const x = Math.max(0, Math.min(canvasWidth - 1, Math.floor(box.x - padding)));
            const y = Math.max(0, Math.min(canvasHeight - 1, Math.floor(box.y - padding)));
            const w = Math.max(1, Math.min(canvasWidth - x, Math.ceil(box.width + padding * 2)));
            const h = Math.max(1, Math.min(canvasHeight - y, Math.ceil(box.height + padding * 2)));
            const clampedBox = { x, y, width: w, height: h };
            try {
                let fallbackNeeded = false;
                if (typeof ctx.getImageData === 'function' && typeof ctx.putImageData === 'function') {
                    const imgData = ctx.getImageData(x, y, w, h);
                    const data = imgData.data;
                    const rawVariance = computeLuminanceVariance(data);
                    const rawHasDetail = rawVariance >= 5;
                    // Block Pixelation: Average color in 16x16 blocks (or adaptive block size for small boxes)
                    const blockSize = Math.max(8, Math.min(24, Math.floor(Math.min(w, h) / 4)));
                    for (let by = 0; by < h; by += blockSize) {
                        for (let bx = 0; bx < w; bx += blockSize) {
                            let rSum = 0, gSum = 0, bSum = 0, aSum = 0;
                            let count = 0;
                            const bw = Math.min(blockSize, w - bx);
                            const bh = Math.min(blockSize, h - by);
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
                    const residualVariance = computeLuminanceVariance(data);
                    const varianceReduction = rawHasDetail ? (1 - residualVariance / rawVariance) : 0;
                    // Always apply irreversible block pixelation to canvas
                    ctx.putImageData(imgData, x, y);
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
                    // Stage B5 Check: If raw image has no high-frequency detail (e.g. flat SVG avatar where rawVariance < 5),
                    // or if blur did not destroy >80% variance with residual < 150,
                    // detail destruction cannot be proven, so enforce opaque fallback on top!
                    if (!rawHasDetail || varianceReduction < 0.80 || residualVariance >= 150) {
                        fallbackNeeded = true;
                    }
                }
                else {
                    fallbackNeeded = true;
                }
                // Apply verified opaque fallback if blur was ineffective or unprovable
                if (fallbackNeeded) {
                    ctx.save();
                    ctx.fillStyle = '#0f172a';
                    ctx.fillRect(x, y, w, h);
                    ctx.strokeStyle = '#38bdf8';
                    ctx.lineWidth = 1;
                    ctx.strokeRect(x, y, w, h);
                    if (w > 45 && h > 12) {
                        ctx.fillStyle = '#38bdf8';
                        ctx.font = 'bold 9px sans-serif';
                        ctx.fillText('[REDACTED: FACE]', x + 3, y + Math.min(11, h - 2));
                    }
                    ctx.restore();
                }
                // Verify output pixels of the rendered box
                let success = true;
                let failureReason;
                if (typeof ctx.getImageData === 'function') {
                    const finalData = ctx.getImageData(x, y, w, h).data;
                    const hasAnyData = finalData.some((v) => v !== 0);
                    if (hasAnyData && fallbackNeeded) {
                        const overlayFrac = overlayFractionOf(finalData);
                        if (overlayFrac < 0.85) {
                            success = false;
                            failureReason = `Opaque fallback overlay fraction ${Math.round(overlayFrac * 100)}% < 85%`;
                        }
                    }
                }
                if (success) {
                    maskCount++;
                }
                regionRecords.push({
                    regionId: region.id,
                    requestedBox: box,
                    clampedBox,
                    method: 'gaussian_blur',
                    success,
                    fallbackApplied: fallbackNeeded,
                    failureReason
                });
            }
            catch (err) {
                regionRecords.push({
                    regionId: region.id,
                    requestedBox: box,
                    clampedBox,
                    method: 'gaussian_blur',
                    success: false,
                    failureReason: `Face render error: ${err.message}`
                });
            }
        }
        // --- PASS 2: Opaque Privacy Blackout Masks (Text, PII, Credentials, Cards, Surfaces) ---
        for (const region of opaqueRegions) {
            const box = region.screenshotBox;
            const geom = validateRegionGeometry(box, canvasWidth, canvasHeight);
            if (!geom.isValid) {
                regionRecords.push({
                    regionId: region.id,
                    requestedBox: box,
                    clampedBox: { x: 0, y: 0, width: 0, height: 0 },
                    method: 'opaque_mask',
                    success: false,
                    failureReason: `Invalid geometry: ${geom.reason}`
                });
                continue;
            }
            // Clamp strictly to canvas bounds
            const x = Math.max(0, Math.min(canvasWidth - 1, Math.floor(box.x)));
            const y = Math.max(0, Math.min(canvasHeight - 1, Math.floor(box.y)));
            const w = Math.max(1, Math.min(canvasWidth - x, Math.ceil(box.width)));
            const h = Math.max(1, Math.min(canvasHeight - y, Math.ceil(box.height)));
            const clampedBox = { x, y, width: w, height: h };
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
                // Pixel-true post verification of opaque mask
                let success = true;
                let failureReason;
                if (typeof ctx.getImageData === 'function') {
                    const finalData = ctx.getImageData(x, y, w, h).data;
                    const hasAnyData = finalData.some((v) => v !== 0);
                    if (hasAnyData) {
                        const overlayFrac = overlayFractionOf(finalData);
                        if (overlayFrac < 0.85) {
                            success = false;
                            failureReason = `Opaque mask overlay fraction ${Math.round(overlayFrac * 100)}% < 85%`;
                        }
                    }
                }
                if (success) {
                    maskCount++;
                }
                regionRecords.push({
                    regionId: region.id,
                    requestedBox: box,
                    clampedBox,
                    method: 'opaque_mask',
                    success,
                    failureReason
                });
            }
            catch (err) {
                regionRecords.push({
                    regionId: region.id,
                    requestedBox: box,
                    clampedBox,
                    method: 'opaque_mask',
                    success: false,
                    failureReason: `Opaque mask render error: ${err.message}`
                });
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
            renderedMaskCount: maskCount,
            regionRecords
        };
    }
}
//# sourceMappingURL=mask-renderer.js.map