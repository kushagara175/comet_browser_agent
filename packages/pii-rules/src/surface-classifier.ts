/**
 * @privapilot/pii-rules - Intelligent Context & Surface Classifier
 *
 * Implements cognitive surface classification:
 * 1. Distinguishes page security zones:
 *    - PRIVATE_WORKSPACE: Webmail, banking, private chat, medical, HRMS (strict confidential handling)
 *    - HYBRID: YouTube, Twitter/X, GitHub, Amazon (private account tray vs public broadcast feed)
 *    - PUBLIC_BROADCAST: Bhuvan/ISRO, Wikipedia, open data, documentation, news
 * 2. Recognizes functional interactive map canvases (Bhuvan OpenLayers/Leaflet) to prevent blackout
 * 3. Distinguishes public media players from private WebRTC camera/telehealth streams
 * 4. Identifies private account shells on hybrid platforms
 */

export type PageZone = 'private_workspace' | 'hybrid' | 'public_broadcast';

const PRIVATE_WORKSPACE_PATTERNS = [
  // Webmail
  /mail\.google\.com/i,
  /outlook\.(?:live|office|office365)\.com/i,
  /mail\.yahoo\.com/i,
  /mail\.proton\.me/i,
  /mail\.zoho\.com/i,
  // Private messaging & team collaboration
  /web\.whatsapp\.com/i,
  /app\.slack\.com/i,
  /discord\.com\/channels/i,
  /teams\.microsoft\.com/i,
  /web\.telegram\.org/i,
  // Banking & Financial
  /netbanking/i,
  /banking/i,
  /hdfcbank\.com/i,
  /icicibank\.com/i,
  /onlinesbi\.sbi/i,
  /chase\.com/i,
  /bankofamerica\.com/i,
  /wellsfargo\.com/i,
  /paypal\.com\/(?:myaccount|signin)/i,
  /incometax\.gov\.in/i,
  // HRMS, Payroll & Corporate internal
  /workday\.com/i,
  /myworkday/i,
  /darwinbox/i,
  /keka\.com/i,
  /greenhouse\.io/i,
  /bamboohr\.com/i,
  // Healthcare & Telehealth
  /mychart/i,
  /patientportal/i,
  /practo\.com\/consult/i
];

const HYBRID_PLATFORM_PATTERNS = [
  /youtube\.com/i,
  /youtu\.be/i,
  /x\.com/i,
  /twitter\.com/i,
  /linkedin\.com/i,
  /github\.com/i,
  /gitlab\.com/i,
  /reddit\.com/i,
  /instagram\.com/i,
  /facebook\.com/i,
  /amazon\.[a-z.]+/i,
  /flipkart\.com/i,
  /myntra\.com/i,
  /ebay\.[a-z.]+/i
];

const PUBLIC_BROADCAST_PATTERNS = [
  // ISRO & Geospatial Portals
  /bhuvan.*\.nrsc\.gov\.in/i,
  /bhuvan\.gov\.in/i,
  /isro\.gov\.in/i,
  /mosdac\.gov\.in/i,
  /vedas\.sac\.gov\.in/i,
  /bhoonidhi\.nrsc\.gov\.in/i,
  // Public Knowledge, Government & News
  /wikipedia\.org/i,
  /sih\.gov\.in/i,
  /data\.gov\.in/i,
  /developer\.mozilla\.org/i,
  /w3schools\.com/i,
  /stackoverflow\.com/i,
  /github\.com\/(?:explore|trending)/i,
  /bbc\.com/i,
  /ndtv\.com/i,
  /thehindu\.com/i
];

/**
 * Classifies the active page into a security zone based on URL and optional document hints.
 */
export function classifyPageZone(url: string = ''): PageZone {
  const cleanUrl = (url || '').toLowerCase();

  for (const pattern of PRIVATE_WORKSPACE_PATTERNS) {
    if (pattern.test(cleanUrl)) {
      return 'private_workspace';
    }
  }

  for (const pattern of HYBRID_PLATFORM_PATTERNS) {
    if (pattern.test(cleanUrl)) {
      return 'hybrid';
    }
  }

  for (const pattern of PUBLIC_BROADCAST_PATTERNS) {
    if (pattern.test(cleanUrl)) {
      return 'public_broadcast';
    }
  }

  return 'public_broadcast';
}

/**
 * Determines whether a canvas is a functional interactive map (e.g. Bhuvan, OpenLayers, Leaflet).
 * Functional map canvases must NOT be blacked out, allowing the agent to view spatial layers and map coordinates.
 */
export function isFunctionalMapCanvas(el: any, url: string = ''): boolean {
  if (!el) return false;
  const cleanUrl = (url || '').toLowerCase();

  // 1. URL-based Bhuvan / ISRO geoportal context
  if (
    cleanUrl.includes('bhuvan') ||
    cleanUrl.includes('nrsc.gov.in') ||
    cleanUrl.includes('isro.gov.in') ||
    cleanUrl.includes('mosdac.gov.in') ||
    cleanUrl.includes('vedas.sac.gov.in') ||
    cleanUrl.includes('bhoonidhi')
  ) {
    return true;
  }

  // 2. DOM Class & Attribute checks for OpenLayers, Leaflet, Mapbox, Cesium
  try {
    const className = String(el.className || '').toLowerCase();
    const id = String(el.id || '').toLowerCase();

    if (
      className.includes('ol-layer') ||
      className.includes('ol-unselectable') ||
      className.includes('leaflet') ||
      className.includes('mapboxgl') ||
      className.includes('maplibregl') ||
      className.includes('cesium') ||
      id.includes('map') ||
      id.includes('bhuvan')
    ) {
      return true;
    }

    if (typeof el.closest === 'function') {
      const parentMap = el.closest(
        '.ol-viewport, .leaflet-container, .mapboxgl-map, .maplibregl-map, .cesium-viewer, #map, #map_canvas, [class*="map-container" i], [id*="bhuvan" i]'
      );
      if (parentMap) return true;
    }
  } catch (_) {}

  return false;
}

/**
 * Determines whether a video element represents public media playback rather than a private WebRTC stream.
 */
export function isPublicMediaStream(el: any, url: string = ''): boolean {
  if (!el) return false;
  const cleanUrl = (url || '').toLowerCase();

  // Public video streaming domains
  const isStreamingDomain =
    cleanUrl.includes('youtube.com') ||
    cleanUrl.includes('youtu.be') ||
    cleanUrl.includes('vimeo.com') ||
    cleanUrl.includes('twitch.tv') ||
    cleanUrl.includes('dailymotion.com');

  if (isStreamingDomain) {
    // If it's a known player element or has an HTTP/blob source, it's public media
    try {
      const src = (el.src || el.currentSrc || el.getAttribute?.('src') || '').toLowerCase();
      const hasHttpOrBlob = src.startsWith('http') || src.startsWith('blob:');
      const isPlayerClass = (el.className || '').includes('video-stream') || (el.className || '').includes('html5-main-video');
      // Ensure it is not an active camera WebRTC streamObject
      const hasLiveCameraStream = Boolean(el.srcObject && (el.srcObject as any).getVideoTracks?.()?.length > 0);
      if (hasLiveCameraStream) return false;

      if (hasHttpOrBlob || isPlayerClass) return true;
    } catch (_) {}
    return true;
  }

  return false;
}

/**
 * Determines whether an element on a hybrid platform represents the user's private account shell.
 * (e.g. Account switcher, personal search bar, notification drawer)
 */
export function isPrivateAccountShell(el: any): boolean {
  if (!el) return false;
  try {
    const aria = (el.getAttribute?.('aria-label') || '').toLowerCase();
    const testId = (el.getAttribute?.('data-testid') || '').toLowerCase();
    const id = (el.id || '').toLowerCase();
    const role = (el.getAttribute?.('role') || '').toLowerCase();

    if (
      aria.includes('google account') ||
      aria.includes('account menu') ||
      aria.includes('switch account') ||
      aria.includes('sign out') ||
      testId.includes('useravatar') ||
      testId.includes('user-menu') ||
      testId.includes('profile-button') ||
      id === 'avatar-btn'
    ) {
      return true;
    }

    if (typeof el.closest === 'function') {
      const container = el.closest(
        '#avatar-btn, [data-testid*="user-menu" i], [aria-label*="Google Account" i], [aria-label*="Account menu" i]'
      );
      if (container) return true;
    }
  } catch (_) {}

  return false;
}
