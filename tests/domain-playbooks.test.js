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

test('Domain Playbooks: ISRO_PLAYBOOK matches isro.gov.in hostnames and resolves intents', async () => {
  const {
    ISRO_PLAYBOOK,
    lookupDomainPlaybook,
    resolvePlaybookIntent,
    extractMetricsWithPlaybook
  } = await import('../packages/protocol/dist/index.js');

  assert.equal(lookupDomainPlaybook('https://isro.gov.in')?.domain, 'www.isro.gov.in');
  assert.equal(lookupDomainPlaybook('https://www.isro.gov.in/Missions.html')?.domain, 'www.isro.gov.in');
  assert.equal(lookupDomainPlaybook('https://careers.isro.gov.in')?.domain, 'www.isro.gov.in');

  // Search missions intent -> fill_field targeting Search ISRO
  const searchRes = resolvePlaybookIntent(ISRO_PLAYBOOK, 'search for chandrayaan missions', 'https://www.isro.gov.in');
  assert.equal(searchRes.matchedIntent, 'fill_field');
  assert.equal(searchRes.targetPhrase, 'Search ISRO');
  assert.equal(searchRes.targetRole, 'input');

  // Launchers navigation -> click_landmark targeting Launchers
  const launcherRes = resolvePlaybookIntent(ISRO_PLAYBOOK, 'view launch vehicles and rockets', 'https://www.isro.gov.in');
  assert.equal(launcherRes.matchedIntent, 'click_landmark');
  assert.equal(launcherRes.targetPhrase, 'Launchers');

  // Metric extraction for spacecraft missions
  const metricRule = ISRO_PLAYBOOK.metricsRules.find(r => r.metricId === 'spacecraft_missions');
  assert.ok(metricRule);
  const metric = extractMetricsWithPlaybook('Spacecraft Missions: 125 successful spacecraft launched.', metricRule);
  assert.ok(metric);
  assert.equal(metric.value, '125');
  assert.equal(metric.label, 'spacecraft_missions');
});

test('Domain Playbooks: extractTargetUrlFromGoal correctly extracts navigation targets from natural language goals', async () => {
  const { extractTargetUrlFromGoal } = await import('../packages/protocol/dist/index.js');

  // Explicit URLs
  assert.equal(extractTargetUrlFromGoal('go to https://sih.gov.in/signin'), 'https://sih.gov.in/signin');
  assert.equal(extractTargetUrlFromGoal('open http://localhost:4500 and verify login'), 'http://localhost:4500');

  // Direct domains (isro canonicalized to www.isro.gov.in due to DNS requirements)
  assert.equal(extractTargetUrlFromGoal('open sih.gov.in and search isro'), 'https://sih.gov.in');
  assert.equal(extractTargetUrlFromGoal('go to isro.gov.in and search missions'), 'https://www.isro.gov.in');
  assert.equal(extractTargetUrlFromGoal('visit github.com'), 'https://github.com');

  // Contextual phrases ("in the isro website...")
  assert.equal(extractTargetUrlFromGoal('in the isro website find launch missions'), 'https://www.isro.gov.in');
  assert.equal(extractTargetUrlFromGoal('in sih website search for isro problem statement'), 'https://sih.gov.in');

  // Directive shortcuts ("open isro and search missions")
  assert.equal(extractTargetUrlFromGoal('open isro and search missions'), 'https://www.isro.gov.in');
  assert.equal(extractTargetUrlFromGoal('open sih and search PS 171'), 'https://sih.gov.in');
  assert.equal(extractTargetUrlFromGoal('open wikipedia and find quantum computing'), 'https://www.wikipedia.org');
  assert.equal(extractTargetUrlFromGoal("Go to wikipedia.org, search for 'Smart India Hackathon', and tell me when it was first launched and who organizes it"), 'https://www.wikipedia.org');
  assert.equal(extractTargetUrlFromGoal("Go to wikipedia, search for 'Smart India Hackathon', and tell me when it was first launched and who organizes it"), 'https://www.wikipedia.org');
});

test('Domain Playbooks: stripNavigationPrefixFromGoal strips leading navigation clauses with commas or conjunctions', async () => {
  const { stripNavigationPrefixFromGoal } = await import('../packages/protocol/dist/index.js');
  assert.equal(
    stripNavigationPrefixFromGoal("Go to wikipedia.org, search for 'Smart India Hackathon', and tell me when it was first launched and who organizes it"),
    "search for 'Smart India Hackathon', and tell me when it was first launched and who organizes it"
  );
  assert.equal(
    stripNavigationPrefixFromGoal("Go to wikipedia, search for 'Smart India Hackathon', and tell me when it was first launched and who organizes it"),
    "search for 'Smart India Hackathon', and tell me when it was first launched and who organizes it"
  );
  assert.equal(
    stripNavigationPrefixFromGoal("go to mosdac to check cyclone weather"),
    "check cyclone weather"
  );
});

test('Domain Playbooks: RunCoordinator auto-navigates from scratch on blank/restricted tab and completes goal', async () => {
  const { RunCoordinator } = await import('../apps/extension/dist/background/coordinator.js');

  let currentUrl = 'chrome://newtab';
  const navigatedUrls = [];
  const executedProposals = [];

  const isroPageElements = [
    {
      localId: 'el_isro_search',
      role: 'input',
      sanitizedName: 'Search ISRO',
      coarseBounds: [0.3, 0.1, 0.4, 0.05],
      state: ['visible', 'enabled'],
      actionCapabilities: ['type']
    },
    {
      localId: 'el_isro_missions',
      role: 'link',
      sanitizedName: 'Missions',
      coarseBounds: [0.1, 0.1, 0.15, 0.04],
      state: ['visible', 'enabled'],
      actionCapabilities: ['click']
    }
  ];

  const browser = {
    async captureVisibleTab() {
      return 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==';
    },
    async getActiveTab() {
      return { id: 1, url: currentUrl, title: currentUrl.includes('isro') ? 'ISRO Official Portal' : 'New Tab' };
    },
    async navigateTab(tabId, url) {
      navigatedUrls.push(url);
      currentUrl = url;
    },
    async sendMessageToTab(tabId, msg) {
      if (msg.type === 'EXTRACT_DOM_SNAPSHOT') {
        return {
          success: true,
          captureId: msg.captureId || 'cap_1',
          snapshot: { elements: isroPageElements }
        };
      }
      if (msg.type === 'EXECUTE_ACTION') {
        executedProposals.push(msg.proposal);
        return {
          success: true,
          actionId: msg.proposal.actionId,
          semanticOutcomeVerified: true
        };
      }
      return { success: true };
    },
    async runInSanitizerHost(req) {
      return {
        _brand: 'SanitizedContext_Verified',
        protocolVersion: '1.0',
        runId: 'run_scratch_isro',
        captureId: req.rawCapture.captureId,
        goal: req.goal,
        sanitizedScreenshotDataUrl: req.rawCapture.rawScreenshotDataUrl,
        elements: isroPageElements,
        pageState: { title: 'ISRO Official Portal', url: currentUrl, viewport: [1280, 720] },
        redactionManifest: { totalRedactions: 0, categoriesRedacted: [] },
        payloadDigestSha256: 'digest_mock'
      };
    }
  };

  const coordinator = new RunCoordinator(browser);
  const result = await coordinator.startRun('open isro.gov.in and search missions', { maxSteps: 5 });

  // Verification
  assert.ok(result.success, `Run should succeed: ${result.error || result.message}`);
  assert.equal(navigatedUrls.length, 1);
  assert.equal(navigatedUrls[0], 'https://www.isro.gov.in');
  assert.ok(executedProposals.length >= 1);
  const searchAction = executedProposals.find(p => p.kind === 'type');
  assert.ok(searchAction, 'Should execute type action into Search ISRO input');
  assert.equal(searchAction.targetLocalId, 'el_isro_search');
  assert.equal(searchAction.textToType, 'missions');
});

test('Domain Playbooks: Earth Observation playbooks (Bhuvan, MOSDAC, VEDAS, Bhoonidhi) resolve correctly', async () => {
  const {
    lookupDomainPlaybook,
    resolvePlaybookIntent,
    extractTargetUrlFromGoal,
    BHUVAN_PLAYBOOK,
    MOSDAC_PLAYBOOK,
    VEDAS_PLAYBOOK,
    BHOONIDHI_PLAYBOOK
  } = await import('../packages/protocol/dist/index.js');

  // 1. Lookup
  assert.equal(lookupDomainPlaybook('https://bhuvan.nrsc.gov.in')?.domain, 'bhuvan.nrsc.gov.in');
  assert.equal(lookupDomainPlaybook('https://mosdac.gov.in/live')?.domain, 'mosdac.gov.in');
  assert.equal(lookupDomainPlaybook('https://vedas.sac.gov.in/solar')?.domain, 'vedas.sac.gov.in');
  assert.equal(lookupDomainPlaybook('https://bhoonidhi.nrsc.gov.in')?.domain, 'bhoonidhi.nrsc.gov.in');

  // 2. Goal extraction
  assert.equal(extractTargetUrlFromGoal('open bhuvan and explore earth observation'), 'https://bhuvan.nrsc.gov.in');
  assert.equal(extractTargetUrlFromGoal('go to mosdac to check cyclone weather'), 'https://mosdac.gov.in');
  assert.equal(extractTargetUrlFromGoal('visit vedas for solar rooftop potential'), 'https://vedas.sac.gov.in');
  assert.equal(extractTargetUrlFromGoal('in the bhoonidhi portal search satellite data'), 'https://bhoonidhi.nrsc.gov.in');

  // 3. Bhuvan resolution (route navigation & landmark click)
  const bhuvanNavRes = resolvePlaybookIntent(BHUVAN_PLAYBOOK, 'open 2d 3d map viewer', 'https://bhuvan.nrsc.gov.in');
  assert.equal(bhuvanNavRes.matchedIntent, 'navigate');
  assert.equal(bhuvanNavRes.targetUrl, 'https://bhuvan.nrsc.gov.in/bhuvan_geoportal.php');

  const bhuvanLandmarkRes = resolvePlaybookIntent(BHUVAN_PLAYBOOK, 'explore 2d 3d map', 'https://bhuvan.nrsc.gov.in/bhuvan_geoportal.php');
  assert.equal(bhuvanLandmarkRes.matchedIntent, 'click_landmark');
  assert.equal(bhuvanLandmarkRes.targetPhrase, '2D / 3D Map');

  // 4. MOSDAC resolution
  const mosdacRes = resolvePlaybookIntent(MOSDAC_PLAYBOOK, 'view live satellite weather imagery', 'https://mosdac.gov.in');
  assert.equal(mosdacRes.matchedIntent, 'click_landmark');
  assert.equal(mosdacRes.targetPhrase, 'Weather Imagery');

  // 5. VEDAS resolution
  const vedasRes = resolvePlaybookIntent(VEDAS_PLAYBOOK, 'calculate solar rooftop potential', 'https://vedas.sac.gov.in');
  assert.equal(vedasRes.matchedIntent, 'click_landmark');
  assert.equal(vedasRes.targetPhrase, 'Solar Potential');

  // 6. Bhoonidhi resolution
  const bhoonidhiRes = resolvePlaybookIntent(BHOONIDHI_PLAYBOOK, 'search satellite data products', 'https://bhoonidhi.nrsc.gov.in');
  assert.equal(bhoonidhiRes.matchedIntent, 'fill_field');
  assert.equal(bhoonidhiRes.targetPhrase, 'Search Products');
});

test('Domain Playbooks: Coordinator drills into search results when exploring ISRO missions', async () => {
  const { RunCoordinator } = await import('../apps/extension/dist/background/coordinator.js');

  let currentUrl = 'https://www.isro.gov.in/search.html#gsc.q=missions.';
  const executedProposals = [];

  const searchResultsElements = [
    {
      localId: 'el_search_input',
      role: 'input',
      sanitizedName: 'Search ISRO',
      coarseBounds: [0.1, 0.1, 0.4, 0.05],
      state: ['visible', 'enabled'],
      actionCapabilities: ['type']
    },
    {
      localId: 'el_result_1',
      role: 'link',
      sanitizedName: 'Missions accomplished - ISRO',
      coarseBounds: [0.1, 0.25, 0.6, 0.06],
      state: ['visible', 'enabled'],
      actionCapabilities: ['click']
    }
  ];

  const browser = {
    activeTabId: 1,
    async getActiveTab() {
      return { id: 1, url: currentUrl, title: 'ISRO Search' };
    },
    async navigateTab(tabId, url) {
      currentUrl = url;
      return { id: tabId, url, title: 'ISRO Search' };
    },
    async captureVisibleTab() {
      return 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==';
    },
    async sendMessageToTab(tabId, msg) {
      if (msg.type === 'EXTRACT_DOM_SNAPSHOT') {
        return {
          success: true,
          captureId: msg.captureId || 'cap_1',
          snapshot: { elements: searchResultsElements }
        };
      }
      if (msg.type === 'EXECUTE_ACTION') {
        executedProposals.push(msg.proposal);
        return {
          success: true,
          actionId: msg.proposal.actionId,
          semanticOutcomeVerified: true
        };
      }
      return { success: true };
    },
    async runInSanitizerHost(req) {
      return {
        _brand: 'SanitizedContext_Verified',
        protocolVersion: '1.0',
        runId: 'run_scratch_isro_drill',
        captureId: req.rawCapture.captureId,
        goal: req.goal,
        sanitizedScreenshotDataUrl: req.rawCapture.rawScreenshotDataUrl,
        elements: searchResultsElements,
        pageState: { title: 'ISRO Search', url: currentUrl, viewport: [1280, 720] },
        redactionManifest: { totalRedactions: 0, categoriesRedacted: [] },
        payloadDigestSha256: 'digest_mock'
      };
    }
  };

  const coordinator = new RunCoordinator(browser);
  // Simulate previous fill action in history
  coordinator['actionHistory'].push({
    actionId: 'act_playbook_fill_1_123',
    kind: 'type',
    targetLocalId: 'el_search_input',
    textToType: 'missions',
    confidence: 0.95,
    risk: 'safe',
    rationale: 'Search query typed'
  });

  const result = await coordinator.startRun('scour every single corner and explore isro missions', { maxSteps: 3 });
  assert.ok(result.success, `Run should succeed: ${result.error || result.message}`);
  const clickAction = executedProposals.find(p => p.kind === 'click');
  assert.ok(clickAction, 'Should click on top search result');
  assert.equal(clickAction.targetLocalId, 'el_result_1');
});





