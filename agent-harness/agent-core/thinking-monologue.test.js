import test from 'node:test';
import assert from 'node:assert/strict';
import {
  sanitizeReasoningText,
  parseReasoningLines,
  formatReasoningIntoLinesHtml,
  renderThinkingAccordion,
  collectAllStepReasoning,
  streamLiveReasoningLines,
  getCachedThoughtDuration,
  setCachedThoughtDuration
} from '../../apps/extension/src/sidepanel/sidepanel.js';

test('Thinking: sanitizeReasoningText strips think tags and filters fake canned strings', () => {
  const inputWithTags = '<think>Observing the page layout\nUser wants to click login</think>';
  const sanitized = sanitizeReasoningText(inputWithTags);
  assert.equal(sanitized, 'Observing the page layout\nUser wants to click login');

  const fakeStrings = [
    'analyzed visible page elements and generated response.',
    'formulated response to query.',
    'evaluated page context and synthesized response.',
    'llm analyzed page elements and determined the optimal execution path.',
    'evaluating page elements and planning action...',
    'analyzed visible page context and formulated response.',
    'action executed successfully'
  ];

  for (const fake of fakeStrings) {
    assert.equal(sanitizeReasoningText(fake), '', `Expected fake string "${fake}" to be rejected`);
  }
});

test('Thinking: parseReasoningLines parses structured 3-part thinking into discrete items', () => {
  const structuredText = [
    '👁️ Observation: Currently on the Smart India Hackathon portal. The search input [el_9] is visible.',
    '🎯 User Intent: The user wants to search for problem statement "171".',
    '⚡ Action Selection: Propose type on el_9 with "171" and pressEnter: true.'
  ].join('\n');

  const parsed = parseReasoningLines(structuredText);
  assert.equal(parsed.length, 3);

  assert.equal(parsed[0].icon, '');
  assert.equal(parsed[0].category, 'Observation');
  assert.ok(parsed[0].body.includes('Smart India Hackathon portal'));

  assert.equal(parsed[1].icon, '');
  assert.equal(parsed[1].category, 'Intent & Strategy');
  assert.ok(parsed[1].body.includes('problem statement "171"'));

  assert.equal(parsed[2].icon, '');
  assert.equal(parsed[2].category, 'Action Selection');
  assert.ok(parsed[2].body.includes('Propose type on el_9'));
});

test('Thinking: parseReasoningLines handles bullet points and keyword prefixes gracefully', () => {
  const bulletText = [
    '* Observing that search bar el_3 is ready for input.',
    '* Strategy: enter query "ISRO" to retrieve relevant records.',
    '* Action: execute type on el_3.'
  ].join('\n');

  const parsed = parseReasoningLines(bulletText);
  assert.equal(parsed.length, 3);
  assert.equal(parsed[0].icon, '');
  assert.equal(parsed[0].category, 'Observation');
  assert.equal(parsed[1].icon, '');
  assert.equal(parsed[1].category, 'Intent & Strategy');
  assert.equal(parsed[2].icon, '');
  assert.equal(parsed[2].category, 'Action Selection');
});

test('Thinking: parseReasoningLines handles condensed single-line reasoning', () => {
  const singleLine = '👁️ Observation: On problem table. 🎯 User Intent: Filter for statement 171. ⚡ Action Selection: Type into el_9.';
  const parsed = parseReasoningLines(singleLine);
  assert.ok(parsed.length >= 3, `Expected at least 3 lines, got ${parsed.length}`);
  assert.equal(parsed[0].icon, '');
  assert.equal(parsed[1].icon, '');
  assert.equal(parsed[2].icon, '');
});

test('Thinking: formatReasoningIntoLinesHtml formats element IDs with code chips and escapes HTML', () => {
  const reasoning = '👁️ Observation: Found search input el_9 and button <script>alert(1)</script>.';
  const html = formatReasoningIntoLinesHtml(reasoning);

  assert.ok(html.includes('<code class="thought-code">el_9</code>'), 'Element ID must be rendered in thought-code chip');
  assert.ok(!html.includes('<script>'), 'HTML injection must be neutralized');
  assert.ok(html.includes('&lt;script&gt;alert(1)&lt;/script&gt;'));
  assert.ok(html.includes('thought-paragraph'), 'Must render as clean thought-paragraph');
  assert.ok(html.includes('Found search input'), 'Must retain reasoning body');
});

test('Thinking: renderThinkingAccordion generates accessible collapsible monologue block with natural paragraphs', () => {
  const reasoning = [
    'Observation: On dashboard with 4 elements.',
    'User Intent: Review submission count for statement 171.',
    'Action Selection: Click el_2 to open modal.'
  ].join('\n\n');

  const html = renderThinkingAccordion(reasoning, 5, { open: true });
  assert.ok(html.includes('data-state="expanded"'));
  assert.ok(html.includes('aria-expanded="true"'));
  assert.ok(html.includes('Thought for 5s'));
  assert.ok(html.includes('thought-lines-container'));
  assert.ok(html.includes('thought-paragraph'));
  assert.ok(html.includes('<code class="thought-code">el_2</code>'));
});

test('Thinking: renderThinkingAccordion defaults to collapsed state initially', () => {
  const reasoning = '👁️ Observation: Target loaded. ⚡ Action Selection: Click button.';
  const html = renderThinkingAccordion(reasoning, 3);
  assert.ok(html.includes('data-state="collapsed"'), 'Must default to collapsed state');
  assert.ok(html.includes('aria-expanded="false"'), 'aria-expanded must be false by default');
  assert.ok(html.includes('display: none'), 'Drawer must be hidden by default');
});

test('Thinking: collectAllStepReasoning aggregates reasoning across multi-step runs without duplicates', () => {
  const multiStepRes = {
    steps: [
      {
        step: 1,
        proposal: {
          kind: 'type',
          reasoning: '👁️ Observation: On search page.\n⚡ Action Selection: Type search query into el_5.'
        }
      },
      {
        step: 2,
        proposal: {
          kind: 'click',
          reasoning: '👁️ Observation: Results visible.\n⚡ Action Selection: Click first search result link el_8.'
        }
      }
    ],
    reasoning: '👁️ Observation: Results visible.\n⚡ Action Selection: Click first search result link el_8.'
  };

  const aggregated = collectAllStepReasoning(multiStepRes);
  assert.ok(aggregated.includes('Type search query into el_5'));
  assert.ok(aggregated.includes('Click first search result link el_8'));
  // Ensure Step 1 is not dropped
  assert.ok(aggregated.includes('On search page'));
});

test('Thinking: completion merges partial steps and live reasoning as distinct paragraphs without Step prefixes', () => {
  const result = { steps: [
    { step: 1, proposal: { reasoning: 'Observation: Opened missions hub.' } },
    { step: 2, proposal: { reasoning: 'Observation: Opened missions directory.' } }
  ], reasoning: 'Step 2: Observation: Opened missions directory.' };
  const merged = collectAllStepReasoning(result,
    'Observation: Opened missions hub.\n\nObservation: Opened missions directory.\n\nObservation: Found Chandrayaan-3 row.');
  assert.ok(!merged.includes('Step 1:'), 'Merged thoughts must not have Step 1: prefix');
  assert.ok(!merged.includes('Step 2:'), 'Merged thoughts must not have Step 2: prefix');
  assert.ok(merged.includes('Opened missions hub'), 'Must contain first thought');
  assert.ok(merged.includes('Opened missions directory'), 'Must contain second thought');
  assert.ok(merged.includes('Found Chandrayaan-3 row'), 'Must contain third thought');
  assert.equal((merged.match(/Opened missions directory/g) || []).length, 1);
  const multiSteps = collectAllStepReasoning({ steps: [
    { step: 1, proposal: { reasoning: 'Observation: Checking the page.' } },
    { step: 2, proposal: { reasoning: 'Observation: Finding the submit button.' } }
  ] });
  assert.ok(multiSteps.includes('Checking the page'));
  assert.ok(multiSteps.includes('Finding the submit button'));
  const formatted = formatReasoningIntoLinesHtml(multiSteps);
  assert.ok(!formatted.includes('Step 2:'), 'Formatted paragraphs must not contain Step 2:');
  assert.ok(formatted.includes('thought-paragraph'), 'Must render as thought-paragraph');
});

test('Thinking: parseReasoningLines strips repetitive duplicate category labels', () => {
  const duplicateLabelText = 'Observation: Observation: The current page is the Wikipedia article for Chandrayaan-3.';
  const parsed = parseReasoningLines(duplicateLabelText);
  assert.equal(parsed.length, 1);
  assert.equal(parsed[0].category, 'Observation');
  assert.ok(!parsed[0].body.startsWith('Observation:'), 'Body must not contain repetitive category label');
  assert.ok(parsed[0].body.startsWith('The current page is the Wikipedia article'));

  const formatted = formatReasoningIntoLinesHtml(duplicateLabelText);
  // Ensure Observation: is only in the strong tag once
  const occurrences = (formatted.match(/Observation:/g) || []).length;
  assert.equal(occurrences, 1, `Expected "Observation:" to appear exactly once, but appeared ${occurrences} times in: ${formatted}`);
});

test('Thinking: sanitizeReasoningText strips raw un-fenced JSON and trailing actionId blobs', () => {
  const leakedJson = `🎯 Intent & Strategy: The user goal is to search for 'iPhone 16' on Flipkart and analyze its price.
{"actionId": "act_2", "kind": "finish", "confidence": 1.0, "risk": "safe", "reasoning": "🎯 Intent & Strategy"}`;

  const clean = sanitizeReasoningText(leakedJson);
  assert.ok(!clean.includes('"actionId"'), 'Must strip leaked actionId JSON');
  assert.ok(!clean.includes('"kind": "finish"'), 'Must strip leaked kind JSON');
  assert.ok(clean.includes("The user goal is to search for 'iPhone 16'"));
});

test('Thinking: parseReasoningLines deduplicates repeating Intent & Strategy and duplicate lines', () => {
  const multiStepText = `🎯 Intent & Strategy: The user goal is to search for 'iPhone 16' on Flipkart and analyze its price.
⚡ Action Selection: Type 'iPhone 16' into search input.
🎯 Intent & Strategy: The user goal is to search for 'iPhone 16' on Flipkart and analyze its price.
⚡ Action Selection: Conclude search analysis.`;

  const parsed = parseReasoningLines(multiStepText);
  const intents = parsed.filter(p => p.category === 'Intent & Strategy');
  assert.equal(intents.length, 1, 'Repeating identical Intent & Strategy must be deduplicated');
});

test('Thinking: streamLiveReasoningLines removes placeholder and appends live lines', () => {
  const children = [];
  let placeholderRemoved = false;
  const mockPlaceholder = {
    className: 'monologue-initial-placeholder',
    remove() { placeholderRemoved = true; }
  };
  const mockLiveStream = {
    children,
    querySelector(selector) {
      if (selector === '.monologue-initial-placeholder') return placeholderRemoved ? null : mockPlaceholder;
      return null;
    },
    appendChild(child) {
      children.push(child);
    },
    closest() { return null; }
  };

  const prevDoc = global.document;
  global.document = {
    createElement(tag) {
      return {
        tag,
        className: '',
        style: {},
        innerHTML: '',
        textContent: ''
      };
    }
  };

  try {
    streamLiveReasoningLines(mockLiveStream, '👁️ Observation: Found el_1\n⚡ Action Selection: Click el_1');
    assert.ok(placeholderRemoved, 'Initial placeholder should be removed');
    assert.equal(children.length, 2, 'Should have streamed 2 thought lines');
  } finally {
    global.document = prevDoc;
  }
});

test('Thinking: renderThinkingAccordion does not render custom agent badge (pure typography)', () => {
  const reasoning = '👁️ Observation: On NASA page.\n⚡ Action Selection: Extract specs.';
  const html = renderThinkingAccordion(reasoning, 4, { agentName: 'Space Mission Analyst' });
  assert.ok(!html.includes('thought-agent-badge'), 'Should not render thought-agent-badge element');
  assert.ok(!html.includes('Space Mission Analyst'), 'Should not render custom agent badge prefix');
});

test('Thinking: renderThinkingAccordion omits agent badge for default Core agent', () => {
  const reasoning = '👁️ Observation: On search page.\n⚡ Action Selection: Click submit.';
  const htmlCore1 = renderThinkingAccordion(reasoning, 2, { agentName: 'Comet Core' });
  const htmlCore2 = renderThinkingAccordion(reasoning, 2, { agentName: 'Core' });
  const htmlNone = renderThinkingAccordion(reasoning, 2);

  assert.ok(!htmlCore1.includes('thought-agent-badge'), 'Should not render badge for Comet Core');
  assert.ok(!htmlCore2.includes('thought-agent-badge'), 'Should not render badge for Core');
  assert.ok(!htmlNone.includes('thought-agent-badge'), 'Should not render badge when agentName is omitted');
});

test('Thinking: renderThinkingAccordion renders interactive expandable accordion when tokens exist', () => {
  const html = renderThinkingAccordion('Analyzing page structure.', 1, { isExecuting: true, open: true });
  assert.ok(html.includes('monologue-block'), 'Must render monologue-block container');
  assert.ok(html.includes('monologue-toggle-btn'), 'Must render toggle button');
  assert.ok(html.includes('monologue-chevron'), 'Must render chevron');
  assert.ok(html.includes('Thinking (1s)'), 'Must render shimmering Thinking timer');
  assert.ok(html.includes('monologue-drawer'), 'Must render drawer');
  assert.ok(html.includes('Analyzing page structure'), 'Must render thought content');
});

test('Thinking: renderThinkingAccordion Phase 1 renders clean non-expandable Thinking... when nonExpandable is true', () => {
  const html = renderThinkingAccordion('', 1, { isExecuting: true, nonExpandable: true });
  assert.ok(html.includes('thinking-phase1'), 'Must render thinking-phase1 container');
  assert.ok(html.includes('Thinking...'), 'Must render clean Thinking... text');
  assert.ok(!html.includes('monologue-drawer'), 'Must NOT render any drawer');
  assert.ok(!html.includes('monologue-toggle-btn'), 'Must NOT render any toggle button');
  assert.ok(!html.includes('monologue-chevron'), 'Must NOT render any chevron');
});

test('Thinking: renderThinkingAccordion returns empty string when not executing and text is empty', () => {
  const html = renderThinkingAccordion('', 0, { isExecuting: false });
  assert.equal(html, '');
});

test('Thinking: getCachedThoughtDuration and setCachedThoughtDuration persist durations per messageId', () => {
  setCachedThoughtDuration('msg_test_123', 11);
  assert.equal(getCachedThoughtDuration('msg_test_123'), 11);
  assert.equal(getCachedThoughtDuration('msg_nonexistent'), null);
});



