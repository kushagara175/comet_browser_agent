/**
 * @privapilot/extension - Offscreen Sanitizer Host Main Entry
 *
 * Runs inside the trusted offscreen extension document with full DOM/Canvas access.
 * Performs real screenshot decoding, multi-layer PII detection, visual mask rendering,
 * and post-redaction verification before returning verified SanitizedContext.
 */

import { SanitizerPipeline, LocalDomSnapshot } from '../sanitizer/pipeline.js';
import { RawCapture, SanitizedContext } from '@privapilot/protocol';

declare const chrome: any;

export interface SanitizerOffscreenRequest {
  readonly target: 'privapilot-offscreen';
  readonly type: 'SANITIZE_CAPTURE';
  readonly correlationId: string;
  readonly payload: {
    readonly rawCapture: RawCapture;
    readonly snapshot: LocalDomSnapshot;
    readonly goal: string;
  };
}

export interface SanitizerOffscreenResponse {
  readonly correlationId: string;
  readonly success: boolean;
  readonly sanitized?: SanitizedContext;
  readonly error?: string;
  readonly durationMs?: number;
}

/**
 * Handles incoming sanitization requests in the offscreen host.
 */
export async function handleSanitizeRequest(
  request: SanitizerOffscreenRequest
): Promise<SanitizerOffscreenResponse> {
  const { correlationId, payload } = request;
  const t0 = Date.now();

  try {
    if (!payload || !payload.rawCapture || !payload.snapshot) {
      throw new Error('Invalid sanitization payload: missing rawCapture or DOM snapshot');
    }

    const { rawCapture, snapshot, goal } = payload;

    // 1. Allocate full-size Canvas matching exact screenshot pixel dimensions
    let canvas = document.getElementById('sanitizer-canvas') as HTMLCanvasElement | null;
    if (!canvas) {
      canvas = document.createElement('canvas');
      canvas.id = 'sanitizer-canvas';
      document.body.appendChild(canvas);
    }

    canvas.width = rawCapture.metadata.screenshotWidth;
    canvas.height = rawCapture.metadata.screenshotHeight;

    const ctx = canvas.getContext('2d');
    if (!ctx) {
      throw new Error('Canvas 2D context unavailable in offscreen document host');
    }

    // 2. Decode raw screenshot bitmap onto canvas
    if (!rawCapture.rawScreenshotDataUrl || !rawCapture.rawScreenshotDataUrl.startsWith('data:image/')) {
      throw new Error('Invalid raw screenshot data URL: image data missing or corrupt');
    }

    const img = new Image();
    await new Promise<void>((resolve, reject) => {
      img.onload = () => resolve();
      img.onerror = () => reject(new Error('Failed to decode raw screenshot bitmap in offscreen document'));
      img.src = rawCapture.rawScreenshotDataUrl;
    });

    ctx.drawImage(img, 0, 0, canvas.width, canvas.height);

    // 3. Execute Sanitizer Pipeline with hardware-accelerated canvas
    const sanitized = await SanitizerPipeline.sanitize(
      rawCapture,
      snapshot,
      goal || '',
      canvas
    );

    return {
      correlationId,
      success: true,
      sanitized,
      durationMs: Date.now() - t0
    };
  } catch (err: any) {
    // Zero-leak error serialization: Never include raw values or URLs in error strings
    const cleanError = err.message
      ? err.message.replace(/data:image\/[^;]+;base64,[A-Za-z0-9+/=]+/g, '[IMAGE_DATA_REDACTED]')
      : 'Sanitization execution failed in offscreen host';

    return {
      correlationId,
      success: false,
      error: cleanError,
      durationMs: Date.now() - t0
    };
  }
}

// Dedicated Port channel for robust, collision-free MV3 communication
if (typeof chrome !== 'undefined' && chrome.runtime && chrome.runtime.onConnect) {
  chrome.runtime.onConnect.addListener((port: any) => {
    if (port.name !== 'privapilot-offscreen') return;
    port.onMessage.addListener((message: any) => {
      if (message && message.type === 'SANITIZE_CAPTURE') {
        handleSanitizeRequest(message).then((response) => {
          port.postMessage(response);
        }).catch((err) => {
          port.postMessage({
            correlationId: message.correlationId || 'unknown',
            success: false,
            error: err?.message || 'Fatal offscreen exception'
          });
        });
      }
    });
  });
}

if (typeof chrome !== 'undefined' && chrome.runtime && chrome.runtime.onMessage) {
  chrome.runtime.onMessage.addListener(
    (message: any, _sender: any, sendResponse: (res: SanitizerOffscreenResponse) => void) => {
      if (message && message.target === 'privapilot-offscreen' && message.type === 'SANITIZE_CAPTURE') {
        handleSanitizeRequest(message).then((response) => {
          sendResponse(response);
        }).catch((err) => {
          sendResponse({
            correlationId: message.correlationId || 'unknown',
            success: false,
            error: err?.message || 'Fatal offscreen exception'
          });
        });
        return true; // Keep message channel open for async response
      }
      return false;
    }
  );
}
