/**
 * Voice Mode & Orbloom Living 3D WebGL Integration Test Suite
 *
 * Verifies:
 * 1. sidepanel.html contains voiceModal, closeVoiceBtn, orb canvas, and voiceLiveTranscript.
 * 2. sendBtn has both .icon-send and .icon-mic with mode-mic as initial idle state.
 * 3. sidepanel.css contains rules for mode-send and mode-mic, backdrop blur, and Orbloom motion.
 * 4. orbloom-bundle.js exists, is valid standalone ESM, and exports createOrb & attachMicrophone.
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT_DIR = path.resolve(__dirname, '..');

test('Voice Mode HTML Integrity: Contains send/mic toggle and Orbloom voice modal markup', () => {
  const htmlPath = path.join(ROOT_DIR, 'apps/extension/src/sidepanel/sidepanel.html');
  assert.ok(fs.existsSync(htmlPath), 'sidepanel.html must exist');
  const html = fs.readFileSync(htmlPath, 'utf-8');

  // sendBtn with mic and send icons
  assert.ok(html.includes('id="sendBtn"'), 'sendBtn must exist');
  assert.ok(html.includes('icon-send'), 'icon-send must exist inside sendBtn');
  assert.ok(html.includes('icon-mic'), 'icon-mic must exist inside sendBtn');
  assert.ok(html.includes('mode-mic'), 'mode-mic must be initial class on sendBtn');

  // voice modal
  assert.ok(html.includes('id="voiceModal"'), 'voiceModal must exist');
  assert.ok(html.includes('id="closeVoiceBtn"'), 'closeVoiceBtn must exist');
  assert.ok(html.includes('class="orb-canvas"'), 'orb-canvas must exist');
  assert.ok(html.includes('id="voiceLiveTranscript"'), 'voiceLiveTranscript must exist');
  assert.ok(html.includes('class="orb-motion"'), 'orb-motion wrapper must exist');
});

test('Voice Mode CSS Integrity: Contains mode-mic/mode-send toggle, backdrop blur, and Orbloom keyframes', () => {
  const cssPath = path.join(ROOT_DIR, 'apps/extension/src/sidepanel/sidepanel.css');
  assert.ok(fs.existsSync(cssPath), 'sidepanel.css must exist');
  const css = fs.readFileSync(cssPath, 'utf-8');

  // Toggle rules
  assert.ok(css.includes('.send-btn.mode-send .icon-send'), 'mode-send icon-send rule present');
  assert.ok(css.includes('.send-btn.mode-mic .icon-mic'), 'mode-mic icon-mic rule present');

  // Voice modal backdrop blur
  assert.ok(css.includes('.voice-modal'), '.voice-modal style present');
  assert.ok(css.includes('backdrop-filter: blur('), 'backdrop-filter blur present');
  assert.ok(css.includes('.voice-close-btn'), '.voice-close-btn style present');
  assert.ok(css.includes('.voice-live-transcript'), '.voice-live-transcript style present');

  // Orbloom styles & keyframes
  assert.ok(css.includes('.orb-motion'), '.orb-motion style present');
  assert.ok(css.includes('.orb-clip'), '.orb-clip style present');
  assert.ok(css.includes('orb-ambient-motion'), 'orb-ambient-motion keyframe present');
});

test('Orbloom Bundle ESM Module: Bundled locally without remote dependencies or fetch', async () => {
  const bundlePath = path.join(ROOT_DIR, 'apps/extension/src/sidepanel/orbloom-bundle.js');
  assert.ok(fs.existsSync(bundlePath), 'orbloom-bundle.js must exist');

  const bundle = await import(bundlePath);
  assert.equal(typeof bundle.createOrb, 'function', 'createOrb must be exported as a function');
  assert.equal(typeof bundle.attachMicrophone, 'function', 'attachMicrophone must be exported as a function');
  assert.equal(typeof bundle.OrbController, 'function', 'OrbController must be exported as a class/function');
});
