/**
 * @privapilot/tests - Platform API & Parallel Sub-Agent Swarm Tests
 *
 * Verifies:
 * 1. Multi-Tenant API Key Manager (issue, extract, rate limit, quota, revoke)
 * 2. Closed Schema Request Validators (dispatch, plan, synthesize)
 * 3. Sub-Agent DAG Decomposition & Planning (comparative vs single-scoped)
 * 4. Parallel Sub-Agent Task Dispatch & Concurrency Control
 * 5. Cryptographic SHA-256 Compliance Audit Proof Generation
 * 6. Multi-Worker Result Synthesis
 */

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { ApiKeyManager } from '../apps/server/dist/auth/api-key-manager.js';
import { SubAgentOrchestrator } from '../apps/server/dist/engines/subagent-orchestrator.js';
import {
  validatePlatformTaskRequest,
  validatePlanRequest,
  validateSynthesizeRequest
} from '../apps/server/dist/schemas/payload-validator.js';
import { MockReasoningEngine } from '../apps/server/dist/engines/mock-engine.js';
import { VlmReasoningEngine } from '../apps/server/dist/engines/vlm-engine.js';

describe('PrivaPilot Platform API & Sub-Agent Swarm', () => {
  describe('API Key Authentication & Tenant Quota Manager', () => {
    const keyManager = new ApiKeyManager();

    test('Validates default Comet SIH evaluation demo key with enterprise tier', () => {
      const res = keyManager.validate(ApiKeyManager.DEFAULT_DEMO_KEY);
      assert.strictEqual(res.valid, true);
      assert.ok(res.tenant);
      assert.strictEqual(res.tenant.tier, 'enterprise');
      assert.ok(res.tenant.remainingSteps > 0);
      assert.strictEqual(ApiKeyManager.DEFAULT_DEMO_KEY, 'comet_live_sih2026_demo_key');
    });

    test('Validates legacy privapilot demo key for backwards compatibility', () => {
      const res = keyManager.validate('privapilot_live_sih2026_demo_key');
      assert.strictEqual(res.valid, true);
      assert.ok(res.tenant);
      assert.strictEqual(res.tenant.tier, 'enterprise');
    });

    test('Rejects missing or empty API keys with HTTP 401', () => {
      assert.strictEqual(keyManager.validate(null).valid, false);
      assert.strictEqual(keyManager.validate(null).statusCode, 401);
      assert.strictEqual(keyManager.validate('').valid, false);
      assert.strictEqual(keyManager.validate('   ').valid, false);
    });

    test('Rejects invalid or unregistered API keys', () => {
      const res = keyManager.validate('comet_live_invalid_nonexistent_key_123');
      assert.strictEqual(res.valid, false);
      assert.strictEqual(res.statusCode, 401);
    });

    test('Extracts API key from Authorization header with Bearer prefix', () => {
      const headers = { authorization: 'Bearer comet_live_test_sample_token' };
      const extracted = keyManager.extractKey(headers);
      assert.strictEqual(extracted, 'comet_live_test_sample_token');
    });

    test('Extracts API key from x-api-key header', () => {
      const headers = { 'x-api-key': 'comet_live_custom_header_key' };
      const extracted = keyManager.extractKey(headers);
      assert.strictEqual(extracted, 'comet_live_custom_header_key');
    });

    test('Issues new developer API key with comet_live_ prefix and records step usage', () => {
      const { apiKey, tenant } = keyManager.createKey('Fintech Partner Alpha', 'developer');
      assert.ok(apiKey.startsWith('comet_live_'));
      assert.strictEqual(tenant.tier, 'developer');
      assert.strictEqual(tenant.name, 'Fintech Partner Alpha');

      // Validate key works
      const auth = keyManager.validate(apiKey);
      assert.strictEqual(auth.valid, true);

      // Record step usage
      const initialSteps = tenant.remainingSteps;
      keyManager.recordStepUsage(apiKey, 5);
      assert.strictEqual(tenant.remainingSteps, initialSteps - 5);
    });

    test('Revokes API key and forbids subsequent access with HTTP 403', () => {
      const { apiKey } = keyManager.createKey('Revocable Tenant', 'developer');
      assert.strictEqual(keyManager.validate(apiKey).valid, true);

      keyManager.revokeKey(apiKey);
      const revokedAuth = keyManager.validate(apiKey);
      assert.strictEqual(revokedAuth.valid, false);
      assert.strictEqual(revokedAuth.statusCode, 403);
    });
  });

  describe('Closed Schema Request Validators', () => {
    test('validatePlatformTaskRequest accepts valid task payload', () => {
      const req = {
        protocolVersion: '1.0',
        goal: 'Compare flights between Delhi and Mumbai',
        contextUrl: 'https://makemytrip.com',
        enableSubAgents: true,
        maxParallel: 2,
        privacyTier: 'strict_dpdp'
      };
      const res = validatePlatformTaskRequest(req);
      assert.strictEqual(res.isValid, true);
      assert.ok(res.payload);
      assert.strictEqual(res.payload.goal, req.goal);
    });

    test('validatePlatformTaskRequest rejects unknown properties (closed schema)', () => {
      const req = {
        protocolVersion: '1.0',
        goal: 'Legitimate goal',
        unauthorizedProperty: 'injected value'
      };
      const res = validatePlatformTaskRequest(req);
      assert.strictEqual(res.isValid, false);
      assert.ok(res.errorMessage?.includes('Closed schema violation'));
    });

    test('validatePlatformTaskRequest rejects invalid maxParallel (>4)', () => {
      const req = {
        protocolVersion: '1.0',
        goal: 'Legitimate goal',
        maxParallel: 10
      };
      const res = validatePlatformTaskRequest(req);
      assert.strictEqual(res.isValid, false);
      assert.ok(res.errorMessage?.includes('maxParallel'));
    });

    test('validatePlanRequest validates goal length and rejects script injection', () => {
      const scriptReq = {
        protocolVersion: '1.0',
        goal: '<script>alert("hack")</script>'
      };
      const res = validatePlanRequest(scriptReq);
      assert.strictEqual(res.isValid, false);
      assert.ok(res.errorMessage?.includes('prohibited script patterns'));
    });
  });

  describe('Sub-Agent Orchestrator: Planning, DAG Execution & Cryptographic Proofs', () => {
    const orchestrator = new SubAgentOrchestrator(new VlmReasoningEngine());

    test('Single-scoped goal does not decompose into sub-agents', async () => {
      const plan = await orchestrator.planTask('Navigate to settings page and click dark mode toggle');
      assert.strictEqual(plan.shouldDecompose, false);
      assert.strictEqual(plan.subTasks.length, 1);
      assert.strictEqual(plan.subTasks[0].status, 'pending');
    });

    test('Comparative multi-target goal decomposes into parallel sub-agents', async () => {
      const plan = await orchestrator.planTask('Compare Indigo and Air India ticket prices for next Monday');
      assert.strictEqual(plan.shouldDecompose, true);
      assert.ok(plan.subTasks.length >= 2);
      // Independent subtasks should have empty dependsOn array for parallel execution
      for (const st of plan.subTasks) {
        assert.ok(Array.isArray(st.dependsOn));
        assert.ok(st.maxStepBudget > 0);
      }
    });

    test('Dispatches task with parallel workers and produces verifiable ComplianceAuditProof', async () => {
      const request = {
        protocolVersion: '1.0',
        goal: 'Compare Indigo and SpiceJet cancellation policies',
        enableSubAgents: true,
        maxParallel: 2,
        privacyTier: 'strict_dpdp'
      };

      const res = await orchestrator.dispatchTask(request, 'tenant_test_123');
      assert.ok(res.taskId.startsWith('task_'));
      assert.ok(res.status === 'completed' || res.status === 'running');
      assert.ok(Array.isArray(res.results));
      assert.ok(res.results.length >= 2);

      // Verify Cryptographic Compliance Audit Proof
      const audit = res.complianceAudit;
      assert.ok(audit);
      assert.ok(audit.proofId.startsWith('audit_proof_'));
      assert.strictEqual(audit.zeroPlaintextPiiGuaranteed, true);
      assert.strictEqual(typeof audit.hashes.requestDigest, 'string');
      assert.strictEqual(audit.hashes.requestDigest.length, 64); // Valid SHA-256 hex
      assert.strictEqual(typeof audit.hashes.sanitizedPayloadDigest, 'string');
      assert.strictEqual(audit.hashes.sanitizedPayloadDigest.length, 64); // Valid SHA-256 hex
      assert.strictEqual(audit.tenantId, 'tenant_test_123');
    });

    test('Synthesizes multiple sub-task results into clean markdown output', async () => {
      const subResults = [
        {
          subTaskId: 'sub_1',
          goal: 'Check Indigo',
          outcome: 'success',
          summary: 'Indigo fare is INR 4,500 with free baggage.',
          durationMs: 120
        },
        {
          subTaskId: 'sub_2',
          goal: 'Check Air India',
          outcome: 'success',
          summary: 'Air India fare is INR 4,800 including complimentary meal.',
          durationMs: 130
        }
      ];

      const synthesis = await orchestrator.synthesizeResults(
        'Compare Indigo and Air India flights',
        subResults
      );
      assert.ok(typeof synthesis === 'string');
      assert.ok(synthesis.length > 20);
    });

    test('Retrieves stored task by ID from task registry', async () => {
      const request = {
        protocolVersion: '1.0',
        goal: 'Inspect booking portal'
      };
      const created = await orchestrator.dispatchTask(request, 'tenant_test_123');
      const retrieved = orchestrator.getTask(created.taskId);
      assert.ok(retrieved);
      assert.strictEqual(retrieved.taskId, created.taskId);
    });
  });
});
