# PrivaPilot — Browser Benchmark Report

**Harness:** real Chrome via CDP · **Split:** all · **Fixtures:** 17
**Generated:** 2026-09-07T16:31:57.800Z · **Commit:** `71cb5f7`
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
| Visual context accuracy | 25% | 74.2% recall / 82.1% precision |
| Redaction precision (pixel-verified) | 20% | **100% coverage**, 0 under-masked |
| Safe-control preservation | — | 100% (19/19) |
| Client perception latency | part of 15% | 1618 ms p50 / 3577 ms p95 |
| Client memory | part of 20% | 9.54 MB peak, 8.42 MB median |

### Under-masked regions

| Fixture | Region | Overlay coverage |
| :--- | :--- | ---: |
| _none_ | | |

---

## Per fixture

| Fixture | Split | Elements | Masks | Regions covered | Client | Heap | Status |
| :--- | :--- | ---: | ---: | :---: | ---: | ---: | :--- |
| `standard-login` | dev | 3 | 2 | 2/2 | 2148.9 ms | 8.4 MB | ok |
| `misleading-field-names` | dev | 3 | 2 | 2/2 | 2262.1 ms | 9.54 MB | ok |
| `payment-portal` | dev | 5 | 3 | 3/3 | 2113 ms | 9.13 MB | ok |
| `profile-pii` | dev | 2 | 4 | 4/4 | 1377.9 ms | 8.98 MB | ok |
| `face-gallery` | dev | 1 | 2 | 2/2 | 1149.8 ms | 8.42 MB | ok |
| `image-pii` | dev | 1 | 1 | 1/1 | 1500.8 ms | 6.97 MB | ok |
| `canvas-app` | dev | 0 | 1 | 1/1 | 3178.1 ms | 9.05 MB | ok |
| `canvas-pii` | dev | 1 | 1 | 1/1 | 3576.8 ms | 9.14 MB | ok |
| `cross-origin-iframe` | dev | 1 | 1 | 1/1 | 2939 ms | 9.18 MB | ok |
| `shadow-dom` | dev | 1 | 0 | 0/0 | 1280 ms | 7.91 MB | ok |
| `controlled-react-input` | dev | 2 | 0 | 0/0 | 1369 ms | 8.29 MB | ok |
| `long-scroll` | dev | 2 | 1 | 0/0 | 1614 ms | 6.55 MB | ok |
| `dark-mode` | dev | 2 | 1 | 1/1 | 1817.2 ms | 8.63 MB | ok |
| `modal-dialog` | dev | 2 | 1 | 1/1 | 1606.9 ms | 8.89 MB | ok |
| `cookie-banner` | dev | 2 | 0 | 0/0 | 1721.8 ms | 7.58 MB | ok |
| `canvas-form` | dev | 0 | 1 | 0/0 | 1617.7 ms | 6.85 MB | ok |
| `image-identifier` | dev | 0 | 0 | 0/0 | 1397.3 ms | 6.53 MB | ok |

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
