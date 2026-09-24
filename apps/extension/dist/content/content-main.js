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
    "clinical",
    // Phone & Mobile
    "phone",
    "mobile",
    "contact",
    "tel",
    "cell",
    "phonenumber",
    "phone_number",
    "usernumber",
    "user_number",
    "mobile_number",
    "contact_number",
    "cellphone",
    // Address & Location
    "address",
    "street",
    "city",
    "state",
    "zip",
    "zipcode",
    "pincode",
    "pin_code",
    "postal",
    "postal_code",
    "currentaddress",
    "permanentaddress",
    "current_address",
    "permanent_address",
    // Date of Birth
    "dob",
    "birth",
    "birthday",
    "bday",
    "dateofbirth",
    "date_of_birth",
    // Name & Identity
    "firstname",
    "lastname",
    "fullname",
    "name",
    "fname",
    "lname",
    "first_name",
    "last_name",
    "user_name",
    "applicant_name",
    // Account Handles
    "username",
    "user_id",
    "userid",
    "user_handle",
    "user_profile"
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
    "bday-year",
    "tel",
    "tel-national",
    "tel-country-code",
    "postal-code",
    "street-address",
    "address-line1",
    "address-line2",
    "address-level1",
    "address-level2",
    "name",
    "given-name",
    "family-name",
    "username",
    "email"
  ];

  // ../../packages/pii-rules/dist/regex-patterns.js
  var CANARY_REGEX = /\b(?:SECRET_CANARY[A-Za-z0-9_]*|CANARY_PRIVAPILOT[A-Za-z0-9_]*)\b/g;
  var MEDICAL_REGEX = /\b(?:medical note|clinical diagnosis|prescription info|patient record|doctor note)\b[^\n.,;]*/gi;
  var HANDLE_REGEX = /(?:^|(?<=\s|[([{"']))(@[A-Za-z0-9_]{1,30})\b/g;
  var DELIVERY_ADDRESS_REGEX = /(?:^|(?<=\s|[([{"']))(?:Deliver(?:y|ing)?\s+to|Ship\s+to|Shipping\s+to|Delivered\s+to)\s+([^\n\r<]{3,80})/gi;
  var HOME_WORK_LOCATION_REGEX = /\b(?:HOME|WORK|OFFICE|OTHER)\s+(?:at\s+|-\s+)([^\n\r<]{3,80})/gi;
  var PINCODE_IN_CONTEXT_REGEX = /(?:[A-Za-z]+[\-,]\s*|[,\-]\s*|\b(?:pin(?:\s*code)?|postal(?:\s*code)?|zip(?:\s*code)?)[\s:\-,]*)([1-9][0-9]{2}\s?[0-9]{3})\b/gi;
  var LOCALITY_ADDRESS_REGEX = /\b(?:Flat|House|H\.No|Plot|Shop|Room|Bldg|Building|Apartment|Apt|Sector|Block|Pocket|Street|St\.|Road|Rd\.|Cross|Main|Nagar|Colony|Enclave|Vihar|Kunj|Society|Layout|Mohalla|Gali|Katra|Chowk|Bazar|Bazaar|Bhavan|Bhawan)\b[^\n\r,;]{2,60}/gi;
  var ACCOUNT_GREETING_REGEX = /\b(?:Hello|Hi|Welcome),\s+([A-Za-z0-9_]{2,30})\b/gi;
  var STREET_ADDRESS_REGEX = /\b\d{1,5}\s+[A-Za-z0-9\s.,#-]+(?:Street|St|Avenue|Ave|Road|Rd|Boulevard|Blvd|Lane|Ln|Drive|Dr|Way|Court|Ct|Circle|Cir)\b[^\n\r,;]*/gi;
  var DATE_OF_BIRTH_REGEX = /\b(?:\d{1,2}[\s/-](?:Jan(?:uary)?|Feb(?:ruary)?|Mar(?:ch)?|Apr(?:il)?|May|Jun(?:e)?|Jul(?:y)?|Aug(?:ust)?|Sep(?:tember)?|Oct(?:ober)?|Nov(?:ember)?|Dec(?:ember)?)[\s/-]\d{2,4}|\d{1,2}[/-]\d{1,2}[/-]\d{2,4}|\d{4}[/-]\d{1,2}[/-]\d{1,2})\b/gi;
  var EMAIL_REGEX = /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}\b/g;
  var OBFUSCATED_EMAIL_REGEX = /(?:^|(?<=\s|[([{:;,]))[A-Za-z0-9._%+-]+(?:\s*\[at\]\s*|\s*\(at\)\s*|\s*@\s*)[A-Za-z0-9.-]+(?:\s*\[dot\]\s*|\s*\(dot\)\s*|\s*\.\s*)[A-Za-z]{2,}(?:\s*\[dot\]\s*[A-Za-z]{2,}|\s*\.\s*[A-Za-z]{2,})*/gi;
  var EMAIL_LABEL_REGEX = /(?:^|(?<=\s|[([{:;,]))(?:Email|E-mail|Mail)[\s.:]*([^\s\n\r<]+@[^\s\n\r<]+|[A-Za-z0-9._%+-]+(?:\s*\[at\]\s*|\s*\(at\)\s*)[^\s\n\r<]+)/gi;
  var STANDARD_PHONE_REGEX = /(?:^|(?<!\d))(?:\+?1[\s.-]?)?\(?([0-9]{3})\)?[\s.-]?([0-9]{3})[\s.-]?([0-9]{4})(?!\d)\b/g;
  var PHONE_LABEL_REGEX = /(?:^|(?<=\s|[([{:;,]))(?:Phone|Tel(?:ephone)?|Mobile|Mob|Contact|Call|Fax)[\s.:]*([+\d\s()./-]{7,35})(?!\d)/gi;
  var INDIAN_PHONE_REGEX = /(?:^|(?<!\d))(?:\+91[\s-]?)?[6-9]\d{4}[\s-]?\d{5}(?!\d)\b/g;
  var INDIAN_LANDLINE_REGEX = /(?:^|(?<=\s|[([{:;,]))(?:\+91[\s-]?)?0?\d{2,4}[\s-]?\d{6,8}(?:\s*[/,]\s*\d{2,4})*(?!\d)\b/g;
  var INTL_PHONE_REGEX = /(?:^|(?<=\s|[([{:;,]))\+(?:[1-9]\d{0,2})[\s.-]?\(?\d{1,5}\)?[\s.-]?\d{1,5}[\s.-]?\d{3,5}(?:\s*[/,]\s*\d{2,5})*(?!\d)/g;
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
    for (const match of text.matchAll(DELIVERY_ADDRESS_REGEX)) {
      if (match.index !== void 0) {
        matches.push({
          category: "address",
          startIndex: match.index,
          endIndex: match.index + match[0].length,
          matchedLength: match[0].length,
          confidence: 0.95
        });
      }
    }
    for (const match of text.matchAll(HOME_WORK_LOCATION_REGEX)) {
      if (match.index !== void 0) {
        matches.push({
          category: "address",
          startIndex: match.index,
          endIndex: match.index + match[0].length,
          matchedLength: match[0].length,
          confidence: 0.95
        });
      }
    }
    for (const match of text.matchAll(LOCALITY_ADDRESS_REGEX)) {
      if (match.index !== void 0) {
        matches.push({
          category: "address",
          startIndex: match.index,
          endIndex: match.index + match[0].length,
          matchedLength: match[0].length,
          confidence: 0.92
        });
      }
    }
    for (const match of text.matchAll(PINCODE_IN_CONTEXT_REGEX)) {
      if (match.index !== void 0 && match[1]) {
        const pinOffset = match[0].indexOf(match[1]);
        const pinStart = match.index + pinOffset;
        matches.push({
          category: "address",
          startIndex: pinStart,
          endIndex: pinStart + match[1].length,
          matchedLength: match[1].length,
          confidence: 0.96
        });
      }
    }
    for (const match of text.matchAll(ACCOUNT_GREETING_REGEX)) {
      if (match.index !== void 0 && match[1]) {
        const nameOffset = match[0].indexOf(match[1]);
        const nameStart = match.index + nameOffset;
        matches.push({
          category: "username",
          startIndex: nameStart,
          endIndex: nameStart + match[1].length,
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
    for (const match of text.matchAll(OBFUSCATED_EMAIL_REGEX)) {
      if (match.index !== void 0) {
        const start = match.index;
        const end = match.index + match[0].length;
        const alreadyCovered = matches.some((m) => m.startIndex <= start && m.endIndex >= end);
        if (!alreadyCovered) {
          matches.push({
            category: "email",
            startIndex: start,
            endIndex: end,
            matchedLength: match[0].length,
            confidence: 0.97
          });
        }
      }
    }
    for (const match of text.matchAll(EMAIL_LABEL_REGEX)) {
      if (match.index !== void 0 && match[1]) {
        const emailOffset = match[0].indexOf(match[1]);
        const emailStart = match.index + emailOffset;
        const emailEnd = emailStart + match[1].length;
        const alreadyCovered = matches.some((m) => m.startIndex <= emailStart && m.endIndex >= emailEnd);
        if (!alreadyCovered) {
          matches.push({
            category: "email",
            startIndex: emailStart,
            endIndex: emailEnd,
            matchedLength: match[1].length,
            confidence: 0.98
          });
        }
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
    for (const match of text.matchAll(PHONE_LABEL_REGEX)) {
      if (match.index !== void 0 && match[1]) {
        const phoneOffset = match[0].indexOf(match[1]);
        const phoneStart = match.index + phoneOffset;
        const phoneEnd = phoneStart + match[1].length;
        const alreadyCovered = matches.some((m) => m.startIndex <= phoneStart && m.endIndex >= phoneEnd);
        if (!alreadyCovered) {
          matches.push({
            category: "phone",
            startIndex: phoneStart,
            endIndex: phoneEnd,
            matchedLength: match[1].length,
            confidence: 0.98
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
    for (const match of text.matchAll(INDIAN_LANDLINE_REGEX)) {
      if (match.index !== void 0) {
        const start = match.index;
        const end = match.index + match[0].length;
        const alreadyCovered = matches.some((m) => m.startIndex <= start && m.endIndex >= end);
        if (!alreadyCovered && match[0].replace(/\D/g, "").length >= 8) {
          matches.push({
            category: "phone",
            startIndex: start,
            endIndex: end,
            matchedLength: match[0].length,
            confidence: 0.94
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
    for (const match of text.matchAll(STANDARD_PHONE_REGEX)) {
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
            confidence: 0.92
          });
        }
      }
    }
    for (const match of text.matchAll(STREET_ADDRESS_REGEX)) {
      if (match.index !== void 0) {
        const start = match.index;
        const end = match.index + match[0].length;
        const alreadyCovered = matches.some((m) => m.startIndex <= start && m.endIndex >= end);
        if (!alreadyCovered) {
          matches.push({
            category: "address",
            startIndex: start,
            endIndex: end,
            matchedLength: match[0].length,
            confidence: 0.94
          });
        }
      }
    }
    for (const match of text.matchAll(DATE_OF_BIRTH_REGEX)) {
      if (match.index !== void 0) {
        const start = match.index;
        const end = match.index + match[0].length;
        const alreadyCovered = matches.some((m) => m.startIndex <= start && m.endIndex >= end);
        if (!alreadyCovered) {
          matches.push({
            category: "date_of_birth",
            startIndex: start,
            endIndex: end,
            matchedLength: match[0].length,
            confidence: 0.95
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
        else if (autoVal.startsWith("tel"))
          cat = "phone";
        else if (autoVal.includes("address") || autoVal.includes("postal-code"))
          cat = "address";
        else if (autoVal.includes("name") || autoVal === "username")
          cat = "username";
        else if (autoVal === "email")
          cat = "email";
        return {
          isSensitive: true,
          category: cat,
          reason: `autocomplete="${autoVal}"`,
          confidence: 1
        };
      }
    }
    if (type === "email" || autocomplete === "email") {
      return {
        isSensitive: true,
        category: "email",
        reason: "type/autocomplete email",
        confidence: 0.95
      };
    }
    if (type === "tel" || autocomplete === "tel") {
      return {
        isSensitive: true,
        category: "phone",
        reason: "type/autocomplete tel",
        confidence: 0.95
      };
    }
    const combinedTokens = `${name} ${id} ${placeholder} ${ariaLabel} ${labelText}`.replace(/([a-z\d])([A-Z])/g, "$1 $2").toLowerCase();
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
        else if (keyword.includes("email") || keyword.includes("mail"))
          cat = "email";
        else if (keyword.includes("phone") || keyword.includes("mobile") || keyword.includes("contact") || keyword.includes("tel") || keyword.includes("cell") || keyword.includes("usernumber"))
          cat = "phone";
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
        else if (keyword.includes("address") || keyword.includes("street") || keyword.includes("city") || keyword.includes("state") || keyword.includes("zip") || keyword.includes("postal") || keyword.includes("pincode"))
          cat = "address";
        else if (keyword.includes("dob") || keyword.includes("birth") || keyword.includes("bday"))
          cat = "date_of_birth";
        else if (keyword.includes("name") || keyword.includes("fname") || keyword.includes("lname") || keyword.includes("user") || keyword.includes("applicant"))
          cat = "username";
        return {
          isSensitive: true,
          category: cat,
          reason: `token match: "${keyword}"`,
          confidence: 0.95
        };
      }
    }
    if (desc.value && typeof desc.value === "string") {
      const trimmedVal = desc.value.trim();
      if (trimmedVal.length > 0) {
        const piiMatches = scanTextForPII(trimmedVal);
        if (piiMatches.length > 0) {
          return {
            isSensitive: true,
            category: piiMatches[0].category,
            reason: `live value matches PII (${piiMatches[0].category})`,
            confidence: 0.95
          };
        }
        const isSearchBox = combinedTokens.includes("search") || combinedTokens.includes("filter") || combinedTokens.includes("find") || type === "search";
        if (!isSearchBox && (desc.tagName === "textarea" || desc.tagName === "input" && type !== "submit" && type !== "button" && type !== "checkbox" && type !== "radio")) {
          return {
            isSensitive: true,
            category: "username",
            reason: `live input value in form field: "${desc.name || desc.id || desc.placeholder || "input"}"`,
            confidence: 0.85
          };
        }
      }
    }
    return {
      isSensitive: false,
      confidence: 1
    };
  }

  // ../../packages/pii-rules/dist/surface-classifier.js
  var PRIVATE_WORKSPACE_PATTERNS = [
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
  var HYBRID_PLATFORM_PATTERNS = [
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
  var PUBLIC_BROADCAST_PATTERNS = [
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
  function classifyPageZone(url = "") {
    const cleanUrl = (url || "").toLowerCase();
    if (/(?:\/inbox|\/mail(?:\/|$|\?)|\/compose|\/messages(?:\/|$|\?)|\/chat(?:\/|$|\?)|\/banking|\/netbanking|\/payroll|\/hrms|\/myaccount|\/statements|\/checkout)\b/i.test(cleanUrl)) {
      return "private_workspace";
    }
    for (const pattern of PRIVATE_WORKSPACE_PATTERNS) {
      if (pattern.test(cleanUrl)) {
        return "private_workspace";
      }
    }
    for (const pattern of HYBRID_PLATFORM_PATTERNS) {
      if (pattern.test(cleanUrl)) {
        return "hybrid";
      }
    }
    for (const pattern of PUBLIC_BROADCAST_PATTERNS) {
      if (pattern.test(cleanUrl)) {
        return "public_broadcast";
      }
    }
    return "public_broadcast";
  }
  function isFunctionalMapCanvas(el, url = "") {
    if (!el)
      return false;
    const cleanUrl = (url || "").toLowerCase();
    if (cleanUrl.includes("bhuvan") || cleanUrl.includes("nrsc.gov.in") || cleanUrl.includes("isro.gov.in") || cleanUrl.includes("mosdac.gov.in") || cleanUrl.includes("vedas.sac.gov.in") || cleanUrl.includes("bhoonidhi")) {
      return true;
    }
    try {
      const className = String(el.className || "").toLowerCase();
      const id = String(el.id || "").toLowerCase();
      if (className.includes("ol-layer") || className.includes("ol-unselectable") || className.includes("leaflet") || className.includes("mapboxgl") || className.includes("maplibregl") || className.includes("cesium") || className.includes("esri-view") || className.includes("gm-style") || id.includes("map") || id.includes("bhuvan")) {
        return true;
      }
      if (typeof el.closest === "function") {
        const parentMap = el.closest('.ol-viewport, .leaflet-container, .mapboxgl-map, .maplibregl-map, .cesium-viewer, .esri-view, .gm-style, #map, #map_canvas, [class*="map-container" i], [id*="bhuvan" i]');
        if (parentMap)
          return true;
      }
    } catch (_) {
    }
    return false;
  }
  function isPublicMediaStream(el, url = "") {
    if (!el)
      return false;
    const cleanUrl = (url || "").toLowerCase();
    try {
      const hasLiveCameraStream = Boolean(el.srcObject && el.srcObject.getVideoTracks?.()?.length > 0);
      if (hasLiveCameraStream)
        return false;
      const hasControls = Boolean(el.hasAttribute?.("controls") || el.controls === true);
      const hasDuration = typeof el.duration === "number" && Number.isFinite(el.duration) && el.duration > 0;
      const hasTrackOrSource = Boolean(el.querySelector?.("source, track") || el.hasAttribute?.("poster"));
      const src = (el.src || el.currentSrc || el.getAttribute?.("src") || "").toLowerCase();
      const hasMediaSrc = src.startsWith("http://") || src.startsWith("https://") || src.startsWith("blob:");
      const isPlayerClass = (el.className || "").includes("video-stream") || (el.className || "").includes("html5-main-video") || (el.className || "").includes("vjs-tech") || (el.className || "").includes("jw-video");
      if ((hasControls || hasDuration || hasTrackOrSource || isPlayerClass) && hasMediaSrc) {
        return true;
      }
      const isStreamingDomain = cleanUrl.includes("youtube.com") || cleanUrl.includes("youtu.be") || cleanUrl.includes("vimeo.com") || cleanUrl.includes("twitch.tv") || cleanUrl.includes("dailymotion.com");
      if (isStreamingDomain && (hasMediaSrc || isPlayerClass)) {
        return true;
      }
    } catch (_) {
    }
    return false;
  }
  function isPrivateAccountShell(el) {
    if (!el)
      return false;
    try {
      const aria = (el.getAttribute?.("aria-label") || "").toLowerCase();
      const testId = (el.getAttribute?.("data-testid") || "").toLowerCase();
      const id = (el.id || "").toLowerCase();
      if (aria.includes("google account") || aria.includes("account menu") || aria.includes("switch account") || aria.includes("sign out") || testId.includes("useravatar") || testId.includes("user-menu") || testId.includes("profile-button") || id === "avatar-btn") {
        return true;
      }
      if (typeof el.closest === "function") {
        const container = el.closest('#avatar-btn, [data-testid*="user-menu" i], [aria-label*="Google Account" i], [aria-label*="Account menu" i]');
        if (container)
          return true;
      }
    } catch (_) {
    }
    return false;
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
          'button, a, input, select, textarea, [role="button"], [role="link"], [role="tab"], [role="combobox"], [role="searchbox"], [role="option"], [role="menuitem"], [contenteditable="true"], [role="listbox"], [aria-haspopup="listbox"], [tabindex="0"], [draggable="true"], [role="slider"], [aria-grabbed], .MuiListItemButton-root, [class*="suggestion" i], [class*="autocomplete-item" i], [class*="dropdown-item" i]'
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
          if (tag === "input") {
            const type = (typeof el.getAttribute === "function" ? el.getAttribute("type") || "text" : "text").toLowerCase();
            if (type === "checkbox") role = "checkbox";
            else if (type === "radio") role = "radio";
            else if (type === "button" || type === "submit" || type === "reset") role = "button";
            else role = "input";
          } else if (tag === "textarea" || roleAttr === "searchbox" || el.isContentEditable || el.getAttribute?.("contenteditable") === "true") {
            role = "textarea";
          } else if (tag === "select" || roleAttr === "listbox" || !el.matches?.("input") && (roleAttr === "combobox" || ariaHasPopup === "listbox")) {
            role = "select";
          } else if (tag === "button" || roleAttr === "button") {
            role = "button";
          } else if (tag === "a" || roleAttr === "link") {
            role = "link";
          } else if (roleAttr === "tab") {
            role = "tab";
          } else if (roleAttr === "menuitem" || roleAttr === "option" || el.classList && typeof el.classList.contains === "function" && el.classList.contains("MuiListItemButton-root")) {
            role = "menuitem";
          }
          const caps = ["click", "hover"];
          if (role === "input" || role === "textarea" || tag === "input" || tag === "textarea" || el.isContentEditable) {
            const inputType = (typeof el.getAttribute === "function" ? el.getAttribute("type") || "" : "").toLowerCase();
            if (inputType !== "checkbox" && inputType !== "radio" && inputType !== "button" && inputType !== "submit" && inputType !== "image") {
              caps.push("type");
            }
            if (inputType === "file") caps.push("upload");
          }
          if (role === "select" || tag === "select" || roleAttr === "combobox") caps.push("select");
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
            const textContent = el.innerText?.trim() || (el.textContent && el.textContent.trim().length < 80 ? el.textContent.trim() : "") || "";
            const aria = (typeof el.getAttribute === "function" ? el.getAttribute("aria-label")?.trim() || el.getAttribute("title")?.trim() : "") || (el.querySelector?.("[aria-label]")?.getAttribute("aria-label")?.trim() || "");
            let childName = "";
            if (!textContent && !aria) {
              const svgChild = el.querySelector("svg");
              if (svgChild) {
                childName = svgChild.getAttribute("aria-label") || svgChild.querySelector("title")?.textContent?.trim() || "";
              }
              if (!childName) {
                const imgChild = el.querySelector("img");
                if (imgChild) {
                  childName = imgChild.getAttribute("alt") || imgChild.getAttribute("title") || "";
                }
              }
              if (!childName && typeof el.getAttribute === "function" && el.getAttribute("type") === "submit") {
                childName = "Submit";
              }
              if (!childName) {
                const searchForm = typeof el.closest === "function" ? el.closest('form, [role="search"]') : null;
                if (searchForm) {
                  childName = "Search";
                }
              }
              if (!childName) {
                const testId = (typeof el.getAttribute === "function" ? el.getAttribute("data-testid") : null) || el.querySelector?.("[data-testid]")?.getAttribute("data-testid") || "";
                if (testId) {
                  const cleaned = testId.replace(/^(?:AppTabBar_|SideNav_|nav_|btn_|tab_)/i, "").replace(/(?:_Link|_Button|_Item|_Tab)$/i, "").replace(/([A-Z])/g, " $1").trim();
                  if (cleaned.length > 1) {
                    childName = cleaned;
                  }
                }
              }
              if (!childName && (tag === "a" || typeof el.getAttribute === "function")) {
                const rawHref = el.href || el.getAttribute("href") || "";
                if (rawHref) {
                  const hrefLower = rawHref.toLowerCase();
                  if (hrefLower.includes("/i/bookmarks") || hrefLower.endsWith("/bookmarks")) childName = "Bookmarks";
                  else if (hrefLower.includes("/notifications")) childName = "Notifications";
                  else if (hrefLower.includes("/messages")) childName = "Messages";
                  else if (hrefLower.includes("/explore")) childName = "Explore";
                  else if (hrefLower.includes("/home")) childName = "Home";
                  else if (hrefLower.includes("/lists") && !hrefLower.includes("search")) childName = "Lists";
                  else if (hrefLower.includes("/settings")) childName = "Settings";
                  else {
                    const docMatch = hrefLower.match(/\/([^\/?#]+\.(?:pdf|zip|csv|kmz|kml|doc|docx|xlsx|tif|geotiff))(?:[?#]|$)/i);
                    if (docMatch) {
                      const rawFile = decodeURIComponent(docMatch[1]).replace(/[_-]+/g, " ");
                      childName = `Download ${rawFile}`;
                    }
                  }
                }
              }
            }
            rawName = textContent || aria || childName || role;
            if (tag === "a" && el.hasAttribute?.("download") && !rawName.toLowerCase().includes("download")) {
              rawName = `Download ${rawName}`;
            }
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
          let verticalOffset = "in_view";
          if (rect.bottom < 0) {
            verticalOffset = "above";
          } else if (rect.top > viewportHeight) {
            verticalOffset = "below";
          }
          const inViewport = verticalOffset === "in_view" && rect.right > 0 && rect.left < viewportWidth;
          interactiveElements.push({
            localId,
            role,
            rawName,
            boundingBox: { x: rect.x + offset.x, y: rect.y + offset.y, width: rect.width, height: rect.height },
            state: ["visible", el.disabled ? "disabled" : "enabled"],
            actionCapabilities: caps,
            containerContext,
            nearestHeading,
            isInsideDialog,
            verticalOffset,
            inViewport
          });
          const isEditable = tag === "input" || tag === "textarea" || tag === "select" || el.isContentEditable || el.getAttribute("contenteditable") === "true";
          if (isEditable) {
            const liveVal = el.value !== void 0 ? el.value : el.textContent || void 0;
            const liveValueStr = typeof liveVal === "string" ? liveVal : void 0;
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
                associatedLabelText: associatedLabelText || void 0,
                value: liveValueStr
              },
              boundingClientRect: { x: rect.x + offset.x, y: rect.y + offset.y, width: rect.width, height: rect.height }
            });
            if (liveValueStr && liveValueStr.trim().length > 0 && rect.width > 0 && rect.height > 0) {
              const inputValTrimmed = liveValueStr.trim();
              const valMatches = scanTextForPII(inputValTrimmed);
              const boxX = rect.x + offset.x;
              const boxY = rect.y + offset.y;
              textNodes.push({
                id: `input_val_${localId}`,
                text: inputValTrimmed,
                boundingClientRect: { x: boxX, y: boxY, width: rect.width, height: rect.height },
                matchedRanges: [{
                  category: valMatches.length > 0 ? valMatches[0].category : "username",
                  startIndex: 0,
                  endIndex: inputValTrimmed.length,
                  rects: [{ x: boxX, y: boxY, width: rect.width, height: rect.height }]
                }]
              });
            }
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
                    '[data-testid="User-Name"], [data-testid="user-menu-button"], [data-testid="profile-button"], [data-testid*="user-profile" i], [class*="user-name" i], [class*="username" i], [class*="account-name" i], a[href*="/account" i], a[href*="/profile" i], [aria-label*="account" i], [aria-label*="profile" i], [title*="profile" i], [title*="account" i], [class*="account" i], [class*="profile" i], [class*="user" i], [data-testid*="account" i], [data-testid*="profile" i]'
                  )
                );
                const isDeliveryAddressContainer = Boolean(
                  typeof parent.closest === "function" && (parent.closest(
                    '[class*="deliver" i], [id*="deliver" i], [class*="address" i], [id*="address" i], [class*="location" i], [id*="location" i], [class*="pincode" i], [id*="pincode" i], address'
                  ) || parent.parentElement?.textContent?.includes("Address"))
                );
                let matches = scanTextForPII(content);
                if (matches.length === 0 && isDeliveryAddressContainer && trimmed.length > 2 && trimmed.length < 120 && !/^(?:address|location|pin\s*code|postal\s*code)$/i.test(trimmed) && (/\b(?:home|work|office|deliver|katra|nagar|colony|road|street|bhavan|bhawan|marg|lane|avenue|floor|block|sector|plot|post|pin|[1-9][0-9]{2}\s?[0-9]{3})\b/i.test(trimmed) || /[1-9][0-9]{2}\s?[0-9]{3}/.test(trimmed))) {
                  matches = [{
                    category: "address",
                    startIndex: 0,
                    endIndex: content.length,
                    matchedLength: content.length,
                    confidence: 0.95
                  }];
                } else if (matches.length === 0 && isAccountIdentity && trimmed.length > 1 && trimmed.length < 80 && !/^(?:login|sign in|sign up|register|cart|orders|notifications|help|wishlist|explore|become a seller)$/i.test(trimmed)) {
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
          const isAvatar = classText.includes("avatar") || classText.includes("profile") || classText.includes("user-pic") || classText.includes("user-img") || classText.includes("user-photo") || classText.includes("user-image") || classText.includes("author-img") || classText.includes("gravatar") || testId.includes("avatar") || testId.includes("useravatar") || testId.includes("profile-pic") || alt.includes("avatar") || alt.includes("profile") || alt.includes("user photo") || alt.includes("author") || ariaLabel.includes("avatar") || ariaLabel.includes("profile") || ariaLabel.includes("account") || src.includes("profile_images") || src.includes("avatar") || src.includes("gravatar.com") || src.includes("avatars.githubusercontent") || src.includes("googleusercontent.com") || Boolean(typeof el.closest === "function" && el.closest('[data-testid*="UserAvatar" i], [data-testid*="avatar" i], [data-testid*="user-avatar" i], [data-testid*="user-menu" i], [data-testid*="user-profile" i], a[href*="/account" i], a[href*="/profile" i], [aria-label*="account" i], [aria-label*="profile" i], [class*="account" i], [class*="profile" i], [class*="user-info" i], [class*="user-header" i], [class*="user-badge" i]'));
          const isVisualMedia = tagName === "IMG" || tagName === "SVG" || role === "img" || isAvatar;
          if (!isVisualMedia) return;
          const isPublicCommentAvatar = Boolean(
            typeof el.closest === "function" && el.closest('ytd-comment-thread-renderer, #comments, .comment, [role="article"]')
          );
          const isUserShell = isPrivateAccountShell(el);
          const shouldProtectAvatar = isUserShell || !isPublicCommentAvatar && isAvatar;
          imageElements.push({
            id: `img_${depth}_${idx + 1}`,
            isProfilePhotoOrAvatar: shouldProtectAvatar,
            boundingClientRect: { x: rect.x + offset.x, y: rect.y + offset.y, width: rect.width, height: rect.height }
          });
        });
        const currentDocUrl = currentDoc.defaultView?.location?.href || doc.location?.href || "";
        const canvases = currentDoc.querySelectorAll("canvas");
        canvases.forEach((c) => {
          const rect = c.getBoundingClientRect();
          if (rect.width > 0 && rect.height > 0) {
            surfaceCounter++;
            const isMap = isFunctionalMapCanvas(c, currentDocUrl);
            if (isMap) {
              surfaces.push({
                id: `cvs_${surfaceCounter}`,
                surfaceType: "canvas",
                isCrossOriginOrUninspectable: false,
                inspectionStatus: "inspected_same_origin",
                reason: "functional_geospatial_map",
                boundingClientRect: { x: rect.x + offset.x, y: rect.y + offset.y, width: rect.width, height: rect.height }
              });
              return;
            }
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
            const isPublic = isPublicMediaStream(v, currentDocUrl);
            if (isPublic) {
              surfaces.push({
                id: `vid_${surfaceCounter}`,
                surfaceType: "video",
                isCrossOriginOrUninspectable: false,
                inspectionStatus: "inspected_same_origin",
                reason: "public_media_stream",
                boundingClientRect: { x: rect.x + offset.x, y: rect.y + offset.y, width: rect.width, height: rect.height }
              });
              return;
            }
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
              const fSrc = typeof f.getAttribute === "function" ? f.getAttribute("src") : f.src || "";
              const fName = typeof f.getAttribute === "function" ? f.getAttribute("name") : f.name || "";
              const fTitle = typeof f.getAttribute === "function" ? f.getAttribute("title") : f.title || "";
              const fClass = typeof f.getAttribute === "function" ? f.getAttribute("class") : f.className || "";
              const adMarkers = `${f.id || ""} ${fName || ""} ${fTitle || ""} ${fClass || ""} ${fSrc || ""}`.toLowerCase();
              const isAdFrame = /\b(?:google_ad|googlesyndication|doubleclick|adnxs|adservice|ad-slot|adsystem|ads-|aswift|taboola|outbrain|criteo|pubmatic|rubicon|adform|advertisement|banner-ad)\b|google_ads_iframe|godaddy/i.test(adMarkers);
              if (isAdFrame) {
                return;
              }
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
          for (let r = 0; r < Math.min(rows.length, 8); r++) {
            const cells = rows[r].querySelectorAll('th, td, [role="cell"], [role="columnheader"]');
            if (cells.length === 2) {
              const k = (cells[0].textContent || "").trim().replace(/\s+/g, " ");
              const v = (cells[1].textContent || "").trim().replace(/\s+/g, " ");
              if (k && v && k.length > 1 && k.length < 50 && v.length < 150) {
                contentSummaries.push(`Spec: ${k}: ${v}`);
              }
            }
          }
        });
        const dls = doc.querySelectorAll("dl");
        dls.forEach((dl) => {
          const dts = dl.querySelectorAll("dt");
          const dds = dl.querySelectorAll("dd");
          for (let i = 0; i < Math.min(dts.length, dds.length, 6); i++) {
            const term = (dts[i].textContent || "").trim().replace(/\s+/g, " ");
            const desc = (dds[i].textContent || "").trim().replace(/\s+/g, " ");
            if (term && desc && term.length < 50) {
              contentSummaries.push(`Spec: ${term}: ${desc.slice(0, 120)}`);
            }
          }
        });
        const docLinks = doc.querySelectorAll('a[href$=".pdf" i], a[href$=".zip" i], a[href$=".csv" i], a[href$=".kmz" i]');
        docLinks.forEach((a) => {
          const aText = (a.textContent || a.getAttribute("aria-label") || "").trim().replace(/\s+/g, " ");
          const aHref = a.getAttribute("href") || "";
          const fileName = aHref.split("/").pop()?.split("?")[0] || "";
          if (fileName && contentSummaries.length < 25) {
            contentSummaries.push(`Document: "${aText || fileName}" (${fileName})`);
          }
        });
        const commentThreads = doc.querySelectorAll('ytd-comment-thread-renderer, [role="article"].comment, .comment-body, .comment');
        commentThreads.forEach((ct) => {
          if (contentSummaries.length >= 35) return;
          const authorEl = ct.querySelector('#author-text, .author, [class*="author"], [class*="user"]');
          const contentEl = ct.querySelector('#content-text, .comment-text, [class*="content"], p');
          const author = (authorEl?.textContent || "").trim().replace(/\s+/g, " ");
          const text = (contentEl?.textContent || "").trim().replace(/\s+/g, " ");
          if (text && text.length > 2) {
            const authorLabel = author ? `${author}: ` : "";
            contentSummaries.push(`Comment: ${authorLabel}"${text.slice(0, 180)}"`);
          }
        });
        const videoTitle = doc.querySelector("#title h1, h1.title, .video-title")?.textContent?.trim().replace(/\s+/g, " ");
        const channelName = doc.querySelector("#channel-name, #owner-name, .channel-name")?.textContent?.trim().replace(/\s+/g, " ");
        if (videoTitle && contentSummaries.length < 40) {
          contentSummaries.push(`Video: "${videoTitle}"${channelName ? ` by ${channelName}` : ""}`);
        }
        const mapTitle = doc.querySelector('.bhuvan-header, #bhuvan-title, [class*="layer-switcher"], .ol-scale-line')?.textContent?.trim().replace(/\s+/g, " ");
        if (mapTitle && contentSummaries.length < 45) {
          contentSummaries.push(`Map Surface: ${mapTitle.slice(0, 120)}`);
        }
      } catch {
      }
      const routeFingerprint = typeof doc.location !== "undefined" && doc.location?.pathname ? doc.location.pathname.slice(0, 50) : "/";
      const domain = typeof doc.location !== "undefined" && doc.location?.hostname ? doc.location.hostname.slice(0, 100) : void 0;
      const pageZone = classifyPageZone(typeof doc.location !== "undefined" ? doc.location?.href || "" : "");
      const win = doc.defaultView || (typeof window !== "undefined" ? window : null);
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
          pageTitle: doc.title ? doc.title.slice(0, 150) : "Page",
          visibleDialogCount,
          dialogTitles,
          statusSummaries,
          counters: counters.slice(0, 20),
          contentSummaries: contentSummaries.slice(0, 45),
          routeFingerprint,
          domain,
          scrollMetrics,
          pageZone
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
        const doc = typeof document !== "undefined" ? document : null;
        const win2 = typeof window !== "undefined" ? window : null;
        const vh = win2?.innerHeight || 800;
        const readingDelta = Math.max(350, Math.round(vh * 0.65));
        const delta = proposal.scrollDirection === "up" ? -readingDelta : readingDelta;
        if (proposal.targetLocalId) {
          const targetEl2 = elementMap?.get(proposal.targetLocalId) || (doc ? doc.querySelector(`[data-privapilot-id="${proposal.targetLocalId}"]`) || doc.querySelector(`[data-som-id="${proposal.targetLocalId}"]`) : null);
          if (targetEl2 && typeof targetEl2.scrollIntoView === "function") {
            try {
              targetEl2.scrollIntoView({ behavior: "smooth", block: "center", inline: "nearest" });
            } catch (_) {
              targetEl2.scrollIntoView();
            }
          } else if (win2) {
            try {
              win2.scrollBy({ top: delta, left: 0, behavior: "smooth" });
            } catch (_) {
              win2.scrollBy(0, delta);
            }
          }
        } else if (proposal.scrollDirection === "top") {
          if (win2) {
            try {
              win2.scrollTo({ top: 0, left: 0, behavior: "smooth" });
            } catch (_) {
              win2.scrollTo(0, 0);
            }
          }
          try {
            doc?.documentElement?.scrollTo?.({ top: 0, left: 0, behavior: "smooth" });
          } catch (_) {
          }
          try {
            doc?.body?.scrollTo?.({ top: 0, left: 0, behavior: "smooth" });
          } catch (_) {
          }
        } else if (proposal.scrollDirection === "bottom") {
          const maxScroll = Math.max(doc?.body?.scrollHeight || 0, doc?.documentElement?.scrollHeight || 0, 1e4);
          if (win2) {
            try {
              win2.scrollTo({ top: maxScroll, left: 0, behavior: "smooth" });
            } catch (_) {
              win2.scrollTo(0, maxScroll);
            }
          }
          try {
            doc?.documentElement?.scrollTo?.({ top: maxScroll, left: 0, behavior: "smooth" });
          } catch (_) {
          }
          try {
            doc?.body?.scrollTo?.({ top: maxScroll, left: 0, behavior: "smooth" });
          } catch (_) {
          }
        } else {
          const prevY = win2?.scrollY || doc?.documentElement?.scrollTop || doc?.body?.scrollTop || 0;
          if (win2) {
            try {
              win2.scrollBy({ top: delta, left: 0, behavior: "smooth" });
            } catch (_) {
              win2.scrollBy(0, delta);
            }
          }
          const newY = win2?.scrollY || doc?.documentElement?.scrollTop || doc?.body?.scrollTop || 0;
          if (newY === prevY && doc) {
            const scrollable = doc.querySelector('main, [role="main"], article, .mw-parser-output, .main-content, #main, .content, .container, body');
            if (scrollable && typeof scrollable.scrollBy === "function") {
              try {
                scrollable.scrollBy({ top: delta, left: 0, behavior: "smooth" });
              } catch (_) {
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
      if (proposal.kind === "navigate") {
        const navUrl = proposal.url || proposal.targetUrl || "";
        if (navUrl && typeof window !== "undefined") {
          try {
            window.location.href = navUrl;
          } catch (_) {
          }
          return {
            actionId: proposal.actionId,
            success: true,
            timestamp,
            semanticOutcomeVerified: true,
            message: `Navigating to ${navUrl}`
          };
        }
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
      let targetEl = proposal.targetLocalId ? elementMap.get(proposal.targetLocalId) : void 0;
      if (!targetEl && Array.isArray(proposal.coordinates) && proposal.coordinates.length >= 2) {
        const coords = proposal.coordinates;
        let cx = coords[0];
        let cy = coords[1];
        const win2 = typeof window !== "undefined" ? window : null;
        if (win2) {
          if (cx <= 1 && cy <= 1) {
            cx = Math.round(cx * (win2.innerWidth || 1280));
            cy = Math.round(cy * (win2.innerHeight || 800));
          }
          const doc = win2.document;
          if (doc && typeof doc.elementFromPoint === "function") {
            targetEl = doc.elementFromPoint(cx, cy) || void 0;
          }
        }
      }
      if (!targetEl && proposal.targetLocalId) {
        const win2 = typeof window !== "undefined" ? window : null;
        const doc = win2?.document || (typeof document !== "undefined" ? document : null);
        if (doc) {
          const fullText = (proposal.rationale || "") + " " + (proposal.reasoning || "") + " " + (proposal.targetName || "");
          const matchPhrase = fullText.match(/["']([^"']{3,40})["']/)?.[1] || fullText.match(/\b(?:click|open|select|navigate\s+to|check|explore)\s+([a-zA-Z0-9_&\s-]{3,30})/i)?.[1] || "";
          const cleanPhrase = matchPhrase.toLowerCase().replace(/[^a-z0-9]/g, "");
          if (cleanPhrase.length >= 3) {
            const allInteractive = doc.querySelectorAll('a, button, [role="button"], [role="link"], [role="menuitem"], [role="tab"]');
            for (let i = 0; i < allInteractive.length; i++) {
              const item = allInteractive[i];
              const itemText = (item.textContent || "").toLowerCase().replace(/[^a-z0-9]/g, "");
              const itemAria = (item.getAttribute("aria-label") || "").toLowerCase().replace(/[^a-z0-9]/g, "");
              const itemHref = (item.href || "").toLowerCase();
              if (itemText.includes(cleanPhrase) || cleanPhrase.includes(itemText) || itemAria.includes(cleanPhrase) || itemHref.includes(cleanPhrase)) {
                targetEl = item;
                break;
              }
            }
          }
        }
      }
      if (!targetEl) {
        if (!proposal.targetLocalId && !proposal.coordinates) {
          return {
            actionId: proposal.actionId,
            success: false,
            timestamp,
            semanticOutcomeVerified: false,
            message: "Missing targetLocalId or coordinates for DOM action"
          };
        }
        return {
          actionId: proposal.actionId,
          success: false,
          timestamp,
          semanticOutcomeVerified: false,
          staleTarget: true,
          message: `Target element '${proposal.targetLocalId || `coordinates [${proposal.coordinates?.join(", ")}]`}' is stale or not found in DOM`
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
        const anchorEl = targetEl.tagName.toLowerCase() === "a" ? targetEl : targetEl.closest?.("a");
        const href = anchorEl?.href || anchorEl?.getAttribute("href") || "";
        if (href && !href.startsWith("javascript:") && !href.startsWith("#")) {
          const win2 = targetEl.ownerDocument?.defaultView || (typeof window !== "undefined" ? window : null);
          if (win2) {
            win2.location.href = href;
            return {
              actionId: proposal.actionId,
              success: true,
              timestamp,
              semanticOutcomeVerified: true,
              message: `Navigated directly to dropdown link "${href}"`
            };
          }
        }
        const parentDropdown = targetEl.closest('.dropdown, .menu, nav, ul, li, [role="menu"]')?.parentElement?.querySelector("button, a, [aria-haspopup]");
        if (parentDropdown && typeof parentDropdown.click === "function") {
          parentDropdown.dispatchEvent(new MouseEvent("mouseover", { bubbles: true }));
          parentDropdown.dispatchEvent(new MouseEvent("mouseenter", { bubbles: true }));
          parentDropdown.click();
        }
        return {
          actionId: proposal.actionId,
          success: false,
          timestamp,
          semanticOutcomeVerified: false,
          staleTarget: true,
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
          const rect = typeof targetEl.getBoundingClientRect === "function" ? targetEl.getBoundingClientRect() : { left: 10, top: 10, width: 20, height: 20 };
          const coords = proposal.coordinates;
          let clientX = rect.left + rect.width / 2;
          let clientY = rect.top + rect.height / 2;
          if (Array.isArray(coords) && coords.length >= 2) {
            clientX = coords[0] <= 1 && typeof window !== "undefined" ? Math.round(coords[0] * (window.innerWidth || 1280)) : coords[0];
            clientY = coords[1] <= 1 && typeof window !== "undefined" ? Math.round(coords[1] * (window.innerHeight || 800)) : coords[1];
          }
          const mouseInit = {
            bubbles: true,
            cancelable: true,
            composed: true,
            clientX,
            clientY,
            screenX: clientX,
            screenY: clientY,
            button: 0,
            buttons: 1
          };
          const anchorEl = targetEl.tagName.toLowerCase() === "a" ? targetEl : targetEl.closest?.("a");
          if (anchorEl) {
            const href = anchorEl.href || anchorEl.getAttribute("href") || "";
            const isDownloadable = /\.(?:pdf|zip|csv|kmz|kml|tif|tiff|docx?|xlsx?)(?:\?.*)?$/i.test(href);
            if (isDownloadable) {
              const filename = href.split("/").pop()?.split("?")[0] || "document.pdf";
              anchorEl.setAttribute("download", filename);
              anchorEl.download = filename;
              try {
                const globalChrome = globalThis.chrome;
                if (typeof globalChrome !== "undefined" && globalChrome.runtime?.sendMessage) {
                  globalChrome.runtime.sendMessage({
                    type: "TRIGGER_DOWNLOAD",
                    url: href,
                    filename
                  }).catch(() => {
                  });
                }
              } catch (_) {
              }
              return {
                actionId: proposal.actionId,
                success: true,
                timestamp,
                semanticOutcomeVerified: true,
                message: `\u2713 Download initiated for "${filename}"`
              };
            } else if (anchorEl.getAttribute("target") === "_blank" || anchorEl.target === "_blank") {
              anchorEl.target = "_self";
              anchorEl.setAttribute("target", "_self");
            }
          }
          if (MouseEventCtor) {
            targetEl.dispatchEvent(new MouseEventCtor("mousedown", mouseInit));
            targetEl.dispatchEvent(new MouseEventCtor("mouseup", mouseInit));
          }
          if (typeof targetEl.click === "function") {
            targetEl.click();
          } else if (EventCtor) {
            targetEl.dispatchEvent(new (MouseEventCtor || EventCtor)("click", mouseInit));
          }
          return {
            actionId: proposal.actionId,
            success: true,
            timestamp,
            semanticOutcomeVerified: true,
            message: `Clicked element '${proposal.targetLocalId || `coordinates [${clientX}, ${clientY}]`}'`
          };
        }
        if (proposal.kind === "type" && proposal.textToType !== void 0) {
          let tag = targetEl.tagName.toLowerCase();
          let isInputOrTextArea = tag === "input" || tag === "textarea";
          let isContentEditable = targetEl.isContentEditable || targetEl.getAttribute?.("contenteditable") === "true" || targetEl.getAttribute?.("role") === "textbox";
          let inputType = tag === "input" ? (targetEl.getAttribute?.("type") || "text").toLowerCase() : "";
          const nonTextTypes = ["button", "submit", "reset", "image", "checkbox", "radio", "hidden"];
          let isNonTextInput = tag === "input" && nonTextTypes.includes(inputType);
          if (!isInputOrTextArea && !isContentEditable || isNonTextInput) {
            const isEditableTarget = (el) => {
              if (!el || typeof el.getAttribute !== "function") return false;
              const t = el.tagName?.toLowerCase();
              if (t === "textarea") return true;
              if (t === "input") {
                const it = (el.getAttribute("type") || "text").toLowerCase();
                return !["button", "submit", "reset", "image", "checkbox", "radio", "hidden", "file"].includes(it);
              }
              return el.isContentEditable === true || el.getAttribute("contenteditable") === "true" || el.getAttribute("role") === "textbox" || el.getAttribute("role") === "searchbox" || el.getAttribute("role") === "combobox";
            };
            let healedEl = null;
            const form = typeof targetEl.closest === "function" ? targetEl.closest("form") : null;
            if (form && typeof form.querySelectorAll === "function") {
              const inputs = form.querySelectorAll('input, textarea, [contenteditable="true"], [role="textbox"], [role="searchbox"]');
              for (const inp of Array.from(inputs)) {
                if (isEditableTarget(inp)) {
                  healedEl = inp;
                  break;
                }
              }
            }
            if (!healedEl && typeof targetEl.closest === "function") {
              const container = targetEl.closest('[role="search"], [role="combobox"], header, nav, .search, .search-box, .searchbar');
              if (container && typeof container.querySelectorAll === "function") {
                const inputs = container.querySelectorAll('input, textarea, [contenteditable="true"], [role="textbox"], [role="searchbox"]');
                for (const inp of Array.from(inputs)) {
                  if (isEditableTarget(inp)) {
                    healedEl = inp;
                    break;
                  }
                }
              }
            }
            if (!healedEl && targetEl.parentElement && typeof targetEl.parentElement.querySelectorAll === "function") {
              const parentInputs = targetEl.parentElement.querySelectorAll('input, textarea, [contenteditable="true"], [role="textbox"], [role="searchbox"]');
              for (const inp of Array.from(parentInputs)) {
                if (inp !== targetEl && isEditableTarget(inp)) {
                  healedEl = inp;
                  break;
                }
              }
            }
            if (!healedEl) {
              const doc = targetEl.ownerDocument || (typeof document !== "undefined" ? document : null);
              if (doc && typeof doc.querySelectorAll === "function") {
                const modalInputs = doc.querySelectorAll('[role="dialog"] input, [role="alertdialog"] input, .modal input, [aria-modal="true"] input, ai-mobile-autocomplete-modal input, input:focus');
                for (const inp of Array.from(modalInputs)) {
                  if (isEditableTarget(inp)) {
                    healedEl = inp;
                    break;
                  }
                }
              }
            }
            if (healedEl) {
              targetEl = healedEl;
              tag = targetEl.tagName.toLowerCase();
              isInputOrTextArea = tag === "input" || tag === "textarea";
              isContentEditable = targetEl.isContentEditable || targetEl.getAttribute?.("contenteditable") === "true" || targetEl.getAttribute?.("role") === "textbox";
              inputType = tag === "input" ? (targetEl.getAttribute?.("type") || "text").toLowerCase() : "";
              isNonTextInput = tag === "input" && nonTextTypes.includes(inputType);
            }
          }
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
          const textToType = proposal.textToType;
          if (KeyboardEventCtor) {
            targetEl.dispatchEvent(
              new KeyboardEventCtor("keydown", {
                bubbles: true,
                cancelable: true,
                composed: true,
                key: textToType.length === 1 ? textToType : "Process"
              })
            );
          }
          let execCommandSucceeded = false;
          if (typeof document !== "undefined" && typeof document.execCommand === "function") {
            try {
              if (typeof targetEl.select === "function") {
                targetEl.select();
              }
              execCommandSucceeded = document.execCommand("insertText", false, textToType);
            } catch (_) {
              execCommandSucceeded = false;
            }
          }
          if (!execCommandSucceeded || targetEl.value !== textToType) {
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
            const tracker = targetEl._valueTracker;
            if (tracker && typeof tracker.setValue === "function") {
              tracker.setValue("");
            }
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
                key: textToType.length === 1 ? textToType : "Process"
              })
            );
            if (proposal.pressEnter) {
              targetEl.dispatchEvent(new KeyboardEventCtor("keydown", { key: "Enter", code: "Enter", keyCode: 13, which: 13, bubbles: true, cancelable: true }));
              targetEl.dispatchEvent(new KeyboardEventCtor("keypress", { key: "Enter", code: "Enter", keyCode: 13, which: 13, bubbles: true, cancelable: true }));
              targetEl.dispatchEvent(new KeyboardEventCtor("keyup", { key: "Enter", code: "Enter", keyCode: 13, which: 13, bubbles: true, cancelable: true }));
              const form = targetEl.form || (typeof targetEl.closest === "function" ? targetEl.closest("form") : null);
              const formAction = (form?.getAttribute?.("action") || "").toLowerCase();
              const isECommerceOrSearchForm = Boolean(form && (formAction.includes("/s") || formAction.includes("search") || form.id && /search|nav-search|header-search/i.test(form.id)));
              const isSearchFilterInput = !isECommerceOrSearchForm && ((targetEl.getAttribute?.("type") || "").toLowerCase() === "search" && !form || targetEl.hasAttribute?.("aria-controls") && !form || Boolean(targetEl.closest?.('.dataTables_filter, .dataTable, .table-filter, [class*="filter" i]')));
              const isAspnetWrapperForm = Boolean(form && (form.id === "aspnetForm" || form.name === "aspnetForm" || formAction.includes(".aspx")));
              if (EventCtor) {
                try {
                  targetEl.dispatchEvent(new EventCtor("search", { bubbles: true, cancelable: true }));
                } catch (_) {
                }
              }
              if (form && !isSearchFilterInput && !isAspnetWrapperForm) {
                const submitBtn = form.querySelector?.('button[type="submit"], input[type="submit"], button:not([type]), [role="button"]');
                if (typeof form.requestSubmit === "function") {
                  try {
                    if (submitBtn) {
                      form.requestSubmit(submitBtn);
                    } else {
                      form.requestSubmit();
                    }
                  } catch (_) {
                    try {
                      if (submitBtn && typeof submitBtn.click === "function") {
                        submitBtn.click();
                      } else {
                        form.submit();
                      }
                    } catch (__) {
                    }
                  }
                } else if (submitBtn && typeof submitBtn.click === "function") {
                  try {
                    submitBtn.click();
                  } catch (_) {
                    try {
                      form.submit();
                    } catch (__) {
                    }
                  }
                } else if (typeof form.submit === "function") {
                  try {
                    form.submit();
                  } catch (_) {
                  }
                }
              } else if (!form) {
                const container = targetEl.parentElement?.parentElement || targetEl.parentElement;
                const searchBtn = container?.querySelector?.('button[aria-label*="search" i], button[title*="search" i], [role="button"][aria-label*="search" i], [aria-label="search"]');
                if (searchBtn && typeof searchBtn.click === "function") {
                  try {
                    searchBtn.click();
                  } catch (_) {
                  }
                }
              }
            }
          }
          const isSearchOrAutocomplete = Boolean(targetEl.closest?.('[role="search"], [role="combobox"], [aria-autocomplete], .search, .search-box, .searchbar, #search, [class*="search" i]')) || (targetEl.getAttribute?.("type") || "").toLowerCase() === "search" || (targetEl.getAttribute?.("role") || "").toLowerCase() === "combobox" || (targetEl.getAttribute?.("role") || "").toLowerCase() === "searchbox" || targetEl.hasAttribute?.("aria-autocomplete") || /search|find|filter|locate|query/i.test(targetEl.getAttribute?.("placeholder") || "") || /search|find|filter|locate|query/i.test(targetEl.getAttribute?.("aria-label") || "");
          if (!isSearchOrAutocomplete) {
            const FocusEventCtor = win?.FocusEvent || (typeof FocusEvent !== "undefined" ? FocusEvent : null);
            if (FocusEventCtor) {
              try {
                targetEl.dispatchEvent(new FocusEventCtor("blur", { bubbles: false, cancelable: false, composed: true }));
              } catch (_) {
              }
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
        case "panel_visible":
        case "element_visible":
        case "search_results_visible":
        case "content_visible": {
          const patternText = pc.kind === "panel_visible" || pc.kind === "element_visible" ? pc.namePattern : pc.kind === "search_results_visible" ? pc.queryPattern : pc.textPattern;
          let pattern;
          try {
            pattern = patternText ? new RegExp(patternText, "i") : void 0;
          } catch (_) {
            pattern = void 0;
          }
          const selectors = pc.kind === "panel_visible" ? '[role="dialog"], [role="region"], aside, .panel, .drawer, [class*="panel"], [class*="drawer"], [class*="layer"]' : pc.kind === "search_results_visible" ? '[role="main"] a, [role="list"] > *, .search-results > *, [class*="result"]' : 'main, article, section, [role="main"], [role="region"], p, li, h1, h2, h3';
          const direct = pc.kind === "element_visible" && pc.targetLocalId ? doc.getElementById(pc.targetLocalId) : null;
          const candidates = direct ? [direct] : Array.from(doc.querySelectorAll?.(selectors) || []);
          const matched = candidates.find((candidate) => {
            const element = candidate;
            const text = `${element.getAttribute?.("aria-label") || ""} ${element.textContent || ""}`.trim();
            return isElementVisible(element) && (!pattern || pattern.test(text));
          });
          return matched ? { matched: true, reasonCode: pc.kind === "panel_visible" ? "MODAL_DRAWER_VISIBILITY_VERIFIED" : "LANDMARK_MUTATION_VERIFIED", message: `${pc.kind} verified`, matchedCondition: pc.kind } : { matched: false, reasonCode: "CONDITION_NOT_MET", message: `${pc.kind} was not observed` };
        }
        case "element_count_changed": {
          const delta = Math.abs((doc.querySelectorAll?.("*").length || 0) - preSnapshot.documentElementCount);
          return delta >= (pc.minimumDelta || 1) ? { matched: true, reasonCode: "LANDMARK_MUTATION_VERIFIED", message: `Element count changed by ${delta}`, matchedCondition: "element_count_changed" } : { matched: false, reasonCode: "CONDITION_NOT_MET", message: "Element count did not change enough" };
        }
        case "visual_change": {
          return { matched: false, reasonCode: "CONDITION_NOT_MET", message: "Visual change requires locally corroborated image evidence" };
        }
        case "map_location_changed": {
          const locationPattern = pc.locationPattern?.toLowerCase();
          const currentLocation = `${typeof window !== "undefined" ? window.location.href : ""} ${doc.body?.textContent || ""}`.toLowerCase();
          const pathChanged = (typeof window !== "undefined" ? window.location.pathname + window.location.hash : "") !== preSnapshot.pathFingerprint;
          const markerPresent = Boolean(doc.querySelector?.('.leaflet-marker-icon, .ol-overlaycontainer-stopevent [class*="marker"], [aria-label*="marker" i], [class*="location"]'));
          return pathChanged || markerPresent || Boolean(locationPattern && currentLocation.includes(locationPattern)) ? { matched: true, reasonCode: "LANDMARK_MUTATION_VERIFIED", message: "Map location evidence changed", matchedCondition: "map_location_changed" } : { matched: false, reasonCode: "CONDITION_NOT_MET", message: "No map location evidence changed" };
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
          const currentY = doc.defaultView?.scrollY || doc.documentElement?.scrollTop || doc.body?.scrollTop || 0;
          const deltaY = currentY - preSnapshot.scrollTop;
          const movedInDirection = pc.direction === "up" ? deltaY < -2 : pc.direction === "down" ? deltaY > 2 : pc.direction === "bottom" ? currentY > preSnapshot.scrollTop || currentY >= Math.max(0, (doc.documentElement?.scrollHeight || 0) - (doc.defaultView?.innerHeight || 0) - 2) : currentY === 0;
          return movedInDirection ? {
            matched: true,
            reasonCode: "PASSIVE_ACTION_VERIFIED",
            message: `Scroll in direction ${pc.direction} verified (${Math.round(deltaY)}px)`,
            matchedCondition: "scroll_changed"
          } : {
            matched: false,
            reasonCode: "CONDITION_NOT_MET",
            message: `Scroll did not move in direction ${pc.direction}`
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
      'dialog[open], .modal:not([hidden]):not(.hidden), .drawer:not([hidden]):not(.hidden), .sidebar:not([hidden]):not(.hidden), .side-panel:not([hidden]):not(.hidden), .layers-panel:not([hidden]):not(.hidden), [class*="layer"][class*="panel"]:not([hidden]), [role="dialog"], [aria-modal="true"], .preview-panel:not([hidden]):not(.hidden), #previewDrawer:not(.hidden), #preview-drawer:not(.hidden)'
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
          documentElementCount: 0,
          scrollTop: 0
        };
      }
      const rawPath = doc.location?.pathname || "";
      const hash = doc.location?.hash || "";
      const scrollTop = doc.defaultView?.scrollY || doc.documentElement?.scrollTop || doc.body?.scrollTop || 0;
      const pathFingerprint = `${rawPath}${hash ? `#${hash.replace(/^#/, "")}` : ""}`;
      const openDialogIds = /* @__PURE__ */ new Set();
      const dialogEls = doc.querySelectorAll?.(
        'dialog[open], .modal:not([hidden]):not(.hidden), .drawer:not([hidden]):not(.hidden), .sidebar:not([hidden]):not(.hidden), .side-panel:not([hidden]):not(.hidden), .layers-panel:not([hidden]):not(.hidden), [class*="layer"][class*="panel"]:not([hidden]), [role="dialog"], [aria-modal="true"], .preview-panel:not([hidden]):not(.hidden), #previewDrawer:not(.hidden), #preview-drawer:not(.hidden)'
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
        documentElementCount,
        scrollTop
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
            const expectsSpecificModalOrValue = exp.includes("drawer") || exp.includes("preview") || exp.includes("modal") || exp.includes("dialog") || proposal.expectedPostcondition?.kind === "dialog_visible" || proposal.expectedPostcondition?.kind === "panel_visible" || proposal.expectedPostcondition?.kind === "element_visible" || proposal.expectedPostcondition?.kind === "search_results_visible" || proposal.expectedPostcondition?.kind === "content_visible" || proposal.expectedPostcondition?.kind === "map_location_changed" || proposal.expectedPostcondition?.kind === "visual_change" || proposal.expectedPostcondition?.kind === "value_present" || proposal.expectedPostcondition?.kind === "select_changed";
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
  var OverlayRenderer = class _OverlayRenderer {
    overlayContainer = null;
    currentBox = null;
    clearTimer = null;
    workingGlowEl = null;
    glowWatchdogTimer = null;
    // Animated AI Ghost Cursor state
    cursorEl = null;
    cursorDismissTimer = null;
    currentCursorX = typeof window !== "undefined" ? Math.round(window.innerWidth / 2) : 200;
    currentCursorY = typeof window !== "undefined" ? Math.round(window.innerHeight / 2) : 200;
    isAgentCursorActive = false;
    boundMouseMove = null;
    // In-Page Execution Safety Shield state
    shieldEl = null;
    shieldWatchdogTimer = null;
    boundShieldHandler = null;
    isShieldActive = false;
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
      this.hideCursor(0);
      this.disableSafetyShield();
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
        display: none !important;
      }

      .privapilot-pulse-dot {
        width: 7px !important;
        height: 7px !important;
        border-radius: 50% !important;
        background: #60a5fa !important;
        box-shadow: 0 0 6px #3b82f6 !important;
        animation: privapilot-dot-pulse 1.6s ease-in-out infinite !important;
      }

      /* Realistic Human AI Cursor */
      .privapilot-agent-cursor {
        position: fixed !important;
        top: 0 !important;
        left: 0 !important;
        z-index: 2147483647 !important;
        pointer-events: none !important;
        opacity: 0;
        transition: opacity 0.25s ease-out;
        will-change: transform, opacity;
        filter: drop-shadow(0 2px 5px rgba(0, 0, 0, 0.45)) drop-shadow(0 0 6px rgba(59, 130, 246, 0.45));
      }

      .privapilot-cursor-icon {
        display: block !important;
        transform-origin: 0 0;
        transition: transform 0.08s ease-out;
      }

      .privapilot-cursor-pressing .privapilot-cursor-icon {
        transform: scale(0.82) translate(1px, 1px) !important;
      }

      .privapilot-cursor-badge {
        position: absolute !important;
        top: 18px !important;
        left: 18px !important;
        display: inline-flex !important;
        align-items: center !important;
        gap: 5px !important;
        background: rgba(15, 23, 42, 0.92) !important;
        border: 1px solid rgba(255, 255, 255, 0.16) !important;
        color: #f1f5f9 !important;
        font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif !important;
        font-size: 10px !important;
        font-weight: 600 !important;
        padding: 2px 6px !important;
        border-radius: 4px !important;
        box-shadow: 0 2px 8px rgba(0, 0, 0, 0.35) !important;
        white-space: nowrap !important;
        pointer-events: none !important;
        letter-spacing: 0.2px !important;
        transition: border-color 0.2s, box-shadow 0.2s !important;
      }

      .privapilot-cursor-badge-icon {
        display: inline-flex !important;
        align-items: center !important;
        justify-content: center !important;
        color: #60a5fa !important;
        line-height: 1 !important;
      }

      .privapilot-cursor-badge-icon svg {
        display: block !important;
      }

      .privapilot-cursor-ripple {
        position: absolute !important;
        top: 1px !important;
        left: 1px !important;
        width: 6px !important;
        height: 6px !important;
        border-radius: 50% !important;
        border: 2px solid #38bdf8 !important;
        pointer-events: none !important;
        transform: translate(-50%, -50%) scale(0.2) !important;
        opacity: 0 !important;
      }

      .privapilot-cursor-ripple.privapilot-ripple-active {
        animation: privapilot-human-ripple 0.38s cubic-bezier(0.1, 0.8, 0.2, 1) forwards !important;
      }

      @keyframes privapilot-human-ripple {
        0% {
          opacity: 0.9;
          transform: translate(-50%, -50%) scale(0.3);
          border-color: #38bdf8;
          box-shadow: 0 0 6px #38bdf8;
        }
        50% {
          border-color: #34d399;
          box-shadow: 0 0 10px #34d399;
        }
        100% {
          opacity: 0;
          transform: translate(-50%, -50%) scale(4.2);
          border-color: #34d399;
        }
      }

      /* In-Page Execution Safety Shield */
      .privapilot-shield-root {
        position: fixed !important;
        top: 0 !important;
        left: 0 !important;
        width: 100vw !important;
        height: 100vh !important;
        z-index: 2147483645 !important;
        pointer-events: auto !important;
        cursor: wait !important;
        background: rgba(15, 23, 42, 0.05) !important;
        backdrop-filter: blur(0.5px) !important;
        -webkit-backdrop-filter: blur(0.5px) !important;
        transition: opacity 0.2s ease !important;
      }

      .privapilot-shield-hud {
        position: fixed !important;
        top: 14px !important;
        left: 50% !important;
        transform: translateX(-50%) !important;
        display: inline-flex !important;
        align-items: center !important;
        gap: 8px !important;
        background: rgba(10, 15, 30, 0.94) !important;
        backdrop-filter: blur(16px) saturate(180%) !important;
        -webkit-backdrop-filter: blur(16px) saturate(180%) !important;
        border: 1.5px solid rgba(59, 130, 246, 0.8) !important;
        color: #f0f9ff !important;
        font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif !important;
        font-size: 12px !important;
        font-weight: 600 !important;
        padding: 6px 16px !important;
        border-radius: 9999px !important;
        box-shadow: 0 8px 32px rgba(0, 0, 0, 0.45), 0 0 20px rgba(59, 130, 246, 0.5) !important;
        letter-spacing: 0.3px !important;
        user-select: none !important;
        pointer-events: auto !important;
      }

      .privapilot-shield-pulse-dot {
        width: 8px !important;
        height: 8px !important;
        border-radius: 50% !important;
        background: #38bdf8 !important;
        box-shadow: 0 0 8px #38bdf8 !important;
        animation: privapilot-dot-pulse 1.2s ease-in-out infinite !important;
      }

      .privapilot-shield-esc-badge {
        background: rgba(59, 130, 246, 0.25) !important;
        border: 1px solid rgba(96, 165, 250, 0.5) !important;
        border-radius: 4px !important;
        padding: 1px 6px !important;
        font-size: 10px !important;
        color: #93c5fd !important;
        margin-left: 4px !important;
        font-family: monospace !important;
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
        glow.style.opacity = "0";
        document.body.appendChild(glow);
        void glow.offsetHeight;
        glow.style.opacity = "1";
        this.workingGlowEl = glow;
      } else {
        this.workingGlowEl.style.opacity = "1";
      }
      this.glowWatchdogTimer = setTimeout(() => {
        this.hideAgentWorkingGlow();
      }, 45e3);
      if (this.glowWatchdogTimer && typeof this.glowWatchdogTimer.unref === "function") {
        this.glowWatchdogTimer.unref();
      }
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
    /**
     * Minimal SVG action icons (no tacky emojis).
     */
    static MINIMAL_ICONS = {
      CLICK: '<svg viewBox="0 0 16 16" width="10" height="10" fill="none" stroke="currentColor" stroke-width="1.8"><circle cx="8" cy="8" r="3"/><path d="M8 1v2.5M8 12.5v2.5M1 8h2.5M12.5 8h2.5"/></svg>',
      TYPE: '<svg viewBox="0 0 16 16" width="10" height="10" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M11.5 2.5l2 2-7.5 7.5H4v-2l7.5-7.5zM3 13.5h10"/></svg>',
      SELECT: '<svg viewBox="0 0 16 16" width="10" height="10" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M4 6l4 4 4-4"/></svg>',
      HOVER: '<svg viewBox="0 0 16 16" width="10" height="10" fill="none" stroke="currentColor" stroke-width="1.8"><circle cx="8" cy="8" r="2.5"/><path d="M1 8s3-5 7-5 7 5 7 5-3 5-7 5-7-5-7-5z"/></svg>',
      SCROLL: '<svg viewBox="0 0 16 16" width="10" height="10" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M8 3v10M4 9l4 4 4-4"/></svg>',
      UPLOAD: '<svg viewBox="0 0 16 16" width="10" height="10" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M8 11V3M5 6l3-3 3 3M3 13h10"/></svg>',
      DRAG: '<svg viewBox="0 0 16 16" width="10" height="10" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M5 3h6M5 8h6M5 13h6"/></svg>'
    };
    /**
     * Ensures the visual AI agent cursor element exists in the DOM.
     */
    ensureCursor() {
      if (!this.cursorEl || !document.body.contains(this.cursorEl)) {
        this.ensureGlowStyles();
        const cursor = document.createElement("div");
        cursor.id = "privapilot-agent-cursor";
        cursor.className = "privapilot-overlay privapilot-agent-cursor";
        cursor.setAttribute("data-privapilot-ignore", "true");
        cursor.setAttribute("aria-hidden", "true");
        cursor.innerHTML = `
        <svg class="privapilot-cursor-icon privapilot-cursor-arrow" viewBox="0 0 24 24" width="20" height="20" style="display: block; overflow: visible;">
          <path d="M 3 2 L 3 19 L 7.5 14.5 L 11.5 22 L 14.2 20.5 L 10.2 13 L 16 13 Z"
                fill="#0f172a" stroke="#ffffff" stroke-width="1.5" stroke-linejoin="round" />
        </svg>
        <svg class="privapilot-cursor-icon privapilot-cursor-hand" viewBox="0 0 24 24" width="20" height="20" style="display: none; overflow: visible;">
          <path d="M 8.5 2.5 C 7.4 2.5 6.5 3.4 6.5 4.5 L 6.5 11.5 L 5 10 C 4.1 9.1 2.7 9.1 1.8 10 C 0.9 10.9 0.9 12.3 1.8 13.2 L 6 17.5 C 7.5 19 9.5 20.5 12 20.5 L 15.5 20.5 C 18.5 20.5 19.5 18.5 19.5 15.5 L 19.5 9 C 19.5 7.9 18.6 7 17.5 7 C 17 7 16.2 7.2 15.8 7.5 L 15.8 6.5 C 15.8 5.4 14.9 4.5 13.8 4.5 C 13.3 4.5 12.6 4.7 12.2 5 L 12.2 4.5 C 12.2 3.4 11.3 2.5 10.2 2.5 C 9.7 2.5 9 2.7 8.5 2.5 Z"
                fill="#0f172a" stroke="#ffffff" stroke-width="1.4" stroke-linejoin="round" />
        </svg>
        <svg class="privapilot-cursor-icon privapilot-cursor-caret" viewBox="0 0 24 24" width="18" height="18" style="display: none; overflow: visible;">
          <path d="M 6 3 L 14 3 M 10 3 L 10 19 M 6 19 L 14 19"
                fill="none" stroke="#0f172a" stroke-width="2.2" stroke-linecap="round" />
          <path d="M 6 3 L 14 3 M 10 3 L 10 19 M 6 19 L 14 19"
                fill="none" stroke="#ffffff" stroke-width="1.2" stroke-linecap="round" />
        </svg>
        <div class="privapilot-overlay privapilot-cursor-ripple" data-privapilot-ignore="true"></div>
        <div class="privapilot-overlay privapilot-cursor-badge" data-privapilot-ignore="true">
          <span class="privapilot-cursor-badge-icon">${_OverlayRenderer.MINIMAL_ICONS.CLICK}</span>
          <span class="privapilot-cursor-badge-text">Click</span>
        </div>
      `;
        cursor.style.transform = `translate3d(${Math.round(this.currentCursorX - 2.5)}px, ${Math.round(this.currentCursorY - 1.7)}px, 0)`;
        document.body.appendChild(cursor);
        this.cursorEl = cursor;
        if (typeof window !== "undefined" && !this.boundMouseMove) {
          this.boundMouseMove = (e) => {
            if (!this.isAgentCursorActive) {
              this.currentCursorX = e.clientX;
              this.currentCursorY = e.clientY;
            }
          };
          try {
            window.addEventListener("mousemove", this.boundMouseMove, { passive: true, capture: true });
          } catch (_) {
          }
        }
      }
      return this.cursorEl;
    }
    /**
     * Switches the pointer shape to match human cursor conventions (arrow, link hand, text caret).
     */
    setCursorPointerType(type) {
      if (!this.cursorEl) return;
      const arrow = this.cursorEl.querySelector(".privapilot-cursor-arrow");
      const hand = this.cursorEl.querySelector(".privapilot-cursor-hand");
      const caret = this.cursorEl.querySelector(".privapilot-cursor-caret");
      if (arrow) arrow.style.display = type === "arrow" ? "block" : "none";
      if (hand) hand.style.display = type === "hand" ? "block" : "none";
      if (caret) caret.style.display = type === "caret" ? "block" : "none";
    }
    updateCursorBadge(actionKind, extraText) {
      if (!this.cursorEl) return;
      const iconEl = this.cursorEl.querySelector(".privapilot-cursor-badge-icon");
      const textEl = this.cursorEl.querySelector(".privapilot-cursor-badge-text");
      const kindUpper = (actionKind || "CLICK").toUpperCase();
      let svgIcon = _OverlayRenderer.MINIMAL_ICONS.CLICK;
      let label = "Click";
      if (kindUpper.includes("TYPE")) {
        svgIcon = _OverlayRenderer.MINIMAL_ICONS.TYPE;
        label = extraText ? `Type "${extraText.slice(0, 20)}${extraText.length > 20 ? "..." : ""}"` : "Type";
      } else if (kindUpper.includes("CLICK")) {
        svgIcon = _OverlayRenderer.MINIMAL_ICONS.CLICK;
        label = "Click";
      } else if (kindUpper.includes("SELECT")) {
        svgIcon = _OverlayRenderer.MINIMAL_ICONS.SELECT;
        label = "Select";
      } else if (kindUpper.includes("HOVER")) {
        svgIcon = _OverlayRenderer.MINIMAL_ICONS.HOVER;
        label = "Hover";
      } else if (kindUpper.includes("SCROLL")) {
        svgIcon = _OverlayRenderer.MINIMAL_ICONS.SCROLL;
        label = "Scroll";
      } else if (kindUpper.includes("UPLOAD")) {
        svgIcon = _OverlayRenderer.MINIMAL_ICONS.UPLOAD;
        label = "Upload";
      } else if (kindUpper.includes("DRAG")) {
        svgIcon = _OverlayRenderer.MINIMAL_ICONS.DRAG;
        label = "Drag";
      }
      if (iconEl) iconEl.innerHTML = svgIcon;
      if (textEl) textEl.textContent = label;
    }
    /**
     * Computes the exact interactive target point (screen coordinates) for an element,
     * accounting for element semantics (buttons, text inputs, links) and cursor hotspot tip offsets.
     */
    computeTargetPoint(el, cursorType) {
      const rect = el.getBoundingClientRect();
      const tagName = (el.tagName || "").toUpperCase();
      const role = (el.getAttribute?.("role") || "").toLowerCase();
      const type = (el.getAttribute?.("type") || "").toLowerCase();
      const isTextInput = tagName === "TEXTAREA" || tagName === "INPUT" && !["button", "submit", "reset", "checkbox", "radio", "file"].includes(type) || Boolean(el.isContentEditable);
      const isClickable = tagName === "BUTTON" || tagName === "A" || role === "button" || role === "link" || role === "tab" || role === "menuitem" || type === "button" || type === "submit" || type === "checkbox" || type === "radio";
      let targetX;
      let targetY;
      if (isTextInput) {
        const leftPad = Math.min(Math.max(rect.width * 0.08, 12), 40);
        targetX = Math.round(rect.left + leftPad);
        targetY = Math.round(rect.top + rect.height * 0.5);
      } else if (isClickable) {
        targetX = Math.round(rect.left + rect.width * 0.5);
        targetY = Math.round(rect.top + rect.height * 0.5);
      } else {
        targetX = Math.round(rect.left + Math.min(rect.width * 0.5, 120));
        targetY = Math.round(rect.top + Math.min(rect.height * 0.5, 28));
      }
      let hotspotX = 2.5;
      let hotspotY = 1.7;
      if (cursorType === "hand") {
        hotspotX = 7.1;
        hotspotY = 2.1;
      } else if (cursorType === "caret") {
        hotspotX = 7.5;
        hotspotY = 8.25;
      }
      return {
        targetX,
        targetY,
        containerX: Math.round(targetX - hotspotX),
        containerY: Math.round(targetY - hotspotY)
      };
    }
    /**
     * Glides the cursor along a natural human curved trajectory to the target element
     * using Ken Perlin's Smootherstep velocity easing and live element tracking.
     */
    async glideCursorTo(el, actionKind = "CLICK", extraText, durationMs) {
      if (typeof document === "undefined" || !document.body) return;
      const cursor = this.ensureCursor();
      if (this.cursorDismissTimer) {
        clearTimeout(this.cursorDismissTimer);
        this.cursorDismissTimer = null;
      }
      this.isAgentCursorActive = true;
      const tagName = (el.tagName || "").toUpperCase();
      const role = (el.getAttribute?.("role") || "").toLowerCase();
      const type = (el.getAttribute?.("type") || "").toLowerCase();
      const isTextInput = tagName === "TEXTAREA" || tagName === "INPUT" && !["button", "submit", "reset", "checkbox", "radio", "file"].includes(type) || Boolean(el.isContentEditable);
      const isClickable = tagName === "BUTTON" || tagName === "A" || role === "button" || role === "link" || role === "tab" || role === "menuitem" || type === "button" || type === "submit" || type === "checkbox" || type === "radio";
      const pointerType = isTextInput ? "caret" : isClickable ? "hand" : "arrow";
      this.setCursorPointerType(pointerType);
      this.updateCursorBadge(actionKind, extraText);
      cursor.style.opacity = "1";
      const initialPoint = this.computeTargetPoint(el, pointerType);
      const startX = this.currentCursorX;
      const startY = this.currentCursorY;
      const initialDx = initialPoint.targetX - startX;
      const initialDy = initialPoint.targetY - startY;
      const dist = Math.hypot(initialDx, initialDy);
      const totalDuration = durationMs !== void 0 ? durationMs : Math.min(Math.max(Math.round(220 + dist * 0.36), 260), 440);
      if (totalDuration <= 20) {
        cursor.style.transform = `translate3d(${initialPoint.containerX}px, ${initialPoint.containerY}px, 0)`;
        this.currentCursorX = initialPoint.targetX;
        this.currentCursorY = initialPoint.targetY;
        return;
      }
      const nx = -initialDy / (dist || 1);
      const ny = initialDx / (dist || 1);
      const arcSign = Math.round(startX + startY) % 2 === 0 ? 1 : -1;
      const arcHeight = Math.min(Math.max(dist * 0.14, 6), 55) * arcSign;
      let hotspotX = 2.5;
      let hotspotY = 1.7;
      if (pointerType === "hand") {
        hotspotX = 7.1;
        hotspotY = 2.1;
      } else if (pointerType === "caret") {
        hotspotX = 7.5;
        hotspotY = 8.25;
      }
      await new Promise((resolve) => {
        const getRaf = () => {
          if (typeof requestAnimationFrame === "function") return requestAnimationFrame;
          return (cb) => setTimeout(() => cb(Date.now()), 16);
        };
        let startTime = null;
        const step = (now) => {
          if (startTime === null) {
            startTime = now;
          }
          const elapsed = Math.max(0, now - startTime);
          const progress = Math.min(1, elapsed / totalDuration);
          const t = progress * progress * progress * (progress * (progress * 6 - 15) + 10);
          const livePoint = this.computeTargetPoint(el, pointerType);
          const curTargetX = livePoint.targetX;
          const curTargetY = livePoint.targetY;
          const curDx = curTargetX - startX;
          const curDy = curTargetY - startY;
          const cp1x = startX + curDx * 0.32 + nx * arcHeight;
          const cp1y = startY + curDy * 0.32 + ny * arcHeight;
          const cp2x = startX + curDx * 0.72 + nx * (arcHeight * 0.45);
          const cp2y = startY + curDy * 0.72 + ny * (arcHeight * 0.45);
          const oneMinusT = 1 - t;
          const x = Math.round(
            oneMinusT * oneMinusT * oneMinusT * startX + 3 * oneMinusT * oneMinusT * t * cp1x + 3 * oneMinusT * t * t * cp2x + t * t * t * curTargetX
          );
          const y = Math.round(
            oneMinusT * oneMinusT * oneMinusT * startY + 3 * oneMinusT * oneMinusT * t * cp1y + 3 * oneMinusT * t * t * cp2y + t * t * t * curTargetY
          );
          cursor.style.transform = `translate3d(${Math.round(x - hotspotX)}px, ${Math.round(y - hotspotY)}px, 0)`;
          if (progress < 1) {
            getRaf()(step);
          } else {
            const finalPoint = this.computeTargetPoint(el, pointerType);
            cursor.style.transform = `translate3d(${finalPoint.containerX}px, ${finalPoint.containerY}px, 0)`;
            this.currentCursorX = finalPoint.targetX;
            this.currentCursorY = finalPoint.targetY;
            resolve();
          }
        };
        getRaf()(step);
      });
    }
    /**
     * Simulates a physical human mouse press down and release.
     */
    async animateClickPress() {
      if (!this.cursorEl) return;
      this.cursorEl.classList.add("privapilot-cursor-pressing");
      this.triggerClickRipple();
      await new Promise((r) => setTimeout(r, 85));
      this.cursorEl.classList.remove("privapilot-cursor-pressing");
    }
    /**
     * Simulates a physical human mouse drag from a source element to a destination element.
     */
    async animateDrag(sourceEl, destEl) {
      await this.glideCursorTo(sourceEl, "DRAG", "Grabbing");
      if (this.cursorEl) this.cursorEl.classList.add("privapilot-cursor-pressing");
      await this.glideCursorTo(destEl, "DRAG", "Dropping");
      if (this.cursorEl) this.cursorEl.classList.remove("privapilot-cursor-pressing");
      this.triggerClickRipple();
    }
    /**
     * Spawns an animated click ripple at the cursor's current location.
     */
    triggerClickRipple() {
      if (!this.cursorEl) return;
      const ripple = this.cursorEl.querySelector(".privapilot-cursor-ripple");
      if (ripple) {
        ripple.classList.remove("privapilot-ripple-active");
        void ripple.offsetWidth;
        ripple.classList.add("privapilot-ripple-active");
      }
    }
    /**
     * Highlights the badge with an active typing glow.
     */
    triggerTypingBadge() {
      if (!this.cursorEl) return;
      const badge = this.cursorEl.querySelector(".privapilot-cursor-badge");
      if (badge) {
        badge.style.borderColor = "#38bdf8";
        badge.style.boxShadow = "0 0 14px rgba(56, 189, 248, 0.75)";
        setTimeout(() => {
          if (badge) {
            badge.style.borderColor = "rgba(255, 255, 255, 0.16)";
            badge.style.boxShadow = "0 2px 8px rgba(0, 0, 0, 0.35)";
          }
        }, 400);
      }
    }
    /**
     * Parks or fades out the agent cursor after an extended idle delay.
     * Default delay is 15s so cursor remains resting on screen like a real user's mouse!
     */
    hideCursor(delayMs = 15e3) {
      if (this.cursorDismissTimer) {
        clearTimeout(this.cursorDismissTimer);
        this.cursorDismissTimer = null;
      }
      if (delayMs <= 0) {
        this.isAgentCursorActive = false;
        if (this.cursorEl) {
          this.cursorEl.style.opacity = "0";
        }
        return;
      }
      this.cursorDismissTimer = setTimeout(() => {
        this.isAgentCursorActive = false;
        if (this.cursorEl) {
          this.cursorEl.style.opacity = "0";
        }
      }, delayMs);
      if (this.cursorDismissTimer && typeof this.cursorDismissTimer.unref === "function") {
        this.cursorDismissTimer.unref();
      }
    }
    /**
     * Enables the in-page execution safety shield to prevent accidental user mouse/keyboard
     * interference while an agent action or batch is running.
     */
    enableSafetyShield(label = "PrivaPilot Automating Page...") {
      if (typeof document === "undefined" || !document.body) return;
      this.ensureGlowStyles();
      if (this.shieldWatchdogTimer) {
        clearTimeout(this.shieldWatchdogTimer);
      }
      if (!this.boundShieldHandler) {
        this.boundShieldHandler = (e) => {
          if (e.key === "Escape") {
            this.disableSafetyShield();
            try {
              window.dispatchEvent(new CustomEvent("privapilot-emergency-pause"));
            } catch (_) {
            }
            return;
          }
          e.stopPropagation();
          e.stopImmediatePropagation();
          if (e.cancelable) {
            e.preventDefault();
          }
        };
        const events = [
          "click",
          "mousedown",
          "mouseup",
          "dblclick",
          "contextmenu",
          "keydown",
          "keypress",
          "wheel",
          "touchstart",
          "touchend"
        ];
        for (const ev of events) {
          window.addEventListener(ev, this.boundShieldHandler, { capture: true, passive: false });
        }
      }
      if (!this.shieldEl || !document.body.contains(this.shieldEl)) {
        const shield = document.createElement("div");
        shield.id = "privapilot-execution-shield";
        shield.className = "privapilot-overlay privapilot-shield-root";
        shield.setAttribute("data-privapilot-ignore", "true");
        shield.setAttribute("aria-hidden", "true");
        shield.innerHTML = `
        <div class="privapilot-overlay privapilot-shield-hud" data-privapilot-ignore="true">
          <span class="privapilot-shield-pulse-dot" data-privapilot-ignore="true"></span>
          <span class="privapilot-shield-text" data-privapilot-ignore="true">${label}</span>
          <span class="privapilot-shield-esc-badge" data-privapilot-ignore="true">Esc to Pause</span>
        </div>
      `;
        shield.style.opacity = "0";
        document.body.appendChild(shield);
        void shield.offsetHeight;
        shield.style.opacity = "1";
        this.shieldEl = shield;
      } else {
        this.shieldEl.style.opacity = "1";
        const text = this.shieldEl.querySelector(".privapilot-shield-text");
        if (text) text.textContent = label;
      }
      this.isShieldActive = true;
      this.shieldWatchdogTimer = setTimeout(() => {
        this.disableSafetyShield();
      }, 25e3);
      if (this.shieldWatchdogTimer && typeof this.shieldWatchdogTimer.unref === "function") {
        this.shieldWatchdogTimer.unref();
      }
    }
    /**
     * Disables the safety shield and restores full user mouse and keyboard control.
     */
    disableSafetyShield() {
      if (this.shieldWatchdogTimer) {
        clearTimeout(this.shieldWatchdogTimer);
        this.shieldWatchdogTimer = null;
      }
      if (this.boundShieldHandler) {
        const events = [
          "click",
          "mousedown",
          "mouseup",
          "dblclick",
          "contextmenu",
          "keydown",
          "keypress",
          "wheel",
          "touchstart",
          "touchend"
        ];
        for (const ev of events) {
          window.removeEventListener(ev, this.boundShieldHandler, { capture: true });
        }
        this.boundShieldHandler = null;
      }
      if (this.shieldEl) {
        const el = this.shieldEl;
        el.style.opacity = "0";
        setTimeout(() => {
          if (el.parentNode) {
            el.parentNode.removeChild(el);
          }
          if (this.shieldEl === el) {
            this.shieldEl = null;
          }
        }, 200);
      }
      this.isShieldActive = false;
    }
    isExternalInputLocked() {
      return this.isShieldActive;
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
      if (typeof window !== "undefined" && window.top && window !== window.top) {
        if (message?.type === "EXTRACT_DOM_SNAPSHOT" || message?.type === "EXECUTE_ACTION" || message?.type === "FILL_FORM_FIELDS") {
          return false;
        }
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
      overlay.disableSafetyShield();
      overlay.hideCursor(0);
      return { success: true };
    }
    if (message.type === "EXTRACT_DOM_SNAPSHOT") {
      overlay.hideAgentWorkingGlow();
      const extracted = extractor.extractSnapshot(document);
      const captureId = message.captureId || `cap_${Date.now()}`;
      currentCaptureId = captureId;
      currentElementMap = extracted.elementMap;
      const activeTrapped = capturedDialogs.filter((d) => Date.now() - d.timestamp < 3e4);
      const trappedTitles = activeTrapped.map((d) => `${d.type.toUpperCase()}: ${d.message}`);
      const mergedDialogTitles = [...extracted.snapshot.dialogTitles || [], ...trappedTitles];
      const mergedDialogCount = (extracted.snapshot.visibleDialogCount || 0) + trappedTitles.length;
      const elementsWithAliases = (extracted.snapshot.interactiveElements || []).map((e) => ({
        ...e,
        text: e.text || e.rawName || "",
        sanitizedName: e.sanitizedName || e.rawName || "",
        name: e.name || e.rawName || "",
        rawName: e.rawName || ""
      }));
      const snapshot = {
        ...extracted.snapshot,
        visibleDialogCount: mergedDialogCount,
        dialogTitles: mergedDialogTitles,
        interactiveElements: elementsWithAliases,
        elements: elementsWithAliases
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
      overlay.enableSafetyShield(proposal?.kind ? `PrivaPilot: ${proposal.kind.toUpperCase()}` : "PrivaPilot Automating Page...");
      try {
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
              targetEl.scrollIntoView({ behavior: "auto", block: "nearest", inline: "nearest" });
            } catch (_) {
            }
          }
          overlay.highlightTargetElement(targetEl, proposal.kind.toUpperCase(), 1200);
          await overlay.glideCursorTo(targetEl, proposal.kind.toUpperCase(), proposal.textToType);
        }
        const preSnapshot = SemanticStateVerifier.captureSnapshot(targetEl, document);
        if (proposal.kind === "click" && targetEl) {
          await overlay.animateClickPress();
        } else if (proposal.kind === "drag_and_drop" && targetEl) {
          const destEl = proposal.destinationLocalId ? currentElementMap.get(proposal.destinationLocalId) : null;
          if (destEl) {
            await overlay.animateDrag(targetEl, destEl);
          }
        }
        const preScrollY = window.scrollY || document.documentElement?.scrollTop || document.body?.scrollTop || 0;
        const execResult = ActionExecutor.execute(proposal, currentElementMap);
        if (proposal.kind === "scroll") {
          await new Promise((r) => setTimeout(r, 650));
          const postScrollY = window.scrollY || document.documentElement?.scrollTop || document.body?.scrollTop || 0;
          const reachedBoundary = proposal.scrollDirection === "top" ? postScrollY === 0 : proposal.scrollDirection === "bottom" ? postScrollY >= Math.max(0, document.documentElement.scrollHeight - window.innerHeight - 2) : false;
          if (Math.abs(postScrollY - preScrollY) <= 2 && !reachedBoundary) {
            return {
              success: false,
              actionId: proposal.actionId,
              semanticOutcomeVerified: false,
              staleTarget: false,
              message: `Scroll did not move the page from ${Math.round(preScrollY)}px`,
              reasonCode: "CONDITION_NOT_MET"
            };
          }
        }
        if (targetEl && execResult.success) {
          if (proposal.kind === "type") {
            overlay.triggerTypingBadge();
          }
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
      } finally {
        overlay.disableSafetyShield();
        overlay.hideCursor(15e3);
      }
    }
    if (message.type === "CLEAR_OVERLAYS") {
      overlay.clear();
      overlay.hideAgentWorkingGlow();
      overlay.disableSafetyShield();
      overlay.hideCursor(0);
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
