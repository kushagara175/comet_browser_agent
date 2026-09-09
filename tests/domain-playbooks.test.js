import test from 'node:test';
import assert from 'node:assert/strict';
import {
  lookupDomainPlaybook,
  resolvePlaybookIntent,
  extractMetricsWithPlaybook,
  SIH_PLAYBOOK
} from '../packages/protocol/dist/index.js';

test('Domain Playbooks: lookupDomainPlaybook matches sih.gov.in hostnames and aliases', () => {
  assert.equal(lookupDomainPlaybook('https://sih.gov.in/signin')?.domain, 'sih.gov.in');
  assert.equal(lookupDomainPlaybook('https://www.sih.gov.in/problem-statements')?.domain, 'sih.gov.in');
  assert.equal(lookupDomainPlaybook('sih.gov.in')?.domain, 'sih.gov.in');
  assert.equal(lookupDomainPlaybook('https://portal.sih.gov.in/dashboard')?.domain, 'sih.gov.in');

  // Unknown domain returns undefined
  assert.equal(lookupDomainPlaybook('https://unknown-portal.org/page'), undefined);
  assert.equal(lookupDomainPlaybook(''), undefined);
});

test('Domain Playbooks: resolvePlaybookIntent grounds SPOC landmark', () => {
  const res = resolvePlaybookIntent(SIH_PLAYBOOK, 'find college SPOC details', 'https://sih.gov.in');
  assert.equal(res.matchedIntent, 'click_landmark');
  assert.equal(res.targetPhrase, 'Know Your SPOC');
  assert.equal(res.targetRole, 'link');
  assert.ok(res.confidence >= 0.9);
});

test('Domain Playbooks: resolvePlaybookIntent grounds SIH Login landmark', () => {
  const res = resolvePlaybookIntent(SIH_PLAYBOOK, 'click sih login', 'https://sih.gov.in');
  assert.equal(res.matchedIntent, 'click_landmark');
  assert.equal(res.targetPhrase, 'SIH Login');
  assert.ok(res.confidence >= 0.9);
});

test('Domain Playbooks: resolvePlaybookIntent grounds Problem Statement search input', () => {
  const res = resolvePlaybookIntent(SIH_PLAYBOOK, 'search for PS 171', 'https://sih.gov.in/problem-statements');
  assert.equal(res.matchedIntent, 'fill_field');
  assert.equal(res.targetPhrase, 'Search Problem Statement');
  assert.equal(res.targetRole, 'input');
});

test('Domain Playbooks: resolvePlaybookIntent grounds route navigation to problem statements', () => {
  const res = resolvePlaybookIntent(SIH_PLAYBOOK, 'go to problem statements', 'https://sih.gov.in');
  assert.equal(res.matchedIntent, 'navigate');
  assert.equal(res.targetUrl, 'https://sih.gov.in/problem-statements');
});

test('Domain Playbooks: resolvePlaybookIntent identifies current route and avoids duplicate navigation', () => {
  const res = resolvePlaybookIntent(SIH_PLAYBOOK, 'go to problem statements', 'https://sih.gov.in/problem-statements');
  // Already on route
  assert.equal(res.matchedIntent, 'none');
  assert.ok(res.rationale.includes('Already on route'));
});

test('Domain Playbooks: extractMetricsWithPlaybook extracts submission numbers from context text', () => {
  const rule = SIH_PLAYBOOK.metricsRules.find(r => r.metricId === 'total_submissions');
  assert.ok(rule, 'Submission rule must exist in SIH playbook');

  const text = 'Dashboard Overview: Smart India Hackathon 2026. Total Submissions: 12,850 completed nominations.';
  const extracted = extractMetricsWithPlaybook(text, rule);

  assert.ok(extracted, 'Should extract metric match');
  assert.equal(extracted.value, '12,850');
  assert.equal(extracted.label, 'total_submissions');
});

test('Domain Playbooks: extractSearchQueryFromGoal extracts clean target query', async () => {
  const { extractSearchQueryFromGoal } = await import('../packages/protocol/dist/index.js');
  assert.equal(extractSearchQueryFromGoal('search for PS 171'), 'PS 171');
  assert.equal(extractSearchQueryFromGoal('find PS 171'), 'PS 171');
  assert.equal(extractSearchQueryFromGoal('filter by PS 171'), 'PS 171');
  assert.equal(extractSearchQueryFromGoal('search Chinmaya in search box'), 'Chinmaya');
  assert.equal(extractSearchQueryFromGoal('please search for AI in the search bar'), 'AI');
});

test('Domain Playbooks: Cross-route navigation from know-your-spoc to problem-statements for PS query', () => {
  const res = resolvePlaybookIntent(SIH_PLAYBOOK, 'search for PS 171', 'https://sih.gov.in/know-your-spoc');
  assert.equal(res.matchedIntent, 'navigate');
  assert.equal(res.targetUrl, 'https://sih.gov.in/problem-statements');
  assert.equal(res.targetPhrase, 'Problem Statements');
  assert.ok(res.confidence >= 0.95);
});

test('Domain Playbooks: RunCoordinator executes cross-page navigation from know-your-spoc, searches PS 171, and finishes locally', async () => {
  const { RunCoordinator } = await import('../apps/extension/dist/background/coordinator.js');

  let currentUrl = 'https://sih.gov.in/know-your-spoc';
  const executedProposals = [];

  const knowYourSpocElements = [
    {
      localId: 'el_ps_link',
      role: 'link',
      sanitizedName: 'Problem Statements',
      coarseBounds: [0.1, 0.05, 0.2, 0.04],
      state: ['visible', 'enabled'],
      actionCapabilities: ['click']
    },
    {
      localId: 'el_spoc_input',
      role: 'input',
      sanitizedName: 'Search SPOC',
      coarseBounds: [0.1, 0.2, 0.3, 0.04],
      state: ['visible', 'enabled'],
      actionCapabilities: ['type']
    }
  ];

  const problemStatementsElements = [
    {
      localId: 'el_ps_search',
      role: 'input',
      sanitizedName: 'Search Problem Statement',
      coarseBounds: [0.1, 0.2, 0.4, 0.05],
      state: ['visible', 'enabled'],
      actionCapabilities: ['type']
    }
  ];

  const browser = {
    async captureVisibleTab() {
      return 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==';
    },
    async getActiveTab() {
      return { id: 1, url: currentUrl, title: 'Smart India Hackathon' };
    },
    async sendMessageToTab(tabId, msg) {
      if (msg.type === 'EXTRACT_DOM_SNAPSHOT') {
        const elements = currentUrl.includes('problem-statement') ? problemStatementsElements : knowYourSpocElements;
        return {
          success: true,
          captureId: msg.captureId || 'cap_1',
          snapshot: { elements }
        };
      }
      if (msg.type === 'EXECUTE_ACTION') {
        executedProposals.push(msg.proposal);
        if (msg.proposal.targetLocalId === 'el_ps_link') {
          currentUrl = 'https://sih.gov.in/problem-statements';
        }
        return {
          success: true,
          actionId: msg.proposal.actionId,
          semanticOutcomeVerified: true
        };
      }
      return { success: true };
    },
    async runInSanitizerHost(req) {
      const elements = currentUrl.includes('problem-statement') ? problemStatementsElements : knowYourSpocElements;
      return {
        _brand: 'SanitizedContext_Verified',
        protocolVersion: '1.0',
        runId: 'run_ps_e2e',
        captureId: req.rawCapture.captureId,
        goal: req.goal,
        sanitizedScreenshotDataUrl: req.rawCapture.rawScreenshotDataUrl,
        elements,
        pageState: { title: 'Smart India Hackathon', url: currentUrl, viewport: [1280, 720] },
        maskCount: 0,
        payloadDigestSha256: 'sha256_mock',
        timestamp: Date.now()
      };
    }
  };

  const httpClient = {
    async requestReasoningAction() {
      throw new Error('Should resolve locally via playbook without server calls');
    }
  };

  const coordinator = new RunCoordinator(browser, httpClient, undefined, { defaultMaxSteps: 5 });
  const result = await coordinator.startRun('search for PS 171');

  assert.equal(result.success, true);
  assert.equal(result.state, 'complete');
  assert.equal(executedProposals.length, 2);

  // Step 1: Navigated to Problem Statements
  assert.equal(executedProposals[0].kind, 'click');
  assert.equal(executedProposals[0].targetLocalId, 'el_ps_link');

  // Step 2: Grounded and typed PS 171 into Problem Statement search field
  assert.equal(executedProposals[1].kind, 'type');
  assert.equal(executedProposals[1].targetLocalId, 'el_ps_search');
  assert.equal(executedProposals[1].textToType, 'PS 171');
  assert.equal(executedProposals[1].pressEnter, true);
});

test('Domain Playbooks: Recognizes sih2026PS as Problem Statements route and grounds search directly', () => {
  const res = resolvePlaybookIntent(SIH_PLAYBOOK, 'search for PS 171', 'https://sih.gov.in/sih2026PS');
  assert.equal(res.matchedIntent, 'fill_field');
  assert.equal(res.targetPhrase, 'Search Problem Statement');
});

test('Domain Playbooks: RunCoordinator executes DataTable search directly on sih2026PS without loop', async () => {
  const { RunCoordinator } = await import('../apps/extension/dist/background/coordinator.js');

  const currentUrl = 'https://sih.gov.in/sih2026PS';
  const executedProposals = [];

  const elements = [
    {
      localId: 'el_ps_nav',
      role: 'link',
      sanitizedName: 'PROBLEM STATEMENTS',
      coarseBounds: [0.2, 0.05, 0.15, 0.04],
      state: ['visible', 'enabled'],
      actionCapabilities: ['click']
    },
    {
      localId: 'el_datatable_search',
      role: 'input',
      sanitizedName: 'Search:',
      coarseBounds: [0.7, 0.45, 0.2, 0.04],
      state: ['visible', 'enabled'],
      actionCapabilities: ['type', 'click']
    }
  ];

  const browser = {
    async captureVisibleTab() {
      return 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==';
    },
    async getActiveTab() {
      return { id: 1, url: currentUrl, title: 'Smart India Hackathon' };
    },
    async sendMessageToTab(tabId, msg) {
      if (msg.type === 'EXTRACT_DOM_SNAPSHOT') {
        return { success: true, captureId: msg.captureId || 'cap_ps', snapshot: { elements } };
      }
      if (msg.type === 'EXECUTE_ACTION') {
        executedProposals.push(msg.proposal);
        return { success: true, actionId: msg.proposal.actionId, semanticOutcomeVerified: true };
      }
      return { success: true };
    },
    async runInSanitizerHost(req) {
      return {
        _brand: 'SanitizedContext_Verified',
        protocolVersion: '1.0',
        runId: 'run_direct_ps',
        captureId: req.rawCapture.captureId,
        goal: req.goal,
        sanitizedScreenshotDataUrl: req.rawCapture.rawScreenshotDataUrl,
        elements,
        pageState: { title: 'Smart India Hackathon', url: currentUrl, viewport: [1280, 720] },
        maskCount: 0,
        payloadDigestSha256: 'sha256_mock',
        timestamp: Date.now()
      };
    }
  };

  const httpClient = {
    async requestReasoningAction() {
      throw new Error('Should resolve locally via playbook without server calls');
    }
  };

  const coordinator = new RunCoordinator(browser, httpClient, undefined, { defaultMaxSteps: 5 });
  const result = await coordinator.startRun('search for PS 171');

  assert.equal(result.success, true);
  assert.equal(result.state, 'complete');
  assert.equal(executedProposals.length, 1);
  assert.equal(executedProposals[0].kind, 'type');
  assert.equal(executedProposals[0].targetLocalId, 'el_datatable_search');
  assert.equal(executedProposals[0].textToType, 'PS 171');
  assert.equal(executedProposals[0].pressEnter, true);
});

test('Domain Playbooks: lookupDomainPlaybook matches GitHub, YouTube, Reddit, DuckDuckGo, Google, and Wikipedia', async () => {
  const {
    lookupDomainPlaybook,
    GITHUB_PLAYBOOK,
    YOUTUBE_PLAYBOOK,
    REDDIT_PLAYBOOK,
    DUCKDUCKGO_PLAYBOOK,
    GOOGLE_PLAYBOOK,
    WIKIPEDIA_PLAYBOOK
  } = await import('../packages/protocol/dist/index.js');

  assert.equal(lookupDomainPlaybook('https://github.com/browser-use/browser-harness')?.domain, 'github.com');
  assert.equal(lookupDomainPlaybook('https://www.youtube.com/watch?v=123')?.domain, 'youtube.com');
  assert.equal(lookupDomainPlaybook('https://reddit.com/r/technology')?.domain, 'reddit.com');
  assert.equal(lookupDomainPlaybook('https://duckduckgo.com/?q=test')?.domain, 'duckduckgo.com');
  assert.equal(lookupDomainPlaybook('https://www.google.com/search?q=test')?.domain, 'google.com');
  assert.equal(lookupDomainPlaybook('https://en.wikipedia.org/wiki/Artificial_intelligence')?.domain, 'wikipedia.org');
});

test('Domain Playbooks: GitHub playbook navigation, landmarks, and metrics', async () => {
  const { GITHUB_PLAYBOOK, resolvePlaybookIntent, extractMetricsWithPlaybook } = await import('../packages/protocol/dist/index.js');

  // Route navigation
  const navRes = resolvePlaybookIntent(GITHUB_PLAYBOOK, 'go to trending repositories', 'https://github.com');
  assert.equal(navRes.matchedIntent, 'navigate');
  assert.equal(navRes.targetUrl, 'https://github.com/trending');

  // Landmark match
  const searchRes = resolvePlaybookIntent(GITHUB_PLAYBOOK, 'search for browser-use', 'https://github.com');
  assert.equal(searchRes.matchedIntent, 'fill_field');
  assert.ok(searchRes.confidence >= 0.9);

  // Metric extraction
  const starsRule = GITHUB_PLAYBOOK.metricsRules.find(r => r.metricId === 'stars');
  assert.ok(starsRule);
  const metric = extractMetricsWithPlaybook('Repository Stats: 15.2k stars, 1.4k forks', starsRule);
  assert.ok(metric);
  assert.equal(metric.value, '15.2k');
});

test('Domain Playbooks: YouTube playbook search and views extraction', async () => {
  const { YOUTUBE_PLAYBOOK, resolvePlaybookIntent, extractMetricsWithPlaybook } = await import('../packages/protocol/dist/index.js');

  const searchRes = resolvePlaybookIntent(YOUTUBE_PLAYBOOK, 'search for space launch live', 'https://youtube.com');
  assert.equal(searchRes.matchedIntent, 'fill_field');
  assert.equal(searchRes.targetPhrase, 'Search');

  const viewsRule = YOUTUBE_PLAYBOOK.metricsRules.find(r => r.metricId === 'views');
  assert.ok(viewsRule);
  const metric = extractMetricsWithPlaybook('ISRO Chandrayaan Mission: 4.8M views streamed 2 days ago', viewsRule);
  assert.ok(metric);
  assert.ok(metric.value.includes('4.8M'));
});

test('Domain Playbooks: Reddit and Search engines (DuckDuckGo, Google, Wikipedia)', async () => {
  const {
    REDDIT_PLAYBOOK,
    DUCKDUCKGO_PLAYBOOK,
    GOOGLE_PLAYBOOK,
    WIKIPEDIA_PLAYBOOK,
    resolvePlaybookIntent,
    extractMetricsWithPlaybook
  } = await import('../packages/protocol/dist/index.js');

  // Reddit
  const redditRes = resolvePlaybookIntent(REDDIT_PLAYBOOK, 'search for open source', 'https://reddit.com');
  assert.equal(redditRes.matchedIntent, 'fill_field');

  // DuckDuckGo
  const ddgRes = resolvePlaybookIntent(DUCKDUCKGO_PLAYBOOK, 'search without being tracked', 'https://duckduckgo.com');
  assert.equal(ddgRes.matchedIntent, 'fill_field');

  // Google
  const googleRes = resolvePlaybookIntent(GOOGLE_PLAYBOOK, 'google search for privacy agent', 'https://google.com');
  assert.ok(googleRes.matchedIntent === 'fill_field' || googleRes.matchedIntent === 'click_landmark');

  // Wikipedia
  const wikiRule = WIKIPEDIA_PLAYBOOK.metricsRules.find(r => r.metricId === 'references_count');
  assert.ok(wikiRule);
  const metric = extractMetricsWithPlaybook('References: 142 citations cited in this article', wikiRule);
  assert.ok(metric);
  assert.equal(metric.value, '142');
});



