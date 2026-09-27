/**
 * @privapilot/extension - Content Script DOM Element Extractor
 *
 * Scans the active document, extracts interactive elements and sensitive node descriptors,
 * and assigns ephemeral local IDs (e.g. "el_1", "el_2").
 */

import { ElementRole, ActionCapability } from '@privapilot/protocol';
import { scanTextForPII, classifyPageZone, isFunctionalMapCanvas, isPublicMediaStream, isPrivateAccountShell, isPublicPostContent, isPrivateMessagingSurface } from '@privapilot/pii-rules';
import { LocalDomSnapshot } from '../sanitizer/pipeline.js';
import { RawDomElementCapture } from '../sanitizer/dom-detector.js';
import { RawTextNodeCapture, TextRangeRect, MatchedTextRange } from '../sanitizer/text-detector.js';
import { RawImageElementCapture } from '../sanitizer/face-detector.js';
import { RawSurfaceCapture } from '../sanitizer/surface-detector.js';

const TEXT_NODE_TYPE = typeof Node !== 'undefined' ? Node.TEXT_NODE : 3;
const ELEMENT_NODE_TYPE = typeof Node !== 'undefined' ? Node.ELEMENT_NODE : 1;
const SHOW_TEXT_FILTER = typeof NodeFilter !== 'undefined' ? NodeFilter.SHOW_TEXT : 4;
const MAX_INTERACTIVE_ELEMENTS = 80;
const INTERACTIVE_SELECTOR = 'button, a, input, select, textarea, [role="button"], [role="link"], [role="tab"], [role="combobox"], [role="searchbox"], [role="option"], [role="menuitem"], [contenteditable="true"], [role="listbox"], [aria-haspopup="listbox"], [tabindex="0"], [draggable="true"], [role="slider"], [aria-grabbed], .MuiListItemButton-root, [class*="suggestion" i], [class*="autocomplete-item" i], [class*="dropdown-item" i]';

function isVisibleElement(el: Element): boolean {
  for (let current: Element | null = el; current; current = current.parentElement) {
    if (current.hasAttribute?.('hidden') || current.getAttribute?.('aria-hidden') === 'true') return false;
    const style = current.ownerDocument?.defaultView?.getComputedStyle?.(current);
    if (style && (style.display === 'none' || style.visibility === 'hidden' || style.visibility === 'collapse' || Number(style.opacity) === 0)) return false;
  }
  return true;
}

function isRedundantInteractiveWrapper(el: HTMLElement): boolean {
  const tag = (el.tagName || '').toLowerCase();
  if (!tag || !['div', 'span', 'section'].includes(tag) || el.hasAttribute?.('role') || el.isContentEditable || !el.children || !el.childNodes || !el.querySelector) return false;
  const children = Array.from(el.children).filter(child => child.matches?.(INTERACTIVE_SELECTOR));
  if (children.length !== 1 || el.children.length !== 1) return false;
  const ownText = Array.from(el.childNodes).some(node => node.nodeType === TEXT_NODE_TYPE && Boolean(node.nodeValue?.trim()));
  return !ownText && !el.querySelector('h1, h2, h3, h4, [role="heading"]');
}

/**
 * Measures exact client rectangles for a text range, handling text nodes, multi-line wrapping,
 * and nested inline elements (e.g. <span>, <b>, <em>).
 */
export function measureTextRangeRects(
  doc: Document,
  nodeOrContainer: Node,
  startIndex: number,
  endIndex: number,
  viewportWidth: number,
  viewportHeight: number
): TextRangeRect[] {
  try {
    const range = doc.createRange();

    if (nodeOrContainer.nodeType === TEXT_NODE_TYPE) {
      const textLen = (nodeOrContainer.nodeValue || '').length;
      const safeStart = Math.max(0, Math.min(startIndex, textLen));
      const safeEnd = Math.max(safeStart, Math.min(endIndex, textLen));
      range.setStart(nodeOrContainer, safeStart);
      range.setEnd(nodeOrContainer, safeEnd);
    } else if (nodeOrContainer.nodeType === ELEMENT_NODE_TYPE) {
      // Find start and end positions across descendant text nodes
      let currentOffset = 0;
      let startNode: Node | null = null;
      let startOffset = 0;
      let endNode: Node | null = null;
      let endOffset = 0;

      const walker = doc.createTreeWalker(nodeOrContainer, SHOW_TEXT_FILTER);
      let child = walker.nextNode();

      while (child) {
        const textLen = child.nodeValue?.length || 0;
        if (!startNode && currentOffset + textLen >= startIndex) {
          startNode = child;
          startOffset = startIndex - currentOffset;
        }
        if (!endNode && currentOffset + textLen >= endIndex) {
          endNode = child;
          endOffset = endIndex - currentOffset;
          break;
        }
        currentOffset += textLen;
        child = walker.nextNode();
      }

      if (!startNode || !endNode) {
        return [];
      }

      range.setStart(startNode, Math.max(0, Math.min(startOffset, startNode.nodeValue?.length || 0)));
      range.setEnd(endNode, Math.max(0, Math.min(endOffset, endNode.nodeValue?.length || 0)));
    } else {
      return [];
    }

    const clientRects = range.getClientRects();
    const resultRects: TextRangeRect[] = [];

    for (let i = 0; i < clientRects.length; i++) {
      const r = clientRects[i];
      // Clip rectangles to the visible viewport
      const left = Math.max(0, Math.min(r.left !== undefined ? r.left : r.x, viewportWidth));
      const top = Math.max(0, Math.min(r.top !== undefined ? r.top : r.y, viewportHeight));
      const right = Math.max(0, Math.min((r.right !== undefined ? r.right : (r.x + r.width)), viewportWidth));
      const bottom = Math.max(0, Math.min((r.bottom !== undefined ? r.bottom : (r.y + r.height)), viewportHeight));
      const width = right - left;
      const height = bottom - top;

      // Discard empty or invalid rectangles
      if (width > 0.5 && height > 0.5 && Number.isFinite(width) && Number.isFinite(height)) {
        resultRects.push({
          x: left,
          y: top,
          width,
          height
        });
      }
    }

    if (resultRects.length === 0) {
      const b = range.getBoundingClientRect();
      const left = Math.max(0, Math.min(b.left !== undefined ? b.left : b.x, viewportWidth));
      const top = Math.max(0, Math.min(b.top !== undefined ? b.top : b.y, viewportHeight));
      const right = Math.max(0, Math.min((b.right !== undefined ? b.right : (b.x + b.width)), viewportWidth));
      const bottom = Math.max(0, Math.min((b.bottom !== undefined ? b.bottom : (b.y + b.height)), viewportHeight));
      const width = right - left;
      const height = bottom - top;
      if (width > 0.5 && height > 0.5 && Number.isFinite(width) && Number.isFinite(height)) {
        resultRects.push({ x: left, y: top, width, height });
      }
    }

    return resultRects;
  } catch {
    try {
      const el = (nodeOrContainer as any).parentElement || nodeOrContainer;
      if (typeof el?.getBoundingClientRect === 'function') {
        const b = el.getBoundingClientRect();
        if (b && b.width > 0.5 && b.height > 0.5) {
          return [{
            x: Math.max(0, Math.min(b.left !== undefined ? b.left : b.x, viewportWidth)),
            y: Math.max(0, Math.min(b.top !== undefined ? b.top : b.y, viewportHeight)),
            width: b.width,
            height: b.height
          }];
        }
      }
    } catch (_) {}
    return [];
  }
}

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

    const viewportWidth = (doc.defaultView?.innerWidth) || (doc.documentElement?.clientWidth) || 1280;
    const viewportHeight = (doc.defaultView?.innerHeight) || (doc.documentElement?.clientHeight) || 720;

    let surfaceCounter = 0;

    // Helper to recursively process a document or same-origin frame with coordinate offsets
    const processDocumentLevel = (
      currentDoc: Document | DocumentFragment,
      offset: { x: number; y: number } = { x: 0, y: 0 },
      depth: number = 0
    ) => {
      const currentDocUrl = ((currentDoc as Document).defaultView?.location?.href || (doc as any).location?.href || '');
      const pageZone = classifyPageZone(currentDocUrl);
      const isPublicBroadcast = pageZone === 'public_broadcast';

      // 1. Extract interactive controls & form inputs (including custom dropdowns, comboboxes, suggestions, and tabs)
      const candidates = currentDoc.querySelectorAll(INTERACTIVE_SELECTOR);

      candidates.forEach((node) => {
        const el = node as HTMLElement;

        // Overlay Safety: Never extract extension overlays, HUD controls, or debug containers
        if (
          (typeof el.closest === 'function' && el.closest('.privapilot-overlay, .privapilot-hud, #privapilot-root, [data-privapilot-ignore]')) ||
          (typeof el.getAttribute === 'function' && el.getAttribute('data-privapilot-ignore') === 'true') ||
          (el.classList && typeof el.classList.contains === 'function' && el.classList.contains('privapilot-overlay'))
        ) {
          return;
        }

        const rect = el.getBoundingClientRect();
        if (rect.width <= 0.5 || rect.height <= 0.5 || !isVisibleElement(el)) return;
        if (el.tagName?.toLowerCase() === 'input' && el.getAttribute?.('type')?.toLowerCase() === 'hidden') return;
        if (isRedundantInteractiveWrapper(el)) return;

        this.counter++;
        const localId = `el_${this.counter}`;
        this.elementMap.set(localId, el);

        // Determine role (prioritizing native tag semantics)
        let role: ElementRole = 'generic';
        const tag = el.tagName.toLowerCase();
        const roleAttr = (typeof el.getAttribute === 'function' ? el.getAttribute('role') || '' : '').toLowerCase();
        const ariaHasPopup = (typeof el.getAttribute === 'function' ? el.getAttribute('aria-haspopup') || '' : '').toLowerCase();

        if (tag === 'input') {
          const type = (typeof el.getAttribute === 'function' ? el.getAttribute('type') || 'text' : 'text').toLowerCase();
          if (type === 'checkbox') role = 'checkbox';
          else if (type === 'radio') role = 'radio';
          else if (type === 'button' || type === 'submit' || type === 'reset') role = 'button';
          else role = 'input';
        } else if (tag === 'textarea' || roleAttr === 'searchbox' || el.isContentEditable || el.getAttribute?.('contenteditable') === 'true') {
          role = 'textarea';
        } else if (tag === 'select' || roleAttr === 'listbox' || (!el.matches?.('input') && (roleAttr === 'combobox' || ariaHasPopup === 'listbox'))) {
          role = 'select';
        } else if (tag === 'button' || roleAttr === 'button') {
          role = 'button';
        } else if (tag === 'a' || roleAttr === 'link') {
          role = 'link';
        } else if (roleAttr === 'tab') {
          role = 'tab';
        } else if (roleAttr === 'menuitem' || roleAttr === 'option' || (el.classList && typeof el.classList.contains === 'function' && el.classList.contains('MuiListItemButton-root'))) {
          role = 'menuitem';
        }

        // Determine capabilities
        const caps: ActionCapability[] = ['click', 'hover'];
        if (role === 'input' || role === 'textarea' || tag === 'input' || tag === 'textarea' || el.isContentEditable) {
          const inputType = (typeof el.getAttribute === 'function' ? el.getAttribute('type') || '' : '').toLowerCase();
          if (inputType !== 'checkbox' && inputType !== 'radio' && inputType !== 'button' && inputType !== 'submit' && inputType !== 'image') {
            caps.push('type');
          }
          if (inputType === 'file') caps.push('upload');
        }
        if (role === 'select' || tag === 'select' || roleAttr === 'combobox') caps.push('select');
        const isDraggable = el.getAttribute?.('draggable') === 'true' || el.getAttribute?.('role') === 'slider' || (typeof el.getAttribute === 'function' && el.getAttribute('aria-grabbed') !== null);
        if (isDraggable) caps.push('drag');

        // Safe Semantic Name Derivation (NEVER use live input/textarea/select .value property or attribute)
        let rawName = '';
        let associatedLabelText = '';

        if (tag === 'input' || tag === 'textarea' || tag === 'select') {
          // 1. Associated <label for="id">
          if (el.id) {
            try {
              const escapedId = typeof CSS !== 'undefined' && CSS.escape ? CSS.escape(el.id) : el.id;
              const labelEl = (currentDoc as any).querySelector?.(`label[for="${escapedId}"]`);
              if (labelEl) associatedLabelText = (labelEl as HTMLElement).innerText?.trim() || '';
            } catch (_) {}
          }
          // 2. Parent/wrapping <label>
          if (!associatedLabelText) {
            const parentLabel = typeof el.closest === 'function' ? el.closest('label') : null;
            if (parentLabel) associatedLabelText = parentLabel.innerText?.trim() || '';
          }
          // 3. aria-labelledby
          if (!associatedLabelText) {
            const labelledBy = typeof el.getAttribute === 'function' ? el.getAttribute('aria-labelledby') : null;
            if (labelledBy) {
              try {
                const labelEl = (currentDoc as any).getElementById?.(labelledBy);
                if (labelEl) associatedLabelText = labelEl.innerText?.trim() || '';
              } catch (_) {}
            }
          }

          const ariaLabel = (typeof el.getAttribute === 'function' ? el.getAttribute('aria-label') || '' : '').trim();
          const placeholder = (typeof el.getAttribute === 'function' ? el.getAttribute('placeholder') || '' : '').trim();
          const title = (typeof el.getAttribute === 'function' ? el.getAttribute('title') || '' : '').trim();
          const nameAttr = (typeof el.getAttribute === 'function' ? el.getAttribute('name') || '' : '').trim();
          const typeAttr = (typeof el.getAttribute === 'function' ? el.getAttribute('type') || '' : '').trim().toLowerCase();
          const ariaControls = (typeof el.getAttribute === 'function' ? el.getAttribute('aria-controls') || '' : '').trim();

          const buttonValue = (typeAttr === 'submit' || typeAttr === 'button' || typeAttr === 'reset')
            ? ((typeof el.getAttribute === 'function' ? el.getAttribute('value') || '' : '').trim() || (typeAttr === 'submit' ? 'Submit' : ''))
            : '';

          rawName = buttonValue || associatedLabelText || ariaLabel || placeholder || title || (typeAttr === 'search' ? 'Search' : '') || (ariaControls.toLowerCase().includes('table') ? 'Search' : '') || nameAttr || role;

          const isTableFilter = Boolean(el.closest?.('table, .table-responsive, [class*="table" i], [id*="table" i], [id*="Spacecraft" i], [id*="Launch" i], [id*="Mission" i]'));
          const isHeaderNav = Boolean(el.closest?.('header, nav, #header, #navbar, #topbar, #searchidD, #searchidM, [class*="navbar" i]'));
          if (isTableFilter && (placeholder || /search|filter/i.test(rawName))) {
            rawName = `Table Filter (${placeholder || 'Search'})`;
          } else if (isHeaderNav && /search|query/i.test(rawName)) {
            rawName = `Site Search (${placeholder || ariaLabel || 'Header'})`;
          }
        } else {
          // For buttons, links, custom clickable controls
          const textContent = el.innerText?.trim() || (el.textContent && el.textContent.trim().length < 80 ? el.textContent.trim() : '') || '';
          const aria = (typeof el.getAttribute === 'function' ? el.getAttribute('aria-label')?.trim() || el.getAttribute('title')?.trim() : '') ||
            (el.querySelector?.('[aria-label]')?.getAttribute('aria-label')?.trim() || '');
          let childName = '';
          if (!textContent && !aria) {
            const svgChild = el.querySelector('svg');
            if (svgChild) {
              childName = svgChild.getAttribute('aria-label') || svgChild.querySelector('title')?.textContent?.trim() || '';
            }
            if (!childName) {
              const imgChild = el.querySelector('img');
              if (imgChild) {
                childName = imgChild.getAttribute('alt') || imgChild.getAttribute('title') || '';
              }
            }
            if (!childName && typeof el.getAttribute === 'function' && el.getAttribute('type') === 'submit') {
              childName = 'Submit';
            }
            if (!childName) {
              const searchForm = typeof el.closest === 'function' ? el.closest('form, [role="search"]') : null;
              if (searchForm) {
                childName = 'Search';
              }
            }
            // data-testid semantic derivation (e.g. Twitter/X "AppTabBar_Bookmarks_Link" -> "Bookmarks")
            if (!childName) {
              const testId = (typeof el.getAttribute === 'function' ? el.getAttribute('data-testid') : null) ||
                el.querySelector?.('[data-testid]')?.getAttribute('data-testid') || '';
              if (testId) {
                const cleaned = testId
                  .replace(/^(?:AppTabBar_|SideNav_|nav_|btn_|tab_)/i, '')
                  .replace(/(?:_Link|_Button|_Item|_Tab)$/i, '')
                  .replace(/([A-Z])/g, ' $1')
                  .trim();
                if (cleaned.length > 1) {
                  childName = cleaned;
                }
              }
            }
            // href semantic derivation for links (e.g. "/i/bookmarks" -> "Bookmarks", or downloadable files)
            if (!childName && (tag === 'a' || typeof el.getAttribute === 'function')) {
              const rawHref = (el as HTMLAnchorElement).href || el.getAttribute('href') || '';
              if (rawHref) {
                const hrefLower = rawHref.toLowerCase();
                if (hrefLower.includes('/i/bookmarks') || hrefLower.endsWith('/bookmarks')) childName = 'Bookmarks';
                else if (hrefLower.includes('/notifications')) childName = 'Notifications';
                else if (hrefLower.includes('/messages')) childName = 'Messages';
                else if (hrefLower.includes('/explore')) childName = 'Explore';
                else if (hrefLower.includes('/home')) childName = 'Home';
                else if (hrefLower.includes('/lists') && !hrefLower.includes('search')) childName = 'Lists';
                else if (hrefLower.includes('/settings')) childName = 'Settings';
                else {
                  const docMatch = hrefLower.match(/\/([^\/?#]+\.(?:pdf|zip|csv|kmz|kml|doc|docx|xlsx|tif|geotiff))(?:[?#]|$)/i);
                  if (docMatch) {
                    const rawFile = decodeURIComponent(docMatch[1]).replace(/[_-]+/g, ' ');
                    childName = `Download ${rawFile}`;
                  }
                }
              }
            }
          }
          rawName = textContent || aria || childName || role;
          if (tag === 'a' && el.hasAttribute?.('download') && !rawName.toLowerCase().includes('download')) {
            rawName = `Download ${rawName}`;
          }

          // Protect private account identity and conversation threads in interactive elements
          const isAcctShell = !isPublicBroadcast && isPrivateAccountShell(el);
          const isMsgSurface = !isPublicBroadcast && isPrivateMessagingSurface(el, currentDocUrl);
          if (isAcctShell) {
            rawName = 'Switch Account ([REDACTED_USER])';
          } else if (isMsgSurface && !/^(?:messages|requests|search|send\s+message|new\s+message|direct|chats|inbox|all|unread|primary|general)$/i.test(rawName.trim())) {
            const isThread = Boolean(
              el.closest('[role="listitem"], [role="row"], [data-testid*="conversation" i], [class*="conversation" i], [class*="thread" i], [class*="direct" i]') ||
              (role === 'button' || role === 'link' || role === 'menuitem')
            );
            if (isThread) {
              const timeMatch = rawName.match(/\b(?:\d+\s*[hdwm]|yesterday|\d+:\d+\s*(?:am|pm)?)\b/i);
              const timeDesc = timeMatch ? ` (${timeMatch[0]})` : '';
              rawName = `Conversation thread: [REDACTED_USER]${timeDesc}`;
            }
          }
        }

        // Extract container / row context (e.g. table row, card, list item)
        let containerContext: string | undefined;
        try {
          const container = typeof el.closest === 'function' ? el.closest('tr, [role="row"], li, .card, [role="article"], td, [role="gridcell"]') : null;
          if (container) {
            const rawContext = (container as HTMLElement).innerText || (container as HTMLElement).textContent || '';
            const cleanTokens = rawContext
              .replace(rawName, '')
              .replace(/\s+/g, ' ')
              .trim()
              .slice(0, 180);
            if (cleanTokens.length > 0) {
              containerContext = cleanTokens;
            }
          }
        } catch (_) {}

        // Active Dialog & Heading context
        const isInsideDialog = Boolean(typeof el.closest === 'function' && el.closest('dialog, [role="dialog"], [role="alertdialog"], .modal, .dialog'));
        let nearestHeading: string | undefined;
        try {
          const heading = typeof el.closest === 'function' ? el.closest('section, article, div, main')?.querySelector?.('h1, h2, h3, h4, [role="heading"]') : null;
          if (heading && heading !== el) {
            const hText = (heading as HTMLElement).innerText?.trim();
            if (hText && hText.length < 80) nearestHeading = hText;
          }
        } catch (_) {}

        // Vertical offset relative to viewport
        let verticalOffset: 'in_view' | 'above' | 'below' = 'in_view';
        if ((rect.bottom ?? rect.y + rect.height) + offset.y <= 0) {
          verticalOffset = 'above';
        } else if ((rect.top ?? rect.y) + offset.y >= viewportHeight) {
          verticalOffset = 'below';
        }
        const inViewport = verticalOffset === 'in_view' && (rect.right ?? rect.x + rect.width) + offset.x > 0 && rect.x + offset.x < viewportWidth;

        const isPrimaryNavLink = role === 'link' && Boolean(el.closest?.('nav, header, [role="navigation"]'));
        const inputVal = (el as HTMLInputElement).value || '';
        const isPlaceholderLike = /^(?:enter\s+(?:your\s+)?|type\s+(?:your\s+)?|first\s*name|last\s*name|email\s*(?:address|id)?|e\.?g\.?|sample|your\s+name|name\s+here|email\s+here)/i.test(inputVal.trim());
        const isPopulated = (tag === 'input' || tag === 'textarea') &&
          !['button', 'submit', 'reset', 'image', 'checkbox', 'radio', 'file', 'hidden'].includes((el.getAttribute('type') || '').toLowerCase()) &&
          Boolean(inputVal.trim().length > 0 && !isPlaceholderLike);
        const elementStates: Array<'enabled' | 'disabled' | 'visible' | 'checked' | 'focused' | 'filled'> = [
          'visible',
          ((el as any).disabled && !el.querySelector?.('button:not([disabled]), a[href]')) ? 'disabled' : 'enabled'
        ];
        if (isPopulated) {
          elementStates.push('filled');
        }

        interactiveElements.push({
          isPrimaryNavLink,
          localId,
          role,
          rawName,
          publicAuthorHandles: isPublicPostContent(el),
          boundingBox: { x: rect.x + offset.x, y: rect.y + offset.y, width: rect.width, height: rect.height },
          state: elementStates,
          actionCapabilities: caps,
          containerContext,
          nearestHeading,
          isInsideDialog,
          verticalOffset,
          inViewport
        });

        // Also record descriptor for DOM sensitivity analysis
        const isEditable = (tag === 'input' || tag === 'textarea') && !['button', 'submit', 'reset', 'image', 'checkbox', 'radio', 'file', 'hidden'].includes((el.getAttribute('type') || '').toLowerCase());
        if (isEditable) {
          const liveVal = (el as any).value !== undefined ? (el as any).value : (el.textContent || undefined);
          const liveValueStr = typeof liveVal === 'string' ? liveVal : undefined;
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
              associatedLabelText: associatedLabelText || undefined,
              value: liveValueStr
            },
            boundingClientRect: { x: rect.x + offset.x, y: rect.y + offset.y, width: rect.width, height: rect.height }
          });
        }
      });

      // 2. Extract Visible Text Nodes & Compute Range Bounding Boxes
      const textWalker = (currentDoc as any).createTreeWalker ? (currentDoc as any).createTreeWalker((currentDoc as any).body || currentDoc, SHOW_TEXT_FILTER) : null;
      if (textWalker) {
        let textNode: Node | null = textWalker.nextNode();
        let textIdx = 0;
        const visitedContainers = new Set<Element>();

        while (textNode) {
          const content = textNode.nodeValue || '';
          const trimmed = content.trim();
          const parent = textNode.parentElement;
          if (!parent) {
            textNode = textWalker.nextNode();
            continue;
          }

          const isIgnored = Boolean(
            typeof parent.closest === 'function' &&
            parent.closest('script, style, noscript, .privapilot-overlay, .privapilot-hud, #privapilot-root, [data-privapilot-ignore]')
          );

          if (trimmed.length > 1 && !isIgnored && isVisibleElement(parent)) {
            const parentRect = parent.getBoundingClientRect();
            if (parentRect.width > 0.5 && parentRect.height > 0.5 && parentRect.right + offset.x > 0 && parentRect.bottom + offset.y > 0 && parentRect.left + offset.x < viewportWidth && parentRect.top + offset.y < viewportHeight) {
              textIdx++;
              const nodeId = `txt_${depth}_${textIdx}`;

              // Check if parent element represents user account identity (e.g. User-Name header on X, user-menu button on Claude/ChatGPT, account header on Flipkart)
              const isAccountIdentity = !isPublicBroadcast && !isPublicPostContent(parent) && Boolean(
                typeof parent.closest === 'function' &&
                (isPrivateAccountShell(parent) ||
                 parent.closest(
                   '[data-testid="User-Name"], [data-testid="user-menu-button"], [data-testid="profile-button"], [data-testid*="user-profile" i], [class*="user-name" i], [class*="username" i], [class*="account-name" i], a[href*="/account" i], a[href*="/profile" i], [aria-label*="account" i], [aria-label*="profile" i], [title*="profile" i], [title*="account" i], [class*="account-info" i], [class*="profile-info" i], [data-testid*="account" i], [data-testid*="profile" i]'
                 ))
              );

              // Check if parent element is within a private messaging surface (Instagram Direct, X Messages, LinkedIn Messaging, Slack, WhatsApp)
              const isMsgSurface = !isPublicPostContent(parent) && (
                pageZone === 'private_workspace' ||
                isPrivateMessagingSurface(parent, currentDocUrl)
              );

              // Check if parent element represents delivery address / shipping location widget on checkout forms
              const isDeliveryAddressContainer = !isPublicBroadcast && Boolean(
                typeof parent.closest === 'function' &&
                parent.closest(
                  '[class*="deliver" i], [id*="deliver" i], [class*="shipping-address" i], [id*="shipping-address" i], [class*="delivery-address" i], [id*="delivery-address" i], [class*="pincode" i], [id*="pincode" i]'
                )
              );

              // Scan text node for PII matches
              const isPublicAuthor = isPublicPostContent(parent);
              let matches = scanTextForPII(content, { publicAuthorHandles: isPublicAuthor });
              if (matches.length === 0 && isDeliveryAddressContainer && trimmed.length > 2 && trimmed.length < 120 &&
                  !/^(?:address|location|pin\s*code|postal\s*code)$/i.test(trimmed) &&
                  (/\b(?:home|work|office|deliver|katra|nagar|colony|road|street|bhavan|bhawan|marg|lane|avenue|floor|block|sector|plot|post|pin|[1-9][0-9]{2}\s?[0-9]{3})\b/i.test(trimmed) ||
                   /[1-9][0-9]{2}\s?[0-9]{3}/.test(trimmed))) {
                matches = [{
                  category: 'address',
                  startIndex: 0,
                  endIndex: content.length,
                  matchedLength: content.length,
                  confidence: 0.95
                }];
              } else if (matches.length === 0 && isMsgSurface && trimmed.length > 1 &&
                  !/^(?:messages|requests|search|send message|new message|direct|chats|inbox|all|unread|primary|general)$/i.test(trimmed)) {
                // In private messaging surface: classify conversation text into username (contact) vs uninspectable (message snippet)
                const isSnippet = Boolean(
                  trimmed.includes('•') ||
                  trimmed.length > 35 ||
                  /\b(?:sent an attachment|replied to|seen|yesterday|\d+:\d+|\d+\s*[hdwm])\b/i.test(trimmed)
                );
                matches = [{
                  category: isSnippet ? 'uninspectable' : 'username',
                  startIndex: 0,
                  endIndex: content.length,
                  matchedLength: content.length,
                  confidence: 0.95
                }];
              } else if (matches.length === 0 && isAccountIdentity && trimmed.length > 1 && trimmed.length < 80 &&
                  !/^(?:login|sign in|sign up|register|cart|orders|notifications|help|wishlist|explore|become a seller|messages|requests|direct|chats|home|about|about\s+us|activities|services|programmes|resources|engagements|media|missions|careers?|tenders?|faq|contact|contact\s+us|sitemap|feedback|rti|menu|navigation|search|overview|gallery|centres|facilities|launchers|satellites)$/i.test(trimmed)) {
                matches = [{
                  category: 'username',
                  startIndex: 0,
                  endIndex: content.length,
                  matchedLength: content.length,
                  confidence: 0.95
                }];
              }

              // Optimization: If no PII/sensitive data was found, and the element is an action button/input wrapper,
              // skip pushing static button labels to textNodes so we don't duplicate interactive controls
              const isInsideActionControl = Boolean(
                typeof parent.closest === 'function' &&
                parent.closest('button, [role="button"], input, textarea, select')
              );
              if (matches.length === 0 && isInsideActionControl) {
                textNode = textWalker.nextNode();
                continue;
              }

              let matchedRanges: MatchedTextRange[] | undefined = undefined;

              if (matches.length > 0) {
                matchedRanges = matches.map((match) => {
                  const rects = measureTextRangeRects(textNode!.ownerDocument || doc, textNode!, match.startIndex, match.endIndex, viewportWidth, viewportHeight);
                  // Apply coordinate offset to range rects
                  const offsetRects = rects.map(r => ({ ...r, x: r.x + offset.x, y: r.y + offset.y }));
                  return {
                    category: match.category,
                    startIndex: match.startIndex,
                    endIndex: match.endIndex,
                    rects: offsetRects
                  };
                }).filter(match => match.rects.length > 0);
              }

              if (matches.length > 0 && !matchedRanges?.length) {
                // Do not pass an unmeasurable sensitive string to the fallback detector.
                textNode = textWalker.nextNode();
                continue;
              }
              textNodes.push({
                id: nodeId,
                text: trimmed,
                boundingClientRect: { x: parentRect.x + offset.x, y: parentRect.y + offset.y, width: parentRect.width, height: parentRect.height },
                matchedRanges,
                publicAuthorHandles: isPublicAuthor
              });

              // Check if parent container has nested inline markup spanning across text nodes (only small inline wrappers, never layout blocks or cards)
              const isSmallInlineWrapper =
                Boolean(parent.children && parent.children.length > 0) &&
                !visitedContainers.has(parent) &&
                parentRect.height <= 50 &&
                parentRect.width <= 600 &&
                parent.tagName !== 'ARTICLE' &&
                parent.tagName !== 'MAIN' &&
                parent.tagName !== 'SECTION';

              if (isSmallInlineWrapper) {
                visitedContainers.add(parent);
                const containerText = parent.textContent || '';
                const containerMatches = scanTextForPII(containerText, { publicAuthorHandles: isPublicAuthor });

                for (const cm of containerMatches) {
                  const isCovered = matchedRanges?.some(mr => mr.category === cm.category);
                  if (!isCovered) {
                    const containerRects = measureTextRangeRects(parent.ownerDocument || doc, parent, cm.startIndex, cm.endIndex, viewportWidth, viewportHeight);
                    if (!containerRects.length) continue;
                    const offsetContainerRects = containerRects.map(r => ({ ...r, x: r.x + offset.x, y: r.y + offset.y }));
                    textIdx++;
                    textNodes.push({
                      id: `txt_cont_${depth}_${textIdx}`,
                      text: containerText,
                      boundingClientRect: { x: parentRect.x + offset.x, y: parentRect.y + offset.y, width: parentRect.width, height: parentRect.height },
                      publicAuthorHandles: isPublicAuthor,
                      matchedRanges: [{
                        category: cm.category,
                        startIndex: cm.startIndex,
                        endIndex: cm.endIndex,
                        rects: offsetContainerRects
                      }]
                    });
                  }
                }
              }
            }
          }
          textNode = textWalker.nextNode();
        }
      }

      // 3. Extract Images / Avatars for Face Detection (Only actual visual media, not layout cards)
      const images = currentDoc.querySelectorAll(
        'img, svg, [role="img"], .avatar, .profile-photo, .profile-pic, ' +
        '[data-testid*="avatar" i], [data-testid*="UserAvatar" i], [data-testid*="user-avatar" i], ' +
        '[data-testid*="user-menu" i], [class*="avatar" i], [class*="profile-photo" i], [class*="profile-pic" i]'
      );
      images.forEach((img, idx) => {
        const el = img as HTMLElement;
        const tagName = (el.tagName || '').toUpperCase();
        const role = el.getAttribute?.('role') || '';
        const rect = el.getBoundingClientRect();
        if (rect.width <= 0 || rect.height <= 0) return;
        if (rect.width > 240 || rect.height > 240) return;

        const classText = (
          el.getAttribute?.('class') ??
          (typeof el.className === 'string' ? el.className : '')
        ).toLowerCase();
        const testId = (el.getAttribute?.('data-testid') || '').toLowerCase();
        const alt = (el.getAttribute?.('alt') || '').toLowerCase();
        const ariaLabel = (el.getAttribute?.('aria-label') || '').toLowerCase();
        const src = (el.getAttribute?.('src') || el.getAttribute?.('srcset') || '').toLowerCase();

        // Pure vector SVGs and UI icons in navigation or toolbars are never human faces or profile photos
        const isInNavigation = Boolean(typeof el.closest === 'function' && el.closest('nav, [role="navigation"], header, [data-testid="sidebarColumn"], aside'));
        const isNavAria = ariaLabel === 'profile' || ariaLabel === 'account' || ariaLabel === 'user' || ariaLabel === 'home' || ariaLabel === 'bookmarks';
        if (tagName === 'SVG' || (isInNavigation && isNavAria)) {
          return;
        }

        const isAvatar =
          classText.includes('avatar') ||
          classText.includes('user-pic') ||
          classText.includes('user-img') ||
          classText.includes('user-photo') ||
          classText.includes('author-img') ||
          classText.includes('gravatar') ||
          testId.includes('avatar') ||
          testId.includes('useravatar') ||
          testId.includes('profile-pic') ||
          alt.includes('avatar') ||
          alt.includes('user photo') ||
          (alt.includes('profile') && !alt.includes('profile link') && !alt.includes('view profile')) ||
          (ariaLabel.includes('avatar') && !isInNavigation) ||
          src.includes('profile_images') ||
          src.includes('avatar') ||
          src.includes('gravatar.com') ||
          src.includes('avatars.githubusercontent') ||
          src.includes('googleusercontent.com') ||
          Boolean(typeof el.closest === 'function' && el.closest('[data-testid*="UserAvatar" i], [data-testid*="user-avatar" i], [data-testid*="user-menu" i]'));

        const isVisualMedia =
          tagName === 'IMG' ||
          role === 'img' ||
          isAvatar;

        if (!isVisualMedia) return;

        const isPublicContent = isPublicPostContent(el);
        const shouldProtectAvatar = isPrivateAccountShell(el) || (!isPublicContent && isAvatar && !isInNavigation);

        imageElements.push({
          id: `img_${depth}_${idx + 1}`,
          isProfilePhotoOrAvatar: shouldProtectAvatar,
          isPublicPostImage: isPublicContent && !isPrivateAccountShell(el),
          boundingClientRect: { x: rect.x + offset.x, y: rect.y + offset.y, width: rect.width, height: rect.height }
        });
      });

      // 4. Granular High-Risk & Uninspectable Surfaces
      // 4a. Canvases (2D Canvas vs WebGL Canvas)
      const canvases = currentDoc.querySelectorAll('canvas');
      canvases.forEach((c) => {
        const rect = c.getBoundingClientRect();
        if (rect.width > 0 && rect.height > 0) {
          surfaceCounter++;
          const isMap = isFunctionalMapCanvas(c, currentDocUrl);
          const isPublicMediaCanvas =
            currentDocUrl.includes('youtube.com') ||
            currentDocUrl.includes('youtu.be') ||
            currentDocUrl.includes('vimeo.com') ||
            currentDocUrl.includes('twitch.tv') ||
            Boolean(c.closest('#player, ytd-player, .html5-video-player, [class*="player" i], [id*="player" i], .video-stream'));
          const isSignature = Boolean(
            c.closest('[class*="signature" i], [id*="signature" i], canvas[class*="sig" i], [aria-label*="signature" i]')
          );
          const pageZone = classifyPageZone(currentDocUrl);
          const isPublicContent = isPublicPostContent(c);
          const isSmallDecorative = rect.width <= 60 && rect.height <= 60;

          if ((isMap || isPublicMediaCanvas || pageZone === 'public_broadcast' || isPublicContent || isSmallDecorative) && !isSignature) {
            // Functional map, public media/broadcast canvas, public feed canvas, or small decorative ring/icon - do NOT blackout with opaque mask!
            surfaces.push({
              id: `cvs_${surfaceCounter}`,
              surfaceType: 'canvas',
              isCrossOriginOrUninspectable: false,
              inspectionStatus: 'inspected_same_origin',
              reason: isMap ? 'functional_geospatial_map' : (isPublicContent ? 'public_post_canvas' : (isSmallDecorative ? 'decorative_ui_canvas' : 'public_media_canvas')),
              boundingClientRect: { x: rect.x + offset.x, y: rect.y + offset.y, width: rect.width, height: rect.height }
            });
            return;
          }
          let isWebGL = false;
          try {
            const webglMarker = (c.getAttribute('data-engine') || '').toLowerCase();
            isWebGL = webglMarker.includes('webgl') || c.classList.contains('webgl') || (c as any).__webgl__ === true;
          } catch {}

          surfaces.push({
            id: `cvs_${surfaceCounter}`,
            surfaceType: isWebGL ? 'webgl_canvas' : 'canvas',
            isCrossOriginOrUninspectable: true,
            inspectionStatus: isWebGL ? 'uninspectable_canvas' : 'uninspectable_canvas',
            reason: isWebGL ? 'webgl_hardware_canvas' : 'uninspected_2d_canvas',
            boundingClientRect: { x: rect.x + offset.x, y: rect.y + offset.y, width: rect.width, height: rect.height }
          });
        }
      });

      // 4b. Video Streams & Players
      const videos = currentDoc.querySelectorAll('video');
      videos.forEach((v) => {
        const rect = v.getBoundingClientRect();
        if (rect.width > 0 && rect.height > 0) {
          surfaceCounter++;
          const isPublic = isPublicMediaStream(v, currentDocUrl);
          if (isPublic) {
            // Public video player (YouTube, Vimeo) - do NOT blackout with an opaque mask
            surfaces.push({
              id: `vid_${surfaceCounter}`,
              surfaceType: 'video',
              isCrossOriginOrUninspectable: false,
              inspectionStatus: 'inspected_same_origin',
              reason: 'public_media_stream',
              boundingClientRect: { x: rect.x + offset.x, y: rect.y + offset.y, width: rect.width, height: rect.height }
            });
            return;
          }
          surfaces.push({
            id: `vid_${surfaceCounter}`,
            surfaceType: 'video',
            isCrossOriginOrUninspectable: true,
            inspectionStatus: 'uninspectable_media',
            reason: 'video_media_stream',
            boundingClientRect: { x: rect.x + offset.x, y: rect.y + offset.y, width: rect.width, height: rect.height }
          });
        }
      });

      // 4c. Embedded PDF & Browser Plugin Content
      const plugins = currentDoc.querySelectorAll('embed, object, applet');
      plugins.forEach((p) => {
        const rect = p.getBoundingClientRect();
        if (rect.width > 0 && rect.height > 0) {
          surfaceCounter++;
          const typeAttr = (p.getAttribute('type') || '').toLowerCase();
          const srcAttr = (p.getAttribute('src') || p.getAttribute('data') || '').toLowerCase();
          const isPdf = typeAttr.includes('pdf') || srcAttr.endsWith('.pdf');

          surfaces.push({
            id: `plugin_${surfaceCounter}`,
            surfaceType: isPdf ? 'pdf' : 'plugin',
            isCrossOriginOrUninspectable: true,
            inspectionStatus: 'uninspectable_plugin',
            reason: isPdf ? 'embedded_pdf_document' : 'browser_plugin_content',
            boundingClientRect: { x: rect.x + offset.x, y: rect.y + offset.y, width: rect.width, height: rect.height }
          });
        }
      });

      // 4d. Closed Shadow Roots / Inaccessible Custom Elements
      const allElements = currentDoc.querySelectorAll('*');
      allElements.forEach((el) => {
        const isClosedShadow = (el as any).__closedShadowRoot__ === true || el.getAttribute('data-closed-shadow') === 'true';
        if (isClosedShadow) {
          const rect = el.getBoundingClientRect();
          if (rect.width > 0 && rect.height > 0) {
            surfaceCounter++;
            surfaces.push({
              id: `shadow_${surfaceCounter}`,
              surfaceType: 'shadow_root',
              isCrossOriginOrUninspectable: true,
              inspectionStatus: 'uninspectable_closed_shadow',
              reason: 'closed_shadow_root_inaccessible',
              boundingClientRect: { x: rect.x + offset.x, y: rect.y + offset.y, width: rect.width, height: rect.height }
            });
          }
        }
      });

      // 4e. Images Likely to Contain Sensitive Text (Real financial and identity documents only)
      const textImages = currentDoc.querySelectorAll(
        'img[class*="receipt" i], img[class*="invoice" i], img[class*="statement" i], img[class*="credit-card" i], img[class*="id-card" i], img[class*="passport" i], img[class*="national-id" i], img[class*="scanned-doc" i], [data-has-sensitive-text="true"], img[alt*="scanned document" i], img[alt*="sensitive document" i]'
      );
      textImages.forEach((img) => {
        const el = img as HTMLElement;
        if (isPublicPostContent(el)) return;
        const rect = el.getBoundingClientRect();
        if (rect.width > 0 && rect.height > 0) {
          surfaceCounter++;
          surfaces.push({
            id: `img_text_${surfaceCounter}`,
            surfaceType: 'image_text',
            isCrossOriginOrUninspectable: true,
            inspectionStatus: 'uninspectable_image_text',
            reason: 'image_text_candidate',
            boundingClientRect: { x: rect.x + offset.x, y: rect.y + offset.y, width: rect.width, height: rect.height }
          });
        }
      });

      // 4f. Iframes (Same-Origin Permitted vs Cross-Origin Inaccessible)
      const iframes = currentDoc.querySelectorAll('iframe');
      iframes.forEach((f) => {
        const rect = f.getBoundingClientRect();
        const iframeOffset = { x: rect.x + offset.x, y: rect.y + offset.y };

        // Ignore invisible tracking pixels, zero/sub-pixel size, or completely offscreen helper frames (e.g. Google CSE, beacons)
        if (rect.width <= 2 || rect.height <= 2 || iframeOffset.x + rect.width <= 0 || iframeOffset.y + rect.height <= 0) {
          return;
        }

        if (rect.width > 0 && rect.height > 0) {
          surfaceCounter++;

          let isSameOrigin = false;
          let innerDoc: Document | null = null;
          try {
            innerDoc = f.contentDocument || (f as any).contentWindow?.document || null;
            if (innerDoc && (innerDoc.body || innerDoc.documentElement)) {
              isSameOrigin = true;
            }
          } catch {
            isSameOrigin = false;
            innerDoc = null;
          }

          if (isSameOrigin && innerDoc && depth < 5) {
            // Permitted same-origin frame -> Record inspectable status and recurse!
            surfaces.push({
              id: `ifr_${surfaceCounter}`,
              surfaceType: 'iframe',
              isCrossOriginOrUninspectable: false,
              inspectionStatus: 'inspected_same_origin',
              reason: 'same_origin_frame_inspected',
              boundingClientRect: { x: iframeOffset.x, y: iframeOffset.y, width: rect.width, height: rect.height }
            });
            processDocumentLevel(innerDoc, iframeOffset, depth + 1);
          } else {
            // Check if this cross-origin iframe is an advertisement / promotional banner
            const fSrc = typeof f.getAttribute === 'function' ? f.getAttribute('src') : (f.src || '');
            const fName = typeof f.getAttribute === 'function' ? f.getAttribute('name') : (f.name || '');
            const fTitle = typeof f.getAttribute === 'function' ? f.getAttribute('title') : (f.title || '');
            const fClass = typeof f.getAttribute === 'function' ? f.getAttribute('class') : (f.className || '');
            const adMarkers = `${f.id || ''} ${fName || ''} ${fTitle || ''} ${fClass || ''} ${fSrc || ''}`.toLowerCase();
            const isAdFrame = /\b(?:google_ad|googlesyndication|doubleclick|adnxs|adservice|ad-slot|adsystem|ads-|aswift|taboola|outbrain|criteo|pubmatic|rubicon|adform|advertisement|banner-ad)\b|google_ads_iframe|godaddy/i.test(adMarkers);

            if (isAdFrame) {
              // Ignore commercial ad iframes from intrusive blackout masking
              return;
            }

            // Real cross-origin or inaccessible frame -> Mark high risk surface to mask fail-closed!
            surfaces.push({
              id: `ifr_${surfaceCounter}`,
              surfaceType: 'iframe',
              isCrossOriginOrUninspectable: true,
              inspectionStatus: 'uninspectable_cross_origin',
              reason: 'cross_origin_or_inaccessible_iframe',
              boundingClientRect: { x: iframeOffset.x, y: iframeOffset.y, width: rect.width, height: rect.height }
            });
          }
        }
      });

      // 4g. Open Shadow DOM Roots Piercing (Web Components & Custom Elements)
      if (depth < 6) {
        try {
          const shadowCandidates = currentDoc.querySelectorAll('*');
          shadowCandidates.forEach((node) => {
            const shadowRoot = (node as any).shadowRoot;
            if (shadowRoot && typeof shadowRoot.querySelectorAll === 'function') {
              processDocumentLevel(shadowRoot, offset, depth + 1);
            }
          });
        } catch {
          // Gracefully continue in environments where Shadow DOM access is restricted
        }
      }
    };

    // Execute top-level extraction
    processDocumentLevel(doc, { x: 0, y: 0 }, 0);

    // Extract structured page-state landmarks
    let visibleDialogCount = 0;
    const dialogTitles: string[] = [];
    try {
      const dialogCandidates = doc.querySelectorAll('dialog, [role="dialog"], [aria-modal="true"], [id*="drawer"], [class*="drawer"]');
      dialogCandidates.forEach((node) => {
        const el = node as HTMLElement;
        const isHidden = !isVisibleElement(el) || el.classList?.contains('hidden');
        if (!isHidden && (el.offsetParent !== null || el.offsetWidth > 0 || el.offsetHeight > 0)) {
          visibleDialogCount++;
          const title = el.getAttribute('aria-label') || el.querySelector('h1, h2, h3, h4, [class*="title"]')?.textContent?.trim() || '';
          if (title) {
            dialogTitles.push(title.slice(0, 100));
          }
        }
      });
    } catch {
      // Bounded fallback in non-standard DOM environments
    }

    // Extract focused task region (active modal dialog, form card, or prominent drawer)
    let focusedRegion: { x: number; y: number; width: number; height: number; type: 'dialog' | 'form' | 'cluster' } | undefined;
    try {
      const winW = doc.defaultView?.innerWidth || 1280;
      const winH = doc.defaultView?.innerHeight || 720;

      // 1. Check for open / visible modal dialogs
      const activeModal = doc.querySelector('dialog[open], [role="dialog"]:not(.hidden), [aria-modal="true"], .modal.show, .modal.active, .modal:not(.hidden)');
      if (activeModal && isVisibleElement(activeModal as HTMLElement)) {
        const rect = (activeModal as HTMLElement).getBoundingClientRect();
        if (rect.width >= 100 && rect.height >= 80 && (rect.width < winW * 0.98 || rect.height < winH * 0.98)) {
          focusedRegion = {
            x: Math.round(Math.max(0, rect.left)),
            y: Math.round(Math.max(0, rect.top)),
            width: Math.round(rect.width),
            height: Math.round(rect.height),
            type: 'dialog'
          };
        }
      }

      // 2. If no modal, check for an active isolated form
      if (!focusedRegion) {
        const activeForm = doc.querySelector('form:not(.hidden), [role="form"]:not(.hidden)');
        if (activeForm && isVisibleElement(activeForm as HTMLElement)) {
          const rect = (activeForm as HTMLElement).getBoundingClientRect();
          // Only isolate if form is a distinct component/card (not full-page wrapper)
          if (rect.width >= 120 && rect.height >= 80 && (rect.width < winW * 0.95 || rect.height < winH * 0.95)) {
            focusedRegion = {
              x: Math.round(Math.max(0, rect.left)),
              y: Math.round(Math.max(0, rect.top)),
              width: Math.round(rect.width),
              height: Math.round(rect.height),
              type: 'form'
            };
          }
        }
      }
    } catch {
      // Bounded fallback in non-standard DOM environments
    }

    const statusSummaries: string[] = [];
    try {
      const statusNodes = doc.querySelectorAll('[role="status"], [role="alert"], .badge');
      statusNodes.forEach((node) => {
        const text = (node.textContent || '').trim().slice(0, 150);
        if (text && isVisibleElement(node)) {
          statusSummaries.push(text);
        }
      });
    } catch {
      // Bounded fallback
    }

    const counters: Array<{ label: string; value: string }> = [];
    const contentSummaries: string[] = [];
    try {
      // Preserve reading order and attribution for visible post cards; never include controls or private shell.
      const posts = doc.querySelectorAll('article, [role="article"]');
      let postCount = 0;
      for (const post of Array.from(posts)) {
        if (postCount >= 8) break;
        if (!isVisibleElement(post) || !isPublicPostContent(post)) continue;
        const box = post.getBoundingClientRect();
        if (box.width <= 0 || box.height <= 0 || box.bottom <= 0 || box.top >= viewportHeight) continue;
        const authorNode = post.querySelector('[data-testid="User-Name"], [rel="author"], .author, [class*="author-name" i]');
        const bodyNode = post.querySelector('[data-testid="tweetText"], [data-testid="post-text"], .post-content, .post-body, [itemprop="articleBody"]');
        const safeText = (node: Element | null, limit: number): string => {
          if (!node || !isVisibleElement(node) || !isPublicPostContent(node)) return '';
          const walker = doc.createTreeWalker(node, SHOW_TEXT_FILTER);
          const parts: string[] = [];
          let child = walker.nextNode();
          while (child && parts.join(' ').length < limit) {
            if (child.parentElement && isVisibleElement(child.parentElement) && !isPrivateAccountShell(child.parentElement) &&
                !child.parentElement.closest('button, input, textarea, select, [contenteditable="true"]')) {
              parts.push(child.nodeValue || '');
            }
            child = walker.nextNode();
          }
          return parts.join(' ').trim().replace(/\s+/g, ' ').slice(0, limit);
        };
        const author = safeText(authorNode, 100).replace(/:/g, ' ');
        const body = safeText(bodyNode, 320);
        if (body) contentSummaries.push(`Visible post ${++postCount}${author ? ` by ${author}` : ''}: ${body}`);
      }
      // Extract statistics cards, counters, and metrics
      const counterNodes = doc.querySelectorAll('.counter, .count, [class*="stat"], [class*="metric"], [class*="badge"], [data-count]');
      counterNodes.forEach((node) => {
        if (!isVisibleElement(node)) return;
        const text = (node.textContent || '').trim().replace(/\s+/g, ' ');
        const numMatch = text.match(/\b\d[\d,.]*\b/);
        if (numMatch && text.length < 100) {
          const label = text.replace(numMatch[0], '').trim() || 'Counter';
          counters.push({ label: label.slice(0, 60), value: numMatch[0] });
        }
      });

      // Extract visible headings
      const headings = doc.querySelectorAll('h1, h2, h3, h4');
      headings.forEach((h) => {
        const text = (h.textContent || '').trim().replace(/\s+/g, ' ');
        if (text && text.length > 2 && text.length < 120 && isVisibleElement(h)) {
          contentSummaries.push(`Heading: ${text}`);
        }
      });

      // Extract table row counts and key-value specifications (common on ISRO mission & data pages)
      const tables = doc.querySelectorAll('table, [role="table"], [role="grid"]');
      tables.forEach((tbl, idx) => {
        if (!isVisibleElement(tbl)) return;
        const rows = tbl.querySelectorAll('tr, [role="row"]');
        const headers = Array.from(tbl.querySelectorAll('th, [role="columnheader"]'))
          .map(th => (th.textContent || '').trim())
          .filter(Boolean)
          .slice(0, 6);
        contentSummaries.push(`Table ${idx + 1}: ${rows.length > 0 ? rows.length - 1 : 0} records; columns: [${headers.join(', ')}]`);

        // Extract key-value specifications from 2-column tables
        for (let r = 0; r < Math.min(rows.length, 8); r++) {
          const cells = rows[r].querySelectorAll('th, td, [role="cell"], [role="columnheader"]');
          if (cells.length === 2) {
            const k = (cells[0].textContent || '').trim().replace(/\s+/g, ' ');
            const v = (cells[1].textContent || '').trim().replace(/\s+/g, ' ');
            if (k && v && k.length > 1 && k.length < 50 && v.length < 150) {
              contentSummaries.push(`Spec: ${k}: ${v}`);
            }
          }
        }
      });

      // Extract definition lists (<dl>, <dt>, <dd>)
      const dls = doc.querySelectorAll('dl');
      dls.forEach(dl => {
        if (!isVisibleElement(dl)) return;
        const dts = dl.querySelectorAll('dt');
        const dds = dl.querySelectorAll('dd');
        for (let i = 0; i < Math.min(dts.length, dds.length, 6); i++) {
          const term = (dts[i].textContent || '').trim().replace(/\s+/g, ' ');
          const desc = (dds[i].textContent || '').trim().replace(/\s+/g, ' ');
          if (term && desc && term.length < 50) {
            contentSummaries.push(`Spec: ${term}: ${desc.slice(0, 120)}`);
          }
        }
      });

      // Extract visible downloadable document links
      const docLinks = doc.querySelectorAll('a[href$=".pdf" i], a[href$=".zip" i], a[href$=".csv" i], a[href$=".kmz" i]');
      docLinks.forEach(a => {
        if (!isVisibleElement(a)) return;
        const aText = (a.textContent || a.getAttribute('aria-label') || '').trim().replace(/\s+/g, ' ');
        const aHref = a.getAttribute('href') || '';
        const fileName = aHref.split('/').pop()?.split('?')[0] || '';
        if (fileName && contentSummaries.length < 25) {
          contentSummaries.push(`Document: "${aText || fileName}" (${fileName})`);
        }
      });

      // Extract visible social & forum comments (e.g. YouTube, Reddit, article comments)
      const commentThreads = doc.querySelectorAll('ytd-comment-thread-renderer, [role="article"].comment, .comment-body, .comment');
      commentThreads.forEach((ct) => {
        if (contentSummaries.length >= 35 || !isVisibleElement(ct)) return;
        const authorEl = ct.querySelector('#author-text, .author, [class*="author"], [class*="user"]');
        const contentEl = ct.querySelector('#content-text, .comment-text, [class*="content"], p');
        const author = (authorEl?.textContent || '').trim().replace(/\s+/g, ' ');
        const text = (contentEl?.textContent || '').trim().replace(/\s+/g, ' ');
        if (text && text.length > 2) {
          const authorLabel = author ? `${author}: ` : '';
          contentSummaries.push(`Comment: ${authorLabel}"${text.slice(0, 180)}"`);
        }
      });

      // Extract video player title & channel (YouTube, Vimeo)
      const videoTitle = doc.querySelector('#title h1, h1.title, .video-title')?.textContent?.trim().replace(/\s+/g, ' ');
      const channelName = doc.querySelector('#channel-name, #owner-name, .channel-name')?.textContent?.trim().replace(/\s+/g, ' ');
      if (videoTitle && contentSummaries.length < 40) {
        contentSummaries.push(`Video: "${videoTitle}"${channelName ? ` by ${channelName}` : ''}`);
      }

      // Extract Bhuvan & geospatial map context / active layers
      const mapTitle = doc.querySelector('.bhuvan-header, #bhuvan-title, [class*="layer-switcher"], .ol-scale-line')?.textContent?.trim().replace(/\s+/g, ' ');
      if (mapTitle && contentSummaries.length < 45) {
        contentSummaries.push(`Map Surface: ${mapTitle.slice(0, 120)}`);
      }
    } catch {
      // Bounded fallback
    }

    const routeFingerprint = typeof doc.location !== 'undefined' && doc.location?.pathname
      ? doc.location.pathname.slice(0, 50)
      : '/';
    const domain = typeof doc.location !== 'undefined' && doc.location?.hostname
      ? doc.location.hostname.slice(0, 100)
      : undefined;
    const pageZone = classifyPageZone(typeof doc.location !== 'undefined' ? doc.location?.href || '' : '');

    const win = doc.defaultView || (typeof window !== 'undefined' ? window : null);
    const docElem = doc.documentElement;
    const bodyElem = doc.body;

    const scrollTop = Math.max(0, Math.round(win?.scrollY ?? docElem?.scrollTop ?? bodyElem?.scrollTop ?? 0));
    const scrollHeight = Math.max(viewportHeight, Math.round(docElem?.scrollHeight ?? bodyElem?.scrollHeight ?? viewportHeight));
    const clientHeight = Math.max(1, Math.round(win?.innerHeight ?? docElem?.clientHeight ?? viewportHeight));
    const maxScrollTop = Math.max(0, scrollHeight - clientHeight);
    const scrollableBelow = scrollTop < maxScrollTop - 2;
    const scrollableAbove = scrollTop > 2;
    const pixelsBelow = Math.max(0, maxScrollTop - scrollTop);
    const pixelsAbove = Math.max(0, scrollTop);

    const scrollMetrics = {
      scrollTop,
      scrollHeight,
      clientHeight,
      maxScrollTop,
      scrollableBelow,
      scrollableAbove,
      pixelsBelow,
      pixelsAbove
    };

    // Only the action list is capped; detectors always receive every visible
    // field, text range, image, and surface so ranking cannot bypass privacy.
    const cappedInteractiveElements = [...interactiveElements].sort((a, b) => {
      const score = (el: typeof interactiveElements[number]) => {
        const roleScore = el.role === 'input' || el.role === 'textarea' || el.role === 'select' ? 40
          : el.role === 'button' ? 35
          : el.isPrimaryNavLink ? 30
          : el.role === 'link' || el.role === 'tab' || el.role === 'menuitem' ? 25 : 5;
        return (el.inViewport ? 100 : 0) + (el.isInsideDialog ? 30 : 0) + roleScore;
      };
      return score(b) - score(a) || a.boundingBox.y - b.boundingBox.y || Number(a.localId.slice(3)) - Number(b.localId.slice(3));
    }).slice(0, MAX_INTERACTIVE_ELEMENTS);
    const retainedIds = new Set(cappedInteractiveElements.map(el => el.localId));
    for (const id of this.elementMap.keys()) {
      if (!retainedIds.has(id)) this.elementMap.delete(id);
    }

    return {
      snapshot: {
        domElements,
        textNodes,
        imageElements,
        surfaces,
        interactiveElements: cappedInteractiveElements,
        pageTitle: doc.title ? doc.title.slice(0, 150) : 'Page',
        visibleDialogCount,
        dialogTitles,
        statusSummaries,
        counters: counters.slice(0, 20),
        contentSummaries: contentSummaries.slice(0, 45),
        routeFingerprint,
        domain,
        scrollMetrics,
        pageZone,
        ...(focusedRegion ? { focusedRegion } : {})
      },
      elementMap: this.elementMap
    };
  }
}
