/**
 * @privapilot/test-fixtures - Synthetic HTML Test Fixtures
 *
 * 14 standard test fixtures modeling diverse webpage structures with embedded synthetic PII & canaries.
 */

import { SECRET_CANARY } from './canaries.js';

export interface TestFixture {
  readonly id: string;
  readonly name: string;
  readonly description: string;
  readonly html: string;
  readonly expectedPiiCount: number;
  readonly expectedSafeActionableCount: number;
}

export const TEST_FIXTURES: Record<string, TestFixture> = {
  standardLogin: {
    id: 'standard-login',
    name: 'Standard Login Page',
    description: 'Basic email and password login form with submit button',
    expectedPiiCount: 2,
    expectedSafeActionableCount: 1,
    html: `
      <!DOCTYPE html>
      <html>
      <head><title>Login - Portal</title></head>
      <body>
        <div class="login-card">
          <h2>Sign In</h2>
          <form id="loginForm">
            <label for="emailInput">Email Address</label>
            <input type="email" id="emailInput" name="email" value="alex.tester@enterprise.local" />

            <label for="passwordInput">Password</label>
            <input type="password" id="passwordInput" name="password" value="SuperSecretPassword123!" />

            <button type="submit" id="submitBtn">Sign In</button>
          </form>
        </div>
      </body>
      </html>
    `
  },

  misleadingFieldNames: {
    id: 'misleading-field-names',
    name: 'Misleading Field Names',
    description: 'Inputs named innocuous strings (e.g. query_search) with password type and canary placeholder',
    expectedPiiCount: 2,
    expectedSafeActionableCount: 1,
    html: `
      <!DOCTYPE html>
      <html>
      <head><title>Search Page</title></head>
      <body>
        <div class="container">
          <input type="password" id="query_search" name="search_q" placeholder="Enter query..." value="HiddenPass!99" />
          <input type="text" id="custom_token" name="data_ref" value="${SECRET_CANARY}" />
          <button id="searchBtn">Perform Safe Search</button>
        </div>
      </body>
      </html>
    `
  },

  paymentPortal: {
    id: 'payment-portal',
    name: 'Payment Portal with Luhn Card',
    description: 'Checkout form with Luhn-valid card number, CVV, expiry and billing name',
    expectedPiiCount: 4,
    expectedSafeActionableCount: 1,
    html: `
      <!DOCTYPE html>
      <html>
      <head><title>Secure Checkout</title></head>
      <body>
        <div class="checkout-box">
          <h3>Payment Details</h3>
          <input type="text" id="cardHolder" name="card_name" value="Jane Doe" />
          <input type="text" id="cardNumber" name="card_number" value="4532 0150 1234 5671" autocomplete="cc-number" />
          <input type="text" id="cardExp" name="exp_date" value="12/28" autocomplete="cc-exp" />
          <input type="text" id="cardCvv" name="cvv_code" value="892" autocomplete="cc-csc" />
          <button id="paySubmitBtn">Submit Payment ($49.00)</button>
        </div>
      </body>
      </html>
    `
  },

  profilePii: {
    id: 'profile-pii',
    name: 'Employee Profile with Indian PII',
    description: 'Profile showing Indian Phone, PAN, Aadhaar, DOB, and email',
    expectedPiiCount: 5,
    expectedSafeActionableCount: 2,
    html: `
      <!DOCTYPE html>
      <html>
      <head><title>Staff Profile</title></head>
      <body>
        <div class="profile-card">
          <h2>Rohan Sharma</h2>
          <p>Email: <span>rohan.sharma@isro.gov.in.synthetic</span></p>
          <p>Phone: <span>+91 98765 43210</span></p>
          <p>PAN: <span>ABCDE1234F</span></p>
          <p>Aadhaar: <span>4532 8901 2342</span></p>
          <p>DOB: <span>14-08-1988</span></p>
          <button id="viewRecordsBtn">View Safe Records</button>
          <button id="editProfileBtn">Edit Profile</button>
        </div>
      </body>
      </html>
    `
  },

  faceGallery: {
    id: 'face-gallery',
    name: 'Personnel Photo Gallery',
    description: 'Images containing human faces requiring visual blur',
    expectedPiiCount: 3,
    expectedSafeActionableCount: 1,
    html: `
      <!DOCTYPE html>
      <html>
      <head><title>Team Directory</title></head>
      <body>
        <div class="gallery">
          <img src="data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='100' height='100'><circle cx='50' cy='50' r='40' fill='%23ffcc99'/></svg>" class="face-avatar" alt="Avatar 1" />
          <img src="data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='100' height='100'><circle cx='50' cy='50' r='40' fill='%23ffcc99'/></svg>" class="face-avatar" alt="Avatar 2" />
          <button id="loadMoreBtn">Load More</button>
        </div>
      </body>
      </html>
    `
  },

  imagePii: {
    id: 'image-pii',
    name: 'Image Containing Rendered Text',
    description: 'High-risk image surface that must fail closed with full surface mask',
    expectedPiiCount: 1,
    expectedSafeActionableCount: 1,
    html: `
      <!DOCTYPE html>
      <html>
      <head>
        <title>Scanned Docs</title>
        <style>
          .doc-viewer { padding: 24px; font-family: sans-serif; }
          .scanned-id { width: 480px; height: 260px; display: block; margin-bottom: 16px; border: 1px solid #cbd5e1; border-radius: 4px; }
          button { padding: 8px 16px; cursor: pointer; }
        </style>
      </head>
      <body>
        <div class="doc-viewer">
          <img src="data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='480' height='260' viewBox='0 0 480 260'><rect width='480' height='260' fill='%23f8fafc'/><rect x='20' y='20' width='440' height='50' fill='%23e2e8f0'/><text x='35' y='52' font-family='sans-serif' font-weight='bold' font-size='18' fill='%231e293b'>GOVERNMENT ISSUED IDENTITY CARD</text><text x='35' y='110' font-family='sans-serif' font-size='14' fill='%23334155'>DOCUMENT NO: 4920-8392-1092</text><text x='35' y='140' font-family='sans-serif' font-size='14' fill='%23334155'>FULL NAME: AADITYA VERMA</text><text x='35' y='170' font-family='sans-serif' font-size='14' fill='%23334155'>DATE OF BIRTH: 22-09-1985</text><rect x='340' y='95' width='100' height='120' fill='%2394a3b8'/></svg>" class="scanned-id" alt="Scanned Document with sensitive text" />
          <button id="openSafePreview">Open Safe Preview</button>
        </div>
      </body>
      </html>
    `
  },

  canvasPii: {
    id: 'canvas-pii',
    name: 'Canvas Surface with Graphics',
    description: 'High-risk canvas that must be masked fail-closed',
    expectedPiiCount: 1,
    expectedSafeActionableCount: 1,
    html: `
      <!DOCTYPE html>
      <html>
      <head><title>Telemetry Chart</title></head>
      <body>
        <canvas id="telemetryCanvas" width="400" height="200"></canvas>
        <button id="refreshDataBtn">Refresh Data</button>
      </body>
      </html>
    `
  },

  crossOriginIframe: {
    id: 'cross-origin-iframe',
    name: 'Cross Origin Iframe Placeholder',
    description: 'Uninspectable frame that must be masked fail-closed',
    expectedPiiCount: 1,
    expectedSafeActionableCount: 1,
    html: `
      <!DOCTYPE html>
      <html>
      <head><title>Embedded Portal</title></head>
      <body>
        <iframe src="https://external-untrusted-domain.local/embed" width="500" height="300"></iframe>
        <button id="safeContinueBtn">Continue</button>
      </body>
      </html>
    `
  },

  shadowDom: {
    id: 'shadow-dom',
    name: 'Shadow DOM Web Component',
    description: 'Custom element with shadow root',
    expectedPiiCount: 1,
    expectedSafeActionableCount: 1,
    html: `
      <!DOCTYPE html>
      <html>
      <head><title>Web Component</title></head>
      <body>
        <custom-auth-widget id="authWidget"></custom-auth-widget>
        <button id="nextStepBtn">Next Step</button>
      </body>
      </html>
    `
  },

  controlledReactInput: {
    id: 'controlled-react-input',
    name: 'Controlled Framework Input',
    description: 'Input requiring synthetic React event dispatching',
    expectedPiiCount: 1,
    expectedSafeActionableCount: 1,
    html: `
      <!DOCTYPE html>
      <html>
      <head><title>Search Console</title></head>
      <body>
        <input type="text" id="searchInput" name="q" placeholder="Search mission tickets..." />
        <button id="searchSubmitBtn">Search</button>
      </body>
      </html>
    `
  },

  longScroll: {
    id: 'long-scroll',
    name: 'Long Scroll Page',
    description: 'Page with scroll offsets and multiple sections',
    expectedPiiCount: 2,
    expectedSafeActionableCount: 3,
    html: `
      <!DOCTYPE html>
      <html>
      <head><title>Operations Log</title></head>
      <body style="height: 2500px;">
        <header><button id="topNavBtn">Top Nav</button></header>
        <div style="margin-top: 1200px;">
          <p>Confidential Key: ${SECRET_CANARY}</p>
          <button id="midPageBtn">Middle Action</button>
        </div>
      </body>
      </html>
    `
  },

  darkMode: {
    id: 'dark-mode',
    name: 'Dark Mode Theme',
    description: 'Dark background with light text and sensitive inputs',
    expectedPiiCount: 2,
    expectedSafeActionableCount: 1,
    html: `
      <!DOCTYPE html>
      <html style="background: #121212; color: #ffffff;">
      <head><title>Dark Dashboard</title></head>
      <body>
        <h2>Dark Theme Terminal</h2>
        <input type="password" id="darkSecret" value="HiddenDarkPass" />
        <button id="darkInspectBtn">Safe Inspect</button>
      </body>
      </html>
    `
  },

  modalDialog: {
    id: 'modal-dialog',
    name: 'Modal Dialog Overlay',
    description: 'Flyout dialog with safe close and protected submit',
    expectedPiiCount: 1,
    expectedSafeActionableCount: 2,
    html: `
      <!DOCTYPE html>
      <html>
      <head><title>Request Review</title></head>
      <body>
        <div class="modal" id="reviewModal">
          <h3>Confirm Authorization</h3>
          <p>Token: ${SECRET_CANARY}</p>
          <button id="modalCloseBtn">Cancel</button>
          <button id="modalSubmitBtn">Authorize Transfer</button>
        </div>
      </body>
      </html>
    `
  },

  cookieBanner: {
    id: 'cookie-banner',
    name: 'Cookie Banner Overlay',
    description: 'Non-blocking banner overlay with accept button',
    expectedPiiCount: 0,
    expectedSafeActionableCount: 2,
    html: `
      <!DOCTYPE html>
      <html>
      <head><title>Cookie Notice</title></head>
      <body>
        <div class="cookie-banner">
          <p>We use essential local cookies.</p>
          <button id="acceptCookiesBtn">Accept Cookies</button>
        </div>
        <main>
          <button id="mainActionBtn">Main Feature</button>
        </main>
      </body>
      </html>
    `
  }
};
