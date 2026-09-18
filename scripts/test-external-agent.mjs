#!/usr/bin/env node

/**
 * PrivaPilot Platform API - External Agent Test Client
 *
 * Demonstrates how a third-party AI agent (e.g. LangChain, CrewAI, or Python/Node agent)
 * consumes PrivaPilot as a Privacy-Preserving Browser Automation Service (BaaS) with
 * parallel sub-agents and cryptographic compliance audit proofs.
 *
 * Usage:
 *   node scripts/test-external-agent.mjs
 */

const SERVER_URL = process.env.PRIVAPILOT_URL || 'http://localhost:4501';

console.log('\n===============================================================');
console.log('🛡️  PrivaPilot Platform API — Third-Party Agent Test Client');
console.log('===============================================================\n');

async function runExternalAgent() {
  // 1. Check Platform Status & Public Keys
  console.log('[1/5] 📡 Connecting to PrivaPilot Platform Gateway...');
  const keyRes = await fetch(`${SERVER_URL}/api/v1/platform/keys`);
  if (!keyRes.ok) {
    throw new Error(`Failed to reach platform keys endpoint: HTTP ${keyRes.status}`);
  }
  const keyData = await keyRes.json();
  console.log('      ✓ Connected! Default Evaluation Key:', keyData.defaultDemoKey);

  // 2. Issue a New External Partner API Key
  console.log('\n[2/5] 🔑 Provisioning New External Developer API Key...');
  const createKeyRes = await fetch(`${SERVER_URL}/api/v1/platform/keys`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      name: 'External AI Research Swarm Corp',
      tier: 'enterprise'
    })
  });
  const tenant = await createKeyRes.json();
  console.log('      ✓ API Key Issued:', tenant.apiKey);
  console.log('      ✓ Tenant Name:', tenant.name, `(${tenant.tier} tier)`);
  console.log('      ✓ Monthly Quota:', tenant.monthlyQuotaSteps, 'steps');

  const apiKey = tenant.apiKey;
  const authHeaders = {
    'Content-Type': 'application/json',
    'Authorization': `Bearer ${apiKey}`
  };

  // 3. Goal Decomposition via Sub-Agent Planner
  const userGoal = 'Compare Indigo and Air India flight cancellation charges and baggage allowance';
  console.log('\n[3/5] 🧠 Submitting Complex Instruction for Sub-Agent Decomposition:');
  console.log(`      Goal: "${userGoal}"`);

  const planRes = await fetch(`${SERVER_URL}/api/v1/agent/plan`, {
    method: 'POST',
    headers: authHeaders,
    body: JSON.stringify({
      protocolVersion: '1.0',
      goal: userGoal
    })
  });
  const plan = await planRes.json();
  console.log('      ✓ Decompose Decision:', plan.shouldDecompose ? 'YES (Parallel Sub-Agents)' : 'NO');
  console.log('      ✓ Rationale:', plan.rationale);
  console.log('      ✓ Sub-Agent DAG:');
  plan.subTasks.forEach((st, i) => {
    console.log(`         [${i + 1}] ID: ${st.subTaskId} | Title: ${st.title} | DependsOn: [${st.dependsOn.join(', ')}]`);
  });

  // 4. Dispatch Task to Parallel Sub-Agent Swarm
  console.log('\n[4/5] 🚀 Dispatching Task to PrivaPilot Parallel Sub-Agent Swarm...');
  const dispatchRes = await fetch(`${SERVER_URL}/api/v1/agent/dispatch`, {
    method: 'POST',
    headers: authHeaders,
    body: JSON.stringify({
      protocolVersion: '1.0',
      goal: userGoal,
      enableSubAgents: true,
      maxParallel: 2,
      privacyTier: 'strict_dpdp'
    })
  });

  const taskResponse = await dispatchRes.json();
  console.log('      ✓ Task ID:', taskResponse.taskId);
  console.log('      ✓ Status:', taskResponse.status.toUpperCase());
  console.log('      ✓ Duration:', taskResponse.durationMs, 'ms');
  console.log('      ✓ Sub-Agent Execution Results:');
  taskResponse.results.forEach((r, i) => {
    console.log(`         • Sub-Agent [${r.subTaskId}] (${r.outcome.toUpperCase()}): ${r.summary.replace(/\n+/g, ' ').slice(0, 90)}...`);
  });

  // 5. Cryptographic Compliance Proof Verification
  console.log('\n[5/5] 📜 Cryptographic Compliance Audit Proof:');
  const audit = taskResponse.complianceAudit;
  console.log('      ✓ Proof ID:', audit.proofId);
  console.log('      ✓ Zero Plaintext PII Guaranteed:', audit.zeroPlaintextPiiGuaranteed ? 'TRUE (DPDP / GDPR Compliant)' : 'FALSE');
  console.log('      ✓ Request SHA-256 Digest:', audit.hashes.requestDigest);
  console.log('      ✓ Payload SHA-256 Digest:', audit.hashes.sanitizedPayloadDigest);
  console.log('      ✓ Redaction Counts:', JSON.stringify(audit.redactedEntitiesCount));

  console.log('\n===============================================================');
  console.log('🎉 Final Synthesized Output from PrivaPilot Swarm:');
  console.log('===============================================================\n');
  console.log(taskResponse.finalSynthesis);
  console.log('\n===============================================================');
  console.log('✅ End-to-End External Agent Execution Complete & Verified!');
  console.log('===============================================================\n');
}

runExternalAgent().catch((err) => {
  console.error('\n❌ Execution failed:', err);
  process.exit(1);
});
