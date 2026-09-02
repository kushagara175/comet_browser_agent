# PrivaPilot — Browser Benchmark Report

**Harness:** real Chrome via CDP · **Split:** all · **Fixtures:** 14
**Generated:** 2026-09-02T04:23:55.411Z · **Commit:** `df79c92`
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
| Redaction precision (pixel-verified) | 20% | **83.3% coverage**, 3 under-masked |
| Safe-control preservation | — | 100% (18/18) |
| Client perception latency | part of 15% | 55 ms p50 / 99 ms p95 |
| Client memory | part of 20% | 3.94 MB peak, 3.79 MB median |

### Under-masked regions

| Fixture | Region | Overlay coverage |
| :--- | :--- | ---: |
| `face-gallery` | `s0:face` | 7.4% |
| `face-gallery` | `s1:face` | 5.4% |
| `image-pii` | `s0:high_risk_surface` | 0.0% |

---

## Per fixture

| Fixture | Split | Elements | Masks | Regions covered | Client | Heap | Status |
| :--- | :--- | ---: | ---: | :---: | ---: | ---: | :--- |
| `standard-login` | dev | 3 | 2 | 2/2 | 53 ms | 3.91 MB | ok |
| `misleading-field-names` | dev | 3 | 2 | 2/2 | 54.7 ms | 3.79 MB | ok |
| `payment-portal` | dev | 5 | 3 | 3/3 | 57.6 ms | 3.81 MB | ok |
| `profile-pii` | dev | 2 | 5 | 4/4 | 99.4 ms | 3.94 MB | ok |
| `face-gallery` | dev | 1 | 2 | 0/2 | 59.4 ms | 3.72 MB | ok |
| `image-pii` | dev | 1 | 0 | 0/1 | 58.5 ms | 3.61 MB | ok |
| `canvas-pii` | dev | 1 | 1 | 1/1 | 63 ms | 3.64 MB | ok |
| `cross-origin-iframe` | dev | 1 | 1 | 1/1 | 56.1 ms | 3.56 MB | ok |
| `shadow-dom` | dev | 1 | 0 | 0/0 | 53 ms | 3.62 MB | ok |
| `controlled-react-input` | held-out | 2 | 0 | 0/0 | 48.5 ms | 3.86 MB | ok |
| `long-scroll` | held-out | 2 | 1 | 0/0 | 50.8 ms | 3.7 MB | ok |
| `dark-mode` | held-out | 2 | 1 | 1/1 | 45.3 ms | 3.86 MB | ok |
| `modal-dialog` | held-out | 2 | 1 | 1/1 | 48.7 ms | 3.84 MB | ok |
| `cookie-banner` | held-out | 2 | 0 | 0/0 | 43.7 ms | 3.67 MB | ok |

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
