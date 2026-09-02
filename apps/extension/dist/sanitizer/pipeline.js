/**
 * @privapilot/extension - On-Device Fail-Closed Sanitizer Pipeline
 *
 * Enforces the core privacy boundary:
 * RawCapture -> DetectionReport -> SanitizedContext -> NetworkPayload
 */
import { sensitiveElementPlaceholder, redactionImageLabel, FACE_IMAGE_LABEL, REDACTION_FILL_COLOR } from '@privapilot/protocol';
import { sanitizeElementName } from '@privapilot/pii-rules';
import { CoordinateTransformer } from './coordinate-transformer.js';
import { detectDomSensitiveRegions } from './dom-detector.js';
import { detectTextSensitiveRegions } from './text-detector.js';
import { detectFaceRegions } from './face-detector.js';
import { detectHighRiskSurfaces } from './surface-detector.js';
import { MaskRenderer } from './mask-renderer.js';
import { PostRedactionVerifier } from './post-redaction-verifier.js';
import { UltraFaceModelRunner } from '../vision/face-model.js';
export class SanitizerPipeline {
    /**
     * Transforms raw capture into sanitized context or fails closed.
     */
    static async sanitize(rawCapture, snapshot, goal, imageCanvas) {
        const transformer = new CoordinateTransformer(rawCapture.metadata);
        // 0. Run on-device ONNX vision model inference on screenshot canvas if available
        let modelFaces = [];
        if (imageCanvas) {
            try {
                const visionResult = await UltraFaceModelRunner.detectFaces(imageCanvas, transformer);
                modelFaces = visionResult.faces;
            }
            catch {
                // Fall back to DOM avatar heuristics on model initialization/inference failure
            }
        }
        // 1. Run all multi-layer detectors
        const domRegions = detectDomSensitiveRegions(snapshot.domElements, transformer);
        const textRegions = detectTextSensitiveRegions(snapshot.textNodes, transformer);
        const faceRegions = detectFaceRegions(snapshot.imageElements, transformer, modelFaces);
        const surfaceRegions = detectHighRiskSurfaces(snapshot.surfaces, transformer);
        // Fusion: Union of all detected sensitive regions
        const allRegions = [
            ...domRegions,
            ...textRegions,
            ...faceRegions,
            ...surfaceRegions
        ];
        const detectionReport = {
            captureId: rawCapture.captureId,
            timestamp: Date.now(),
            regions: allRegions,
            uninspectableSurfacesFound: surfaceRegions.length > 0,
            requiresFailClosedBlock: false
        };
        // 2. Render Redaction Masks onto Canvas (Strictly Fail-Closed: Zero 1x1 or permissive fallbacks)
        let sanitizedDataUrl;
        let renderedCount = 0;
        // Canvas the masks were actually drawn on, kept so coverage can be verified
        // against real pixels rather than against a mask count.
        let maskedCanvas = null;
        let preMaskDetail = new Map();
        if (imageCanvas) {
            preMaskDetail = PostRedactionVerifier.measurePreMaskDetail(imageCanvas, allRegions);
            const renderResult = MaskRenderer.renderMasks(imageCanvas, allRegions);
            sanitizedDataUrl = renderResult.sanitizedScreenshotDataUrl;
            renderedCount = renderResult.renderedMaskCount;
            maskedCanvas = imageCanvas;
        }
        else if (typeof document !== 'undefined' && rawCapture.rawScreenshotDataUrl && rawCapture.rawScreenshotDataUrl.startsWith('data:image')) {
            const canvas = document.createElement('canvas');
            canvas.width = rawCapture.metadata.screenshotWidth;
            canvas.height = rawCapture.metadata.screenshotHeight;
            const ctx = canvas.getContext('2d');
            if (!ctx) {
                throw new Error('Sanitization Blocked: Canvas 2D context unavailable in host document');
            }
            const img = new Image();
            await new Promise((resolve, reject) => {
                img.onload = () => resolve();
                img.onerror = () => reject(new Error('Sanitization Blocked: Failed to decode raw screenshot image'));
                img.src = rawCapture.rawScreenshotDataUrl;
            });
            ctx.drawImage(img, 0, 0);
            preMaskDetail = PostRedactionVerifier.measurePreMaskDetail(canvas, allRegions);
            const renderResult = MaskRenderer.renderMasks(canvas, allRegions);
            sanitizedDataUrl = renderResult.sanitizedScreenshotDataUrl;
            renderedCount = renderResult.renderedMaskCount;
            maskedCanvas = canvas;
        }
        else {
            throw new Error('Sanitization Blocked: No canvas host available. Rendering must execute in an offscreen document with DOM access.');
        }
        // Map of localId -> sensitive category from DOM detector
        const sensitiveDomElementsMap = new Map();
        for (const region of domRegions) {
            if (region.id.startsWith('dom_sens_')) {
                const localId = region.id.replace('dom_sens_', '');
                sensitiveDomElementsMap.set(localId, region.category);
            }
        }
        // 3. Scrub Interactive Elements (Map to localId, scrub names, compute coarse bounds)
        const sanitizedElements = snapshot.interactiveElements.map((el) => {
            const coarseBounds = [
                Math.max(0, Math.min(1, Math.round((el.boundingBox.x / rawCapture.metadata.viewportWidth) * 100) / 100)),
                Math.max(0, Math.min(1, Math.round((el.boundingBox.y / rawCapture.metadata.viewportHeight) * 100) / 100)),
                Math.max(0, Math.min(1, Math.round((el.boundingBox.width / rawCapture.metadata.viewportWidth) * 100) / 100)),
                Math.max(0, Math.min(1, Math.round((el.boundingBox.height / rawCapture.metadata.viewportHeight) * 100) / 100))
            ];
            const sensitiveCategory = sensitiveDomElementsMap.get(el.localId);
            let sanitizedName;
            let actionCapabilities = [...el.actionCapabilities];
            if (sensitiveCategory) {
                // Category-safe label, from the shared scheme definition so the server's
                // prompt can enumerate exactly the placeholders it will encounter.
                sanitizedName = sensitiveElementPlaceholder(sensitiveCategory);
                // Restrict unsafe action capabilities for sensitive controls (Requirement 6)
                // Remote server must NOT type into password, OTP, payment, token, or sensitive fields
                actionCapabilities = actionCapabilities.filter((cap) => cap !== 'type');
            }
            else {
                sanitizedName = sanitizeElementName(el.rawName);
            }
            return {
                localId: el.localId,
                role: el.role,
                sanitizedName,
                coarseBounds,
                state: el.state,
                actionCapabilities
            };
        });
        const sanitizedTitle = sanitizeElementName(snapshot.pageTitle);
        // 4. Post-Redaction Fail-Closed Verification
        const verification = PostRedactionVerifier.verify(allRegions, renderedCount, sanitizedElements, sanitizedTitle);
        if (!verification.isValid) {
            throw new Error(`Sanitization Blocked: ${verification.reason}`);
        }
        // 4b. Pixel-true coverage. The count check above passes even when a mask is
        // drawn at the wrong coordinates - the mask exists, the count matches, and the
        // secret is still readable. This reads the output pixels and fails closed.
        if (maskedCanvas) {
            const pixelVerification = PostRedactionVerifier.verifyPixelCoverage(maskedCanvas, allRegions, preMaskDetail);
            if (!pixelVerification.isValid) {
                throw new Error(`Sanitization Blocked: ${pixelVerification.reason}`);
            }
        }
        // 5. Redaction manifest - what was removed, and by what convention.
        //
        // Counts and conventions only. A manifest that carried labels, values or
        // coordinates would re-identify exactly what the redaction removed, which would
        // defeat the point of transmitting it.
        const byCategory = new Map();
        for (const region of allRegions) {
            const existing = byCategory.get(region.category);
            if (existing) {
                byCategory.set(region.category, { ...existing, count: existing.count + 1 });
            }
            else {
                byCategory.set(region.category, { category: region.category, count: 1, method: region.method });
            }
        }
        const placeholdersUsed = Array.from(new Set(Array.from(sensitiveDomElementsMap.values()).map((c) => sensitiveElementPlaceholder(c)))).sort();
        const assessableRegions = allRegions.filter((r) => preMaskDetail.has(r.id));
        const redactionManifest = {
            schemeVersion: '1.0',
            categories: Array.from(byCategory.values()).sort((a, b) => a.category.localeCompare(b.category)),
            totalRegions: allRegions.length,
            masksRendered: renderedCount,
            conventions: {
                opaqueFillColor: REDACTION_FILL_COLOR,
                imageLabelFormat: redactionImageLabel('password').replace('PASSWORD', 'CATEGORY'),
                faceImageLabel: FACE_IMAGE_LABEL,
                elementPlaceholders: placeholdersUsed
            },
            coverage: {
                pixelVerified: maskedCanvas !== null,
                regionsAssessed: assessableRegions.length,
                regionsUnassessable: allRegions.length - assessableRegions.length
            },
            withheldCapabilities: sensitiveDomElementsMap.size > 0 ? ['type'] : []
        };
        // Simple SHA-256 simulation for payload digest
        const digestStr = `${rawCapture.captureId}:${allRegions.length}:${sanitizedElements.length}`;
        const payloadDigestSha256 = `sha256_${Math.abs(digestStr.split('').reduce((a, b) => ((a << 5) - a) + b.charCodeAt(0), 0))}`;
        return {
            _brand: 'SanitizedContext_Verified',
            protocolVersion: '1.0',
            runId: `run_${Date.now()}`,
            captureId: rawCapture.captureId,
            goal: sanitizeElementName(goal),
            sanitizedScreenshotDataUrl: sanitizedDataUrl,
            elements: sanitizedElements,
            pageState: {
                title: sanitizedTitle,
                viewport: [rawCapture.metadata.viewportWidth, rawCapture.metadata.viewportHeight]
            },
            maskCount: allRegions.length,
            redactionManifest,
            payloadDigestSha256,
            timestamp: Date.now()
        };
    }
}
//# sourceMappingURL=pipeline.js.map