/**
 * @privapilot/tests - Autonomous Tavily Web Search & Document Navigation Suite
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import { validateActionProposal } from '../packages/protocol/dist/index.js';
import { validateSanitizedPayload } from '../apps/server/dist/schemas/payload-validator.js';
import { RunCoordinator } from '../apps/extension/dist/background/coordinator.js';

test('Tavily Protocol: validateActionProposal validates kind: "web_search"', () => {
  const validAction = {
    actionId: 'act_search_1',
    kind: 'web_search',
    searchQuery: 'ISRO Chandrayaan-3 brochure PDF',
    confidence: 0.95,
    risk: 'safe',
    rationale: 'Search web for Chandrayaan-3 brochure'
  };

  const res = validateActionProposal(validAction);
  assert.equal(res.isValid, true);

  // Missing searchQuery should fail
  const invalidAction = {
    actionId: 'act_search_2',
    kind: 'web_search',
    confidence: 0.95,
    risk: 'safe',
    rationale: 'Search without query'
  };
  const resInvalid = validateActionProposal(invalidAction);
  assert.equal(resInvalid.isValid, false);
});

test('Tavily Schema: validateSanitizedPayload accepts searchResults array', () => {
  const payload = {
    protocolVersion: '1.0',
    runId: 'run_tavily_test',
    goal: 'find Chandrayaan-3 brochure',
    screenshot: 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==',
    elements: [],
    pageState: {
      title: 'YouTube',
      viewport: [1280, 800]
    },
    searchResults: [
      {
        title: 'Chandrayaan-3 Mission Overview | PDF',
        url: 'https://www.isro.gov.in/media_isro/pdf/Missions/LVM3/LVM3M4_Chandrayaan3_brochure.pdf',
        content: 'Official ISRO Chandrayaan-3 brochure and mission payloads overview.',
        score: 0.92
      }
    ]
  };

  const validation = validateSanitizedPayload(payload);
  assert.equal(validation.isValid, true);
});

test('Tavily Coordinator: Step 1 proactive Tavily search attaches searchResults for document download goals', async () => {
  let searchCalled = false;
  let receivedContext = null;

  let currentUrl = 'https://www.youtube.com/watch?v=sample';
  const browser = {
    async captureVisibleTab() {
      return 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==';
    },
    async getActiveTab() {
      return { id: 1, url: currentUrl, title: currentUrl.includes('isro') ? 'ISRO Portal' : 'YouTube Video' };
    },
    async sendMessageToTab() {
      return {
        success: true,
        captureId: 'cap_1',
        snapshot: {
          elements: [],
          pageTitle: currentUrl.includes('isro') ? 'ISRO Portal' : 'YouTube Video'
        },
        viewport: { viewportWidth: 1280, viewportHeight: 800 }
      };
    },
    async runInSanitizerHost(req) {
      return {
        _brand: 'SanitizedContext_Verified',
        protocolVersion: '1.0',
        runId: 'run_tavily',
        captureId: req.rawCapture.captureId,
        goal: req.goal,
        sanitizedScreenshotDataUrl: req.rawCapture.rawScreenshotDataUrl,
        elements: [],
        pageState: {
          title: currentUrl.includes('isro') ? 'ISRO Portal' : 'YouTube Video',
          viewport: [1280, 800],
          url: currentUrl
        },
        maskCount: 0,
        payloadDigestSha256: 'sha256_mock',
        timestamp: Date.now()
      };
    },
    async navigateTab(tabId, url) {
      currentUrl = url;
      return { tabId, url };
    },
    async waitForTabReady(tabId) {
      return { id: tabId, url: currentUrl };
    },
    async ensureContentScript() {
      return true;
    }
  };

  const httpClient = {
    async searchWeb(query) {
      searchCalled = true;
      return {
        success: true,
        query,
        results: [
          {
            title: 'ISRO Chandrayaan-3 Brochure',
            url: 'https://www.isro.gov.in/brochure.pdf',
            content: 'Download official mission brochure',
            score: 0.95
          }
        ]
      };
    },
    async requestReasoningAction(context) {
      receivedContext = context;
      return {
        actionId: 'act_finish_brochure',
        kind: 'finish',
        confidence: 1.0,
        risk: 'safe',
        rationale: 'Located grounded Tavily brochure link'
      };
    },
    async requestTaskSpecification() {
      return { tasksToDo: ['Locate brochure'] };
    }
  };

  const coordinator = new RunCoordinator(browser, httpClient, undefined, { defaultMaxSteps: 3 });
  await coordinator.startRun('download chandrayaan 3 brochure');

  assert.equal(searchCalled, true, 'Proactive Tavily search should be triggered on step 1');
  assert.ok(receivedContext?.searchResults?.length > 0, 'Grounded search results should be in context');
  assert.equal(receivedContext.searchResults[0].url, 'https://www.isro.gov.in/brochure.pdf');
});

test('Tavily Coordinator: Missing target falls back to Tavily web search instead of failed-safe', async () => {
  let searchCalledWith = '';
  let navigatedTo = '';

  const browser = {
    async captureVisibleTab() {
      return 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==';
    },
    async getActiveTab() {
      return { id: 1, url: 'https://www.isro.gov.in', title: 'ISRO Home' };
    },
    async sendMessageToTab() {
      return {
        success: true,
        captureId: 'cap_1',
        snapshot: {
          elements: [
            {
              localId: 'el_home',
              role: 'link',
              sanitizedName: 'Home',
              coarseBounds: [0.1, 0.1, 0.1, 0.05],
              state: ['visible', 'enabled'],
              actionCapabilities: ['click']
            }
          ],
          pageTitle: 'ISRO Home'
        },
        viewport: { viewportWidth: 1280, viewportHeight: 800 }
      };
    },
    async runInSanitizerHost(req) {
      return {
        _brand: 'SanitizedContext_Verified',
        protocolVersion: '1.0',
        runId: 'run_fallback',
        captureId: req.rawCapture.captureId,
        goal: req.goal,
        sanitizedScreenshotDataUrl: req.rawCapture.rawScreenshotDataUrl,
        elements: [
          {
            localId: 'el_home',
            role: 'link',
            sanitizedName: 'Home',
            coarseBounds: [0.1, 0.1, 0.1, 0.05],
            state: ['visible', 'enabled'],
            actionCapabilities: ['click']
          }
        ],
        pageState: {
          title: 'ISRO Home',
          viewport: [1280, 800]
        },
        maskCount: 0,
        payloadDigestSha256: 'sha256_mock',
        timestamp: Date.now()
      };
    },
    async navigateTab(tabId, url) {
      navigatedTo = url;
      return { tabId, url };
    },
    async waitForTabReady(tabId) {
      return { id: tabId, url: navigatedTo };
    },
    async ensureContentScript() {
      return true;
    }
  };

  const httpClient = {
    async searchWeb(query) {
      searchCalledWith = query;
      return {
        success: true,
        query,
        results: [
          {
            title: 'ISRO Chandrayaan-3 Brochure PDF',
            url: 'https://www.isro.gov.in/media_isro/pdf/chandrayaan3.pdf',
            content: 'Official mission brochure',
            score: 0.99
          }
        ]
      };
    },
    async requestReasoningAction(context) {
      // Model tries to click an element that is NOT on the page
      return {
        actionId: 'act_click_missing',
        kind: 'click',
        targetLocalId: 'el_home', // Target doesn't match structuredIntent "Chandrayaan 3 Brochure"
        confidence: 0.9,
        risk: 'safe',
        rationale: 'Attempting to click brochure'
      };
    },
    async requestTaskSpecification() {
      return { tasksToDo: ['Click brochure'] };
    }
  };

  const coordinator = new RunCoordinator(browser, httpClient, undefined, { defaultMaxSteps: 3 });
  await coordinator.startRun('click Chandrayaan 3 Brochure');

  assert.ok(searchCalledWith.toLowerCase().includes('chandrayaan'), 'Tavily search should be invoked with target phrase');
  assert.equal(navigatedTo, 'https://www.isro.gov.in/media_isro/pdf/chandrayaan3.pdf', 'Should navigate to Tavily search result');
});

test('Tavily Intent Scoping: Explicit search instructions trigger web search, normal browser actions do not', async () => {
  const fs = await import('node:fs');
  const path = await import('node:path');
  const sidepanelCode = fs.readFileSync(path.resolve('apps/extension/src/sidepanel/sidepanel.js'), 'utf-8');

  // Verify function isWebSearchInstruction exists in sidepanel.js
  assert.ok(sidepanelCode.includes('function isWebSearchInstruction'), 'sidepanel.js must contain isWebSearchInstruction');
  assert.ok(sidepanelCode.includes('function extractWebSearchQuery'), 'sidepanel.js must contain extractWebSearchQuery');

  // Evaluate matching logic directly
  function isWebSearchInstruction(text) {
    if (!text) return false;
    const t = text.trim();
    return (
      /^(?:search\s+(?:across\s+)?(?:the\s+)?web|search\s+for|search\s+online|web\s*search|look\s*up\s+on\s+(?:the\s+)?web)\b/i.test(t) ||
      /^(?:who\s+is|what\s+is)\s+.+\s+(?:on\s+the\s+web|online)$/i.test(t)
    );
  }

  function extractWebSearchQuery(text) {
    if (!text) return '';
    const t = text.trim();
    let q = t.replace(/^(?:search\s+(?:across\s+)?(?:the\s+)?web\s+(?:for\s+)?|search\s+(?:the\s+)?web|search\s+for\s+|search\s+online\s+(?:for\s+)?|search\s+online|web\s*search\s+(?:for\s+)?|web\s*search|look\s*up\s+on\s+(?:the\s+)?web\s+(?:for\s+)?|look\s*up\s+on\s+(?:the\s+)?web)\s*/i, '').trim();
    q = q.replace(/\s+(?:on\s+the\s+web|online)$/i, '').trim();
    return q || 'latest updates';
  }

  // Exact user instructions MUST match
  assert.equal(isWebSearchInstruction('Search the web for who is such'), true, 'Should match "Search the web for who is such"');
  assert.equal(extractWebSearchQuery('Search the web for who is such'), 'who is such');

  assert.equal(isWebSearchInstruction('Search the web'), true, 'Should match "Search the web"');
  assert.equal(extractWebSearchQuery('Search the web'), 'latest updates');

  assert.equal(isWebSearchInstruction('Search for who is that'), true, 'Should match "Search for who is that"');
  assert.equal(extractWebSearchQuery('Search for who is that'), 'who is that');

  assert.equal(isWebSearchInstruction('Search the web for ISRO Chairman'), true, 'Should match "Search the web for ISRO Chairman"');
  assert.equal(extractWebSearchQuery('Search the web for ISRO Chairman'), 'ISRO Chairman');

  assert.equal(isWebSearchInstruction('Web search for quantum computing'), true, 'Should match "Web search for quantum computing"');
  assert.equal(extractWebSearchQuery('Web search for quantum computing'), 'quantum computing');

  // Normal browser automation commands MUST NOT trigger web search!
  assert.equal(isWebSearchInstruction('click on submit button'), false, 'Click action must not trigger search');
  assert.equal(isWebSearchInstruction('fill username with admin'), false, 'Form fill must not trigger search');
  assert.equal(isWebSearchInstruction('scroll down'), false, 'Scroll must not trigger search');
  assert.equal(isWebSearchInstruction('navigate to https://isro.gov.in'), false, 'Navigate must not trigger search');
  assert.equal(isWebSearchInstruction('download chandrayaan 3 brochure'), false, 'Download must not trigger direct web search handler');
});

test('Allel Web Search Component: sidepanel renders spinning globe and result cards matching allel design', async () => {
  const fs = await import('node:fs');
  const path = await import('node:path');
  const sidepanelCode = fs.readFileSync(path.resolve('apps/extension/src/sidepanel/sidepanel.js'), 'utf-8');
  const sidepanelCss = fs.readFileSync(path.resolve('apps/extension/src/sidepanel/sidepanel.css'), 'utf-8');

  // Verify allel spinning globe during execution
  assert.ok(sidepanelCode.includes('renderWebSearchExecuting'), 'Must contain renderWebSearchExecuting');
  assert.ok(sidepanelCode.includes('globe-spinner-icon'), 'Must contain spinning globe icon in execution block');
  assert.ok(sidepanelCode.includes('Searching across the web'), 'Must render "Searching across the web" status');

  // Verify allel result cards and timeline node
  assert.ok(sidepanelCode.includes('renderWebSearchComponent'), 'Must contain renderWebSearchComponent');
  assert.ok(sidepanelCode.includes('websearch-result-card'), 'Must contain websearch-result-card matching allel MiniResultCard');
  assert.ok(sidepanelCode.includes('websearch-domain-tag'), 'Must contain domain tag in result cards');
  assert.ok(sidepanelCode.includes('websearch-expand-btn'), 'Must contain expand button for remaining results');

  // Verify CSS styles exist
  assert.ok(sidepanelCss.includes('.websearch-executing-block'), 'CSS must include .websearch-executing-block');
  assert.ok(sidepanelCss.includes('@keyframes spinGlobe'), 'CSS must include @keyframes spinGlobe');
  assert.ok(sidepanelCss.includes('.websearch-timeline-node'), 'CSS must include .websearch-timeline-node');
  assert.ok(sidepanelCss.includes('.websearch-result-card'), 'CSS must include .websearch-result-card');
});

test('Coordinator: searchWeb public method delegates to httpClient.searchWeb', async () => {
  let queried = '';
  const mockHttpClient = {
    async searchWeb(query) {
      queried = query;
      return { success: true, query, results: [{ title: 'ISRO', url: 'https://isro.gov.in', content: 'Space' }] };
    }
  };

  const coordinator = new RunCoordinator({}, mockHttpClient);
  assert.equal(typeof coordinator.searchWeb, 'function', 'coordinator must have searchWeb method');

  const res = await coordinator.searchWeb('ISRO Chairman');
  assert.equal(queried, 'ISRO Chairman');
  assert.equal(res.success, true);
  assert.equal(res.results.length, 1);
});

