/**
 * SpecularButton Component Engine (from React Bits / reactbits.dev)
 * Renders real-time WebGL2 specular highlight shader hugging button edges with mouse proximity tracking.
 */
(function() {
  const PAD = 20;

  const VERT = `#version 300 es
in vec2 position;
void main() {
  gl_Position = vec4(position, 0.0, 1.0);
}
`;

  const FRAG = `#version 300 es
precision highp float;

uniform vec2 uCenter;
uniform vec2 uHalfSize;
uniform float uRadius;
uniform float uAngle;
uniform float uPx;
uniform vec3 uLineColor;
uniform vec3 uBaseColor;
uniform float uIntensity;
uniform float uShineSize;
uniform float uShineFade;
uniform float uThickness;
uniform float uBaseWidth;

out vec4 fragColor;

float sdRoundedRect(vec2 p, vec2 b, float r) {
  vec2 q = abs(p) - b + r;
  return length(max(q, 0.0)) + min(max(q.x, q.y), 0.0) - r;
}

float shapeSDF(vec2 p) { return sdRoundedRect(p, uHalfSize, uRadius); }

float gaussianLine(float d, float sigma) {
  float x = d / (sigma + 1e-6);
  float k = mix(1.0, 1.6, smoothstep(0.0, 1.5, x));
  return exp(-k * x * x);
}

void main() {
  vec2 p = gl_FragCoord.xy - uCenter;
  float d = shapeSDF(p);
  vec2 L = vec2(cos(uAngle), sin(uAngle));

  // Dark base stroke hugging the edge for a sense of thickness
  float base = (1.0 - smoothstep(0.0, uBaseWidth, abs(d))) * 0.45;

  // Symmetric specular: the edges facing toward/away from the light both
  // catch a streak. The angular window (size + fade) is measured with an
  // elliptical normal so it varies continuously along straight edges.
  vec2 nEll = normalize(p / (uHalfSize * uHalfSize) + 1e-6);
  float phi = acos(clamp(abs(dot(nEll, L)), 0.0, 1.0));
  float rim = 1.0 - smoothstep(uShineSize - uShineFade, uShineSize + uShineFade + 1e-4, phi);
  float line = gaussianLine(d, uThickness);
  float edgeClamp = 1.0 - smoothstep(0.5 * uPx, 3.0 * uPx, abs(d));
  float hi = line * rim * edgeClamp * uIntensity;

  vec3 col = uBaseColor * base + uLineColor * hi;
  float a = clamp(base + hi, 0.0, 1.0);
  fragColor = vec4(col, a);
}
`;

  function parseHex(hex) {
    if (!hex) return [1, 1, 1];
    hex = hex.replace('#', '');
    if (hex.length === 3) hex = hex.split('').map(c => c + c).join('');
    const num = parseInt(hex, 16);
    if (isNaN(num)) return [1, 1, 1];
    return [((num >> 16) & 255) / 255, ((num >> 8) & 255) / 255, (num & 255) / 255];
  }

  function initSpecularButton(btn, userOpts = {}) {
    if (!btn) return null;
    const fx = btn.querySelector('.specular-button__fx') || btn;

    const opts = Object.assign({
      radius: 18,
      lineColor: '#ffffff',
      baseColor: '#525252',
      intensity: 1.0,
      shineSize: 10,
      shineFade: 40,
      thickness: 1.2,
      speed: 0.35,
      followMouse: true,
      proximity: 250,
      autoAnimate: true
    }, userOpts);

    const canvas = document.createElement('canvas');
    fx.appendChild(canvas);

    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const gl = canvas.getContext('webgl2', {
      alpha: true,
      premultipliedAlpha: true,
      antialias: true
    });

    if (!gl) {
      console.warn('WebGL2 not supported for SpecularButton, falling back to CSS border.');
      return { destroy: () => {} };
    }

    gl.clearColor(0, 0, 0, 0);
    gl.enable(gl.BLEND);
    gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);

    // Compile shaders
    const vs = gl.createShader(gl.VERTEX_SHADER);
    gl.shaderSource(vs, VERT);
    gl.compileShader(vs);

    const fs = gl.createShader(gl.FRAGMENT_SHADER);
    gl.shaderSource(fs, FRAG);
    gl.compileShader(fs);

    const program = gl.createProgram();
    gl.attachShader(program, vs);
    gl.attachShader(program, fs);
    gl.linkProgram(program);

    if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
      console.warn('Specular program link error:', gl.getProgramInfoLog(program));
      return { destroy: () => {} };
    }

    gl.useProgram(program);

    // Attributes
    const posBuffer = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, posBuffer);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);

    const posLoc = gl.getAttribLocation(program, 'position');
    gl.enableVertexAttribArray(posLoc);
    gl.vertexAttribPointer(posLoc, 2, gl.FLOAT, false, 0, 0);

    // Uniforms
    const uCenter = gl.getUniformLocation(program, 'uCenter');
    const uHalfSize = gl.getUniformLocation(program, 'uHalfSize');
    const uRadius = gl.getUniformLocation(program, 'uRadius');
    const uAngle = gl.getUniformLocation(program, 'uAngle');
    const uPx = gl.getUniformLocation(program, 'uPx');
    const uLineColor = gl.getUniformLocation(program, 'uLineColor');
    const uBaseColor = gl.getUniformLocation(program, 'uBaseColor');
    const uIntensity = gl.getUniformLocation(program, 'uIntensity');
    const uShineSize = gl.getUniformLocation(program, 'uShineSize');
    const uShineFade = gl.getUniformLocation(program, 'uShineFade');
    const uThickness = gl.getUniformLocation(program, 'uThickness');
    const uBaseWidth = gl.getUniformLocation(program, 'uBaseWidth');

    const sizeRef = { w: 1, h: 1 };
    const resize = () => {
      const rect = btn.getBoundingClientRect();
      const w = rect.width || 120;
      const h = rect.height || 36;
      sizeRef.w = w;
      sizeRef.h = h;
      canvas.width = Math.round((w + PAD * 2) * dpr);
      canvas.height = Math.round((h + PAD * 2) * dpr);
      gl.viewport(0, 0, canvas.width, canvas.height);
    };

    const ro = new ResizeObserver(resize);
    ro.observe(btn);
    resize();

    let pointerAngle = null;
    let proximityT = 0;
    const onPointerMove = (e) => {
      const rect = btn.getBoundingClientRect();
      const cx = rect.left + rect.width / 2;
      const cy = rect.top + rect.height / 2;
      const dx = Math.max(rect.left - e.clientX, 0, e.clientX - rect.right);
      const dy = Math.max(rect.top - e.clientY, 0, e.clientY - rect.bottom);
      const dist = Math.hypot(dx, dy);

      if (dist === 0) {
        const nx = (e.clientX - cx) / (rect.width / 2);
        const ny = (cy - e.clientY) / (rect.height / 2);
        pointerAngle = Math.atan2(2 / rect.height, -2 / rect.width) + nx * 0.3 + ny * 0.15;
      } else {
        pointerAngle = Math.atan2(cy - e.clientY, e.clientX - cx);
      }
      const t = Math.max(0, 1 - dist / Math.max(opts.proximity, 1));
      proximityT = t * t * (3 - 2 * t);
    };
    window.addEventListener('pointermove', onPointerMove, { passive: true });

    let angle = 2.4;
    let idleAngle = 2.4;
    let bright = 0.5;
    let last = performance.now();
    let rafId = 0;

    const lineC = parseHex(opts.lineColor);
    const baseC = parseHex(opts.baseColor);

    const update = (now) => {
      rafId = requestAnimationFrame(update);
      const dt = Math.min((now - last) / 1000, 0.05);
      last = now;

      idleAngle += opts.speed * dt;
      const steer = opts.followMouse && pointerAngle != null && (!opts.autoAnimate || proximityT > 0);
      const target = steer ? pointerAngle : idleAngle;
      const diff = ((target - angle + Math.PI * 3) % (Math.PI * 2)) - Math.PI;
      angle += diff * (1 - Math.exp(-dt * 7));

      const brightTarget = opts.autoAnimate ? Math.max(0.6, proximityT) : proximityT;
      bright += (brightTarget - bright) * (1 - Math.exp(-dt * 8));

      gl.clear(gl.COLOR_BUFFER_BIT);
      gl.useProgram(program);

      gl.uniform2f(uCenter, (PAD + sizeRef.w / 2) * dpr, (PAD + sizeRef.h / 2) * dpr);
      gl.uniform2f(uHalfSize, (sizeRef.w / 2) * dpr, (sizeRef.h / 2) * dpr);
      gl.uniform1f(uRadius, Math.min(opts.radius, Math.min(sizeRef.w, sizeRef.h) / 2) * dpr);
      gl.uniform1f(uAngle, angle);
      gl.uniform1f(uPx, dpr);
      gl.uniform3f(uLineColor, lineC[0], lineC[1], lineC[2]);
      gl.uniform3f(uBaseColor, baseC[0], baseC[1], baseC[2]);
      gl.uniform1f(uIntensity, opts.intensity * bright);
      gl.uniform1f(uShineSize, (opts.shineSize * Math.PI) / 180);
      gl.uniform1f(uShineFade, (opts.shineFade * Math.PI) / 180);
      gl.uniform1f(uThickness, opts.thickness * dpr);
      gl.uniform1f(uBaseWidth, dpr);

      gl.drawArrays(gl.TRIANGLES, 0, 3);
    };
    rafId = requestAnimationFrame(update);

    const destroy = () => {
      cancelAnimationFrame(rafId);
      ro.disconnect();
      window.removeEventListener('pointermove', onPointerMove);
      if (canvas.parentNode) canvas.parentNode.removeChild(canvas);
      gl.getExtension('WEBGL_lose_context')?.loseContext();
    };

    return { destroy };
  }

  window.initSpecularButton = initSpecularButton;
})();
