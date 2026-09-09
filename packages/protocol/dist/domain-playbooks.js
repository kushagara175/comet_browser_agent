/**
 * @privapilot/protocol - Domain Playbooks (Site-Specific Agent Knowledge)
 *
 * Implements deterministic domain playbooks and site knowledge inspired by
 * browser-harness domain-skills, providing instant route and target grounding
 * for specific portals without requiring DOM trial-and-error.
 */
import { normalizeSemanticText, tokenizeSemanticText, isFuzzyTokenMatch } from './grounding.js';
/**
 * Built-in playbook for Smart India Hackathon (sih.gov.in) portal.
 * Maps known navigation paths, key landmarks, search inputs, and submission metrics.
 */
export const SIH_PLAYBOOK = {
    domain: 'sih.gov.in',
    name: 'Smart India Hackathon Portal',
    aliases: ['sih.gov.in', 'www.sih.gov.in', 'sih', 'smart indiahackathon'],
    routes: [
        {
            name: 'signin',
            path: '/signin',
            description: 'SIH login & authentication page for teams, institutes, and evaluators',
            matchKeywords: ['login', 'signin', 'sign in', 'log in', 'portal login', 'auth']
        },
        {
            name: 'problemStatements',
            path: '/problem-statements',
            description: 'Problem statements search and directory listing',
            matchKeywords: ['problem statement', 'problem statements', 'ps', 'problem list', 'view ps', 'problems']
        },
        {
            name: 'spoc',
            path: '/know-your-spoc',
            description: 'Know Your College / Institute SPOC search directory',
            matchKeywords: ['spoc', 'know your spoc', 'college spoc', 'find spoc', 'spoc details', 'institute spoc']
        },
        {
            name: 'home',
            path: '/',
            description: 'SIH main landing page and announcements',
            matchKeywords: ['home', 'homepage', 'main page', 'landing page', 'overview']
        },
        {
            name: 'results',
            path: '/results',
            description: 'Hackathon round results and nominated finalists',
            matchKeywords: ['result', 'results', 'winners', 'shortlisted', 'finalists', 'evaluations']
        },
        {
            name: 'guidelines',
            path: '/guidelines',
            description: 'Hackathon rules, submission process and guidelines',
            matchKeywords: ['guidelines', 'process', 'rules', 'instructions', 'flow']
        }
    ],
    landmarks: [
        {
            id: 'spoc_link',
            phrase: 'Know Your SPOC',
            aliases: ['know your spoc', 'spoc', 'college spoc', 'find your spoc', 'spoc directory', 'institute spoc'],
            role: 'link',
            description: 'Direct link to college SPOC verification tool',
            intentAction: 'click'
        },
        {
            id: 'login_btn',
            phrase: 'SIH Login',
            aliases: ['login', 'sih login', 'sign in', 'institute login', 'student login'],
            role: 'link',
            description: 'Login button for SIH portal',
            intentAction: 'click'
        },
        {
            id: 'problem_statements_nav',
            phrase: 'Problem Statements',
            aliases: ['problem statements', 'problem statement', 'ps list', 'browse problem statements'],
            role: 'link',
            description: 'Navigation link to browse Hackathon problem statements',
            intentAction: 'click'
        },
        {
            id: 'ps_search_field',
            phrase: 'Search Problem Statement',
            aliases: ['search', 'search by ps', 'filter by ps', 'ps number', 'ps id', 'enter keyword', 'search input'],
            role: 'input',
            description: 'Search box to filter problem statements by ID or theme',
            intentAction: 'type'
        },
        {
            id: 'submissions_nav',
            phrase: 'Submitted Ideas',
            aliases: ['submitted ideas', 'submissions', 'total submissions', 'my submissions', 'nominations'],
            role: 'tab',
            description: 'Tab or section showing team idea submissions',
            intentAction: 'click'
        }
    ],
    metricsRules: [
        {
            metricId: 'total_submissions',
            labelKeywords: ['submission', 'submissions', 'submitted ideas', 'ideas submitted', 'total submissions', 'nominations'],
            containerHints: ['stat', 'card', 'metric', 'table', 'counter', 'dashboard', 'box'],
            valuePattern: '\\b\\d+(?:,\\d+)*\\b',
            description: 'Number of submitted ideas or team nominations'
        },
        {
            metricId: 'total_problem_statements',
            labelKeywords: ['problem statements', 'total ps', 'problems count', 'active ps'],
            containerHints: ['counter', 'stat', 'badge', 'card'],
            valuePattern: '\\b\\d+\\b',
            description: 'Total number of problem statements available'
        }
    ],
    formFieldHints: {
        username: ['email', 'username', 'user name', 'registered email', 'userid', 'login id'],
        password: ['password', 'pass', 'pwd', 'enter password']
    }
};
/**
 * Registry of known domain playbooks.
 */
export const REGISTERED_PLAYBOOKS = [
    SIH_PLAYBOOK
];
/**
 * Normalizes host/URL to identify matching domain playbook.
 */
export function lookupDomainPlaybook(urlOrHostname) {
    if (!urlOrHostname)
        return undefined;
    let hostname = urlOrHostname.toLowerCase().trim();
    try {
        if (hostname.includes('://')) {
            hostname = new URL(hostname).hostname;
        }
    }
    catch {
        // If URL parsing fails, strip protocol manually
        hostname = hostname.replace(/^[a-z]+:\/\//i, '').split('/')[0].split(':')[0];
    }
    return REGISTERED_PLAYBOOKS.find((playbook) => {
        if (hostname === playbook.domain || hostname.endsWith(`.${playbook.domain}`)) {
            return true;
        }
        return playbook.aliases.some((alias) => hostname.includes(alias.toLowerCase()));
    });
}
/**
 * Resolves user query intent against a domain playbook to provide deterministic navigation,
 * target grounding, or metric extraction recommendations.
 */
export function resolvePlaybookIntent(playbook, userQuery, currentUrl) {
    const normQuery = normalizeSemanticText(userQuery);
    const queryTokens = tokenizeSemanticText(normQuery);
    if (!normQuery) {
        return {
            playbookName: playbook.name,
            matchedIntent: 'none',
            confidence: 0,
            rationale: 'Empty user query'
        };
    }
    // 1. Check for metric extraction intent (e.g. "how many submissions are done", "count of submissions")
    const isMetricQuery = queryTokens.some((t) => ['how', 'many', 'count', 'total', 'number', 'status', 'check', 'show'].includes(t));
    if (isMetricQuery) {
        for (const rule of playbook.metricsRules) {
            const match = rule.labelKeywords.some((kw) => {
                const kwTokens = tokenizeSemanticText(kw);
                return kwTokens.every((kt) => queryTokens.includes(kt) || queryTokens.some((qt) => isFuzzyTokenMatch(kt, qt)));
            });
            if (match) {
                return {
                    playbookName: playbook.name,
                    matchedIntent: 'extract_metric',
                    confidence: 0.95,
                    metricRule: rule,
                    targetPhrase: rule.labelKeywords[0],
                    rationale: `Matched metric extraction rule '${rule.metricId}' (${rule.description}) based on query keywords`
                };
            }
        }
    }
    // 2. If user intent is explicit navigation (e.g. "go to", "navigate to"), check routes first
    const isNavQuery = queryTokens.some((t) => ['go', 'navigate', 'open', 'visit', 'load', 'take'].includes(t));
    if (isNavQuery) {
        for (const route of playbook.routes) {
            const match = route.matchKeywords.some((kw) => {
                const kwNorm = normalizeSemanticText(kw);
                if (normQuery.includes(kwNorm))
                    return true;
                const kwTokens = tokenizeSemanticText(kwNorm);
                return kwTokens.length > 0 && kwTokens.every((kt) => queryTokens.includes(kt) || queryTokens.some((qt) => isFuzzyTokenMatch(kt, qt)));
            });
            if (match) {
                const targetUrl = `https://${playbook.domain}${route.path}`;
                const isAlreadyOnRoute = currentUrl ? currentUrl.includes(route.path) : false;
                return {
                    playbookName: playbook.name,
                    matchedIntent: isAlreadyOnRoute ? 'none' : 'navigate',
                    confidence: 0.95,
                    targetUrl,
                    rationale: isAlreadyOnRoute
                        ? `Already on route '${route.name}' (${route.path})`
                        : `Matched playbook route '${route.name}' (${route.path}) from user intent`
                };
            }
        }
    }
    // 2b. If query references Problem Statements (e.g. "search for PS 171", "find PS 171", "PS 171")
    // and current page is NOT problem-statements, route navigation to problem statements page is required first!
    const mentionsProblemStatements = normQuery.includes('problem statement') ||
        normQuery.includes('problem statements') ||
        /\bps\s*\d+\b/i.test(userQuery) ||
        (queryTokens.includes('ps') && queryTokens.some((t) => /\d+/.test(t)));
    if (mentionsProblemStatements && currentUrl && !currentUrl.includes('problem-statement')) {
        const psRoute = playbook.routes.find((r) => r.name === 'problemStatements');
        if (psRoute) {
            return {
                playbookName: playbook.name,
                matchedIntent: 'navigate',
                confidence: 0.96,
                targetUrl: `https://${playbook.domain}${psRoute.path}`,
                targetPhrase: 'Problem Statements',
                targetRole: 'link',
                rationale: `Query references Problem Statements while currently on '${currentUrl}'. Navigating to Problem Statements page first.`
            };
        }
    }
    // 3. Check for landmark match (e.g. "click know your spoc", "sih login")
    for (const landmark of playbook.landmarks) {
        const allAliases = [landmark.phrase, ...landmark.aliases];
        const match = allAliases.some((alias) => {
            const aliasNorm = normalizeSemanticText(alias);
            if (normQuery.includes(aliasNorm))
                return true;
            const aliasTokens = tokenizeSemanticText(aliasNorm);
            return aliasTokens.length > 0 && aliasTokens.every((at) => queryTokens.includes(at) || queryTokens.some((qt) => isFuzzyTokenMatch(at, qt)));
        });
        if (match) {
            if (landmark.role === 'input' || landmark.intentAction === 'type') {
                return {
                    playbookName: playbook.name,
                    matchedIntent: 'fill_field',
                    confidence: 0.92,
                    targetPhrase: landmark.phrase,
                    targetRole: landmark.role,
                    rationale: `Matched landmark '${landmark.phrase}' (${landmark.description}) for input/search intent`
                };
            }
            return {
                playbookName: playbook.name,
                matchedIntent: 'click_landmark',
                confidence: 0.94,
                targetPhrase: landmark.phrase,
                targetRole: landmark.role,
                rationale: `Matched landmark '${landmark.phrase}' (${landmark.description}) in playbook for domain '${playbook.domain}'`
            };
        }
    }
    // 4. Secondary route check for queries without explicit "go to"
    for (const route of playbook.routes) {
        const match = route.matchKeywords.some((kw) => {
            const kwNorm = normalizeSemanticText(kw);
            if (normQuery.includes(kwNorm))
                return true;
            const kwTokens = tokenizeSemanticText(kwNorm);
            return kwTokens.length > 0 && kwTokens.every((kt) => queryTokens.includes(kt) || queryTokens.some((qt) => isFuzzyTokenMatch(kt, qt)));
        });
        if (match) {
            const targetUrl = `https://${playbook.domain}${route.path}`;
            const isAlreadyOnRoute = currentUrl ? currentUrl.includes(route.path) : false;
            return {
                playbookName: playbook.name,
                matchedIntent: isAlreadyOnRoute ? 'none' : 'navigate',
                confidence: 0.85,
                targetUrl,
                rationale: isAlreadyOnRoute
                    ? `Already on route '${route.name}' (${route.path})`
                    : `Matched playbook route '${route.name}' (${route.path}) from user intent`
            };
        }
    }
    return {
        playbookName: playbook.name,
        matchedIntent: 'none',
        confidence: 0.2,
        rationale: 'No domain playbook route or landmark matched query tokens directly'
    };
}
/**
 * Attempts to extract a metric value from text using a playbook metric rule.
 */
export function extractMetricsWithPlaybook(textContext, metricRule) {
    if (!textContext || !metricRule)
        return undefined;
    const textLower = textContext.toLowerCase();
    const pattern = new RegExp(metricRule.valuePattern, 'g');
    // 1. Anchor search to keyword first (e.g. "Total Submissions: 12,850")
    for (const kw of metricRule.labelKeywords) {
        const kwLower = kw.toLowerCase();
        let kwIndex = textLower.indexOf(kwLower);
        while (kwIndex !== -1) {
            const start = Math.max(0, kwIndex - 15);
            const end = Math.min(textContext.length, kwIndex + kwLower.length + 45);
            const snippet = textContext.slice(start, end);
            const afterSnippet = textContext.slice(kwIndex + kwLower.length, end);
            const afterMatch = afterSnippet.match(new RegExp(metricRule.valuePattern));
            if (afterMatch) {
                return {
                    value: afterMatch[0],
                    label: metricRule.metricId
                };
            }
            const snippetMatches = [...snippet.matchAll(pattern)];
            if (snippetMatches.length > 0) {
                return {
                    value: snippetMatches[0][0],
                    label: metricRule.metricId
                };
            }
            kwIndex = textLower.indexOf(kwLower, kwIndex + 1);
        }
    }
    // 2. Secondary fallback: tight 25-character window around matches
    const matches = [...textContext.matchAll(pattern)];
    for (const match of matches) {
        const matchIndex = match.index ?? -1;
        if (matchIndex >= 0) {
            const surrounding = textLower.slice(Math.max(0, matchIndex - 25), Math.min(textLower.length, matchIndex + match[0].length + 25));
            const hasKeyword = metricRule.labelKeywords.some((kw) => surrounding.includes(kw.toLowerCase()));
            if (hasKeyword) {
                return {
                    value: match[0],
                    label: metricRule.metricId
                };
            }
        }
    }
    return undefined;
}
/**
 * Cleanly extracts search target text from a search directive.
 * E.g. "search for PS 171" -> "PS 171"
 *      "search Chinmaya in search box" -> "Chinmaya"
 */
export function extractSearchQueryFromGoal(goal) {
    let q = (goal || '').trim();
    q = q.replace(/^(?:please\s+|kindly\s+|can\s+you\s+)?(?:search(?:\s+for)?|find|look\s+for|filter(?:\s+by)?|query|type\s+in\s+search(?:\s+box)?)\s+/i, '');
    q = q.replace(/\s+(?:in|into|on)\s+(?:the\s+)?(?:search(?:\s+box|\s+bar|\s+input)?|table|page)$/i, '');
    return q.trim();
}
//# sourceMappingURL=domain-playbooks.js.map