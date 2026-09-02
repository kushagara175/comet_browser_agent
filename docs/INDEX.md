# Documentation Index — SIH26171 / PrivaPilot

Every project document lives in this folder. They form a deliberate hierarchy: when two documents
disagree, the one higher in this list wins.

---

## Tier 1 — Authoritative

| # | Document | What it is |
| :-: | :--- | :--- |
| 00 | **[00_PROBLEM_STATEMENT.md](00_PROBLEM_STATEMENT.md)** | The official ISRO problem statement, verbatim, with metadata and the evaluation rubric. **Overrides every other document in this repository.** Includes the generalization requirement implied by *"use cases will be provided during finale."* |

## Tier 2 — Operative (read these to work)

| Document | What it is |
| :--- | :--- |
| **[EXECUTION_PLAN.md](EXECUTION_PLAN.md)** | Strategy: where we stand, what actually decides selection, the four things we can prove that competitors cannot, the demo, and the risk register. **Start here to understand the bet.** |
| **[PHASES.md](PHASES.md)** | The task board — phases R0–R8 ordered by which problem-statement clause each satisfies, every one with an exit gate. **Start here to decide what to do next.** |
| **[AGENT_RULES.md](AGENT_RULES.md)** | Binding rules for every coding session: privacy boundary, fail-closed policy, data classes, action safety, evidence-and-honesty rules, reuse table, definition of done. **Read before writing code.** |
| **[AUDIT_LOCAL_VS_DEFERRED.md](AUDIT_LOCAL_VS_DEFERRED.md)** | What is actually measured by executing code versus what is still unverified, and why. Records the benchmark-harness rebuild, the real bugs it exposed, and every ground-truth correction with its justification. **Read before quoting any metric.** |

## Tier 3 — Design reference

| Document | What it covers |
| :--- | :--- |
| **[SIH26171_WINNING_EXECUTION_PLAYBOOK.md](SIH26171_WINNING_EXECUTION_PLAYBOOK.md)** | The full design spec and source of truth for architectural decisions — privacy contract, detection and redaction design, reasoning and execution rules, benchmark strategy, adversarial cases, jury answers. |
| [01_PROBLEM_ANALYSIS.md](01_PROBLEM_ANALYSIS.md) | Problem and domain context; the privacy paradox in web agents; why the finale use cases being unknown shapes the design. |
| [02_SYSTEM_ARCHITECTURE.md](02_SYSTEM_ARCHITECTURE.md) | Client–server split and core module responsibilities. |
| [03_VLM_INFERENCE_PIPELINE.md](03_VLM_INFERENCE_PIPELINE.md) | In-browser vision pipeline and the server VLM contract; prompt and action schema. |
| [04_BROWSER_AUTOMATION_CANVAS.md](04_BROWSER_AUTOMATION_CANVAS.md) | Manifest V3 extension architecture, offscreen worker, DOM action executor, canvas masking. |
| [05_ACTION_CACHE_SELF_HEALING.md](05_ACTION_CACHE_SELF_HEALING.md) | Action cache, state verification, and the privacy audit trail. |
| [06_FRONTEND_MISSION_CONTROL.md](06_FRONTEND_MISSION_CONTROL.md) | Side-panel HUD: the raw-vs-redacted split view and live telemetry. |
| [07_TEAM_WORKFLOW_HARDWARE_SPLIT.md](07_TEAM_WORKFLOW_HARDWARE_SPLIT.md) | Baseline machine requirements and the workstream split. |
| [09_DEMO_PITCH_SCRIPT.md](09_DEMO_PITCH_SCRIPT.md) | Finale pitch and live demo script, plus prepared jury answers. |

## Tier 4 — Evidence

| Path | What it is |
| :--- | :--- |
| [benchmark-results/](benchmark-results/) | Output of `npm run benchmark`. Every stored result carries the command and commit that produced it. Two harnesses write here: `npm run benchmark` (Node, detector-level) and `npm run benchmark:browser` (real Chrome). Prefer the browser report; see AUDIT_LOCAL_VS_DEFERRED for what each can and cannot measure. |

## Archive — superseded, do not build from

| Path | Why it was superseded |
| :--- | :--- |
| [archive/PROJECT_PLAN_V2.md](archive/PROJECT_PLAN_V2.md) | Its problem-statement content is now `00_PROBLEM_STATEMENT.md`; its plan content is now `EXECUTION_PLAN.md`. |
| [archive/claude_plan.md](archive/claude_plan.md) | Earlier plan, superseded by `EXECUTION_PLAN.md`. |
| [archive/08_SPRINT_ROADMAP_4WEEKS.md](archive/08_SPRINT_ROADMAP_4WEEKS.md) | Its timeline began 23 Aug 2026 and has elapsed; replaced by the re-baselined phases in `EXECUTION_PLAN.md`. |

---

## Reading order

**New to the project:** `00_PROBLEM_STATEMENT` → `EXECUTION_PLAN` (§1, current state) → `AUDIT_LOCAL_VS_DEFERRED` → `AGENT_RULES`.

**About to write code:** `AGENT_RULES` → the `PHASES.md` phase you are on → the playbook section
it cites.

**Designing a subsystem:** the playbook, then the matching `0x_` reference document.

**Preparing the submission:** `00_PROBLEM_STATEMENT` §5 for the rubric, `benchmark-results/` for
evidence, `09_DEMO_PITCH_SCRIPT` for the pitch.
