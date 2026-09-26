import test from 'node:test';
import assert from 'node:assert/strict';
import { ElementExtractor } from '../apps/extension/dist/content/element-extractor.js';
import { CoordinateTransformer } from '../apps/extension/dist/sanitizer/coordinate-transformer.js';
import { detectDomSensitiveRegions } from '../apps/extension/dist/sanitizer/dom-detector.js';

function mockControl(tagName, name, y, attributes = {}, parentElement = null) {
  const el = {
    tagName: tagName.toUpperCase(), id: attributes.id || '', value: attributes.value,
    innerText: name, textContent: name, parentElement,
    ownerDocument: { defaultView: { getComputedStyle: () => attributes.style || { display: 'block', visibility: 'visible', opacity: '1' } } },
    getAttribute: key => attributes[key] ?? null,
    hasAttribute: key => key in attributes,
    getBoundingClientRect: () => ({ x: 10, y, width: 150, height: attributes.height ?? 25, right: 160, bottom: y + (attributes.height ?? 25) }),
    closest: () => null,
    querySelector: () => null
  };
  return el;
}

function mockDocument(controls) {
  return {
    title: 'Directory', defaultView: { innerWidth: 800, innerHeight: 600 },
    querySelectorAll: selector => selector === '*' ? [] : selector.startsWith('button, a, input') ? controls : [],
    createTreeWalker: () => ({ nextNode: () => null })
  };
}

test('DOM snapshot prunes invisible controls, ranks viewport controls, and caps at 80 without dropping detector captures', () => {
  const offscreen = Array.from({ length: 90 }, (_, i) => mockControl('button', `Offscreen ${i}`, 900 + i * 30));
  const parent = { parentElement: null, getAttribute: () => null, hasAttribute: () => false,
    ownerDocument: { defaultView: { getComputedStyle: () => ({ display: 'none', visibility: 'visible', opacity: '1' }) } } };
  const controls = [
    ...offscreen,
    mockControl('input', '', 40, { type: 'search', placeholder: 'Search by Institute Name', value: 'IIT Delhi' }),
    mockControl('button', 'Search', 80),
    mockControl('a', 'CONTACT US', 115),
    mockControl('input', '', 155, { type: 'password', value: 'secret' }),
    mockControl('button', 'Hidden', 190, {}, parent),
    mockControl('button', 'Transparent', 220, { style: { display: 'block', visibility: 'visible', opacity: '0' } }),
    mockControl('button', 'No width', 240, { height: 0 })
  ];
  const { snapshot, elementMap } = new ElementExtractor().extractSnapshot(mockDocument(controls));
  assert.equal(snapshot.interactiveElements.length, 80);
  assert.equal(elementMap.size, 80);
  assert.equal(snapshot.interactiveElements[0].rawName, 'Search by Institute Name');
  assert.equal(snapshot.interactiveElements[0].inViewport, true);
  assert.ok(snapshot.interactiveElements[0].actionCapabilities.includes('type'));
  assert.ok(snapshot.interactiveElements.some(e => e.rawName === 'CONTACT US' && e.actionCapabilities.includes('click')));
  assert.ok(snapshot.interactiveElements.some(e => e.inViewport === false));
  assert.ok(snapshot.interactiveElements.every(e => !['Hidden', 'Transparent', 'No width'].includes(e.rawName)));
  assert.equal(snapshot.domElements.length, 2, 'uncapped detector inputs must include search and password fields');
  const transformer = new CoordinateTransformer({ viewportWidth: 800, viewportHeight: 600, screenshotWidth: 800, screenshotHeight: 600, devicePixelRatio: 1, scrollX: 0, scrollY: 0 });
  const regions = detectDomSensitiveRegions(snapshot.domElements, transformer);
  assert.equal(regions.length, 1);
  assert.equal(regions[0].category, 'password');
  assert.deepEqual(regions[0].screenshotBox, { space: 'screenshotPixel', x: 10, y: 155, width: 150, height: 25 });
});
