# Slide 2: Algorithmic Execution DAG & Multi-Gate Decision Flow

> **Problem Statement:** SIH26171 — *On-device Visual Perception for Light-weight Browser Agents*  
> **Organisation:** Indian Space Research Organisation (ISRO)  
> **Use Case:** PPT Algorithmic Flowchart / Judge Defense for Decision Gates

### Key Talking Points for Judges:
- **Fail-Closed Gate 1:** If post-redaction pixel audit detects any high-entropy text or face features surviving inside bounding boxes, the entire HTTP dispatch is aborted instantly.
- **Differential Delta Cache (Gate 2):** If user/page state hasn't changed, cached action steps are replayed with 0ms VLM latency.
- **Human-in-the-Loop Consensus (Gate 5):** Reversible actions (clicks, navigation) run automatically; protected high-consequence actions (form submit, payments, deletions) mandate explicit modal confirmation.
- **Closed-Loop Verification (Gate 6):** Semantic `MutationObserver` checks ensure that synthetic events produced the intended page state changes before advancing the loop.

```mermaid
flowchart TD
    classDef startNode fill:#1e1e2e,stroke:#89b4fa,stroke-width:2px,color:#cdd6f4;
    classDef stepNode fill:#181825,stroke:#45475a,stroke-width:1.5px,color:#cdd6f4;
    classDef decisionNode fill:#311b0b,stroke:#f59e0b,stroke-width:2px,color:#fef08a;
    classDef safetyGate fill:#450a0a,stroke:#ef4444,stroke-width:2px,color:#fee2e2;
    classDef actionNode fill:#064e3b,stroke:#10b981,stroke-width:2px,color:#a7f3d0;
    classDef fallbackNode fill:#3b0764,stroke:#c084fc,stroke-width:1.5px,color:#f3e8ff;

    Start([🟢 START: User Goal Submitted]):::startNode --> Step1[1. Ingest Goal & Identify Target Browser Tab]:::stepNode
    Step1 --> Step2[2. Capture Viewport RGB Buffer + Parse Structural DOM Tree]:::stepNode

    %% DECISION 1: PII DETECTION
    Step2 --> Dec1{PII or Biometrics Present on Screen?}:::decisionNode

    Dec1 -- Yes --> Step3A[3A. Execute 3-Tier Redaction Engine<br/>• UltraFace ONNX WebGPU<br/>• DOM Password & Input Redaction<br/>• Regex Luhn/Verhoeff Filters]:::stepNode
    Dec1 -- No --> Step3B[3B. Generate Baseline Ephemeral Tokens]:::stepNode

    Step3A --> Step4[4. Apply Canvas Blackout Rectangles & Gaussian Blur]:::stepNode
    Step3B --> Step5
    Step4 --> Step5[5. Map Interactive Elements to Ephemeral IDs: el_1, el_2, ...]:::stepNode

    %% DECISION 2: PIXEL LEAK AUDIT (FAIL-CLOSED)
    Step5 --> Dec2{Gate 1: Post-Redaction Pixel Leak Audit Passed?}:::safetyGate

    Dec2 -- FAIL: Leak Detected --> Abort1[❌ FAIL-CLOSED ABORT<br/>Halt Network Request & Alert User]:::safetyGate
    Dec2 -- PASS: Clean Buffer --> Dec3{Gate 2: Action Cache Hit via Differential Delta?}:::decisionNode

    Dec3 -- Hit: Delta Unchanged --> FastPath[⚡ Fast-Path Action Replay<br/>0ms VLM Latency]:::actionNode
    Dec3 -- Miss: State Mutated --> Step6[6. Dispatch Sanitized Payload to Server Gateway via HTTPS]:::stepNode

    Step6 --> Step7[7. Open-Weights VLM Ingestion & Multi-Modal Visual Grounding]:::stepNode
    Step7 --> Step8[8. Emit Closed-Schema Action Proposal JSON]:::stepNode

    %% DECISION 3: SCHEMA VALIDATION
    Step8 --> Dec4{Gate 3: Action Schema & Grounding Valid?}:::decisionNode

    Dec4 -- Invalid / Unbound --> StepRetry[🔄 Dynamic Zoom & Crop Fallback<br/>Bounded Re-perception Retry]:::fallbackNode
    StepRetry --> Step2

    Dec4 -- Valid Proposal --> Dec5{Gate 4: Action Risk Level Classification?}:::decisionNode

    %% BRANCHING RISK GATES
    Dec5 -- Blocked: Credential Tamper --> BlockAction[🚫 Permanent Block: Direct Credential Access Prohibited]:::safetyGate
    Dec5 -- Protected: Submit / Pay / Delete --> HumanGate{Gate 5: User Confirms via Modal?}:::safetyGate
    Dec5 -- Safe: Click / Scroll / Read --> Step9[9. Action Dispatcher: Inject Synthetic Event via Prototype Setter]:::actionNode

    HumanGate -- Rejected --> CancelStep[⏹️ User Cancelled Action Proposal]:::stepNode
    HumanGate -- Approved --> Step9

    FastPath --> Step9
    Step9 --> Step10[10. Await DOM Transition & MutationObserver Watchdog]:::stepNode

    %% DECISION 4: POSTCONDITION VERIFICATION
    Step10 --> Dec6{Gate 6: Semantic Postcondition Verified?}:::decisionNode

    Dec6 -- Verified Success --> Dec7{Task Objective Completed?}:::decisionNode
    Dec6 -- State Unchanged / Stale --> SelfHeal[🩺 Self-Healing Re-alignment<br/>Re-evaluate Target Anchor]:::fallbackNode
    SelfHeal --> Step2

    Dec7 -- Yes --> Finish([🏁 TASK SUCCESS: Goal Satisfied]):::startNode
    Dec7 -- No: Multi-Step Required --> Step2
```
