
Project root:
SIH_26209

Primary goal:
Make the browser agent reliable, fast, evidence-driven, and website-agnostic. Do not solve this by adding more Wikipedia/Bhuvan-specific regex hacks. Domain playbooks may remain as optional fast paths, but the core architecture must work across arbitrary websites.

Important:
- Inspect the existing code before modifying it.
- Preserve privacy boundaries and closed-schema validation.
- Keep all raw DOM and screenshots local until sanitized.
- Do not weaken security validation.
- Do not claim success without running validation.
- Implement the changes, tests, and build artifacts—not only a design document.
- Keep going until the implementation is complete.

Current architecture:
- `apps/extension/src/background/coordinator.ts`
  Main planner/executor/verifier loop.
- `apps/extension/src/background/http-client.ts`
  Sends sanitized reasoning payloads.
- `apps/extension/src/content/content-main.ts`
  Executes browser actions.
- `apps/extension/src/content/action-executor.ts`
  Implements browser actions.
- `apps/extension/src/content/verifier.ts`
  Verifies postconditions.
- `apps/extension/src/browser/browser-adapter.ts`
  Browser API and offscreen lifecycle.
- `apps/server/src/engines/vlm-engine.ts`
  Builds the LLM system/user prompts and parses decisions.
- `apps/server/src/engines/subagent-orchestrator.ts`
  Produces task specifications.
- `apps/server/src/schemas/payload-validator.ts`
  Enforces closed request schemas.
- `packages/protocol/src/action.ts`
  Action, task, and execution contracts.
- `packages/protocol/src/payload.ts`
  Sanitized network payload contracts.
- `packages/protocol/src/grounding.ts`
  Semantic grounding.
- `packages/protocol/src/domain-playbooks.ts`
  Optional deterministic domain playbooks.

Known architectural problems:
1. `TaskSpecification` is generated once but is not sent with every `/api/v1/reason` request.
2. `tasksToDo` is an array of prose strings instead of executable objectives.
3. Objective completion is guessed using `tasksToDo.slice(0, step)`.
4. One action is incorrectly assumed to complete one task.
5. The LLM does not receive a reliable current-objective contract.
6. The LLM can return a valid target ID that refers to the wrong semantic element.
7. Expected postconditions are often generic or incorrect.
8. Canvas/WebGL/map controls may update visual state without normal DOM mutations.
9. Repeated-action detection compares action shape without always considering page progress.
10. The agent calls the LLM for mechanical actions that can be handled locally.
11. The agent can prematurely finish after an intermediate action.
12. The agent does not maintain a structured evidence ledger.
13. Recovery behavior is scattered instead of modeled explicitly.
14. Full screenshots and full context may be transmitted on every step even when only a small state delta changed.
15. The planner and executor do not share a stable objective identifier.

Implement the following architecture.

1. Structured objective contract

Replace or extend the current prose-only task specification with typed objectives.

Add protocol types similar to:

type ObjectiveStatus =
  | 'pending'
  | 'active'
  | 'completed'
  | 'blocked'
  | 'failed';

interface TaskObjective {
  id: string;
  sequence: number;
  intent:
    | 'navigate'
    | 'search'
    | 'select_result'
    | 'open_section'
    | 'inspect'
    | 'extract'
    | 'compare'
    | 'summarize'
    | 'fill'
    | 'submit'
    | 'download'
    | 'verify';
  description: string;
  targetPhrase?: string;
  extractedValue?: string;
  expectedEvidence: string[];
  status: ObjectiveStatus;
  dependsOn?: string[];
}

interface TaskSpecification {
  goal: string;
  extractedSearchQuery?: string;
  objectives: TaskObjective[];
  tasksNotToDo: string[];
  successCriteria: string;
  requiresSubAgents?: boolean;
  subAgentTasks?: ...;
}

Keep `tasksToDo` temporarily if required for backward compatibility, but make `objectives` authoritative.

2. Objective progress state

Add a structured execution state sent to the reasoning server on every step:

interface ObjectiveProgress {
  currentObjectiveId?: string;
  completedObjectiveIds: string[];
  blockedObjectiveIds: string[];
  attemptCountByObjective: Record<string, number>;
  evidence: Array<{
    objectiveId: string;
    kind:
      | 'url'
      | 'element'
      | 'text'
      | 'input_value'
      | 'dialog'
      | 'attribute'
      | 'scroll'
      | 'visual_change';
    summary: string;
    sourceActionId?: string;
    verified: boolean;
  }>;
}

Do not mark objectives completed based on step index.
Remove logic equivalent to:

tasksToDo.slice(0, step)

Only mark an objective complete when its expected evidence has been verified.

3. Reasoning payload

Extend `SanitizedContext` and `SanitizedNetworkPayload` to carry:

- `taskSpecification`
- `objectiveProgress`
- current objective
- previous action
- expected postcondition
- observed outcome
- whether meaningful progress occurred
- bounded recent action history

Update:
- protocol types
- `toSanitizedNetworkPayload`
- HTTP client
- server closed-schema validator
- VLM prompt builder
- tests

Ensure the payload remains sanitized and closed-schema validated.

4. Stronger action proposal contract

Extend `ActionProposal` with:

- `objectiveId`
- `targetName`
- `semanticMatchReason`
- `expectedPostcondition`
- `fallbackStrategy`
- `completionEvidence`

Example:

{
  "actionId": "act_4",
  "objectiveId": "objective_inspect_layers",
  "kind": "click",
  "targetLocalId": "el_12",
  "targetName": "Map Layers",
  "semanticMatchReason": "The target label and nearby context match the active layer-inspection objective.",
  "expectedPostcondition": {
    "kind": "panel_visible",
    "namePattern": "layers|thematic|data"
  },
  "fallbackStrategy": "reperceive",
  "confidence": 0.96,
  "risk": "safe",
  "rationale": "Open the map layers panel."
}

Extend the closed schema and validators accordingly.

5. Postcondition model

Add explicit postcondition types for:

- `panel_visible`
- `element_visible`
- `element_count_changed`
- `visual_change`
- `map_location_changed`
- `search_results_visible`
- `content_visible`
- existing URL, dialog, attribute, value, select, status, scroll checks

Verification must be action-specific:

- navigation → URL or page identity changed
- typing → input value matches
- search submit → results or URL changed
- click panel control → panel, controls, or expanded state appears
- scroll → scroll position changed in requested direction
- map search → URL coordinates, marker state, label, or map-center evidence changes
- extraction → requested entities are present in observed text
- finish → every required objective has verified evidence

For canvas/WebGL applications, support visual-change evidence plus surrounding DOM/control changes. Do not accept arbitrary DOM mutation as sufficient evidence for every action.

6. Semantic target validation

Before executing `click`, `type`, `select`, `hover`, or drag actions:

- Confirm `targetLocalId` exists in the current sanitized snapshot.
- Confirm the element supports the requested capability.
- Compare the element’s:
  - name
  - role
  - container context
  - nearest heading
  - viewport position
against the active objective’s target phrase and intent.
- Reject or re-ground semantically weak targets.
- Prefer visible, enabled, in-viewport candidates.
- Reject ads, unrelated navigation, random links, account controls, donation links, and other distractors unless explicitly requested.
- If a clearly superior candidate exists, re-ground to it.
- If ambiguity remains, re-perceive or request clarification instead of clicking randomly.

7. Recovery state machine

Implement a bounded recovery policy per objective:

- `reperceive`
- `wait_for_hydration`
- `retry_target`
- `scroll_to_target`
- `navigate_fallback`
- `refresh_once`
- `request_user_input`
- `fail_safe`

Track attempts by objective.

Rules:
- Never repeat identical actions indefinitely.
- Repeated scroll is allowed only when verified `scrollDeltaY` shows progress.
- Repeated clicks are blocked unless page state materially changed.
- A stale target causes re-perception and re-grounding.
- A loading SPA uses bounded polling with backoff.
- A successful but unverified canvas/map click triggers re-perception before failure.
- Refresh at most once for a stuck page.
- Ask the user only after reasonable automatic recovery is exhausted.

8. Latency reduction

Reduce unnecessary LLM calls:

- Make one planner request at run start.
- Execute deterministic steps locally:
  - known URL navigation
  - exact search-input typing
  - Enter submission
  - exact section-anchor clicking
  - verified scrolling
  - known playbook landmarks
  - retry/wait/re-perceive decisions
- Call the reasoning model only when:
  - the active objective changes materially
  - multiple plausible targets remain
  - extraction or summarization is required
  - recovery cannot be resolved locally
- Reuse stable task context.
- Prefer DOM/state deltas after the initial full perception.
- Do not resend a full screenshot when there was no meaningful visual change unless needed for recovery.
- Preserve a bounded timeout and clear timeout diagnostics.

9. Prompt redesign

Update `apps/server/src/engines/vlm-engine.ts`.

The LLM prompt should explicitly include:

- Original user goal
- Structured objectives
- Current objective
- Verified completed objectives
- Evidence ledger
- Previous action
- Expected outcome
- Actual observed outcome
- Progress/no-progress signal
- Current sanitized elements
- Current page state
- Remaining retry budget

Tell the model:

- Return exactly one minimal next action.
- Act only on the current objective.
- Never claim an objective is complete without evidence.
- Never repeat an action when the prior action made no progress.
- Prefer exact semantic targets over visual guesses.
- Prefer section anchors and direct controls over repeated scrolling.
- Do not expose hidden chain-of-thought.
- Return concise `rationale` and `semanticMatchReason`, not private reasoning.
- Use `finish` only when all required objectives have verified completion evidence.

Remove the requirement to provide “authentic pure chain-of-thought.” Replace it with short, user-safe action justification.

10. Completion gate

Before accepting `finish` or `answer`:

- Check every required objective.
- Confirm all required objectives are completed.
- Confirm completion evidence exists.
- For information tasks, confirm a substantive answer is present.
- Confirm the answer is supported by page evidence.
- If not complete, reject the finish and continue with the next pending objective.

11. Website-agnostic behavior

The generalized system must handle at least these task classes:

- Navigate to a website
- Search and open the best result
- Locate a section in a long article
- Extract and summarize information
- Compare entities
- Fill forms
- Select dropdown values
- Open tabs, dialogs, drawers, and menus
- Paginated tables
- Infinite-scroll pages
- SPA hydration
- Canvas/WebGL map controls
- Downloads
- Multi-tab comparison
- Authentication or missing-input handoff

Do not add a separate hardcoded condition for every website. Use semantic objectives and evidence first. Existing playbooks may optimize known websites.

12. Bhuvan regression requirements

Ensure this exact prompt works end-to-end:

“Open bhuvan.nrsc.gov.in, launch the 2D Open Data Archive or map portal, locate Bengaluru, and inspect the available thematic satellite layers.”

Expected behavior:
- Navigate to Bhuvan.
- Wait for `/ngmaps` hydration.
- If `/ngmaps` remains stuck, refresh once or use the Open Data Archive fallback when allowed by the goal.
- Find the Bhuvan search input.
- Search for Bengaluru.
- Select the correct Bengaluru suggestion.
- Verify map location changed using URL coordinates, map marker, label, or visual evidence.
- Find and open the layer/thematic control.
- Verify a panel or layer controls became visible.
- Inspect visible thematic/satellite layer names.
- Return a grounded summary.
- Never scroll a blank loading page.
- Never finish immediately after selecting Bengaluru when layer inspection remains pending.
- Never fail only because a canvas control lacks a generic status-region mutation.

13. Wikipedia regression requirements

Ensure this exact prompt works end-to-end:

“Go to wikipedia.org, search for "Quantum Computing", navigate to the main article, and summarize the key difference between superconducting qubits and trapped-ion qubits in bullet points.”

Expected behavior:
- Extract only `Quantum Computing`.
- Search Wikipedia.
- Open the primary article.
- Prefer a relevant table-of-contents anchor such as “Physical realizations.”
- Avoid many repeated small scroll actions.
- Collect evidence about both qubit types.
- Return a concise bullet comparison.
- Do not falsely report a repeated-scroll loop when scroll position changed.

14. Tests

Add or update tests for:

- Structured objective generation
- Task specification serialization
- Closed-schema validation
- Objective progress transitions
- Evidence-based completion
- Premature-finish rejection
- Semantic target rejection and re-grounding
- Repeated action with no progress
- Repeated scrolling with progress
- SPA hydration retries
- Stale target recovery
- Map/canvas panel verification
- Bhuvan end-to-end workflow
- Wikipedia end-to-end workflow
- Existing security/privacy guarantees

Run:
- `npm run build`
- `npm run lint`
- focused tests for changed components
- full test suite with a sufficiently long timeout

Report:
- Files changed
- Architecture implemented
- Tests run and exact results
- Remaining limitations
- Any migration or extension reload steps

Do not stop after analysis. Implement the complete change.
One important adjustment: do not promise “every website perfectly.” The realistic target is robust generalization across conventional websites, SPAs, and supported map/canvas applications, with safe fallback for CAPTCHA, cross-origin iframe, authentication, and inaccessible canvas cases.