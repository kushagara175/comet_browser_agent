# Archive — superseded documents

These are retained for provenance only. **Do not build from them.** Where they disagree with
[`../00_PROBLEM_STATEMENT.md`](../00_PROBLEM_STATEMENT.md) or
[`../EXECUTION_PLAN.md`](../EXECUTION_PLAN.md), the current documents win.

| File | Superseded by | Why |
| :--- | :--- | :--- |
| `PROJECT_PLAN_V2.md` | `../00_PROBLEM_STATEMENT.md` and `../EXECUTION_PLAN.md` | Held both the official PS text and a plan. The PS text was extracted into its own authoritative document; the plan was replaced by the audited, re-baselined one. Also had a typo in its filename (`SIH26171_updateddddd .md`). |
| `claude_plan.md` | `../EXECUTION_PLAN.md` | Earlier plan. Its architecture is sound and largely carried forward, but it predates the codebase audit and still assigned work to two specific named laptops. |
| `08_SPRINT_ROADMAP_4WEEKS.md` | `../EXECUTION_PLAN.md` | Its timeline began 23 Aug 2026 with no code committed against it, so Week 1 elapsed unused. Replaced by re-baselined phases against the real remaining time. |

## Historical note

An earlier generation of this project's documents — visible in git history before the pivot — was
built on a third-party prep document that **invented requirements not present in the official
problem statement**: ISRO geospatial portals (Bhuvan, MOSDAC, VEDAS, Bhoonidhi), satellite imagery
downloads, WebGL map dragging, and a fully air-gapped "zero cloud" architecture.

The last of those is worth remembering, because it is the opposite of what ISRO asked: the real PS
**requires** a client-to-server split, with sanitized context transmitted to a centralized LLM/VLM.
A "0.0 KB outbound, air-gapped" pitch would have failed the problem statement outright.

The lesson is recorded in `AGENT_RULES.md` §5: verify the primary source before building, and never
let confident secondary material stand in for it.
