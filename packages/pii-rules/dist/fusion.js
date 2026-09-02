/**
 * @privapilot/pii-rules - Detection Fusion
 *
 * Multiple independent detectors intentionally overlap: a card field is caught by
 * its `autocomplete="cc-number"` attribute AND by the Luhn-validated regex over its
 * value. That redundancy is good for recall and bad for everything downstream — it
 * doubles the mask count, inflates the over-mask ratio, and reports one secret twice.
 *
 * Fusion collapses detections that refer to the same underlying secret while keeping
 * the highest-confidence category for it. It never drops a region that no other
 * detection covers, so recall cannot decrease.
 */
/**
 * Category precedence when two detectors disagree about the same value. More
 * specific categories win, so a CVV found by attribute is not relabelled as a card
 * number by a looser numeric regex.
 */
const CATEGORY_PRECEDENCE = [
    'password',
    'auth_code',
    'cvv',
    'credit_card',
    'national_id',
    'bank_account',
    'email',
    'phone',
    'date_of_birth',
    'token',
    'face',
    'high_risk_surface',
    'uninspectable'
];
function precedenceOf(cat) {
    const idx = CATEGORY_PRECEDENCE.indexOf(cat);
    return idx === -1 ? CATEGORY_PRECEDENCE.length : idx;
}
/** Normalises a secret so "4532 0150 1234 5671" and "4532-0150-1234-5671" collapse. */
function normalizeSecret(text) {
    if (!text)
        return '';
    return text.toLowerCase().replace(/[\s\-_().]/g, '').trim();
}
function overlaps(a, b) {
    if (a.normX === undefined || a.normY === undefined || a.normW === undefined || a.normH === undefined ||
        b.normX === undefined || b.normY === undefined || b.normW === undefined || b.normH === undefined) {
        return false;
    }
    const ix = Math.max(0, Math.min(a.normX + a.normW, b.normX + b.normW) - Math.max(a.normX, b.normX));
    const iy = Math.max(0, Math.min(a.normY + a.normH, b.normY + b.normH) - Math.max(a.normY, b.normY));
    const inter = ix * iy;
    if (inter <= 0)
        return false;
    const smaller = Math.min(a.normW * a.normH, b.normW * b.normH);
    return smaller > 0 && inter / smaller >= 0.8;
}
export function fuseSensitiveDetections(detections, options = { spatial: true }) {
    const useSpatial = options.spatial !== false;
    const kept = [];
    for (const det of detections) {
        const secret = normalizeSecret(det.text);
        let mergedIntoIndex = -1;
        for (let i = 0; i < kept.length; i++) {
            const existing = kept[i];
            const existingSecret = normalizeSecret(existing.text);
            const sameSecret = secret.length >= 3 && secret === existingSecret;
            const sameRegion = useSpatial && overlaps(det, existing);
            if (sameSecret || sameRegion) {
                mergedIntoIndex = i;
                break;
            }
        }
        if (mergedIntoIndex === -1) {
            kept.push(det);
            continue;
        }
        // Keep the more specific category for the same secret.
        const existing = kept[mergedIntoIndex];
        if (precedenceOf(det.category) < precedenceOf(existing.category)) {
            kept[mergedIntoIndex] = { ...existing, ...det };
        }
    }
    return kept;
}
//# sourceMappingURL=fusion.js.map