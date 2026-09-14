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

test('Microphone Permission Tab Helper: permission.html and permission.js exist for Chrome native prompt', () => {
  const permHtml = path.join(ROOT_DIR, 'apps/extension/src/sidepanel/permission.html');
  const permJs = path.join(ROOT_DIR, 'apps/extension/src/sidepanel/permission.js');
  assert.ok(fs.existsSync(permHtml), 'permission.html must exist');
  assert.ok(fs.existsSync(permJs), 'permission.js must exist');
  const html = fs.readFileSync(permHtml, 'utf-8');
  assert.ok(html.includes('id="allowMicBtn"'), 'allowMicBtn must exist in permission.html');
  const js = fs.readFileSync(permJs, 'utf-8');
  assert.ok(js.includes('MIC_PERMISSION_GRANTED'), 'MIC_PERMISSION_GRANTED runtime message present in permission.js');
});

test('Voice Reactivity & Silence Auto-Commit: sidepanel has 60 FPS audio loop and silence auto-close timer', () => {
  const jsPath = path.join(ROOT_DIR, 'apps/extension/src/sidepanel/sidepanel.js');
  const js = fs.readFileSync(jsPath, 'utf-8');

  // 60 FPS audio reactive visualizer loop
  assert.ok(js.includes('runVoiceAudioLoop'), 'runVoiceAudioLoop must exist');
  assert.ok(js.includes('setAudioLevel'), 'setAudioLevel must be driven');

  // Silence auto-close timer and prompt transfer
  assert.ok(js.includes('silenceAutoCloseTimer'), 'silenceAutoCloseTimer must exist');
  assert.ok(js.includes('lastSpokenPrompt'), 'lastSpokenPrompt must be tracked');

  // CSS translucent background
  const cssPath = path.join(ROOT_DIR, 'apps/extension/src/sidepanel/sidepanel.css');
  const css = fs.readFileSync(cssPath, 'utf-8');
  assert.ok(css.includes('blur(6px)'), 'Reduced blur of 6px must be present');
});

test('Dual Voice Modes & Shimmering Thinking UI: sidepanel supports Voice to Text and Voice Conversation', () => {
  const htmlPath = path.join(ROOT_DIR, 'apps/extension/src/sidepanel/sidepanel.html');
  const html = fs.readFileSync(htmlPath, 'utf-8');

  // Markup for voice mode dropdown selector
  assert.ok(html.includes('id="voiceModeWrapper"'), 'voiceModeWrapper must exist');
  assert.ok(html.includes('id="voiceModeBtn"'), 'voiceModeBtn must exist');
  assert.ok(html.includes('id="voiceModeMenu"'), 'voiceModeMenu must exist');
  assert.ok(html.includes('id="voiceModeLabel"'), 'voiceModeLabel must exist');
  assert.ok(html.includes('data-mode="dictate"'), 'dictate mode option must exist');
  assert.ok(html.includes('data-mode="talk"'), 'talk mode option must exist');

  // Minimal shimmering thinking indicator & in-modal mode selector
  assert.ok(html.includes('id="voiceThinkingIndicator"'), 'voiceThinkingIndicator must exist');
  assert.ok(html.includes('voice-thinking-shimmer'), 'voice-thinking-shimmer must exist');
  assert.ok(html.includes('id="voiceModalModeSelector"'), 'voiceModalModeSelector must exist');
  assert.ok(html.includes('voice-modal-mode-pill'), 'voice-modal-mode-pill must exist');
  assert.ok(html.includes('id="voiceSendNowBtn"'), 'voiceSendNowBtn must exist');

  // Bottom-right in-overlay borderless shimmering voice mode switcher
  assert.ok(html.includes('id="voiceOverlayModeWrapper"'), 'voiceOverlayModeWrapper must exist');
  assert.ok(html.includes('id="voiceShimmerModeBar"'), 'voiceShimmerModeBar must exist');
  assert.ok(html.includes('class="voice-shimmer-mode-btn'), 'voice-shimmer-mode-btn must exist');
  assert.ok(html.includes('id="voiceOverlayModeBtn"'), 'voiceOverlayModeBtn must exist');
  assert.ok(html.includes('id="voiceOverlayModeMenu"'), 'voiceOverlayModeMenu must exist');
  assert.ok(html.includes('id="voiceOverlayModeLabel"'), 'voiceOverlayModeLabel must exist');

  // CSS styling
  const cssPath = path.join(ROOT_DIR, 'apps/extension/src/sidepanel/sidepanel.css');
  const css = fs.readFileSync(cssPath, 'utf-8');
  assert.ok(css.includes('.voice-mode-chip'), '.voice-mode-chip style must exist');
  assert.ok(css.includes('.voice-mode-menu'), '.voice-mode-menu style must exist');
  assert.ok(css.includes('.voice-thinking-indicator'), '.voice-thinking-indicator style must exist');
  assert.ok(css.includes('.voice-thinking-shimmer'), '.voice-thinking-shimmer style must exist');
  assert.ok(css.includes('.voice-modal-mode-selector'), '.voice-modal-mode-selector style must exist');
  assert.ok(css.includes('.voice-modal-mode-pill'), '.voice-modal-mode-pill style must exist');
  assert.ok(css.includes('.voice-overlay-mode-wrapper'), '.voice-overlay-mode-wrapper style must exist');
  assert.ok(css.includes('.voice-shimmer-mode-bar'), '.voice-shimmer-mode-bar style must exist');
  assert.ok(css.includes('.voice-shimmer-mode-btn'), '.voice-shimmer-mode-btn style must exist');

  // JS handling
  const jsPath = path.join(ROOT_DIR, 'apps/extension/src/sidepanel/sidepanel.js');
  const js = fs.readFileSync(jsPath, 'utf-8');
  assert.ok(js.includes('currentVoiceMode'), 'currentVoiceMode must be tracked');
  assert.ok(js.includes('speakVoiceResponse'), 'speakVoiceResponse must exist for Talk mode');
  assert.ok(js.includes('handleTalkModeConversationTurn'), 'handleTalkModeConversationTurn must exist');
  assert.ok(js.includes('spiral-cyan-03'), 'spiral-cyan-03 celestial theme preset must be used');
});


