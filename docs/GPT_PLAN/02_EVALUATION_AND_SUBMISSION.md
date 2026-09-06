# Evaluation, Evidence, PPT, and Demo Plan

This document governs Phase 10 and Phase 12. It distinguishes component correctness from real browser and task performance.

# 1. Evaluation layers

## Component suite

Use Node/unit tests for deterministic behavior only:

- PII regex and semantic rules
- Luhn and Verhoeff
- Protocol and closed-schema validation
- Risk and confidence policy
- Fusion logic
- Canonical digest
- Metric-function correctness

Do not use this layer to claim browser geometry, ONNX execution, total client memory, or end-to-end latency.

## Browser perception suite

Run the shipped browser pipeline in real Chrome/Firefox. Measure:

- Real actionable-element boxes
- DOM-only, vision-only, and fused grounding
- Pixel-true redaction
- Safe-region preservation
- Actual model/provider status
- Cold and warm local latency
- Renderer/offscreen/service-worker resource views where available

## Extension E2E suite

Drive the actual unpacked extension and message path. Measure:

- Task completion
- Wrong/unsafe action
- Confirmation behavior
- Abstention/intervention
- Recovery success
- Network-request count
- Bytes transmitted
- Total latency and phase breakdown

Never combine outputs from different commits as one evaluated system.

# 2. Required metric corrections

## Grounding

Current browser code inserts zero boxes for extracted elements. Replace this with actual normalized geometry. Ground truth must resolve selectors/regions in the live page.

Report separately:

- Semantic element recognition
- Correct target selection
- Spatial IoU
- Center point inside target
- Occlusion correctness

Missing geometry is `not_measured` or a miss according to the declared metric; it is never perfect IoU.

## PII

A category with TP=FP=FN=0 is not 100%. Represent `not_applicable`/`not_measured` explicitly. Browser-level PII metrics must be computed from actual production detections, not inferred from sanitized labels alone.

## Redaction

Score each page independently before aggregate reporting. Report:

- Assessable sensitive regions
- Regions covered
- Under-masked regions
- Safe regions preserved
- Over-mask area ratio
- Blocks caused by uncertainty

Use shared production pixel-verification logic.

## Latency

Remove nominal arithmetic such as `serverMs = 350` from scored reports. If not measured in the current run, value is null and status is `not_measured`.

Report cold and warm values separately and preserve failed/timeout runs.

## Resources

Define process boundaries. Report separate measurements rather than a misleading total:

- Renderer JS heap
- Offscreen-document JS heap
- Service-worker JS heap
- Browser/process RSS where available
- Model size
- WASM/model allocations where measurable
- GPU memory only when actually available

## Privacy gates

Do not hardcode 0 leaks or 100% enforcement in the reporter. Compute from actual tests/runs and link the test/run identifier.

# 3. Dataset and ground truth

## Development corpus

Existing authored fixtures may remain for development/regression tests but must be labelled synthetic and in-distribution.

## Independent held-out corpus

Create at least 6–8 independently selected/authored real page families, preferably 20+ scenarios. The person implementing a detector should not author its whole holdout. Use saved public/open pages or original test pages with synthetic PII. Record source/license and remove real personal data.

Required families:

- Login
- Checkout/payment
- Profile/contact
- Dense dashboard
- Modal/drawer
- Repeated labels
- Icon-only toolbar
- Small controls
- Responsive/mobile and zoomed layouts
- Canvas-rendered controls
- Cross-origin/opaque surface
- Delayed loading
- Layout shift between observation/action
- Occluded/disabled targets
- Long-scroll workflow
- Webpage prompt-injection text

If a held-out failure is used to tune the product, move it to development and create a new holdout case.

## Task ground truth

Each task should include family, split, goal, valid action sequences, forbidden actions, protected actions, terminal state, acceptable-abstention rule, target regions, and sensitive regions. Allow multiple valid action sequences.

# 4. Required metrics

## Perception

- Candidate precision/recall
- Target-grounding success
- IoU distribution
- Center-point success
- Occlusion accuracy
- DOM-only result
- Vision-only result
- Fused result

## Privacy

- PII recall/precision/F1 by category
- Face recall/precision on realistic examples
- Pixel redaction coverage
- Safe-region preservation
- Over-mask ratio
- Privacy block rate
- False-safe rate

## Agent quality

- End-to-end task success
- Incorrect-action rate
- Unsafe-action rate
- Protected-action confirmation rate
- Autonomous completion rate
- Intervention rate
- Abstention rate
- Correct and unnecessary abstention
- Recovery attempt rate
- Recovery success
- Retry overhead

## Performance

- Cold/warm p50 and p95
- Capture, perception, sanitization, server, execution, verification, and total timing
- Model size/load time
- Memory by context/process
- Bytes transmitted
- Network-required step percentage
- Expensive visual fallback frequency

# 5. Baselines and ablations

At minimum compare:

1. DOM-only
2. Vision-only
3. Fused DOM + vision
4. Fused without adaptive crops
5. Fused with adaptive crops
6. Without verification in an isolated test environment
7. With verification
8. Fast policy
9. Thorough policy
10. Confidence gate disabled versus enabled in test-only mode

Unsafe ablations must never be enabled in normal production use.

# 6. Trial quality and reproducibility

- At least one cold trial and three warm repetitions per configuration
- Sample count beside every aggregate
- Median and p95, plus failures/timeouts
- Raw samples retained
- No silent outlier deletion
- Declared timeout treatment
- Exact commit, dirty state, browser version, flags, hardware, model hash, provider, viewport, DPR, and command
- Build current source before every benchmark

# 7. Final evidence directory

A final run should contain:

```text
docs/benchmark-results/runs/<timestamp>-<sha>/
  manifest.json
  component.json
  browser-dom-only.json
  browser-vision-only.json
  browser-fused.json
  policy-fast.json
  policy-thorough.json
  e2e-tasks.json
  privacy.json
  summary.md
  raw/
```

The summary must clearly label measured, failed, not measured, and not applicable results.

# 8. Presentation structure

## Slide 1 — Problem and contribution

One real screenshot and one precise sentence. Do not lead with chat.

## Slide 2 — Why the problem is hard

Repeated labels, PII mixed with controls, canvas/icon target, and layout movement.

## Slide 3 — Architecture and trust boundary

Show local browser, local models, sanitizer/verifier, network boundary, server reasoner, executor, and state verifier. Mark the team contribution.

## Slide 4 — Adaptive visual grounding

Show initial candidates, ambiguity, crop reinspection, fusion, and local decision gate.

## Slide 5 — Closed-loop action

Show proposal, risk/confidence decision, execution, postcondition, retry/stop branches.

## Slide 6 — Measured evidence

Only final-run values: perception modes, fast/thorough trade-off, PII, redaction, safe preservation, E2E success, incorrect action, abstention, model/resource data.

## Slide 7 — Generalisation and limitations

Development versus held-out, generalisation gap, minimum tested hardware, and hardest unresolved failures.

## Slide 8 — Deliverables and conclusion

Built/in-progress/planned labels and three evidence-backed takeaways.

Every result chart must footnote command, commit, hardware, sample count, and scope.

# 9. Live demo sequence

1. Let the judge select or perturb an authorized safe page.
2. Show DOM, vision, and fused candidates/provenance.
3. Show local raw versus sanitized view.
4. Show the exact safe payload projection.
5. Complete one local-only action with zero network use.
6. Complete one server-assisted action.
7. Show ambiguity and safe abstention/user clarification.
8. Show protected-action confirmation.
9. Cause a layout change and show re-grounding.
10. In test mode, displace a mask and show transmission blocked.
11. Show provider, latency, model size, and resource evidence.
12. Show benchmark failures as well as successes.

Use an authorized reproducible environment. Do not use operational ISRO systems. Keep a labelled recorded backup.

# 10. Hostile judge questions

Prepare two-sentence, evidence-based answers for:

- What did the team build beyond integrating models?
- Why is visual perception needed?
- What runs locally and what uses a server?
- What is the minimum tested hardware?
- How does held-out performance differ?
- What happens with repeated labels?
- How are stale coordinates prevented?
- What accuracy is lost in fast mode?
- What causes abstention?
- How is webpage prompt injection constrained?
- How was leakage prevented?
- What is the hardest unresolved failure?

# 11. Claim policy

Claims are permitted only after their exit gate:

- On-device visual grounding: Phase 7
- Vision-only operation: Phase 7 benchmark
- Pixel-verified production redaction: Phase 1
- Adaptive perception: Phase 8
- Calibrated uncertainty: Phase 10 threshold study
- Firefox support: Phase 11 real run
- Unseen-interface generalisation: Phase 10 independent holdout
- WebGPU: runtime provider evidence
- End-to-end success rate: multi-task E2E run

Before a gate, label the capability `PLANNED`, `TARGET`, or `NOT MEASURED`.

# 12. Final freeze checklist

- One final commit/run identity
- Chrome and Firefox artifacts built
- Tests and all applicable benchmarks passed or failures documented
- README/PPT values generated from final evidence
- No unsupported claims
- No secrets tracked
- Shared API keys rotated
- Presentation exported and visually inspected
- Backup video recorded and labelled
- Demo rehearsed with unseen pages and failure branches
- No product code changed after evidence generation unless evidence is regenerated
