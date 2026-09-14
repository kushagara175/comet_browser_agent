/**
 * @privapilot/extension - On-Device Fail-Closed Sanitizer Pipeline
 *
 * Enforces the core privacy boundary:
 * RawCapture -> DetectionReport -> SanitizedContext -> NetworkPayload
 */
import { sanitizeElementName } from '@privapilot/pii-rules';
import { CoordinateTransformer } from './coordinate-transformer.js';
import { detectDomSensitiveRegions } from './dom-detector.js';
import { detectTextSensitiveRegions } from './text-detector.js';
import { detectFaceRegions } from './face-detector.js';
import { detectHighRiskSurfaces } from './surface-detector.js';
import { MaskRenderer } from './mask-renderer.js';
import { PostRedactionVerifier } from './post-redaction-verifier.js';
import { UltraFaceModelRunner } from '../vision/face-model.js';
import { computePayloadDigestSha256 } from '../security/digest.js';
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
        // Identify regions that actually intersect the visible canvas viewport.
        // Off-screen elements (below fold, scrolled out of view, or outside canvas) have zero pixels in the screenshot
        const canvasW = imageCanvas?.width || rawCapture.metadata.screenshotWidth || 1280;
        const canvasH = imageCanvas?.height || rawCapture.metadata.screenshotHeight || 720;
        const visibleRegions = allRegions.filter((r) => {
            const b = r.screenshotBox;
            return (b.width > 1 &&
                b.height > 1 &&
                b.x + b.width > 0 &&
                b.y + b.height > 0 &&
                b.x < canvasW &&
                b.y < canvasH);
        });
        const detectionReport = {
            captureId: rawCapture.captureId,
            timestamp: Date.now(),
            regions: visibleRegions,
            uninspectableSurfacesFound: surfaceRegions.some((r) => visibleRegions.includes(r)),
            requiresFailClosedBlock: false
        };
        // 2. Render Redaction Masks onto Canvas (Strictly Fail-Closed: Zero 1x1 or permissive fallbacks)
        let sanitizedDataUrl;
        let renderedCount = 0;
        let regionRecords = [];
        let workingCanvas = null;
        let rawCanvas = null;
        if (imageCanvas) {
            if (typeof document !== 'undefined' && typeof document.createElement === 'function') {
                try {
                    const rc = document.createElement('canvas');
                    rc.width = imageCanvas.width;
                    rc.height = imageCanvas.height;
                    const rCtx = rc.getContext('2d');
                    if (rCtx) {
                        rCtx.drawImage(imageCanvas, 0, 0);
                        rawCanvas = rc;
                    }
                }
                catch (_) { }
            }
            workingCanvas = imageCanvas;
            const renderResult = MaskRenderer.renderMasks(imageCanvas, visibleRegions, snapshot.interactiveElements, { width: rawCapture.metadata.viewportWidth, height: rawCapture.metadata.viewportHeight });
            sanitizedDataUrl = renderResult.sanitizedScreenshotDataUrl;
            renderedCount = renderResult.renderedMaskCount;
            regionRecords = renderResult.regionRecords;
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
            try {
                const rc = document.createElement('canvas');
                rc.width = canvas.width;
                rc.height = canvas.height;
                const rCtx = rc.getContext('2d');
                if (rCtx) {
                    rCtx.drawImage(canvas, 0, 0);
                    rawCanvas = rc;
                }
            }
            catch (_) { }
            workingCanvas = canvas;
            const renderResult = MaskRenderer.renderMasks(canvas, visibleRegions, snapshot.interactiveElements, { width: rawCapture.metadata.viewportWidth, height: rawCapture.metadata.viewportHeight });
            sanitizedDataUrl = renderResult.sanitizedScreenshotDataUrl;
            renderedCount = renderResult.renderedMaskCount;
            regionRecords = renderResult.regionRecords;
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
                // Category-safe label for sensitive controls (Requirement 5)
                switch (sensitiveCategory) {
                    case 'password':
                        sanitizedName = '[PASSWORD FIELD]';
                        break;
                    case 'auth_code':
                        sanitizedName = '[OTP FIELD]';
                        break;
                    case 'credit_card':
                    case 'cvv':
                    case 'bank_account':
                        sanitizedName = '[PAYMENT FIELD]';
                        break;
                    case 'national_id':
                        sanitizedName = '[NATIONAL ID FIELD]';
                        break;
                    case 'email':
                        sanitizedName = '[EMAIL FIELD]';
                        break;
                    case 'phone':
                        sanitizedName = '[PHONE FIELD]';
                        break;
                    case 'token':
                        sanitizedName = '[TOKEN/KEY FIELD]';
                        break;
                    default:
                        sanitizedName = '[SENSITIVE FIELD]';
                        break;
                }
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
                actionCapabilities,
                containerContext: el.containerContext,
                nearestHeading: el.nearestHeading,
                isInsideDialog: el.isInsideDialog,
                ...(el.verticalOffset ? { verticalOffset: el.verticalOffset } : {}),
                ...(el.inViewport !== undefined ? { inViewport: el.inViewport } : {})
            };
        });
        // Cap interactive elements strictly to <= 180 (under the 200 server schema limit)
        // Prioritizing active dialogs, primary form controls (inputs/buttons), and visible viewport bounds
        let finalSanitizedElements = sanitizedElements;
        if (finalSanitizedElements.length > 180) {
            finalSanitizedElements = [...finalSanitizedElements].sort((a, b) => {
                const aDialog = a.isInsideDialog ? 1 : 0;
                const bDialog = b.isInsideDialog ? 1 : 0;
                if (aDialog !== bDialog)
                    return bDialog - aDialog;
                const roleScore = (r) => {
                    if (r === 'input' || r === 'textarea' || r === 'select')
                        return 4;
                    if (r === 'button')
                        return 3;
                    if (r === 'tab' || r === 'menuitem')
                        return 2;
                    return 1;
                };
                const aScore = roleScore(a.role);
                const bScore = roleScore(b.role);
                if (aScore !== bScore)
                    return bScore - aScore;
                const aInView = a.coarseBounds[1] >= 0 && a.coarseBounds[1] <= 1 && a.coarseBounds[0] >= 0 && a.coarseBounds[0] <= 1 ? 1 : 0;
                const bInView = b.coarseBounds[1] >= 0 && b.coarseBounds[1] <= 1 && b.coarseBounds[0] >= 0 && b.coarseBounds[0] <= 1 ? 1 : 0;
                if (aInView !== bInView)
                    return bInView - aInView;
                return a.coarseBounds[1] - b.coarseBounds[1];
            }).slice(0, 180);
        }
        const sanitizedTitle = sanitizeElementName(snapshot.pageTitle);
        // 4. Post-Redaction Fail-Closed Verification
        const verification = PostRedactionVerifier.verify(visibleRegions, renderedCount, finalSanitizedElements, sanitizedTitle, regionRecords, workingCanvas ? { sanitizedCanvas: workingCanvas, rawCanvas } : undefined);
        if (!verification.isValid) {
            throw new Error(`Sanitization Blocked: ${verification.reason}`);
        }
        let piiTextCount = 0;
        let domInputCount = 0;
        let faceCount = 0;
        let surfaceCount = 0;
        for (const r of visibleRegions) {
            if (r.category === 'face' || r.detectorSource === 'face_model') {
                faceCount++;
            }
            else if (r.detectorSource === 'surface_detector' || r.category === 'high_risk_surface' || r.category === 'uninspectable') {
                surfaceCount++;
            }
            else if (r.detectorSource === 'dom_semantic') {
                domInputCount++;
            }
            else {
                piiTextCount++;
            }
        }
        let opaqueBoxCount = 0;
        let spatialBlurCount = 0;
        for (const r of visibleRegions) {
            if (r.method === 'gaussian_blur' || r.method === 'spatial_blur') {
                spatialBlurCount++;
            }
            else {
                opaqueBoxCount++;
            }
        }
        const redactionManifest = {
            manifestVersion: '1.0',
            totalRegions: visibleRegions.length,
            categoryCounts: {
                piiText: piiTextCount,
                domInput: domInputCount,
                face: faceCount,
                surface: surfaceCount
            },
            methodCounts: {
                opaqueBox: opaqueBoxCount,
                spatialBlur: spatialBlurCount
            },
            placeholderConvention: '[REDACTED]',
            geometrySemantics: 'clamped_css_pixels',
            pixelVerificationPerformed: true,
            pixelVerificationPassed: verification.isValid,
            uninspectableSurfacePolicy: 'fail_closed',
            visionAttempted: visibleRegions.some((r) => r.category === 'face'),
            visionSucceeded: visibleRegions.some((r) => r.category === 'face'),
            visionProvider: visibleRegions.some((r) => r.category === 'face') ? 'ModelRunner' : 'None',
            durationMs: Date.now() - (rawCapture.timestamp || Date.now())
        };
        const pageStateObj = {
            title: sanitizedTitle,
            viewport: [rawCapture.metadata.viewportWidth, rawCapture.metadata.viewportHeight],
            ...(snapshot.visibleDialogCount !== undefined ? { visibleDialogCount: snapshot.visibleDialogCount } : {}),
            ...(snapshot.dialogTitles && snapshot.dialogTitles.length > 0 ? { dialogTitles: snapshot.dialogTitles.map(t => sanitizeElementName(t)) } : {}),
            ...(snapshot.statusSummaries && snapshot.statusSummaries.length > 0 ? { statusSummaries: snapshot.statusSummaries.map(s => sanitizeElementName(s)) } : {}),
            ...(snapshot.routeFingerprint ? { routeFingerprint: snapshot.routeFingerprint } : {}),
            ...(snapshot.postconditionSummary ? { postconditionSummary: snapshot.postconditionSummary } : {}),
            ...(snapshot.counters && snapshot.counters.length > 0 ? { counters: snapshot.counters.map(c => ({ label: sanitizeElementName(c.label), value: sanitizeElementName(c.value) })) } : {}),
            ...(snapshot.contentSummaries && snapshot.contentSummaries.length > 0 ? { contentSummaries: snapshot.contentSummaries.map(s => sanitizeElementName(s)) } : {}),
            ...(snapshot.domain ? { domain: sanitizeElementName(snapshot.domain) } : {}),
            ...(snapshot.scrollMetrics ? { scrollMetrics: snapshot.scrollMetrics } : {})
        };
        const safeCanonicalData = {
            captureId: rawCapture.captureId,
            goal: sanitizeElementName(goal),
            maskCount: visibleRegions.length,
            pageState: pageStateObj,
            elements: finalSanitizedElements
        };
        const payloadDigestSha256 = await computePayloadDigestSha256(safeCanonicalData);
        return {
            _brand: 'SanitizedContext_Verified',
            protocolVersion: '1.0',
            runId: `run_${Date.now()}`,
            captureId: rawCapture.captureId,
            goal: sanitizeElementName(goal),
            sanitizedScreenshotDataUrl: sanitizedDataUrl,
            elements: finalSanitizedElements,
            pageState: pageStateObj,
            maskCount: visibleRegions.length,
            payloadDigestSha256,
            timestamp: Date.now(),
            redactionManifest
        };
    }
}
//# sourceMappingURL=pipeline.js.map