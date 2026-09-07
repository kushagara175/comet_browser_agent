# Needs a human

Appended by the loop when a task is blocked, a critic verdict is disputed, or a
decision is outside the agent's authority. Clear entries as you deal with them.

Format:

```
## [iteration N] <task id> — <one-line title>
- **What happened:** ...
- **Evidence:** <pasted output or file:line>
- **Decision needed:** ...
```

---

## [pre-loop] H1 — Rotate the exposed OpenRouter API key

- **What happened:** The key was shared in a chat transcript, so it is compromised.
- **Decision needed:** Rotate it in the OpenRouter dashboard and update your local
  env. The loop will not touch it and will not write it anywhere.

## [pre-loop] H2 — Nothing has been pushed to remote

- **What happened:** All loop commits are local by design.
- **Decision needed:** You review the commit range and push when you're satisfied.
