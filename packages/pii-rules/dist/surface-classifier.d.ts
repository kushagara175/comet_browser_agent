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
/**
 * Classifies the active page into a security zone based on URL and optional document hints.
 */
export declare function classifyPageZone(url?: string): PageZone;
/**
 * Determines whether a canvas is a functional interactive map (e.g. Bhuvan, OpenLayers, Leaflet).
 * Functional map canvases must NOT be blacked out, allowing the agent to view spatial layers and map coordinates.
 */
export declare function isFunctionalMapCanvas(el: any, url?: string): boolean;
/**
 * Determines whether a video element represents public media playback rather than a private WebRTC stream.
 */
export declare function isPublicMediaStream(el: any, url?: string): boolean;
/**
 * Determines whether an element on a hybrid platform represents the user's private account shell.
 * (e.g. Account switcher, personal search bar, notification drawer)
 */
export declare function isPrivateAccountShell(el: any): boolean;
//# sourceMappingURL=surface-classifier.d.ts.map