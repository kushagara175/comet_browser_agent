# PrivaPilot execution loop — how to run it

Drop these into the repo root:

```
LOOP.md                 <- the per-iteration contract the agent reads every time
loop/STATE.json         <- carried context: queue, phase status, ledger, limits
loop/CRITIC.md          <- the adversarial reviewer spec
loop/loop.ps1           <- driver (Windows PowerShell)
loop/loop.sh            <- driver (WSL/macOS/Linux; needs jq)
loop/NEEDS_HUMAN.md     <- created by the loop when it hits something you must decide
loop/logs/              <- one log per iteration
```

## First run — keep it short

```powershell
cd "d:\path\to\privapilot"
.\loop\loop.ps1 -DryRun            # confirm paths
.\loop\loop.ps1 -MaxIterations 2   # watch two iterations end to end
```

Read `loop/logs/iter-1-*.log` and the commit it produced before letting it run
unattended. The first iteration will pick up **L1** — the governor latency-ceiling
contradiction — which is a design decision, so expect it to either propose the
re-derivation or park itself in `NEEDS_HUMAN.md`. Both are correct behaviour.

Then:

```powershell
.\loop\loop.ps1                    # runs to an exit condition
```

## What each iteration does

Orient (problem statement → audit → phases → state) → take **one** ready task →
write intent and a verification command into `STATE.json` → build → run the
verification and paste real output → spawn a fresh-context critic against
`CRITIC.md` → PASS commits, REVISE retries twice, BLOCK parks the task,
BLOCK-INTEGRITY stops the loop → update the ledger → check exit conditions.

Context survives across iterations only through `STATE.json` and the repo's own
docs. That is deliberate: a fresh context each round is what keeps iteration 30
as honest as iteration 1.

## Exit conditions

`complete` · `queue-drained` · `blocked` · `iteration-cap` (40 by default) ·
`stalled` (3 no-progress rounds) · `deadline-freeze` (18 Sep, two days before
submission) · `integrity-halt` · `dirty-tree` · `state-corrupt` · `no-progress`
(driver-side: the agent didn't write a ledger entry).

On exit the loop writes `loop/SUMMARY.md` and the driver prints it. Resume with
`-Reset` (PowerShell) or `RESET=1` (bash) after you've dealt with whatever stopped it.

## Knobs

| Knob | PowerShell | bash |
| --- | --- | --- |
| Iteration budget | `-MaxIterations 10` | `MAX_ITER=10` |
| Permission mode | `-PermissionMode bypassPermissions` | `PERM_MODE=bypassPermissions` |
| Claude binary | `-ClaudeBin claude` | `CLAUDE_BIN=claude` |
| Repo root | `-RepoRoot "d:\..."` | `REPO_ROOT=/mnt/d/...` |

Default permission mode is `acceptEdits`. If headless iterations hang waiting on a
tool prompt, switch to `bypassPermissions` — but only because this loop never pushes
and never touches anything outside the repo. Read the first two logs before you make
that trade.

## Things the loop will not do

Push to remote. Rotate the exposed OpenRouter key. Submit. Overrule the critic. Edit
fixtures to make a test pass. Start R8 (Firefox) before everything with rubric weight
is done. All of those are yours (`H1`, `H2` in the queue).

## Steering it

Edit `loop/STATE.json` between runs — add a task, change a priority, mark something
`blocked`, drop `L6` if you decide it isn't worth the time. The queue is the steering
wheel. `limits.max_iterations` and `limits.freeze_date` are the brakes.

If you want a different exit bar — say, stop as soon as R7 has real face-recall
numbers rather than running to R9 — change the `complete` row in LOOP.md's exit table.
That one table is the whole exit contract.
