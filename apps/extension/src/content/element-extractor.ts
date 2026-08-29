/**
 * @privapilot/extension - Content Script DOM Element Extractor
 *
 * Scans the active document, extracts interactive elements and sensitive node descriptors,
 * and assigns ephemeral local IDs (e.g. "el_1", "el_2").
 */

import { ElementRole, ActionCapability } from '@privapilot/protocol';
import { LocalDomSnapshot } from '../sanitizer/pipeline.js';
import { RawDomElementCapture } from '../sanitizer/dom-detector.js';
import { RawTextNodeCapture } from '../sanitizer/text-detector.js';
import { RawImageElementCapture } from '../sanitizer/face-detector.js';
import { RawSurfaceCapture } from '../sanitizer/surface-detector.js';

export class ElementExtractor {
  private elementMap = new Map<string, HTMLElement>();
  private counter = 0;

  extractSnapshot(doc: Document = document): { snapshot: LocalDomSnapshot; elementMap: Map<string, HTMLElement> } {
    this.elementMap.clear();
    this.counter = 0;

    const domElements: RawDomElementCapture[] = [];
    const textNodes: RawTextNodeCapture[] = [];
    const imageElements: RawImageElementCapture[] = [];
    const surfaces: RawSurfaceCapture[] = [];
    const interactiveElements: any[] = [];

    // 1. Extract interactive controls & form inputs
    const candidates = doc.querySelectorAll('button, a, input, select, textarea, [role="button"], [tabindex="0"]');

    candidates.forEach((node) => {
      const el = node as HTMLElement;
      const rect = el.getBoundingClientRect();
      if (rect.width === 0 || rect.height === 0) return; // Skip hidden elements

      this.counter++;
      const localId = `el_${this.counter}`;
      this.elementMap.set(localId, el);

      // Determine role
      let role: ElementRole = 'generic';
      const tag = el.tagName.toLowerCase();
      if (tag === 'button' || el.getAttribute('role') === 'button') role = 'button';
      else if (tag === 'a') role = 'link';
      else if (tag === 'input') {
        const type = (el.getAttribute('type') || 'text').toLowerCase();
        if (type === 'checkbox') role = 'checkbox';
        else if (type === 'radio') role = 'radio';
        else role = 'input';
      } else if (tag === 'select') role = 'select';
      else if (tag === 'textarea') role = 'textarea';

      // Determine capabilities
      const caps: ActionCapability[] = ['click'];
      if (role === 'input' || role === 'textarea') caps.push('type');
      if (role === 'select') caps.push('select');

      const rawName = el.innerText || el.getAttribute('aria-label') || el.getAttribute('placeholder') || el.getAttribute('value') || (el as any).name || '';

      interactiveElements.push({
        localId,
        role,
        rawName,
        boundingBox: { x: rect.x, y: rect.y, width: rect.width, height: rect.height },
        state: ['visible', (el as any).disabled ? 'disabled' : 'enabled'],
        actionCapabilities: caps
      });

      // Also record descriptor for DOM sensitivity analysis
      if (tag === 'input' || tag === 'textarea' || tag === 'select') {
        domElements.push({
          id: localId,
          descriptor: {
            tagName: tag,
            type: el.getAttribute('type') || undefined,
            name: el.getAttribute('name') || undefined,
            id: el.id || undefined,
            autocomplete: el.getAttribute('autocomplete') || undefined,
            placeholder: el.getAttribute('placeholder') || undefined,
            ariaLabel: el.getAttribute('aria-label') || undefined,
            value: (el as any).value || undefined
          },
          boundingClientRect: { x: rect.x, y: rect.y, width: rect.width, height: rect.height }
        });
      }
    });

    // 2. Extract Visible Text Nodes
    const textWalker = doc.createTreeWalker(doc.body || doc.documentElement, NodeFilter.SHOW_TEXT);
    let textNode: Node | null = textWalker.nextNode();
    let textIdx = 0;

    while (textNode) {
      const content = textNode.nodeValue?.trim();
      if (content && content.length > 2) {
        const parent = textNode.parentElement;
        if (parent && parent.tagName !== 'SCRIPT' && parent.tagName !== 'STYLE') {
          const rect = parent.getBoundingClientRect();
          if (rect.width > 0 && rect.height > 0) {
            textIdx++;
            textNodes.push({
              id: `txt_${textIdx}`,
              text: content,
              boundingClientRect: { x: rect.x, y: rect.y, width: rect.width, height: rect.height }
            });
          }
        }
      }
      textNode = textWalker.nextNode();
    }

    // 3. Extract Images / Avatars for Face Detection
    const images = doc.querySelectorAll('img, svg, .avatar, [class*="avatar"], [class*="profile"]');
    images.forEach((img, idx) => {
      const el = img as HTMLElement;
      const rect = el.getBoundingClientRect();
      if (rect.width > 0 && rect.height > 0) {
        const isAvatar = (el.className || '').toLowerCase().includes('avatar') || (el.className || '').toLowerCase().includes('profile');
        imageElements.push({
          id: `img_${idx + 1}`,
          isProfilePhotoOrAvatar: isAvatar,
          boundingClientRect: { x: rect.x, y: rect.y, width: rect.width, height: rect.height }
        });
      }
    });

    // 4. Extract High-Risk Uninspectable Surfaces
    const canvases = doc.querySelectorAll('canvas');
    canvases.forEach((c, idx) => {
      const rect = c.getBoundingClientRect();
      if (rect.width > 0 && rect.height > 0) {
        surfaces.push({
          id: `cvs_${idx + 1}`,
          surfaceType: 'canvas',
          isCrossOriginOrUninspectable: true,
          boundingClientRect: { x: rect.x, y: rect.y, width: rect.width, height: rect.height }
        });
      }
    });

    const iframes = doc.querySelectorAll('iframe');
    iframes.forEach((f, idx) => {
      const rect = f.getBoundingClientRect();
      if (rect.width > 0 && rect.height > 0) {
        surfaces.push({
          id: `ifr_${idx + 1}`,
          surfaceType: 'iframe',
          isCrossOriginOrUninspectable: true,
          boundingClientRect: { x: rect.x, y: rect.y, width: rect.width, height: rect.height }
        });
      }
    });

    return {
      snapshot: {
        domElements,
        textNodes,
        imageElements,
        surfaces,
        interactiveElements,
        pageTitle: doc.title || 'Page'
      },
      elementMap: this.elementMap
    };
  }
}
