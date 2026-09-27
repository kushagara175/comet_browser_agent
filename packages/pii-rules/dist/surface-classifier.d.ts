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
/**
 * Classifies the active page into a security zone based on generic URL path semantics and domain patterns.
 */
export declare function classifyPageZone(url?: string): PageZone;
/**
 * Determines whether a canvas is a functional interactive map (e.g. Bhuvan, OpenLayers, Leaflet, Mapbox, ArcGIS).
 * Functional map canvases must NOT be blacked out, allowing the agent to view spatial layers and map coordinates.
 */
export declare function isFunctionalMapCanvas(el: any, url?: string): boolean;
/**
 * Determines whether a video element represents public media playback rather than a private WebRTC stream.
 * Purely structural & domain-agnostic: checks HTMLMediaElement properties rather than domain whitelists alone.
 */
export declare function isPublicMediaStream(el: any, url?: string): boolean;
/**
 * Determines whether an element is located inside a private direct message / chat / conversation surface.
 * Domain-agnostic: applies to Instagram Direct, X Messages, LinkedIn Messaging, WhatsApp Web, Slack, etc.
 */
export declare function isPrivateMessagingSurface(el: any, url?: string): boolean;
/**
 * Determines whether an element on a hybrid platform represents public broadcast post content.
 * Guarantees that private workspaces, messaging surfaces, and user account shells are NEVER treated as public posts.
 */
export declare function isPublicPostContent(el: any): boolean;
export declare function isPrivateAccountShell(el: any): boolean;
//# sourceMappingURL=surface-classifier.d.ts.map