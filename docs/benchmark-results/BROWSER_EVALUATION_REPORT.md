# PrivaPilot — Browser Benchmark Report

**Harness:** real Chrome via CDP · **Split:** all · **Fixtures:** 15
**Generated:** 2026-09-02T07:19:41.879Z · **Commit:** `66b41a9`
**Environment:** win32 x64 (Node v22.19.0) · **Viewport:** 1280x800 @1x
**Command:** `npm run benchmark:browser`

> Every number here was produced by the shipped client pipeline executing in a real
> rendering engine: `ElementExtractor` against real layout, `SanitizerPipeline` with a
> real canvas (so the ONNX face model runs), and redaction confirmed by reading the
> pixels of the output PNG. Ground truth is anchored to DOM selectors and resolved
> against real layout, not hand-authored coordinates.

---

## Results

| Metric | Weight | Measured |
| :--- | :---: | :--- |
| Visual context accuracy | 25% | 78.6% recall / 78.6% precision |
| Redaction precision (pixel-verified) | 20% | **100% coverage**, 0 under-masked |
| Safe-control preservation | — | 100% (18/18) |
| Client perception latency | part of 15% | 593 ms p50 / 3655 ms p95 |
| Client memory | part of 20% | 9.24 MB peak, 7.15 MB median |

### Under-masked regions

| Fixture | Region | Overlay coverage |
| :--- | :--- | ---: |
| _none_ | | |

---

## Per fixture

| Fixture | Split | Elements | Masks | Regions covered | Client | Heap | Status |
| :--- | :--- | ---: | ---: | :---: | ---: | ---: | :--- |
| `standard-login` | dev | 3 | 2 | 2/2 | 609 ms | 7.16 MB | ok |
| `misleading-field-names` | dev | 3 | 2 | 2/2 | 590.7 ms | 7.03 MB | ok |
| `payment-portal` | dev | 5 | 3 | 3/3 | 600.4 ms | 7.04 MB | ok |
| `profile-pii` | dev | 2 | 4 | 4/4 | 804.7 ms | 7.15 MB | ok |
| `face-gallery` | dev | 1 | 2 | 2/2 | 696.9 ms | 7.93 MB | ok |
| `image-pii` | dev | 1 | 1 | 1/1 | 2764.5 ms | 9.24 MB | ok |
| `canvas-app` | dev | 0 | 1 | 1/1 | 3655 ms | 6.64 MB | ok |
| `canvas-pii` | dev | 1 | 1 | 1/1 | 593.1 ms | 6.93 MB | ok |
| `cross-origin-iframe` | dev | 1 | 1 | 1/1 | 2259.6 ms | 6.76 MB | ok |
| `shadow-dom` | dev | 1 | 0 | 0/0 | 533.9 ms | 7.47 MB | ok |
| `controlled-react-input` | held-out | 2 | 0 | 0/0 | 525.7 ms | 8.3 MB | ok |
| `long-scroll` | held-out | 2 | 1 | 0/0 | 536.1 ms | 7.57 MB | ok |
| `dark-mode` | held-out | 2 | 1 | 1/1 | 549.1 ms | 6.97 MB | ok |
| `modal-dialog` | held-out | 2 | 1 | 1/1 | 561.2 ms | 6.96 MB | ok |
| `cookie-banner` | held-out | 2 | 0 | 0/0 | 518.6 ms | 7.84 MB | ok |

---

## How redaction is judged

A sensitive region counts as covered only when the output image proves it. Every pixel
inside the region must belong to the redaction overlay - the `#0f172a` fill, the
`#38bdf8` border and label, or the antialiased blend between them - or the region's
detail must have been destroyed relative to the raw capture (the face-blur path, which
pixelates rather than fills).

Safe controls are scored the opposite way: a button that got painted over is a
regression, not a success. Reporting only coverage would reward masking the whole page.

Regions scrolled outside the captured viewport are excluded as unassessable rather than
counted as misses - they are not in the screenshot that would have been transmitted.

## Scope

This harness does not exercise the extension's own message plumbing (service worker,
offscreen document, side panel); it drives the same pipeline modules directly in the
page. End-to-end latency including the reasoning server is reported separately.
See `docs/AUDIT_LOCAL_VS_DEFERRED.md`.
