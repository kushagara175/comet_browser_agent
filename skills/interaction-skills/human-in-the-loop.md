---
name: human-in-the-loop
description: Dynamic human slot filling, CAPTCHA pausing, OTP/MFA input delegation, and execution resumption adapted from Skyvern.
version: 1.0.0
---

# Human-In-The-Loop (HITL) & Slot Filling Skill

## Architectural Concept
Autonomous agents operating on live government portals (e.g. SIH portal, GST, EPFO) or authenticated services frequently encounter barriers that AI should NOT or CANNOT solve autonomously:
1. CAPTCHAs (Cloudflare Turnstile, Google reCAPTCHA, Indian Gov numeric image CAPTCHAs)
2. One-Time Passwords (SMS/Email OTPs)
3. 2FA Authenticator codes or hardware keys
4. Final destructive confirmations (Payment checkout, Account deletion, Final submission)

Rather than failing the task or attempting fragile automated OCR on anti-bot challenges, the `human-in-the-loop` skill gracefully yields control to the human user, preserves complete agent state, and resumes automatically when finished.

---

## 1. Trigger Conditions & Detection
- **CAPTCHA Elements Detected**:
  - `iframe[src*="recaptcha"]`, `iframe[src*="turnstile"]`, `iframe[src*="hcaptcha"]`
  - Images with `id*="captcha"`, `src*="captcha"`, `input[name*="captcha"]`
- **Authentication Barriers**:
  - Inputs with `autocomplete="one-time-code"`, `id*="otp"`, `placeholder*="OTP"`
- **Critical Form Submissions**:
  - Actions containing `proposal.kind === 'request_user_confirmation'`

---

## 2. Execution Flow
1. **Safety Shield Transition**:
   - The global safety shield unlocks external user input.
   - Highlights the CAPTCHA or OTP field with a luminous amber attention pulse (`#f59e0b`).
2. **Sidepanel Notification & Prompting**:
   - Sidepanel displays a high-priority prompt:
     `"⚠️ Please solve the CAPTCHA / enter the OTP on screen, then click Resume."`
   - Shows an active "Resume Automation" button.
3. **Session Preservation**:
   - The background coordinator holds the VLM reasoning trajectory and DOM element mapping in memory.
   - Zero token loss, no restart required.
4. **Resumption & Verification**:
   - When the user clicks "Resume" (or submits the form), the content script re-locks the safety shield, re-evaluates the active DOM snapshot, and proceeds to the next automation step seamlessly.
