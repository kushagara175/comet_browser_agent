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
