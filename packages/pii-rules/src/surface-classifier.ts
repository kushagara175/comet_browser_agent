/**
 * @privapilot/pii-rules - Intelligent Context & Surface Classifier
 *
 * Implements cognitive surface classification:
 * 1. Distinguishes page security zones:
 *    - PRIVATE_WORKSPACE: Webmail, banking, private chat, medical, HRMS (strict confidential handling)
 *    - HYBRID: YouTube, Twitter/X, GitHub, Amazon (private account tray vs public broadcast feed)
 *    - PUBLIC_BROADCAST: Bhuvan/ISRO, Wikipedia, open data, documentation, news, generic web
 * 2. Recognizes functional interactive map canvases (Bhuvan, OpenLayers, Leaflet, Mapbox, ArcGIS)
 * 3. Distinguishes public media players from private WebRTC camera/telehealth streams (Domain-Agnostic)
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
  /messenger\.com/i,
  /threads\.net\/messages/i,
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
 * Classifies the active page into a security zone based on generic URL path semantics and domain patterns.
 */
export function classifyPageZone(url: string = ''): PageZone {
  const cleanUrl = (url || '').toLowerCase();

  // 1. Generic URL path & keyword semantics (Domain-Agnostic)
  // Paths indicating private personal workspace, direct messaging, webmail, banking, or payroll
  if (
    /(?:\/(?:direct|inbox|messages?|messaging|conversations?|chat|mail|compose|banking|netbanking|payroll|hrms|myaccount|statements|checkout)(?:[/?#]|$))/i.test(cleanUrl)
  ) {
    return 'private_workspace';
  }

  // 2. Domain pattern checks
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

  // Default: Public web content
  return 'public_broadcast';
}

/**
 * Determines whether a canvas is a functional interactive map (e.g. Bhuvan, OpenLayers, Leaflet, Mapbox, ArcGIS).
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

  // 2. Universal DOM Class & Framework checks for OpenLayers, Leaflet, Mapbox, Cesium, ArcGIS, Google Maps
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
      className.includes('esri-view') ||
      className.includes('gm-style') ||
      id.includes('map') ||
      id.includes('bhuvan')
    ) {
      return true;
    }

    if (typeof el.closest === 'function') {
      const parentMap = el.closest(
        '.ol-viewport, .leaflet-container, .mapboxgl-map, .maplibregl-map, .cesium-viewer, .esri-view, .gm-style, #map, #map_canvas, [class*="map-container" i], [id*="bhuvan" i]'
      );
      if (parentMap) return true;
    }
  } catch (_) {}

  return false;
}

/**
 * Determines whether a video element represents public media playback rather than a private WebRTC stream.
 * Purely structural & domain-agnostic: checks HTMLMediaElement properties rather than domain whitelists alone.
 */
export function isPublicMediaStream(el: any, url: string = ''): boolean {
  if (!el) return false;
  const cleanUrl = (url || '').toLowerCase();

  try {
    // 1. Strict WebRTC / Camera Stream Check (Always Fail-Closed)
    // If the video has an active WebRTC srcObject with camera tracks, it is private (e.g. Meet, Zoom, doctor consultation)
    const hasLiveCameraStream = Boolean(el.srcObject && (el.srcObject as any).getVideoTracks?.()?.length > 0);
    if (hasLiveCameraStream) return false;

    // 2. Universal HTML5 Media Attributes & State (Domain-Agnostic)
    const hasControls = Boolean(el.hasAttribute?.('controls') || el.controls === true);
    const hasDuration = typeof el.duration === 'number' && Number.isFinite(el.duration) && el.duration > 0;
    const hasTrackOrSource = Boolean(el.querySelector?.('source, track') || el.hasAttribute?.('poster'));
    const src = (el.src || el.currentSrc || el.getAttribute?.('src') || '').toLowerCase();
    const hasMediaSrc = src.startsWith('http://') || src.startsWith('https://') || src.startsWith('blob:');
    const isPlayerClass =
      (el.className || '').includes('video-stream') ||
      (el.className || '').includes('html5-main-video') ||
      (el.className || '').includes('vjs-tech') ||
      (el.className || '').includes('jw-video');

    if ((hasControls || hasDuration || hasTrackOrSource || isPlayerClass) && hasMediaSrc) {
      return true;
    }

    // 3. Known Public video streaming domains (secondary fast-path)
    const isStreamingDomain =
      cleanUrl.includes('youtube.com') ||
      cleanUrl.includes('youtu.be') ||
      cleanUrl.includes('vimeo.com') ||
      cleanUrl.includes('twitch.tv') ||
      cleanUrl.includes('dailymotion.com');
    if (isStreamingDomain && (hasMediaSrc || isPlayerClass)) {
      return true;
    }
  } catch (_) {}

  return false;
}

/**
 * Determines whether an element is located inside a private direct message / chat / conversation surface.
 * Domain-agnostic: applies to Instagram Direct, X Messages, LinkedIn Messaging, WhatsApp Web, Slack, etc.
 */
export function isPrivateMessagingSurface(el: any, url: string = ''): boolean {
  if (!el) return false;
  const cleanUrl = (url || el.ownerDocument?.defaultView?.location?.href || el.baseURI || '').toLowerCase();
  if (/(?:\/(?:direct|inbox|messages?|messaging|conversations?|chat)(?:[/?#]|$))/i.test(cleanUrl)) {
    return true;
  }

  try {
    if (typeof el.closest === 'function') {
      const container = el.closest(
        '[data-testid*="conversation" i], [data-testid*="message" i], [data-testid*="chat" i], [data-testid*="direct" i], [class*="conversation" i], [class*="message-list" i], [class*="chat-list" i], [class*="msg-thread" i], [class*="direct-inbox" i], [aria-label*="Direct" i], [aria-label*="Messages" i], [aria-label*="Chats" i], [aria-label*="Thread" i], [aria-label*="Inbox" i]'
      );
      if (container) return true;
    }
  } catch (_) {}

  return false;
}

/**
 * Determines whether an element on a hybrid platform represents public broadcast post content.
 * Guarantees that private workspaces, messaging surfaces, and user account shells are NEVER treated as public posts.
 */
export function isPublicPostContent(el: any): boolean {
  try {
    if (!el || isPrivateAccountShell(el) || typeof el.closest !== 'function') return false;
    const currentDocUrl = (el.ownerDocument?.defaultView?.location?.href || el.baseURI || '').toLowerCase();

    // Private workspaces have zero public broadcast posts
    if (classifyPageZone(currentDocUrl) === 'private_workspace') {
      return false;
    }

    // Elements in private messaging or chat surfaces are never public posts
    if (isPrivateMessagingSurface(el, currentDocUrl)) {
      return false;
    }

    // On YouTube and public video streaming platforms, all video, thumbnail, and channel content is public broadcast
    if (currentDocUrl.includes('youtube.com') || currentDocUrl.includes('youtu.be') || currentDocUrl.includes('vimeo.com') || currentDocUrl.includes('twitch.tv')) {
      return !isPrivateAccountShell(el);
    }
    // On X (Twitter), only posts in the primary feed/timeline/bookmarks/history column outside /messages are public broadcast
    if ((currentDocUrl.includes('x.com') || currentDocUrl.includes('twitter.com')) && !currentDocUrl.includes('/messages')) {
      const inPrimaryFeed = el.closest('[data-testid="primaryColumn"], [data-testid="cellInnerDiv"], [data-testid="tweet"], [data-testid="Tweet-User-Avatar"], article, [role="article"], [aria-label*="Timeline" i], main, [role="main"]');
      if (inPrimaryFeed && !isPrivateAccountShell(el)) {
        return true;
      }
    }
    // On Instagram, posts in the primary feed, reels, and explore outside /direct and /messages are public broadcast
    if (currentDocUrl.includes('instagram.com') && !currentDocUrl.includes('/direct') && !currentDocUrl.includes('/messages')) {
      const inInstagramFeed = el.closest('article, [role="article"], [role="feed"], .feed, main, [role="main"], section, [data-testid*="post" i]');
      if (inInstagramFeed && !isPrivateAccountShell(el)) {
        return true;
      }
    }
    // On Reddit, LinkedIn, Facebook, and Threads outside messaging
    if (
      (currentDocUrl.includes('reddit.com') || currentDocUrl.includes('linkedin.com') || currentDocUrl.includes('threads.net')) &&
      !currentDocUrl.includes('/messages') && !currentDocUrl.includes('/messaging')
    ) {
      const inSocialFeed = el.closest('article, [role="article"], [role="feed"], .feed, main, [role="main"], shreddit-post, [data-testid="post-container"]');
      if (inSocialFeed && !isPrivateAccountShell(el)) {
        return true;
      }
    }
    const post = el.closest(
      'article, [role="article"], [data-testid="tweet"], [data-testid="cellInnerDiv"], [data-testid="primaryColumn"], [data-testid="Tweet-User-Avatar"], [data-testid="tweetText"], [data-testid="UserCell"], [data-testid="sidebarColumn"], aside, [aria-label*="who to follow" i], [aria-label*="timeline" i], [aria-label*="trending" i], ytd-comment-thread-renderer, ytd-rich-item-renderer, ytd-rich-grid-media, ytd-rich-grid-row, ytd-video-renderer, ytd-compact-video-renderer, ytd-grid-video-renderer, ytd-thumbnail, ytd-channel-name, #related, #contents, #items, .comment-body, .comment, shreddit-post, shreddit-comment, [data-testid="post-container"], .TimelineItem, .repo-list, [role="feed"], .feed'
    );
    return Boolean(post && !isPrivateAccountShell(post));
  } catch (_) {
    return false;
  }
}

export function isPrivateAccountShell(el: any): boolean {
  if (!el) return false;
  try {
    const aria = (el.getAttribute?.('aria-label') || '').toLowerCase();
    const testId = (el.getAttribute?.('data-testid') || '').toLowerCase();
    const id = (el.id || '').toLowerCase();
    const title = (el.getAttribute?.('title') || '').toLowerCase();
    const className = String(el.className || '').toLowerCase();

    // Specific private account switcher buttons / sign out / switch account controls ONLY
    if (
      aria.includes('google account') ||
      aria.includes('account menu') ||
      aria.includes('switch account') ||
      aria.includes('sign out') ||
      testId === 'sidenav_accountswitcher_button' ||
      testId.includes('accountswitcher') ||
      testId === 'user-menu' ||
      id === 'avatar-btn'
    ) {
      return true;
    }

    if (typeof el.closest === 'function') {
      const container = el.closest(
        '#avatar-btn, [data-testid*="accountswitcher" i], [aria-label*="Google Account" i], [aria-label*="Account menu" i], [aria-label*="Switch account" i], [class*="accountswitcher" i], [data-testid*="user-menu" i]'
      );
      if (container) return true;

      // In header: only classify as account button if it explicitly targets user account, profile, or avatar
      const inHeader = el.closest('header, [role="banner"]');
      if (inHeader) {
        const hasPopup = Boolean(el.hasAttribute?.('aria-haspopup') || el.getAttribute?.('aria-haspopup'));
        const isAccountSpecific =
          aria.includes('account') ||
          aria.includes('profile') ||
          aria.includes('avatar') ||
          aria.includes('user') ||
          title.includes('account') ||
          title.includes('profile') ||
          testId.includes('profile') ||
          testId.includes('user') ||
          className.includes('user-profile') ||
          className.includes('account-btn');
        if (hasPopup && isAccountSpecific) {
          return true;
        }
      }
    }
  } catch (_) {}

  return false;
}
