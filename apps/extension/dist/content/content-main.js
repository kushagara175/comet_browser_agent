"use strict";
(() => {
  // ../../packages/pii-rules/dist/luhn.js
  function isValidLuhn(cardNumberStr) {
    const sanitized = cardNumberStr.replace(/[\s-]/g, "");
    if (!/^\d{13,19}$/.test(sanitized)) {
      return false;
    }
    let sum = 0;
    let shouldDouble = false;
    for (let i = sanitized.length - 1; i >= 0; i--) {
      let digit = parseInt(sanitized.charAt(i), 10);
      if (shouldDouble) {
        digit *= 2;
        if (digit > 9) {
          digit -= 9;
        }
      }
      sum += digit;
      shouldDouble = !shouldDouble;
    }
    return sum % 10 === 0;
  }

  // ../../packages/pii-rules/dist/verhoeff.js
  var D_TABLE = [
    [0, 1, 2, 3, 4, 5, 6, 7, 8, 9],
    [1, 2, 3, 4, 0, 6, 7, 8, 9, 5],
    [2, 3, 4, 0, 1, 7, 8, 9, 5, 6],
    [3, 4, 0, 1, 2, 8, 9, 5, 6, 7],
    [4, 0, 1, 2, 3, 9, 5, 6, 7, 8],
    [5, 9, 8, 7, 6, 0, 4, 3, 2, 1],
    [6, 5, 9, 8, 7, 1, 0, 4, 3, 2],
    [7, 6, 5, 9, 8, 2, 1, 0, 4, 3],
    [8, 7, 6, 5, 9, 3, 2, 1, 0, 4],
    [9, 8, 7, 6, 5, 4, 3, 2, 1, 0]
  ];
  var P_TABLE = [
    [0, 1, 2, 3, 4, 5, 6, 7, 8, 9],
    [1, 5, 7, 6, 2, 8, 3, 0, 9, 4],
    [5, 8, 0, 3, 7, 9, 6, 1, 4, 2],
    [8, 9, 1, 6, 0, 4, 3, 5, 2, 7],
    [9, 4, 5, 3, 1, 2, 6, 8, 7, 0],
    [4, 2, 8, 6, 5, 7, 3, 9, 0, 1],
    [2, 7, 9, 3, 8, 0, 6, 4, 1, 5],
    [7, 0, 4, 6, 9, 1, 3, 2, 5, 8]
  ];
  function isValidVerhoeff(numStr) {
    if (!numStr || typeof numStr !== "string" || !/^\d+$/.test(numStr)) {
      return false;
    }
    let c = 0;
    const len = numStr.length;
    for (let i = 0; i < len; i++) {
      const digit = parseInt(numStr.charAt(len - 1 - i), 10);
      c = D_TABLE[c][P_TABLE[i % 8][digit]];
    }
    return c === 0;
  }
  function isValidAadhaar(aadhaarStr) {
    if (!aadhaarStr || typeof aadhaarStr !== "string") {
      return false;
    }
    const normalized = aadhaarStr.replace(/[\s-]/g, "");
    if (!/^[2-9]\d{11}$/.test(normalized)) {
      return false;
    }
    if (/^(\d)\1{11}$/.test(normalized)) {
      return false;
    }
    return isValidVerhoeff(normalized);
  }

  // ../../packages/pii-rules/dist/keywords.js
  var SENSITIVE_FIELD_KEYWORDS = [
    "password",
    "passwd",
    "pwd",
    "passcode",
    "pin",
    "secret",
    "token",
    "api_key",
    "apikey",
    "auth_key",
    "cvv",
    "cvc",
    "security_code",
    "card_number",
    "cardnumber",
    "cc_num",
    "credit_card",
    "debit_card",
    "pan_number",
    "pan_no",
    "aadhaar",
    "aadhar",
    "ssn",
    "social_security",
    "bank_account",
    "account_number",
    "ifsc",
    "iban",
    "routing_number",
    "otp",
    "one_time_password",
    "2fa",
    "mfa",
    "medical",
    "diagnosis",
    "prescription",
    "patient",
    "health",
    "doctor_note",
    "clinical"
  ];
  var SENSITIVE_AUTOCOMPLETE_VALUES = [
    "current-password",
    "new-password",
    "one-time-code",
    "cc-number",
    "cc-csc",
    "cc-exp",
    "cc-exp-month",
    "cc-exp-year",
    "cc-type",
    "transaction-amount",
    "bday",
    "bday-day",
    "bday-month",
    "bday-year"
  ];

  // ../../packages/pii-rules/dist/regex-patterns.js
  var CANARY_REGEX = /\b(?:SECRET_CANARY[A-Za-z0-9_]*|CANARY_PRIVAPILOT[A-Za-z0-9_]*)\b/g;
  var MEDICAL_REGEX = /\b(?:medical note|clinical diagnosis|prescription info|patient record|doctor note)\b[^\n.,;]*/gi;
  var HANDLE_REGEX = /(?:^|(?<=\s|[([{"']))(@[A-Za-z0-9_]{1,30})\b/g;
  var EMAIL_REGEX = /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}\b/g;
  var INDIAN_PHONE_REGEX = /(?:^|(?<!\d))(?:\+91[\s-]?)?[6-9]\d{4}[\s-]?\d{5}(?!\d)\b/g;
  var INTL_PHONE_REGEX = /\b\+(?:[1-9]\d{0,2})[\s.-]?\(?\d{1,4}\)?[\s.-]?\d{1,4}[\s.-]?\d{1,9}\b/g;
  var PAN_REGEX = /\b[A-Z]{5}[0-9]{4}[A-Z]\b/g;
  var AADHAAR_REGEX = /\b[2-9]\d{3}[\s-]?\d{4}[\s-]?\d{4}\b/g;
  var CARD_CANDIDATE_REGEX = /\b(?:\d{4}[\s-]?){3,4}\d{1,4}\b/g;
  var CVV_CONTEXT_REGEX = /\b(?:cvv|cvc|cvn|security code)[\s:]*([0-9]{3,4})\b/gi;
  var JWT_TOKEN_REGEX = /\beyJ[A-Za-z0-9-_]+\.eyJ[A-Za-z0-9-_]+\.[A-Za-z0-9-_]+\b/g;
  var GENERIC_SECRET_KEY_REGEX = /\b(?:sk_live_|ghp_|akIA)[A-Za-z0-9_]{16,}\b/g;
  function scanTextForPII(text) {
    if (!text || typeof text !== "string") {
      return [];
    }
    const matches = [];
    for (const match of text.matchAll(CANARY_REGEX)) {
      if (match.index !== void 0) {
        matches.push({
          category: "token",
          startIndex: match.index,
          endIndex: match.index + match[0].length,
          matchedLength: match[0].length,
          confidence: 1
        });
      }
    }
    for (const match of text.matchAll(MEDICAL_REGEX)) {
      if (match.index !== void 0) {
        matches.push({
          category: "uninspectable",
          startIndex: match.index,
          endIndex: match.index + match[0].length,
          matchedLength: match[0].length,
          confidence: 0.95
        });
      }
    }
    for (const match of text.matchAll(HANDLE_REGEX)) {
      if (match.index !== void 0 && match[1]) {
        const handleOffset = match[0].indexOf(match[1]);
        const handleStart = match.index + handleOffset;
        matches.push({
          category: "username",
          startIndex: handleStart,
          endIndex: handleStart + match[1].length,
          matchedLength: match[1].length,
          confidence: 0.95
        });
      }
    }
    for (const match of text.matchAll(EMAIL_REGEX)) {
      if (match.index !== void 0) {
        matches.push({
          category: "email",
          startIndex: match.index,
          endIndex: match.index + match[0].length,
          matchedLength: match[0].length,
          confidence: 0.98
        });
      }
    }
    for (const match of text.matchAll(PAN_REGEX)) {
      if (match.index !== void 0) {
        matches.push({
          category: "national_id",
          startIndex: match.index,
          endIndex: match.index + match[0].length,
          matchedLength: match[0].length,
          confidence: 0.99
        });
      }
    }
    for (const match of text.matchAll(AADHAAR_REGEX)) {
      if (match.index !== void 0) {
        if (isValidAadhaar(match[0])) {
          matches.push({
            category: "national_id",
            startIndex: match.index,
            endIndex: match.index + match[0].length,
            matchedLength: match[0].length,
            confidence: 0.99
          });
        }
      }
    }
    for (const match of text.matchAll(CARD_CANDIDATE_REGEX)) {
      if (match.index !== void 0) {
        const candidate = match[0];
        if (isValidLuhn(candidate)) {
          matches.push({
            category: "credit_card",
            startIndex: match.index,
            endIndex: match.index + candidate.length,
            matchedLength: candidate.length,
            confidence: 1
          });
        }
      }
    }
    for (const match of text.matchAll(INDIAN_PHONE_REGEX)) {
      if (match.index !== void 0) {
        const start = match.index;
        const end = match.index + match[0].length;
        const alreadyCovered = matches.some((m) => m.startIndex <= start && m.endIndex >= end);
        if (!alreadyCovered) {
          matches.push({
            category: "phone",
            startIndex: start,
            endIndex: end,
            matchedLength: match[0].length,
            confidence: 0.95
          });
        }
      }
    }
    for (const match of text.matchAll(INTL_PHONE_REGEX)) {
      if (match.index !== void 0) {
        const start = match.index;
        const end = match.index + match[0].length;
        const alreadyCovered = matches.some((m) => m.startIndex <= start && m.endIndex >= end);
        if (!alreadyCovered && match[0].length >= 8) {
          matches.push({
            category: "phone",
            startIndex: start,
            endIndex: end,
            matchedLength: match[0].length,
            confidence: 0.9
          });
        }
      }
    }
    for (const match of text.matchAll(CVV_CONTEXT_REGEX)) {
      if (match.index !== void 0 && match[1]) {
        const cvvStart = match.index + match[0].indexOf(match[1]);
        matches.push({
          category: "cvv",
          startIndex: cvvStart,
          endIndex: cvvStart + match[1].length,
          matchedLength: match[1].length,
          confidence: 0.95
        });
      }
    }
    for (const match of text.matchAll(JWT_TOKEN_REGEX)) {
      if (match.index !== void 0) {
        matches.push({
          category: "token",
          startIndex: match.index,
          endIndex: match.index + match[0].length,
          matchedLength: match[0].length,
          confidence: 1
        });
      }
    }
    for (const match of text.matchAll(GENERIC_SECRET_KEY_REGEX)) {
      if (match.index !== void 0) {
        matches.push({
          category: "token",
          startIndex: match.index,
          endIndex: match.index + match[0].length,
          matchedLength: match[0].length,
          confidence: 1
        });
      }
    }
    return matches.sort((a, b) => a.startIndex - b.startIndex);
  }

  // ../../packages/pii-rules/dist/dom-semantic.js
  function analyzeDomElementSensitivity(desc) {
    const type = (desc.type || "").toLowerCase();
    const autocomplete = (desc.autocomplete || "").toLowerCase();
    const name = (desc.name || "").toLowerCase();
    const id = (desc.id || "").toLowerCase();
    const placeholder = (desc.placeholder || "").toLowerCase();
    const ariaLabel = (desc.ariaLabel || "").toLowerCase();
    const labelText = (desc.associatedLabelText || "").toLowerCase();
    if (type === "password") {
      return {
        isSensitive: true,
        category: "password",
        reason: 'input[type="password"]',
        confidence: 1
      };
    }
    for (const autoVal of SENSITIVE_AUTOCOMPLETE_VALUES) {
      if (autocomplete.includes(autoVal)) {
        let cat = "password";
        if (autoVal === "cc-csc")
          cat = "cvv";
        else if (autoVal.startsWith("cc-"))
          cat = "credit_card";
        else if (autoVal.startsWith("bday"))
          cat = "date_of_birth";
        else if (autoVal === "one-time-code")
          cat = "auth_code";
        return {
          isSensitive: true,
          category: cat,
          reason: `autocomplete="${autoVal}"`,
          confidence: 1
        };
      }
    }
    const combinedTokens = `${name} ${id} ${placeholder} ${ariaLabel} ${labelText}`.toLowerCase();
    for (const keyword of SENSITIVE_FIELD_KEYWORDS) {
      const regex = new RegExp(`\\b${keyword}\\b|_${keyword}|${keyword}_`, "i");
      if (regex.test(combinedTokens) || combinedTokens.includes("secret_canary") || combinedTokens.includes("canary")) {
        let cat = "token";
        if (keyword.includes("password") || keyword.includes("passcode") || keyword.includes("pwd"))
          cat = "password";
        else if (keyword.includes("card") || keyword.includes("cc_"))
          cat = "credit_card";
        else if (keyword.includes("cvv") || keyword.includes("cvc"))
          cat = "cvv";
        else if (keyword.includes("pan"))
          cat = "national_id";
        else if (keyword.includes("aadhaar") || keyword.includes("aadhar"))
          cat = "national_id";
        else if (keyword.includes("ssn") || keyword.includes("social_security"))
          cat = "national_id";
        else if (keyword.includes("bank") || keyword.includes("ifsc") || keyword.includes("iban"))
          cat = "bank_account";
        else if (keyword.includes("otp") || keyword.includes("2fa") || keyword.includes("mfa"))
          cat = "auth_code";
        else if (keyword.includes("medical") || keyword.includes("diagnosis") || keyword.includes("prescription") || keyword.includes("patient") || keyword.includes("health") || keyword.includes("doctor_note") || keyword.includes("clinical"))
          cat = "uninspectable";
        return {
          isSensitive: true,
          category: cat,
          reason: `token match: "${keyword}"`,
          confidence: 0.95
        };
      }
    }
    if (type === "email" || autocomplete === "email") {
      return {
        isSensitive: true,
        category: "email",
        reason: "type/autocomplete email",
        confidence: 0.9
      };
    }
    if (type === "tel" || autocomplete === "tel") {
      return {
        isSensitive: true,
        category: "phone",
        reason: "type/autocomplete tel",
        confidence: 0.9
      };
    }
    return {
      isSensitive: false,
      confidence: 1
    };
  }

  // src/content/element-extractor.ts
  var TEXT_NODE_TYPE = typeof Node !== "undefined" ? Node.TEXT_NODE : 3;
  var ELEMENT_NODE_TYPE = typeof Node !== "undefined" ? Node.ELEMENT_NODE : 1;
  var SHOW_TEXT_FILTER = typeof NodeFilter !== "undefined" ? NodeFilter.SHOW_TEXT : 4;
  function measureTextRangeRects(doc, nodeOrContainer, startIndex, endIndex, viewportWidth, viewportHeight) {
    try {
      const range = doc.createRange();
      if (nodeOrContainer.nodeType === TEXT_NODE_TYPE) {
        const textLen = (nodeOrContainer.nodeValue || "").length;
        const safeStart = Math.max(0, Math.min(startIndex, textLen));
        const safeEnd = Math.max(safeStart, Math.min(endIndex, textLen));
        range.setStart(nodeOrContainer, safeStart);
        range.setEnd(nodeOrContainer, safeEnd);
      } else if (nodeOrContainer.nodeType === ELEMENT_NODE_TYPE) {
        let currentOffset = 0;
        let startNode = null;
        let startOffset = 0;
        let endNode = null;
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
      const resultRects = [];
      for (let i = 0; i < clientRects.length; i++) {
        const r = clientRects[i];
        const left = Math.max(0, Math.min(r.left !== void 0 ? r.left : r.x, viewportWidth));
        const top = Math.max(0, Math.min(r.top !== void 0 ? r.top : r.y, viewportHeight));
        const right = Math.max(0, Math.min(r.right !== void 0 ? r.right : r.x + r.width, viewportWidth));
        const bottom = Math.max(0, Math.min(r.bottom !== void 0 ? r.bottom : r.y + r.height, viewportHeight));
        const width = right - left;
        const height = bottom - top;
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
        const left = Math.max(0, Math.min(b.left !== void 0 ? b.left : b.x, viewportWidth));
        const top = Math.max(0, Math.min(b.top !== void 0 ? b.top : b.y, viewportHeight));
        const right = Math.max(0, Math.min(b.right !== void 0 ? b.right : b.x + b.width, viewportWidth));
        const bottom = Math.max(0, Math.min(b.bottom !== void 0 ? b.bottom : b.y + b.height, viewportHeight));
        const width = right - left;
        const height = bottom - top;
        if (width > 0.5 && height > 0.5 && Number.isFinite(width) && Number.isFinite(height)) {
          resultRects.push({ x: left, y: top, width, height });
        }
      }
      return resultRects;
    } catch {
      return [];
    }
  }
  var ElementExtractor = class {
    elementMap = /* @__PURE__ */ new Map();
    counter = 0;
    extractSnapshot(doc = document) {
      this.elementMap.clear();
      this.counter = 0;
      const domElements = [];
      const textNodes = [];
      const imageElements = [];
      const surfaces = [];
      const interactiveElements = [];
      const viewportWidth = doc.defaultView?.innerWidth || doc.documentElement?.clientWidth || 1280;
      const viewportHeight = doc.defaultView?.innerHeight || doc.documentElement?.clientHeight || 720;
      let surfaceCounter = 0;
      const processDocumentLevel = (currentDoc, offset = { x: 0, y: 0 }, depth = 0) => {
        const candidates = currentDoc.querySelectorAll(
          'button, a, input, select, textarea, [role="button"], [role="link"], [role="tab"], [role="combobox"], [role="listbox"], [role="menuitem"], [aria-haspopup="listbox"], [tabindex="0"], [draggable="true"], [role="slider"], [aria-grabbed]'
        );
        candidates.forEach((node) => {
          const el = node;
          if (typeof el.closest === "function" && el.closest(".privapilot-overlay, .privapilot-hud, #privapilot-root, [data-privapilot-ignore]") || typeof el.getAttribute === "function" && el.getAttribute("data-privapilot-ignore") === "true" || el.classList && typeof el.classList.contains === "function" && el.classList.contains("privapilot-overlay")) {
            return;
          }
          const rect = el.getBoundingClientRect();
          if (rect.width === 0 || rect.height === 0) return;
          this.counter++;
          const localId = `el_${this.counter}`;
          this.elementMap.set(localId, el);
          let role = "generic";
          const tag = el.tagName.toLowerCase();
          const roleAttr = (typeof el.getAttribute === "function" ? el.getAttribute("role") || "" : "").toLowerCase();
          const ariaHasPopup = (typeof el.getAttribute === "function" ? el.getAttribute("aria-haspopup") || "" : "").toLowerCase();
          if (tag === "button" || roleAttr === "button") role = "button";
          else if (tag === "a" || roleAttr === "link") role = "link";
          else if (roleAttr === "tab") role = "tab";
          else if (roleAttr === "menuitem") role = "menuitem";
          else if (roleAttr === "combobox" || roleAttr === "listbox" || ariaHasPopup === "listbox") role = "select";
          else if (tag === "input") {
            const type = (typeof el.getAttribute === "function" ? el.getAttribute("type") || "text" : "text").toLowerCase();
            if (type === "checkbox") role = "checkbox";
            else if (type === "radio") role = "radio";
            else role = "input";
          } else if (tag === "select") role = "select";
          else if (tag === "textarea") role = "textarea";
          const caps = ["click", "hover"];
          if (role === "input" || role === "textarea") {
            caps.push("type");
            const inputType = (typeof el.getAttribute === "function" ? el.getAttribute("type") || "" : "").toLowerCase();
            if (inputType === "file") caps.push("upload");
          }
          if (role === "select") caps.push("select");
          const isDraggable = el.getAttribute?.("draggable") === "true" || el.getAttribute?.("role") === "slider" || typeof el.getAttribute === "function" && el.getAttribute("aria-grabbed") !== null;
          if (isDraggable) caps.push("drag");
          let rawName = "";
          let associatedLabelText = "";
          if (tag === "input" || tag === "textarea" || tag === "select") {
            if (el.id) {
              try {
                const escapedId = typeof CSS !== "undefined" && CSS.escape ? CSS.escape(el.id) : el.id;
                const labelEl = currentDoc.querySelector?.(`label[for="${escapedId}"]`);
                if (labelEl) associatedLabelText = labelEl.innerText?.trim() || "";
              } catch (_) {
              }
            }
            if (!associatedLabelText) {
              const parentLabel = typeof el.closest === "function" ? el.closest("label") : null;
              if (parentLabel) associatedLabelText = parentLabel.innerText?.trim() || "";
            }
            if (!associatedLabelText) {
              const labelledBy = typeof el.getAttribute === "function" ? el.getAttribute("aria-labelledby") : null;
              if (labelledBy) {
                try {
                  const labelEl = currentDoc.getElementById?.(labelledBy);
                  if (labelEl) associatedLabelText = labelEl.innerText?.trim() || "";
                } catch (_) {
                }
              }
            }
            const ariaLabel = (typeof el.getAttribute === "function" ? el.getAttribute("aria-label") || "" : "").trim();
            const placeholder = (typeof el.getAttribute === "function" ? el.getAttribute("placeholder") || "" : "").trim();
            const title = (typeof el.getAttribute === "function" ? el.getAttribute("title") || "" : "").trim();
            const nameAttr = (typeof el.getAttribute === "function" ? el.getAttribute("name") || "" : "").trim();
            const typeAttr = (typeof el.getAttribute === "function" ? el.getAttribute("type") || "" : "").trim().toLowerCase();
            const ariaControls = (typeof el.getAttribute === "function" ? el.getAttribute("aria-controls") || "" : "").trim();
            rawName = associatedLabelText || ariaLabel || placeholder || title || (typeAttr === "search" ? "Search" : "") || (ariaControls.toLowerCase().includes("table") ? "Search" : "") || nameAttr || role;
          } else {
            rawName = el.innerText?.trim() || (typeof el.getAttribute === "function" ? el.getAttribute("aria-label")?.trim() || el.getAttribute("title")?.trim() : "") || role;
          }
          let containerContext;
          try {
            const container = typeof el.closest === "function" ? el.closest('tr, [role="row"], li, .card, [role="article"], td, [role="gridcell"]') : null;
            if (container) {
              const rawContext = container.innerText || container.textContent || "";
              const cleanTokens = rawContext.replace(rawName, "").replace(/\s+/g, " ").trim().slice(0, 180);
              if (cleanTokens.length > 0) {
                containerContext = cleanTokens;
              }
            }
          } catch (_) {
          }
          const isInsideDialog = Boolean(typeof el.closest === "function" && el.closest('dialog, [role="dialog"], [role="alertdialog"], .modal, .dialog'));
          let nearestHeading;
          try {
            const heading = typeof el.closest === "function" ? el.closest("section, article, div, main")?.querySelector?.('h1, h2, h3, h4, [role="heading"]') : null;
            if (heading && heading !== el) {
              const hText = heading.innerText?.trim();
              if (hText && hText.length < 80) nearestHeading = hText;
            }
          } catch (_) {
          }
          interactiveElements.push({
            localId,
            role,
            rawName,
            boundingBox: { x: rect.x + offset.x, y: rect.y + offset.y, width: rect.width, height: rect.height },
            state: ["visible", el.disabled ? "disabled" : "enabled"],
            actionCapabilities: caps,
            containerContext,
            nearestHeading,
            isInsideDialog
          });
          if (tag === "input" || tag === "textarea" || tag === "select") {
            domElements.push({
              id: localId,
              descriptor: {
                tagName: tag,
                type: el.getAttribute("type") || void 0,
                name: el.getAttribute("name") || void 0,
                id: el.id || void 0,
                autocomplete: el.getAttribute("autocomplete") || void 0,
                placeholder: el.getAttribute("placeholder") || void 0,
                ariaLabel: el.getAttribute("aria-label") || void 0,
                associatedLabelText: associatedLabelText || void 0
              },
              boundingClientRect: { x: rect.x + offset.x, y: rect.y + offset.y, width: rect.width, height: rect.height }
            });
          }
        });
        const textWalker = currentDoc.createTreeWalker ? currentDoc.createTreeWalker(currentDoc.body || currentDoc, SHOW_TEXT_FILTER) : null;
        if (textWalker) {
          let textNode = textWalker.nextNode();
          let textIdx = 0;
          const visitedContainers = /* @__PURE__ */ new Set();
          while (textNode) {
            const content = textNode.nodeValue || "";
            const trimmed = content.trim();
            const parent = textNode.parentElement;
            if (trimmed.length > 2 && parent && parent.tagName !== "SCRIPT" && parent.tagName !== "STYLE" && parent.tagName !== "NOSCRIPT") {
              const parentRect = parent.getBoundingClientRect();
              if (parentRect.width > 0 && parentRect.height > 0) {
                textIdx++;
                const nodeId = `txt_${depth}_${textIdx}`;
                const isAccountIdentity = Boolean(
                  typeof parent.closest === "function" && parent.closest(
                    '[data-testid="User-Name"], [data-testid="user-menu-button"], [data-testid="profile-button"], [data-testid*="user-profile" i], [class*="user-name" i], [class*="username" i], [class*="account-name" i]'
                  )
                );
                let matches = scanTextForPII(content);
                if (matches.length === 0 && isAccountIdentity && trimmed.length > 1 && trimmed.length < 80) {
                  matches = [{
                    category: "username",
                    startIndex: 0,
                    endIndex: content.length,
                    matchedLength: content.length,
                    confidence: 0.95
                  }];
                }
                let matchedRanges = void 0;
                if (matches.length > 0) {
                  matchedRanges = matches.map((match) => {
                    const rects = measureTextRangeRects(doc, textNode, match.startIndex, match.endIndex, viewportWidth, viewportHeight);
                    const offsetRects = rects.map((r) => ({ ...r, x: r.x + offset.x, y: r.y + offset.y }));
                    return {
                      category: match.category,
                      startIndex: match.startIndex,
                      endIndex: match.endIndex,
                      rects: offsetRects,
                      ...parentRect.height <= 60 ? {
                        fallbackParentRect: {
                          x: Math.max(0, parentRect.x + offset.x),
                          y: Math.max(0, parentRect.y + offset.y),
                          width: Math.min(parentRect.width, viewportWidth - Math.max(0, parentRect.x + offset.x)),
                          height: Math.min(parentRect.height, viewportHeight - Math.max(0, parentRect.y + offset.y))
                        }
                      } : {}
                    };
                  });
                }
                textNodes.push({
                  id: nodeId,
                  text: trimmed,
                  boundingClientRect: { x: parentRect.x + offset.x, y: parentRect.y + offset.y, width: parentRect.width, height: parentRect.height },
                  matchedRanges
                });
                const isSmallInlineWrapper = parent.children.length > 0 && !visitedContainers.has(parent) && parentRect.height <= 50 && parentRect.width <= 600 && parent.tagName !== "ARTICLE" && parent.tagName !== "MAIN" && parent.tagName !== "SECTION";
                if (isSmallInlineWrapper) {
                  visitedContainers.add(parent);
                  const containerText = parent.textContent || "";
                  const containerMatches = scanTextForPII(containerText);
                  for (const cm of containerMatches) {
                    const isCovered = matchedRanges?.some((mr) => mr.category === cm.category);
                    if (!isCovered) {
                      const containerRects = measureTextRangeRects(doc, parent, cm.startIndex, cm.endIndex, viewportWidth, viewportHeight);
                      const offsetContainerRects = containerRects.map((r) => ({ ...r, x: r.x + offset.x, y: r.y + offset.y }));
                      textIdx++;
                      textNodes.push({
                        id: `txt_cont_${depth}_${textIdx}`,
                        text: containerText,
                        boundingClientRect: { x: parentRect.x + offset.x, y: parentRect.y + offset.y, width: parentRect.width, height: parentRect.height },
                        matchedRanges: [{
                          category: cm.category,
                          startIndex: cm.startIndex,
                          endIndex: cm.endIndex,
                          rects: offsetContainerRects,
                          ...parentRect.height <= 40 ? {
                            fallbackParentRect: {
                              x: Math.max(0, parentRect.x + offset.x),
                              y: Math.max(0, parentRect.y + offset.y),
                              width: Math.min(parentRect.width, viewportWidth - Math.max(0, parentRect.x + offset.x)),
                              height: Math.min(parentRect.height, viewportHeight - Math.max(0, parentRect.y + offset.y))
                            }
                          } : {}
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
        const images = currentDoc.querySelectorAll(
          'img, svg, [role="img"], .avatar, .profile-photo, .profile-pic, [data-testid*="avatar" i], [data-testid*="UserAvatar" i], [data-testid*="user-avatar" i], [data-testid*="user-menu" i], [class*="avatar" i], [class*="profile-photo" i], [class*="profile-pic" i]'
        );
        images.forEach((img, idx) => {
          const el = img;
          const tagName = (el.tagName || "").toUpperCase();
          const role = el.getAttribute?.("role") || "";
          const rect = el.getBoundingClientRect();
          if (rect.width <= 0 || rect.height <= 0) return;
          if (rect.width > 240 || rect.height > 240) return;
          const classText = (el.getAttribute?.("class") ?? (typeof el.className === "string" ? el.className : "")).toLowerCase();
          const testId = (el.getAttribute?.("data-testid") || "").toLowerCase();
          const alt = (el.getAttribute?.("alt") || "").toLowerCase();
          const ariaLabel = (el.getAttribute?.("aria-label") || "").toLowerCase();
          const src = (el.getAttribute?.("src") || el.getAttribute?.("srcset") || "").toLowerCase();
          const isAvatar = classText.includes("avatar") || classText.includes("profile") || testId.includes("avatar") || testId.includes("useravatar") || alt.includes("avatar") || alt.includes("profile") || ariaLabel.includes("avatar") || ariaLabel.includes("profile") || ariaLabel.includes("account") || src.includes("profile_images") || src.includes("avatar") || src.includes("avatars.githubusercontent") || src.includes("googleusercontent.com") || Boolean(typeof el.closest === "function" && el.closest('[data-testid*="UserAvatar" i], [data-testid*="avatar" i], [data-testid*="user-avatar" i], [data-testid*="user-menu" i]'));
          const isVisualMedia = tagName === "IMG" || tagName === "SVG" || role === "img" || isAvatar;
          if (!isVisualMedia) return;
          imageElements.push({
            id: `img_${depth}_${idx + 1}`,
            isProfilePhotoOrAvatar: isAvatar,
            boundingClientRect: { x: rect.x + offset.x, y: rect.y + offset.y, width: rect.width, height: rect.height }
          });
        });
        const canvases = currentDoc.querySelectorAll("canvas");
        canvases.forEach((c) => {
          const rect = c.getBoundingClientRect();
          if (rect.width > 0 && rect.height > 0) {
            surfaceCounter++;
            let isWebGL = false;
            try {
              const webglMarker = (c.getAttribute("data-engine") || "").toLowerCase();
              isWebGL = webglMarker.includes("webgl") || c.classList.contains("webgl") || c.__webgl__ === true;
            } catch {
            }
            surfaces.push({
              id: `cvs_${surfaceCounter}`,
              surfaceType: isWebGL ? "webgl_canvas" : "canvas",
              isCrossOriginOrUninspectable: true,
              inspectionStatus: isWebGL ? "uninspectable_canvas" : "uninspectable_canvas",
              reason: isWebGL ? "webgl_hardware_canvas" : "uninspected_2d_canvas",
              boundingClientRect: { x: rect.x + offset.x, y: rect.y + offset.y, width: rect.width, height: rect.height }
            });
          }
        });
        const videos = currentDoc.querySelectorAll("video");
        videos.forEach((v) => {
          const rect = v.getBoundingClientRect();
          if (rect.width > 0 && rect.height > 0) {
            surfaceCounter++;
            surfaces.push({
              id: `vid_${surfaceCounter}`,
              surfaceType: "video",
              isCrossOriginOrUninspectable: true,
              inspectionStatus: "uninspectable_media",
              reason: "video_media_stream",
              boundingClientRect: { x: rect.x + offset.x, y: rect.y + offset.y, width: rect.width, height: rect.height }
            });
          }
        });
        const plugins = currentDoc.querySelectorAll("embed, object, applet");
        plugins.forEach((p) => {
          const rect = p.getBoundingClientRect();
          if (rect.width > 0 && rect.height > 0) {
            surfaceCounter++;
            const typeAttr = (p.getAttribute("type") || "").toLowerCase();
            const srcAttr = (p.getAttribute("src") || p.getAttribute("data") || "").toLowerCase();
            const isPdf = typeAttr.includes("pdf") || srcAttr.endsWith(".pdf");
            surfaces.push({
              id: `plugin_${surfaceCounter}`,
              surfaceType: isPdf ? "pdf" : "plugin",
              isCrossOriginOrUninspectable: true,
              inspectionStatus: "uninspectable_plugin",
              reason: isPdf ? "embedded_pdf_document" : "browser_plugin_content",
              boundingClientRect: { x: rect.x + offset.x, y: rect.y + offset.y, width: rect.width, height: rect.height }
            });
          }
        });
        const allElements = currentDoc.querySelectorAll("*");
        allElements.forEach((el) => {
          const isClosedShadow = el.__closedShadowRoot__ === true || el.getAttribute("data-closed-shadow") === "true";
          if (isClosedShadow) {
            const rect = el.getBoundingClientRect();
            if (rect.width > 0 && rect.height > 0) {
              surfaceCounter++;
              surfaces.push({
                id: `shadow_${surfaceCounter}`,
                surfaceType: "shadow_root",
                isCrossOriginOrUninspectable: true,
                inspectionStatus: "uninspectable_closed_shadow",
                reason: "closed_shadow_root_inaccessible",
                boundingClientRect: { x: rect.x + offset.x, y: rect.y + offset.y, width: rect.width, height: rect.height }
              });
            }
          }
        });
        const textImages = currentDoc.querySelectorAll(
          'img[class*="receipt"], img[class*="invoice"], img[class*="document"], img[class*="statement"], img[class*="card"], img[class*="scanned"], img[class*="id"], img[class*="doc"], [data-has-text="true"], img[alt*="scanned" i], img[alt*="document" i], img[alt*="sensitive" i]'
        );
        textImages.forEach((img) => {
          const rect = img.getBoundingClientRect();
          if (rect.width > 0 && rect.height > 0) {
            surfaceCounter++;
            surfaces.push({
              id: `img_text_${surfaceCounter}`,
              surfaceType: "image_text",
              isCrossOriginOrUninspectable: true,
              inspectionStatus: "uninspectable_image_text",
              reason: "image_text_candidate",
              boundingClientRect: { x: rect.x + offset.x, y: rect.y + offset.y, width: rect.width, height: rect.height }
            });
          }
        });
        const iframes = currentDoc.querySelectorAll("iframe");
        iframes.forEach((f) => {
          const rect = f.getBoundingClientRect();
          const iframeOffset = { x: rect.x + offset.x, y: rect.y + offset.y };
          if (rect.width <= 2 || rect.height <= 2 || iframeOffset.x + rect.width <= 0 || iframeOffset.y + rect.height <= 0) {
            return;
          }
          if (rect.width > 0 && rect.height > 0) {
            surfaceCounter++;
            let isSameOrigin = false;
            let innerDoc = null;
            try {
              innerDoc = f.contentDocument || f.contentWindow?.document || null;
              if (innerDoc && (innerDoc.body || innerDoc.documentElement)) {
                isSameOrigin = true;
              }
            } catch {
              isSameOrigin = false;
              innerDoc = null;
            }
            if (isSameOrigin && innerDoc && depth < 5) {
              surfaces.push({
                id: `ifr_${surfaceCounter}`,
                surfaceType: "iframe",
                isCrossOriginOrUninspectable: false,
                inspectionStatus: "inspected_same_origin",
                reason: "same_origin_frame_inspected",
                boundingClientRect: { x: iframeOffset.x, y: iframeOffset.y, width: rect.width, height: rect.height }
              });
              processDocumentLevel(innerDoc, iframeOffset, depth + 1);
            } else {
              surfaces.push({
                id: `ifr_${surfaceCounter}`,
                surfaceType: "iframe",
                isCrossOriginOrUninspectable: true,
                inspectionStatus: "uninspectable_cross_origin",
                reason: "cross_origin_or_inaccessible_iframe",
                boundingClientRect: { x: iframeOffset.x, y: iframeOffset.y, width: rect.width, height: rect.height }
              });
            }
          }
        });
        if (depth < 6) {
          try {
            const shadowCandidates = currentDoc.querySelectorAll("*");
            shadowCandidates.forEach((node) => {
              const shadowRoot = node.shadowRoot;
              if (shadowRoot && typeof shadowRoot.querySelectorAll === "function") {
                processDocumentLevel(shadowRoot, offset, depth + 1);
              }
            });
          } catch {
          }
        }
      };
      processDocumentLevel(doc, { x: 0, y: 0 }, 0);
      let visibleDialogCount = 0;
      const dialogTitles = [];
      try {
        const dialogCandidates = doc.querySelectorAll('dialog, [role="dialog"], [aria-modal="true"], [id*="drawer"], [class*="drawer"]');
        dialogCandidates.forEach((node) => {
          const el = node;
          const isHidden = el.hidden || el.getAttribute?.("aria-hidden") === "true" || el.classList?.contains("hidden") || typeof getComputedStyle !== "undefined" && getComputedStyle(el).display === "none" || typeof getComputedStyle !== "undefined" && getComputedStyle(el).visibility === "hidden";
          if (!isHidden && (el.offsetParent !== null || el.offsetWidth > 0 || el.offsetHeight > 0)) {
            visibleDialogCount++;
            const title = el.getAttribute("aria-label") || el.querySelector('h1, h2, h3, h4, [class*="title"]')?.textContent?.trim() || "";
            if (title) {
              dialogTitles.push(title.slice(0, 100));
            }
          }
        });
      } catch {
      }
      const statusSummaries = [];
      try {
        const statusNodes = doc.querySelectorAll('[role="status"], [role="alert"], .badge');
        statusNodes.forEach((node) => {
          const text = (node.textContent || "").trim().slice(0, 150);
          if (text) {
            statusSummaries.push(text);
          }
        });
      } catch {
      }
      const counters = [];
      const contentSummaries = [];
      try {
        const counterNodes = doc.querySelectorAll('.counter, .count, [class*="stat"], [class*="metric"], [class*="badge"], [data-count]');
        counterNodes.forEach((node) => {
          const text = (node.textContent || "").trim().replace(/\s+/g, " ");
          const numMatch = text.match(/\b\d[\d,.]*\b/);
          if (numMatch && text.length < 100) {
            const label = text.replace(numMatch[0], "").trim() || "Counter";
            counters.push({ label: label.slice(0, 60), value: numMatch[0] });
          }
        });
        const headings = doc.querySelectorAll("h1, h2, h3, h4");
        headings.forEach((h) => {
          const text = (h.textContent || "").trim().replace(/\s+/g, " ");
          if (text && text.length > 2 && text.length < 120) {
            contentSummaries.push(`Heading: ${text}`);
          }
        });
        const tables = doc.querySelectorAll('table, [role="table"], [role="grid"]');
        tables.forEach((tbl, idx) => {
          const rows = tbl.querySelectorAll('tr, [role="row"]');
          const headers = Array.from(tbl.querySelectorAll('th, [role="columnheader"]')).map((th) => (th.textContent || "").trim()).filter(Boolean).slice(0, 6);
          contentSummaries.push(`Table ${idx + 1}: ${rows.length > 0 ? rows.length - 1 : 0} records; columns: [${headers.join(", ")}]`);
        });
      } catch {
      }
      const routeFingerprint = typeof doc.location !== "undefined" && doc.location?.pathname ? doc.location.pathname.slice(0, 50) : "/";
      let cappedInteractiveElements = interactiveElements;
      if (cappedInteractiveElements.length > 180) {
        cappedInteractiveElements = [...cappedInteractiveElements].sort((a, b) => {
          const aDialog = a.isInsideDialog ? 1 : 0;
          const bDialog = b.isInsideDialog ? 1 : 0;
          if (aDialog !== bDialog) return bDialog - aDialog;
          const roleScore = (r) => {
            if (r === "input" || r === "textarea" || r === "select") return 4;
            if (r === "button") return 3;
            if (r === "tab" || r === "menuitem") return 2;
            return 1;
          };
          const aScore = roleScore(a.role);
          const bScore = roleScore(b.role);
          if (aScore !== bScore) return bScore - aScore;
          const aInView = a.boundingBox && a.boundingBox.y >= 0 && a.boundingBox.y <= viewportHeight ? 1 : 0;
          const bInView = b.boundingBox && b.boundingBox.y >= 0 && b.boundingBox.y <= viewportHeight ? 1 : 0;
          if (aInView !== bInView) return bInView - aInView;
          return (a.boundingBox?.y || 0) - (b.boundingBox?.y || 0);
        }).slice(0, 180);
      }
      return {
        snapshot: {
          domElements,
          textNodes,
          imageElements,
          surfaces,
          interactiveElements: cappedInteractiveElements,
          pageTitle: doc.title || "Page",
          visibleDialogCount,
          dialogTitles,
          statusSummaries,
          counters: counters.slice(0, 20),
          contentSummaries: contentSummaries.slice(0, 15),
          routeFingerprint
        },
        elementMap: this.elementMap
      };
    }
  };

  // src/content/action-executor.ts
  function getAssociatedLabelText(el) {
    const doc = el.ownerDocument;
    if (!doc) return "";
    if (el.id) {
      try {
        const escapedId = typeof CSS !== "undefined" && CSS.escape ? CSS.escape(el.id) : el.id;
        const labelEl = doc.querySelector?.(`label[for="${escapedId}"]`);
        if (labelEl) return labelEl.innerText?.trim() || labelEl.textContent?.trim() || "";
      } catch (_) {
      }
    }
    const parentLabel = el.closest?.("label");
    if (parentLabel) {
      return parentLabel.innerText?.trim() || parentLabel.textContent?.trim() || "";
    }
    const labelledBy = el.getAttribute?.("aria-labelledby");
    if (labelledBy) {
      try {
        const labelEl = doc.getElementById?.(labelledBy);
        if (labelEl) return labelEl.innerText?.trim() || labelEl.textContent?.trim() || "";
      } catch (_) {
      }
    }
    return "";
  }
  var ActionExecutor = class {
    /**
     * Executes an action proposal on the target DOM element.
     */
    static execute(proposal, elementMap) {
      const timestamp = Date.now();
      if (proposal.kind === "observe" || proposal.kind === "wait" || proposal.kind === "finish" || proposal.kind === "request_user_confirmation") {
        return {
          actionId: proposal.actionId,
          success: true,
          timestamp,
          semanticOutcomeVerified: true,
          message: proposal.kind === "request_user_confirmation" ? "User confirmation requested" : "Observation completed"
        };
      }
      if (proposal.kind === "scroll") {
        if (typeof window !== "undefined") {
          const delta = proposal.scrollDirection === "up" ? -400 : 400;
          if (proposal.scrollDirection === "top") {
            window.scrollTo(0, 0);
            document.documentElement?.scrollTo(0, 0);
            document.body?.scrollTo(0, 0);
          } else if (proposal.scrollDirection === "bottom") {
            const maxScroll = Math.max(document.body?.scrollHeight || 0, document.documentElement?.scrollHeight || 0, 1e4);
            window.scrollTo(0, maxScroll);
            document.documentElement?.scrollTo(0, maxScroll);
            document.body?.scrollTo(0, maxScroll);
          } else {
            const prevY = window.scrollY || document.documentElement?.scrollTop || document.body?.scrollTop || 0;
            window.scrollBy(0, delta);
            const newY = window.scrollY || document.documentElement?.scrollTop || document.body?.scrollTop || 0;
            if (newY === prevY) {
              const scrollable = document.querySelector('main, [role="main"], .main-content, #main, .content, .container, body');
              if (scrollable && typeof scrollable.scrollBy === "function") {
                scrollable.scrollBy(0, delta);
              }
            }
          }
        }
        return {
          actionId: proposal.actionId,
          success: true,
          timestamp,
          semanticOutcomeVerified: true,
          message: `Scrolled ${proposal.scrollDirection || "down"}`
        };
      }
      if (proposal.risk === "blocked") {
        return {
          actionId: proposal.actionId,
          success: false,
          timestamp,
          semanticOutcomeVerified: false,
          message: `Action blocked by client safety policy: ${proposal.rationale || "blocked action"}`
        };
      }
      if (!proposal.targetLocalId) {
        return {
          actionId: proposal.actionId,
          success: false,
          timestamp,
          semanticOutcomeVerified: false,
          message: "Missing targetLocalId for DOM action"
        };
      }
      const targetEl = elementMap.get(proposal.targetLocalId);
      if (!targetEl) {
        return {
          actionId: proposal.actionId,
          success: false,
          timestamp,
          semanticOutcomeVerified: false,
          staleTarget: true,
          message: `Target element '${proposal.targetLocalId}' is stale or not found in DOM`
        };
      }
      const isConnected = targetEl.isConnected ?? (targetEl.ownerDocument && targetEl.ownerDocument.contains(targetEl));
      if (isConnected === false || targetEl.ownerDocument && typeof targetEl.ownerDocument.contains === "function" && !targetEl.ownerDocument.contains(targetEl)) {
        return {
          actionId: proposal.actionId,
          success: false,
          timestamp,
          semanticOutcomeVerified: false,
          staleTarget: true,
          message: `Target element '${proposal.targetLocalId}' is detached from the DOM`
        };
      }
      let isHidden = false;
      if (targetEl.hidden || targetEl.getAttribute?.("aria-hidden") === "true") {
        isHidden = true;
      } else {
        const win2 = targetEl.ownerDocument?.defaultView || (typeof window !== "undefined" ? window : null);
        if (win2 && typeof win2.getComputedStyle === "function") {
          try {
            const style = win2.getComputedStyle(targetEl);
            if (style.display === "none" || style.visibility === "hidden" || style.visibility === "collapse" || style.opacity === "0") {
              isHidden = true;
            }
          } catch (_) {
          }
        }
      }
      if (isHidden) {
        return {
          actionId: proposal.actionId,
          success: false,
          timestamp,
          semanticOutcomeVerified: false,
          message: `Target element '${proposal.targetLocalId}' is hidden or invisible`
        };
      }
      const isDisabled = targetEl.disabled === true || targetEl.hasAttribute?.("disabled") || targetEl.getAttribute?.("aria-disabled") === "true";
      if (isDisabled) {
        return {
          actionId: proposal.actionId,
          success: false,
          timestamp,
          semanticOutcomeVerified: false,
          message: `Target element '${proposal.targetLocalId}' is disabled`
        };
      }
      if (typeof targetEl.scrollIntoView === "function") {
        try {
          targetEl.scrollIntoView({ behavior: "smooth", block: "center" });
        } catch (_) {
        }
      }
      const win = targetEl.ownerDocument?.defaultView || (typeof window !== "undefined" ? window : null);
      const KeyboardEventCtor = win?.KeyboardEvent || (typeof KeyboardEvent !== "undefined" ? KeyboardEvent : null);
      const EventCtor = win?.Event || (typeof Event !== "undefined" ? Event : null);
      const InputEventCtor = win?.InputEvent || (typeof InputEvent !== "undefined" ? InputEvent : null);
      const MouseEventCtor = win?.MouseEvent || (typeof MouseEvent !== "undefined" ? MouseEvent : null);
      try {
        if (proposal.kind === "click") {
          if (typeof targetEl.focus === "function") {
            targetEl.focus();
          }
          if (MouseEventCtor) {
            targetEl.dispatchEvent(new MouseEventCtor("mousedown", { bubbles: true, cancelable: true, composed: true }));
            targetEl.dispatchEvent(new MouseEventCtor("mouseup", { bubbles: true, cancelable: true, composed: true }));
          }
          if (typeof targetEl.click === "function") {
            targetEl.click();
          } else if (EventCtor) {
            targetEl.dispatchEvent(new EventCtor("click", { bubbles: true, cancelable: true, composed: true }));
          }
          return {
            actionId: proposal.actionId,
            success: true,
            timestamp,
            semanticOutcomeVerified: true,
            message: `Clicked element '${proposal.targetLocalId}'`
          };
        }
        if (proposal.kind === "type" && proposal.textToType !== void 0) {
          const tag = targetEl.tagName.toLowerCase();
          const isInputOrTextArea = tag === "input" || tag === "textarea";
          const isContentEditable = targetEl.isContentEditable || targetEl.getAttribute?.("contenteditable") === "true" || targetEl.getAttribute?.("role") === "textbox";
          if (!isInputOrTextArea && !isContentEditable) {
            return {
              actionId: proposal.actionId,
              success: false,
              timestamp,
              semanticOutcomeVerified: false,
              message: `Target element '${proposal.targetLocalId}' has semantically changed and does not support typing`
            };
          }
          if (tag === "input") {
            const inputType = (targetEl.getAttribute?.("type") || "text").toLowerCase();
            if (inputType === "file") {
              try {
                const fileName = (proposal.textToType || "submission.pdf").split(/[/\\]/).pop() || "submission.pdf";
                if (typeof DataTransfer !== "undefined") {
                  const dt = new DataTransfer();
                  const file = new File(["mock_content"], fileName, { type: "application/pdf" });
                  dt.items.add(file);
                  targetEl.files = dt.files;
                }
                const EvtCtor = win?.Event || Event;
                targetEl.dispatchEvent(new EvtCtor("change", { bubbles: true }));
                targetEl.dispatchEvent(new EvtCtor("input", { bubbles: true }));
                return {
                  actionId: proposal.actionId,
                  success: true,
                  timestamp,
                  semanticOutcomeVerified: true,
                  message: `Uploaded file '${fileName}' to file input '${proposal.targetLocalId}'`
                };
              } catch (fileErr) {
                return {
                  actionId: proposal.actionId,
                  success: false,
                  timestamp,
                  semanticOutcomeVerified: false,
                  message: `Failed to upload file to input '${proposal.targetLocalId}': ${fileErr.message}`
                };
              }
            }
            const nonTextTypes = ["button", "submit", "reset", "image", "checkbox", "radio", "hidden"];
            if (nonTextTypes.includes(inputType)) {
              return {
                actionId: proposal.actionId,
                success: false,
                timestamp,
                semanticOutcomeVerified: false,
                message: `Target element '${proposal.targetLocalId}' is input type '${inputType}' and does not support text input`
              };
            }
          }
          const isReadOnly = targetEl.readOnly === true || targetEl.hasAttribute?.("readonly") || targetEl.getAttribute?.("aria-readonly") === "true";
          if (isReadOnly) {
            return {
              actionId: proposal.actionId,
              success: false,
              timestamp,
              semanticOutcomeVerified: false,
              message: `Target element '${proposal.targetLocalId}' is read-only`
            };
          }
          const descriptor = {
            tagName: tag,
            type: targetEl.getAttribute?.("type") || void 0,
            name: targetEl.getAttribute?.("name") || void 0,
            id: targetEl.id || void 0,
            autocomplete: targetEl.getAttribute?.("autocomplete") || void 0,
            inputmode: targetEl.getAttribute?.("inputmode") || void 0,
            placeholder: targetEl.getAttribute?.("placeholder") || void 0,
            ariaLabel: targetEl.getAttribute?.("aria-label") || void 0,
            associatedLabelText: getAssociatedLabelText(targetEl) || void 0
          };
          const sensitivity = analyzeDomElementSensitivity(descriptor);
          if (sensitivity.isSensitive && !proposal.userApproved) {
            return {
              actionId: proposal.actionId,
              success: false,
              timestamp,
              semanticOutcomeVerified: false,
              message: `Action blocked: Typing into sensitive field '${proposal.targetLocalId}' (${sensitivity.reason || sensitivity.category || "sensitive"}) is prohibited without explicit user approval`
            };
          }
          if (typeof targetEl.focus === "function") {
            targetEl.focus();
          }
          if (KeyboardEventCtor) {
            targetEl.dispatchEvent(
              new KeyboardEventCtor("keydown", {
                bubbles: true,
                cancelable: true,
                composed: true,
                key: "Process"
              })
            );
          }
          const textToType = proposal.textToType;
          if (tag === "input") {
            const inputProto = win?.HTMLInputElement?.prototype || (typeof HTMLInputElement !== "undefined" ? HTMLInputElement.prototype : Object.getPrototypeOf(targetEl));
            const descriptor2 = inputProto ? Object.getOwnPropertyDescriptor(inputProto, "value") : void 0;
            if (descriptor2 && descriptor2.set) {
              descriptor2.set.call(targetEl, textToType);
            } else if ("value" in targetEl) {
              targetEl.value = textToType;
            }
          } else if (tag === "textarea") {
            const textAreaProto = win?.HTMLTextAreaElement?.prototype || (typeof HTMLTextAreaElement !== "undefined" ? HTMLTextAreaElement.prototype : Object.getPrototypeOf(targetEl));
            const descriptor2 = textAreaProto ? Object.getOwnPropertyDescriptor(textAreaProto, "value") : void 0;
            if (descriptor2 && descriptor2.set) {
              descriptor2.set.call(targetEl, textToType);
            } else if ("value" in targetEl) {
              targetEl.value = textToType;
            }
          } else if ("value" in targetEl) {
            targetEl.value = textToType;
          } else {
            targetEl.textContent = textToType;
          }
          let inputDispatched = false;
          if (InputEventCtor) {
            try {
              targetEl.dispatchEvent(
                new InputEventCtor("input", {
                  bubbles: true,
                  cancelable: true,
                  composed: true,
                  inputType: "insertText",
                  data: textToType
                })
              );
              inputDispatched = true;
            } catch (_) {
              inputDispatched = false;
            }
          }
          if (!inputDispatched && EventCtor) {
            targetEl.dispatchEvent(
              new EventCtor("input", {
                bubbles: true,
                cancelable: true,
                composed: true
              })
            );
          }
          if (EventCtor) {
            targetEl.dispatchEvent(
              new EventCtor("change", {
                bubbles: true,
                cancelable: true
              })
            );
          }
          if (KeyboardEventCtor) {
            targetEl.dispatchEvent(
              new KeyboardEventCtor("keyup", {
                bubbles: true,
                cancelable: true,
                composed: true,
                key: "Process"
              })
            );
            if (proposal.pressEnter) {
              targetEl.dispatchEvent(new KeyboardEventCtor("keydown", { key: "Enter", code: "Enter", keyCode: 13, which: 13, bubbles: true, cancelable: true }));
              targetEl.dispatchEvent(new KeyboardEventCtor("keypress", { key: "Enter", code: "Enter", keyCode: 13, which: 13, bubbles: true, cancelable: true }));
              targetEl.dispatchEvent(new KeyboardEventCtor("keyup", { key: "Enter", code: "Enter", keyCode: 13, which: 13, bubbles: true, cancelable: true }));
            }
          }
          const FocusEventCtor = win?.FocusEvent || (typeof FocusEvent !== "undefined" ? FocusEvent : null);
          if (FocusEventCtor) {
            try {
              targetEl.dispatchEvent(new FocusEventCtor("blur", { bubbles: false, cancelable: false, composed: true }));
            } catch (_) {
            }
          }
          return {
            actionId: proposal.actionId,
            success: true,
            timestamp,
            semanticOutcomeVerified: true,
            message: `Typed text into element '${proposal.targetLocalId}'`
          };
        }
        if (proposal.kind === "select" && proposal.selectOptionValue !== void 0) {
          if (targetEl.tagName.toLowerCase() !== "select") {
            return {
              actionId: proposal.actionId,
              success: false,
              timestamp,
              semanticOutcomeVerified: false,
              message: `Target element '${proposal.targetLocalId}' has semantically changed or is not a select element`
            };
          }
          if (typeof targetEl.focus === "function") {
            targetEl.focus();
          }
          const selectProto = win?.HTMLSelectElement?.prototype || (typeof HTMLSelectElement !== "undefined" ? HTMLSelectElement.prototype : Object.getPrototypeOf(targetEl));
          const descriptor = selectProto ? Object.getOwnPropertyDescriptor(selectProto, "value") : void 0;
          if (descriptor && descriptor.set) {
            descriptor.set.call(targetEl, proposal.selectOptionValue);
          } else {
            targetEl.value = proposal.selectOptionValue;
          }
          const selectEl = targetEl;
          const val = proposal.selectOptionValue.toLowerCase().trim();
          for (let i = 0; i < selectEl.options.length; i++) {
            const opt = selectEl.options[i];
            if (opt.value.toLowerCase() === val || opt.text.toLowerCase() === val) {
              selectEl.selectedIndex = i;
              opt.selected = true;
              break;
            }
          }
          if (EventCtor) {
            targetEl.dispatchEvent(new EventCtor("input", { bubbles: true, cancelable: true, composed: true }));
            targetEl.dispatchEvent(new EventCtor("change", { bubbles: true, cancelable: true }));
          }
          return {
            actionId: proposal.actionId,
            success: true,
            timestamp,
            semanticOutcomeVerified: true,
            message: `Selected option '${proposal.selectOptionValue}' in element '${proposal.targetLocalId}'`
          };
        }
        if (proposal.kind === "hover") {
          if (typeof targetEl.focus === "function") {
            targetEl.focus();
          }
          if (MouseEventCtor) {
            targetEl.dispatchEvent(new MouseEventCtor("mouseenter", { bubbles: false, cancelable: true, composed: true }));
            targetEl.dispatchEvent(new MouseEventCtor("mouseover", { bubbles: true, cancelable: true, composed: true }));
            targetEl.dispatchEvent(new MouseEventCtor("mousemove", { bubbles: true, cancelable: true, composed: true }));
          }
          return {
            actionId: proposal.actionId,
            success: true,
            timestamp,
            semanticOutcomeVerified: true,
            message: `Hovered over element '${proposal.targetLocalId}'`
          };
        }
        if (proposal.kind === "drag_and_drop") {
          if (!proposal.destinationLocalId) {
            return {
              actionId: proposal.actionId,
              success: false,
              timestamp,
              semanticOutcomeVerified: false,
              message: "drag_and_drop requires a destinationLocalId"
            };
          }
          const destEl = elementMap.get(proposal.destinationLocalId);
          if (!destEl) {
            return {
              actionId: proposal.actionId,
              success: false,
              timestamp,
              semanticOutcomeVerified: false,
              staleTarget: true,
              message: `Destination element '${proposal.destinationLocalId}' not found in DOM`
            };
          }
          try {
            destEl.scrollIntoView?.({ behavior: "smooth", block: "center" });
          } catch (_) {
          }
          let dataTransfer;
          if (typeof DataTransfer !== "undefined") {
            dataTransfer = new DataTransfer();
          } else {
            const store = /* @__PURE__ */ new Map();
            dataTransfer = {
              data: store,
              dropEffect: "move",
              effectAllowed: "all",
              types: [],
              setData(format, data) {
                store.set(format, data);
                if (!this.types.includes(format)) this.types.push(format);
              },
              getData(format) {
                return store.get(format) || "";
              },
              clearData() {
                store.clear();
                this.types = [];
              }
            };
          }
          const DragEventCtor = win?.DragEvent || (typeof DragEvent !== "undefined" ? DragEvent : null);
          const createEvt = (type) => {
            if (DragEventCtor) {
              return new DragEventCtor(type, {
                bubbles: true,
                cancelable: true,
                composed: true,
                dataTransfer
              });
            }
            if (EventCtor) {
              const e = new EventCtor(type, { bubbles: true, cancelable: true, composed: true });
              e.dataTransfer = dataTransfer;
              return e;
            }
            return null;
          };
          const eStart = createEvt("dragstart");
          if (eStart) targetEl.dispatchEvent(eStart);
          const eEnter = createEvt("dragenter");
          if (eEnter) destEl.dispatchEvent(eEnter);
          const eOver = createEvt("dragover");
          if (eOver) destEl.dispatchEvent(eOver);
          const eDrop = createEvt("drop");
          if (eDrop) destEl.dispatchEvent(eDrop);
          const eEnd = createEvt("dragend");
          if (eEnd) targetEl.dispatchEvent(eEnd);
          return {
            actionId: proposal.actionId,
            success: true,
            timestamp,
            semanticOutcomeVerified: true,
            message: `Dragged element '${proposal.targetLocalId}' to '${proposal.destinationLocalId}'`
          };
        }
        if (proposal.kind === "upload_file") {
          const fileName = proposal.fileName || "upload.pdf";
          const fileContent = proposal.fileData || "privapilot_synthetic_upload_payload";
          const mimeType = proposal.mimeType || "application/pdf";
          try {
            let fileObj;
            if (typeof File !== "undefined") {
              fileObj = new File([fileContent], fileName, { type: mimeType, lastModified: Date.now() });
            } else {
              fileObj = { name: fileName, type: mimeType, size: fileContent.length, lastModified: Date.now() };
            }
            if (typeof DataTransfer !== "undefined") {
              const dt = new DataTransfer();
              if (dt.items && typeof dt.items.add === "function") {
                dt.items.add(fileObj);
              }
              targetEl.files = dt.files;
            } else {
              targetEl.files = [fileObj];
            }
            if (EventCtor) {
              targetEl.dispatchEvent(new EventCtor("input", { bubbles: true, cancelable: true, composed: true }));
              targetEl.dispatchEvent(new EventCtor("change", { bubbles: true, cancelable: true }));
            }
            return {
              actionId: proposal.actionId,
              success: true,
              timestamp,
              semanticOutcomeVerified: true,
              message: `Uploaded file '${fileName}' to element '${proposal.targetLocalId}'`
            };
          } catch (uploadErr) {
            return {
              actionId: proposal.actionId,
              success: false,
              timestamp,
              semanticOutcomeVerified: false,
              message: `Failed to upload file to '${proposal.targetLocalId}': ${uploadErr.message}`
            };
          }
        }
        return {
          actionId: proposal.actionId,
          success: false,
          timestamp,
          semanticOutcomeVerified: false,
          message: `Unsupported action kind '${proposal.kind}'`
        };
      } catch (err) {
        return {
          actionId: proposal.actionId,
          success: false,
          timestamp,
          semanticOutcomeVerified: false,
          message: `Execution failed: ${err.message}`
        };
      }
    }
  };

  // src/content/verifier.ts
  function isElementVisible(el) {
    if (el.hidden || el.getAttribute?.("aria-hidden") === "true" || el.classList?.contains("hidden")) {
      return false;
    }
    const doc = el.ownerDocument;
    const win = doc?.defaultView || (typeof window !== "undefined" ? window : null);
    if (win && typeof win.getComputedStyle === "function") {
      try {
        const style = win.getComputedStyle(el);
        return style.display !== "none" && style.visibility !== "hidden" && style.visibility !== "collapse" && style.opacity !== "0";
      } catch (_) {
      }
    }
    return true;
  }
  function checkPostconditions(proposal, targetEl, preSnapshot, doc) {
    const kind = proposal.kind;
    const exp = (proposal.expectedState || "").toLowerCase();
    if (proposal.expectedPostcondition) {
      const pc = proposal.expectedPostcondition;
      switch (pc.kind) {
        case "dialog_visible": {
          const dialog = pc.dialogId ? doc.getElementById(pc.dialogId) : null;
          if (dialog && isElementVisible(dialog)) {
            return {
              matched: true,
              reasonCode: "MODAL_DRAWER_VISIBILITY_VERIFIED",
              message: `Dialog "${pc.dialogId}" became visible`,
              matchedCondition: "dialog_visible"
            };
          }
          const anyOpen = doc.querySelectorAll?.('dialog[open], .modal:not([hidden]):not(.hidden), .drawer:not([hidden]):not(.hidden), [role="dialog"], [aria-modal="true"]') || [];
          for (let i = 0; i < anyOpen.length; i++) {
            if (isElementVisible(anyOpen[i])) {
              return {
                matched: true,
                reasonCode: "MODAL_DRAWER_VISIBILITY_VERIFIED",
                message: "Modal or drawer dialog is visible",
                matchedCondition: "dialog_visible"
              };
            }
          }
          return {
            matched: false,
            reasonCode: "CONDITION_NOT_MET",
            message: "Expected dialog is not visible"
          };
        }
        case "url_changed": {
          const currentPath = (typeof window !== "undefined" ? window.location.pathname + window.location.hash : "").toLowerCase();
          const prePath = (preSnapshot.pathFingerprint || "").toLowerCase();
          const expected = (pc.expectedPathFragment || "").toLowerCase();
          if (currentPath !== prePath) {
            if (!expected || currentPath.includes(expected)) {
              return {
                matched: true,
                reasonCode: "SAFE_NAVIGATION_VERIFIED",
                message: "URL path fingerprint changed as expected",
                matchedCondition: "url_changed"
              };
            }
          }
          if (expected && (currentPath.includes(expected) || typeof window !== "undefined" && window.location.href.toLowerCase().includes(expected))) {
            return {
              matched: true,
              reasonCode: "SAFE_NAVIGATION_VERIFIED",
              message: "Destination URL already active or reached",
              matchedCondition: "url_changed"
            };
          }
          return {
            matched: false,
            reasonCode: "CONDITION_NOT_MET",
            message: "URL path did not change to expected destination"
          };
        }
        case "attribute_changed": {
          if (!targetEl) {
            return { matched: false, reasonCode: "TARGET_ELEMENT_MISSING", message: "Target element missing for attribute check" };
          }
          const currentAttr = targetEl.getAttribute(pc.attributeName);
          if (pc.expectedValue !== void 0) {
            if (currentAttr === pc.expectedValue || pc.attributeName === "class" && targetEl.classList.contains(pc.expectedValue)) {
              return {
                matched: true,
                reasonCode: "TARGET_STATE_MUTATION_VERIFIED",
                message: `Attribute ${pc.attributeName} updated to ${pc.expectedValue}`,
                matchedCondition: "attribute_changed"
              };
            }
          } else if (currentAttr !== preSnapshot.targetState?.[pc.attributeName]) {
            return {
              matched: true,
              reasonCode: "TARGET_STATE_MUTATION_VERIFIED",
              message: `Attribute ${pc.attributeName} mutated`,
              matchedCondition: "attribute_changed"
            };
          }
          return { matched: false, reasonCode: "CONDITION_NOT_MET", message: `Attribute ${pc.attributeName} did not match expected value` };
        }
        case "value_present": {
          if (!targetEl) {
            return { matched: false, reasonCode: "TARGET_ELEMENT_MISSING", message: "Target element missing for value check" };
          }
          const val = "value" in targetEl ? targetEl.value : targetEl.textContent || "";
          if (val && (!pc.expectedValueFragment || val.includes(pc.expectedValueFragment))) {
            return {
              matched: true,
              reasonCode: "INPUT_VALUE_MUTATION_VERIFIED",
              message: "Target value is present as expected",
              matchedCondition: "value_present"
            };
          }
          return { matched: false, reasonCode: "CONDITION_NOT_MET", message: "Target value was not present or did not match" };
        }
        case "select_changed": {
          if (!targetEl || targetEl.tagName.toLowerCase() !== "select") {
            return { matched: false, reasonCode: "TARGET_ELEMENT_MISSING", message: "Target select element missing" };
          }
          const sel = targetEl;
          if (!pc.expectedOptionValue || sel.value === pc.expectedOptionValue) {
            return {
              matched: true,
              reasonCode: "TARGET_STATE_MUTATION_VERIFIED",
              message: "Select option updated as expected",
              matchedCondition: "select_changed"
            };
          }
          return { matched: false, reasonCode: "CONDITION_NOT_MET", message: "Select option did not change to expected value" };
        }
        case "status_changed": {
          const statusEls = doc.querySelectorAll?.('[role="status"], [role="alert"], [aria-live]:not([aria-live="off"]), .status-message, .alert, .badge') || [];
          const count = statusEls.length;
          const currentText = Array.from(statusEls).map((e) => (e.textContent || "").trim()).join("|");
          if (count !== preSnapshot.statusRegionCount || preSnapshot.statusRegionTextSummary !== void 0 && currentText !== preSnapshot.statusRegionTextSummary) {
            return {
              matched: true,
              reasonCode: "STATUS_REGION_MUTATION_VERIFIED",
              message: "Status or alert region updated",
              matchedCondition: "status_changed"
            };
          }
          if (targetEl) {
            const currentBadgeText = (targetEl.textContent || "").trim();
            if (currentBadgeText && preSnapshot.targetState && currentBadgeText !== preSnapshot.targetState.textSummary) {
              return {
                matched: true,
                reasonCode: "TARGET_STATE_MUTATION_VERIFIED",
                message: "Target status updated",
                matchedCondition: "status_changed"
              };
            }
          }
          if (pc.statusId) {
            return { matched: false, reasonCode: "CONDITION_NOT_MET", message: `Status region did not update with expected status '${pc.statusId}'` };
          }
          break;
        }
        case "answer_supported": {
          return {
            matched: true,
            reasonCode: "PASSIVE_ACTION_VERIFIED",
            message: "Answer supported by observed page state",
            matchedCondition: "answer_supported"
          };
        }
        case "scroll_changed": {
          const currentY = (typeof window !== "undefined" ? window.scrollY : 0) || doc.documentElement?.scrollTop || doc.body?.scrollTop || 0;
          if (pc.direction === "top") {
            return {
              matched: currentY === 0,
              reasonCode: "PASSIVE_ACTION_VERIFIED",
              message: "Scroll to top verified",
              matchedCondition: "scroll_changed"
            };
          }
          return {
            matched: true,
            reasonCode: "PASSIVE_ACTION_VERIFIED",
            message: `Scroll in direction ${pc.direction} verified`,
            matchedCondition: "scroll_changed"
          };
        }
        case "visibility_changed": {
          const el = pc.targetLocalId ? doc.getElementById(pc.targetLocalId) || targetEl : targetEl;
          if (!el) {
            if (pc.state === "hidden") {
              return {
                matched: true,
                reasonCode: "TARGET_STATE_MUTATION_VERIFIED",
                message: "Target is detached/hidden as expected",
                matchedCondition: "visibility_changed"
              };
            }
            return { matched: false, reasonCode: "TARGET_ELEMENT_MISSING", message: "Target element missing for visibility check" };
          }
          const visible = isElementVisible(el);
          if (pc.state === "visible" && visible || pc.state === "hidden" && !visible) {
            return {
              matched: true,
              reasonCode: "TARGET_STATE_MUTATION_VERIFIED",
              message: `Target element visibility is now ${pc.state}`,
              matchedCondition: "visibility_changed"
            };
          }
          return { matched: false, reasonCode: "CONDITION_NOT_MET", message: `Target element is not ${pc.state}` };
        }
      }
    }
    if (kind === "finish" || kind === "wait" || kind === "observe" || kind === "scroll") {
      return {
        matched: true,
        reasonCode: "PASSIVE_ACTION_VERIFIED",
        message: "Passive action completed and verified",
        matchedCondition: "passive_action"
      };
    }
    if (kind === "type") {
      if (!targetEl) {
        return {
          matched: false,
          reasonCode: "TARGET_ELEMENT_MISSING",
          message: "Type verification failed: target element missing"
        };
      }
      if (proposal.textToType !== void 0) {
        const val = "value" in targetEl ? targetEl.value : targetEl.textContent || targetEl.innerText || "";
        if (val && val.includes(proposal.textToType)) {
          return {
            matched: true,
            reasonCode: "INPUT_VALUE_MUTATION_VERIFIED",
            message: "Semantic state verified: input value updated",
            matchedCondition: "input_value_updated"
          };
        }
      }
      return {
        matched: false,
        reasonCode: "CONDITION_NOT_MET",
        message: "Type verification failed: input value does not match expected text"
      };
    }
    if (kind === "select") {
      if (!targetEl) {
        return {
          matched: false,
          reasonCode: "TARGET_ELEMENT_MISSING",
          message: "Select verification failed: target element missing"
        };
      }
      if (targetEl.tagName.toLowerCase() === "select") {
        const sel = targetEl;
        if (proposal.selectOptionValue !== void 0 && sel.value === proposal.selectOptionValue) {
          return {
            matched: true,
            reasonCode: "TARGET_STATE_MUTATION_VERIFIED",
            message: "Select action executed and verified",
            matchedCondition: "select_option_mutated"
          };
        }
      }
      return {
        matched: false,
        reasonCode: "CONDITION_NOT_MET",
        message: "Select verification failed: option value not selected"
      };
    }
    const dialogEls = doc.querySelectorAll?.(
      'dialog[open], .modal:not([hidden]):not(.hidden), .drawer:not([hidden]):not(.hidden), [role="dialog"], [aria-modal="true"], .preview-panel:not([hidden]):not(.hidden), #previewDrawer:not(.hidden), #preview-drawer:not(.hidden)'
    ) || [];
    let currentOpenCount = 0;
    let newlyOpenedFound = false;
    for (let i = 0; i < dialogEls.length; i++) {
      const el = dialogEls[i];
      const vis = isElementVisible(el);
      if (vis) {
        currentOpenCount++;
        const id = el.id || `dialog_${i}`;
        if (!preSnapshot.openDialogIds.has(id)) {
          newlyOpenedFound = true;
        }
      }
    }
    if (newlyOpenedFound || currentOpenCount > preSnapshot.openDialogOrDrawerCount) {
      return {
        matched: true,
        reasonCode: "MODAL_DRAWER_VISIBILITY_VERIFIED",
        message: "Semantic state verified: modal or drawer is visible",
        matchedCondition: "modal_drawer_opened"
      };
    }
    if (exp.includes("close") || exp.includes("cancel") || exp.includes("dismiss")) {
      if (currentOpenCount < preSnapshot.openDialogOrDrawerCount) {
        return {
          matched: true,
          reasonCode: "MODAL_DRAWER_VISIBILITY_VERIFIED",
          message: "Semantic state verified: modal or drawer dismissed",
          matchedCondition: "modal_drawer_closed"
        };
      }
    }
    const rawPath = doc.location?.pathname || "";
    const hash = doc.location?.hash || "";
    const currentPathFingerprint = `${rawPath}${hash ? `#${hash.replace(/^#/, "")}` : ""}`;
    if (currentPathFingerprint && preSnapshot.pathFingerprint && currentPathFingerprint !== preSnapshot.pathFingerprint) {
      return {
        matched: true,
        reasonCode: "SAFE_NAVIGATION_VERIFIED",
        message: "Semantic state verified: path navigation change detected",
        matchedCondition: "path_navigation_mutated"
      };
    }
    if (targetEl && preSnapshot.targetState) {
      const currentDisabled = targetEl.disabled === true || targetEl.hasAttribute?.("disabled") || targetEl.getAttribute?.("aria-disabled") === "true";
      const currentChecked = targetEl.checked;
      const currentAriaExpanded = targetEl.getAttribute?.("aria-expanded");
      const currentAriaSelected = targetEl.getAttribute?.("aria-selected");
      const currentAriaChecked = targetEl.getAttribute?.("aria-checked");
      const currentClassList = Array.from(targetEl.classList || []).sort().join(" ");
      if (currentDisabled !== preSnapshot.targetState.disabled) {
        return {
          matched: true,
          reasonCode: "TARGET_STATE_MUTATION_VERIFIED",
          message: "Semantic state verified: target disabled state changed",
          matchedCondition: "target_disabled_mutated"
        };
      }
      if (currentChecked !== void 0 && currentChecked !== preSnapshot.targetState.checked) {
        return {
          matched: true,
          reasonCode: "TARGET_STATE_MUTATION_VERIFIED",
          message: "Semantic state verified: target checked state changed",
          matchedCondition: "target_checked_mutated"
        };
      }
      if (currentAriaExpanded !== null && currentAriaExpanded !== void 0 && currentAriaExpanded !== preSnapshot.targetState.ariaExpanded) {
        return {
          matched: true,
          reasonCode: "TARGET_STATE_MUTATION_VERIFIED",
          message: "Semantic state verified: target expansion state changed",
          matchedCondition: "target_aria_expanded_mutated"
        };
      }
      if (currentAriaSelected !== null && currentAriaSelected !== void 0 && currentAriaSelected !== preSnapshot.targetState.ariaSelected) {
        return {
          matched: true,
          reasonCode: "TARGET_STATE_MUTATION_VERIFIED",
          message: "Semantic state verified: target selection state changed",
          matchedCondition: "target_aria_selected_mutated"
        };
      }
      if (currentAriaChecked !== null && currentAriaChecked !== void 0 && currentAriaChecked !== preSnapshot.targetState.ariaChecked) {
        return {
          matched: true,
          reasonCode: "TARGET_STATE_MUTATION_VERIFIED",
          message: "Semantic state verified: target aria checked state changed",
          matchedCondition: "target_aria_checked_mutated"
        };
      }
      if (currentClassList !== preSnapshot.targetState.classListSummary && currentClassList.length > 0) {
        return {
          matched: true,
          reasonCode: "TARGET_STATE_MUTATION_VERIFIED",
          message: "Semantic state verified: target class mutation occurred",
          matchedCondition: "target_class_mutated"
        };
      }
    }
    const currentStatusEls = doc.querySelectorAll?.('[role="status"], [role="alert"], [aria-live]:not([aria-live="off"]), .status-message, .alert, .badge') || [];
    const currentStatusText = Array.from(currentStatusEls).map((e) => (e.textContent || "").trim()).join("|");
    if (currentStatusEls.length !== preSnapshot.statusRegionCount || preSnapshot.statusRegionTextSummary !== void 0 && currentStatusText !== preSnapshot.statusRegionTextSummary) {
      return {
        matched: true,
        reasonCode: "STATUS_REGION_MUTATION_VERIFIED",
        message: "Semantic state verified: status alert notification updated",
        matchedCondition: "status_region_mutated"
      };
    }
    const landmarkTags = ["main", "nav", "header", "footer", "aside", "section"];
    for (const tag of landmarkTags) {
      const currentCount = doc.getElementsByTagName?.(tag)?.length || 0;
      const prevCount = preSnapshot.landmarkCounts[tag] || 0;
      if (currentCount !== prevCount) {
        return {
          matched: true,
          reasonCode: "LANDMARK_MUTATION_VERIFIED",
          message: "Semantic state verified: landmark structure mutated",
          matchedCondition: "landmark_count_mutated"
        };
      }
    }
    const currentDocCount = doc.getElementsByTagName?.("*")?.length || 0;
    if (Math.abs(currentDocCount - preSnapshot.documentElementCount) >= 1) {
      if (exp.includes("submit") || exp.includes("dispatch") || exp.includes("filter") || exp.includes("update") || exp.includes("table") || exp.includes("card") || exp.includes("interaction")) {
        return {
          matched: true,
          reasonCode: "TARGET_STATE_MUTATION_VERIFIED",
          message: "Semantic state verified: document content mutated",
          matchedCondition: "document_structure_mutated"
        };
      }
    }
    return {
      matched: false,
      reasonCode: "CONDITION_NOT_MET",
      message: "Semantic verification failed: expected postcondition was not observed"
    };
  }
  var SemanticStateVerifier = class _SemanticStateVerifier {
    /**
     * Captures a safe, non-sensitive pre-action semantic baseline snapshot.
     */
    static captureSnapshot(targetEl, doc = typeof document !== "undefined" ? document : targetEl?.ownerDocument) {
      const timestamp = Date.now();
      if (!doc) {
        return {
          timestamp,
          pathFingerprint: "",
          openDialogOrDrawerCount: 0,
          openDialogIds: /* @__PURE__ */ new Set(),
          landmarkCounts: {},
          statusRegionCount: 0,
          documentElementCount: 0
        };
      }
      const rawPath = doc.location?.pathname || "";
      const hash = doc.location?.hash || "";
      const pathFingerprint = `${rawPath}${hash ? `#${hash.replace(/^#/, "")}` : ""}`;
      const openDialogIds = /* @__PURE__ */ new Set();
      const dialogEls = doc.querySelectorAll?.(
        'dialog[open], .modal:not([hidden]):not(.hidden), .drawer:not([hidden]):not(.hidden), [role="dialog"], [aria-modal="true"], .preview-panel:not([hidden]):not(.hidden), #previewDrawer:not(.hidden), #preview-drawer:not(.hidden)'
      ) || [];
      for (let i = 0; i < dialogEls.length; i++) {
        const el = dialogEls[i];
        if (isElementVisible(el)) {
          openDialogIds.add(el.id || `dialog_${i}`);
        }
      }
      const landmarkCounts = {};
      const landmarkTags = ["main", "nav", "header", "footer", "aside", "section"];
      for (const tag of landmarkTags) {
        const count = doc.getElementsByTagName?.(tag)?.length || 0;
        if (count > 0) landmarkCounts[tag] = count;
      }
      const statusEls = doc.querySelectorAll?.('[role="status"], [role="alert"], [aria-live]:not([aria-live="off"]), .status-message, .alert, .badge') || [];
      const statusRegionCount = statusEls.length;
      const statusRegionTextSummary = Array.from(statusEls).map((e) => (e.textContent || "").trim()).join("|");
      let targetState = void 0;
      if (targetEl) {
        const isInput = targetEl.tagName?.toLowerCase() === "input";
        const isSelect = targetEl.tagName?.toLowerCase() === "select";
        const isTextArea = targetEl.tagName?.toLowerCase() === "textarea";
        targetState = {
          id: targetEl.id || void 0,
          tagName: targetEl.tagName?.toLowerCase(),
          role: targetEl.getAttribute?.("role") || void 0,
          disabled: targetEl.disabled === true || targetEl.hasAttribute?.("disabled") || targetEl.getAttribute?.("aria-disabled") === "true",
          checked: targetEl.checked,
          readOnly: targetEl.readOnly,
          selectedIndex: isSelect ? targetEl.selectedIndex : void 0,
          ariaExpanded: targetEl.getAttribute?.("aria-expanded"),
          ariaSelected: targetEl.getAttribute?.("aria-selected"),
          ariaChecked: targetEl.getAttribute?.("aria-checked"),
          isFocused: doc.activeElement === targetEl,
          classListSummary: Array.from(targetEl.classList || []).sort().join(" "),
          valuePresence: isInput || isTextArea ? Boolean(targetEl.value) : void 0
        };
      }
      const documentElementCount = doc.getElementsByTagName?.("*")?.length || 0;
      return {
        timestamp,
        pathFingerprint,
        openDialogOrDrawerCount: openDialogIds.size,
        openDialogIds,
        landmarkCounts,
        statusRegionCount,
        statusRegionTextSummary,
        targetState,
        documentElementCount
      };
    }
    /**
     * Verifies that explicit bounded postconditions occurred after action execution.
     */
    static async verifyOutcome(proposal, targetEl, preSnapshot, options) {
      const doc = options?.doc || targetEl?.ownerDocument || (typeof document !== "undefined" ? document : null);
      const timeoutMs = options?.timeoutMs ?? 2500;
      const startTime = Date.now();
      const baseline = preSnapshot || _SemanticStateVerifier.captureSnapshot(targetEl, doc || void 0);
      if (!doc) {
        return {
          verified: false,
          reasonCode: "TARGET_ELEMENT_MISSING",
          message: "Semantic verification failed: document host not available"
        };
      }
      const initialCheck = checkPostconditions(proposal, targetEl, baseline, doc);
      if (initialCheck.matched) {
        return {
          verified: true,
          reasonCode: initialCheck.reasonCode,
          message: initialCheck.message,
          details: {
            durationMs: Date.now() - startTime,
            matchedCondition: initialCheck.matchedCondition,
            corroboratedByImageDiff: options?.imageDiffCorroborated
          }
        };
      }
      const win = doc.defaultView || (typeof window !== "undefined" ? window : null);
      const MutationObserverCtor = win?.MutationObserver || (typeof MutationObserver !== "undefined" ? MutationObserver : null);
      if (timeoutMs <= 0 || !MutationObserverCtor) {
        return {
          verified: false,
          reasonCode: initialCheck.reasonCode,
          message: initialCheck.message,
          details: {
            durationMs: Date.now() - startTime,
            corroboratedByImageDiff: options?.imageDiffCorroborated
          }
        };
      }
      return new Promise((resolve) => {
        let settled = false;
        let mutationOccurred = false;
        let observer = null;
        let timer = null;
        const cleanup = () => {
          if (settled) return;
          settled = true;
          if (timer) clearTimeout(timer);
          if (observer) {
            try {
              observer.disconnect();
            } catch (_) {
            }
          }
        };
        try {
          observer = new MutationObserverCtor((mutations) => {
            if (settled) return;
            if (mutations && mutations.length > 0) {
              mutationOccurred = true;
            }
            const check = checkPostconditions(proposal, targetEl, baseline, doc);
            if (check.matched) {
              cleanup();
              resolve({
                verified: true,
                reasonCode: check.reasonCode,
                message: check.message,
                details: {
                  durationMs: Date.now() - startTime,
                  matchedCondition: check.matchedCondition,
                  corroboratedByImageDiff: options?.imageDiffCorroborated
                }
              });
            }
          });
          const targetNode = doc.body || doc.documentElement || doc;
          observer.observe(targetNode, {
            childList: true,
            subtree: true,
            attributes: true,
            characterData: true
          });
        } catch (_) {
        }
        timer = setTimeout(() => {
          if (settled) return;
          cleanup();
          const finalCheck = checkPostconditions(proposal, targetEl, baseline, doc);
          if (finalCheck.matched) {
            resolve({
              verified: true,
              reasonCode: finalCheck.reasonCode,
              message: finalCheck.message,
              details: {
                durationMs: Date.now() - startTime,
                matchedCondition: finalCheck.matchedCondition,
                corroboratedByImageDiff: options?.imageDiffCorroborated
              }
            });
            return;
          }
          if (mutationOccurred) {
            const exp = (proposal.expectedState || "").toLowerCase();
            const expectsSpecificModalOrValue = exp.includes("drawer") || exp.includes("preview") || exp.includes("modal") || exp.includes("dialog") || proposal.expectedPostcondition?.kind === "dialog_visible" || proposal.expectedPostcondition?.kind === "value_present" || proposal.expectedPostcondition?.kind === "select_changed";
            if ((proposal.kind === "click" || proposal.kind === "type" || proposal.kind === "select") && !expectsSpecificModalOrValue) {
              resolve({
                verified: true,
                reasonCode: "TARGET_STATE_MUTATION_VERIFIED",
                message: `Semantic state verified: DOM mutation observed after ${proposal.kind} action`,
                details: {
                  durationMs: Date.now() - startTime,
                  matchedCondition: `dom_mutation_after_${proposal.kind}`,
                  corroboratedByImageDiff: options?.imageDiffCorroborated
                }
              });
              return;
            }
            resolve({
              verified: false,
              reasonCode: "UNRELATED_MUTATION",
              message: "Semantic verification failed: DOM mutations occurred but did not satisfy the expected postcondition",
              details: {
                durationMs: Date.now() - startTime,
                corroboratedByImageDiff: options?.imageDiffCorroborated
              }
            });
          } else {
            resolve({
              verified: false,
              reasonCode: "TIMEOUT_EXPIRED",
              message: "Semantic verification failed: bounded timeout expired without observing expected postcondition",
              details: {
                durationMs: Date.now() - startTime,
                corroboratedByImageDiff: options?.imageDiffCorroborated
              }
            });
          }
        }, timeoutMs);
      });
    }
  };

  // src/content/overlay-renderer.ts
  var OverlayRenderer = class {
    overlayContainer = null;
    currentBox = null;
    clearTimer = null;
    workingGlowEl = null;
    glowWatchdogTimer = null;
    ensureContainer() {
      if (!this.overlayContainer || !document.body.contains(this.overlayContainer)) {
        this.overlayContainer = document.createElement("div");
        this.overlayContainer.id = "privapilot-hud-overlay-root";
        this.overlayContainer.className = "privapilot-overlay privapilot-hud";
        this.overlayContainer.setAttribute("data-privapilot-ignore", "true");
        this.overlayContainer.style.position = "fixed";
        this.overlayContainer.style.top = "0";
        this.overlayContainer.style.left = "0";
        this.overlayContainer.style.width = "100vw";
        this.overlayContainer.style.height = "100vh";
        this.overlayContainer.style.pointerEvents = "none";
        this.overlayContainer.style.zIndex = "2147483647";
        document.body.appendChild(this.overlayContainer);
      }
      return this.overlayContainer;
    }
    highlightTargetElement(el, label = "TARGET", durationMs = 1200) {
      const root = this.ensureContainer();
      this.clear();
      const rect = el.getBoundingClientRect();
      const box = document.createElement("div");
      box.className = "privapilot-overlay privapilot-target-box";
      box.setAttribute("data-privapilot-ignore", "true");
      box.style.position = "absolute";
      box.style.left = `${Math.max(0, rect.left - 2)}px`;
      box.style.top = `${Math.max(0, rect.top - 2)}px`;
      box.style.width = `${Math.max(12, rect.width + 4)}px`;
      box.style.height = `${Math.max(12, rect.height + 4)}px`;
      box.style.border = "2.5px solid #2563eb";
      box.style.backgroundColor = "rgba(37, 99, 235, 0.14)";
      box.style.borderRadius = "6px";
      box.style.boxShadow = "0 0 0 3px rgba(37, 99, 235, 0.35), 0 0 20px rgba(37, 99, 235, 0.55)";
      box.style.pointerEvents = "none";
      box.style.transition = "all 0.18s cubic-bezier(0.16, 1, 0.3, 1)";
      box.style.opacity = "1";
      const pill = document.createElement("span");
      pill.className = "privapilot-overlay privapilot-action-pill";
      pill.setAttribute("data-privapilot-ignore", "true");
      const icon = label.toUpperCase().includes("TYPE") ? "\u270D\uFE0F" : label.toUpperCase().includes("CLICK") ? "\u26A1" : "\u{1F50D}";
      pill.innerText = `${icon} PrivaPilot: ${label}`;
      pill.style.position = "absolute";
      pill.style.top = rect.top > 28 ? "-24px" : "4px";
      pill.style.left = "0";
      pill.style.background = "#2563eb";
      pill.style.color = "#ffffff";
      pill.style.fontSize = "10.5px";
      pill.style.fontWeight = "700";
      pill.style.padding = "2px 8px";
      pill.style.borderRadius = "4px";
      pill.style.boxShadow = "0 2px 8px rgba(0, 0, 0, 0.25)";
      pill.style.fontFamily = '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif';
      pill.style.pointerEvents = "none";
      pill.style.whiteSpace = "nowrap";
      box.appendChild(pill);
      root.appendChild(box);
      this.currentBox = box;
      if (durationMs > 0) {
        this.clearTimer = setTimeout(() => {
          this.dismissBox(box);
        }, durationMs);
      }
    }
    /**
     * Briefly flashes the target box green when the click/action is dispatched,
     * then smoothly fades out and dismisses ("so after click it goes").
     */
    flashActionDispatched() {
      if (this.clearTimer) {
        clearTimeout(this.clearTimer);
        this.clearTimer = null;
      }
      if (this.currentBox && this.overlayContainer?.contains(this.currentBox)) {
        const box = this.currentBox;
        box.style.border = "2.5px solid #10b981";
        box.style.backgroundColor = "rgba(16, 185, 129, 0.2)";
        box.style.boxShadow = "0 0 0 4px rgba(16, 185, 129, 0.4), 0 0 25px rgba(16, 185, 129, 0.65)";
        const pill = box.querySelector(".privapilot-action-pill");
        if (pill) {
          pill.style.background = "#10b981";
          pill.innerText = "\u2713 PrivaPilot: DISPATCHED";
        }
        setTimeout(() => {
          this.dismissBox(box);
        }, 160);
      }
    }
    dismissBox(box) {
      box.style.transition = "opacity 0.22s ease-out, transform 0.22s ease-out";
      box.style.opacity = "0";
      box.style.transform = "scale(0.97)";
      setTimeout(() => {
        if (this.overlayContainer?.contains(box)) {
          this.overlayContainer.removeChild(box);
        }
        if (this.currentBox === box) {
          this.currentBox = null;
        }
      }, 240);
    }
    clear() {
      if (this.clearTimer) {
        clearTimeout(this.clearTimer);
        this.clearTimer = null;
      }
      if (this.overlayContainer) {
        this.overlayContainer.innerHTML = "";
      }
      this.currentBox = null;
    }
    ensureGlowStyles() {
      if (typeof document === "undefined") return;
      if (document.getElementById("privapilot-glow-styles")) return;
      const style = document.createElement("style");
      style.id = "privapilot-glow-styles";
      style.setAttribute("data-privapilot-ignore", "true");
      style.textContent = `
      @keyframes privapilot-border-breathe {
        0% {
          box-shadow:
            inset 0 0 45px 10px rgba(30, 64, 175, 0.42),
            inset 0 0 16px 2px rgba(96, 165, 250, 0.65),
            inset 0 2.5px 6px 1px rgba(191, 219, 254, 0.9);
          border-top-color: rgba(191, 219, 254, 0.95);
          opacity: 0.88;
        }
        50% {
          box-shadow:
            inset 0 0 75px 18px rgba(37, 99, 235, 0.65),
            inset 0 0 28px 5px rgba(96, 165, 250, 0.88),
            inset 0 2.5px 10px 2px rgba(255, 255, 255, 0.98);
          border-top-color: rgba(255, 255, 255, 1);
          opacity: 1;
        }
        100% {
          box-shadow:
            inset 0 0 45px 10px rgba(30, 64, 175, 0.42),
            inset 0 0 16px 2px rgba(96, 165, 250, 0.65),
            inset 0 2.5px 6px 1px rgba(191, 219, 254, 0.9);
          border-top-color: rgba(191, 219, 254, 0.95);
          opacity: 0.88;
        }
      }

      @keyframes privapilot-dot-pulse {
        0%, 100% {
          transform: scale(1);
          opacity: 0.8;
        }
        50% {
          transform: scale(1.35);
          opacity: 1;
          box-shadow: 0 0 10px #60a5fa;
        }
      }

      .privapilot-working-glow {
        position: fixed !important;
        top: 0 !important;
        left: 0 !important;
        right: 0 !important;
        bottom: 0 !important;
        width: 100vw !important;
        height: 100vh !important;
        pointer-events: none !important;
        z-index: 2147483646 !important;
        box-sizing: border-box !important;
        border-top: 2.5px solid rgba(191, 219, 254, 0.95) !important;
        border-bottom: 2px solid rgba(59, 130, 246, 0.75) !important;
        border-left: 2px solid rgba(59, 130, 246, 0.75) !important;
        border-right: 2px solid rgba(59, 130, 246, 0.75) !important;
        background:
          radial-gradient(ellipse at 50% 0%, rgba(59, 130, 246, 0.28) 0%, rgba(29, 78, 216, 0.12) 35%, transparent 70%),
          radial-gradient(ellipse at 50% 100%, rgba(59, 130, 246, 0.2) 0%, rgba(29, 78, 216, 0.08) 35%, transparent 70%),
          radial-gradient(ellipse at 0% 50%, rgba(37, 99, 235, 0.2) 0%, transparent 60%),
          radial-gradient(ellipse at 100% 50%, rgba(37, 99, 235, 0.2) 0%, transparent 60%) !important;
        animation: privapilot-border-breathe 2.4s ease-in-out infinite !important;
        transition: opacity 0.3s cubic-bezier(0.16, 1, 0.3, 1) !important;
      }

      .privapilot-badge-pill {
        position: fixed !important;
        top: 12px !important;
        right: 18px !important;
        pointer-events: none !important;
        z-index: 2147483647 !important;
        display: inline-flex !important;
        align-items: center !important;
        gap: 7px !important;
        background: rgba(10, 15, 30, 0.88) !important;
        backdrop-filter: blur(16px) saturate(180%) !important;
        -webkit-backdrop-filter: blur(16px) saturate(180%) !important;
        border: 1px solid rgba(96, 165, 250, 0.5) !important;
        color: #e0f2fe !important;
        font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif !important;
        font-size: 11px !important;
        font-weight: 600 !important;
        padding: 5px 12px !important;
        border-radius: 9999px !important;
        box-shadow: 0 4px 20px rgba(0, 0, 0, 0.4), 0 0 15px rgba(59, 130, 246, 0.45) !important;
        letter-spacing: 0.3px !important;
      }

      .privapilot-pulse-dot {
        width: 7px !important;
        height: 7px !important;
        border-radius: 50% !important;
        background: #60a5fa !important;
        box-shadow: 0 0 6px #3b82f6 !important;
        animation: privapilot-dot-pulse 1.6s ease-in-out infinite !important;
      }
    `;
      (document.head || document.documentElement).appendChild(style);
    }
    showAgentWorkingGlow(label = "PrivaPilot Agent Active") {
      if (typeof document === "undefined" || !document.body) return;
      this.ensureGlowStyles();
      if (this.glowWatchdogTimer) {
        clearTimeout(this.glowWatchdogTimer);
      }
      if (!this.workingGlowEl || !document.body.contains(this.workingGlowEl)) {
        const glow = document.createElement("div");
        glow.id = "privapilot-working-border";
        glow.className = "privapilot-overlay privapilot-working-glow";
        glow.setAttribute("data-privapilot-ignore", "true");
        glow.setAttribute("aria-hidden", "true");
        const badge = document.createElement("div");
        badge.className = "privapilot-overlay privapilot-badge-pill";
        badge.setAttribute("data-privapilot-ignore", "true");
        badge.setAttribute("aria-hidden", "true");
        const dot = document.createElement("span");
        dot.className = "privapilot-pulse-dot";
        dot.setAttribute("data-privapilot-ignore", "true");
        const text = document.createElement("span");
        text.className = "privapilot-badge-text";
        text.textContent = label;
        text.setAttribute("data-privapilot-ignore", "true");
        badge.appendChild(dot);
        badge.appendChild(text);
        glow.appendChild(badge);
        glow.style.opacity = "0";
        document.body.appendChild(glow);
        void glow.offsetHeight;
        glow.style.opacity = "1";
        this.workingGlowEl = glow;
      } else {
        this.workingGlowEl.style.opacity = "1";
        const text = this.workingGlowEl.querySelector(".privapilot-badge-text");
        if (text) text.textContent = label;
      }
      this.glowWatchdogTimer = setTimeout(() => {
        this.hideAgentWorkingGlow();
      }, 45e3);
    }
    hideAgentWorkingGlow() {
      if (this.glowWatchdogTimer) {
        clearTimeout(this.glowWatchdogTimer);
        this.glowWatchdogTimer = null;
      }
      if (this.workingGlowEl) {
        const el = this.workingGlowEl;
        el.style.transition = "opacity 0.28s ease-out";
        el.style.opacity = "0";
        setTimeout(() => {
          if (el.parentNode) {
            el.parentNode.removeChild(el);
          }
          if (this.workingGlowEl === el) {
            this.workingGlowEl = null;
          }
        }, 300);
      }
    }
  };

  // src/content/content-main.ts
  var extractor = new ElementExtractor();
  var overlay = new OverlayRenderer();
  var currentCaptureId = null;
  var currentElementMap = /* @__PURE__ */ new Map();
  var capturedDialogs = [];
  if (typeof window !== "undefined") {
    window.addEventListener("privapilot-native-dialog", ((e) => {
      if (e.detail && typeof e.detail.message === "string") {
        capturedDialogs.push({
          type: e.detail.type || "alert",
          message: e.detail.message.slice(0, 200),
          timestamp: Date.now()
        });
        if (capturedDialogs.length > 10) capturedDialogs.shift();
      }
    }));
    try {
      window.alert = (msg) => {
        const text = String(msg || "");
        capturedDialogs.push({ type: "alert", message: text.slice(0, 200), timestamp: Date.now() });
        if (capturedDialogs.length > 10) capturedDialogs.shift();
      };
      window.confirm = (msg) => {
        const text = String(msg || "");
        capturedDialogs.push({ type: "confirm", message: text.slice(0, 200), timestamp: Date.now() });
        if (capturedDialogs.length > 10) capturedDialogs.shift();
        return true;
      };
      window.prompt = (msg, defaultText) => {
        const text = String(msg || "");
        capturedDialogs.push({ type: "prompt", message: text.slice(0, 200), timestamp: Date.now() });
        if (capturedDialogs.length > 10) capturedDialogs.shift();
        return defaultText || "";
      };
    } catch {
    }
  }
  if (typeof chrome !== "undefined" && chrome.runtime && chrome.runtime.onMessage) {
    chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
      if (message?.type !== "EXTRACT_DOM_SNAPSHOT" && message?.type !== "EXECUTE_ACTION" && message?.type !== "CLEAR_OVERLAYS" && message?.type !== "FILL_FORM_FIELDS" && message?.type !== "UPLOAD_FILE" && message?.type !== "SET_ACTIVE_BORDER") {
        return false;
      }
      handleMessage(message).then(sendResponse).catch((err) => {
        sendResponse({ success: false, error: err.message });
      });
      return true;
    });
  }
  async function handleMessage(message) {
    if (message.type === "SET_ACTIVE_BORDER") {
      if (message.active) {
        overlay.showAgentWorkingGlow(message.label || "PrivaPilot Agent Active");
      } else {
        overlay.hideAgentWorkingGlow();
      }
      return { success: true };
    }
    if (message.type === "CLEAR_OVERLAYS") {
      overlay.clear();
      overlay.hideAgentWorkingGlow();
      return { success: true };
    }
    if (message.type === "EXTRACT_DOM_SNAPSHOT") {
      overlay.showAgentWorkingGlow(message.label || "PrivaPilot Perceiving Page");
      const extracted = extractor.extractSnapshot(document);
      const captureId = message.captureId || `cap_${Date.now()}`;
      currentCaptureId = captureId;
      currentElementMap = extracted.elementMap;
      const activeTrapped = capturedDialogs.filter((d) => Date.now() - d.timestamp < 3e4);
      const trappedTitles = activeTrapped.map((d) => `${d.type.toUpperCase()}: ${d.message}`);
      const mergedDialogTitles = [...extracted.snapshot.dialogTitles || [], ...trappedTitles];
      const mergedDialogCount = (extracted.snapshot.visibleDialogCount || 0) + trappedTitles.length;
      const snapshot = {
        ...extracted.snapshot,
        visibleDialogCount: mergedDialogCount,
        dialogTitles: mergedDialogTitles
      };
      return {
        success: true,
        captureId,
        snapshot,
        viewport: {
          viewportWidth: window.innerWidth,
          viewportHeight: window.innerHeight,
          screenshotWidth: window.innerWidth * (window.devicePixelRatio || 1),
          screenshotHeight: window.innerHeight * (window.devicePixelRatio || 1),
          devicePixelRatio: window.devicePixelRatio || 1,
          scrollX: window.scrollX || 0,
          scrollY: window.scrollY || 0,
          captureTimestamp: Date.now()
        }
      };
    }
    if (message.type === "FILL_FORM_FIELDS") {
      const { username, password } = message;
      let userFilled = false;
      let passFilled = false;
      if (username) {
        const userSelectors = [
          'input[type="email"]',
          "input#email",
          "input#username",
          "input#user",
          "input#login",
          'input[name*="email" i]',
          'input[name*="username" i]',
          'input[name*="user" i]',
          'input[name*="login" i]',
          'input[placeholder*="email" i]',
          'input[placeholder*="username" i]',
          'input[placeholder*="user" i]',
          'input[placeholder*="login" i]',
          'input[aria-label*="email" i]',
          'input[aria-label*="username" i]'
        ];
        let userEl = null;
        for (const sel of userSelectors) {
          userEl = document.querySelector(sel);
          if (userEl && !userEl.disabled && !userEl.readOnly) break;
        }
        if (!userEl) {
          const allInputs = Array.from(document.querySelectorAll('input:not([type="password"]):not([type="hidden"]):not([type="submit"]):not([type="button"]):not([type="checkbox"]):not([type="radio"])'));
          userEl = allInputs.find((i) => !i.disabled && !i.readOnly && i.offsetParent !== null) || null;
        }
        if (userEl) {
          ActionExecutor.execute({
            actionId: `act_fill_user_${Date.now()}`,
            kind: "type",
            targetLocalId: "direct_user_fill",
            textToType: username,
            confidence: 1,
            risk: "safe",
            userApproved: true,
            rationale: "Direct fill username/email"
          }, /* @__PURE__ */ new Map([["direct_user_fill", userEl]]));
          userFilled = true;
        }
      }
      if (password) {
        const passSelectors = [
          'input[type="password"]',
          "input#password",
          "input#pass",
          "input#pwd",
          'input[name*="password" i]',
          'input[name*="pass" i]',
          'input[name*="pwd" i]',
          'input[placeholder*="password" i]',
          'input[aria-label*="password" i]'
        ];
        let passEl = null;
        for (const sel of passSelectors) {
          passEl = document.querySelector(sel);
          if (passEl && !passEl.disabled && !passEl.readOnly) break;
        }
        if (passEl) {
          ActionExecutor.execute({
            actionId: `act_fill_pass_${Date.now()}`,
            kind: "type",
            targetLocalId: "direct_pass_fill",
            textToType: password,
            confidence: 1,
            risk: "safe",
            userApproved: true,
            rationale: "Direct fill password"
          }, /* @__PURE__ */ new Map([["direct_pass_fill", passEl]]));
          passFilled = true;
        }
      }
      return {
        success: userFilled || passFilled,
        userFilled,
        passFilled,
        message: userFilled && passFilled ? "Successfully filled username and password" : userFilled ? "Filled username" : passFilled ? "Filled password" : "No matching input fields found"
      };
    }
    if (message.type === "EXECUTE_ACTION") {
      const proposal = message.proposal;
      overlay.showAgentWorkingGlow(proposal?.kind ? `PrivaPilot: ${proposal.kind.toUpperCase()}` : "PrivaPilot Active");
      let targetEl = proposal.targetLocalId ? currentElementMap.get(proposal.targetLocalId) : null;
      if (proposal.targetLocalId && (!targetEl || !targetEl.isConnected)) {
        const refreshed = extractor.extractSnapshot(document);
        currentElementMap = refreshed.elementMap;
        currentCaptureId = message.captureId || currentCaptureId;
        targetEl = currentElementMap.get(proposal.targetLocalId) || null;
        if (!targetEl) {
          const targetTextMatch = (proposal.rationale || "").match(/["']([^"']+)["']/);
          const targetSearch = targetTextMatch ? targetTextMatch[1].toLowerCase().trim() : "";
          if (targetSearch) {
            for (const el of currentElementMap.values()) {
              const elText = (el.innerText || el.getAttribute("aria-label") || el.getAttribute("placeholder") || "").toLowerCase();
              if (el.isConnected && (elText === targetSearch || elText.includes(targetSearch))) {
                targetEl = el;
                break;
              }
            }
          }
        }
      }
      if (!targetEl && proposal.targetLocalId) {
        return {
          success: false,
          actionId: proposal.actionId,
          semanticOutcomeVerified: false,
          staleTarget: true,
          message: `Target element '${proposal.targetLocalId}' not found in live DOM after self-healing retry`
        };
      }
      if (targetEl) {
        if (typeof targetEl.scrollIntoView === "function") {
          try {
            targetEl.scrollIntoView({ behavior: "smooth", block: "nearest" });
          } catch (_) {
          }
        }
        overlay.highlightTargetElement(targetEl, proposal.kind.toUpperCase(), 1200);
        await new Promise((r) => setTimeout(r, 120));
      }
      const preSnapshot = SemanticStateVerifier.captureSnapshot(targetEl, document);
      const execResult = ActionExecutor.execute(proposal, currentElementMap);
      if (targetEl && execResult.success) {
        overlay.flashActionDispatched();
      } else {
        overlay.clear();
      }
      if (!execResult.success) {
        return {
          success: false,
          actionId: proposal.actionId,
          semanticOutcomeVerified: false,
          staleTarget: execResult.staleTarget ?? (!targetEl && Boolean(proposal.targetLocalId)),
          message: execResult.message || "Action execution failed",
          reasonCode: execResult.reasonCode || "EXECUTION_FAILED"
        };
      }
      const verification = await SemanticStateVerifier.verifyOutcome(proposal, targetEl, preSnapshot, { timeoutMs: 2500 });
      const isSuccess = execResult.success && verification.verified;
      return {
        success: isSuccess,
        actionId: proposal.actionId,
        semanticOutcomeVerified: verification.verified,
        reasonCode: verification.reasonCode,
        message: isSuccess ? execResult.message : verification.message,
        verification: {
          verified: verification.verified,
          reasonCode: verification.reasonCode,
          durationMs: verification.details?.durationMs,
          matchedCondition: verification.details?.matchedCondition
        }
      };
    }
    if (message.type === "CLEAR_OVERLAYS") {
      overlay.clear();
      return { success: true };
    }
    if (message.type === "UPLOAD_FILE") {
      const { targetLocalId, fileName } = message;
      let targetEl = targetLocalId ? currentElementMap.get(targetLocalId) : null;
      if (!targetEl) {
        targetEl = document.querySelector('input[type="file"]');
      }
      if (!targetEl) {
        return { success: false, message: "No file input element found in live DOM" };
      }
      const result = ActionExecutor.execute({
        actionId: `act_upload_${Date.now()}`,
        kind: "type",
        targetLocalId: targetLocalId || "direct_file_upload",
        textToType: fileName || "submission.pdf",
        confidence: 1,
        risk: "safe",
        userApproved: true,
        rationale: "Direct file upload"
      }, /* @__PURE__ */ new Map([[targetLocalId || "direct_file_upload", targetEl]]));
      return result;
    }
    return { success: false, error: `Unknown message type: ${message.type}` };
  }
})();
