#!/usr/bin/env bash
# Autonomous execution loop driver for PrivaPilot (SIH26171).
# POSIX/WSL/macOS counterpart of loop.ps1. Same contract, same exit conditions.
#
#   ./loop/loop.sh                # run until an exit condition fires
#   MAX_ITER=5 ./loop/loop.sh     # short leash for the first run
#   AGENT_BIN=agy ./loop/loop.sh  # run with agy CLI
#   DRY_RUN=1 ./loop/loop.sh      # print what it would do, run nothing
#   RESET=1 ./loop/loop.sh        # clear a previous exit sentinel and resume

set -uo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="${REPO_ROOT:-$(dirname "$SCRIPT_DIR")}"
LOOP_DIR="$REPO_ROOT/loop"
STATE="$LOOP_DIR/STATE.json"
EXIT_FILE="$LOOP_DIR/.exit"
PROMPT="$REPO_ROOT/LOOP.md"
LOG_DIR="$LOOP_DIR/logs"
AGENT_BIN="${AGENT_BIN:-${CLAUDE_BIN:-claude}}"
SLEEP_SECONDS="${SLEEP_SECONDS:-5}"
PERM_MODE="${PERM_MODE:-acceptEdits}"   # set to bypassPermissions if headless runs stall on tool prompts

for f in "$PROMPT" "$STATE" "$LOOP_DIR/CRITIC.md"; do
  [ -f "$f" ] || { echo "Missing required file: $f" >&2; exit 1; }
done
mkdir -p "$LOG_DIR"

command -v jq >/dev/null 2>&1 || { echo "jq is required." >&2; exit 1; }

if [ -f "$EXIT_FILE" ]; then
  if [ "${RESET:-0}" = "1" ]; then
    echo "[driver] cleared previous exit sentinel: $(tr -d '\n' < "$EXIT_FILE")"
    rm -f "$EXIT_FILE"
  else
    echo "[driver] loop already exited: $(tr -d '\n' < "$EXIT_FILE")"
    echo "[driver] read loop/SUMMARY.md, then re-run with RESET=1 to resume."
    exit 0
  fi
fi

MAX_ITER="${MAX_ITER:-$(jq -r '.limits.max_iterations' "$STATE")}"
FREEZE="$(jq -r '.limits.freeze_date' "$STATE")"
START_ITER="$(jq -r '.iteration' "$STATE")"
TODAY="$(date +%Y-%m-%d)"

if [[ "$TODAY" > "$FREEZE" || "$TODAY" == "$FREEZE" ]]; then
  echo "[driver] freeze date $FREEZE reached -- not starting."
  exit 0
fi

echo "[driver] repo        : $REPO_ROOT"
echo "[driver] agent binary: $AGENT_BIN"
echo "[driver] iteration   : $START_ITER"
echo "[driver] budget      : $MAX_ITER iterations"
echo "[driver] freeze date : $FREEZE"
echo

if [ "${DRY_RUN:-0}" = "1" ]; then
  echo "[driver] DRY RUN -- would invoke:"
  if [[ "$AGENT_BIN" =~ agy ]]; then
    echo "  $AGENT_BIN -p <LOOP.md, $(wc -c < "$PROMPT") bytes> --dangerously-skip-permissions"
  else
    echo "  $AGENT_BIN -p <LOOP.md, $(wc -c < "$PROMPT") bytes> --permission-mode $PERM_MODE"
  fi
  exit 0
fi

last_ledger="$(jq -r '.ledger | length' "$STATE")"
ran=0

for ((i = 1; i <= MAX_ITER; i++)); do
  n=$((START_ITER + i))
  log="$LOG_DIR/iter-$n-$(date +%Y%m%d-%H%M%S).log"
  echo "[driver] --- iteration $n --- $(date +%H:%M:%S)"

  if [[ "$AGENT_BIN" =~ agy ]]; then
    ( cd "$REPO_ROOT" && "$AGENT_BIN" -p "$(cat "$PROMPT")" --dangerously-skip-permissions ) 2>&1 | tee "$log"
  else
    ( cd "$REPO_ROOT" && "$AGENT_BIN" -p "$(cat "$PROMPT")" --permission-mode "$PERM_MODE" ) 2>&1 | tee "$log"
  fi
  code=${PIPESTATUS[0]}
  ran=$((ran + 1))

  if [ "$code" -ne 0 ]; then
    echo "[driver] agent exited $code -- see $log"
    echo "EXIT: runner-error ($AGENT_BIN exit code $code, iteration $n)" > "$EXIT_FILE"
    break
  fi

  if [ -f "$EXIT_FILE" ]; then
    echo "[driver] $(tr -d '\n' < "$EXIT_FILE")"
    break
  fi

  if ! jq empty "$STATE" 2>/dev/null; then
    echo "EXIT: state-corrupt (driver could not parse STATE.json after iteration $n)" > "$EXIT_FILE"
    echo "[driver] STATE.json unparseable -- stopping."
    break
  fi

  ledger="$(jq -r '.ledger | length' "$STATE")"
  if [ "$ledger" = "$last_ledger" ]; then
    echo "[driver] no ledger entry added this iteration -- agent did not complete step 7."
    echo "EXIT: no-progress (ledger unchanged after iteration $n)" > "$EXIT_FILE"
    break
  fi
  last_ledger="$ledger"

  stall="$(jq -r '.stall_counter' "$STATE")"
  if [ "$stall" -ge 3 ]; then
    echo "EXIT: stalled (stall_counter=$stall)" > "$EXIT_FILE"
    echo "[driver] stalled -- three iterations with no commit and no queue change."
    break
  fi

  TODAY="$(date +%Y-%m-%d)"
  if [[ "$TODAY" > "$FREEZE" || "$TODAY" == "$FREEZE" ]]; then
    echo "EXIT: deadline-freeze" > "$EXIT_FILE"
    echo "[driver] freeze date reached mid-loop."
    break
  fi

  sleep "$SLEEP_SECONDS"
done

if [ ! -f "$EXIT_FILE" ] && [ "$ran" -ge "$MAX_ITER" ]; then
  echo "EXIT: iteration-cap (driver budget $MAX_ITER exhausted)" > "$EXIT_FILE"
  echo "[driver] iteration budget exhausted."
fi

echo
echo "[driver] ran $ran iteration(s). Logs: $LOG_DIR"
if [ -f "$LOOP_DIR/SUMMARY.md" ]; then
  echo
  cat "$LOOP_DIR/SUMMARY.md"
else
  echo "[driver] no SUMMARY.md written -- check the last log and loop/NEEDS_HUMAN.md."
fi
