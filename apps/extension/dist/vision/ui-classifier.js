/**
 * @privapilot/extension - Nearest-prototype UI classification over ViT embeddings
 *
 * The ViT produces a 512-d CLIP embedding; this turns one into a UI affordance label
 * by comparing it against reference vectors generated offline
 * (`npm run generate:prototypes`).
 *
 * **Raw similarity is nearly useless here and the margin is everything.** CLIP
 * embeddings of UI controls sit in a very tight cone - the two most similar class
 * prototypes are 0.942 apart on a scale where 1.0 is identical - so an absolute
 * cosine of 0.9 says almost nothing. The gap between the best and second-best class
 * is what carries the signal.
 *
 * Measured on held-out renders the prototypes were NOT built from (n=20):
 *
 *   margin >= 0.0000   20/20 labelled, 75% precision
 *   margin >= 0.0162   11/20 labelled, 100% precision   <- shipped
 *   margin >= 0.0400    7/20 labelled, 100% precision
 *
 * Abstaining is the right trade for an agent that ACTS on these labels: a
 * confidently wrong "this is a button" is worse than admitting no idea. The same
 * escalate-when-unsure rule the decision router follows.
 *
 * n=20 is a small sample and 100% precision on it is not a general guarantee. The
 * held-out corpus phase is where this gets a real measurement.
 */
import { UI_PROTOTYPES } from './ui-prototypes.generated.js';
import { cosineSimilarity } from './vit-encoder.js';
/**
 * Minimum top1-to-top2 gap before a label is asserted.
 *
 * Calibrated to sit above every misclassification margin observed on held-out data
 * (max 0.0152), not chosen for roundness.
 */
export const MIN_CLASSIFICATION_MARGIN = 0.0162;
export function classifyEmbedding(vector) {
    const ranked = Object.keys(UI_PROTOTYPES)
        .map((cls) => ({ cls, sim: cosineSimilarity(vector, UI_PROTOTYPES[cls]) }))
        .sort((a, b) => b.sim - a.sim);
    const best = ranked[0];
    const second = ranked[1];
    const margin = best.sim - (second ? second.sim : 0);
    const confident = margin >= MIN_CLASSIFICATION_MARGIN;
    return {
        label: confident ? best.cls : null,
        bestLabel: best.cls,
        similarity: Math.round(best.sim * 10000) / 10000,
        margin: Math.round(margin * 10000) / 10000,
        confident,
        runnerUp: second ? second.cls : best.cls
    };
}
//# sourceMappingURL=ui-classifier.js.map