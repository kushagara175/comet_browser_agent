/**
 * @privapilot/extension - Strict Typed HTTP Reasoning Client
 *
 * Privacy Boundary Enforcement:
 * This client ONLY accepts `SanitizedContext`.
 * It is impossible to pass `RawCapture` to this client.
 */

import {
  SanitizedContext,
  SanitizedNetworkPayload,
  SanitizedChatPayload,
  GeneralChatPayload,
  ActionProposal,
  validateActionProposal
} from '@privapilot/protocol';
import { assertNoCanaryLeak } from '@privapilot/test-fixtures';

export class ReasoningHttpClient {
  private readonly serverBaseUrl: string;

  constructor(serverBaseUrl: string = 'http://localhost:4501') {
    this.serverBaseUrl = serverBaseUrl;
  }

  /**
   * Bounded fetch helper wrapping AbortController with deterministic timeouts.
   */
  private async fetchWithTimeout(
    url: string,
    init: RequestInit,
    operation: string,
    timeoutMs: number = 15000
  ): Promise<Response> {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), timeoutMs);

    try {
      return await fetch(url, {
        ...init,
        signal: controller.signal
      });
    } catch (error: any) {
      if (controller.signal.aborted) {
        throw new Error(`${operation} timed out after ${timeoutMs}ms`);
      }
      throw error;
    } finally {
      clearTimeout(timeout);
    }
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

    // 3. Make HTTP request with 15s bounded timeout
    const response = await this.fetchWithTimeout(
      `${this.serverBaseUrl}/api/v1/reason`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-PrivaPilot-Version': '1.0'
        },
        body: JSON.stringify(payload)
      },
      'Reasoning request',
      15000
    );

    if (!response.ok) {
      const errText = await response.text();
      throw new Error(`Reasoning Server Error (${response.status}): ${errText}`);
    }

    const actionRaw: any = await response.json();

    // 4. Zero-Trust Client-Side Validation: Never trust server output blindly
    const validation = validateActionProposal(actionRaw, sanitized.elements);
    if (!validation.isValid || !validation.proposal) {
      throw new Error(`Reasoning Server Response Invalid: ${validation.errorMessage || 'Invalid action proposal'}`);
    }

    return validation.proposal;
  }

  /**
   * Transmits sanitized page-aware context projection to Chat endpoint.
   * Strictly accepts SanitizedContext only (never raw captures or URLs).
   */
  async requestChat(sanitized: SanitizedContext, message: string): Promise<{ reply: string }> {
    const payload: SanitizedChatPayload = {
      _brand: 'SanitizedChatPayload_Verified',
      protocolVersion: '1.0',
      message,
      elements: sanitized.elements,
      sanitizedTitle: sanitized.pageState.title,
      maskCount: sanitized.maskCount
    };

    assertNoCanaryLeak(payload, 'Outgoing Chat Payload');

    const response = await this.fetchWithTimeout(
      `${this.serverBaseUrl}/api/v1/chat`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-PrivaPilot-Version': '1.0'
        },
        body: JSON.stringify({
          protocolVersion: payload.protocolVersion,
          message: payload.message,
          elements: payload.elements,
          sanitizedTitle: payload.sanitizedTitle,
          maskCount: payload.maskCount
        })
      },
      'Chat request',
      15000
    );

    if (!response.ok) {
      const errText = await response.text();
      throw new Error(`Chat Server Error (${response.status}): ${errText}`);
    }

    return await response.json();
  }

  /**
   * Transmits contextless general query (zero page or browser state).
   */
  async requestGeneralChat(message: string): Promise<{ reply: string }> {
    const payload: GeneralChatPayload = {
      protocolVersion: '1.0',
      message
    };

    const response = await this.fetchWithTimeout(
      `${this.serverBaseUrl}/api/v1/chat`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-PrivaPilot-Version': '1.0'
        },
        body: JSON.stringify(payload)
      },
      'General chat request',
      15000
    );

    if (!response.ok) {
      const errText = await response.text();
      throw new Error(`Chat Server Error (${response.status}): ${errText}`);
    }

    return await response.json();
  }
}

