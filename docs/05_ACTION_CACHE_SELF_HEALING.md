# 05. Action Memory Cache & Self-Healing Engine — SIH26171

## 1. Action Cache Architecture

The primary pain point stated by ISRO is that scientists waste 30-60 minutes daily performing **repetitive** portal navigation. A pure VLM agent that blindly re-reasons through every single dropdown on every run is wasteful and slow (~45s per query).

Our **Action Memory Cache** turns every successful navigation path into a deterministic fast-path replay, slashing repeated query execution to **< 8 seconds**.

```
                           ┌────────────────────────────┐
                           │      Subtask Signature     │
                           │  "select_sensor_cartosat2" │
                           └─────────────┬──────────────┘
                                         │
                                         ▼
                            ┌──────────────────────────┐
                            │    Cache Query (SQLite)  │
                            └────────────┬─────────────┘
                                         │
                   ┌─────────────────────┴─────────────────────┐
                   │ HIT (Found cached action sequence)        │ MISS (New UI / Unseen subtask)
                   ▼                                           ▼
      ┌─────────────────────────┐                 ┌─────────────────────────┐
      │   Fast CDP Replay       │                 │   Invoke Local VLM      │
      │   (DOM Selector / Coord)│                 │   (SmolVLM / Qwen2.5)   │
      └────────────┬────────────┘                 └────────────┬────────────┘
                   │                                           │
                   ▼                                           ▼
      ┌─────────────────────────┐                 ┌─────────────────────────┐
      │ Verify State Transition │                 │ Verify & Save Path      │
      └────────────┬────────────┘                 │ to Cache Table          │
                   │ Failed (Stale)               └─────────────────────────┘
                   ▼
      [Invalidate Cache & Fallback to VLM]
```

---

## 2. SQLite Cache Database Schema

```sql
CREATE TABLE IF NOT EXISTS action_cache (
    signature TEXT PRIMARY KEY,       -- e.g. "bhuvan:cartosat_2:sensor_select"
    portal_id TEXT NOT NULL,          -- "bhuvan" | "mosdac" | "vedas" | "bhoonidhi"
    subtask_type TEXT NOT NULL,       -- "sensor_select" | "date_range" | "canvas_drag"
    action_payload JSON NOT NULL,     -- {"type": "click", "selector": "#sensor_opt_4", "coords": null}
    expected_phash TEXT NOT NULL,     -- Perceptual hash of expected post-state
    success_count INTEGER DEFAULT 1,  -- Track reliability count
    last_verified_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
```

---

## 3. Perceptual Diffing (pHash) & State Verification

After every dispatched action, we verify whether the webpage state actually changed:

```python
import imagehash
from PIL import Image
import io

def calculate_phash(screenshot_bytes: bytes) -> str:
    image = Image.open(io.BytesIO(screenshot_bytes))
    return str(imagehash.phash(image))

def verify_state_transition(pre_phash: str, post_phash: str, threshold: int = 4) -> bool:
    """
    Returns True if the page visually changed significantly.
    Hamming distance <= threshold implies page remained static (action failed).
    """
    hash1 = imagehash.hex_to_hash(pre_phash)
    hash2 = imagehash.hex_to_hash(post_phash)
    distance = hash1 - hash2
    return distance > threshold
```

---

## 4. Self-Healing Decision Matrix

When `verify_state_transition()` returns `False` (page failed to transition), the self-healing state machine executes the following fallback ladder:

```
[Action Dispatched] ──▶ [Check pHash Diff] ──▶ [No Change Detected!]
                              │
                              ▼
        ┌──────────────────────────────────────────────────┐
        │ STEP 1: Modal / Alert / Cookie Popup Interceptor │
        │ Check for dialog overlays or 'OK' / 'Close' btns │
        └─────────────────────┬────────────────────────────┘
                              │ Found & Dismissed? ──▶ Re-attempt original action
                              │ Not Found?
                              ▼
        ┌──────────────────────────────────────────────────┐
        │ STEP 2: Selector Degradation / Coordinate Click  │
        │ Fallback from exact ID to element center (x, y)  │
        └─────────────────────┬────────────────────────────┘
                              │ Transitioned? ──▶ Success & Update Cache
                              │ Still Blocked?
                              ▼
        ┌──────────────────────────────────────────────────┐
        │ STEP 3: VLM Re-perception with Fresh SoM         │
        │ Take new screenshot, re-generate marks, re-plan  │
        └──────────────────────────────────────────────────┘
```
