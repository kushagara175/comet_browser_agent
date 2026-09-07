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
          <img src="data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='100' height='100'><defs><filter id='g'><feTurbulence type='fractalNoise' baseFrequency='0.55' numOctaves='4' seed='11'/></filter><filter id='s'><feTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='3' seed='4'/><feComposite operator='in' in2='SourceGraphic'/></filter></defs><rect width='100' height='100' fill='%23c8b49a'/><rect width='100' height='100' filter='url(%23g)' opacity='0.85'/><circle cx='50' cy='46' r='30' fill='%23ffcc99'/><circle cx='50' cy='46' r='30' filter='url(%23s)' opacity='0.55'/><ellipse cx='39' cy='40' rx='5' ry='3' fill='%23402a1c'/><ellipse cx='61' cy='40' rx='5' ry='3' fill='%23402a1c'/><path d='M38 60 Q50 69 62 60' stroke='%23703d2a' stroke-width='3' fill='none'/><path d='M22 34 Q50 6 78 34' stroke='%233a2416' stroke-width='9' fill='none'/></svg>" class="face-avatar" alt="Avatar 1" />
          <img src="data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='100' height='100'><defs><filter id='g2'><feTurbulence type='fractalNoise' baseFrequency='0.62' numOctaves='4' seed='23'/></filter><filter id='s2'><feTurbulence type='fractalNoise' baseFrequency='1.1' numOctaves='3' seed='9'/><feComposite operator='in' in2='SourceGraphic'/></filter></defs><rect width='100' height='100' fill='%23a9b6c4'/><rect width='100' height='100' filter='url(%23g2)' opacity='0.85'/><circle cx='50' cy='48' r='29' fill='%23e8b487'/><circle cx='50' cy='48' r='29' filter='url(%23s2)' opacity='0.55'/><ellipse cx='40' cy='43' rx='4' ry='3' fill='%232e1f14'/><ellipse cx='60' cy='43' rx='4' ry='3' fill='%232e1f14'/><path d='M40 62 Q50 70 60 62' stroke='%23824a33' stroke-width='3' fill='none'/><path d='M24 37 Q50 10 76 37' stroke='%23241a12' stroke-width='8' fill='none'/></svg>" class="face-avatar" alt="Avatar 2" />
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
      <head><title>Scanned Docs</title></head>
      <body>
        <div class="doc-viewer">
          <img src="data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='420' height='260'><defs><filter id='p'><feTurbulence type='fractalNoise' baseFrequency='0.8' numOctaves='3' seed='17'/><feColorMatrix values='0 0 0 0 0.86 0 0 0 0 0.84 0 0 0 0 0.78 0 0 0 0.35 0'/></filter></defs><rect width='420' height='260' fill='%23f4f1e8'/><rect width='420' height='260' filter='url(%23p)'/><text x='20' y='40' font-family='monospace' font-size='19' fill='%23142033'>GOVERNMENT OF INDIA</text><text x='20' y='86' font-family='monospace' font-size='23' fill='%23142033'>4213 8890 1276</text><text x='20' y='126' font-family='monospace' font-size='17' fill='%23142033'>DOB: 04/11/1988</text><text x='20' y='164' font-family='monospace' font-size='17' fill='%23142033'>R. NARAYANAN</text><text x='20' y='202' font-family='monospace' font-size='15' fill='%23142033'>ISSUED: BENGALURU</text><rect x='300' y='60' width='96' height='120' fill='%23cdbfa6'/><rect x='300' y='60' width='96' height='120' filter='url(%23p)'/></svg>" class="scanned-id" alt="Scanned identity document with sensitive text" width="420" height="260" />
          <button id="openSafePreview">Open Safe Preview</button>
        </div>
      </body>
      </html>
    `
  },

  canvasApp: {
    id: 'canvas-app',
    name: 'Canvas-Only Application Surface',
    description: 'An entire UI painted into a canvas. No DOM element describes any control, so DOM parsing is blind and only vision can read it.',
    expectedPiiCount: 1,
    expectedSafeActionableCount: 0,
    html: `
      <!DOCTYPE html>
      <html>
      <head><title>Station Console</title></head>
      <body style="margin:0;background:#ffffff">
        <canvas id="appSurface" width="900" height="520"></canvas>
        <script>
          // The whole interface is drawn as pixels. There is deliberately no DOM
          // structure to parse: this is the surface the problem statement's local
          // vision model exists for.
          var c = document.getElementById('appSurface');
          var g = c.getContext('2d');
          g.fillStyle = '#f8fafc'; g.fillRect(0, 0, 900, 520);

          g.fillStyle = '#0f172a'; g.font = 'bold 26px sans-serif';
          g.fillText('Ground Station Console', 40, 56);

          g.fillStyle = '#475569'; g.font = '15px sans-serif';
          g.fillText('Pass window opens in 14 minutes. Telemetry nominal across all subsystems.', 40, 92);

          // A text input, painted
          g.fillStyle = '#ffffff'; g.fillRect(40, 130, 300, 42);
          g.strokeStyle = '#94a3b8'; g.lineWidth = 1; g.strokeRect(40, 130, 300, 42);
          g.fillStyle = '#1f2937'; g.font = '15px sans-serif';
          g.fillText('bengaluru-01', 54, 157);

          // Two buttons, painted
          g.fillStyle = '#2563eb'; g.fillRect(40, 196, 168, 46);
          g.fillStyle = '#ffffff'; g.font = 'bold 15px sans-serif';
          g.fillText('Schedule Pass', 60, 225);

          g.fillStyle = '#f1f5f9'; g.fillRect(224, 196, 120, 46);
          g.strokeStyle = '#cbd5e1'; g.strokeRect(224, 196, 120, 46);
          g.fillStyle = '#0f172a'; g.font = '15px sans-serif';
          g.fillText('Cancel', 258, 225);

          // A chart, painted
          g.strokeStyle = '#94a3b8'; g.beginPath();
          g.moveTo(430, 420); g.lineTo(860, 420); g.stroke();
          g.strokeStyle = '#059669'; g.lineWidth = 3; g.beginPath();
          g.moveTo(440, 380); g.lineTo(510, 300); g.lineTo(580, 330);
          g.lineTo(650, 210); g.lineTo(720, 260); g.lineTo(790, 160);
          g.stroke();
          g.fillStyle = '#334155'; g.font = '13px sans-serif';
          g.fillText('Downlink throughput (Mbps)', 440, 450);

          // Sensitive text rendered as pixels only - invisible to every DOM rule
          g.fillStyle = '#0f172a'; g.font = '15px monospace';
          g.fillText('Operator PAN: ABCDE1234F', 40, 300);
        <\/script>
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
  },

  canvasForm: {
    id: 'canvas-form',
    name: 'Canvas 2D Interactive Form',
    description: 'Interactive form controls (input box, submit button) rendered into <canvas>. Vision discovers and classifies controls; DOM sees zero elements.',
    expectedPiiCount: 0,
    expectedSafeActionableCount: 2,
    html: `
      <!DOCTYPE html>
      <html>
      <head><title>Canvas Authentication</title></head>
      <body>
        <div class="canvas-wrapper">
          <canvas id="authCanvas" width="600" height="400" data-surface-type="canvas">
            Canvas Form
          </canvas>
        </div>
      </body>
      </html>
    `
  },

  imageIdentifier: {
    id: 'image-identifier',
    name: 'Image Identifier Security Badge',
    description: 'Security/auth badge concept icon baked into an <img>. Vision embeds the region and classifies it against concept prototypes; DOM sees only an opaque <img>.',
    expectedPiiCount: 0,
    expectedSafeActionableCount: 1,
    html: `
      <!DOCTYPE html>
      <html>
      <head><title>Badge Verification</title></head>
      <body>
        <div class="badge-card">
          <h2>Authorization Seal</h2>
          <img id="secSeal" src="data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='140' height='140'><circle cx='70' cy='70' r='60' fill='%231e40af'/><text x='70' y='75' font-size='16' text-anchor='middle' fill='white'>SECURITY-BADGE</text></svg>" alt="Security Seal" width="140" height="140" data-concept-hint="auth_badge" />
          <p>Verified Operator Clearance</p>
        </div>
      </body>
      </html>
    `
  }
};

