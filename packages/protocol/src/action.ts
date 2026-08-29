/**
 * @privapilot/protocol - Action Protocol and Client Safety Policy
 *
 * Rules:
 * - Server proposes one single action at a time.
 * - Server uses local IDs (e.g. "el_4"). NEVER CSS selectors, JS code, or URLs.
 * - Safe actions: auto-executed by client.
 * - Protected actions: require explicit user confirmation card.
 * - Risky/Credential actions: hard-blocked by client.
 */

export type ActionKind =
  | 'observe'
  | 'click'
  | 'type'
  | 'select'
  | 'scroll'
  | 'wait'
  | 'request_user_confirmation'
  | 'finish'
  | 'blocked';

export type RiskLevel = 'safe' | 'protected' | 'blocked';

export interface ActionProposal {
  readonly actionId: string;
  readonly kind: ActionKind;
  readonly targetLocalId?: string;
  readonly confidence: number;
  readonly risk: RiskLevel;
  readonly rationale: string;
  readonly expectedState?: string;
  readonly textToType?: string;
  readonly selectOptionValue?: string;
  readonly scrollDirection?: 'up' | 'down' | 'top' | 'bottom';
}

export interface ActionExecutionResult {
  readonly actionId: string;
  readonly success: boolean;
  readonly timestamp: number;
  readonly message?: string;
  readonly semanticOutcomeVerified: boolean;
}

/**
 * Validates whether an action proposed by the reasoning server is safe to auto-execute.
 */
export function classifyActionRisk(
  proposal: ActionProposal,
  elementName?: string
): RiskLevel {
  const kind = proposal.kind;
  const name = (elementName || '').toLowerCase();

  // Hard blocked categories
  if (
    name.includes('password') ||
    name.includes('otp') ||
    name.includes('captcha') ||
    name.includes('cvv') ||
    name.includes('pin')
  ) {
    return 'blocked';
  }

  // Protected actions requiring human confirmation
  if (
    kind === 'request_user_confirmation' ||
    name.includes('submit') ||
    name.includes('send') ||
    name.includes('publish') ||
    name.includes('delete') ||
    name.includes('remove') ||
    name.includes('pay') ||
    name.includes('purchase') ||
    name.includes('buy') ||
    name.includes('authorize') ||
    name.includes('sign') ||
    name.includes('transfer') ||
    name.includes('confirm order')
  ) {
    return 'protected';
  }

  // Safe reversible actions
  if (
    kind === 'observe' ||
    kind === 'wait' ||
    kind === 'scroll' ||
    kind === 'select' ||
    (kind === 'click' && (name.includes('preview') || name.includes('filter') || name.includes('view') || name.includes('tab') || name.includes('next') || name.includes('search') || name.includes('close') || name.includes('cancel'))) ||
    kind === 'type'
  ) {
    return 'safe';
  }

  return proposal.risk || 'protected';
}
