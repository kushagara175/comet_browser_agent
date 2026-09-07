/**
 * @privapilot/protocol - Deterministic Intent Grounding & Target Resolution
 *
 * Implements strict, privacy-preserving candidate ranking and ambiguity evaluation
 * to ensure that browser actions are bound to the exact intended DOM elements.
 */
/**
 * Normalizes a text string for semantic token comparison.
 */
export function normalizeSemanticText(text) {
    return (text || '')
        .toLowerCase()
        .replace(/[^a-z0-9\s_-]/g, ' ')
        .replace(/\s+/g, ' ')
        .trim();
}
/**
 * Splits normalized text into meaningful tokens (filtering trivial single chars).
 */
export function tokenizeSemanticText(text) {
    const normalized = normalizeSemanticText(text);
    if (!normalized)
        return [];
    return normalized.split(/\s+/).filter((t) => t.length > 0);
}
/**
 * Computes Levenshtein edit distance between two strings.
 */
export function levenshteinDistance(a, b) {
    if (a === b)
        return 0;
    if (!a.length)
        return b.length;
    if (!b.length)
        return a.length;
    const row = Array.from({ length: b.length + 1 }, (_, i) => i);
    for (let i = 1; i <= a.length; i++) {
        let prev = i;
        for (let j = 1; j <= b.length; j++) {
            const val = a[i - 1] === b[j - 1] ? row[j - 1] : Math.min(row[j - 1], row[j], prev) + 1;
            row[j - 1] = prev;
            prev = val;
        }
        row[b.length] = prev;
    }
    return row[b.length];
}
/**
 * Checks whether two semantic tokens match, accommodating minor typos (e.g. "knwo" vs "know")
 * or prefix abbreviations (e.g. "pass" for "password").
 */
export function isFuzzyTokenMatch(a, b) {
    if (a === b)
        return true;
    const lenA = a.length;
    const lenB = b.length;
    if (Math.abs(lenA - lenB) > 3)
        return false;
    if (lenA < 3 || lenB < 3)
        return false;
    // Prefix matching for abbreviations (e.g. "pass" -> "password")
    if (lenA >= 4 && b.startsWith(a))
        return true;
    if (lenB >= 4 && a.startsWith(b))
        return true;
    // Levenshtein edit distance check
    const dist = levenshteinDistance(a, b);
    return dist <= (Math.max(lenA, lenB) >= 6 ? 2 : 1);
}
export const SEMANTIC_SYNONYMS = {
    chatbox: ['chat', 'message', 'ask', 'follow-up', 'followup', 'prompt', 'reply', 'question', 'input', 'textbox', 'searchbox', 'textarea', 'conversation', 'say'],
    chat: ['chatbox', 'message', 'ask', 'follow-up', 'followup', 'prompt', 'reply', 'question', 'input', 'textbox', 'conversation', 'say'],
    message: ['chat', 'chatbox', 'ask', 'reply', 'say', 'text', 'input', 'prompt'],
    searchbox: ['search', 'find', 'query', 'filter', 'input', 'textbox'],
    search: ['searchbox', 'find', 'query', 'filter', 'lookup', 'input'],
    input: ['chatbox', 'searchbox', 'field', 'box', 'textbox', 'textarea', 'prompt', 'ask']
};
const GENERIC_CONTROL_NAMES = new Set([
    'button',
    'link',
    'click',
    'press',
    'submit',
    'generic',
    'input',
    'field',
    'select',
    'item',
    'control'
]);
/**
 * Evaluates and scores an individual SanitizedElement against a StructuredTaskIntent.
 */
export function scoreCandidate(element, intent, activeDialogVisible = false) {
    // 1. Capability verification (Hard requirement)
    let requiredCap = null;
    if (intent.intent === 'click' || intent.intent === 'dismiss')
        requiredCap = 'click';
    else if (intent.intent === 'type')
        requiredCap = 'type';
    else if (intent.intent === 'select')
        requiredCap = 'select';
    if (requiredCap && !element.actionCapabilities.includes(requiredCap)) {
        return {
            score: 0,
            confidence: 0,
            rationale: `Missing required action capability '${requiredCap}'`,
            isDisqualified: true
        };
    }
    // 2. State verification (Disabled elements cannot execute active tasks)
    if (element.state.includes('disabled')) {
        return {
            score: 0,
            confidence: 0,
            rationale: 'Element is in disabled state',
            isDisqualified: true
        };
    }
    const targetPhraseNorm = normalizeSemanticText(intent.targetPhrase || '');
    const elNameNorm = normalizeSemanticText(element.sanitizedName || '');
    const targetTokens = intent.targetTokens.length > 0 ? intent.targetTokens : tokenizeSemanticText(targetPhraseNorm);
    const elTokens = tokenizeSemanticText(elNameNorm);
    // If no target phrase was specified, passive/generic matching
    if (!targetPhraseNorm && targetTokens.length === 0) {
        return {
            score: 50,
            confidence: 0.5,
            rationale: 'Generic element considered without specific target phrase',
            isDisqualified: false
        };
    }
    let score = 0;
    const rationaleParts = [];
    // 3. Exact Normalized Name Match (+100), Strong Prefix (+65), Substring (+50), or Strong Fuzzy Name Match (+80)
    if (elNameNorm && targetPhraseNorm && elNameNorm === targetPhraseNorm) {
        score += 100;
        rationaleParts.push(`Exact name match ("${element.sanitizedName}")`);
    }
    else if (elNameNorm && targetPhraseNorm && (elNameNorm.startsWith(targetPhraseNorm) || targetPhraseNorm.startsWith(elNameNorm))) {
        score += 65;
        rationaleParts.push(`Strong prefix match ("${element.sanitizedName}")`);
    }
    else if (targetPhraseNorm && elNameNorm.includes(targetPhraseNorm)) {
        score += 50;
        rationaleParts.push(`Substring containment ("${element.sanitizedName}")`);
    }
    else if (elNameNorm &&
        targetPhraseNorm &&
        isFuzzyTokenMatch(elNameNorm.replace(/\s+/g, ''), targetPhraseNorm.replace(/\s+/g, ''))) {
        score += 80;
        rationaleParts.push(`Fuzzy full-name match ("${targetPhraseNorm}" ≈ "${element.sanitizedName}")`);
    }
    // 4. Token Overlap & Word Boundaries (Exact + Fuzzy Typo Matching)
    if (targetTokens.length > 0 && elTokens.length > 0) {
        const matchedTokens = [];
        const fuzzyMatchedTokens = [];
        for (const t of targetTokens) {
            const synonyms = SEMANTIC_SYNONYMS[t] || [];
            if (elTokens.includes(t)) {
                matchedTokens.push(t);
            }
            else {
                const synMatch = synonyms.find((s) => elTokens.includes(s) || elTokens.some((elT) => isFuzzyTokenMatch(s, elT)));
                if (synMatch) {
                    fuzzyMatchedTokens.push({ target: t, matched: synMatch });
                }
                else {
                    const fuzzy = elTokens.find((elT) => isFuzzyTokenMatch(t, elT));
                    if (fuzzy) {
                        fuzzyMatchedTokens.push({ target: t, matched: fuzzy });
                    }
                }
            }
        }
        const totalMatches = matchedTokens.length + fuzzyMatchedTokens.length;
        const tokenRatio = totalMatches / targetTokens.length;
        if (matchedTokens.length === targetTokens.length) {
            score += 40;
            rationaleParts.push(`All target tokens present [${matchedTokens.join(', ')}]`);
        }
        else if (totalMatches === targetTokens.length) {
            score += 35;
            const fzDesc = fuzzyMatchedTokens.map((f) => `"${f.target}" ≈ "${f.matched}"`).join(', ');
            rationaleParts.push(`Target tokens matched with typo tolerance (${fzDesc})`);
        }
        else if (tokenRatio >= 0.5) {
            score += Math.round(tokenRatio * 30);
            rationaleParts.push(`Partial token overlap (${totalMatches}/${targetTokens.length})`);
        }
        // Token order match
        const combinedTokens = [...matchedTokens, ...fuzzyMatchedTokens.map((f) => f.matched)];
        if (combinedTokens.length > 1) {
            let isOrdered = true;
            let lastIndex = -1;
            for (const t of combinedTokens) {
                const idx = elTokens.indexOf(t);
                if (idx <= lastIndex) {
                    isOrdered = false;
                    break;
                }
                lastIndex = idx;
            }
            if (isOrdered) {
                score += 15;
                rationaleParts.push('Token sequence order preserved');
            }
        }
    }
    // 5. Role Agreement (+20 / -25)
    if (intent.roleHint) {
        if (element.role === intent.roleHint) {
            score += 20;
            rationaleParts.push(`Role matches hint '${intent.roleHint}'`);
        }
        else if ((intent.roleHint === 'button' && element.role === 'link') ||
            (intent.roleHint === 'link' && element.role === 'button')) {
            score -= 5;
        }
        else {
            score -= 25;
            rationaleParts.push(`Role mismatch (expected '${intent.roleHint}', got '${element.role}')`);
        }
    }
    // 6. Contextual Qualifier Match (+80 / -50)
    // E.g., user says: "Open View Details for SIH26003" -> contextPhrase: "SIH26003"
    if (intent.contextPhrase) {
        const contextNorm = normalizeSemanticText(intent.contextPhrase);
        const containerNorm = normalizeSemanticText(element.containerContext || '');
        if (containerNorm && contextNorm) {
            if (containerNorm.includes(contextNorm)) {
                score += 80;
                rationaleParts.push(`Container context matches qualifier "${intent.contextPhrase}"`);
            }
            else {
                score -= 50;
                rationaleParts.push(`Container context does not match qualifier "${intent.contextPhrase}"`);
            }
        }
        else {
            score -= 20;
        }
    }
    // 7. Active Dialog Alignment (+25 / -20)
    if (activeDialogVisible) {
        if (element.isInsideDialog) {
            score += 25;
            rationaleParts.push('Element inside active modal/dialog');
        }
        else {
            score -= 20;
            rationaleParts.push('Element outside active dialog while dialog is open');
        }
    }
    // 8. Penalize generic control names when specific text was requested
    if (GENERIC_CONTROL_NAMES.has(elNameNorm) && targetPhraseNorm && !GENERIC_CONTROL_NAMES.has(targetPhraseNorm)) {
        score -= 30;
        rationaleParts.push('Heavily penalized generic element name');
    }
    const finalScore = Math.max(0, score);
    const confidence = Math.min(0.99, Math.max(0.1, Number((finalScore / 150).toFixed(2))));
    return {
        score: finalScore,
        confidence,
        rationale: rationaleParts.join('; ') || 'Baseline candidate evaluation',
        isDisqualified: finalScore === 0
    };
}
/**
 * Grounds and ranks all interactive candidates on the page against the structured intent.
 * Evaluates ambiguity and returns the unambiguous winner or ambiguity diagnosis.
 */
export function groundTargetCandidates(elements, intent, activeDialogVisible = false) {
    if (intent.intent === 'scroll' || intent.intent === 'observe') {
        return {
            status: 'passive_or_unscoped',
            candidates: []
        };
    }
    const scoredList = [];
    for (const el of elements) {
        const result = scoreCandidate(el, intent, activeDialogVisible);
        if (!result.isDisqualified && result.score >= 35) {
            scoredList.push({
                element: el,
                score: result.score,
                confidence: result.confidence,
                rationale: result.rationale
            });
        }
    }
    // Sort descending by score
    scoredList.sort((a, b) => b.score - a.score);
    if (scoredList.length === 0) {
        return {
            status: 'no_match',
            candidates: []
        };
    }
    const best = scoredList[0];
    // Check for Ambiguity
    if (scoredList.length > 1) {
        const runnerUp = scoredList[1];
        const scoreDiff = best.score - runnerUp.score;
        // If both are strong candidates and score difference is small (< 15)
        // and both share the same role and name without contextual distinction:
        const sameName = normalizeSemanticText(best.element.sanitizedName) === normalizeSemanticText(runnerUp.element.sanitizedName);
        const isAmbiguous = (scoreDiff < 15 && best.score >= 50 && runnerUp.score >= 50) ||
            (sameName && !intent.contextPhrase && scoreDiff === 0);
        if (isAmbiguous) {
            const ambigReason = `Ambiguous candidates: multiple matching controls ("${best.element.sanitizedName}") found without distinguishing contextual qualifier.`;
            return {
                status: 'ambiguous_match',
                bestCandidate: best,
                candidates: scoredList,
                ambiguityReason: ambigReason
            };
        }
    }
    return {
        status: 'unambiguous_match',
        bestCandidate: best,
        candidates: scoredList
    };
}
//# sourceMappingURL=grounding.js.map