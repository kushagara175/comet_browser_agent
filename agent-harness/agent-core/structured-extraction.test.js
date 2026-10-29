/**
 * @privapilot/tests - Declarative Structured Data & Table Extraction Test Suite
 *
 * Verifies on-device table parsing, card repeater detection, schema-guided extraction,
 * Markdown table synthesis, and automatic PII sanitization.
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import { TableExtractor } from '../../apps/extension/dist/content/table-extractor.js';
import { ActionExecutor } from '../../apps/extension/dist/content/action-executor.js';

// Minimal DOM simulation for Node.js test environment
class MockElement {
  constructor(tagName, attrs = {}, text = '') {
    this.tagName = tagName.toUpperCase();
    this.attributes = { ...attrs };
    this.className = attrs.class || attrs.className || '';
    this.id = attrs.id || '';
    this.href = attrs.href || '';
    this.src = attrs.src || '';
    this.style = {};
    this.children = [];
    this.textContent = text;
    this.parentElement = null;
    this.offsetWidth = 100;
    this.offsetHeight = 100;
  }

  appendChild(child) {
    child.parentElement = this;
    this.children.push(child);
    return child;
  }

  getAttribute(name) {
    return this.attributes[name] || null;
  }

  querySelector(selector) {
    const all = this.querySelectorAll(selector);
    return all[0] || null;
  }

  querySelectorAll(selector) {
    const results = [];
    const check = (node) => {
      // Simplified selector matching for test environment
      const sel = selector.toLowerCase();
      let matched = false;

      if (sel === 'table' && node.tagName === 'TABLE') matched = true;
      else if (sel === 'tr' && node.tagName === 'TR') matched = true;
      else if (sel === 'th' && node.tagName === 'TH') matched = true;
      else if (sel === 'td' && node.tagName === 'TD') matched = true;
      else if (sel === 'article' && node.tagName === 'ARTICLE') matched = true;
      else if (sel === 'ul' && node.tagName === 'UL') matched = true;
      else if (sel === 'ol' && node.tagName === 'OL') matched = true;
      else if (sel === 'li' && node.tagName === 'LI') matched = true;
      else if (sel === 'p' && node.tagName === 'P') matched = true;
      else if (sel === 'a[href]' && node.tagName === 'A' && node.href) matched = true;
      else if (sel.includes('.card') && node.className.includes('card')) matched = true;
      else if (sel.includes('.title') && node.className.includes('title')) matched = true;
      else if (sel.includes('.price') && node.className.includes('price')) matched = true;
      else if (sel.includes('h1, h2, h3, h4, h5, h6') && ['H1', 'H2', 'H3', 'H4', 'H5', 'H6'].includes(node.tagName)) matched = true;
      else if (sel.includes('th, td') && (node.tagName === 'TH' || node.tagName === 'TD')) matched = true;
      else if (sel.includes('table, [role="table"]') && node.tagName === 'TABLE') matched = true;
      else if (sel.includes('a[rel~="next"]') && node.tagName === 'A' && (node.getAttribute('rel') || '').includes('next')) matched = true;
      else if (sel.includes('a, button, [role="button"]') && (node.tagName === 'A' || node.tagName === 'BUTTON')) matched = true;
      else if (sel.includes('thead tr') && node.tagName === 'TR' && node.parentElement?.tagName === 'THEAD') matched = true;
      else if (sel.includes('tbody tr') && node.tagName === 'TR' && node.parentElement?.tagName === 'TBODY') matched = true;

      if (matched) results.push(node);

      for (const child of node.children) {
        check(child);
      }
    };

    for (const child of this.children) {
      check(child);
    }
    return results;
  }
}

class MockDocument extends MockElement {
  constructor() {
    super('DOCUMENT');
    this.body = new MockElement('BODY');
    this.appendChild(this.body);
  }
}

test('Structured Extraction: Parses HTML tables into JSON records and Markdown', () => {
  const doc = new MockDocument();
  const table = new MockElement('TABLE');
  const thead = new MockElement('THEAD');
  const tbody = new MockElement('TBODY');

  const headerRow = new MockElement('TR');
  headerRow.appendChild(new MockElement('TH', {}, 'Problem ID'));
  headerRow.appendChild(new MockElement('TH', {}, 'Title'));
  headerRow.appendChild(new MockElement('TH', {}, 'Category'));
  thead.appendChild(headerRow);

  const row1 = new MockElement('TR');
  row1.appendChild(new MockElement('TD', {}, 'SIH26001'));
  row1.appendChild(new MockElement('TD', {}, 'Smart Water Grid'));
  row1.appendChild(new MockElement('TD', {}, 'Clean Water'));
  tbody.appendChild(row1);

  const row2 = new MockElement('TR');
  row2.appendChild(new MockElement('TD', {}, 'SIH26002'));
  row2.appendChild(new MockElement('TD', {}, 'AI Flood Forecasting'));
  row2.appendChild(new MockElement('TD', {}, 'Disaster Management'));
  tbody.appendChild(row2);

  table.appendChild(thead);
  table.appendChild(tbody);
  doc.body.appendChild(table);

  const result = TableExtractor.extract(doc, { limit: 10 });
  assert.equal(result.success, true);
  assert.equal(result.count, 2);
  assert.equal(result.items[0]['Problem ID'], 'SIH26001');
  assert.equal(result.items[0]['Title'], 'Smart Water Grid');
  assert.equal(result.items[1]['Problem ID'], 'SIH26002');
  assert.ok(result.markdown.includes('| Problem ID | Title | Category |'));
  assert.ok(result.markdown.includes('| SIH26001 | Smart Water Grid | Clean Water |'));
});

test('Structured Extraction: Extracts anchor links inside table cells', () => {
  const doc = new MockDocument();
  const table = new MockElement('TABLE');
  const thead = new MockElement('THEAD');
  const tbody = new MockElement('TBODY');

  const hRow = new MockElement('TR');
  hRow.appendChild(new MockElement('TH', {}, 'Name'));
  hRow.appendChild(new MockElement('TH', {}, 'Link'));
  thead.appendChild(hRow);

  const r1 = new MockElement('TR');
  r1.appendChild(new MockElement('TD', {}, 'ISRO Bhuvan'));
  const linkCell = new MockElement('TD', {}, 'Visit');
  const a = new MockElement('A', { href: 'https://bhuvan.nrsc.gov.in' }, 'Visit Portal');
  linkCell.appendChild(a);
  r1.appendChild(linkCell);
  tbody.appendChild(r1);

  table.appendChild(thead);
  table.appendChild(tbody);
  doc.body.appendChild(table);

  const result = TableExtractor.extract(doc);
  assert.equal(result.success, true);
  assert.equal(result.count, 1);
  assert.equal(result.items[0]['Name'], 'ISRO Bhuvan');
  assert.equal(result.items[0]['Link_url'], 'https://bhuvan.nrsc.gov.in');
});

test('Structured Extraction: Generates robust Markdown table with pipes and multi-lines escaped', () => {
  const items = [
    { name: 'Model A', description: 'Supports | pipe characters' },
    { name: 'Model B', description: 'Line 1\nLine 2' }
  ];

  const md = TableExtractor.recordsToMarkdown(items);
  assert.ok(md.includes('| Model A | Supports \\| pipe characters |'), 'Pipes must be escaped with backslash');
  assert.ok(md.includes('| Model B | Line 1 Line 2 |'), 'Newlines must be sanitized to spaces');
});

test('Structured Extraction: ActionExecutor dispatches kind: "extract" without throwing unsupported action error', () => {
  const doc = new MockDocument();
  const table = new MockElement('TABLE');
  const thead = new MockElement('THEAD');
  const tbody = new MockElement('TBODY');

  const hRow = new MockElement('TR');
  hRow.appendChild(new MockElement('TH', {}, 'Item'));
  thead.appendChild(hRow);

  const r1 = new MockElement('TR');
  r1.appendChild(new MockElement('TD', {}, 'Extracted Data Item'));
  tbody.appendChild(r1);

  table.appendChild(thead);
  table.appendChild(tbody);
  doc.body.appendChild(table);

  const result = ActionExecutor.execute({
    actionId: 'act_extract_test',
    kind: 'extract',
    targetLocalId: 'table_1',
    confidence: 0.99,
    risk: 'safe',
    rationale: 'Extract items from table'
  }, new Map([['table_1', table]]));

  assert.equal(result.success, true);
  assert.equal(result.semanticOutcomeVerified, true);
  assert.ok(result.extractedCount >= 1);
  assert.ok(typeof result.extractedData === 'string');
});

test('Structured Extraction: Detects pagination controls and next-page links', () => {
  const doc = new MockDocument();
  const table = new MockElement('TABLE');
  const thead = new MockElement('THEAD');
  const tbody = new MockElement('TBODY');

  const hRow = new MockElement('TR');
  hRow.appendChild(new MockElement('TH', {}, 'Product'));
  thead.appendChild(hRow);

  const r1 = new MockElement('TR');
  r1.appendChild(new MockElement('TD', {}, 'Laptop Pro'));
  tbody.appendChild(r1);

  table.appendChild(thead);
  table.appendChild(tbody);
  doc.body.appendChild(table);

  // Add a pagination "Next Page" link
  const nextLink = new MockElement('A', { href: '/products?page=2', rel: 'next' }, 'Next Page →');
  doc.body.appendChild(nextLink);

  const res = TableExtractor.extract(doc);
  assert.equal(res.success, true);
  assert.equal(res.count, 1);
  assert.ok(res.nextPageHint, 'Should include nextPageHint when rel="next" is present');
  assert.equal(res.nextPageHint.href, '/products?page=2');
  assert.ok(res.nextPageHint.text.includes('Next'));
});

