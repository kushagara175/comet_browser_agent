/**
 * @privapilot/extension - On-Device Visual UI Region Proposal Generator (Stage E)
 *
 * Implements browser-compatible classical visual region proposal extraction:
 * - Gradient edge detection across downsampled pixel grid
 * - Connected component bounding-box grouping
 * - Aspect ratio and geometric scale classification for UI elements (buttons, inputs, dialogs, icons)
 * - Pure on-device computation without external network/CDN calls
 */
export class VisualCandidateGenerator {
    /**
     * Generates visual UI candidate region proposals from canvas pixel data.
     */
    static extractProposals(pixelBuffer, width, height, options = {}) {
        const minW = options.minWidth ?? 24;
        const minH = options.minHeight ?? 16;
        const maxProposals = options.maxProposals ?? 30;
        if (!pixelBuffer || width <= 0 || height <= 0 || pixelBuffer.length < width * height * 4) {
            return [];
        }
        const step = Math.max(2, Math.min(4, Math.floor(Math.min(width, height) / 100)));
        const gridW = Math.floor(width / step);
        const gridH = Math.floor(height / step);
        const edgeGrid = new Uint8Array(gridW * gridH);
        // 1. Build downsampled edge/gradient grid
        for (let gy = 1; gy < gridH - 1; gy++) {
            const y = gy * step;
            for (let gx = 1; gx < gridW - 1; gx++) {
                const x = gx * step;
                const idx = (y * width + x) * 4;
                const rightIdx = (y * width + (x + step)) * 4;
                const downIdx = ((y + step) * width + x) * 4;
                const lumCenter = (pixelBuffer[idx] * 299 + pixelBuffer[idx + 1] * 587 + pixelBuffer[idx + 2] * 114) / 1000;
                const lumRight = (pixelBuffer[rightIdx] * 299 + pixelBuffer[rightIdx + 1] * 587 + pixelBuffer[rightIdx + 2] * 114) / 1000;
                const lumDown = (pixelBuffer[downIdx] * 299 + pixelBuffer[downIdx + 1] * 587 + pixelBuffer[downIdx + 2] * 114) / 1000;
                const gradX = Math.abs(lumCenter - lumRight);
                const gradY = Math.abs(lumCenter - lumDown);
                if (gradX > 20 || gradY > 20) {
                    edgeGrid[gy * gridW + gx] = 1;
                }
            }
        }
        // 2. Connected component analysis to find bounding boxes of UI regions
        const visited = new Uint8Array(gridW * gridH);
        const proposals = [];
        for (let gy = 1; gy < gridH - 1; gy++) {
            for (let gx = 1; gx < gridW - 1; gx++) {
                const cellIdx = gy * gridW + gx;
                if (!edgeGrid[cellIdx] || visited[cellIdx])
                    continue;
                // BFS to collect contiguous edge component
                const queue = [cellIdx];
                visited[cellIdx] = 1;
                let minCellX = gx, maxCellX = gx;
                let minCellY = gy, maxCellY = gy;
                let edgeCount = 0;
                while (queue.length > 0) {
                    const curr = queue.pop();
                    edgeCount++;
                    const cy = Math.floor(curr / gridW);
                    const cx = curr % gridW;
                    if (cx < minCellX)
                        minCellX = cx;
                    if (cx > maxCellX)
                        maxCellX = cx;
                    if (cy < minCellY)
                        minCellY = cy;
                    if (cy > maxCellY)
                        maxCellY = cy;
                    // Check 4-connected neighbors
                    const neighbors = [
                        curr - 1,
                        curr + 1,
                        curr - gridW,
                        curr + gridW
                    ];
                    for (const n of neighbors) {
                        if (n >= 0 && n < edgeGrid.length && edgeGrid[n] && !visited[n]) {
                            visited[n] = 1;
                            queue.push(n);
                        }
                    }
                }
                // Bounding box in real pixel coordinates
                const boxX = minCellX * step;
                const boxY = minCellY * step;
                const boxW = (maxCellX - minCellX + 1) * step;
                const boxH = (maxCellY - minCellY + 1) * step;
                if (boxW >= minW && boxH >= minH && boxW < width * 0.95 && boxH < height * 0.95) {
                    const ar = boxW / boxH;
                    let role = 'unknown';
                    if (ar >= 1.4 && ar <= 8.0 && boxH <= 64) {
                        role = boxW > 180 ? 'input' : 'button';
                    }
                    else if (ar >= 0.75 && ar <= 1.35 && boxW <= 64 && boxH <= 64) {
                        role = 'icon';
                    }
                    else if (boxW >= 240 && boxH >= 100) {
                        role = 'dialog';
                    }
                    else if (ar >= 1.0 && ar <= 12.0) {
                        role = 'button';
                    }
                    if (role !== 'unknown') {
                        const ymin = Math.max(0, Math.min(1, boxY / height));
                        const xmin = Math.max(0, Math.min(1, boxX / width));
                        const ymax = Math.max(0, Math.min(1, (boxY + boxH) / height));
                        const xmax = Math.max(0, Math.min(1, (boxX + boxW) / width));
                        proposals.push({
                            visualRegionId: `vis_${proposals.length + 1}`,
                            role,
                            bounds: [ymin, xmin, ymax, xmax],
                            pixelBox: { x: boxX, y: boxY, width: boxW, height: boxH },
                            edgeConfidence: Math.min(1.0, Math.round((Math.min(edgeCount, 50) / 50) * 100) / 100),
                            aspectRatio: Math.round(ar * 100) / 100
                        });
                        if (proposals.length >= maxProposals) {
                            return proposals;
                        }
                    }
                }
            }
        }
        return proposals;
    }
}
//# sourceMappingURL=visual-candidate-generator.js.map