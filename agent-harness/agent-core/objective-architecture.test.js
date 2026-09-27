import test from 'node:test';
import assert from 'node:assert/strict';

import {
  createInitialObjectiveProgress,
  getCurrentObjective,
  recordObjectiveEvidence,
  completeObjectiveWithEvidence,
  canFinishTask,
  toSanitizedNetworkPayload,
  validateActionProposal
} from '../../packages/protocol/dist/index.js';
import { validateSanitizedPayload } from '../../apps/server/dist/schemas/payload-validator.js';
import { SubAgentOrchestrator } from '../../apps/server/dist/engines/subagent-orchestrator.js';

const objective = (id, sequence, intent, description, dependsOn) => ({
  id,
  sequence,
  intent,
  description,
  expectedEvidence: ['verified semantic outcome'],
  status: sequence === 1 ? 'active' : 'pending',
  ...(dependsOn ? { dependsOn } : {})
});

const specification = {
  goal: 'Search for quantum computing and summarize it',
  extractedSearchQuery: 'quantum computing',
  objectives: [
    objective('objective_search', 1, 'search', 'Search for quantum computing'),
    objective('objective_extract', 2, 'extract', 'Extract relevant content', ['objective_search']),
    objective('objective_summarize', 3, 'summarize', 'Summarize grounded content', ['objective_extract'])
  ],
  tasksToDo: ['Search', 'Extract', 'Summarize'],
  tasksNotToDo: ['Do not use unrelated links'],
  successCriteria: 'All objectives have verified evidence.'
};

const context = {
  _brand: 'SanitizedContext_Verified',
  protocolVersion: '1.0',
  runId: 'run_objectives',
  captureId: 'capture_1',
  goal: specification.goal,
  sanitizedScreenshotDataUrl: 'data:image/png;base64,AA==',
  elements: [],
  pageState: { title: 'Example', viewport: [1280, 800], url: 'https://example.com' },
  maskCount: 0,
  payloadDigestSha256: 'abc',
  timestamp: Date.now()
};

test('planner generates ordered typed objectives with stable dependencies', async () => {
  const planner = new SubAgentOrchestrator();
  const spec = await planner.planTaskSpecification('Go to wikipedia.org, search for "Quantum Computing", and summarize the key differences');
  assert.ok(spec.objectives.length >= 3);
  assert.equal(spec.objectives[0].status, 'active');
  assert.equal(spec.tasksToDo.length, spec.objectives.length);
  for (let i = 1; i < spec.objectives.length; i++) {
    assert.deepEqual(spec.objectives[i].dependsOn, [spec.objectives[i - 1].id]);
  }
});

test('objective completion requires verified evidence and advances dependencies', () => {
  let progress = createInitialObjectiveProgress(specification);
  assert.equal(getCurrentObjective(specification, progress).id, 'objective_search');
  assert.equal(completeObjectiveWithEvidence(specification, progress, 'objective_search'), progress);

  progress = recordObjectiveEvidence(progress, {
    objectiveId: 'objective_search',
    kind: 'input_value',
    summary: 'Search query entered and results became visible',
    sourceActionId: 'act_search',
    verified: true
  });
  progress = completeObjectiveWithEvidence(specification, progress, 'objective_search');
  assert.deepEqual(progress.completedObjectiveIds, ['objective_search']);
  assert.equal(progress.currentObjectiveId, 'objective_extract');
  assert.equal(canFinishTask(specification, progress).satisfied, false);
});

test('finish gate accepts only fully evidenced objectives', () => {
  let progress = createInitialObjectiveProgress(specification);
  for (const item of specification.objectives) {
    progress = recordObjectiveEvidence(progress, {
      objectiveId: item.id,
      kind: 'text',
      summary: `Verified ${item.description}`,
      verified: true
    });
    progress = completeObjectiveWithEvidence(specification, progress, item.id);
  }
  assert.deepEqual(canFinishTask(specification, progress), {
    satisfied: true,
    reason: 'All objectives have verified completion evidence'
  });
});

test('reasoning payload serializes objective contract and passes closed schema', () => {
  const progress = createInitialObjectiveProgress(specification);
  const payload = toSanitizedNetworkPayload({
    ...context,
    taskSpecification: specification,
    objectiveProgress: progress,
    currentObjective: specification.objectives[0],
    previousAction: { actionId: 'act_1', objectiveId: 'objective_search', kind: 'type', targetLocalId: 'el_1', targetName: 'Search' },
    expectedPostcondition: { kind: 'search_results_visible', queryPattern: 'quantum' },
    observedOutcome: 'Search results became visible',
    meaningfulProgress: true,
    recentActionHistory: [{ actionId: 'act_1', objectiveId: 'objective_search', kind: 'type', targetLocalId: 'el_1', meaningfulProgress: true }]
  });
  assert.equal(payload.taskSpecification.objectives[0].id, 'objective_search');
  assert.equal(validateSanitizedPayload(payload).isValid, true);

  const polluted = structuredClone(payload);
  polluted.objectiveProgress.evidence = [{ objectiveId: 'objective_search', kind: 'text', summary: 'safe', verified: true, unknown: true }];
  assert.equal(validateSanitizedPayload(polluted).isValid, false);
});

test('action proposal supports objective binding and new closed postconditions', () => {
  const valid = validateActionProposal({
    actionId: 'act_layers',
    objectiveId: 'objective_inspect',
    kind: 'click',
    targetLocalId: 'el_12',
    targetName: 'Map Layers',
    semanticMatchReason: 'The visible enabled Layers button matches the inspection objective.',
    expectedPostcondition: { kind: 'panel_visible', namePattern: 'layers|thematic' },
    fallbackStrategy: 'reperceive',
    completionEvidence: ['dialog', 'element'],
    confidence: 0.96,
    risk: 'safe',
    rationale: 'Open the map layers panel.'
  }, [{ localId: 'el_12', role: 'button', sanitizedName: 'Map Layers', coarseBounds: [0, 0, 0.1, 0.1], state: ['enabled', 'visible'], actionCapabilities: ['click'] }]);
  assert.equal(valid.isValid, true);

  const extraNestedKey = validateActionProposal({
    actionId: 'act_bad', kind: 'wait', confidence: 1, risk: 'safe', rationale: 'wait',
    expectedPostcondition: { kind: 'visual_change', minimumChangeRatio: 0.1, selector: '#unsafe' }
  });
  assert.equal(extraNestedKey.isValid, false);
});
