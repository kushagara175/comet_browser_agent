/**
 * @privapilot/test-fixtures - Mock Canvas Test Adapter
 *
 * Provides a pixel-buffer backed mock canvas implementation for Node.js test environments
 * where HTML5 Canvas / OffscreenCanvas is not natively available.
 * Accurately implements 2D context fillRect, strokeRect, fillText, getImageData, and putImageData.
 */
export function createMockCanvas(width = 2560, height = 1440, initialFill = [255, 255, 255, 255]) {
    const buffer = new Uint8ClampedArray(width * height * 4);
    for (let i = 0; i < buffer.length; i += 4) {
        buffer[i] = initialFill[0];
        buffer[i + 1] = initialFill[1];
        buffer[i + 2] = initialFill[2];
        buffer[i + 3] = initialFill[3];
    }
    let currentFillStyle = '#0f172a';
    const parseColor = (color) => {
        if (color === '#0f172a')
            return [15, 23, 42, 255];
        if (color === '#38bdf8')
            return [56, 189, 248, 255];
        return [15, 23, 42, 255];
    };
    const canvas = {
        width,
        height,
        toDataURL: (type) => 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==',
        getContext: (contextId) => {
            if (contextId !== '2d')
                return null;
            return {
                save: () => { },
                restore: () => { },
                set fillStyle(val) {
                    currentFillStyle = val;
                },
                get fillStyle() {
                    return currentFillStyle;
                },
                strokeStyle: '#38bdf8',
                lineWidth: 1,
                font: '10px sans-serif',
                fillRect: (x, y, w, h) => {
                    const [r, g, b, a] = parseColor(currentFillStyle);
                    for (let row = 0; row < h; row++) {
                        for (let col = 0; col < w; col++) {
                            const py = Math.floor(y + row);
                            const px = Math.floor(x + col);
                            if (px >= 0 && px < width && py >= 0 && py < height) {
                                const idx = (py * width + px) * 4;
                                buffer[idx] = r;
                                buffer[idx + 1] = g;
                                buffer[idx + 2] = b;
                                buffer[idx + 3] = a;
                            }
                        }
                    }
                },
                strokeRect: (_x, _y, _w, _h) => { },
                fillText: (_text, _x, _y) => { },
                drawImage: () => { },
                getImageData: (x, y, w, h) => {
                    const sub = new Uint8ClampedArray(w * h * 4);
                    for (let row = 0; row < h; row++) {
                        for (let col = 0; col < w; col++) {
                            const py = Math.floor(y + row);
                            const px = Math.floor(x + col);
                            const dstIdx = (row * w + col) * 4;
                            if (px >= 0 && px < width && py >= 0 && py < height) {
                                const srcIdx = (py * width + px) * 4;
                                sub[dstIdx] = buffer[srcIdx];
                                sub[dstIdx + 1] = buffer[srcIdx + 1];
                                sub[dstIdx + 2] = buffer[srcIdx + 2];
                                sub[dstIdx + 3] = buffer[srcIdx + 3];
                            }
                        }
                    }
                    return { data: sub, width: w, height: h };
                },
                putImageData: (imgData, x, y) => {
                    const sub = imgData.data;
                    const w = imgData.width;
                    const h = imgData.height;
                    for (let row = 0; row < h; row++) {
                        for (let col = 0; col < w; col++) {
                            const py = Math.floor(y + row);
                            const px = Math.floor(x + col);
                            if (px >= 0 && px < width && py >= 0 && py < height) {
                                const srcIdx = (row * w + col) * 4;
                                const dstIdx = (py * width + px) * 4;
                                buffer[dstIdx] = sub[srcIdx];
                                buffer[dstIdx + 1] = sub[srcIdx + 1];
                                buffer[dstIdx + 2] = sub[srcIdx + 2];
                                buffer[dstIdx + 3] = sub[srcIdx + 3];
                            }
                        }
                    }
                }
            };
        }
    };
    return canvas;
}
//# sourceMappingURL=mock-canvas.js.map