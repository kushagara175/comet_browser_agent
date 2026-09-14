// node_modules/orbloom/src/audio-calibration.js
var DEFAULTS = Object.freeze({
  absoluteGateDb: -55,
  initialNoiseFloorDb: -60,
  minimumNoiseFloorDb: -96,
  maximumNoiseFloorDb: -24,
  openMarginDb: 11,
  closeMarginDb: 8,
  hangoverSeconds: 0.2,
  noiseWindowSeconds: 6,
  stableNoiseWindowSeconds: 0.6,
  stableNoiseMinimumSeconds: 0.3,
  stableNoiseDeviationDb: 1.25,
  stableNoiseCeilingDb: -28,
  noiseRiseSeconds: 3,
  stableNoiseRiseSeconds: 0.35,
  activeNoiseRiseSeconds: 12,
  noiseFallSeconds: 0.12,
  referenceWindowSeconds: 4,
  initialSpeechReferenceDb: -22,
  minimumSpeechReferenceDb: -32,
  maximumSpeechReferenceDb: -12,
  minimumSpeechRangeDb: 12,
  louderReferenceSeconds: 0.65,
  quieterReferenceSeconds: 1.4,
  referencePercentile: 0.95,
  outputGamma: 1.6,
  warmupSeconds: 0
});
var DECIBEL_OPTIONS = [
  "absoluteGateDb",
  "initialNoiseFloorDb",
  "minimumNoiseFloorDb",
  "maximumNoiseFloorDb",
  "stableNoiseCeilingDb",
  "initialSpeechReferenceDb",
  "minimumSpeechReferenceDb",
  "maximumSpeechReferenceDb"
];
var POSITIVE_OPTIONS = [
  "noiseWindowSeconds",
  "stableNoiseWindowSeconds",
  "noiseRiseSeconds",
  "stableNoiseRiseSeconds",
  "activeNoiseRiseSeconds",
  "noiseFallSeconds",
  "referenceWindowSeconds",
  "minimumSpeechRangeDb",
  "louderReferenceSeconds",
  "quieterReferenceSeconds",
  "outputGamma"
];
var NON_NEGATIVE_OPTIONS = [
  "openMarginDb",
  "closeMarginDb",
  "hangoverSeconds",
  "stableNoiseMinimumSeconds",
  "stableNoiseDeviationDb",
  "warmupSeconds"
];
function clamp(value, minimum, maximum) {
  return Math.min(maximum, Math.max(minimum, value));
}
function approach(current, target, deltaSeconds, timeConstant) {
  if (!(deltaSeconds > 0)) return current;
  return current + (target - current) * (1 - Math.exp(-deltaSeconds / timeConstant));
}
function percentile(values, fraction) {
  if (values.length === 0) return Number.NaN;
  const ordered = [...values].sort((left, right) => left - right);
  const index = (ordered.length - 1) * clamp(fraction, 0, 1);
  const lower = Math.floor(index);
  const upper = Math.ceil(index);
  const mix = index - lower;
  return ordered[lower] * (1 - mix) + ordered[upper] * mix;
}
function standardDeviation(values) {
  if (values.length < 2) return Number.POSITIVE_INFINITY;
  const mean = values.reduce((total, value) => total + value, 0) / values.length;
  const variance = values.reduce((total, value) => {
    const difference = value - mean;
    return total + difference * difference;
  }, 0) / values.length;
  return Math.sqrt(variance);
}
function requireFiniteRange(options, name, minimum, maximum, minimumInclusive = true) {
  const value = options[name];
  const aboveMinimum = minimumInclusive ? value >= minimum : value > minimum;
  if (!Number.isFinite(value) || !aboveMinimum || value > maximum) {
    const lower = minimumInclusive ? "between" : "greater than";
    const upper = minimumInclusive ? ` and ${maximum}` : ` and no more than ${maximum}`;
    throw new RangeError(`${name} must be ${lower} ${minimum}${upper}.`);
  }
}
function normalizeOptions(options) {
  if (!options || typeof options !== "object" || Array.isArray(options)) {
    throw new TypeError("Audio calibration options must be an object.");
  }
  for (const key of Object.keys(options)) {
    if (!Object.hasOwn(DEFAULTS, key)) {
      throw new TypeError(`${key} is not a supported audio calibration option.`);
    }
  }
  const normalized = { ...DEFAULTS, ...options };
  for (const name of DECIBEL_OPTIONS) requireFiniteRange(normalized, name, -120, 0);
  for (const name of POSITIVE_OPTIONS) requireFiniteRange(normalized, name, 0, 120, false);
  for (const name of NON_NEGATIVE_OPTIONS) requireFiniteRange(normalized, name, 0, 120);
  requireFiniteRange(normalized, "referencePercentile", 0, 1);
  if (normalized.minimumNoiseFloorDb > normalized.initialNoiseFloorDb || normalized.initialNoiseFloorDb > normalized.maximumNoiseFloorDb) {
    throw new RangeError("initialNoiseFloorDb must be between the minimum and maximum noise floor.");
  }
  if (normalized.minimumSpeechReferenceDb > normalized.initialSpeechReferenceDb || normalized.initialSpeechReferenceDb > normalized.maximumSpeechReferenceDb) {
    throw new RangeError("initialSpeechReferenceDb must be between the minimum and maximum speech reference.");
  }
  if (normalized.closeMarginDb > normalized.openMarginDb) {
    throw new RangeError("closeMarginDb must not exceed openMarginDb.");
  }
  if (normalized.stableNoiseMinimumSeconds > normalized.stableNoiseWindowSeconds) {
    throw new RangeError("stableNoiseMinimumSeconds must not exceed stableNoiseWindowSeconds.");
  }
  return Object.freeze(normalized);
}
function measureRmsDb(samples) {
  if (!samples?.length) return -120;
  let mean = 0;
  for (let index = 0; index < samples.length; index += 1) mean += samples[index];
  mean /= samples.length;
  let energy = 0;
  for (let index = 0; index < samples.length; index += 1) {
    const centered = samples[index] - mean;
    energy += centered * centered;
  }
  const rms = Math.sqrt(energy / samples.length);
  return clamp(20 * Math.log10(Math.max(rms, 1e-6)), -120, 0);
}
var AudioLevelCalibrator = class {
  constructor(options = {}) {
    this.options = normalizeOptions(options);
    this.reset();
  }
  reset() {
    const { initialNoiseFloorDb, initialSpeechReferenceDb } = this.options;
    this.time = 0;
    this.lastTimestamp = null;
    this.noiseFloorDb = initialNoiseFloorDb;
    this.speechReferenceDb = initialSpeechReferenceDb;
    this.active = false;
    this.belowGateSeconds = 0;
    this.noiseLevels = [];
    this.speechLevels = [];
    this.last = Object.freeze({
      level: 0,
      levelDb: -120,
      noiseFloorDb: this.noiseFloorDb,
      gateOpenDb: this.options.absoluteGateDb,
      gateCloseDb: this.options.absoluteGateDb,
      speechReferenceDb: this.speechReferenceDb,
      active: false,
      stableNoise: false,
      warmingUp: this.options.warmupSeconds > 0
    });
  }
  process(samples, timestampSeconds) {
    return this.processDb(measureRmsDb(samples), timestampSeconds);
  }
  processDb(levelDb, timestampSeconds) {
    const numericTimestamp = Number(timestampSeconds);
    const hasTimestamp = Number.isFinite(numericTimestamp);
    let deltaSeconds = 1 / 60;
    if (hasTimestamp && this.lastTimestamp !== null) {
      deltaSeconds = clamp(numericTimestamp - this.lastTimestamp, 1 / 240, 0.1);
    }
    if (hasTimestamp) this.lastTimestamp = numericTimestamp;
    this.time += deltaSeconds;
    const numericLevelDb = Number(levelDb);
    const measuredDb = clamp(Number.isFinite(numericLevelDb) ? numericLevelDb : -120, -120, 0);
    this.noiseLevels.push({ time: this.time, value: measuredDb });
    const noiseCutoff = this.time - this.options.noiseWindowSeconds;
    while (this.noiseLevels[0]?.time < noiseCutoff) this.noiseLevels.shift();
    const stableCutoff = this.time - this.options.stableNoiseWindowSeconds;
    const stableEntries = this.noiseLevels.filter((entry) => entry.time >= stableCutoff);
    const stableValues = stableEntries.map((entry) => entry.value);
    const stableDuration = stableEntries.length > 1 ? stableEntries.at(-1).time - stableEntries[0].time : 0;
    const stableNoise = stableDuration >= this.options.stableNoiseMinimumSeconds && measuredDb <= this.options.stableNoiseCeilingDb && standardDeviation(stableValues) <= this.options.stableNoiseDeviationDb;
    const noiseTarget = clamp(
      percentile(this.noiseLevels.map((entry) => entry.value), 0.2),
      this.options.minimumNoiseFloorDb,
      this.options.maximumNoiseFloorDb
    );
    const noiseTimeConstant = noiseTarget < this.noiseFloorDb ? this.options.noiseFallSeconds : stableNoise ? this.options.stableNoiseRiseSeconds : this.active ? this.options.activeNoiseRiseSeconds : this.options.noiseRiseSeconds;
    this.noiseFloorDb = approach(
      this.noiseFloorDb,
      noiseTarget,
      deltaSeconds,
      noiseTimeConstant
    );
    const gateOpenDb = Math.max(
      this.options.absoluteGateDb,
      this.noiseFloorDb + this.options.openMarginDb
    );
    const gateCloseDb = Math.max(
      this.options.absoluteGateDb - 3,
      this.noiseFloorDb + this.options.closeMarginDb
    );
    if (this.active) {
      if (measuredDb >= gateCloseDb) {
        this.belowGateSeconds = 0;
      } else {
        this.belowGateSeconds += deltaSeconds;
        if (this.belowGateSeconds >= this.options.hangoverSeconds) {
          this.active = false;
          this.belowGateSeconds = 0;
        }
      }
    } else if (measuredDb >= gateOpenDb) {
      this.active = true;
      this.belowGateSeconds = 0;
    }
    if (this.active && !stableNoise && measuredDb >= gateOpenDb) {
      this.speechLevels.push({ time: this.time, value: measuredDb });
    }
    const speechCutoff = this.time - this.options.referenceWindowSeconds;
    while (this.speechLevels[0]?.time < speechCutoff) this.speechLevels.shift();
    if (this.speechLevels.length >= 12) {
      const minimumReference = Math.min(
        this.options.maximumSpeechReferenceDb,
        Math.max(
          this.options.minimumSpeechReferenceDb,
          gateOpenDb + this.options.minimumSpeechRangeDb
        )
      );
      const referenceTarget = clamp(
        percentile(
          this.speechLevels.map((entry) => entry.value),
          this.options.referencePercentile
        ),
        minimumReference,
        this.options.maximumSpeechReferenceDb
      );
      const referenceTimeConstant = referenceTarget > this.speechReferenceDb ? this.options.louderReferenceSeconds : this.options.quieterReferenceSeconds;
      this.speechReferenceDb = approach(
        this.speechReferenceDb,
        referenceTarget,
        deltaSeconds,
        referenceTimeConstant
      );
    }
    const speechRangeDb = Math.max(
      this.options.minimumSpeechRangeDb,
      this.speechReferenceDb - gateOpenDb
    );
    const normalized = clamp((measuredDb - gateOpenDb) / speechRangeDb, 0, 1);
    const warmingUp = this.time < this.options.warmupSeconds;
    const level = this.active && !stableNoise && !warmingUp ? Math.pow(normalized, this.options.outputGamma) : 0;
    this.last = Object.freeze({
      level,
      levelDb: measuredDb,
      noiseFloorDb: this.noiseFloorDb,
      gateOpenDb,
      gateCloseDb,
      speechReferenceDb: this.speechReferenceDb,
      active: this.active,
      stableNoise,
      warmingUp
    });
    return level;
  }
};
var audioCalibrationDefaults = DEFAULTS;

// node_modules/orbloom/src/audio.js
var mediaGraphs = /* @__PURE__ */ new WeakMap();
function isAnalyserNode(value) {
  return typeof AnalyserNode !== "undefined" && value instanceof AnalyserNode;
}
function canAnalyzeMediaElement(element) {
  try {
    if (element.crossOrigin === "anonymous" || element.crossOrigin === "use-credentials") return true;
    const source = element.currentSrc || element.src;
    if (!source) return false;
    return new URL(source, location.href).origin === location.origin;
  } catch {
    return false;
  }
}
function analyze(analyser, setLevel, calibrationOptions) {
  const samples = new Float32Array(analyser.fftSize);
  const byteSamples = typeof analyser.getFloatTimeDomainData === "function" ? null : new Uint8Array(analyser.fftSize);
  const calibrator = new AudioLevelCalibrator(calibrationOptions);
  let frame = 0;
  const update = () => {
    frame = requestAnimationFrame(update);
    if (byteSamples) {
      analyser.getByteTimeDomainData(byteSamples);
      for (let index = 0; index < samples.length; index += 1) {
        samples[index] = (byteSamples[index] - 128) / 128;
      }
    } else {
      analyser.getFloatTimeDomainData(samples);
    }
    setLevel(calibrator.process(samples, performance.now() / 1e3));
  };
  frame = requestAnimationFrame(update);
  return () => {
    cancelAnimationFrame(frame);
    setLevel(0);
  };
}
function attachAudioSource(source, setLevel, options = {}) {
  if (typeof setLevel !== "function") throw new TypeError("setLevel must be a function");
  const { calibration } = options;
  if (isAnalyserNode(source)) return analyze(source, setLevel, calibration);
  if (!(source instanceof HTMLMediaElement)) {
    throw new TypeError("Expected an HTMLMediaElement or AnalyserNode");
  }
  if (!canAnalyzeMediaElement(source)) {
    throw new Error("Cross-origin media requires a compatible CORS response before it can drive the orb.");
  }
  let graph = mediaGraphs.get(source);
  if (!graph) {
    const context = new AudioContext();
    const mediaSource = context.createMediaElementSource(source);
    const highPass = context.createBiquadFilter();
    const analyser = context.createAnalyser();
    const analysisMonitor = context.createGain();
    highPass.type = "highpass";
    highPass.frequency.value = 80;
    highPass.Q.value = 0.707;
    analyser.fftSize = 1024;
    analyser.smoothingTimeConstant = 0;
    analysisMonitor.gain.value = 0;
    mediaSource.connect(context.destination);
    mediaSource.connect(highPass);
    highPass.connect(analyser);
    analyser.connect(analysisMonitor);
    analysisMonitor.connect(context.destination);
    graph = { analyser, analysisMonitor, context, highPass, mediaSource };
    mediaGraphs.set(source, graph);
  }
  graph.context.resume();
  return analyze(graph.analyser, setLevel, calibration);
}
async function attachMicrophone(setLevel, options = {}) {
  if (typeof setLevel !== "function") throw new TypeError("setLevel must be a function");
  if (!navigator.mediaDevices?.getUserMedia) {
    throw new Error("Microphone capture is unavailable in this browser.");
  }
  const requestedConstraints = options.constraints ?? {
    audio: {
      echoCancellation: { ideal: true },
      noiseSuppression: { ideal: true },
      autoGainControl: { ideal: false },
      channelCount: { ideal: 1 }
    }
  };
  const stream = await navigator.mediaDevices.getUserMedia(requestedConstraints);
  const context = new AudioContext();
  const microphone = context.createMediaStreamSource(stream);
  const highPass = context.createBiquadFilter();
  const analyser = context.createAnalyser();
  const analysisMonitor = context.createGain();
  highPass.type = "highpass";
  highPass.frequency.value = 80;
  highPass.Q.value = 0.707;
  analyser.fftSize = 1024;
  analyser.smoothingTimeConstant = 0;
  analysisMonitor.gain.value = 0;
  microphone.connect(highPass);
  highPass.connect(analyser);
  analyser.connect(analysisMonitor);
  analysisMonitor.connect(context.destination);
  await context.resume();
  const detach = analyze(analyser, setLevel, {
    warmupSeconds: 0.35,
    ...options.calibration
  });
  return () => {
    detach();
    microphone.disconnect();
    highPass.disconnect();
    analyser.disconnect();
    analysisMonitor.disconnect();
    stream.getTracks().forEach((track) => track.stop());
    context.close();
  };
}
function releaseAudioSource(element) {
  const graph = mediaGraphs.get(element);
  if (!graph) return;
  mediaGraphs.delete(element);
  graph.mediaSource.disconnect();
  graph.highPass.disconnect();
  graph.analyser.disconnect();
  graph.analysisMonitor.disconnect();
  graph.context.close();
}

// node_modules/orbloom/src/motion.js
function createOrbMotionState(phase) {
  return {
    phase,
    audioSmooth: 0,
    audioFast: 0,
    spinDir: 1,
    spinVel: 0,
    prevA: 0,
    flipQueued: false,
    oscSign: 1,
    spin: phase * 3.7,
    lastT: null
  };
}
function advanceOrbMotion(state, time, audioLevel, motion = void 0) {
  const delta = state.lastT === null ? 0 : Math.min(0.1, Math.max(0, time - state.lastT));
  state.lastT = time;
  const input = Math.min(1, Math.max(0, audioLevel));
  const speed = Math.min(2, Math.max(0, motion?.speed ?? 1));
  const driftAmount = Math.min(2, Math.max(0, motion?.drift ?? 1));
  const smoothConstant = input > state.audioSmooth ? 0.11 : 0.3;
  state.audioSmooth += (input - state.audioSmooth) * (delta > 0 ? 1 - Math.exp(-delta / smoothConstant) : 0);
  const fastConstant = input > state.audioFast ? 0.04 : 0.18;
  state.audioFast += (input - state.audioFast) * (delta > 0 ? 1 - Math.exp(-delta / fastConstant) : 0);
  const phaseVariance = 6.31 * state.phase % 1;
  const drift = driftAmount * 0.35 * Math.sin(
    time * (0.11 + 0.08 * (2.17 * state.phase % 1)) + state.phase
  );
  const oscillator = Math.sin(time * (0.45 + 0.2 * phaseVariance) + state.phase);
  if (Math.sign(oscillator) !== state.oscSign) {
    state.oscSign = Math.sign(oscillator);
    state.flipQueued = true;
  }
  if (state.flipQueued && state.audioFast < 0.18) {
    state.spinDir = -state.spinDir;
    state.flipQueued = false;
  }
  const targetVelocity = speed * (0.65 * (0.65 + 0.7 * phaseVariance) * (1 + drift) + state.spinDir * state.audioFast * 2.2);
  state.spinVel += (targetVelocity - state.spinVel) * (delta > 0 ? 1 - Math.exp(-delta / 0.35) : 0);
  const attack = Math.max(0, state.audioFast - state.prevA);
  state.prevA = state.audioFast;
  state.spinVel += state.spinDir * Math.min(6 * attack, 1.4) * delta * 14 * speed;
  state.spin += state.spinVel * delta;
  return state;
}

// node_modules/orbloom/src/presets.js
var archetypeIndices = Object.freeze({
  spiral: 0,
  nebula: 1,
  core: 2,
  "deep-field": 3
});
var staticAmbientMotion = Object.freeze({
  enabled: false,
  verticalTravel: 0,
  scale: 1,
  durationSeconds: 0,
  delaySeconds: 0
});
var defaultAmbientMotion = Object.freeze({
  enabled: true,
  verticalTravel: 8,
  scale: 1,
  durationSeconds: 7,
  delaySeconds: 0
});
var defaultAppearance = Object.freeze({ detail: 1, glow: 1, intensity: 1 });
var defaultMotion = Object.freeze({ drift: 1, speed: 1 });
var defaultAudioResponse = Object.freeze({ brightness: 1, motion: 1, pulse: 1 });
var defaultInteriorColor = Object.freeze([0, 0, 0]);
function defineVariant({
  accentColors,
  ambientMotion = staticAmbientMotion,
  archetype,
  baseColor,
  lensStrength,
  phase,
  referenceDiameter = 264
}) {
  return Object.freeze({
    accentColors: Object.freeze([...accentColors]),
    ambientMotion: Object.freeze({ ...ambientMotion }),
    archetype,
    baseColor,
    lensStrength: lensStrength ?? (referenceDiameter >= 48 ? 0.4 : 0),
    phase,
    referenceDiameter
  });
}
var DEFAULT_VARIANT_ID = "core-teal-01";
var orbArchetypes = Object.freeze([
  "core",
  "spiral",
  "nebula",
  "deep-field"
]);
var orbVariantDefinitions = Object.freeze({
  "core-teal-01": defineVariant({
    archetype: "core",
    phase: 4.6,
    baseColor: "#07262B",
    accentColors: ["#00C2A8", "#38E1FF", "#FFC65C"],
    referenceDiameter: 264,
    ambientMotion: { ...defaultAmbientMotion, verticalTravel: 10 }
  }),
  "spiral-pink-01": defineVariant({
    archetype: "spiral",
    phase: 6.05,
    baseColor: "#2A0F22",
    accentColors: ["#FF7ECB", "#D14FFF", "#FFDCF2"],
    referenceDiameter: 244,
    ambientMotion: {
      enabled: true,
      verticalTravel: 5,
      scale: 1.03,
      durationSeconds: 6.5,
      delaySeconds: 0
    }
  }),
  "nebula-pink-01": defineVariant({
    archetype: "nebula",
    phase: 4.083,
    baseColor: "#241627",
    accentColors: ["#FFC9E0", "#E4A8FF", "#FFE9F4"],
    referenceDiameter: 186,
    ambientMotion: {
      enabled: true,
      verticalTravel: 5,
      scale: 1.03,
      durationSeconds: 7.8,
      delaySeconds: 0.4
    }
  }),
  "spiral-cyan-01": defineVariant({
    archetype: "spiral",
    phase: 1.285,
    baseColor: "#0A1B2E",
    accentColors: ["#38BDF8", "#0E7BD1", "#CFF2FF"],
    referenceDiameter: 150,
    ambientMotion: {
      enabled: true,
      verticalTravel: 5,
      scale: 1.03,
      durationSeconds: 9.1,
      delaySeconds: 0.8
    }
  }),
  "spiral-cyan-02": defineVariant({
    archetype: "spiral",
    phase: 2.502,
    baseColor: "#101B2E",
    accentColors: ["#7DBED4", "#6E8BFF", "#A24DFF"],
    referenceDiameter: 208,
    ambientMotion: { ...defaultAmbientMotion, verticalTravel: 9 }
  }),
  "nebula-violet-01": defineVariant({
    archetype: "nebula",
    phase: 1.995,
    baseColor: "#1C0A2B",
    accentColors: ["#A24DFF", "#FF4DD8", "#6E8BFF"],
    referenceDiameter: 260,
    ambientMotion: { ...defaultAmbientMotion, verticalTravel: 9 }
  }),
  "core-blue-01": defineVariant({
    archetype: "core",
    phase: 5.016,
    baseColor: "#131A2E",
    accentColors: ["#2563EB", "#FF2D87", "#FFD086"],
    referenceDiameter: 42,
    lensStrength: 0
  }),
  "spiral-orange-01": defineVariant({
    archetype: "spiral",
    phase: 2.289,
    baseColor: "#5C4030",
    accentColors: ["#D86A3D", "#FFB873", "#FFE3C2"],
    referenceDiameter: 42,
    lensStrength: 0
  }),
  "nebula-cyan-01": defineVariant({
    archetype: "nebula",
    phase: 0.432,
    baseColor: "#2E4250",
    accentColors: ["#7DBED4", "#C5A8E8", "#F4F4F8"],
    referenceDiameter: 42,
    lensStrength: 0
  }),
  "core-cyan-01": defineVariant({
    archetype: "core",
    phase: 1.573,
    baseColor: "#0A2438",
    accentColors: ["#3DA5D9", "#5FC9D8", "#A6E5E5"],
    referenceDiameter: 42,
    lensStrength: 0
  }),
  "core-lime-01": defineVariant({
    archetype: "core",
    phase: 1.542,
    baseColor: "#1A3A20",
    accentColors: ["#7BAE48", "#A8B85C", "#F4E4A8"],
    referenceDiameter: 42,
    lensStrength: 0
  }),
  "nebula-orange-01": defineVariant({
    archetype: "nebula",
    phase: 0.108,
    baseColor: "#301608",
    accentColors: ["#FFB25C", "#FF7E45", "#FFE9CE"]
  }),
  "core-blue-02": defineVariant({
    archetype: "core",
    phase: 4.401,
    baseColor: "#0E1A34",
    accentColors: ["#5C8DFF", "#3452D9", "#DCE8FF"]
  }),
  "deep-field-cyan-01": defineVariant({
    archetype: "deep-field",
    phase: 5.402,
    baseColor: "#0F2024",
    accentColors: ["#5FB7C4", "#33808F", "#DDF4F7"]
  }),
  "deep-field-green-01": defineVariant({
    archetype: "deep-field",
    phase: 1.89,
    baseColor: "#0C2414",
    accentColors: ["#57D98A", "#2FA05C", "#DFFBE9"]
  }),
  "core-red-01": defineVariant({
    archetype: "core",
    phase: 1.577,
    baseColor: "#2A0A10",
    accentColors: ["#FF3B4E", "#B01C3A", "#FF9860"]
  }),
  "core-orange-01": defineVariant({
    archetype: "core",
    phase: 0.287,
    baseColor: "#301004",
    accentColors: ["#FF7A18", "#FFB340", "#FF4E2A"]
  }),
  "deep-field-blue-01": defineVariant({
    archetype: "deep-field",
    phase: 2.619,
    baseColor: "#0E1230",
    accentColors: ["#8FA8FF", "#5B6CFF", "#E8ECFF"]
  }),
  "nebula-blue-01": defineVariant({
    archetype: "nebula",
    phase: 0.484,
    baseColor: "#1B1E33",
    accentColors: ["#C7CFFF", "#9FB4E8", "#F2F4FF"]
  }),
  "spiral-violet-01": defineVariant({
    archetype: "spiral",
    phase: 5.961,
    baseColor: "#221434",
    accentColors: ["#C084FC", "#F0A6FF", "#FFD1EC"]
  }),
  "deep-field-yellow-01": defineVariant({
    archetype: "deep-field",
    phase: 2.497,
    baseColor: "#171310",
    accentColors: ["#E8C98A", "#B08A50", "#FFF2D8"]
  }),
  "core-yellow-01": defineVariant({
    archetype: "core",
    phase: 0.224,
    baseColor: "#2E1E04",
    accentColors: ["#FFD54A", "#FFB300", "#FFF3B0"]
  }),
  "core-orange-02": defineVariant({
    archetype: "core",
    phase: 4.701,
    baseColor: "#2E1408",
    accentColors: ["#FF8A4C", "#FFC24B", "#FF5E62"]
  }),
  "deep-field-teal-01": defineVariant({
    archetype: "deep-field",
    phase: 1.778,
    baseColor: "#0A2220",
    accentColors: ["#63D8C2", "#2E9E8C", "#DFFCF4"]
  }),
  "spiral-cyan-03": defineVariant({
    archetype: "spiral",
    phase: 3.465,
    baseColor: "#101632",
    accentColors: ["#4CC9F0", "#7B5CFF", "#B8F1FF"]
  }),
  "spiral-blue-01": defineVariant({
    archetype: "spiral",
    phase: 1.258,
    baseColor: "#141B26",
    accentColors: ["#7FA6C9", "#4A7196", "#DCE8F2"]
  }),
  "spiral-cyan-04": defineVariant({
    archetype: "spiral",
    phase: 0.825,
    baseColor: "#0E2030",
    accentColors: ["#4FC3F7", "#8BE38B", "#E1F7FF"]
  }),
  "nebula-red-01": defineVariant({
    archetype: "nebula",
    phase: 1.692,
    baseColor: "#2A1418",
    accentColors: ["#FF9DA0", "#FFC6A8", "#FFE8E0"]
  }),
  "deep-field-orange-01": defineVariant({
    archetype: "deep-field",
    phase: 2.167,
    baseColor: "#221408",
    accentColors: ["#D9A05B", "#A0693A", "#FFE0B8"]
  }),
  "core-lime-02": defineVariant({
    archetype: "core",
    phase: 3.431,
    baseColor: "#12240E",
    accentColors: ["#9BE84C", "#3ED598", "#EAFFC9"]
  }),
  "nebula-yellow-01": defineVariant({
    archetype: "nebula",
    phase: 1.461,
    baseColor: "#26200C",
    accentColors: ["#FFE08A", "#F4C14F", "#FFF8E0"]
  }),
  "spiral-orange-02": defineVariant({
    archetype: "spiral",
    phase: 1.878,
    baseColor: "#26160C",
    accentColors: ["#E88B4E", "#C9653A", "#F7D9B8"]
  }),
  "nebula-orange-02": defineVariant({
    archetype: "nebula",
    phase: 0.365,
    baseColor: "#251106",
    accentColors: ["#FFAD33", "#E86A2C", "#FFE2A8"]
  }),
  "deep-field-blue-02": defineVariant({
    archetype: "deep-field",
    phase: 0.757,
    baseColor: "#14161C",
    accentColors: ["#9AA6B8", "#5E6B80", "#E6ECF5"]
  }),
  "nebula-violet-02": defineVariant({
    archetype: "nebula",
    phase: 3.978,
    baseColor: "#1A1430",
    accentColors: ["#A78BFA", "#F0ABFC", "#E0E7FF"]
  }),
  "deep-field-teal-02": defineVariant({
    archetype: "deep-field",
    phase: 6.142,
    baseColor: "#0F1F24",
    accentColors: ["#5EEAD4", "#99F6E4", "#E0F2FE"]
  })
});
var orbVariantIds = Object.freeze(Object.keys(orbVariantDefinitions).sort());
function hexToRgb(hex) {
  return Object.freeze([
    Number.parseInt(hex.slice(1, 3), 16) / 255,
    Number.parseInt(hex.slice(3, 5), 16) / 255,
    Number.parseInt(hex.slice(5, 7), 16) / 255
  ]);
}
function resolveVariant(id = DEFAULT_VARIANT_ID) {
  const resolvedId = Object.hasOwn(orbVariantDefinitions, id) ? id : DEFAULT_VARIANT_ID;
  const definition = orbVariantDefinitions[resolvedId];
  return Object.freeze({
    id: resolvedId,
    phase: definition.phase,
    archetype: definition.archetype,
    archetypeIndex: archetypeIndices[definition.archetype],
    interiorColor: defaultInteriorColor,
    baseColor: hexToRgb(definition.baseColor),
    accentColors: Object.freeze(definition.accentColors.map(hexToRgb)),
    lensStrength: definition.lensStrength,
    appearance: defaultAppearance,
    motion: defaultMotion,
    audioResponse: defaultAudioResponse,
    ambientMotion: definition.ambientMotion,
    referenceDiameter: definition.referenceDiameter,
    renderProfile: definition.lensStrength > 0 ? "layered" : "compact"
  });
}

// node_modules/orbloom/src/customization.js
var TAU = Math.PI * 2;
var HEX_COLOR = /^#[0-9a-f]{6}$/i;
var THEME_ID = /^[a-z][a-z0-9-]{0,63}$/;
var defaultAppearance2 = Object.freeze({
  detail: 1,
  glow: 1,
  intensity: 1
});
var defaultMotion2 = Object.freeze({
  drift: 1,
  speed: 1
});
var defaultAudioResponse2 = Object.freeze({
  brightness: 1,
  motion: 1,
  pulse: 1
});
var orbCustomizationDefaults = Object.freeze({
  appearance: defaultAppearance2,
  audioResponse: defaultAudioResponse2,
  motion: defaultMotion2
});
var orbStates = Object.freeze([
  "idle",
  "listening",
  "thinking",
  "speaking",
  "success",
  "error"
]);
var orbQualityProfiles = Object.freeze({
  low: Object.freeze({ frameRate: 30, maxPixelRatio: 1, maxResolution: 512 }),
  balanced: Object.freeze({ frameRate: 45, maxPixelRatio: 1.5, maxResolution: 896 }),
  high: Object.freeze({ frameRate: 60, maxPixelRatio: 2, maxResolution: 1280 })
});
function requireObject(value, name) {
  if (value === void 0) return {};
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new TypeError(`${name} must be an object.`);
  }
  return value;
}
function requireKnownKeys(value, keys, name) {
  for (const key of Object.keys(value)) {
    if (!keys.includes(key)) throw new TypeError(`${name}.${key} is not a supported option.`);
  }
}
function numberInRange(value, fallback, minimum, maximum, name) {
  if (value === void 0) return fallback;
  const number = Number(value);
  if (!Number.isFinite(number) || number < minimum || number > maximum) {
    throw new RangeError(`${name} must be between ${minimum} and ${maximum}.`);
  }
  return number;
}
function normalizeHexColor(value, fallback, name) {
  if (value === void 0) return fallback;
  if (typeof value !== "string" || !HEX_COLOR.test(value)) {
    throw new TypeError(`${name} must use the #RRGGBB format.`);
  }
  return value.toUpperCase();
}
function hexToRgb2(hex) {
  return Object.freeze([
    Number.parseInt(hex.slice(1, 3), 16) / 255,
    Number.parseInt(hex.slice(3, 5), 16) / 255,
    Number.parseInt(hex.slice(5, 7), 16) / 255
  ]);
}
function normalizeSeed(value, fallback) {
  if (value === void 0) return fallback;
  const seed = Number(value);
  if (!Number.isFinite(seed)) throw new TypeError("seed must be a finite number.");
  return (seed % TAU + TAU) % TAU;
}
function freezeValues(values) {
  return Object.freeze({ ...values });
}
function createOrbTheme(options = {}) {
  const input = requireObject(options, "options");
  requireKnownKeys(input, ["appearance", "audioResponse", "colors", "id", "motion", "preset", "seed"], "options");
  const preset = input.preset ?? DEFAULT_VARIANT_ID;
  if (typeof preset !== "string" || !Object.hasOwn(orbVariantDefinitions, preset)) {
    throw new RangeError(`preset must be one of the registered orb variant IDs.`);
  }
  const base = resolveVariant(preset);
  const colors = requireObject(input.colors, "colors");
  const appearance = requireObject(input.appearance, "appearance");
  const motion = requireObject(input.motion, "motion");
  const audioResponse = requireObject(input.audioResponse, "audioResponse");
  requireKnownKeys(colors, ["accents", "base", "interior"], "colors");
  requireKnownKeys(appearance, ["detail", "glass", "glow", "intensity"], "appearance");
  requireKnownKeys(motion, ["drift", "speed"], "motion");
  requireKnownKeys(audioResponse, ["brightness", "motion", "pulse"], "audioResponse");
  const id = input.id ?? `${preset}-custom`;
  if (typeof id !== "string" || !THEME_ID.test(id)) {
    throw new TypeError("id must start with a letter and contain only lowercase letters, numbers, or hyphens.");
  }
  const baseHex = normalizeHexColor(colors.base, orbVariantDefinitions[preset].baseColor, "colors.base");
  const interiorHex = normalizeHexColor(colors.interior, "#000000", "colors.interior");
  let accentHex = orbVariantDefinitions[preset].accentColors;
  if (colors.accents !== void 0) {
    if (!Array.isArray(colors.accents) || colors.accents.length !== 3) {
      throw new TypeError("colors.accents must contain exactly three #RRGGBB colors.");
    }
    accentHex = colors.accents.map((color, index) => normalizeHexColor(color, void 0, `colors.accents[${index}]`));
  }
  const resolvedAppearance = freezeValues({
    detail: numberInRange(appearance.detail, 1, 0, 1, "appearance.detail"),
    glow: numberInRange(appearance.glow, 1, 0, 2, "appearance.glow"),
    intensity: numberInRange(appearance.intensity, 1, 0.25, 2, "appearance.intensity")
  });
  const resolvedMotion = freezeValues({
    drift: numberInRange(motion.drift, 1, 0, 2, "motion.drift"),
    speed: numberInRange(motion.speed, 1, 0, 2, "motion.speed")
  });
  const resolvedAudioResponse = freezeValues({
    brightness: numberInRange(audioResponse.brightness, 1, 0, 2, "audioResponse.brightness"),
    motion: numberInRange(audioResponse.motion, 1, 0, 2, "audioResponse.motion"),
    pulse: numberInRange(audioResponse.pulse, 1, 0, 2, "audioResponse.pulse")
  });
  const glass = numberInRange(appearance.glass, base.lensStrength, 0, 1, "appearance.glass");
  return Object.freeze({
    ...base,
    id,
    sourceVariantId: preset,
    phase: normalizeSeed(input.seed, base.phase),
    interiorColor: hexToRgb2(interiorHex),
    baseColor: hexToRgb2(baseHex),
    accentColors: Object.freeze(accentHex.map(hexToRgb2)),
    lensStrength: glass,
    renderProfile: glass > 0 ? "layered" : "compact",
    appearance: resolvedAppearance,
    motion: resolvedMotion,
    audioResponse: resolvedAudioResponse
  });
}
function resolveOrbQuality(value = "high") {
  if (typeof value !== "string" || !Object.hasOwn(orbQualityProfiles, value)) {
    throw new RangeError("quality must be low, balanced, or high.");
  }
  return orbQualityProfiles[value];
}
function resolveOrbState(value = "idle") {
  if (!orbStates.includes(value)) {
    throw new RangeError(`state must be one of: ${orbStates.join(", ")}.`);
  }
  return value;
}

// node_modules/orbloom/src/shaders.js
var vertexShaderSource = `
attribute vec2 aPosition;
attribute vec2 aTextureCoord;
varying vec2 vUv;

void main() {
  vUv = aTextureCoord;
  gl_Position = vec4(aPosition, 0.0, 1.0);
}
`;
var fragmentShaderSource = `
precision highp float;

varying vec2 vUv;
uniform vec2 uResolution;
uniform vec3 uInteriorColor;
uniform vec3 uBaseColor;
uniform vec3 uAccentPrimary;
uniform vec3 uAccentSecondary;
uniform vec3 uAccentHighlight;
uniform float uTime;
uniform float uSeed;
uniform float uAudioBrightness;
uniform float uAudioPulse;
uniform float uSpin;
uniform float uArchetype;
uniform float uGlass;
uniform float uVisualIntensity;
uniform float uDetail;
uniform float uGlow;
uniform float uState;
uniform float uStateBlend;

float scalarHash(float value) {
  return fract(sin(value * 127.1) * 43758.5453);
}

vec4 sampleSky(vec3 direction, float time) {
  float longitude = atan(direction.z, direction.x);
  float latitude = asin(clamp(direction.y, -1.0, 1.0));
  float varianceA = fract(uSeed * 7.13);
  float varianceB = fract(uSeed * 3.71);
  float varianceC = fract(uSeed * 5.37);

  float type = uArchetype >= 0.0 ? uArchetype : floor(fract(uSeed * 9.73) * 4.0);
  float nebulaType = step(0.5, type) * (1.0 - step(1.5, type));
  float coreType = step(1.5, type) * (1.0 - step(2.5, type));
  float deepType = step(2.5, type);

  float planeOffset = latitude
    + (0.15 + 0.4 * varianceA) * sin(longitude * (1.0 + floor(varianceB * 2.0)) + 1.3)
    + 0.12 * sin(longitude * 3.0 + time * 0.1);
  float band = exp(-planeOffset * planeOffset * (5.0 + 10.0 * varianceC));
  band = mix(band, max(band, 0.8), nebulaType);
  band *= 1.0 - 0.85 * deepType;

  float waveA = sin(longitude * 2.0 + sin(latitude * 3.0 + time * 0.25) * 1.6 + time * 0.15);
  float waveB = sin(longitude * 5.0 - sin(latitude * 4.0 - time * 0.2) * 1.2 - time * 0.22 + 2.4);
  float cloud = pow(0.5 + 0.5 * waveA, 2.0) * (0.45 + 0.55 * pow(0.5 + 0.5 * waveB, 2.0));
  float dustLane = pow(0.5 + 0.5 * sin(longitude * 4.0 + latitude * 7.0 + sin(longitude * 2.0) * 2.0), 3.0);
  float galaxy = clamp(band * cloud * (1.0 - dustLane * (0.55 + 0.35 * varianceB)), 0.0, 1.0);

  vec3 paletteHue = mix(
    mix(uAccentPrimary, uAccentSecondary, varianceA),
    mix(uAccentSecondary, uAccentHighlight, varianceC),
    0.5 + 0.5 * sin(longitude + latitude * 2.0 - time * 0.2)
  );
  vec3 greyHue = vec3(dot(paletteHue, vec3(0.299, 0.587, 0.114)));
  paletteHue = clamp(greyHue + (paletteHue - greyHue) * 1.45, 0.0, 1.0);
  vec3 dustColor = mix(vec3(0.72, 0.78, 0.92), paletteHue, 0.45 + 0.3 * varianceA + 0.45 * nebulaType);
  vec3 color = dustColor * galaxy * (0.6 + 0.9 * nebulaType);

  float shear = sin(longitude * 13.0 + latitude * 4.0 - time * 0.35)
    * sin(longitude * 5.0 + time * 0.2);
  color += dustColor * band * cloud * max(shear, 0.0) * 0.14;

  float secondPlane = latitude - (0.35 + 0.25 * varianceB) * sin(longitude * 2.0 - 1.1) + 0.4;
  float secondArm = exp(-secondPlane * secondPlane * 7.0) * cloud;
  color += mix(dustColor, uAccentSecondary, 0.35) * secondArm * 0.2;

  vec3 ambientColor = mix(
    vec3(0.04, 0.03, 0.1),
    mix(uAccentPrimary, mix(uAccentSecondary, uAccentHighlight, varianceC), varianceA) * 0.22,
    0.75
  );
  color += ambientColor * (0.5 + 0.22 * sin(time * 0.4 + longitude)) * (0.4 + 0.6 * band);
  color += vec3(1.0, 0.88, 0.68) * pow(band, 4.0) * pow(cloud, 2.0) * 0.4;

  float coreAngle = varianceB * 6.28318;
  vec3 coreDirection = normalize(vec3(cos(coreAngle) * 0.85, 0.6 * (varianceC - 0.5), sin(coreAngle) * 0.85));
  float bulge = max(dot(direction, coreDirection), 0.0);
  color += mix(vec3(1.0, 0.85, 0.6), uAccentHighlight, 0.25)
    * (pow(bulge, 14.0) * 1.6 + pow(bulge, 4.0) * 0.5) * coreType;

  float pocketA = pow(cloud, 5.0) * band * (0.7 + 0.3 * sin(time * 0.6 + longitude * 3.0));
  color += mix(uAccentHighlight, uAccentPrimary, fract(varianceA + 0.5 * sin(longitude * 2.0) + 0.5))
    * pocketA * (0.5 + 0.4 * varianceB + 0.8 * nebulaType);
  float pocketB = pow(0.5 + 0.5 * sin(longitude * 3.0 + latitude * 4.0 - time * 0.18 + 2.0), 6.0) * band;
  color += mix(uAccentSecondary, uAccentHighlight, varianceC) * pocketB * (0.25 + 0.3 * varianceA + 0.5 * nebulaType);

  float detail = smoothstep(90.0, 200.0, uResolution.y) * uDetail;
  vec2 grainGrid = vec2(longitude, latitude) * 34.0;
  vec2 grainCell = floor(grainGrid);
  vec2 grainLocal = fract(grainGrid);
  float grainHash = scalarHash(grainCell.x * 3.7 + grainCell.y * 11.3);
  vec2 grainPoint = vec2(
    0.2 + 0.6 * scalarHash(grainHash * 91.0),
    0.2 + 0.6 * scalarHash(grainHash * 47.0)
  );
  float grainDistance = length((grainLocal - grainPoint) * vec2(cos(latitude), 1.0));
  float resolutionFactor = clamp(uResolution.y / 420.0, 0.22, 1.0);
  float grain = exp(-grainDistance * grainDistance * 700.0 * resolutionFactor)
    * step(0.3, grainHash) * (0.15 + 0.85 * band);
  color += vec3(0.88, 0.9, 1.0) * grain * 0.4 * detail;
  float coverage = clamp(galaxy * 0.7 + pow(band, 4.0) * 0.25, 0.0, 1.0);

  for (int scaleIndex = 0; scaleIndex < 3; scaleIndex++) {
    float scale = scaleIndex == 0 ? 6.0 : (scaleIndex == 1 ? 11.0 : 19.0);
    vec2 grid = vec2(longitude, latitude) * scale;
    vec2 cell = floor(grid);
    vec2 local = fract(grid);
    float hashX = scalarHash(cell.x * 13.7 + cell.y * 7.3 + float(scaleIndex) * 91.0);
    float hashY = scalarHash(cell.x * 5.1 + cell.y * 17.9 + float(scaleIndex) * 37.0);
    vec2 starPoint = vec2(0.15 + 0.7 * hashX, 0.15 + 0.7 * hashY);
    float distanceToStar = length((local - starPoint) * vec2(cos(latitude), 1.0));
    float census = (varianceB - 0.5) * 0.2 + 0.35 * nebulaType - 0.2 * coreType + 0.3 * deepType;
    float threshold = scaleIndex == 2 ? 0.3 : 0.55;
    float keep = step(threshold + census, scalarHash(hashX * 89.0 + hashY * 31.0) + band * 0.25);
    float twinkle = mix(
      0.92,
      0.6 + 0.4 * sin(time * (1.5 + 3.0 * hashX) + hashX * 40.0),
      resolutionFactor
    );
    float sizeHash = scalarHash(hashX * 53.0 + hashY * 71.0 + cell.x);
    float magnitude = 0.35 + 1.8 * sizeHash * sizeHash;
    float sharpness = (scaleIndex == 0 ? 260.0 : (scaleIndex == 1 ? 700.0 : 1600.0))
      / magnitude * resolutionFactor;
    float star = exp(-distanceToStar * distanceToStar * sharpness) * keep * twinkle;
    vec3 temperature = hashX < 0.33
      ? vec3(0.85, 0.9, 1.0)
      : (hashX < 0.66 ? vec3(1.0, 0.95, 0.85) : mix(vec3(1.0), uAccentSecondary, 0.3));
    vec3 tint = mix(vec3(1.0), temperature, 0.6);
    float brightness = (scaleIndex == 0 ? 1.7 : (scaleIndex == 1 ? 0.9 : 0.5))
      * (0.55 + 0.7 * magnitude);
    float scaleFade = mix(scaleIndex == 2 ? 0.14 : 0.45, 1.0, detail);
    color += tint * star * brightness * scaleFade;

    if (scaleIndex == 0) {
      float largeStar = smoothstep(1.2, 2.0, magnitude);
      color += tint * exp(-distanceToStar * distanceToStar * 60.0) * 0.18 * largeStar * twinkle * scaleFade;
      vec2 offset = (local - starPoint) * vec2(cos(latitude), 1.0);
      float spike = exp(-offset.x * offset.x * 1200.0) * exp(-offset.y * offset.y * 26.0)
        + exp(-offset.y * offset.y * 1200.0) * exp(-offset.x * offset.x * 26.0);
      color += tint * spike * 0.3 * largeStar * twinkle * scaleFade;
      coverage = max(coverage, spike * 0.3 * largeStar * scaleFade);
    }
    coverage = max(coverage, star * min(brightness, 1.5) * scaleFade);
  }

  float pulsarAngle = varianceA * 6.28318;
  vec3 pulsarDirection = normalize(vec3(
    sin(pulsarAngle) * 0.9,
    1.4 * (varianceB - 0.5),
    cos(pulsarAngle) * 0.9
  ));
  float pulsarAlignment = max(dot(direction, pulsarDirection), 0.0);
  float pulse = pow(0.5 + 0.5 * sin(time * (1.2 + varianceC + 1.5 * uAudioPulse) + varianceC * 6.28), 8.0);
  pulse = min(1.0, pulse + 0.6 * uAudioPulse);
  float pulsarFade = mix(0.45, 1.0, detail);
  color += vec3(0.9, 0.95, 1.0)
    * (pow(pulsarAlignment, 900.0) * (0.6 + 1.2 * pulse) + pow(pulsarAlignment, 110.0) * 0.5 * pulse)
    * pulsarFade;
  coverage = max(coverage, pow(pulsarAlignment, 900.0) * (0.5 + 0.5 * pulse) * pulsarFade);
  return vec4(min(color, vec3(1.0)), min(coverage, 1.0));
}

vec4 sampleRotatedSphere(vec3 direction, float spin, float time) {
  float roll = time * 0.13;
  float rollCos = cos(roll);
  float rollSin = sin(roll);
  direction = vec3(
    rollCos * direction.x - rollSin * direction.y,
    rollSin * direction.x + rollCos * direction.y,
    direction.z
  );
  float tilt = 0.45 + 0.35 * sin(time * 0.24);
  float tiltCos = cos(tilt);
  float tiltSin = sin(tilt);
  direction = vec3(
    direction.x,
    tiltCos * direction.y - tiltSin * direction.z,
    tiltSin * direction.y + tiltCos * direction.z
  );
  float spinCos = cos(spin);
  float spinSin = sin(spin);
  direction = vec3(
    spinCos * direction.x + spinSin * direction.z,
    direction.y,
    -spinSin * direction.x + spinCos * direction.z
  );
  return sampleSky(direction, time);
}

vec3 shadeOrb(vec2 point) {
  float radius = length(point);
#ifdef COMPACT_ORB
  if (radius > 1.0) discard;
#endif
  float clampedRadius = min(radius, 0.9995);
  float depth = sqrt(1.0 - clampedRadius * clampedRadius);
  vec3 normal = vec3(point.x, point.y, depth);
  float rim = pow(1.0 - depth, 2.4);

  vec3 refracted = refract(vec3(0.0, 0.0, -1.0), normal, 0.75);
  float backDistance = -2.0 * dot(normal, refracted);
  vec3 backDirection = normalize(normal + refracted * backDistance);

  float time = uTime * 0.8 + uSeed;
  float varianceA = fract(uSeed * 6.31);
  float varianceB = fract(uSeed * 2.17);
  float warpedTime = time
    + (0.9 + 1.3 * varianceA) * sin(time * (0.09 + 0.07 * varianceB))
    + (0.5 + 0.8 * varianceB) * sin(time * (0.21 + 0.09 * varianceA) + 2.6);
  vec4 front = sampleRotatedSphere(normal, uSpin, warpedTime);
#ifdef COMPACT_ORB
  vec4 back = vec4(0.0);
#else
  vec4 back = sampleRotatedSphere(backDirection, uSpin, warpedTime * 0.8 + 2.7);
#endif

  vec3 voidColor = mix(uBaseColor * 0.04, uBaseColor * 0.35, rim);
  vec3 color = mix(uInteriorColor, voidColor, 0.97 - 0.04 * rim);
  float frontAlpha = clamp(front.a, 0.0, 1.0);
  float backAlpha = clamp(back.a, 0.0, 1.0);
  color = mix(color, back.rgb, backAlpha * 0.16);
  color = mix(color, front.rgb, frontAlpha * 0.85);

  float auroraLongitude = atan(normal.x, normal.z);
  float speechWave = pow(
    0.5 + 0.5 * sin(auroraLongitude * 3.0 + sin(auroraLongitude * 7.0 + time * 1.1) * 0.7 + time * 0.5),
    3.0
  ) * (0.55 + 0.45 * sin(auroraLongitude * 5.0 - time * 0.65 + 1.7));
  float visibleSky = -normal.y;
  float hangingMask = smoothstep(-0.15, 0.5, visibleSky);
  float rayPattern = 0.7 + 0.3 * sin(
    auroraLongitude * 24.0 + sin(auroraLongitude * 9.0 - time * 0.8) * 2.0 + time * 1.6
  );
  float aurora = clamp(speechWave, 0.0, 1.0) * hangingMask * rayPattern * (1.0 + 2.2 * uAudioPulse);
  float auroraVariance = fract(uSeed * 2.93);
  vec3 auroraColor = mix(
    vec3(0.12, 0.95, 0.55),
    vec3(0.45, 0.35, 1.0),
    smoothstep(0.0, 0.95, visibleSky + 0.35 * speechWave)
  );
  auroraColor = mix(auroraColor, mix(uAccentPrimary, uAccentHighlight, auroraVariance), 0.15 + 0.4 * auroraVariance);
  color += auroraColor * aurora * 0.8;

  float meteorPeriod = 4.5 + 3.5 * fract(uSeed * 4.91);
  float meteorEpoch = floor(time / meteorPeriod);
  float meteorPhase = fract(time / meteorPeriod);
  vec2 meteorStart = vec2(
    -1.1 + 2.2 * scalarHash(meteorEpoch * 1.3),
    0.85 - 1.4 * scalarHash(meteorEpoch * 2.9)
  );
  vec2 meteorDirection = normalize(vec2(
    0.7 + 0.5 * scalarHash(meteorEpoch * 4.1),
    -0.35 - 0.4 * scalarHash(meteorEpoch * 5.3)
  ));
  vec2 meteorHead = meteorStart + meteorDirection * meteorPhase * 2.8;
  vec2 meteorRelative = point - meteorHead;
  float meteorAlong = dot(meteorRelative, meteorDirection);
  float meteorPerpendicular = dot(meteorRelative, vec2(-meteorDirection.y, meteorDirection.x));
  float meteorVisible = smoothstep(0.0, 0.06, meteorPhase) * smoothstep(0.5, 0.32, meteorPhase);
  float meteorTail = exp(-meteorPerpendicular * meteorPerpendicular * 1600.0)
    * exp(meteorAlong * 9.0) * step(meteorAlong, 0.0) * smoothstep(-0.5, -0.02, meteorAlong);
  float meteorGlow = exp(-dot(meteorRelative, meteorRelative) * 900.0);
  color += (vec3(1.0) * meteorGlow * 1.2 + mix(vec3(1.0), uAccentSecondary, 0.3) * meteorTail * 0.85)
    * meteorVisible;

  vec3 movingLight = normalize(vec3(
    0.85 * sin(time * 0.42),
    0.45 * sin(time * 0.26 + 1.2),
    0.5
  ));
  float diffuse = (0.62 + 0.65 * max(dot(normal, movingLight), 0.0)) * (1.0 + 0.35 * uAudioBrightness);
  color *= diffuse;
  vec3 voiceColor = mix(uAccentSecondary, vec3(1.0, 0.97, 0.9), 0.45);
  color += voiceColor * pow(1.0 - clampedRadius, 1.8) * uAudioBrightness * 0.5;
  color += (uAccentSecondary * 0.7 + vec3(0.12)) * rim * uAudioBrightness * 0.65 * uGlow;
  color += color * uAudioBrightness * 0.18 * sin(time * 14.0 + clampedRadius * 40.0 + uSeed * 7.0);
  float counterLight = max(dot(normal.xy, -movingLight.xy), 0.0) * rim;
  color += mix(uAccentPrimary, vec3(0.5, 0.6, 0.9), 0.5) * counterLight * 0.18 * uGlow;

  vec3 keyDirection = normalize(vec3(
    -0.45 + 0.3 * sin(time * 0.34),
    0.62 + 0.2 * sin(time * 0.27 + 1.7),
    0.64
  ));
  float keyStrength = 0.5 * (0.78 + 0.22 * sin(time * 0.45 + 2.2));
  color += vec3(1.0) * pow(max(dot(normal, keyDirection), 0.0), 150.0) * keyStrength * uGlow;
  vec3 sheenDirection = normalize(vec3(sin(time * 0.07) * 0.9, 0.35 + 0.3 * cos(time * 0.05), 0.7));
  color += vec3(1.0) * pow(max(dot(normal, sheenDirection), 0.0), 7.0) * 0.05 * uGlow;
  vec3 glintDirection = normalize(vec3(0.52, -0.5 + 0.12 * sin(time * 0.09), 0.69));
  color += vec3(1.0) * pow(max(dot(normal, glintDirection), 0.0), 140.0) * 0.25 * uGlow;
  color = mix(color, front.rgb, frontAlpha * rim * 0.3);
  float listeningState = step(0.5, uState) * (1.0 - step(1.5, uState));
  float thinkingState = step(1.5, uState) * (1.0 - step(2.5, uState));
  float successState = step(3.5, uState) * (1.0 - step(4.5, uState));
  float errorState = step(4.5, uState);
  float statePulse = 0.5 + 0.5 * sin(time * (1.1 + thinkingState * 0.7));
  float stateStrength = uStateBlend * (
    listeningState * 0.12
    + thinkingState * (0.08 + 0.1 * statePulse)
    + successState * 0.22
    + errorState * 0.18
  );
  vec3 stateColor = mix(uAccentPrimary, uAccentSecondary, thinkingState * statePulse);
  stateColor = mix(stateColor, uAccentHighlight, successState);
  stateColor = mix(stateColor, vec3(1.0, 0.08, 0.05), errorState);
  color += stateColor * (0.15 + 0.85 * rim) * stateStrength * uGlow;
  color *= uVisualIntensity;
  float limb = smoothstep(0.94, 1.0, clampedRadius);
  return mix(color, color * 0.85, limb * 0.4);
}

void main() {
  vec2 point = vUv * 2.0 - 1.0;
  if (length(point) > 1.0) discard;
  if (uGlass > 0.0) {
    float radius = length(point);
    float exponential = exp(2.0 * 1.7724539 * (radius - 0.9) / 0.1414214);
    float edgeFalloff = 0.5 + 0.5 * (exponential - 1.0) / (exponential + 1.0);
    if (edgeFalloff > 0.004) {
      float lensPulse = 1.0 + 0.16 * (
        0.6 * sin(uTime * 0.9 + uSeed)
        + 0.4 * sin(uTime * 1.7 + uSeed * 1.3)
      );
      float displacement = uGlass * edgeFalloff * lensPulse;
      float redShift = 1.4 * (1.0 + 0.06 * sin(uTime * 1.3 + uSeed));
      float greenShift = 1.2 * (1.0 + 0.06 * sin(uTime * 1.3 + uSeed + 2.1));
      float blueShift = 1.0 * (1.0 + 0.06 * sin(uTime * 1.3 + uSeed + 4.2));
      vec3 color = vec3(
        shadeOrb(point * (1.0 - displacement * redShift)).r,
        shadeOrb(point * (1.0 - displacement * greenShift)).g,
        shadeOrb(point * (1.0 - displacement * blueShift)).b
      );
      vec2 absolutePoint = min(abs(point), 1.0);
      float lobe = max(
        abs(absolutePoint.x * 0.766 + absolutePoint.y * 0.643),
        abs(absolutePoint.x * 0.766 - absolutePoint.y * 0.643)
      );
      float glow = 0.65 * pow(clamp((lobe - 0.0707) / 1.3435, 0.0, 1.0), 2.4) * edgeFalloff;
      glow += 1.02 * clamp(1.0 + (radius - 1.0) / 0.15, 0.0, 1.0)
        * step(radius, 1.0) * pow(lobe, 2.0);
      color += vec3(0.25) * min(glow, 1.0) * uGlow;
      gl_FragColor = vec4(color, 1.0);
      return;
    }
  }
  gl_FragColor = vec4(shadeOrb(point), 1.0);
}
`;
var compactFragmentShaderSource = fragmentShaderSource.replace(
  "precision highp float;",
  "precision highp float;\n#define COMPACT_ORB"
);

// node_modules/orbloom/src/orb-engine.js
var INTERNAL_SIZE = 1280;
var STATE_INDICES = Object.freeze({
  idle: 0,
  listening: 1,
  thinking: 2,
  speaking: 3,
  success: 4,
  error: 5
});
function makeInternalCanvas() {
  if (typeof OffscreenCanvas !== "undefined") {
    return new OffscreenCanvas(INTERNAL_SIZE, INTERNAL_SIZE);
  }
  const canvas = document.createElement("canvas");
  canvas.width = INTERNAL_SIZE;
  canvas.height = INTERNAL_SIZE;
  return canvas;
}
function compileShader(gl, type, source) {
  const shader = gl.createShader(type);
  gl.shaderSource(shader, source);
  gl.compileShader(shader);
  if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
    const reason = gl.getShaderInfoLog(shader) || "Unknown shader compile failure";
    gl.deleteShader(shader);
    throw new Error(reason);
  }
  return shader;
}
function createProgram(gl, fragmentSource) {
  const vertexShader = compileShader(gl, gl.VERTEX_SHADER, vertexShaderSource);
  const fragmentShader = compileShader(gl, gl.FRAGMENT_SHADER, fragmentSource);
  const program = gl.createProgram();
  gl.attachShader(program, vertexShader);
  gl.attachShader(program, fragmentShader);
  gl.bindAttribLocation(program, 0, "aPosition");
  gl.bindAttribLocation(program, 1, "aTextureCoord");
  gl.linkProgram(program);
  gl.deleteShader(vertexShader);
  gl.deleteShader(fragmentShader);
  if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
    const reason = gl.getProgramInfoLog(program) || "Unknown shader link failure";
    gl.deleteProgram(program);
    throw new Error(reason);
  }
  return program;
}
var OrbEngine = class {
  constructor(visibleCanvas, {
    fixedTime = null,
    onError = () => {
    },
    quality = "high",
    state = "idle",
    variant,
    timeOffset = 4e3 * Math.random()
  } = {}) {
    this.visibleCanvas = visibleCanvas;
    this.onError = onError;
    this.variant = variant ?? resolveVariant();
    this.quality = quality;
    this.qualityProfile = resolveOrbQuality(quality);
    this.state = resolveOrbState(state);
    this.internalCanvas = makeInternalCanvas();
    this.visibleContext = visibleCanvas.getContext("2d", { alpha: true });
    this.gl = this.internalCanvas.getContext("webgl", {
      premultipliedAlpha: true,
      alpha: true,
      antialias: false,
      preserveDrawingBuffer: true
    });
    if (!this.visibleContext || !this.gl) {
      throw new Error("This browser could not create the required canvas contexts.");
    }
    this.batchExtension = this.gl.getExtension("ANGLE_instanced_arrays");
    this.compactPipeline = this.variant.lensStrength <= 0 && Boolean(this.batchExtension);
    this.program = null;
    this.locations = null;
    this.buffer = null;
    this.ready = false;
    this.diameter = 528;
    this.requestedDevicePixelRatio = 1;
    this.devicePixelRatio = 1;
    this.renderDiameter = 528;
    this.active = true;
    this.reducedMotion = false;
    this.destroyed = false;
    this.targetAudioLevel = 0;
    this.stateBlend = 1;
    this.lastStateFrameAt = null;
    this.motionState = createOrbMotionState(this.variant.phase);
    this.timeOffset = timeOffset;
    this.fixedTime = Number.isFinite(fixedTime) ? fixedTime : null;
    this.lastFrameAt = 0;
    this.timer = 0;
    this.frame = this.frame.bind(this);
    this.handleContextLost = this.handleContextLost.bind(this);
    this.handleContextRestored = this.handleContextRestored.bind(this);
    this.internalCanvas.addEventListener?.("webglcontextlost", this.handleContextLost);
    this.internalCanvas.addEventListener?.("webglcontextrestored", this.handleContextRestored);
    this.initializeGlResources();
    this.visibleContext.globalCompositeOperation = "copy";
  }
  initializeGlResources() {
    const gl = this.gl;
    const fragmentSource = this.compactPipeline ? compactFragmentShaderSource : fragmentShaderSource;
    this.program = createProgram(gl, fragmentSource);
    this.locations = this.getLocations();
    this.buffer = this.createQuad();
    this.gl.disable(this.gl.DEPTH_TEST);
    this.gl.enable(this.gl.BLEND);
    this.gl.blendFunc(this.gl.ONE, this.gl.ONE_MINUS_SRC_ALPHA);
    this.gl.enable(this.gl.SCISSOR_TEST);
    this.gl.useProgram(this.program);
    this.gl.bindBuffer(this.gl.ARRAY_BUFFER, this.buffer);
    this.gl.enableVertexAttribArray(this.locations.position);
    this.gl.vertexAttribPointer(this.locations.position, 2, this.gl.FLOAT, false, 16, 0);
    this.gl.enableVertexAttribArray(this.locations.textureCoord);
    this.gl.vertexAttribPointer(this.locations.textureCoord, 2, this.gl.FLOAT, false, 16, 8);
    this.visibleContext.globalCompositeOperation = "copy";
    this.setStaticUniforms();
    this.ready = true;
  }
  getLocations() {
    const gl = this.gl;
    const uniformNames = [
      "uResolution",
      "uInteriorColor",
      "uBaseColor",
      "uAccentPrimary",
      "uAccentSecondary",
      "uAccentHighlight",
      "uTime",
      "uSeed",
      "uAudioBrightness",
      "uAudioPulse",
      "uSpin",
      "uArchetype",
      "uGlass",
      "uVisualIntensity",
      "uDetail",
      "uGlow",
      "uState",
      "uStateBlend"
    ];
    const locations = {
      position: gl.getAttribLocation(this.program, "aPosition"),
      textureCoord: gl.getAttribLocation(this.program, "aTextureCoord")
    };
    for (const name of uniformNames) {
      locations[name] = gl.getUniformLocation(this.program, name);
    }
    return locations;
  }
  createQuad() {
    const gl = this.gl;
    const buffer = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
    gl.bufferData(
      gl.ARRAY_BUFFER,
      new Float32Array([
        -1,
        -1,
        0,
        1,
        1,
        -1,
        1,
        1,
        -1,
        1,
        0,
        0,
        1,
        1,
        1,
        0
      ]),
      gl.STATIC_DRAW
    );
    return buffer;
  }
  setStaticUniforms() {
    const gl = this.gl;
    const appearance = this.variant.appearance ?? { detail: 1, glow: 1, intensity: 1 };
    gl.useProgram(this.program);
    gl.uniform3f(this.locations.uInteriorColor, ...this.variant.interiorColor ?? [0, 0, 0]);
    gl.uniform3f(this.locations.uBaseColor, ...this.variant.baseColor);
    gl.uniform3f(this.locations.uAccentPrimary, ...this.variant.accentColors[0]);
    gl.uniform3f(this.locations.uAccentSecondary, ...this.variant.accentColors[1]);
    gl.uniform3f(this.locations.uAccentHighlight, ...this.variant.accentColors[2]);
    gl.uniform1f(this.locations.uSeed, this.variant.phase);
    gl.uniform1f(this.locations.uArchetype, this.variant.archetypeIndex);
    gl.uniform1f(this.locations.uGlass, this.variant.lensStrength);
    gl.uniform1f(this.locations.uVisualIntensity, appearance.intensity);
    gl.uniform1f(this.locations.uDetail, appearance.detail);
    gl.uniform1f(this.locations.uGlow, appearance.glow);
  }
  resize(diameter, devicePixelRatio) {
    this.diameter = Math.max(1, Math.round(diameter));
    this.requestedDevicePixelRatio = Math.max(1, devicePixelRatio || 1);
    this.devicePixelRatio = Math.min(
      this.qualityProfile.maxPixelRatio,
      this.requestedDevicePixelRatio
    );
    this.renderDiameter = Math.min(
      this.qualityProfile.maxResolution,
      Math.max(1, Math.round(this.diameter * this.devicePixelRatio))
    );
    if (this.visibleCanvas.width !== this.renderDiameter) {
      this.visibleCanvas.width = this.renderDiameter;
    }
    if (this.visibleCanvas.height !== this.renderDiameter) {
      this.visibleCanvas.height = this.renderDiameter;
    }
    this.visibleContext.globalCompositeOperation = "copy";
    this.render(performance.now());
  }
  setAudioLevel(value) {
    this.targetAudioLevel = Math.min(1, Math.max(0, Number(value) || 0));
  }
  setVariant(variant) {
    this.variant = variant;
    this.motionState.phase = variant.phase;
    const useCompactPipeline = variant.lensStrength <= 0 && Boolean(this.batchExtension);
    if (useCompactPipeline !== this.compactPipeline) {
      if (this.buffer) this.gl.deleteBuffer(this.buffer);
      if (this.program) this.gl.deleteProgram(this.program);
      this.compactPipeline = useCompactPipeline;
      this.initializeGlResources();
    } else {
      this.setStaticUniforms();
    }
    this.render(performance.now());
  }
  setQuality(quality) {
    this.quality = quality;
    this.qualityProfile = resolveOrbQuality(quality);
    this.resize(this.diameter, this.requestedDevicePixelRatio);
  }
  setState(state) {
    this.state = resolveOrbState(state);
    this.stateBlend = this.reducedMotion ? 1 : 0;
    this.lastStateFrameAt = null;
    this.render(performance.now());
  }
  setActive(active) {
    this.active = Boolean(active);
    if (this.active) this.requestFrame();
  }
  setReducedMotion(reduced) {
    this.reducedMotion = Boolean(reduced);
    if (this.reducedMotion) this.stateBlend = 1;
    this.render(performance.now());
    if (!this.reducedMotion) this.requestFrame();
  }
  requestFrame() {
    if (this.destroyed || this.timer || !this.active || this.reducedMotion) return;
    if (typeof requestAnimationFrame === "function") {
      this.timer = requestAnimationFrame(this.frame);
    } else {
      this.timer = setTimeout(
        () => this.frame(performance.now()),
        1e3 / this.qualityProfile.frameRate
      );
    }
  }
  frame(now) {
    this.timer = 0;
    if (!this.active || this.destroyed || this.reducedMotion) return;
    const elapsed = now - this.lastFrameAt;
    const frameDuration = 1e3 / this.qualityProfile.frameRate;
    if (elapsed < frameDuration) {
      this.requestFrame();
      return;
    }
    this.lastFrameAt = now - elapsed % frameDuration;
    this.render(now);
    this.requestFrame();
  }
  render(now) {
    if (!this.ready) return false;
    const gl = this.gl;
    const time = this.fixedTime ?? now / 1e3 + this.timeOffset;
    const audioResponse = this.variant.audioResponse ?? { brightness: 1, motion: 1, pulse: 1 };
    advanceOrbMotion(
      this.motionState,
      time,
      Math.min(1, this.targetAudioLevel * audioResponse.motion),
      this.variant.motion
    );
    const stateDelta = this.lastStateFrameAt === null ? 0 : Math.min(0.1, Math.max(0, (now - this.lastStateFrameAt) / 1e3));
    this.lastStateFrameAt = now;
    this.stateBlend += (1 - this.stateBlend) * (stateDelta > 0 ? 1 - Math.exp(-stateDelta / 0.18) : 0);
    const viewportY = INTERNAL_SIZE - this.renderDiameter;
    gl.viewport(0, viewportY, this.renderDiameter, this.renderDiameter);
    gl.scissor(0, viewportY, this.renderDiameter, this.renderDiameter);
    gl.clearColor(0, 0, 0, 0);
    gl.clear(gl.COLOR_BUFFER_BIT);
    gl.useProgram(this.program);
    gl.uniform2f(this.locations.uResolution, this.renderDiameter, this.renderDiameter);
    gl.uniform1f(this.locations.uTime, time);
    gl.uniform1f(
      this.locations.uAudioBrightness,
      Math.min(1, this.motionState.audioSmooth * audioResponse.brightness)
    );
    gl.uniform1f(
      this.locations.uAudioPulse,
      Math.min(1, this.motionState.audioSmooth * audioResponse.pulse)
    );
    gl.uniform1f(this.locations.uSpin, this.motionState.spin);
    gl.uniform1f(this.locations.uState, STATE_INDICES[this.state]);
    gl.uniform1f(this.locations.uStateBlend, this.stateBlend);
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
    this.visibleContext.drawImage(
      this.internalCanvas,
      0,
      0,
      this.renderDiameter,
      this.renderDiameter,
      0,
      0,
      this.renderDiameter,
      this.renderDiameter
    );
    return true;
  }
  start() {
    const now = performance.now();
    this.render(now);
    this.lastFrameAt = now;
    this.requestFrame();
  }
  handleContextLost(event) {
    event.preventDefault?.();
    this.ready = false;
  }
  handleContextRestored() {
    try {
      this.initializeGlResources();
      this.render(performance.now());
      this.requestFrame();
    } catch (error) {
      this.onError(error instanceof Error ? error : new Error(String(error)));
    }
  }
  destroy() {
    this.destroyed = true;
    if (this.timer) {
      if (typeof cancelAnimationFrame === "function") cancelAnimationFrame(this.timer);
      else clearTimeout(this.timer);
    }
    const gl = this.gl;
    this.internalCanvas.removeEventListener?.("webglcontextlost", this.handleContextLost);
    this.internalCanvas.removeEventListener?.("webglcontextrestored", this.handleContextRestored);
    if (this.buffer) gl.deleteBuffer(this.buffer);
    if (this.program) gl.deleteProgram(this.program);
  }
};

// node_modules/orbloom/src/controller.js
function requireCanvas(canvas) {
  if (typeof HTMLCanvasElement === "undefined" || !(canvas instanceof HTMLCanvasElement)) {
    throw new TypeError("createOrb requires an HTMLCanvasElement.");
  }
  return canvas;
}
function resolveTheme(theme) {
  if (theme === void 0 || typeof theme === "string") return resolveVariant(theme);
  if (!theme || typeof theme !== "object" || !Array.isArray(theme.accentColors)) {
    throw new TypeError("theme must be a registered variant ID or a resolved orb theme.");
  }
  return theme;
}
var OrbController = class {
  constructor(canvas, options = {}) {
    this.canvas = requireCanvas(canvas);
    this.destroyed = false;
    this.paused = false;
    this.visible = true;
    this.pageVisible = typeof document === "undefined" || document.visibilityState === "visible";
    this.audioDetach = null;
    this.reducedMotionSetting = options.reducedMotion ?? "user";
    this.motionPreference = typeof matchMedia === "function" ? matchMedia("(prefers-reduced-motion: reduce)") : null;
    this.engine = new OrbEngine(canvas, {
      fixedTime: options.fixedTime,
      onError: options.onError,
      quality: options.quality,
      state: options.state,
      timeOffset: options.timeOffset,
      variant: resolveTheme(options.theme)
    });
    this.handleVisibility = () => {
      this.pageVisible = document.visibilityState === "visible";
      this.updateActivity();
    };
    this.handleMotionPreference = (event) => {
      if (this.reducedMotionSetting === "user") this.engine.setReducedMotion(event.matches);
    };
    this.resizeObserver = typeof ResizeObserver === "function" ? new ResizeObserver(() => this.resize()) : null;
    this.intersectionObserver = typeof IntersectionObserver === "function" ? new IntersectionObserver(([entry]) => {
      this.visible = entry.isIntersecting;
      this.updateActivity();
    }) : null;
    this.resizeObserver?.observe(canvas);
    this.intersectionObserver?.observe(canvas);
    this.motionPreference?.addEventListener("change", this.handleMotionPreference);
    document.addEventListener("visibilitychange", this.handleVisibility);
    this.engine.setReducedMotion(this.shouldReduceMotion());
    this.resize();
    this.engine.start();
  }
  shouldReduceMotion() {
    if (typeof this.reducedMotionSetting === "boolean") return this.reducedMotionSetting;
    return Boolean(this.motionPreference?.matches);
  }
  resize() {
    const bounds = this.canvas.getBoundingClientRect();
    const diameter = Math.max(1, Math.min(
      bounds.width || this.canvas.clientWidth || 264,
      bounds.height || this.canvas.clientHeight || bounds.width || 264
    ));
    this.engine.resize(diameter, globalThis.devicePixelRatio || 1);
  }
  updateActivity() {
    this.engine.setActive(!this.destroyed && !this.paused && this.visible && this.pageVisible);
  }
  setTheme(theme) {
    const resolved = resolveTheme(theme);
    this.engine.setVariant(resolved);
    return resolved;
  }
  setState(state) {
    this.engine.setState(state);
  }
  setQuality(quality) {
    this.engine.setQuality(quality);
  }
  setAudioLevel(level) {
    this.engine.setAudioLevel(level);
  }
  setReducedMotion(value) {
    if (value !== "user" && typeof value !== "boolean") {
      throw new TypeError("reducedMotion must be true, false, or user.");
    }
    this.reducedMotionSetting = value;
    this.engine.setReducedMotion(this.shouldReduceMotion());
  }
  attachAudioSource(source, options) {
    this.disconnectAudio();
    this.audioDetach = attachAudioSource(source, (level) => this.setAudioLevel(level), options);
    return () => this.disconnectAudio();
  }
  async connectMicrophone(options) {
    this.disconnectAudio();
    this.audioDetach = await attachMicrophone(
      (level) => this.setAudioLevel(level),
      options
    );
    return () => this.disconnectAudio();
  }
  disconnectAudio() {
    this.audioDetach?.();
    this.audioDetach = null;
    this.setAudioLevel(0);
  }
  releaseAudioSource(element) {
    releaseAudioSource(element);
  }
  pause() {
    this.paused = true;
    this.updateActivity();
  }
  resume() {
    this.paused = false;
    this.updateActivity();
  }
  destroy() {
    if (this.destroyed) return;
    this.destroyed = true;
    this.disconnectAudio();
    this.resizeObserver?.disconnect();
    this.intersectionObserver?.disconnect();
    this.motionPreference?.removeEventListener("change", this.handleMotionPreference);
    document.removeEventListener("visibilitychange", this.handleVisibility);
    this.engine.destroy();
  }
};
function createOrb(canvas, options) {
  return new OrbController(canvas, options);
}
export {
  AudioLevelCalibrator,
  DEFAULT_VARIANT_ID,
  OrbController,
  OrbEngine,
  attachAudioSource,
  attachMicrophone,
  audioCalibrationDefaults,
  createOrb,
  createOrbTheme,
  measureRmsDb,
  orbArchetypes,
  orbCustomizationDefaults,
  orbQualityProfiles,
  orbStates,
  orbVariantDefinitions,
  orbVariantIds,
  releaseAudioSource,
  resolveVariant
};
