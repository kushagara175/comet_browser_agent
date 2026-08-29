/**
 * @privapilot/extension - Strict Typed HTTP Reasoning Client
 *
 * Privacy Boundary Enforcement:
 * This client ONLY accepts `SanitizedContext`.
 * It is impossible to pass `RawCapture` to this client.
 */

import { SanitizedContext, SanitizedNetworkPayload, ActionProposal } from '@privapilot/protocol';
import { assertNoCanaryLeak } from '@privapilot/test-fixtures';

export class ReasoningHttpClient {
  private readonly serverBaseUrl: string;

  constructor(serverBaseUrl: string = 'http://localhost:4501') {
    this.serverBaseUrl = serverBaseUrl;
  }

  /**
   * Transmits SanitizedContext to Reasoning Server and returns one ActionProposal.
   */
  async requestReasoningAction(sanitized: SanitizedContext): Promise<ActionProposal> {
    // 1. Prepare Closed Network Payload
    const payload: SanitizedNetworkPayload = {
      protocolVersion: sanitized.protocolVersion,
      runId: sanitized.runId,
      goal: sanitized.goal,
      screenshot: sanitized.sanitizedScreenshotDataUrl,
      elements: sanitized.elements,
      pageState: sanitized.pageState
    };

    // 2. Outgoing Canary Gate check
    assertNoCanaryLeak(payload, 'Outgoing HTTP Payload');

    // 3. Make HTTP request
    const response = await fetch(`${this.serverBaseUrl}/api/v1/reason`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-PrivaPilot-Version': '1.0'
      },
      body: JSON.stringify(payload)
    });

    if (!response.ok) {
      const errText = await response.text();
      throw new Error(`Reasoning Server Error (${response.status}): ${errText}`);
    }

    const action: ActionProposal = await response.json();
    return action;
  }
}
