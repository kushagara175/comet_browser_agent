/**
 * @privapilot/extension - On-Device Face & Avatar Perception Subsystem
 *
 * Merges:
 * 1. UltraFace-320 ONNX vision model inferences from screenshot pixels.
 * 2. Explicit DOM avatar / profile image signals as union fallback.
 * (Generic aspect-ratio heuristics are completely removed).
 */
import { SensitiveRegion } from '@privapilot/protocol';
import { CoordinateTransformer } from './coordinate-transformer.js';
import { DetectedFace } from '../vision/face-model.js';
export interface RawImageElementCapture {
    readonly id: string;
    readonly isProfilePhotoOrAvatar: boolean;
    readonly isPublicPostImage?: boolean;
    readonly naturalWidth?: number;
    readonly naturalHeight?: number;
    readonly boundingClientRect: {
        readonly x: number;
        readonly y: number;
        readonly width: number;
        readonly height: number;
    };
}
/**
 * Combines ONNX vision model face detections with explicit DOM avatar signals.
 */
export declare function detectFaceRegions(images: ReadonlyArray<RawImageElementCapture>, transformer: CoordinateTransformer, modelFaces?: ReadonlyArray<DetectedFace>): SensitiveRegion[];
//# sourceMappingURL=face-detector.d.ts.map