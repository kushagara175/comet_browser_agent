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
  assert.ok(html.includes('id="voiceShimmerToggleBtn"'), 'voiceShimmerToggleBtn must exist');
  assert.ok(html.includes('id="voiceShimmerActiveText"'), 'voiceShimmerActiveText must exist');
  assert.ok(html.includes('class="voice-shimmer-mode-btn'), 'voice-shimmer-mode-btn must exist');
  assert.ok(html.includes('id="voiceOverlayModeBtn"'), 'voiceOverlayModeBtn must exist');
  assert.ok(html.includes('id="voiceOverlayModeMenu"'), 'voiceOverlayModeMenu must exist');
  assert.ok(html.includes('id="voiceOverlayModeLabel"'), 'voiceOverlayModeLabel must exist');

  // Minimal circular SVG send button markup
  assert.ok(html.includes('<svg width="15" height="15"'), 'voiceSendNowBtn must contain minimal SVG send icon');

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
  assert.ok(css.includes('.voice-send-now-btn'), '.voice-send-now-btn style must exist');

  // JS handling
  const jsPath = path.join(ROOT_DIR, 'apps/extension/src/sidepanel/sidepanel.js');
  const js = fs.readFileSync(jsPath, 'utf-8');
  assert.ok(js.includes('currentVoiceMode'), 'currentVoiceMode must be tracked');
  assert.ok(js.includes('voiceShimmerToggleBtn'), 'voiceShimmerToggleBtn must be wired');
  assert.ok(js.includes('speakVoiceResponse'), 'speakVoiceResponse must exist for Talk mode');
  assert.ok(js.includes('handleTalkModeConversationTurn'), 'handleTalkModeConversationTurn must exist');
  assert.ok(js.includes('spiral-cyan-03'), 'spiral-cyan-03 celestial theme preset must be used');
});

test('VoiceBeam Sound & Typing Reactive Live Glow: voice-beam.js module integrity and sidepanel integration', async () => {
  const beamModulePath = path.join(ROOT_DIR, 'apps/extension/src/sidepanel/voice-beam.js');
  assert.ok(fs.existsSync(beamModulePath), 'voice-beam.js must exist in sidepanel directory');

  const beamModule = await import(beamModulePath);
  assert.equal(typeof beamModule.initVoiceBeam, 'function', 'initVoiceBeam must be exported as a function');
  assert.equal(typeof beamModule.generateVoiceCss, 'function', 'generateVoiceCss must be exported as a function');
  assert.ok(Array.isArray(beamModule.voiceLobes), 'voiceLobes must be an array');
  assert.equal(beamModule.voiceLobes.length, 7, 'voiceLobes must contain 7 lobes');
  assert.ok(beamModule.voicePalettes.colorful, 'colorful palette must exist');

  const css = beamModule.generateVoiceCss('test-id', { borderRadius: 22 });
  assert.ok(css.includes('[data-voice-beam="test-id"]'), 'Generated CSS must include data-voice-beam selector');
  assert.ok(css.includes('--vb-h-test-id'), 'Generated CSS must include height custom property');
  assert.ok(css.includes('--vb-w-test-id'), 'Generated CSS must include width custom property');

  // Verify HTML markup
  const htmlPath = path.join(ROOT_DIR, 'apps/extension/src/sidepanel/sidepanel.html');
  const html = fs.readFileSync(htmlPath, 'utf-8');
  assert.ok(html.includes('data-voice-beam="privapilot-beam"'), 'beamChatCard must have data-voice-beam attribute');
  assert.ok(html.includes('data-voice-beam-bloom'), 'bloom element must exist');
  assert.ok(html.includes('data-voice-beam-band'), 'canvas band element must exist');
  assert.ok(html.includes('placeholder="Ask me anything.."'), 'chatInput placeholder must be "Ask me anything.."');

  // Verify JS wiring
  const jsPath = path.join(ROOT_DIR, 'apps/extension/src/sidepanel/sidepanel.js');
  const js = fs.readFileSync(jsPath, 'utf-8');
  assert.ok(js.includes('voice-beam.js'), 'sidepanel.js must import voice-beam.js');
  assert.ok(js.includes('triggerTypingPulse'), 'sidepanel.js must call triggerTypingPulse on keystroke');
  assert.ok(js.includes('setProcessing'), 'sidepanel.js must wire setProcessing for agent execution');
});

test('Orb Section VoiceBeam Footer Glow: orbVoiceBeamFooter markup, CSS, and live audio sync', async () => {
  const htmlPath = path.join(ROOT_DIR, 'apps/extension/src/sidepanel/sidepanel.html');
  const html = fs.readFileSync(htmlPath, 'utf-8');
  assert.ok(html.includes('id="orbVoiceBeamFooter"'), 'orbVoiceBeamFooter must exist in sidepanel.html');
  assert.ok(html.includes('orb-voice-beam-footer'), 'orb-voice-beam-footer class must exist');
  assert.ok(html.includes('data-voice-beam="orb-footer-beam"'), 'data-voice-beam attribute for orb footer must exist');

  // Image 2 bottom controls
  assert.ok(html.includes('id="voiceAgentModePill"'), 'voiceAgentModePill must exist');
  assert.ok(html.includes('id="voiceMicActionBtn"'), 'voiceMicActionBtn must exist');
  assert.ok(html.includes('id="voiceCloseActionBtn"'), 'voiceCloseActionBtn must exist');

  const cssPath = path.join(ROOT_DIR, 'apps/extension/src/sidepanel/sidepanel.css');
  const css = fs.readFileSync(cssPath, 'utf-8');
  assert.ok(css.includes('.orb-voice-beam-footer'), '.orb-voice-beam-footer CSS rule must exist');
  assert.ok(css.includes('height: 84px'), 'orb-voice-beam-footer must be confined to 84px bottom rim');
  assert.ok(css.includes('.voice-modal-bottom-bar'), '.voice-modal-bottom-bar must exist');
  assert.ok(css.includes('.voice-mic-circle-btn'), '.voice-mic-circle-btn must exist');
  assert.ok(css.includes('.voice-close-circle-btn'), '.voice-close-circle-btn must exist');

  const jsPath = path.join(ROOT_DIR, 'apps/extension/src/sidepanel/sidepanel.js');
  const js = fs.readFileSync(jsPath, 'utf-8');
  assert.ok(js.includes('orbVoiceBeamFooter'), 'sidepanel.js must reference orbVoiceBeamFooter');
  assert.ok(js.includes('__orbVoiceBeamEngine'), 'sidepanel.js must track __orbVoiceBeamEngine');
  assert.ok(js.includes('setAudioLevel(computedLevel)'), 'sidepanel.js must drive footer beam with computed audio level in sync with orb');
  assert.ok(js.includes('voiceCloseActionBtn'), 'sidepanel.js must wire voiceCloseActionBtn');
  assert.ok(js.includes('voiceMicActionBtn'), 'sidepanel.js must wire voiceMicActionBtn');
  assert.ok(js.includes('voiceAgentModePill'), 'sidepanel.js must wire voiceAgentModePill');

  const beamModulePath = path.join(ROOT_DIR, 'apps/extension/src/sidepanel/voice-beam.js');
  const beamModule = await import(beamModulePath);
  assert.ok(beamModule.voicePresets?.mobile, 'voicePresets must define mobile preset');
  assert.equal(beamModule.voicePresets.mobile.reach, 1.25, 'mobile preset reach must be 1.25');
});

test('Soothing Auroral Bloom & Processing Travel Beam: voice-beam.js renders authentic chromatic aberration canvas and gathers lobes during processing', async () => {
  const beamModulePath = path.join(ROOT_DIR, 'apps/extension/src/sidepanel/voice-beam.js');
  const beamModule = await import(beamModulePath);

  // Voice presets have authentic bandStrength matching libraries.dev specification
  assert.equal(beamModule.voicePresets.default.bandStrength, 1.55, 'default bandStrength must match libraries.dev specification (1.55)');
  assert.equal(beamModule.voicePresets.default.processingTravel, 1.55, 'processingTravel must match voice-glow specification (1.55)');
  assert.equal(beamModule.voicePresets.default.processingCurve, 2.1, 'processingCurve must match voice-glow specification (2.1)');

  // Chromatic band colors match libraries.dev optical dispersion
  assert.equal(beamModule.defaultBandColors.above, '255, 70, 80');
  assert.equal(beamModule.defaultBandColors.mid, '90, 255, 150');
  assert.equal(beamModule.defaultBandColors.below, '80, 140, 255');
  assert.equal(beamModule.defaultBandColors.core, '255, 255, 255');

  // Generated CSS has proper blur and canvas positioning
  const css = beamModule.generateVoiceCss('soothing-test', { borderRadius: 22 });
  assert.ok(css.includes('filter: blur(10px)'), 'Bloom layer must have 10px Gaussian blur for default preset');
  assert.ok(css.includes('--vb-band-blur-soothing-test'), 'Band layer must have dynamic --vb-band-blur property');

  // Mobile preset for Orb Footer eliminates divagation / column lines with 16px bloom blur and authentic radial lobes without flat linear washes
  const mobileCss = beamModule.generateVoiceCss('mobile-test', { type: 'mobile', borderRadius: 0 });
  assert.ok(mobileCss.includes('filter: blur(16px)'), 'Mobile bloom layer must have 16px Gaussian blur for soothing auroral bloom');
  assert.ok(mobileCss.includes('radial-gradient(ellipse'), 'CSS must use authentic radial gradient lobes');
  assert.equal(beamModule.voicePresets.mobile.lobeSpacing, 1.05, 'mobile lobeSpacing must be 1.05 for continuous lobe overlap');

  // Sidepanel CSS has eliminated the 2.5px line pseudo-element and has radial bottom mask
  const cssPath = path.join(ROOT_DIR, 'apps/extension/src/sidepanel/sidepanel.css');
  const spCss = fs.readFileSync(cssPath, 'utf-8');
  assert.ok(spCss.includes('.voice-glow-backdrop::after'), 'voice-glow-backdrop::after selector exists');
  assert.ok(spCss.includes('display: none !important'), 'voice-glow-backdrop::after must be disabled with display: none !important');
  assert.ok(spCss.includes('radial-gradient(ellipse 260px 84px at 50% 100%'), 'orb-voice-beam-footer must have radial bottom rim mask');
  assert.ok(spCss.includes('display: none !important;\n  position: absolute !important;\n  inset: 0 !important;\n  width: 100% !important;\n  height: 100% !important;\n  pointer-events: none !important;\n  z-index: 3 !important;'), 'orb-voice-beam-footer canvas must be hidden to eliminate stroke wire lines');
});

test('Unified Action Button: sendBtn and stopBtn conversion with Image 2 rotating BorderBeam and rounded stop square', () => {
  const htmlPath = path.join(ROOT_DIR, 'apps/extension/src/sidepanel/sidepanel.html');
  const html = fs.readFileSync(htmlPath, 'utf-8');
  assert.ok(html.includes('id="stopBtn" class="stop-btn chat-circle-btn beam-stop-btn hidden"'), 'stopBtn must initially be hidden in HTML');
  assert.ok(html.includes('class="icon-stop-sq"'), 'stopBtn must contain rounded square stop icon from Image 2');

  const cssPath = path.join(ROOT_DIR, 'apps/extension/src/sidepanel/sidepanel.css');
  const css = fs.readFileSync(cssPath, 'utf-8');
  assert.ok(css.includes('.beam-stop-btn.hidden'), '.beam-stop-btn.hidden rule must exist');
  assert.ok(css.includes('stopBtnBeamRotate'), 'stopBtnBeamRotate animation for rotating rainbow border must exist');
  assert.ok(css.includes('conic-gradient(from var(--stop-beam-angle, 0deg)'), 'conic-gradient BorderBeam must wrap stop button');

  const jsPath = path.join(ROOT_DIR, 'apps/extension/src/sidepanel/sidepanel.js');
  const js = fs.readFileSync(jsPath, 'utf-8');
  assert.ok(js.includes("stopBtn.style.display = 'inline-flex'"), 'setAgentStatus must show stopBtn when isRunning');
  assert.ok(js.includes("sendBtn.style.display = 'none'"), 'setAgentStatus must hide sendBtn when isRunning');
  assert.ok(js.includes("stopBtn.style.display = 'none'"), 'setAgentStatus must hide stopBtn when idle');
  assert.ok(js.includes("sendBtn.style.display = 'inline-flex'"), 'setAgentStatus must show sendBtn when idle');
});

test('Single Voice Mode Pill & Exact Chat VoiceBeam Auroral Gradient in Orb Section: Mute & Cross removed, single pill displayed, and voice reactivity verified', () => {
  const htmlPath = path.join(ROOT_DIR, 'apps/extension/src/sidepanel/sidepanel.html');
  const html = fs.readFileSync(htmlPath, 'utf-8');
  assert.ok(html.includes('id="orbVoiceGlowBackdrop"'), 'orbVoiceGlowBackdrop must exist in HTML');
  assert.ok(html.includes('class="voice-glow-backdrop orb-voice-glow-backdrop"'), 'orbVoiceGlowBackdrop must use voice-glow-backdrop class');
  assert.ok(html.includes('id="voiceAgentModePill"'), 'single voiceAgentModePill must exist in bottom bar');

  const cssPath = path.join(ROOT_DIR, 'apps/extension/src/sidepanel/sidepanel.css');
  const css = fs.readFileSync(cssPath, 'utf-8');
  assert.ok(css.includes('.orb-voice-glow-backdrop'), '.orb-voice-glow-backdrop style must exist');
  assert.ok(css.includes('radial-gradient(ellipse 85px 50px at 26% 100%, rgba(244, 63, 94, 0.72)'), 'orb auroral gradient must use exact 5-ellipse radial colors matching chat box');
  assert.ok(css.includes('.voice-modal-action-group {\n  display: none !important;\n}'), 'voice-modal-action-group must be hidden with display: none !important (removing mute and cross)');
  assert.ok(css.includes('.voice-modal-bottom-bar {\n  position: absolute;\n  bottom: 24px;\n  left: 0;\n  right: 0;\n  display: flex;\n  align-items: center;\n  justify-content: flex-start;'), 'voice-modal-bottom-bar must align single pill to bottom-left');

  const jsPath = path.join(ROOT_DIR, 'apps/extension/src/sidepanel/sidepanel.js');
  const js = fs.readFileSync(jsPath, 'utf-8');
  assert.ok(js.includes("voiceAgentPillLabel.textContent = currentVoiceMode === 'talk' ? 'Live Conversation' : 'Voice to Text'"), 'voiceAgentPillLabel must toggle cleanly between Live Conversation and Voice to Text');
  assert.ok(js.includes('orbVoiceGlowEl.style.setProperty(\'--orb-voice-glow-scale\''), 'sidepanel.js must drive --orb-voice-glow-scale dynamically on voice input');
  assert.ok(js.includes('orbVoiceGlowEl.style.setProperty(\'--orb-voice-glow-height\''), 'sidepanel.js must drive --orb-voice-glow-height dynamically on voice input');
});

