/**
 * VoiceBeam Sound & Typing Reactive Live Glow Engine
 * Directly derived from libraries.dev/voice (voice-glow)
 *
 * Implements:
 * 1. Multi-lobe radial gradient spectrum (7 lobes)
 * 2. Real-time bell curve band contour with chromatic aberration fringes on HTML5 Canvas
 * 3. Blurred bloom halo and SVG fractal noise turbulence distortion
 * 4. 60 FPS requestAnimationFrame loop reacting to:
 *    - Typing pulses (dynamic elevation and ripple as user types)
 *    - Real-time microphone audio stream
 *    - Idle breathing presence
 *    - Thinking / Processing ping-pong sweep
 */

// 7 Lobe geometry coordinates (px) for reference element
export const voiceLobes = [
  { x: 0, w: 74, h: 46, band: 0 },
  { x: -36, w: 54, h: 40, band: 1 },
  { x: 36, w: 54, h: 40, band: 1 },
  { x: -72, w: 48, h: 32, band: 2 },
  { x: 72, w: 48, h: 32, band: 2 },
  { x: -108, w: 42, h: 26, band: 1 },
  { x: 108, w: 42, h: 26, band: 1 }
];

export const LOBE_SPAN = 36 * voiceLobes.length;

export const voicePalettes = {
  colorful: {
    dark: [
      'rgb(255, 70, 120)',
      'rgb(60, 190, 255)',
      'rgb(175, 70, 255)',
      'rgb(60, 220, 130)',
      'rgb(255, 150, 40)',
      'rgb(90, 100, 255)',
      'rgb(40, 200, 190)'
    ]
  },
  mono: {
    dark: [
      'rgb(215, 215, 215)',
      'rgb(180, 180, 180)',
      'rgb(190, 190, 190)',
      'rgb(160, 160, 160)',
      'rgb(170, 170, 170)',
      'rgb(150, 150, 150)',
      'rgb(155, 155, 155)'
    ]
  },
  ocean: {
    dark: [
      'rgb(80, 140, 255)',
      'rgb(40, 200, 230)',
      'rgb(120, 90, 255)',
      'rgb(30, 170, 210)',
      'rgb(160, 80, 240)',
      'rgb(60, 110, 255)',
      'rgb(40, 190, 180)'
    ]
  },
  sunset: {
    dark: [
      'rgb(255, 110, 60)',
      'rgb(255, 180, 40)',
      'rgb(255, 60, 90)',
      'rgb(255, 210, 80)',
      'rgb(240, 70, 140)',
      'rgb(255, 140, 50)',
      'rgb(230, 50, 110)'
    ]
  },
  forest: {
    dark: [
      'rgb(70, 220, 120)',
      'rgb(40, 200, 180)',
      'rgb(140, 230, 80)',
      'rgb(30, 170, 140)',
      'rgb(190, 235, 70)',
      'rgb(50, 190, 110)',
      'rgb(30, 150, 120)'
    ]
  },
  candy: {
    dark: [
      'rgb(255, 90, 170)',
      'rgb(255, 120, 220)',
      'rgb(210, 80, 255)',
      'rgb(255, 150, 190)',
      'rgb(180, 110, 255)',
      'rgb(255, 70, 140)',
      'rgb(230, 100, 240)'
    ]
  }
};

export const defaultBandColors = {
  core: '255, 255, 255',
  above: '255, 70, 120',
  mid: '168, 85, 247',
  below: '6, 182, 212'
};

function parseRgb(colorStr) {
  if (!colorStr) return null;
  const m = colorStr.match(/rgb\(\s*([\d.]+)\s*,\s*([\d.]+)\s*,\s*([\d.]+)\s*\)/);
  if (m) return [parseFloat(m[1]), parseFloat(m[2]), parseFloat(m[3])];
  const h = colorStr.match(/^#([0-9a-f]{3}|[0-9a-f]{6})$/i);
  if (h) {
    const hex = h[1].length === 3 ? h[1].split('').map(c => c + c).join('') : h[1];
    return [parseInt(hex.slice(0, 2), 16), parseInt(hex.slice(2, 4), 16), parseInt(hex.slice(4, 6), 16)];
  }
  return null;
}

function rgbaStr(rgb, alpha) {
  return `rgba(${rgb[0]}, ${rgb[1]}, ${rgb[2]}, ${alpha.toFixed(3)})`;
}

function buildLobeGradients(id, colors, alpha, sw, sh, yOffset, fadePercent) {
  return voiceLobes.map((lobe, i) => {
    const rawCol = colors[i % colors.length];
    const rgb = parseRgb(rawCol) || [255, 255, 255];
    const col = alpha >= 1 ? rawCol : rgbaStr(rgb, alpha);
    const m = `calc(${Math.round(lobe.w * sw)}px * var(--vb-w-${id}) * var(--vb-z-${id}, 1))`;
    const d = `calc(${Math.round(lobe.h * sh)}px * var(--vb-h-${id}) * var(--vb-l${i}-${id}) * var(--vb-z-${id}, 1))`;
    const x = `calc(50% + (var(--vb-cx-${id}) + var(--vb-x${i}-${id})) * var(--vb-w-${id}) * var(--vb-z-${id}, 1))`;
    const h = `calc(100% + (${yOffset}px + var(--vb-y${i}-${id})) * var(--vb-z-${id}, 1))`;
    return `radial-gradient(ellipse ${m} ${d} at ${x} ${h}, ${col} 0%, transparent ${fadePercent}%)`;
  }).join(',\n    ');
}

export function generateVoiceCss(id, config = {}) {
  const {
    borderRadius = 22,
    borderWidth = 1,
    strokeOpacity = 1.0,
    innerOpacity = 0.6,
    bloomOpacity = 0.95,
    brightness = 1.15,
    saturation = 1.35,
    colorVariant = 'colorful',
    scale = 1,
    position = 'relative',
    type = 'default'
  } = config;

  const isMobile = type === 'mobile';
  const colors = voicePalettes[colorVariant]?.dark || voicePalettes.colorful.dark;
  const rad = borderRadius;
  const radInner = Math.max(0, borderRadius - borderWidth);
  const fade = 75;

  const gw = (config.glowWidth || 1) * scale;
  const gh = (config.glowHeight || 1) * scale;
  const rw = (config.rangeWidth || 1) * scale;
  const rh = (config.rangeHeight || 1) * scale;
  const bs = config.bloomScale || 1;
  const bh = config.bloomHeight || 1;

  const strokeGradients = buildLobeGradients(id, colors, 0.9, 1.0 * gw, 1.0 * gh, 2, fade);
  const innerGradients = buildLobeGradients(id, colors, 0.55, 0.95 * gw, 1.15 * gh, 0, fade);
  const bloomGradients = buildLobeGradients(id, colors, 0.92, 1.35 * gw * bs, 2.1 * gh * bh, 0, Math.min(95, fade + 4));

  const centerCoreGrad = `radial-gradient(ellipse calc(${Math.round(34 * gw)}px * var(--vb-w-${id}) * var(--vb-z-${id}, 1)) calc(${Math.round(32 * gh)}px * var(--vb-h-${id}) * var(--vb-z-${id}, 1)) at calc(50% + var(--vb-cx-${id}) * var(--vb-w-${id}) * var(--vb-z-${id}, 1)) calc(100% + (2px + var(--vb-cy-${id})) * var(--vb-z-${id}, 1)), rgba(255, 255, 255, 0.45) 0%, rgba(255, 255, 255, 0.12) 30%, transparent 68%)`;

  const maskRadial = (w, h, stop1, stop2 = 0) =>
    `radial-gradient(ellipse calc(${Math.round(w * rw)}px * var(--vb-w-${id}) * var(--vb-mw-${id}) * var(--vb-z-${id}, 1)) calc((${Math.round(h * rh)}px * var(--vb-h-${id}) + var(--vb-bh-${id})) * var(--vb-z-${id}, 1)) at calc(50% + var(--vb-cx-${id}) * var(--vb-w-${id}) * var(--vb-z-${id}, 1)) calc(100% + var(--vb-cy-${id}) * var(--vb-z-${id}, 1)), white 0%, rgba(255, 255, 255, 0.5) ${stop1}%${stop2 > 0 ? `, rgba(255, 255, 255, ${stop2}) 85%` : ''}, transparent 100%)`;

  const bloomBlur = isMobile ? '24px' : '18px';

  return `
[data-voice-beam="${id}"] {
  position: ${position};
  border-radius: ${rad}px;
  overflow: hidden;
  --vb-h-${id}: 0.8;
  --vb-w-${id}: 1;
  --vb-glow-${id}: 0.45;
  --vb-z-${id}: 1;
  --vb-cx-${id}: 0px;
  --vb-cy-${id}: 0px;
  --vb-bh-${id}: 0px;
  --vb-mw-${id}: 1;
  --vb-hue-${id}: 0deg;
  --vb-level-${id}: 0;
${voiceLobes.map((l, i) => `  --vb-x${i}-${id}: ${l.x}px;\n  --vb-l${i}-${id}: 1;\n  --vb-y${i}-${id}: 0px;`).join('\n')}
}

[data-voice-beam="${id}"][data-active]::after {
  content: "";
  position: absolute;
  inset: 0;
  border-radius: ${radInner}px;
  padding: ${borderWidth}px;
  clip-path: inset(0 round ${rad}px);
  background: ${centerCoreGrad}, ${strokeGradients};
  -webkit-mask: ${maskRadial(170, 64, 45)}, linear-gradient(#fff 0 0) content-box, linear-gradient(#fff 0 0);
  -webkit-mask-composite: source-in, xor;
  mask: ${maskRadial(170, 64, 45)}, linear-gradient(#fff 0 0) content-box, linear-gradient(#fff 0 0);
  mask-composite: intersect, exclude;
  pointer-events: none;
  will-change: transform;
  z-index: 2;
  opacity: calc(var(--vb-glow-${id}) * ${strokeOpacity});
  filter: hue-rotate(var(--vb-hue-${id})) brightness(${brightness}) saturate(${saturation});
}

[data-voice-beam="${id}"][data-active]::before {
  content: "";
  position: absolute;
  inset: 0;
  border-radius: ${rad}px;
  background: ${innerGradients};
  box-shadow: inset 0 0 9px 1px rgba(255, 255, 255, 0.08);
  -webkit-mask-image: ${maskRadial(170, 64, 45, 0.3)}${isMobile ? '' : `, linear-gradient(white, transparent 28px, transparent calc(100% - 28px), white)`};
  -webkit-mask-composite: source-in;
  mask-image: ${maskRadial(170, 64, 45, 0.3)}${isMobile ? '' : `, linear-gradient(white, transparent 28px, transparent calc(100% - 28px), white)`};
  mask-composite: intersect;
  pointer-events: none;
  will-change: transform;
  z-index: 1;
  clip-path: inset(0 round ${rad}px);
  opacity: calc(var(--vb-glow-${id}) * ${innerOpacity});
  filter: hue-rotate(var(--vb-hue-${id})) brightness(${brightness}) saturate(${saturation});
}

[data-voice-beam="${id}"] [data-voice-beam-bloom] {
  position: absolute;
  inset: 0;
  border-radius: ${radInner}px;
  pointer-events: none;
  will-change: transform;
  -webkit-mask: ${maskRadial(220, 140, 35)};
  mask: ${maskRadial(220, 140, 35)};
  background: ${bloomGradients};
  z-index: 1;
  clip-path: inset(0 round ${rad}px);
  opacity: calc(var(--vb-glow-${id}) * ${bloomOpacity});
  filter: blur(${bloomBlur}) hue-rotate(var(--vb-hue-${id})) brightness(${brightness}) saturate(${saturation});
}

[data-voice-beam="${id}"] [data-voice-beam-band],
[data-voice-beam="${id}"] [data-voice-beam-band-halo] {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
  pointer-events: none;
  z-index: 3;
  filter: blur(16px);
}
`;
}

// Organic bell curve math
function bellCurve(n, curve, spread, skew) {
  const t = n < 0 ? 1 - skew : 1 + skew;
  const s = Math.max(0.05, spread * t);
  const o = Math.exp(-Math.pow(Math.abs(n) / s, curve));
  const i = Math.exp(-Math.pow(1 / s, curve));
  return Math.max(0, (o - i) / (1 - i));
}

function computeBellPoints(config, state, w, h) {
  const cx = w / 2 + state.cx * state.w;
  const s = 170 * (config.rangeWidth || 0.75) * state.w * state.mw;
  const maxH = h * 0.82 * Math.min(1, config.scale || 1);
  const liftH = Math.min(maxH, (64 * (config.rangeHeight || 1) * state.h + state.lift) * (config.bandPosition || 0.35));
  const baseLine = h - (config.bandOffset ?? -27);
  const cornerLift = Math.min(1, state.corner * 4);
  const tail = (config.bandTail ?? 0.59) * (1 - cornerLift * cornerLift * (3 - 2 * cornerLift));
  const hasTail = tail > 1e-3;
  const overflow = hasTail ? (config.bandTailOverflow || 15) : 0;
  const startX = hasTail ? -overflow : cx - s;
  const endX = hasTail ? w + overflow : cx + s;

  const points = [];
  const steps = 56;
  for (let i = 0; i <= steps; i++) {
    const x = startX + (endX - startX) * i / steps;
    const normX = Math.max(-1, Math.min(1, (x - cx) / Math.max(1, s)));
    const yVal = bellCurve(normX, config.bandCurve || 1.75, config.bandSpread || 0.87, config.bandSkew || 0.12);
    points.push([x, baseLine - liftH * yVal]);
  }
  return points;
}

function wrapSpan(n, e) {
  const a = e / 2;
  return ((n + a) % e + e) % e - a;
}

function falloff(n, e) {
  const a = n / (e / 2 + 4);
  return Math.max(0, 1 - a * a);
}

function smoothDamp(current, target, dt, speedUp, speedDown) {
  const s = target > current ? speedUp : speedDown;
  const o = 1 - Math.exp(-dt / Math.max(1e-3, s));
  return current + (target - current) * o;
}

function renderBandCanvas(ctx, haloCtx, points, w, h, state, config, isProcessing) {
  if (!ctx || points.length < 2) return;
  const dpr = (typeof window !== 'undefined' && window.devicePixelRatio) || 1;
  const pw = Math.round(w * dpr);
  const ph = Math.round(h * dpr);

  if (ctx.canvas.width !== pw || ctx.canvas.height !== ph) {
    ctx.canvas.width = pw;
    ctx.canvas.height = ph;
  }
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.clearRect(0, 0, w, h);

  if (haloCtx) {
    if (haloCtx.canvas.width !== pw || haloCtx.canvas.height !== ph) {
      haloCtx.canvas.width = pw;
      haloCtx.canvas.height = ph;
    }
    haloCtx.setTransform(dpr, 0, 0, dpr, 0, 0);
    haloCtx.clearRect(0, 0, w, h);
  }

  // If processing is active or bandStrength is 0, completely skip line rendering
  if (isProcessing || !config.bandStrength || config.bandStrength <= 0) return;
  const bandOpacity = Math.min(1, 0.45 * config.bandStrength * state.strength);
  if (bandOpacity < 0.01) return;

  // Heavily soften canvas stroke with blur so it blends seamlessly
  if (typeof ctx.filter === 'string') {
    ctx.filter = 'blur(10px)';
  }

  const bandColors = config.bandColors || defaultBandColors;
  const bandWidth = (config.bandWidth || 2.15) * (1 + 0.35 * state.level);
  const aberration = (config.bandAberration || 0.89) * (0.35 + 0.65 * state.level);
  const splitY = (4 + 12 * aberration) * (config.scale || 1);
  const splitX = 4 * aberration * (config.scale || 1);

  const startX = points[0][0];
  const endX = points[points.length - 1][0];
  const grad = ctx.createLinearGradient(startX, 0, endX, 0);
  grad.addColorStop(0, 'rgba(255, 255, 255, 0)');
  grad.addColorStop(0.12, `rgba(255, 255, 255, ${bandOpacity.toFixed(3)})`);
  grad.addColorStop(0.88, `rgba(255, 255, 255, ${bandOpacity.toFixed(3)})`);
  grad.addColorStop(1, 'rgba(255, 255, 255, 0)');

  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  ctx.lineWidth = bandWidth * 2.2;
  ctx.strokeStyle = grad;

  ctx.beginPath();
  ctx.moveTo(points[0][0], points[0][1]);
  for (let i = 1; i < points.length; i++) {
    ctx.lineTo(points[i][0], points[i][1]);
  }
  ctx.stroke();

  // Chromatic fringes pass
  const passes = [
    { rgb: bandColors.above, ox: splitX, oy: -splitY, w: 1.4, a: 0.85 },
    { rgb: bandColors.mid, ox: splitX * 0.35, oy: -splitY * 0.35, w: 1.8, a: 0.6 },
    { rgb: bandColors.below, ox: -splitX, oy: splitY, w: 1.4, a: 0.85 }
  ];

  for (const pass of passes) {
    const fGrad = ctx.createLinearGradient(startX, 0, endX, 0);
    fGrad.addColorStop(0, `rgba(${pass.rgb}, 0)`);
    fGrad.addColorStop(0.15, `rgba(${pass.rgb}, ${(bandOpacity * pass.a).toFixed(3)})`);
    fGrad.addColorStop(0.85, `rgba(${pass.rgb}, ${(bandOpacity * pass.a).toFixed(3)})`);
    fGrad.addColorStop(1, `rgba(${pass.rgb}, 0)`);

    ctx.lineWidth = Math.max(0.6, bandWidth * pass.w);
    ctx.strokeStyle = fGrad;
    ctx.beginPath();
    ctx.moveTo(points[0][0] + pass.ox, points[0][1] + pass.oy);
    for (let i = 1; i < points.length; i++) {
      ctx.lineTo(points[i][0] + pass.ox, points[i][1] + pass.oy);
    }
    ctx.stroke();
  }

  if (typeof ctx.filter === 'string') {
    ctx.filter = 'none';
  }
}

export const voicePresets = {
  default: {
    scale: 1,
    reach: 1.2,
    spread: 1.05,
    bend: 60,
    bandStrength: 0, // Pure soothing diffused gradient bloom (libraries.dev/voice)
    bandWidth: 2.15,
    bandPosition: 0.35,
    bandCurve: 1.75,
    bandSpread: 0.87,
    bandSkew: 0.12,
    bandOffset: -27,
    bandTail: 0.59,
    bandAberration: 0.89,
    flow: 48,
    lobeSpacing: 0.85,
    rangeWidth: 0.75,
    rangeHeight: 1,
    idle: 0.22,
    breatheDuration: 5.2,
    processingDuration: 1.1,
    processingTravel: 1.55,
    processingCurve: 2.1,
    processingEase: 0.6,
    processingLevel: 0.55
  },
  mobile: {
    scale: 1.25,
    spread: 0.55,
    reach: 2.8,
    flow: 60,
    bend: 75,
    bandWidth: 2.4,
    bandCurve: 1.55,
    bandSpread: 0.9,
    bandOffset: -45,
    bandTail: 0.62,
    bandTailPosition: 0.42,
    bandTailCurve: 2.7,
    bandTailOverflow: 22,
    bandStrength: 0, // Soft soothing gradient for orb footer
    bandPosition: 0.38,
    idle: 0.32,
    breatheDuration: 4.8,
    lobeSpacing: 1.25,
    rangeWidth: 1.35,
    rangeHeight: 1.6,
    glowWidth: 1.25,
    glowHeight: 2.4,
    bloomScale: 1.2,
    bloomHeight: 2.3,
    brightness: 1.25,
    saturation: 1.5,
    strokeOpacity: 0.95,
    innerOpacity: 0.7,
    bloomOpacity: 0.95,
    processingDuration: 1.05,
    processingTravel: 1.8,
    processingCurve: 2.1,
    processingEase: 0.6,
    processingLevel: 0.45
  }
};

/**
 * Attaches the VoiceBeam Engine to a container element
 */
export function initVoiceBeam(containerEl, userConfig = {}) {
  if (!containerEl || typeof window === 'undefined') return null;

  const id = userConfig.id || 'privapilot-beam';
  const type = userConfig.type || 'default';
  const preset = voicePresets[type] || voicePresets.default;

  const config = {
    id,
    borderRadius: 22,
    borderWidth: 1,
    colorVariant: 'colorful',
    bandColors: defaultBandColors,
    ...preset,
    ...userConfig
  };

  containerEl.setAttribute('data-voice-beam', id);
  containerEl.setAttribute('data-active', '');

  // 1. Inject or update style tag
  let styleEl = document.getElementById(`vb-style-${id}`);
  if (!styleEl) {
    styleEl = document.createElement('style');
    styleEl.id = `vb-style-${id}`;
    document.head.appendChild(styleEl);
  }
  styleEl.textContent = generateVoiceCss(id, config);

  // 2. Insert canvas and bloom layers if not present
  let bloomEl = containerEl.querySelector(':scope > [data-voice-beam-bloom]');
  if (!bloomEl) {
    bloomEl = document.createElement('div');
    bloomEl.setAttribute('data-voice-beam-bloom', 'true');
    containerEl.prepend(bloomEl);
  }

  let haloCanvas = containerEl.querySelector(':scope > [data-voice-beam-band-halo]');
  if (!haloCanvas) {
    haloCanvas = document.createElement('canvas');
    haloCanvas.setAttribute('data-voice-beam-band-halo', 'true');
    haloCanvas.setAttribute('aria-hidden', 'true');
    containerEl.appendChild(haloCanvas);
  }

  let bandCanvas = containerEl.querySelector(':scope > [data-voice-beam-band]');
  if (!bandCanvas) {
    bandCanvas = document.createElement('canvas');
    bandCanvas.setAttribute('data-voice-beam-band', 'true');
    bandCanvas.setAttribute('aria-hidden', 'true');
    containerEl.appendChild(bandCanvas);
  }

  const bandCtx = bandCanvas.getContext('2d');
  const haloCtx = haloCanvas.getContext('2d');

  // State
  let rafId = null;
  let lastTs = 0;
  let elapsed = 0;
  let phase = 0;
  let typingLevel = 0;
  let currentLevel = 0;
  let streamLevel = 0;
  let audioLevel = 0;
  let isProcessing = false;
  let scanA = 0;
  let scanT = 0;

  const processingDuration = config.processingDuration ?? 1.1;
  const processingTravel = config.processingTravel ?? 1.55;
  const processingCurve = config.processingCurve ?? 2.1;
  const processingEase = config.processingEase ?? 0.6;
  const processingLevel = config.processingLevel ?? 0.55;

  let audioContext = null;
  let analyser = null;
  let audioData = null;

  function onFrame(ts) {
    rafId = requestAnimationFrame(onFrame);
    if (!lastTs) lastTs = ts;
    const dt = Math.min(0.05, (ts - lastTs) / 1000);
    lastTs = ts;
    elapsed += dt;

    // Decay typing and external audio smoothly
    audioLevel = Math.max(0, audioLevel * 0.93 - 0.002);
    typingLevel = Math.max(0, typingLevel * 0.94 - 0.002);

    // Audio sampling from media stream if attached
    if (analyser && audioData) {
      analyser.getFloatTimeDomainData(audioData);
      let sum = 0;
      for (let i = 0; i < audioData.length; i++) sum += audioData[i] * audioData[i];
      const rms = Math.sqrt(sum / audioData.length);
      streamLevel = Math.min(1, rms * 5.0);
    } else {
      streamLevel = 0;
    }

    const targetLevel = Math.max(typingLevel, streamLevel, audioLevel);
    currentLevel += (targetLevel - currentLevel) * (targetLevel > currentLevel ? 0.4 : 0.14);

    // Breathing rhythm
    const breathe = 0.5 + 0.5 * Math.sin(2 * Math.PI * elapsed / (config.breatheDuration || 5.2));
    const idleLevel = currentLevel + (1 - currentLevel) * (config.idle || 0.22) * breathe;

    // Processing animation dynamics (directly derived from libraries.dev/voice voice-glow)
    if (isProcessing && scanA < 1e-3 && scanT === 0) {
      scanT = Math.max(0.05, processingDuration) / 2;
    }
    const ease = Math.max(0.05, processingEase);
    scanA = smoothDamp(scanA, isProcessing ? 1 : 0, dt, ease * 0.9, ease * 0.8);
    if (isProcessing) {
      scanT += dt;
    } else if (scanA < 1e-3) {
      scanT = 0;
    }

    const hScan = scanA * scanA * (3 - 2 * scanA);
    const ringSpan = LOBE_SPAN * (config.lobeSpacing || 0.85);
    const halfSpan = ringSpan / 2;
    const travelRange = halfSpan * processingTravel;
    const cycle = scanT / Math.max(0.05, processingDuration);
    const cycleIndex = Math.floor(cycle);
    const cycleFrac = cycle - cycleIndex;
    const curve = Math.max(1, processingCurve);
    const curvedFrac = cycleFrac < 0.5
      ? 0.5 * Math.pow(2 * cycleFrac, curve)
      : 1 - 0.5 * Math.pow(2 - 2 * cycleFrac, curve);
    const pingPong = cycleIndex % 2 === 0 ? 2 * curvedFrac - 1 : 1 - 2 * curvedFrac;

    const sweepX = hScan * travelRange * pingPong;
    const lobeCompress = 1 - hScan * 0.6; // lobes gather inward into compact beam
    const maskWidthCompress = 1 - hScan * 0.45; // mask gathers into traveling pill
    const centerPulse = 1 + hScan * 0.3 * (1 - pingPong * pingPong);

    const rampW = Math.max(0, Math.min(1, (hScan - 0.25) / 0.75));
    const rampR = rampW * rampW * (3 - 2 * rampW);
    const effectiveProcessingLevel = Math.max(idleLevel, processingLevel * rampR);

    const glowP = 0.22 + 0.78 * effectiveProcessingLevel;
    const hMult = 0.6 + (config.reach || 1.2) * effectiveProcessingLevel;
    const wMult = (0.85 + (config.spread || 1.05) * effectiveProcessingLevel) * centerPulse;
    const liftPx = (config.bend || 60) * effectiveProcessingLevel;

    if (config.flow && config.flow !== 0 && !isProcessing) {
      phase = ((phase + config.flow * effectiveProcessingLevel * dt) % ringSpan + ringSpan) % ringSpan;
    }

    // Write CSS variables
    containerEl.style.setProperty(`--vb-level-${id}`, currentLevel.toFixed(3));
    containerEl.style.setProperty(`--vb-glow-${id}`, glowP.toFixed(3));
    containerEl.style.setProperty(`--vb-h-${id}`, hMult.toFixed(3));
    containerEl.style.setProperty(`--vb-w-${id}`, wMult.toFixed(3));
    containerEl.style.setProperty(`--vb-mw-${id}`, maskWidthCompress.toFixed(3));
    containerEl.style.setProperty(`--vb-bh-${id}`, `${liftPx.toFixed(1)}px`);
    containerEl.style.setProperty(`--vb-cx-${id}`, `${sweepX.toFixed(1)}px`);

    const w = containerEl.clientWidth || 320;
    const hEl = containerEl.clientHeight || 90;

    for (let i = 0; i < voiceLobes.length; i++) {
      const lobe = voiceLobes[i];
      const j = wrapSpan(lobe.x * (config.lobeSpacing || 0.85) + phase, ringSpan);
      containerEl.style.setProperty(`--vb-x${i}-${id}`, `${(j * lobeCompress).toFixed(1)}px`);
      containerEl.style.setProperty(`--vb-l${i}-${id}`, falloff(j, ringSpan).toFixed(3));
    }

    // Render Canvas Bell Band only if not processing and band is configured
    if (!isProcessing && config.bandStrength > 0) {
      const state = {
        cx: sweepX,
        w: wMult,
        h: hMult,
        mw: maskWidthCompress,
        lift: liftPx,
        strength: (config.bend > 0 ? Math.min(1, liftPx / config.bend) : 0),
        level: currentLevel,
        corner: 0
      };
      const points = computeBellPoints(config, state, w, hEl);
      renderBandCanvas(bandCtx, haloCtx, points, w, hEl, state, config, isProcessing);
    } else {
      if (bandCtx) bandCtx.clearRect(0, 0, w, hEl);
      if (haloCtx) haloCtx.clearRect(0, 0, w, hEl);
    }
  }

  rafId = requestAnimationFrame(onFrame);

  return {
    triggerTypingPulse(amount = 0.55) {
      typingLevel = Math.min(1.0, typingLevel + amount + Math.random() * 0.2);
    },
    setAudioLevel(level) {
      const val = Math.min(1.0, Math.max(0, level));
      audioLevel = Math.max(audioLevel, val);
    },
    setStream(stream) {
      if (!stream) {
        analyser = null;
        audioData = null;
        streamLevel = 0;
        return;
      }
      try {
        const AudioCtx = window.AudioContext || window.webkitAudioContext;
        if (!audioContext) audioContext = new AudioCtx();
        if (audioContext.state === 'suspended') audioContext.resume();
        const src = audioContext.createMediaStreamSource(stream);
        analyser = audioContext.createAnalyser();
        analyser.fftSize = 512;
        src.connect(analyser);
        audioData = new Float32Array(analyser.fftSize);
      } catch (err) {
        console.warn('VoiceBeam mic attach notice:', err);
      }
    },
    setProcessing(processing) {
      isProcessing = Boolean(processing);
      if (!isProcessing) scanT = 0;
    },
    setColorVariant(variant) {
      if (voicePalettes[variant]) {
        config.colorVariant = variant;
        styleEl.textContent = generateVoiceCss(id, config);
      }
    },
    destroy() {
      if (rafId) cancelAnimationFrame(rafId);
      if (styleEl && styleEl.parentNode) styleEl.parentNode.removeChild(styleEl);
    }
  };
}
