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

// 7 Lobe geometry coordinates (px) for reference element (exact libraries.dev specification)
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
    ],
    light: [
      'rgb(255, 201, 21)',
      'rgb(126, 196, 255)',
      'rgb(180, 40, 230)',
      'rgb(235, 100, 160)',
      'rgb(255, 176, 122)',
      'rgb(154, 160, 255)',
      'rgb(127, 217, 238)'
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
    ],
    light: [
      'rgb(60, 60, 60)',
      'rgb(90, 90, 90)',
      'rgb(85, 85, 85)',
      'rgb(110, 110, 110)',
      'rgb(105, 105, 105)',
      'rgb(125, 125, 125)',
      'rgb(120, 120, 120)'
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
    ],
    light: [
      'rgb(40, 100, 240)',
      'rgb(20, 160, 200)',
      'rgb(90, 60, 230)',
      'rgb(20, 130, 180)',
      'rgb(130, 50, 220)',
      'rgb(40, 80, 230)',
      'rgb(20, 150, 150)'
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
    ],
    light: [
      'rgb(235, 80, 30)',
      'rgb(230, 150, 10)',
      'rgb(230, 30, 70)',
      'rgb(225, 175, 30)',
      'rgb(215, 40, 110)',
      'rgb(235, 110, 20)',
      'rgb(205, 30, 90)'
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
    ],
    light: [
      'rgb(30, 170, 80)',
      'rgb(20, 150, 130)',
      'rgb(90, 180, 30)',
      'rgb(20, 130, 100)',
      'rgb(130, 180, 20)',
      'rgb(30, 150, 80)',
      'rgb(20, 120, 90)'
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
    ],
    light: [
      'rgb(235, 40, 140)',
      'rgb(230, 70, 190)',
      'rgb(180, 40, 230)',
      'rgb(235, 100, 160)',
      'rgb(150, 70, 230)',
      'rgb(230, 30, 110)',
      'rgb(200, 60, 210)'
    ]
  },
  ice: {
    dark: [
      'rgb(150, 230, 255)',
      'rgb(90, 200, 255)',
      'rgb(190, 240, 255)',
      'rgb(120, 190, 255)',
      'rgb(160, 220, 250)',
      'rgb(80, 170, 255)',
      'rgb(200, 235, 255)'
    ]
  },
  gold: {
    dark: [
      'rgb(255, 200, 70)',
      'rgb(255, 170, 40)',
      'rgb(255, 220, 110)',
      'rgb(240, 150, 30)',
      'rgb(255, 235, 140)',
      'rgb(230, 160, 40)',
      'rgb(250, 210, 90)'
    ]
  }
};

export const defaultBandColors = {
  core: '255, 255, 255',
  above: '255, 70, 80',
  mid: '90, 255, 150',
  below: '80, 140, 255'
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

// Authentic VoiceBeam radial gradient lobes from libraries.dev
function buildLobeGradients(id, colors, alpha, sw, sh, yOffset, fadePercent, isMobile = false) {
  return voiceLobes.map((lobe, i) => {
    const rawCol = colors[i % colors.length];
    const rgb = parseRgb(rawCol) || [255, 255, 255];
    const col = alpha >= 1 ? rawCol : rgbaStr(rgb, alpha);
    const lobeW = isMobile ? Math.max(52, lobe.w) : lobe.w;
    const lobeH = isMobile ? 36 : lobe.h;
    const m = `calc(${Math.round(lobeW * sw)}px * var(--vb-w-${id}) * var(--vb-z-${id}, 1))`;
    const d = `calc(${Math.round(lobeH * sh)}px * var(--vb-h-${id}) * var(--vb-l${i}-${id}) * var(--vb-z-${id}, 1))`;
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
    innerOpacity = 0.65,
    bloomOpacity = 0.92,
    brightness = 1.2,
    saturation = 1.45,
    colorVariant = 'colorful',
    scale = 1,
    position = 'relative',
    type = 'default'
  } = config;

  const isMobile = type === 'mobile';
  const colors = voicePalettes[colorVariant]?.dark || voicePalettes.colorful.dark;
  const rad = borderRadius;
  const radInner = Math.max(0, borderRadius - borderWidth);
  const fade = isMobile ? 88 : 82;

  const gw = (config.glowWidth || 1) * scale;
  const gh = (config.glowHeight || 1) * scale;
  const rw = (config.rangeWidth || 1) * scale;
  const rh = (config.rangeHeight || 1) * scale;
  const bs = config.bloomScale || 1;
  const bh = config.bloomHeight || 1;

  // Lobe widths and heights tuned strictly to libraries.dev VoiceBeam
  const strokeGradients = buildLobeGradients(id, colors, 0.95, (isMobile ? 1.25 : 1.2) * gw, 1.0 * gh, 2, fade, isMobile);
  const innerGradients = buildLobeGradients(id, colors, 0.55, (isMobile ? 1.35 : 1.35) * gw, 1.15 * gh, 0, fade, isMobile);
  const bloomGradients = buildLobeGradients(id, colors, 0.92, (isMobile ? 1.55 : 1.75) * gw * bs, (isMobile ? 1.4 : 2.0) * gh * bh, 0, Math.min(96, fade + 4), isMobile);

  const centerCoreGrad = `radial-gradient(ellipse calc(${Math.round(34 * gw)}px * var(--vb-w-${id}) * var(--vb-z-${id}, 1)) calc(${Math.round(32 * gh)}px * var(--vb-h-${id}) * var(--vb-z-${id}, 1)) at calc(50% + var(--vb-cx-${id}) * var(--vb-w-${id}) * var(--vb-z-${id}, 1)) calc(100% + (2px + var(--vb-cy-${id})) * var(--vb-z-${id}, 1)), rgba(255, 255, 255, 0.5) 0%, rgba(255, 255, 255, 0.15) 30%, transparent 68%)`;

  const maskRadial = (w, h, stop1, stop2 = 0) =>
    `radial-gradient(ellipse calc(${Math.round(w * rw)}px * var(--vb-w-${id}) * var(--vb-mw-${id}) * var(--vb-z-${id}, 1)) calc((${Math.round(h * rh)}px * var(--vb-h-${id}) + var(--vb-bh-${id})) * var(--vb-z-${id}, 1)) at calc(50% + var(--vb-cx-${id}) * var(--vb-w-${id}) * var(--vb-z-${id}, 1)) calc(100% + var(--vb-cy-${id}) * var(--vb-z-${id}, 1)), white 0%, rgba(255, 255, 255, 0.5) ${stop1}%${stop2 > 0 ? `, rgba(255, 255, 255, ${stop2}) 85%` : ''}, transparent 100%)`;

  const bloomBlur = isMobile ? '16px' : '10px';

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
  -webkit-mask-image: ${isMobile ? maskRadial(180, 64, 40) : maskRadial(170, 64, 45, 0.3)}, linear-gradient(to top, white 0%, rgba(255, 255, 255, 0.85) 16px, rgba(255, 255, 255, 0.3) 32px, transparent 52px);
  -webkit-mask-composite: source-in;
  mask-image: ${isMobile ? maskRadial(180, 64, 40) : maskRadial(170, 64, 45, 0.3)}, linear-gradient(to top, white 0%, rgba(255, 255, 255, 0.85) 16px, rgba(255, 255, 255, 0.3) 32px, transparent 52px);
  mask-composite: intersect;
  pointer-events: none;
  will-change: transform;
  z-index: 1;
  clip-path: inset(0 round ${rad}px);
  opacity: calc(var(--vb-glow-${id}) * ${innerOpacity});
  filter: ${isMobile ? 'blur(12px) ' : ''}hue-rotate(var(--vb-hue-${id})) brightness(${brightness}) saturate(${saturation});
}

[data-voice-beam="${id}"] [data-voice-beam-bloom] {
  position: absolute;
  inset: 0;
  border-radius: ${radInner}px;
  pointer-events: none;
  will-change: transform;
  -webkit-mask: ${isMobile ? maskRadial(190, 72, 35) : maskRadial(220, 140, 35)};
  mask: ${isMobile ? maskRadial(190, 72, 35) : maskRadial(220, 140, 35)};
  background: ${bloomGradients};
  z-index: 1;
  clip-path: inset(0 round ${rad}px);
  opacity: calc(var(--vb-glow-${id}) * ${bloomOpacity});
  filter: blur(${bloomBlur}) hue-rotate(var(--vb-hue-${id})) brightness(${brightness}) saturate(${saturation});
}

/* Canvas layers for Chromatic Aberration Band and Halo */
[data-voice-beam="${id}"] [data-voice-beam-band],
[data-voice-beam="${id}"] [data-voice-beam-band-halo] {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
  pointer-events: none;
  will-change: transform;
  z-index: 4;
  filter: blur(var(--vb-band-blur-${id}, 0px)) hue-rotate(var(--vb-hue-${id})) brightness(${brightness}) saturate(${saturation});
}

[data-voice-beam="${id}"] [data-voice-beam-band-halo] {
  filter: blur(var(--vb-band-halo-blur-${id}, 0px)) hue-rotate(var(--vb-hue-${id})) brightness(${brightness}) saturate(${saturation});
}
`;
}

// Organic exponential bell curve math directly from libraries.dev/voice
function dr(t, e, a, i) {
  const o = t < 0 ? 1 - i : 1 + i;
  const r = Math.max(0.05, a * o);
  const s = Math.exp(-Math.pow(Math.abs(t) / r, e));
  const n = Math.exp(-Math.pow(1 / r, e));
  return Math.max(0, (s - n) / (1 - n));
}

function hr(t, e, a, i, o) {
  if (a <= 0 || e <= 0) return 0;
  const r = e * Math.max(0, Math.min(0.98, i));
  if (t <= r) return 0;
  const s = Math.min(1, (t - r) / Math.max(1, e - r));
  return a * Math.pow(s, Math.max(0.5, o));
}

function ma(t, e, a) {
  return Math.max(0, Math.min(t, e / 2, a / 2));
}

function st(t, e, a, i = 0) {
  if (a <= 0) return 0;
  const o = Math.min(t, e - t) - i;
  if (o >= a) return 0;
  if (o <= 0) return a;
  const r = a - o;
  return a - Math.sqrt(Math.max(0, a * a - r * r));
}

export function computeBellPoints(config, state, w, h) {
  const o = w / 2 + state.cx * state.w;
  const r = 170 * (config.rangeWidth || 1) * state.w * state.mw;
  const s = h * 0.82 * Math.min(1, config.scale || 1);
  const n = Math.min(s, (64 * (config.rangeHeight || 1) * state.h + state.lift) * (config.bandPosition || 0.35));
  const v = h - (config.bandOffset ?? -27);
  const c = Math.min(1, (state.corner || 0) * 4);
  const u = (config.bandTail || 0.59) * (1 - c * c * (3 - 2 * c));
  const f = u > 0.001;
  const g = f ? (config.bandTailOverflow || 15) : 0;
  const d = f ? -g : o - r;
  const p = f ? w + g : o + r;
  const x = [];
  const da = 56;
  for (let j = 0; j <= da; j++) {
    const E = d + (p - d) * j / da;
    const q = Math.max(-1, Math.min(1, (E - o) / Math.max(1, r)));
    const K = (E < o ? o : w - o) + g;
    const V = dr(q, config.bandCurve || 1.75, config.bandSpread || 0.87, config.bandSkew || 0.12) +
              hr(Math.abs(E - o), K, u, config.bandTailPosition || 0.67, config.bandTailCurve || 2.4);
    const L = (state.corner || 0) > 0 ? st(E, w, ma(config.borderRadius || 0, w, h)) * state.corner : 0;
    x.push([E, v - n * V - L]);
  }
  return x;
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

/**
 * Renders the organic chromatic aberration band on 2D HTML5 Canvas (gr function from libraries.dev/voice)
 */
function renderBandCanvas(bandCanvas, haloCanvas, points, w, h, state, config, isProcessing) {
  if (!bandCanvas || points.length < 2) return;
  const ctx = bandCanvas.getContext('2d');
  const haloCtx = haloCanvas ? haloCanvas.getContext('2d') : null;
  if (!ctx) return;

  const dpr = Math.min(2, (typeof window !== 'undefined' && window.devicePixelRatio) || 1);
  const pw = Math.round(w * dpr);
  const ph = Math.round(h * dpr);

  if (bandCanvas.width !== pw || bandCanvas.height !== ph) {
    bandCanvas.width = pw;
    bandCanvas.height = ph;
  }
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.clearRect(0, 0, w, h);

  if (haloCanvas && haloCtx) {
    if (haloCanvas.width !== pw || haloCanvas.height !== ph) {
      haloCanvas.width = pw;
      haloCanvas.height = ph;
    }
    haloCtx.setTransform(dpr, 0, 0, dpr, 0, 0);
    haloCtx.clearRect(0, 0, w, h);
  }

  if (isProcessing) return;

  const bandStrength = config.bandStrength ?? 1.55;
  const bandWidth = config.bandWidth ?? 2.15;
  const strength = state.strength ?? 1;
  const p = Math.min(1, 0.6 * bandStrength * strength);
  if (p < 0.005 || bandWidth <= 0) return;

  const j = bandWidth * (1 + 0.35 * state.level);
  const aberration = (config.bandAberration ?? 0.89) * (0.35 + 0.65 * state.level);
  const q = (4 + 12 * aberration) * (config.scale || 1);
  const K = 4 * aberration * (config.scale || 1);

  const L = {
    r: config.bandColors?.above || defaultBandColors.above,
    g: config.bandColors?.mid || defaultBandColors.mid,
    b: config.bandColors?.below || defaultBandColors.below,
    c: config.bandColors?.core || defaultBandColors.core
  };

  const H = 0.42 * p;
  const D = 14 * j;
  const $ = 3.5 * bandWidth / 2;
  const Q = $ * dpr;
  const hasCtxFilter = typeof ctx.filter === 'string';

  const se = [[1, 0.16], [0.72, 0.2], [0.46, 0.26], [0.22, 0.34]];
  const R = [
    { rgb: L.r, a: 1, ox: K, oy: -q },
    { rgb: L.g, a: 0.55, ox: K * 0.35, oy: -q * 0.35 },
    { rgb: L.b, a: 1, ox: -K, oy: q },
    { rgb: L.c, a: 0.9, ox: 0, oy: 0 }
  ];

  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  ctx.globalCompositeOperation = 'source-over';

  const startX = points[0][0];
  const endX = points[points.length - 1][0];
  const createGrad = (rgbStr, alpha) => {
    const grad = ctx.createLinearGradient(startX, 0, endX, 0);
    const edge = (config.bandTail || 0) > 0 ? 0.015 : 0.18;
    grad.addColorStop(0, `rgba(${rgbStr}, 0)`);
    grad.addColorStop(edge, `rgba(${rgbStr}, ${alpha.toFixed(3)})`);
    grad.addColorStop(1 - edge, `rgba(${rgbStr}, ${alpha.toFixed(3)})`);
    grad.addColorStop(1, `rgba(${rgbStr}, 0)`);
    return grad;
  };

  // 1. Halo wide glow pass
  const targetHalo = haloCtx || ctx;
  if (hasCtxFilter && haloCtx) {
    haloCtx.filter = `blur(${(Q * 3).toFixed(1)}px)`;
  }
  targetHalo.lineCap = 'round';
  targetHalo.lineJoin = 'round';
  targetHalo.strokeStyle = createGrad(L.c, H * 0.3);
  targetHalo.lineWidth = D * 2.2;
  targetHalo.beginPath();
  targetHalo.moveTo(points[0][0], points[0][1]);
  for (let i = 1; i < points.length; i++) {
    targetHalo.lineTo(points[i][0], points[i][1]);
  }
  targetHalo.stroke();
  if (hasCtxFilter && haloCtx) {
    haloCtx.filter = 'none';
  }

  // 2. Chromatic aberration passes
  if (hasCtxFilter) {
    ctx.filter = `blur(${Q.toFixed(1)}px)`;
  }

  for (const w of R) {
    for (const [O, M] of se) {
      ctx.strokeStyle = createGrad(w.rgb, H * w.a * M);
      ctx.lineWidth = Math.max(0.6, D * O);
      ctx.beginPath();
      ctx.moveTo(points[0][0] + w.ox, points[0][1] + w.oy);
      for (let i = 1; i < points.length; i++) {
        ctx.lineTo(points[i][0] + w.ox, points[i][1] + w.oy);
      }
      ctx.stroke();
    }
  }

  if (hasCtxFilter) {
    ctx.filter = 'none';
  }
}

export const voicePresets = {
  default: {
    scale: 1,
    reach: 1.2,
    spread: 1.05,
    bend: 60,
    bandStrength: 1.55,
    bandWidth: 2.15,
    bandPosition: 0.35,
    bandCurve: 1.75,
    bandSpread: 0.87,
    bandSkew: 0.12,
    bandOffset: -27,
    bandTail: 0.59,
    bandTailPosition: 0.67,
    bandTailCurve: 2.4,
    bandTailOverflow: 15,
    bandAberration: 0.89,
    flow: 48,
    lobeSpacing: 0.85,
    rangeWidth: 0.75,
    rangeHeight: 1,
    idle: 0.18,
    breatheDuration: 5.2,
    processingDuration: 1.1,
    processingTravel: 1.55,
    processingCurve: 2.1,
    processingEase: 0.6,
    processingLevel: 0.55,
    brightness: 1.15,
    saturation: 1.25,
    colorVariant: 'colorful'
  },
  mobile: {
    scale: 1.0,
    spread: 0.5,
    reach: 1.25,
    flow: 48,
    bend: 0,
    bandWidth: 0,
    bandStrength: 0,
    bandOffset: -30,
    bandTail: 0.62,
    bandTailPosition: 0.42,
    bandTailCurve: 2.7,
    bandTailOverflow: 22,
    processingDuration: 1.05,
    processingLevel: 0.35,
    processingTravel: 1,
    cornerFollow: 0.4,
    distortionDetail: 2,
    glowWidth: 1.15,
    glowHeight: 1.2,
    lobeSpacing: 1.05,
    rangeWidth: 1.15,
    rangeHeight: 1.0,
    softness: 1.1,
    idle: 0.16,
    breatheDuration: 4.8,
    brightness: 1.2,
    saturation: 1.45,
    strokeOpacity: 1.0,
    innerOpacity: 0.65,
    bloomOpacity: 0.92,
    colorVariant: 'colorful'
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
    const lobeCompress = 1 - hScan * 0.6;
    const maskWidthCompress = 1 - hScan * 0.45;
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
      const f = falloff(j, ringSpan);
      const lVal = type === 'mobile' ? (0.75 + 0.25 * f) : f;
      containerEl.style.setProperty(`--vb-l${i}-${id}`, lVal.toFixed(3));
    }

    // Render Canvas Bell Band with chromatic aberration
    if (!isProcessing && (config.bandStrength ?? 1) > 0) {
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
      renderBandCanvas(bandCanvas, haloCanvas, points, w, hEl, state, config, isProcessing);
    } else {
      const ctx = bandCanvas.getContext('2d');
      if (ctx) ctx.clearRect(0, 0, w, hEl);
      const hCtx = haloCanvas ? haloCanvas.getContext('2d') : null;
      if (hCtx) hCtx.clearRect(0, 0, w, hEl);
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

/**
 * useMicrophone hook / helper matching libraries.dev usage
 */
export function useMicrophone(options = {}) {
  let stream = null;
  let state = 'idle';
  const listeners = new Set();
  const notify = () => listeners.forEach(fn => fn({ stream, state }));

  async function start() {
    if (typeof navigator === 'undefined' || !navigator.mediaDevices?.getUserMedia) {
      state = 'unsupported';
      notify();
      return null;
    }
    try {
      stream = await navigator.mediaDevices.getUserMedia({
        audio: { echoCancellation: false, noiseSuppression: false, autoGainControl: false, ...options }
      });
      state = 'live';
      notify();
      return stream;
    } catch (err) {
      state = 'idle';
      notify();
      throw err;
    }
  }

  function stop() {
    if (stream) {
      stream.getTracks().forEach(t => t.stop());
      stream = null;
    }
    state = 'idle';
    notify();
  }

  return {
    get stream() { return stream; },
    get state() { return state; },
    start,
    stop,
    subscribe(fn) {
      listeners.add(fn);
      return () => listeners.delete(fn);
    }
  };
}

/**
 * VoiceBeam component / functional wrapper matching libraries.dev syntax:
 * <VoiceBeam stream={mic.stream} processing={thinking}>
 *   <ChatInput />
 * </VoiceBeam>
 */
export function VoiceBeam(props = {}) {
  return props;
}
