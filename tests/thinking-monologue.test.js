import test from 'node:test';
import assert from 'node:assert/strict';
import {
  sanitizeReasoningText,
  parseReasoningLines,
  formatReasoningIntoLinesHtml,
  renderThinkingAccordion
} from '../apps/extension/src/sidepanel/sidepanel.js';

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

  assert.equal(parsed[0].icon, '👁️');
  assert.equal(parsed[0].category, 'Observation');
  assert.ok(parsed[0].body.includes('Smart India Hackathon portal'));

  assert.equal(parsed[1].icon, '🎯');
  assert.equal(parsed[1].category, 'Intent & Strategy');
  assert.ok(parsed[1].body.includes('problem statement "171"'));

  assert.equal(parsed[2].icon, '⚡');
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
  assert.equal(parsed[0].icon, '👁️');
  assert.equal(parsed[0].category, 'Observation');
  assert.equal(parsed[1].icon, '🎯');
  assert.equal(parsed[1].category, 'Intent & Strategy');
  assert.equal(parsed[2].icon, '⚡');
  assert.equal(parsed[2].category, 'Action Selection');
});

test('Thinking: parseReasoningLines handles condensed single-line reasoning', () => {
  const singleLine = '👁️ Observation: On problem table. 🎯 User Intent: Filter for statement 171. ⚡ Action Selection: Type into el_9.';
  const parsed = parseReasoningLines(singleLine);
  assert.ok(parsed.length >= 3, `Expected at least 3 lines, got ${parsed.length}`);
  assert.equal(parsed[0].icon, '👁️');
  assert.equal(parsed[1].icon, '🎯');
  assert.equal(parsed[2].icon, '⚡');
});

test('Thinking: formatReasoningIntoLinesHtml formats element IDs with code chips and escapes HTML', () => {
  const reasoning = '👁️ Observation: Found search input el_9 and button <script>alert(1)</script>.';
  const html = formatReasoningIntoLinesHtml(reasoning);

  assert.ok(html.includes('<code class="thought-code">el_9</code>'), 'Element ID must be rendered in thought-code chip');
  assert.ok(!html.includes('<script>'), 'HTML injection must be neutralized');
  assert.ok(html.includes('&lt;script&gt;alert(1)&lt;/script&gt;'));
  assert.ok(html.includes('thought-category'));
  assert.ok(html.includes('Observation:'));
});

test('Thinking: renderThinkingAccordion generates accessible collapsible monologue block with line-by-line thoughts', () => {
  const reasoning = [
    '👁️ Observation: On dashboard with 4 elements.',
    '🎯 User Intent: Review submission count for statement 171.',
    '⚡ Action Selection: Click el_2 to open modal.'
  ].join('\n');

  const html = renderThinkingAccordion(reasoning, 5, { open: true });
  assert.ok(html.includes('data-state="expanded"'));
  assert.ok(html.includes('aria-expanded="true"'));
  assert.ok(html.includes('Thought for 5s'));
  assert.ok(html.includes('thought-lines-container'));
  assert.ok(html.includes('👁️'));
  assert.ok(html.includes('🎯'));
  assert.ok(html.includes('⚡'));
  assert.ok(html.includes('<code class="thought-code">el_2</code>'));
});
