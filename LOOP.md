# PrivaPilot Autonomous Execution Loop — Iteration Contract

You are running **one iteration** of an autonomous execution loop on the PrivaPilot
repo (SIH 2026, PS SIH26171, ISRO). A driver script re-invokes you with this exact
file after every iteration. You have **no memory of previous iterations**. Everything
you need to carry forward must be written into `loop/STATE.json`.

Do exactly the steps below, in order. Do not skip step 5 or step 7.

---

## 0. Orient (always, every iteration)

Read, in this precedence order — **later files never override earlier ones**:

1. `docs/00_PROBLEM_STATEMENT.md` — the contract with the judges. Absolute authority.
2. `AUDIT_LOCAL_VS_DEFERRED.md` — authoritative status of what is actually built.
3. `docs/PHASES.md` — the R0–R9 roadmap.
4. `loop/STATE.json` — carried loop context: queue, ledger, counters.
5. `docs/BENCHMARKS.md` — measured numbers **and the retracted-claims register**.

If `loop/STATE.json` is missing or unparseable, stop immediately, write
`loop/.exit` containing `EXIT: state-corrupt`, and print `LOOP_EXIT: state-corrupt`.

Then run `git status --short` and `git log --oneline -5`. If the working tree has
uncommitted changes you did not make, stop: append the finding to
`loop/NEEDS_HUMAN.md`, write `loop/.exit` with `EXIT: dirty-tree`, print
`LOOP_EXIT: dirty-tree`. A human decides what to do with someone else's work
(Gemini also runs against this repo).

## 1. Check exit conditions BEFORE selecting work

Evaluate every condition in `## Exit conditions` below. If any fires, write the
sentinel and stop — do not start new work in an iteration that should have ended.

## 2. Select exactly one task

From `state.queue`, take the highest-priority task whose `status` is `ready` and
whose `blocked_by` list is empty or fully satisfied. **One task per iteration.**
Never batch. If the task is larger than roughly one focused hour of work, split it
in place: replace it in the queue with 2–4 smaller ready tasks, write STATE.json,
and take the first of them this iteration.

Tasks marked `"owner": "human"` are never selected. They exist so you know what is
blocked, not so you can do them.

## 3. Plan before editing

Write your intent into `state.current` in `loop/STATE.json` **before** touching any
source file:

```json
"current": {
  "task_id": "L2",
  "intent": "one sentence: what changes and why",
  "files_expected": ["apps/extension/src/..."],
  "verification_command": "the exact command that will prove this works",
  "started_at": "ISO-8601"
}
```

If you cannot name a `verification_command` that produces a pass/fail or a number,
the task is not ready. Move it back to `blocked` with reason
`"no verification path"` and pick the next one.

## 4. Build

- Tests first where a test is meaningful. New behaviour ships with a new test.
- Change the smallest surface that achieves the intent.
- Do not refactor adjacent code "while you're in there". That is a separate task —
  append it to the queue at low priority instead.
- Never commit secrets. `VLM_ENDPOINT` / OpenRouter keys come from env only.

## 5. Verify — with real execution, not reasoning

Run `verification_command`. Run the test suite. Paste **actual terminal output**
into `state.current.evidence`. Numbers that were not produced by a command you ran
in this iteration are not evidence and must not appear in any doc you write.

If verification fails after two honest attempts to fix it, do not force it: set the
task `status: "blocked"`, record the failing output, append to `loop/NEEDS_HUMAN.md`,
and continue to step 7 (this counts as a completed iteration).

## 6. Critic pass — mandatory, fresh context

Spawn a **subagent** with no inherited context and give it:

- the full text of `loop/CRITIC.md`
- the diff (`git diff` plus `git diff --staged`, or the untracked file contents)
- `state.current` including the pasted evidence

The critic returns a verdict block. Act on it:

| Verdict | Action |
| --- | --- |
| `PASS` | Commit. Message: `<phase>: <intent>` + the loop trailer (below). |
| `REVISE` | Fix the named defects, re-verify, re-critique. **Max 2 revise rounds per task.** After the 2nd, treat as `BLOCK`. |
| `BLOCK` | Do not commit. `git stash` the work with a named stash, set the task `status: "blocked"` with the critic's reason, append to `loop/NEEDS_HUMAN.md`. |
| `BLOCK-INTEGRITY` | Stop the whole loop. Write `loop/.exit` = `EXIT: integrity-halt`. Print `LOOP_EXIT: integrity-halt`. A claim-integrity failure is never auto-recoverable. |

You are not allowed to overrule the critic. If you believe it is wrong, record the
disagreement in `loop/NEEDS_HUMAN.md` and let the verdict stand.

Commit trailer:

```
Loop-Iteration: <n>
Critic-Verdict: PASS
```

Never `git push`. Pushing is a human decision.

## 7. Update STATE.json — always, even on failure

- `state.iteration` += 1
- append a record to `state.ledger`: `{iteration, task_id, verdict, files_changed, commit, evidence_summary, timestamp}` — keep the last 30, drop older
- move the task to `done` / `blocked`, or leave `ready` if partially advanced (and say what remains in its `notes`)
- append any newly discovered work to `queue` with a priority
- `state.stall_counter`: += 1 if this iteration produced **no** commit and **no**
  queue change; reset to 0 otherwise
- clear `state.current`

Write the file atomically (write temp, then replace). A corrupt STATE.json kills
the loop.

## 8. Emit the iteration line

Print exactly one summary line the driver can grep:

```
LOOP_ITER <n> | task=<id> | verdict=<PASS|REVISE|BLOCK> | commit=<sha|none> | queue_ready=<count>
```

Then, if an exit condition now holds, write `loop/.exit` and print `LOOP_EXIT: <reason>`.

---

## Exit conditions

Checked at step 1 and again at step 8. First match wins.

| Reason | Condition |
| --- | --- |
| `complete` | R5, R7 and R9 are marked done in `docs/PHASES.md`, the R9 freeze checklist has every box ticked, and the queue has no `ready` tasks owned by the agent. |
| `queue-drained` | No `ready` agent-owned tasks remain and none can be honestly derived from PHASES.md. |
| `blocked` | Every remaining agent-owned task has `status: "blocked"`. |
| `iteration-cap` | `state.iteration >= state.limits.max_iterations`. |
| `stalled` | `state.stall_counter >= 3`. |
| `deadline-freeze` | Today's date (IST) is on or after `state.limits.freeze_date`. Submission is 20 Sep 2026 23:59 IST; the loop must stop before it, not during it. |
| `integrity-halt` | Any `BLOCK-INTEGRITY` verdict. |
| `dirty-tree` | Uncommitted changes at step 0 that the loop did not author. |
| `state-corrupt` | STATE.json missing or unparseable. |

On exit, write a human-readable `loop/SUMMARY.md`: what shipped, what is blocked and
why, what a human must decide, and the exact next command to resume.

---

## Hard invariants — violating any of these is a `BLOCK-INTEGRITY`

1. **No hardcoded selectors or per-site special-casing.** Evaluation pages are unknown
   until the finale. Anything keyed to a specific domain or DOM path is disqualifying.
2. **No claim without a command.** Every number in `BENCHMARKS.md`, `PHASES.md`, the
   README or a commit message must be reproducible by a command written next to it.
3. **The retracted-claims register in `BENCHMARKS.md` is append-only.** Entries are
   never deleted, softened, or quietly re-asserted elsewhere. Currently retracted:
   the 25–35 MB extension heap figure, the WASM batching speedup, the strict 300 ms
   crop-granularity deadline, and page-type classification accuracy.
4. **Detection metric is strict spatial IoU ≥ 0.50, no name matching.** Do not
   introduce a looser metric to make a number improve.
5. **Raw pixels never leave the device and never enter the cache.** The perception
   cache stores `SanitizedContext` + hashes only.
6. **A `RedactionManifest` is required on the wire.** The server returning 400 for
   payloads without one is intended behaviour, not a bug to fix.
7. **Rubric weights govern priority**: visual context 25%, PII recall/precision 20%,
   redaction precision 20%, client resources 20%, latency 15%. Work with no path to
   one of these buckets is low priority by construction. R8 (Firefox) carries zero
   rubric weight and is explicitly the first thing to cut.
8. **Never edit `data/` fixtures to make a test pass.**
9. **No secrets in tracked files, ever.**

## Tone

Write like the audit files already in this repo: measured, specific, willing to
record a negative result. "Vision did not improve general accuracy; it bought a
DOM-blind capability" is the register. Do not decorate.
