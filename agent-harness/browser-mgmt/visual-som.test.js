/**
 * @privapilot/tests - Visual Set-of-Marks (SoM) Grounding Test Suite
 *
 * Verifies high-contrast visual badge overlay generation, viewport boundary clamping,
 * offscreen/disabled element rejection, and mark-to-element mapping.
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import { MaskRenderer } from '../../apps/extension/dist/sanitizer/mask-renderer.js';

class MockCanvasContext {
  constructor() {
    this.ops = [];
    this.fillStyle = '';
    this.strokeStyle = '';
    this.lineWidth = 1;
    this.font = '';
  }

  save() {
    this.ops.push({ type: 'save' });
  }

  restore() {
    this.ops.push({ type: 'restore' });
  }

  measureText(text) {
    return { width: text.length * 7 };
  }

  beginPath() {
    this.ops.push({ type: 'beginPath' });
  }

  roundRect(x, y, w, h, r) {
    this.ops.push({ type: 'roundRect', x, y, w, h, r });
  }

  fillRect(x, y, w, h) {
    this.ops.push({ type: 'fillRect', x, y, w, h });
  }

  strokeRect(x, y, w, h) {
    this.ops.push({ type: 'strokeRect', x, y, w, h });
  }

  fill() {
    this.ops.push({ type: 'fill', style: this.fillStyle });
  }

  stroke() {
    this.ops.push({ type: 'stroke', style: this.strokeStyle });
  }

  fillText(text, x, y) {
    this.ops.push({ type: 'fillText', text, x, y, style: this.fillStyle });
  }
}

class MockCanvas {
  constructor(width = 1280, height = 720) {
    this.width = width;
    this.height = height;
    this.ctx = new MockCanvasContext();
  }

  getContext(type) {
    return this.ctx;
  }
}

test('Visual SoM: Renders high-contrast badges for in-viewport interactive elements', () => {
  const canvas = new MockCanvas(1280, 720);
  const elements = [
    {
      localId: 'el_1',
      sanitizedName: 'Search button',
      boundingBox: { x: 100, y: 150, width: 80, height: 32 },
      inViewport: true,
      state: ['visible', 'enabled']
    },
    {
      localId: 'el_2',
      sanitizedName: 'Submit button',
      boundingBox: { x: 300, y: 400, width: 120, height: 40 },
      inViewport: true,
      state: ['visible', 'enabled']
    }
  ];

  MaskRenderer.renderSetOfMarks(canvas, elements, 1280, 720);

  const fillTextOps = canvas.ctx.ops.filter((op) => op.type === 'fillText');
  assert.equal(fillTextOps.length, 2, 'Should draw exactly 2 badge text labels');
  assert.equal(fillTextOps[0].text, '1', 'First label should be mark 1');
  assert.equal(fillTextOps[1].text, '2', 'Second label should be mark 2');
  assert.equal(fillTextOps[0].style, '#ffffff', 'Badge text must be high-contrast white');
});

test('Visual SoM: Rejects disabled, offscreen, and out-of-viewport elements', () => {
  const canvas = new MockCanvas(1280, 720);
  const elements = [
    {
      localId: 'el_1',
      sanitizedName: 'Visible Button',
      boundingBox: { x: 100, y: 150, width: 80, height: 32 },
      inViewport: true,
      state: ['visible', 'enabled']
    },
    {
      localId: 'el_2',
      sanitizedName: 'Disabled Button',
      boundingBox: { x: 200, y: 150, width: 80, height: 32 },
      inViewport: true,
      state: ['disabled']
    },
    {
      localId: 'el_3',
      sanitizedName: 'Offscreen Below',
      boundingBox: { x: 100, y: 1200, width: 80, height: 32 },
      inViewport: false,
      verticalOffset: 'below'
    },
    {
      localId: 'el_4',
      sanitizedName: 'Offscreen Above',
      boundingBox: { x: 100, y: -200, width: 80, height: 32 },
      inViewport: false,
      verticalOffset: 'above'
    }
  ];

  MaskRenderer.renderSetOfMarks(canvas, elements, 1280, 720);

  const fillTextOps = canvas.ctx.ops.filter((op) => op.type === 'fillText');
  assert.equal(fillTextOps.length, 1, 'Only the visible enabled element should receive a badge');
  assert.equal(fillTextOps[0].text, '1');
});

test('Visual SoM: Clamps badges strictly inside canvas boundaries', () => {
  const canvas = new MockCanvas(1000, 600);
  const elements = [
    {
      localId: 'el_edge_bottom_right',
      boundingBox: { x: 999, y: 599, width: 50, height: 50 },
      inViewport: true
    },
    {
      localId: 'el_edge_top_left',
      boundingBox: { x: -10, y: -5, width: 50, height: 50 },
      inViewport: true
    }
  ];

  MaskRenderer.renderSetOfMarks(canvas, elements, 1000, 600);

  const roundRectOps = canvas.ctx.ops.filter((op) => op.type === 'roundRect');
  for (const op of roundRectOps) {
    assert.ok(op.x >= 0, `Badge x=${op.x} must be >= 0`);
    assert.ok(op.x + op.w <= 1000, `Badge right edge x+w=${op.x + op.w} must be <= 1000`);
    assert.ok(op.y >= 0, `Badge y=${op.y} must be >= 0`);
    assert.ok(op.y + op.h <= 600, `Badge bottom edge y+h=${op.y + op.h} must be <= 600`);
  }
});

test('Visual SoM: Applies Discord-inspired semantic color coding by element role', () => {
  const canvas = new MockCanvas(1280, 720);
  const elements = [
    {
      localId: 'el_1',
      role: 'button',
      sanitizedName: 'Action Button',
      boundingBox: { x: 100, y: 100, width: 80, height: 32 },
      inViewport: true
    },
    {
      localId: 'el_2',
      role: 'input',
      sanitizedName: 'Text Field',
      boundingBox: { x: 250, y: 100, width: 140, height: 32 },
      inViewport: true
    },
    {
      localId: 'el_3',
      role: 'select',
      sanitizedName: 'Dropdown Picker',
      boundingBox: { x: 450, y: 100, width: 120, height: 32 },
      inViewport: true
    },
    {
      localId: 'el_4',
      role: 'link',
      sanitizedName: 'Anchor Navigation',
      boundingBox: { x: 650, y: 100, width: 100, height: 32 },
      inViewport: true
    }
  ];

  MaskRenderer.renderSetOfMarks(canvas, elements, 1280, 720);

  const fillOps = canvas.ctx.ops.filter((op) => op.type === 'fill');
  assert.ok(fillOps.some((op) => op.style === '#5865F2'), 'Buttons must use Discord Blurple (#5865F2)');
  assert.ok(fillOps.some((op) => op.style === '#23A55A'), 'Text inputs must use Emerald Green (#23A55A)');
  assert.ok(fillOps.some((op) => op.style === '#8B5CF6'), 'Selects must use Vibrant Violet (#8B5CF6)');
  assert.ok(fillOps.some((op) => op.style === '#00A8FC'), 'Links must use Discord Cyan (#00A8FC)');
});

test('Visual SoM: Staggers overlapping badges to prevent occlusion on dense toolbars', () => {
  const canvas = new MockCanvas(1280, 720);
  // Two adjacent elements occupying the exact same top-left coordinate cluster
  const elements = [
    {
      localId: 'el_1',
      role: 'button',
      sanitizedName: 'Tool 1',
      boundingBox: { x: 100, y: 50, width: 30, height: 30 },
      inViewport: true
    },
    {
      localId: 'el_2',
      role: 'button',
      sanitizedName: 'Tool 2',
      boundingBox: { x: 100, y: 50, width: 30, height: 30 },
      inViewport: true
    }
  ];

  MaskRenderer.renderSetOfMarks(canvas, elements, 1280, 720);

  const fillTextOps = canvas.ctx.ops.filter((op) => op.type === 'fillText');
  assert.equal(fillTextOps.length, 2, 'Both elements must have labels drawn');
  assert.notEqual(fillTextOps[0].y, fillTextOps[1].y, 'Overlapping marks must be vertically staggered');
});

test('Visual SoM: Renders badges accurately for elements with normalized coarseBounds', () => {
  const canvas = new MockCanvas(1280, 720);
  const elements = [
    {
      localId: 'el_10',
      role: 'input',
      sanitizedName: 'Search Bar',
      coarseBounds: [0.2, 0.1, 0.4, 0.05], // Normalized bounds: x=256, y=72, w=512, h=36
      inViewport: true
    }
  ];

  MaskRenderer.renderSetOfMarks(canvas, elements, 1280, 720);

  const fillTextOps = canvas.ctx.ops.filter((op) => op.type === 'fillText');
  assert.equal(fillTextOps.length, 1);
  assert.equal(fillTextOps[0].text, '10');

  const roundRectOps = canvas.ctx.ops.filter((op) => op.type === 'roundRect');
  assert.ok(roundRectOps.length >= 1, 'Should draw wireframe/pill for coarseBounds element');
});


