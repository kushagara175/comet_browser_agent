/**
 * @privapilot/extension - Context-Aware Cognitive Privacy, Bhuvan Maps & Public Media Tests
 */

import test from 'node:test';
import assert from 'node:assert';
import {
  classifyPageZone,
  isFunctionalMapCanvas,
  isPublicMediaStream,
  isPrivateAccountShell
} from '../packages/pii-rules/dist/surface-classifier.js';
import { validateSanitizedPayload } from '../apps/server/dist/schemas/payload-validator.js';

test('Context Classifier: Correctly identifies private workspaces, hybrid platforms, and public broadcast', () => {
  // 1. Private Workspaces (Mails, Chats, Banking, HRMS, Direct Messages)
  assert.strictEqual(classifyPageZone('https://mail.google.com/mail/u/0/#inbox'), 'private_workspace');
  assert.strictEqual(classifyPageZone('https://outlook.live.com/mail/0/'), 'private_workspace');
  assert.strictEqual(classifyPageZone('https://web.whatsapp.com/'), 'private_workspace');
  assert.strictEqual(classifyPageZone('https://app.slack.com/client/T123/C456'), 'private_workspace');
  assert.strictEqual(classifyPageZone('https://www.instagram.com/direct/inbox/'), 'private_workspace');
  assert.strictEqual(classifyPageZone('https://www.instagram.com/direct/t/17841400000000000/'), 'private_workspace');
  assert.strictEqual(classifyPageZone('https://x.com/messages'), 'private_workspace');
  assert.strictEqual(classifyPageZone('https://www.linkedin.com/messaging/'), 'private_workspace');
  assert.strictEqual(classifyPageZone('https://www.messenger.com/t/12345'), 'private_workspace');
  assert.strictEqual(classifyPageZone('https://netbanking.hdfcbank.com/netbanking/'), 'private_workspace');
  assert.strictEqual(classifyPageZone('https://myworkday.com/company/d/home.htmld'), 'private_workspace');

  // 2. Hybrid Consumer Platforms (User Shell + Public Broadcast Feed)
  assert.strictEqual(classifyPageZone('https://www.youtube.com/watch?v=la-Gd3rjXMs'), 'hybrid');
  assert.strictEqual(classifyPageZone('https://x.com/isro/status/12345'), 'hybrid');
  assert.strictEqual(classifyPageZone('https://github.com/kushagara175/Browser_agent_harness'), 'hybrid');
  assert.strictEqual(classifyPageZone('https://www.amazon.in/dp/B08N5W4NNB'), 'hybrid');

  // 3. Public Broadcast Portals (ISRO, Bhuvan, Knowledge, Docs)
  assert.strictEqual(classifyPageZone('https://bhuvan.nrsc.gov.in/bhuvan_geoportal.php'), 'public_broadcast');
  assert.strictEqual(classifyPageZone('https://bhuvan-app1.nrsc.gov.in/thematic'), 'public_broadcast');
  assert.strictEqual(classifyPageZone('https://www.isro.gov.in/Missions.html'), 'public_broadcast');
  assert.strictEqual(classifyPageZone('https://en.wikipedia.org/wiki/Indian_Space_Research_Organisation'), 'public_broadcast');
  assert.strictEqual(classifyPageZone('https://sih.gov.in/sih2024PS'), 'public_broadcast');
});

test('Geospatial Maps: Bhuvan and OpenLayers/Leaflet canvases are recognized as functional map surfaces', () => {
  // 1. Canvas on Bhuvan URL
  const mockBhuvanCanvas = { className: 'ol-unselectable', id: 'bhuvan_map_canvas' };
  assert.strictEqual(isFunctionalMapCanvas(mockBhuvanCanvas, 'https://bhuvan.nrsc.gov.in/bhuvan_geoportal.php'), true);

  // 2. OpenLayers canvas
  const mockOlCanvas = {
    className: 'ol-layer',
    closest(selector) {
      return selector.includes('ol-viewport') ? { id: 'map' } : null;
    }
  };
  assert.strictEqual(isFunctionalMapCanvas(mockOlCanvas, 'https://example.com/map'), true);

  // 3. Leaflet canvas
  const mockLeafletCanvas = {
    className: 'leaflet-zoom-animated',
    closest(selector) {
      return selector.includes('leaflet-container') ? { id: 'leaflet-map' } : null;
    }
  };
  assert.strictEqual(isFunctionalMapCanvas(mockLeafletCanvas, 'https://example.com/spatial'), true);

  // 4. Non-map canvas (e.g. game or signature pad)
  const mockOtherCanvas = {
    className: 'game-canvas',
    id: 'game-viewport',
    closest() { return null; }
  };
  assert.strictEqual(isFunctionalMapCanvas(mockOtherCanvas, 'https://example.com/game'), false);
});

test('Public Media: Public YouTube/Vimeo video elements are distinguished from WebRTC camera feeds', () => {
  // 1. YouTube video player
  const mockYtVideo = {
    className: 'video-stream html5-main-video',
    src: 'https://rr3---sn-4g5edn6y.googlevideo.com/videoplayback?expire=123',
    srcObject: null
  };
  assert.strictEqual(isPublicMediaStream(mockYtVideo, 'https://www.youtube.com/watch?v=la-Gd3rjXMs'), true);

  // 2. WebRTC Live Camera Stream (e.g. Telehealth / Meeting)
  const mockWebRtcVideo = {
    className: 'camera-preview',
    srcObject: {
      getVideoTracks() { return [{ kind: 'video' }]; }
    }
  };
  assert.strictEqual(isPublicMediaStream(mockWebRtcVideo, 'https://www.youtube.com/watch?v=la-Gd3rjXMs'), false);
});

test('Private Account Shell: User menu and Google account buttons on hybrid sites are identified', () => {
  const mockUserMenu = {
    getAttribute(attr) {
      if (attr === 'aria-label') return 'Google Account: Kushagra Singh (kushagra@gmail.com)';
      return null;
    }
  };
  assert.strictEqual(isPrivateAccountShell(mockUserMenu), true);

  const mockPublicLink = {
    getAttribute(attr) {
      if (attr === 'aria-label') return 'Watch next video';
      return null;
    }
  };
  assert.strictEqual(isPrivateAccountShell(mockPublicLink), false);

  const mockNavDropdown = {
    getAttribute(attr) {
      if (attr === 'aria-haspopup') return 'true';
      if (attr === 'title') return 'Engagements';
      return null;
    },
    hasAttribute(attr) { return attr === 'aria-haspopup'; },
    closest(selector) { return selector.includes('header') ? { tagName: 'HEADER' } : null; }
  };
  assert.strictEqual(isPrivateAccountShell(mockNavDropdown), false, 'Header navigation dropdown must NOT be classified as account shell');
});

test('Closed Schema Validator: Accepts valid pageState.pageZone and rejects invalid zone strings', () => {
  const validPayload = {
    protocolVersion: '1.0',
    runId: 'run_123',
    goal: 'Explore Bhuvan portal',
    screenshot: 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==',
    elements: [
      {
        localId: 'el_1',
        role: 'button',
        sanitizedName: '2D / 3D Map',
        coarseBounds: [0.1, 0.2, 0.3, 0.4],
        state: ['enabled', 'visible'],
        actionCapabilities: ['click']
      }
    ],
    pageState: {
      title: 'Bhuvan 2D / 3D Map Viewer',
      viewport: [1280, 720],
      domain: 'bhuvan.nrsc.gov.in',
      url: 'https://bhuvan.nrsc.gov.in/bhuvan_geoportal.php',
      pageZone: 'public_broadcast',
      contentSummaries: ['Map Surface: Bhuvan 2D/3D Satellite Viewer']
    }
  };

  const validRes = validateSanitizedPayload(validPayload);
  assert.strictEqual(validRes.isValid, true, `Payload should be valid: ${validRes.errorMessage}`);

  // Invalid zone
  const invalidPayload = {
    ...validPayload,
    pageState: {
      ...validPayload.pageState,
      pageZone: 'super_secret_zone'
    }
  };
  const invalidRes = validateSanitizedPayload(invalidPayload);
  assert.strictEqual(invalidRes.isValid, false);
  assert.ok(invalidRes.errorMessage?.includes('pageState.pageZone'));
});
