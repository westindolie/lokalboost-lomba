import { useEffect, useRef } from 'react'

/**
 * Latar shader WebGL untuk hero halaman depan.
 *
 * Paletnya memakai warna merek LokalBoost (cream · cream-300 · gold · skyfoot)
 * supaya menyatu dengan halaman, bukan warna bawaan komponen aslinya.
 *
 * Aturan gerak yang dipegang (lihat src/motion.js):
 *   - Ini lapis AMBIENT: geraknya sangat pelan (timeScale 0,12) dan amplitudonya
 *     kecil, jadi tidak pernah menarik perhatian dari judul dan tombol.
 *   - Kursor hanya mendorong bidang warna sedikit (mode Push, kekuatan 0,18).
 *   - Bila pengguna memilih "reduce motion", satu bingkai digambar lalu berhenti
 *     total — gradiennya tetap terlihat, geraknya tidak ada.
 *
 * Render berhenti sendiri saat tab tidak terlihat atau kanvas keluar layar.
 */

const VERT = `
attribute vec2 a_position;
void main() {
  gl_Position = vec4(a_position, 0.0, 1.0);
}
`

const FRAG = `
#ifdef GL_FRAGMENT_PRECISION_HIGH
precision highp float;
#else
precision mediump float;
#endif

// Uniform dipadatkan jadi vec4 supaya jumlah panggilan gl.uniform* sedikit.
uniform vec4 u_scene;     // resolusi.x, resolusi.y, waktu, jumlah warna
uniform vec4 u_shape;     // scale, intensity, paramA, warp
uniform vec4 u_surface;   // detail, contrast, brightness, saturation
uniform vec4 u_finish;    // hue, vignette, blur, grain
uniform vec4 u_transform; // seed, rotate, drift, oklab
uniform vec4 u_space;     // offsetX, offsetY, mouseX, mouseY
uniform vec4 u_cursor;    // presence, effect, strength, radius
uniform vec3 u_colors[8];

#define u_resolution u_scene.xy
#define u_time u_scene.z
#define u_colorCount u_scene.w
#define u_scale u_shape.x
#define u_intensity u_shape.y
#define u_paramA u_shape.z
#define u_warp u_shape.w
#define u_detail u_surface.x
#define u_contrast u_surface.y
#define u_brightness u_surface.z
#define u_saturation u_surface.w
#define u_hue u_finish.x
#define u_vignette u_finish.y
#define u_blur u_finish.z
#define u_grain u_finish.w
#define u_seed u_transform.x
#define u_rotate u_transform.y
#define u_drift u_transform.z
#define u_oklab u_transform.w
#define u_offset u_space.xy
#define u_mouse u_space.zw
#define u_cursorPresence u_cursor.x
#define u_cursorEffect u_cursor.y
#define u_cursorStrength u_cursor.z
#define u_cursorRadius u_cursor.w

float hash21(vec2 p) {
  p = fract(p * vec2(123.34, 456.21));
  p += dot(p, p + 45.32);
  return fract(p.x * p.y);
}

float grainHash(vec2 p) {
  return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453);
}

float noise(vec2 p) {
  vec2 i = floor(p);
  vec2 f = fract(p);
  vec2 u = f * f * (3.0 - 2.0 * f);
  return mix(
    mix(hash21(i), hash21(i + vec2(1.0, 0.0)), u.x),
    mix(hash21(i + vec2(0.0, 1.0)), hash21(i + vec2(1.0, 1.0)), u.x),
    u.y);
}

float fbm(vec2 p) {
  float v = 0.0;
  float a = 0.5;
  for (int i = 0; i < 5; i++) {
    v += a * noise(p);
    p = p * 2.03 + vec2(17.0, 9.2);
    a *= 0.5;
  }
  return v;
}

// --- OKLab colour mixing (perceptual), gated by u_oklab -----------------------
vec3 srgbToLinear(vec3 c) {
  return mix(c / 12.92, pow((c + 0.055) / 1.055, vec3(2.4)),
    step(0.04045, c));
}
vec3 linearToSrgb(vec3 c) {
  // max() guards the sRGB branch: out-of-gamut OKLab interpolations can send a
  // channel negative, and pow(negative, …) is NaN which mix()/step() would
  // then propagate. The linear branch clips such channels to 0 downstream.
  return mix(c * 12.92, 1.055 * pow(max(c, vec3(0.0)), vec3(1.0 / 2.4)) - 0.055,
    step(0.0031308, c));
}
vec3 linToOklab(vec3 c) {
  float l = 0.4122214708 * c.r + 0.5363325363 * c.g + 0.0514459929 * c.b;
  float m = 0.2119034982 * c.r + 0.6806995451 * c.g + 0.1073969566 * c.b;
  float s = 0.0883024619 * c.r + 0.2817188376 * c.g + 0.6299787005 * c.b;
  l = pow(max(l, 0.0), 1.0 / 3.0);
  m = pow(max(m, 0.0), 1.0 / 3.0);
  s = pow(max(s, 0.0), 1.0 / 3.0);
  return vec3(
    0.2104542553 * l + 0.7936177850 * m - 0.0040720468 * s,
    1.9779984951 * l - 2.4285922050 * m + 0.4505937099 * s,
    0.0259040371 * l + 0.7827717662 * m - 0.8086757660 * s);
}
vec3 oklabToLin(vec3 c) {
  float l = c.x + 0.3963377774 * c.y + 0.2158037573 * c.z;
  float m = c.x - 0.1055613458 * c.y - 0.0638541728 * c.z;
  float s = c.x - 0.0894841775 * c.y - 1.2914855480 * c.z;
  l = l * l * l; m = m * m * m; s = s * s * s;
  return vec3(
    4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s,
    -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s,
    -0.0041960863 * l - 0.7034186147 * m + 1.7076147010 * s);
}
vec3 mixColour(vec3 a, vec3 b, float t) {
  if (u_oklab > 0.5) {
    vec3 la = linToOklab(srgbToLinear(a));
    vec3 lb = linToOklab(srgbToLinear(b));
    return clamp(linearToSrgb(oklabToLin(mix(la, lb, t))), 0.0, 1.0);
  }
  return mix(a, b, t);
}

// Mix through the recipe colours; x is clamped to 0..1. WebGL1 forbids
// dynamic uniform indexing in fragment shaders, hence the constant loop.
vec3 palette(float x) {
  float n = max(u_colorCount - 1.0, 1.0);
  float f = clamp(x, 0.0, 1.0) * n;
  vec3 col = u_colors[0];
  for (int i = 0; i < 7; i++) {
    if (float(i) < n)
      col = mixColour(col, u_colors[i + 1],
        smoothstep(0.0, 1.0, clamp(f - float(i), 0.0, 1.0)));
  }
  return col;
}

vec3 hueRotate(vec3 col, float a) {
  const mat3 toYIQ = mat3(0.299, 0.596, 0.211,
                          0.587, -0.274, -0.523,
                          0.114, -0.322, 0.312);
  const mat3 toRGB = mat3(1.0, 1.0, 1.0,
                          0.956, -0.272, -1.106,
                          0.621, -0.647, 1.703);
  vec3 yiq = toYIQ * col;
  float ca = cos(a), sa = sin(a);
  yiq = vec3(yiq.x, yiq.y * ca - yiq.z * sa, yiq.y * sa + yiq.z * ca);
  return toRGB * yiq;
}

vec3 shade(vec2 uv, vec2 p, float t) {
  vec3 acc = u_colors[0] * 0.15;
  float total = 0.15;
  for (int i = 0; i < 8; i++) {
    if (float(i) >= u_colorCount) break;
    float fi = float(i);
    vec2 c = vec2(
      sin(t * (0.21 + fi * 0.071) + fi * 2.4 + u_seed),
      cos(t * (0.17 + fi * 0.093) + fi * 1.7)) * (0.45 + u_intensity * 0.35);
    float w = exp(-dot(p - c, p - c) * 6.0);
    acc += u_colors[i] * w;
    total += w;
  }
  return acc / total;
}

void main() {
  vec2 uv = gl_FragCoord.xy / u_resolution.xy;
  vec2 screenUv = uv;
  vec2 p = (gl_FragCoord.xy - 0.5 * u_resolution.xy)
    / min(u_resolution.x, u_resolution.y);
  float cursorMask = 0.0;

  // Cursor modes 1–3 are local distortions. Push shifts the same screen-space
  // coordinates before field transforms, so Zoom/Rotate don't change its feel.
  if (u_cursorPresence > 0.001) {
    // u_mouse is normalized to -1..1 in canvas space. Convert it to the same
    // aspect-corrected screen space as p so effects stay under the cursor.
    vec2 cursor = (0.5 * u_mouse * u_resolution.xy)
      / min(u_resolution.x, u_resolution.y);
    vec2 cursorDelta = p - cursor;
    if (u_cursorEffect < 0.5) {
      p += cursor * u_cursorPresence * u_cursorStrength * 0.55;
    } else {
      float cursorDistance = length(cursorDelta);
      vec2 cursorDirection = cursorDelta / max(cursorDistance, 0.0001);
      cursorMask = u_cursorPresence
        * (1.0 - smoothstep(0.0, u_cursorRadius, cursorDistance));
      if (u_cursorEffect < 1.5) {
        p -= cursorDirection * cursorMask * u_cursorStrength * 0.24;
      } else if (u_cursorEffect < 2.5) {
        float cursorAngle = cursorMask * u_cursorStrength * 2.2;
        float cc = cos(cursorAngle), cs = sin(cursorAngle);
        p = cursor + mat2(cc, -cs, cs, cc) * cursorDelta;
      } else if (u_cursorEffect < 3.5) {
        float ripple = sin(
          cursorDistance / max(u_cursorRadius, 0.001) * 18.0 - u_time * 5.0);
        p -= cursorDirection * ripple * cursorMask * u_cursorStrength * 0.07;
      }
    }
  }

  // Keep presets that read uv (rather than p) in the same warped space.
  uv = p * min(u_resolution.x, u_resolution.y) / u_resolution.xy + 0.5;
  p *= u_scale;
  // Field transform: rotate, pan, pointer push, slow drift.
  if (abs(u_rotate) > 0.0001) {
    float cr = cos(u_rotate), sr = sin(u_rotate);
    p = mat2(cr, -sr, sr, cr) * p;
  }
  p += u_offset;
  if (u_drift > 0.0001)
    p += u_drift * vec2(sin(u_time * 0.31), cos(u_time * 0.23));
  // Organic domain warp.
  if (u_warp > 0.0) {
    p += u_warp * (vec2(
      fbm(p * u_detail + u_seed),
      fbm(p * u_detail + vec2(5.2, 1.3))) - 0.5);
  }
  // Shade, with an optional soft 5-tap blur.
  vec3 col;
  if (u_blur > 0.0) {
    float e = u_blur;
    float pe = e * u_scale;
    vec2 uvE = vec2(e) * min(u_resolution.x, u_resolution.y) / u_resolution.xy;
    col  = shade(uv, p, u_time) * 0.36;
    col += shade(uv + vec2(uvE.x, 0.0), p + vec2(pe, 0.0), u_time) * 0.16;
    col += shade(uv - vec2(uvE.x, 0.0), p - vec2(pe, 0.0), u_time) * 0.16;
    col += shade(uv + vec2(0.0, uvE.y), p + vec2(0.0, pe), u_time) * 0.16;
    col += shade(uv - vec2(0.0, uvE.y), p - vec2(0.0, pe), u_time) * 0.16;
  } else {
    col = shade(uv, p, u_time);
  }
  // Post: contrast, saturation, hue, brightness, vignette, grain.
  if (abs(u_contrast - 1.0) > 0.0001)
    col = (col - 0.5) * u_contrast + 0.5;
  if (abs(u_saturation - 1.0) > 0.0001) {
    float luma = dot(col, vec3(0.299, 0.587, 0.114));
    col = mix(vec3(luma), col, u_saturation);
  }
  if (abs(u_hue) > 0.0001)
    col = hueRotate(col, u_hue);
  if (abs(u_brightness) > 0.0001)
    col += u_brightness;
  if (u_vignette > 0.0001) {
    float vd = length(screenUv - 0.5) * 1.41421356;
    col *= 1.0 - u_vignette * smoothstep(0.35, 1.0, vd);
  }
  if (u_cursorPresence > 0.001 && u_cursorEffect > 3.5)
    col += (vec3(0.18) + col * 0.12) * cursorMask * u_cursorStrength;
  if (u_grain > 0.0001)
    col += (grainHash(
      gl_FragCoord.xy + vec2(u_seed * 17.0, u_seed * 31.0)) - 0.5) * u_grain;
  gl_FragColor = vec4(clamp(col, 0.0, 1.0), 1.0);
}
`

/**
 * Palet LokalBoost, selang-seling hangat–sejuk supaya pergerakannya terbaca:
 *   cream #FCF9F2 · gold #FFF2BA · skyfoot #C9DAEF · gold-border #F0DE93
 * Slot sisa diisi cream supaya aman kalau colorCount dinaikkan.
 *
 * Warna aksen sengaja tidak sepucat cream-300: kalau semua warna hampir sama,
 * bidangnya boleh bergerak tapi mata tidak melihat apa-apa.
 */
const UNIFORMS = {
  colors: [
    [0.988, 0.976, 0.949], // cream
    [1.0, 0.949, 0.729], // gold
    [0.788, 0.855, 0.937], // skyfoot
    [0.941, 0.871, 0.576], // gold-border
    [0.988, 0.976, 0.949],
    [0.988, 0.976, 0.949],
    [0.988, 0.976, 0.949],
    [0.988, 0.976, 0.949],
  ],
  colorCount: 4,
  scale: 1.05,
  intensity: 0.72,
  paramA: 0.67,
  warp: 0.24,
  detail: 1.9,
  contrast: 1.08,
  brightness: 0.01,
  saturation: 1.12,
  hue: 0.0,
  vignette: 0.1,
  blur: 0.006,
  grain: 0.045,
  seed: 1804.0,
  rotate: 0.42,
  offsetX: 0.06,
  offsetY: 0.1,
  drift: 0.14,
  cursorEnabled: true,
  cursorEffect: 0.0, // 0 = Push (paling halus), 1 = Pull, 2 = Rotate, 3 = Ripple
  cursorStrength: 0.28,
  cursorRadius: 0.45,
  oklab: 1.0,
  // Satu putaran penuh bidang warna ±25 detik: terlihat bergerak dalam beberapa
  // detik pertama, tapi masih lapis latar — bukan animasi yang minta dilihat.
  timeScale: 0.45,
}

// StrictMode memasang efek dua kali; melepas konteks WebGL langsung saat
// pembersihan pertama akan mematikan kanvas yang baru saja dipasang ulang.
const pendingContextReleases = new WeakMap()

export default function ShaderBackground({ className }) {
  const canvasRef = useRef(null)

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const pendingRelease = pendingContextReleases.get(canvas)
    if (pendingRelease !== undefined) window.clearTimeout(pendingRelease)
    pendingContextReleases.delete(canvas)
    const gl = canvas.getContext('webgl', { antialias: false })
    if (!gl) return

    const kurangGerak =
      window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false
    const timeScale = kurangGerak ? 0 : UNIFORMS.timeScale
    const cursorEnabled = UNIFORMS.cursorEnabled && !kurangGerak

    const compile = (type, src) => {
      const s = gl.createShader(type)
      gl.shaderSource(s, src)
      gl.compileShader(s)
      if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) {
        console.error('ShaderBackground:', gl.getShaderInfoLog(s))
        gl.deleteShader(s)
        return null
      }
      return s
    }
    const vertexShader = compile(gl.VERTEX_SHADER, VERT)
    const fragmentShader = compile(gl.FRAGMENT_SHADER, FRAG)
    if (!vertexShader || !fragmentShader) return
    const program = gl.createProgram()
    gl.attachShader(program, vertexShader)
    gl.attachShader(program, fragmentShader)
    gl.linkProgram(program)
    gl.deleteShader(vertexShader)
    gl.deleteShader(fragmentShader)
    if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
      console.error('ShaderBackground:', gl.getProgramInfoLog(program))
      gl.deleteProgram(program)
      return
    }
    gl.useProgram(program)

    const buf = gl.createBuffer()
    gl.bindBuffer(gl.ARRAY_BUFFER, buf)
    gl.bufferData(
      gl.ARRAY_BUFFER,
      new Float32Array([-1, -1, 3, -1, -1, 3]),
      gl.STATIC_DRAW,
    )
    const loc = gl.getAttribLocation(program, 'a_position')
    gl.enableVertexAttribArray(loc)
    gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0)

    const uni = {
      colors:
        gl.getUniformLocation(program, 'u_colors') ??
        gl.getUniformLocation(program, 'u_colors[0]'),
      scene: gl.getUniformLocation(program, 'u_scene'),
      shape: gl.getUniformLocation(program, 'u_shape'),
      surface: gl.getUniformLocation(program, 'u_surface'),
      finish: gl.getUniformLocation(program, 'u_finish'),
      transform: gl.getUniformLocation(program, 'u_transform'),
      space: gl.getUniformLocation(program, 'u_space'),
      cursor: gl.getUniformLocation(program, 'u_cursor'),
    }
    gl.uniform3fv(uni.colors, new Float32Array(UNIFORMS.colors.flat()))
    gl.uniform4f(
      uni.shape,
      UNIFORMS.scale,
      UNIFORMS.intensity,
      UNIFORMS.paramA,
      UNIFORMS.warp,
    )
    gl.uniform4f(
      uni.surface,
      UNIFORMS.detail,
      UNIFORMS.contrast,
      UNIFORMS.brightness,
      UNIFORMS.saturation,
    )
    gl.uniform4f(
      uni.finish,
      UNIFORMS.hue,
      UNIFORMS.vignette,
      UNIFORMS.blur,
      UNIFORMS.grain,
    )
    gl.uniform4f(
      uni.transform,
      UNIFORMS.seed,
      UNIFORMS.rotate,
      UNIFORMS.drift,
      UNIFORMS.oklab,
    )
    gl.uniform4f(
      uni.cursor,
      0,
      UNIFORMS.cursorEffect,
      UNIFORMS.cursorStrength,
      UNIFORMS.cursorRadius,
    )

    let targetX = 0
    let targetY = 0
    let targetPresence = 0
    let mouseX = 0
    let mouseY = 0
    let cursorPresence = 0
    let pointerKnown = false
    let pointerClientX = 0
    let pointerClientY = 0
    let bounds = canvas.getBoundingClientRect()
    let raf = 0
    let lastNow = null
    let visible = document.visibilityState === 'visible'
    let inView = true
    let disposed = false
    const start = performance.now()
    const timeAnimated = Math.abs(timeScale) > 0.0001

    const resizeCanvas = () => {
      const dpr = Math.min(window.devicePixelRatio || 1, 2)
      const rawWidth = Math.max(1, Math.round(bounds.width * dpr))
      const rawHeight = Math.max(1, Math.round(bounds.height * dpr))
      // Batas ~2 MP: di layar besar dengan DPR 2, menggambar piksel penuh
      // membakar GPU tanpa terlihat bedanya pada gradien selembut ini.
      const pixelScale = Math.min(
        1,
        Math.sqrt(2_000_000 / Math.max(1, rawWidth * rawHeight)),
      )
      const width = Math.max(1, Math.round(rawWidth * pixelScale))
      const height = Math.max(1, Math.round(rawHeight * pixelScale))
      if (canvas.width !== width || canvas.height !== height) {
        canvas.width = width
        canvas.height = height
        gl.viewport(0, 0, width, height)
      }
    }

    function requestRender() {
      if (!disposed && visible && inView && raf === 0) {
        raf = requestAnimationFrame(render)
      }
    }

    const updatePointerTarget = () => {
      if (!pointerKnown) return
      if (bounds.width === 0 || bounds.height === 0) return
      const inside =
        pointerClientX >= bounds.left &&
        pointerClientX <= bounds.right &&
        pointerClientY >= bounds.top &&
        pointerClientY <= bounds.bottom
      if (!inside) {
        targetPresence = 0
        requestRender()
        return
      }
      const nextX = ((pointerClientX - bounds.left) / bounds.width) * 2 - 1
      const nextY = -(((pointerClientY - bounds.top) / bounds.height) * 2 - 1)
      if (targetPresence === 0 && cursorPresence < 0.01) {
        mouseX = nextX
        mouseY = nextY
      }
      targetX = nextX
      targetY = nextY
      targetPresence = 1
      requestRender()
    }
    const onPointerMove = (event) => {
      pointerKnown = true
      pointerClientX = event.clientX
      pointerClientY = event.clientY
      bounds = canvas.getBoundingClientRect()
      updatePointerTarget()
    }
    const onPointerLeave = () => {
      pointerKnown = false
      targetPresence = 0
      requestRender()
    }
    const updateLayout = () => {
      bounds = canvas.getBoundingClientRect()
      resizeCanvas()
      updatePointerTarget()
      requestRender()
    }
    window.addEventListener('resize', updateLayout)
    if (cursorEnabled) {
      window.addEventListener('pointermove', onPointerMove, { passive: true })
      window.addEventListener('pointercancel', onPointerLeave)
      window.addEventListener('scroll', updateLayout, true)
      window.addEventListener('blur', onPointerLeave)
      document.documentElement.addEventListener('pointerleave', onPointerLeave)
    }

    const resizeObserver = new ResizeObserver(updateLayout)
    resizeObserver.observe(canvas)
    const intersectionObserver = new IntersectionObserver(([entry]) => {
      inView = entry?.isIntersecting ?? true
      if (inView) requestRender()
      else if (raf !== 0) {
        cancelAnimationFrame(raf)
        raf = 0
        lastNow = null
      }
    })
    intersectionObserver.observe(canvas)
    const onVisibilityChange = () => {
      visible = document.visibilityState === 'visible'
      if (visible) requestRender()
      else if (raf !== 0) {
        cancelAnimationFrame(raf)
        raf = 0
        lastNow = null
      }
    }
    document.addEventListener('visibilitychange', onVisibilityChange)

    function render(now) {
      raf = 0
      if (disposed || !visible || !inView) return
      const dt = lastNow === null ? 0 : Math.min((now - lastNow) / 1000, 0.1)
      lastNow = now
      const follow = 1 - Math.exp(-12 * dt)
      mouseX += (targetX - mouseX) * follow
      mouseY += (targetY - mouseY) * follow
      cursorPresence += (targetPresence - cursorPresence) * follow
      resizeCanvas()
      const width = canvas.width
      const height = canvas.height
      gl.uniform4f(
        uni.scene,
        width,
        height,
        ((now - start) / 1000) * timeScale,
        UNIFORMS.colorCount,
      )
      gl.uniform4f(uni.space, UNIFORMS.offsetX, UNIFORMS.offsetY, mouseX, mouseY)
      gl.uniform4f(
        uni.cursor,
        cursorEnabled ? cursorPresence : 0,
        UNIFORMS.cursorEffect,
        UNIFORMS.cursorStrength,
        UNIFORMS.cursorRadius,
      )
      gl.drawArrays(gl.TRIANGLES, 0, 3)
      const pointerSettling =
        Math.abs(targetX - mouseX) > 0.001 ||
        Math.abs(targetY - mouseY) > 0.001 ||
        Math.abs(targetPresence - cursorPresence) > 0.001
      if (timeAnimated || pointerSettling) requestRender()
      else lastNow = null
    }
    requestRender()

    return () => {
      disposed = true
      cancelAnimationFrame(raf)
      resizeObserver.disconnect()
      intersectionObserver.disconnect()
      document.removeEventListener('visibilitychange', onVisibilityChange)
      window.removeEventListener('resize', updateLayout)
      if (cursorEnabled) {
        window.removeEventListener('pointermove', onPointerMove)
        window.removeEventListener('pointercancel', onPointerLeave)
        window.removeEventListener('scroll', updateLayout, true)
        window.removeEventListener('blur', onPointerLeave)
        document.documentElement.removeEventListener(
          'pointerleave',
          onPointerLeave,
        )
      }
      gl.deleteBuffer(buf)
      gl.deleteProgram(program)
      const releaseTimer = window.setTimeout(() => {
        if (pendingContextReleases.get(canvas) !== releaseTimer) return
        pendingContextReleases.delete(canvas)
        // Kanvas masih menempel di dokumen = ini pemasangan ulang StrictMode,
        // bukan pembongkaran sungguhan. Melepas konteks di sini mematikan
        // kanvas yang baru saja dipakai lagi (layar jadi kosong).
        if (canvas.isConnected) return
        gl.getExtension('WEBGL_lose_context')?.loseContext()
        canvas.width = 1
        canvas.height = 1
      }, 0)
      pendingContextReleases.set(canvas, releaseTimer)
    }
  }, [])

  return (
    <canvas
      ref={canvasRef}
      aria-hidden
      className={className}
      style={{ display: 'block', width: '100%', height: '100%' }}
    />
  )
}
