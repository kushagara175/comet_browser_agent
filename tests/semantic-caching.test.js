import test from 'node:test';
import assert from 'node:assert/strict';
import {
  lookupDomainPlaybook,
  ISRO_PLAYBOOK,
  BHUVAN_PLAYBOOK
} from '../packages/protocol/dist/index.js';
import { VlmReasoningEngine } from '../apps/server/dist/engines/vlm-engine.js';
import { parseReasoningLines, formatReasoningIntoLinesHtml } from '../apps/extension/src/sidepanel/sidepanel.js';

test('Semantic Caching: lookupDomainPlaybook resolves ISRO and Bhuvan topologies', () => {
  const isroMatch = lookupDomainPlaybook('https://www.isro.gov.in/spacecraft_missions.html');
  assert.ok(isroMatch, 'ISRO playbook should match isro.gov.in');
  assert.equal(isroMatch.domain, 'www.isro.gov.in');
  assert.ok(isroMatch.routes.some(r => r.name === 'chandrayaan3'));
  assert.ok(isroMatch.landmarks.some(l => l.id === 'isro_search'));

  const bhuvanMatch = lookupDomainPlaybook('https://bhuvan.nrsc.gov.in/ngmaps');
  assert.ok(bhuvanMatch, 'Bhuvan playbook should match bhuvan.nrsc.gov.in');
  assert.equal(bhuvanMatch.domain, 'bhuvan.nrsc.gov.in');
  assert.ok(bhuvanMatch.routes.some(r => r.name === 'geoportal'));
  assert.ok(bhuvanMatch.landmarks.some(l => l.id === 'bhuvan_search'));
  assert.ok(bhuvanMatch.landmarks.some(l => l.id === 'open_data_download'));
});

test('Semantic Caching: VlmReasoningEngine injects verified site topology into prompt for ISRO', () => {
  const engine = new VlmReasoningEngine();
  const buildUserPrompt = engine['buildUserPrompt'].bind(engine);

  const payload = {
    goal: 'Find Chandrayaan-3 specifications on ISRO portal',
    pageState: {
      title: 'ISRO Official Portal',
      url: 'https://www.isro.gov.in/spacecraft_missions.html',
      domain: 'www.isro.gov.in',
      viewport: [1280, 800]
    },
    elements: [
      {
        localId: 'el_1',
        role: 'input',
        sanitizedName: 'Search ISRO',
        coarseBounds: [100, 10, 200, 30],
        actionCapabilities: ['type']
      }
    ]
  };

  const prompt = buildUserPrompt(payload);
  assert.ok(prompt.includes('Verified Semantic Site Topology for Indian Space Research Organisation'), 'Should inject ISRO topology block');
  assert.ok(prompt.includes('chandrayaan3: https://www.isro.gov.in/Chandrayaan3_New.html'), 'Should include Chandrayaan-3 canonical route');
  assert.ok(prompt.includes('safe threshold (0.85)'), 'Should instruct model about 0.85 safe threshold');
});

test('Semantic Caching: VlmReasoningEngine injects verified site topology into prompt for Bhuvan', () => {
  const engine = new VlmReasoningEngine();
  const buildUserPrompt = engine['buildUserPrompt'].bind(engine);

  const payload = {
    goal: 'Explore thematic satellite layers on Bhuvan Geoportal',
    pageState: {
      title: 'Bhuvan 2D/3D Geospatial Viewer',
      url: 'https://bhuvan.nrsc.gov.in/ngmaps',
      domain: 'bhuvan.nrsc.gov.in',
      viewport: [1280, 800]
    },
    elements: [
      {
        localId: 'el_map',
        role: 'button',
        sanitizedName: 'Map Layers',
        coarseBounds: [20, 50, 80, 40],
        actionCapabilities: ['click']
      }
    ]
  };

  const prompt = buildUserPrompt(payload);
  assert.ok(prompt.includes('Verified Semantic Site Topology for Bhuvan Indian Geo-Platform'), 'Should inject Bhuvan topology block');
  assert.ok(prompt.includes('thematic: https://bhuvan.nrsc.gov.in/thematic'), 'Should include thematic canonical route');
  assert.ok(prompt.includes('open_data: https://bhuvan.nrsc.gov.in/data'), 'Should include open data archive route');
  assert.ok(prompt.includes('click the autocomplete suggestion to center the map'), 'Should include Bhuvan autocomplete directive');
});

test('Reasoning Formatting: parseReasoningLines extracts clean categories with confidence evaluation', () => {
  const thoughtText = `
Observation: Inspecting Bhuvan search bar at coarse bounds [100, 20, 300, 40].
Intent & Strategy: Type Bengaluru into the search bar and trigger suggestion selection.
Confidence: 0.94 >= Threshold: 0.85. Proceeding with autonomous action.
Action Selection: Proposing type action on el_search_input.
  `.trim();

  const lines = parseReasoningLines(thoughtText);
  assert.ok(lines.length >= 3, 'Should parse multiple structured reasoning lines');

  for (const item of lines) {
    assert.ok(!/[🛡️⚠️🔐]/.test(item.category), 'Category must contain no shield/warning emojis');
  }

  const confidenceItem = lines.find(l => l.category === 'Confidence' || l.body.includes('Threshold'));
  assert.ok(confidenceItem, 'Should capture confidence comparison line');
  assert.ok(confidenceItem.body.includes('0.94') && confidenceItem.body.includes('0.85'), 'Should retain exact confidence values');
});

test('Reasoning Formatting: formatReasoningIntoLinesHtml formats confidence pill and code chips', () => {
  const thoughtText = `
Observation: Located verified search box el_txt_search.
Confidence: 0.95 >= Threshold: 0.85 -> Autonomous click authorized.
Action Selection: Clicking button el_submit.
  `.trim();

  const html = formatReasoningIntoLinesHtml(thoughtText);
  assert.ok(html.includes('thought-confidence-tag'), 'Should wrap confidence evaluation in monospace confidence tag');
  assert.ok(html.includes('<code class="thought-code">el_txt_search</code>'), 'Should format element ID as code chip');
  assert.ok(html.includes('0.95 &gt;= Threshold: 0.85'), 'Should format confidence evaluation comparison');
});

test('Reasoning Formatting: resolveFriendlyElementName resolves technical ID to human-readable button name', async () => {
  const { resolveFriendlyElementName } = await import('../apps/extension/src/sidepanel/sidepanel.js');

  const mockElements = [
    { localId: 'el_1', sanitizedName: 'Login' },
    { localId: 'el_2', sanitizedName: 'Search ISRO' },
    { localId: 'el_3', sanitizedName: 'Download Chandrayaan-3 Brochure' },
    { localId: 'el_4', sanitizedName: 'el_4' } // Raw ID fallback
  ];

  assert.equal(resolveFriendlyElementName('el_1', mockElements), 'Login');
  assert.equal(resolveFriendlyElementName('el_2', mockElements), 'Search ISRO');
  assert.equal(resolveFriendlyElementName('el_3', mockElements), 'Download Chandrayaan-3 Brochure');
  assert.equal(resolveFriendlyElementName('el_4', mockElements), '', 'Should ignore raw uninformative el_ names');
  assert.equal(resolveFriendlyElementName('el_unknown', mockElements), '');
});
