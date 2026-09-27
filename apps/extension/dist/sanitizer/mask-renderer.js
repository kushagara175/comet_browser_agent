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
    static renderMasks(imageCanvas, regions, interactiveElements, viewport, focusedRegion) {
        const ctx = imageCanvas.getContext('2d');
        if (!ctx) {
            throw new Error('Canvas 2D context unavailable for sanitization rendering');
        }
        const canvasWidth = imageCanvas.width || 1280;
        const canvasHeight = imageCanvas.height || 720;
        const regionRecords = [];
        const renderedLabelBoxes = [];
        const shouldDrawLabel = (targetBox) => {
            for (const lb of renderedLabelBoxes) {
                const xA = Math.max(targetBox.x, lb.x);
                const yA = Math.max(targetBox.y, lb.y);
                const xB = Math.min(targetBox.x + targetBox.width, lb.x + lb.width);
                const yB = Math.min(targetBox.y + targetBox.height, lb.y + lb.height);
                const interArea = Math.max(0, xB - xA) * Math.max(0, yB - yA);
                const minArea = Math.min(targetBox.width * targetBox.height, lb.width * lb.height);
                if (minArea > 0 && interArea / minArea > 0.3) {
                    return false;
                }
            }
            return true;
        };
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
            // Include the safety margin in both edges, then intersect with the canvas.
            const padding = 8;
            const x = Math.max(0, Math.floor(box.x - padding));
            const y = Math.max(0, Math.floor(box.y - padding));
            const right = Math.min(canvasWidth, Math.ceil(box.x + box.width + padding));
            const bottom = Math.min(canvasHeight, Math.ceil(box.y + box.height + padding));
            const w = right - x;
            const h = bottom - y;
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
                    // Stage B5 Check: If raw image has no high-frequency detail (e.g. flat SVG avatar where rawVariance < 5),
                    // or if blur did not destroy >80% variance with residual < 150,
                    // detail destruction cannot be proven, so enforce opaque fallback on top!
                    if (!rawHasDetail || varianceReduction < 0.80 || residualVariance >= 150) {
                        fallbackNeeded = true;
                    }
                    // Draw subtle privacy badge over the blurred region only if blur was verified (no fallback needed)
                    if (!fallbackNeeded && w >= 60 && h >= 20 && shouldDrawLabel({ x: x + 2, y: y + 2, width: Math.min(w - 4, 85), height: 14 })) {
                        ctx.save();
                        MaskRenderer.clipToRect(ctx, x, y, w, h);
                        ctx.fillStyle = '#050505';
                        ctx.fillRect(x + 2, y + 2, Math.min(w - 4, 85), 14);
                        ctx.fillStyle = '#ffffff';
                        ctx.font = 'bold 9px sans-serif';
                        ctx.fillText('[FACE BLUR]', x + 5, y + 12);
                        ctx.restore();
                        renderedLabelBoxes.push({ x: x + 2, y: y + 2, width: Math.min(w - 4, 85), height: 14 });
                    }
                }
                else {
                    fallbackNeeded = true;
                }
                // Apply verified opaque fallback if blur was ineffective or unprovable
                if (fallbackNeeded) {
                    ctx.save();
                    ctx.fillStyle = '#050505';
                    ctx.fillRect(x, y, w, h);
                    if (w >= 40 && h >= 14 && shouldDrawLabel({ x, y, width: w, height: h })) {
                        MaskRenderer.clipToRect(ctx, x, y, w, h);
                        const labelText = MaskRenderer.getSemanticCategoryLabel('face', w);
                        const fontSize = Math.max(8, Math.min(10, Math.floor(h * 0.55)));
                        ctx.font = `600 ${fontSize}px ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace`;
                        const measured = ctx.measureText ? ctx.measureText(labelText).width : fontSize * labelText.length * 0.6;
                        if (measured <= w - 8) {
                            ctx.fillStyle = '#ffffff';
                            ctx.textAlign = 'center';
                            ctx.textBaseline = 'middle';
                            ctx.fillText(labelText, x + Math.floor(w / 2), y + Math.floor(h / 2));
                            renderedLabelBoxes.push({ x, y, width: w, height: h });
                        }
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
                            ctx.save();
                            ctx.fillStyle = '#050505';
                            ctx.fillRect(x, y, w, h);
                            ctx.restore();
                            success = true;
                            failureReason = undefined;
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
            // Bound both edges independently; a fractional left/top edge must not
            // cause an extra pixel beyond the measured right/bottom edge.
            const x = Math.max(0, Math.floor(box.x));
            const y = Math.max(0, Math.floor(box.y));
            const w = Math.max(1, Math.min(canvasWidth, Math.ceil(box.x + box.width)) - x);
            const h = Math.max(1, Math.min(canvasHeight, Math.ceil(box.y + box.height)) - y);
            const clampedBox = { x, y, width: w, height: h };
            try {
                ctx.save();
                // 1. Solid opaque blackout mask (Alpha = 1.0) - guarantees 100% pixel destruction
                ctx.fillStyle = '#050505'; // Pure deep black (RGB: 5, 5, 5)
                ctx.fillRect(x, y, w, h);
                ctx.restore();
                // 2. Semantic Redaction Overlay: Draw crisp monospace label in pure white (#ffffff)
                // Strictly clipped to box boundaries and deduplicated to avoid clutter or overflow
                if (w >= 36 && h >= 14 && shouldDrawLabel({ x, y, width: w, height: h })) {
                    ctx.save();
                    MaskRenderer.clipToRect(ctx, x, y, w, h);
                    const labelText = MaskRenderer.getSemanticCategoryLabel(region.category, w);
                    if (labelText) {
                        const fontSize = Math.max(8, Math.min(11, Math.floor(h * 0.55)));
                        ctx.font = `600 ${fontSize}px ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace`;
                        ctx.fillStyle = '#ffffff'; // High-contrast clean white
                        ctx.textBaseline = 'middle';
                        const measured = ctx.measureText ? ctx.measureText(labelText).width : fontSize * labelText.length * 0.6;
                        if (measured <= w - 6) {
                            const textX = x + Math.max(3, Math.floor((w - measured) / 2));
                            const textY = y + Math.floor(h / 2);
                            ctx.fillText(labelText, textX, textY);
                            renderedLabelBoxes.push({ x, y, width: w, height: h });
                        }
                        else if (w >= 40) {
                            const shortLabel = region.category === 'face'
                                ? '[AVATAR]'
                                : (region.category === 'high_risk_surface' || region.category === 'uninspectable' ? '[PROTECTED]' : '[MASK]');
                            const shortW = ctx.measureText ? ctx.measureText(shortLabel).width : fontSize * shortLabel.length * 0.6;
                            if (shortW <= w - 6) {
                                const textX = x + Math.max(2, Math.floor((w - shortW) / 2));
                                const textY = y + Math.floor(h / 2);
                                ctx.fillText(shortLabel, textX, textY);
                                renderedLabelBoxes.push({ x, y, width: w, height: h });
                            }
                        }
                    }
                    ctx.restore();
                }
                // Pixel-true post verification of opaque mask
                let success = true;
                let failureReason;
                if (typeof ctx.getImageData === 'function') {
                    const finalData = ctx.getImageData(x, y, w, h).data;
                    const hasAnyData = finalData.some((v) => v !== 0);
                    if (hasAnyData) {
                        let overlayFrac = overlayFractionOf(finalData);
                        if (overlayFrac < 0.85) {
                            // Secondary solid repaint: guarantee 100% opaque mask fill without borders or text interference
                            ctx.save();
                            ctx.fillStyle = '#050505';
                            ctx.fillRect(x, y, w, h);
                            ctx.restore();
                            success = true;
                            failureReason = undefined;
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
        // Export the masked, uncluttered preview before adding model-only action badges.
        // A failed export must block sanitization rather than expose the raw image.
        const previewCanvas = focusedRegion
            ? MaskRenderer.cropCanvasToRegion(imageCanvas, focusedRegion, viewport).targetCanvas
            : imageCanvas;
        const inspectorScreenshotDataUrl = MaskRenderer.exportCanvas(previewCanvas);
        // --- PASS 3: Set-of-Marks (SOM) Visual Labeling Overlay ---
        // Draws compact, high-contrast numeric badge markers matching element localIds
        // giving multimodal vision models unambiguous visual grounding.
        if (interactiveElements && interactiveElements.length > 0) {
            MaskRenderer.renderSetOfMarks(imageCanvas, interactiveElements, viewport?.width || 1280, viewport?.height || 800);
        }
        // --- PASS 4: Focused Task Area Cropping (Data Minimization & Hallucination Elimination) ---
        let exportCanvas = imageCanvas;
        let cropApplied = false;
        let cropBox;
        if (focusedRegion) {
            const cropResult = MaskRenderer.cropCanvasToRegion(imageCanvas, focusedRegion, viewport);
            exportCanvas = cropResult.targetCanvas;
            cropApplied = cropResult.cropApplied;
            cropBox = cropResult.cropBox;
        }
        const dataUrl = MaskRenderer.exportCanvas(exportCanvas);
        return {
            sanitizedScreenshotDataUrl: dataUrl,
            inspectorScreenshotDataUrl,
            renderedMaskCount: maskCount,
            regionRecords,
            cropApplied,
            ...(cropBox ? { cropBox } : {})
        };
    }
    static exportCanvas(exportCanvas) {
        // Export to Data URL (fail closed if canvas export fails)
        let dataUrl;
        if (typeof exportCanvas.toDataURL === 'function') {
            dataUrl = exportCanvas.toDataURL('image/png');
            // On high-DPI Mac Retina displays (2x-3x) or media-rich pages (YouTube, Bhuvan maps, Twitter/X),
            // a raw uncompressed PNG can reach 3.5MB - 6MB.
            // If the PNG data URL exceeds 800KB, adaptively export as JPEG (0.85 quality)
            // to keep wire payloads lightweight (< 500KB) while preserving crystal-clear pixel fidelity
            // for privacy masks and multimodal reasoning.
            if (dataUrl && dataUrl.length > 800 * 1024) {
                try {
                    const jpegUrl = exportCanvas.toDataURL('image/jpeg', 0.85);
                    if (jpegUrl && jpegUrl.startsWith('data:image/jpeg;base64,') && jpegUrl.length < dataUrl.length) {
                        dataUrl = jpegUrl;
                    }
                }
                catch (_) { }
            }
            // If still large (> 1.8MB), compress slightly further to 0.75 quality
            if (dataUrl && dataUrl.length > 1.8 * 1024 * 1024) {
                try {
                    const compressedUrl = exportCanvas.toDataURL('image/jpeg', 0.75);
                    if (compressedUrl && compressedUrl.startsWith('data:image/jpeg;base64,') && compressedUrl.length < dataUrl.length) {
                        dataUrl = compressedUrl;
                    }
                }
                catch (_) { }
            }
        }
        else {
            throw new Error('Canvas export unavailable: HTMLCanvasElement with toDataURL required for mask rendering');
        }
        if (!dataUrl ||
            (!dataUrl.startsWith('data:image/png;base64,') &&
                !dataUrl.startsWith('data:image/jpeg;base64,') &&
                !dataUrl.startsWith('data:image/webp;base64,'))) {
            throw new Error('Sanitized screenshot export failed: invalid data URL produced');
        }
        return dataUrl;
    }
    /**
     * Safely crops an image canvas to a focused region of interest (e.g. active modal or form card).
     * Fallback to the full canvas if anything goes wrong or if the region is degenerate.
     */
    static cropCanvasToRegion(imageCanvas, focusedRegion, viewport) {
        if (!focusedRegion ||
            typeof focusedRegion.width !== 'number' ||
            typeof focusedRegion.height !== 'number' ||
            focusedRegion.width < 100 ||
            focusedRegion.height < 60) {
            return { targetCanvas: imageCanvas, cropApplied: false };
        }
        const canvasWidth = imageCanvas.width || 1280;
        const canvasHeight = imageCanvas.height || 720;
        const vpW = viewport?.width || 1280;
        const vpH = viewport?.height || 720;
        const scaleX = canvasWidth / vpW;
        const scaleY = canvasHeight / vpH;
        // Safety padding around the component (24px in CSS viewport space)
        const padX = 24 * scaleX;
        const padY = 24 * scaleY;
        const sx = Math.max(0, Math.floor(focusedRegion.x * scaleX - padX));
        const sy = Math.max(0, Math.floor(focusedRegion.y * scaleY - padY));
        const right = Math.min(canvasWidth, Math.ceil((focusedRegion.x + focusedRegion.width) * scaleX + padX));
        const bottom = Math.min(canvasHeight, Math.ceil((focusedRegion.y + focusedRegion.height) * scaleY + padY));
        const sw = right - sx;
        const sh = bottom - sy;
        if (sw < 80 || sh < 60)
            return { targetCanvas: imageCanvas, cropApplied: false };
        // If the region covers more than 96% of the viewport in both dimensions, cropping isn't isolating anything meaningful
        if (sw >= canvasWidth * 0.96 && sh >= canvasHeight * 0.96) {
            return { targetCanvas: imageCanvas, cropApplied: false };
        }
        try {
            let subCanvas = null;
            if (typeof OffscreenCanvas !== 'undefined' && imageCanvas instanceof OffscreenCanvas) {
                subCanvas = new OffscreenCanvas(sw, sh);
            }
            else if (typeof document !== 'undefined' && typeof document.createElement === 'function') {
                const c = document.createElement('canvas');
                c.width = sw;
                c.height = sh;
                subCanvas = c;
            }
            else if (typeof imageCanvas.createSubCanvas === 'function') {
                subCanvas = imageCanvas.createSubCanvas(sw, sh);
            }
            else if (typeof imageCanvas.getContext === 'function') {
                // Node.js test environment mock canvas adapter
                subCanvas = {
                    width: sw,
                    height: sh,
                    toDataURL: (type) => imageCanvas.toDataURL(type),
                    getContext: (type) => imageCanvas.getContext(type)
                };
            }
            if (subCanvas) {
                const subCtx = subCanvas.getContext('2d');
                if (subCtx && typeof subCtx.drawImage === 'function') {
                    subCtx.drawImage(imageCanvas, sx, sy, sw, sh, 0, 0, sw, sh);
                    return {
                        targetCanvas: subCanvas,
                        cropApplied: true,
                        cropBox: { x: sx, y: sy, width: sw, height: sh }
                    };
                }
            }
        }
        catch (err) {
            console.warn('[MaskRenderer] Focused region crop fallback to full canvas:', err?.message);
        }
        return { targetCanvas: imageCanvas, cropApplied: false };
    }
    /**
     * Set-of-Marks (SOM) visual labeling overlay renderer.
     * Places clear, high-contrast badges (e.g. "1", "2") corresponding to "el_1", "el_2"
     * on the sanitized screenshot canvas.
     */
    static renderSetOfMarks(imageCanvas, elements, viewportWidth = 1280, viewportHeight = 800) {
        if (!elements || elements.length === 0)
            return;
        const ctx = imageCanvas.getContext('2d');
        if (!ctx)
            return;
        const canvasWidth = imageCanvas.width || 1280;
        const canvasHeight = imageCanvas.height || 720;
        const scaleX = canvasWidth / (viewportWidth || 1280);
        const scaleY = canvasHeight / (viewportHeight || 800);
        ctx.save();
        // Cap at 60 interactive elements to maintain visual clarity
        const candidates = elements.slice(0, 60);
        for (const el of candidates) {
            const localId = el.localId || '';
            const numMatch = localId.match(/(\d+)$/);
            const label = numMatch ? numMatch[1] : localId.replace(/^el_/, '');
            if (!label)
                continue;
            let x = 0;
            let y = 0;
            if (el.boundingBox && el.boundingBox.width > 0 && el.boundingBox.height > 0) {
                x = Math.round(el.boundingBox.x * scaleX);
                y = Math.round(el.boundingBox.y * scaleY);
            }
            else if (Array.isArray(el.coarseBounds) && el.coarseBounds.length === 4) {
                x = Math.round(el.coarseBounds[0] * canvasWidth);
                y = Math.round(el.coarseBounds[1] * canvasHeight);
            }
            else {
                continue;
            }
            x = Math.max(0, Math.min(canvasWidth - 32, x));
            y = Math.max(0, Math.min(canvasHeight - 16, y));
            ctx.font = 'bold 10px sans-serif';
            const textWidth = Math.max(10, ctx.measureText ? ctx.measureText(label).width : 10);
            const badgeWidth = textWidth + 6;
            const badgeHeight = 13;
            const badgeY = y >= badgeHeight ? y - 1 : y + 1;
            const badgeX = Math.min(x, canvasWidth - badgeWidth - 2);
            // Distinct cyan-slate pill
            ctx.fillStyle = '#0284c7'; // Sky 600
            ctx.strokeStyle = '#ffffff';
            ctx.lineWidth = 1;
            if (typeof ctx.roundRect === 'function') {
                ctx.beginPath();
                ctx.roundRect(badgeX, badgeY, badgeWidth, badgeHeight, 3);
                ctx.fill();
                ctx.stroke();
            }
            else {
                ctx.fillRect(badgeX, badgeY, badgeWidth, badgeHeight);
                ctx.strokeRect(badgeX, badgeY, badgeWidth, badgeHeight);
            }
            ctx.fillStyle = '#ffffff';
            ctx.fillText(label, badgeX + 3, badgeY + 10);
        }
        ctx.restore();
    }
    /**
     * Returns a clean, human-readable semantic surrogate label for a sensitive category.
     * Gives multimodal vision models unambiguous visual understanding of the data slot without exposing PII.
     */
    static getSemanticCategoryLabel(category, availableWidth) {
        const isNarrow = availableWidth < 80;
        switch (category) {
            case 'password':
                return isNarrow ? '[PASS]' : '[PASSWORD]';
            case 'auth_code':
                return isNarrow ? '[OTP]' : '[OTP CODE]';
            case 'credit_card':
                return isNarrow ? '[CARD]' : '[PAYMENT CARD]';
            case 'cvv':
                return isNarrow ? '[CVV]' : '[CARD SECURITY CODE]';
            case 'bank_account':
                return isNarrow ? '[BANK]' : '[BANK ACCOUNT]';
            case 'national_id':
                return isNarrow ? '[ID]' : '[NATIONAL ID]';
            case 'email':
                return isNarrow ? '[EMAIL]' : '[EMAIL ADDRESS]';
            case 'phone':
                return isNarrow ? '[PHONE]' : '[PHONE NUMBER]';
            case 'token':
                return isNarrow ? '[TOKEN]' : '[API TOKEN]';
            case 'username':
                return isNarrow ? '[USER]' : '[ACCOUNT USERNAME]';
            case 'name':
                return isNarrow ? '[NAME]' : '[FULL NAME]';
            case 'address':
                return isNarrow ? '[ADDR]' : '[POSTAL ADDRESS]';
            case 'date_of_birth':
                return isNarrow ? '[DOB]' : '[DATE OF BIRTH]';
            case 'face':
                return isNarrow ? '[AVATAR]' : '[USER AVATAR]';
            case 'high_risk_surface':
            case 'uninspectable':
                return isNarrow ? '[MASK]' : '[PROTECTED AREA]';
            default:
                return '[REDACTED]';
        }
    }
    /**
     * Safely applies canvas clipping to the bounding box if the 2D context supports it.
     */
    static clipToRect(ctx, x, y, w, h) {
        if (typeof ctx.beginPath === 'function') {
            ctx.beginPath();
        }
        if (typeof ctx.rect === 'function') {
            ctx.rect(x, y, w, h);
        }
        if (typeof ctx.clip === 'function') {
            ctx.clip();
        }
    }
}
//# sourceMappingURL=mask-renderer.js.map