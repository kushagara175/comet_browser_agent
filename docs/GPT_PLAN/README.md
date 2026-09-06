# PrivaPilot — GPT/Gemini Completion Plan

This folder is the canonical, executable completion blueprint for SIH26171.

## How to use it

1. Give the coding agent `00_MASTER_INSTRUCTIONS.md` first.
2. Assign exactly one phase from `01_IMPLEMENTATION_PHASES.md` at a time.
3. Use `03_PHASE_PROMPTS.md` for the copy-paste prompt.
4. Require the phase exit gate to pass before moving on.
5. Record real results in `04_PROGRESS_TRACKER.md`.
6. Use `02_EVALUATION_AND_SUBMISSION.md` only after the implementation gates are complete.

Do not ask an agent to implement the entire plan in one response. Large uncontrolled patches will make the privacy boundary, generated bundles, tests, and benchmark evidence unreliable.

## Authority order

When documents disagree, use this order:

1. `../00_PROBLEM_STATEMENT.md`
2. Current source and tests
3. This folder
4. `../PHASES.md`
5. Other planning documents
6. Archived documents

## Documents

| File | Purpose |
|---|---|
| `00_MASTER_INSTRUCTIONS.md` | Binding rules and current repository truth for coding agents |
| `01_IMPLEMENTATION_PHASES.md` | Detailed phases from baseline cleanup through Firefox |
| `02_EVALUATION_AND_SUBMISSION.md` | Benchmark rebuild, evidence, presentation, and demo plan |
| `03_PHASE_PROMPTS.md` | Copy-paste prompts for running work one phase at a time |
| `04_PROGRESS_TRACKER.md` | Exit-gate checklist and measured-results ledger |

## Core target

PrivaPilot must become a browser agent where:

- Sensitive perception and redaction happen locally.
- Local visual perception contributes directly to target grounding.
- Cheap, clear actions can be decided locally.
- Only pixel-verified sanitized context is sent when remote reasoning is needed.
- Confidence, ambiguity, and risk are enforced locally.
- Execution is bound to fresh page state.
- Every action is verified and recovery is bounded.
- Every public claim is backed by a reproducible run.

## Current honest description

Today PrivaPilot is strongest as a privacy-preserving DOM browser agent with local PII/face redaction, server-assisted reasoning, local execution, and semantic verification. It is not yet a complete on-device visual target-grounding system. This plan closes that gap without weakening the existing privacy and safety architecture.
