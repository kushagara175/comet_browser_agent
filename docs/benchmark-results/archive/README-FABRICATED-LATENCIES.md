# Why `real-e2e-latencies-FABRICATED.json` is archived, not deleted

This file was the source of the `1549 ms p50` end-to-end latency headline in
`EVALUATION_REPORT.md`. Despite the filename, **none of it was measured.**

`scripts/run-e2e-chrome.js` launched headless Chrome with a remote debugging port and
then never connected to it. It never loaded the extension and never issued a single CDP
command beyond a liveness probe of `/json/version`. The `t0..t7` values it wrote were
Node-side arithmetic:

- `t1` timed an HTTP request to `http://localhost:4500/api/health` — a route the demo
  portal does not serve. The 404 body failed `JSON.parse`, the rejection was swallowed
  by `.catch(() => ({}))`, and the elapsed time of that failure became "capture latency".
- `t2` was a regex count over a literal string in Node, not the PII pipeline.
- `t3` was `Boolean(portalData && textMatches >= 0)` — always true, no canvas, no masks.
- `t5`/`t6`/`t7` were boolean arithmetic; no DOM event was ever dispatched.
- Only `t4` was real: a POST to the reasoning server with a hand-written 1×1 screenshot
  and one hardcoded element.

Every value was floored with `Math.max(...)` so no bucket could read zero.

It is kept because the fabricated numbers were quoted in reports and the record of what
they actually were is worth preserving. **It must never be cited as evidence.**

Real client-side perception latency is now measured by `npm run benchmark:browser`
(`BROWSER_EVALUATION_REPORT.json` → `clientLatency`), which runs the shipped pipeline in
real Chrome. Real server latency is measured against the configured model backend.
