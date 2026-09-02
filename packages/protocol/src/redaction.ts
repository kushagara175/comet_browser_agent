/**
 * @privapilot/protocol - The redaction scheme, described once
 *
 * The problem statement requires that the central server "should be aware for this
 * redaction scheme and can process data accordingly". Until now the wire payload
 * carried no redaction information at all: `maskCount` existed on SanitizedContext
 * and was dropped at the network boundary, and the server's system prompt asserted
 * in hardcoded prose that PII "has been blacked out" without ever being told what,
 * how much, or by what convention.
 *
 * Everything the two sides must agree on lives here, so the client stamps the scheme
 * and the server renders its prompt from the same definitions. Neither can drift.
 */

import { SensitiveCategory, RedactionMethod } from './payload.js';

/** Opaque blackout fill drawn over redacted regions. */
export const REDACTION_FILL_COLOR = '#0f172a';

/** Border and label colour drawn on top of the fill. */
export const REDACTION_CHROME_COLOR = '#38bdf8';

/** Label stamped into the image over an opaque-masked region. */
export function redactionImageLabel(category: SensitiveCategory): string {
  return `[REDACTED: ${category.toUpperCase()}]`;
}

/** Label stamped into the image over a pixelated face region. */
export const FACE_IMAGE_LABEL = '[FACE BLUR]';

/**
 * Names substituted for sensitive controls in the element list.
 *
 * The server sees these instead of the real accessible name. They are deliberately
 * category-level: enough to reason about what the control is for, never enough to
 * identify whose it is.
 */
export const SENSITIVE_ELEMENT_PLACEHOLDERS: Readonly<Record<SensitiveCategory, string>> = {
  password: '[PASSWORD FIELD]',
  auth_code: '[OTP FIELD]',
  credit_card: '[PAYMENT FIELD]',
  cvv: '[PAYMENT FIELD]',
  bank_account: '[PAYMENT FIELD]',
  national_id: '[NATIONAL ID FIELD]',
  email: '[EMAIL FIELD]',
  phone: '[PHONE FIELD]',
  token: '[TOKEN/KEY FIELD]',
  date_of_birth: '[SENSITIVE FIELD]',
  address: '[SENSITIVE FIELD]',
  username: '[SENSITIVE FIELD]',
  face: '[SENSITIVE FIELD]',
  high_risk_surface: '[SENSITIVE FIELD]',
  uninspectable: '[SENSITIVE FIELD]'
};

/** The placeholder a sensitive control of this category is presented as. */
export function sensitiveElementPlaceholder(category: SensitiveCategory): string {
  return SENSITIVE_ELEMENT_PLACEHOLDERS[category] || '[SENSITIVE FIELD]';
}

export interface RedactionCategorySummary {
  readonly category: SensitiveCategory;
  readonly count: number;
  readonly method: RedactionMethod;
}

/**
 * What was removed from this payload and how, so the server can interpret the gaps
 * rather than treat them as a broken page.
 *
 * Carries counts and conventions only. It must never carry a value, a label, or a
 * coordinate that could re-identify what was redacted.
 */
export interface RedactionManifest {
  readonly schemeVersion: '1.0';
  /** Categories present in this capture, with how many regions of each. */
  readonly categories: ReadonlyArray<RedactionCategorySummary>;
  readonly totalRegions: number;
  readonly masksRendered: number;
  /** Conventions the server will encounter in the screenshot and element list. */
  readonly conventions: {
    readonly opaqueFillColor: string;
    readonly imageLabelFormat: string;
    readonly faceImageLabel: string;
    readonly elementPlaceholders: ReadonlyArray<string>;
  };
  /** Whether coverage was verified against the output pixels, not just counted. */
  readonly coverage: {
    readonly pixelVerified: boolean;
    readonly regionsAssessed: number;
    readonly regionsUnassessable: number;
  };
  /**
   * Action capabilities withheld from sensitive controls. The server cannot type
   * into a password or payment field because the capability is not offered.
   */
  readonly withheldCapabilities: ReadonlyArray<string>;
}

/**
 * Renders the manifest as instructions for the reasoning model.
 *
 * This is what makes the server prompt *derived* rather than hardcoded prose: the
 * model is told what was actually removed from this specific capture, in the
 * conventions this specific client used, instead of a fixed sentence that was true
 * by assertion.
 */
export function describeRedactionScheme(manifest: RedactionManifest | undefined): string {
  if (!manifest || manifest.totalRegions === 0) {
    return [
      'REDACTION SCHEME',
      'No sensitive regions were detected in this capture, so nothing was masked.',
      'Treat the screenshot and element list as complete.'
    ].join('\n');
  }

  const lines: string[] = ['REDACTION SCHEME'];
  lines.push(
    `This capture was sanitized on the user's device before transmission. ` +
    `${manifest.totalRegions} sensitive region(s) were detected and ${manifest.masksRendered} mask(s) rendered.`
  );

  lines.push('', 'Removed from this capture:');
  for (const c of manifest.categories) {
    const how = c.method === 'gaussian_blur' ? 'pixelated' : 'blacked out';
    lines.push(`- ${c.category} x${c.count} (${how})`);
  }

  lines.push('', 'How to read it:');
  lines.push(
    `- Solid ${manifest.conventions.opaqueFillColor} rectangles in the screenshot are redactions, not page content. ` +
    `Most carry a "${manifest.conventions.imageLabelFormat}" label naming the category.`
  );
  lines.push(`- Pixelated blocks labelled "${manifest.conventions.faceImageLabel}" are human faces.`);
  if (manifest.conventions.elementPlaceholders.length) {
    lines.push(
      `- Element names reading ${manifest.conventions.elementPlaceholders.join(', ')} are redacted controls. ` +
      `The placeholder describes the field's purpose; the real value was never transmitted.`
    );
  }
  if (manifest.withheldCapabilities.length) {
    lines.push(
      `- Sensitive controls have had these capabilities withheld: ${manifest.withheldCapabilities.join(', ')}. ` +
      `Do not propose them for those elements; the user completes those fields directly.`
    );
  }

  lines.push('', 'How to act on it:');
  lines.push('- A redacted region is expected and correct. Never report the page as broken or blank because of one.');
  lines.push('- Never ask the user to reveal a redacted value, and never attempt to infer it.');
  lines.push('- You may still reason about a redacted control\'s ROLE - a masked password field is still the password field.');

  if (!manifest.coverage.pixelVerified) {
    lines.push('- Coverage was not pixel-verified for this capture. Prefer low-risk actions.');
  } else if (manifest.coverage.regionsUnassessable > 0) {
    lines.push(
      `- ${manifest.coverage.regionsUnassessable} region(s) could not be pixel-verified (no detail to assess). ` +
      `Treat them as redacted.`
    );
  }

  return lines.join('\n');
}
