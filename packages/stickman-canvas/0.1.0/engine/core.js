// Stickman Canvas v2 — core (kubcode.dev, MIT). Clean-room implementation.
export const W = 1080, H = 1920, GY = H * 0.68, CX = W / 2;
export const FONT = "'Anuphan', 'Sukhumvit Set', sans-serif";

export const clamp = (v, a = 0, b = 1) => Math.min(b, Math.max(a, v));
export const lerp = (a, b, k) => a + (b - a) * k;
export const prog = (t, a, b) => clamp((t - a) / (b - a));
export const ease = {
  in: (k) => k * k * k,
  out: (k) => 1 - Math.pow(1 - clamp(k), 3),
  inOut: (k) => { k = clamp(k); return k < 0.5 ? 4 * k * k * k : 1 - Math.pow(-2 * k + 2, 3) / 2; },
  back: (k) => { k = clamp(k); const c = 1.7; return 1 + (c + 1) * Math.pow(k - 1, 3) + c * Math.pow(k - 1, 2); },
};
/** Keyframes: [[t, value], ...] with easing between them. */
export function keys(t, list, e = ease.inOut) {
  if (t <= list[0][0]) return list[0][1];
  for (let i = 1; i < list.length; i++) {
    const [t1, v1] = list[i], [t0, v0] = list[i - 1];
    if (t <= t1) return lerp(v0, v1, e((t - t0) / (t1 - t0)));
  }
  return list[list.length - 1][1];
}
/** Deterministic random in [0,1) from a number seed. */
export const hash = (n) => { const x = Math.sin(n * 12.9898 + 78.233) * 43758.5453; return x - Math.floor(x); };
export const noise = (x, seed = 0) => { const i = Math.floor(x), f = x - i, u = f * f * (3 - 2 * f); return lerp(hash(i + seed * 101), hash(i + 1 + seed * 101), u) * 2 - 1; };

// ---- colour ---------------------------------------------------------------
export const hex = (c) => [parseInt(c.slice(1, 3), 16), parseInt(c.slice(3, 5), 16), parseInt(c.slice(5, 7), 16)];
export const rgba = (c, a = 1) => { const [r, g, b] = hex(c); return `rgba(${r},${g},${b},${a})`; };
export const mix = (a, b, k) => { const x = hex(a), y = hex(b); return "#" + x.map((v, i) => Math.round(lerp(v, y[i], k)).toString(16).padStart(2, "0")).join(""); };

/** Moods: every colour a set uses comes from here so the grade stays coherent. */
export const MOODS = {
  stage:  { sky: ["#071a12", "#0d2a1d"], wall: "#10261b", wall2: "#183626", floor: "#0a1610", key: "#d8ff6a", rim: "#7dffb0", warm: "#ffb347", cool: "#4fb8ff", fog: "#1f5a3a" },
  night:  { sky: ["#0b1030", "#2a2f63"], wall: "#151528", wall2: "#1e1d38", floor: "#0d0c18", key: "#ffcf7a", rim: "#a8c8ff", warm: "#ffb44a", cool: "#6f8cff", fog: "#2a2f55" },
  dusk:   { sky: ["#2b1240", "#ff8a4c"], wall: "#2a1730", wall2: "#3a1f3c", floor: "#160c18", key: "#ffb36b", rim: "#ffe0b0", warm: "#ffb36b", cool: "#8a6cff", fog: "#5b2f52" },
  blueprint: { sky: ["#071733", "#0c2450"], wall: "#0b1d3f", wall2: "#10264f", floor: "#081631", key: "#ffd166", rim: "#9cc8ff", warm: "#ffd166", cool: "#7fb2ff", fog: "#16325f" },
};

// ---- grade (applied to the finished frame) ---------------------------------
/**
 * Lift/gamma/gain per channel + saturation + contrast, then grain and vignette.
 * A LUT keeps it fast enough for 1080×1920 per frame.
 */
export function makeGrade({ lift = [0, 0, 0], gamma = [1, 1, 1], gain = [1, 1, 1], sat = 1, contrast = 1 } = {}) {
  const lut = [0, 1, 2].map((c) => {
    const a = new Uint8ClampedArray(256);
    for (let i = 0; i < 256; i++) {
      let v = i / 255;
      v = v * gain[c] + lift[c] * (1 - v);
      v = Math.pow(clamp(v), 1 / gamma[c]);
      v = (v - 0.5) * contrast + 0.5;
      a[i] = clamp(v) * 255;
    }
    return a;
  });
  return { lut, sat };
}
export const GRADES = {
  emerald: makeGrade({ lift: [0.0, 0.035, 0.02], gamma: [0.95, 1.05, 0.98], gain: [0.98, 1.06, 0.96], sat: 1.12, contrast: 1.08 }),
  midnight: makeGrade({ lift: [0.0, 0.01, 0.05], gamma: [0.95, 0.98, 1.08], gain: [0.95, 1.0, 1.08], sat: 1.05, contrast: 1.1 }),
  ember: makeGrade({ lift: [0.04, 0.01, 0.0], gamma: [1.06, 1.0, 0.92], gain: [1.06, 1.0, 0.92], sat: 1.1, contrast: 1.06 }),
};
export function finish(ctx, t, { grade = GRADES.emerald, grain = 0.06, vignette = 0.55, bars = 0 } = {}) {
  const img = ctx.getImageData(0, 0, W, H), d = img.data, { lut, sat } = grade;
  const seed = Math.floor(t * 24);
  for (let i = 0, p = 0; i < d.length; i += 4, p++) {
    let r = lut[0][d[i]], g = lut[1][d[i + 1]], b = lut[2][d[i + 2]];
    const l = 0.299 * r + 0.587 * g + 0.114 * b;
    r = l + (r - l) * sat; g = l + (g - l) * sat; b = l + (b - l) * sat;
    if (grain) { const n = (hash(p * 0.37 + seed * 9.1) - 0.5) * 255 * grain; r += n; g += n; b += n; }
    d[i] = r; d[i + 1] = g; d[i + 2] = b;
  }
  ctx.putImageData(img, 0, 0);
  const v = ctx.createRadialGradient(W / 2, H * 0.48, H * 0.22, W / 2, H * 0.5, H * 0.78);
  v.addColorStop(0, "rgba(0,0,0,0)"); v.addColorStop(1, `rgba(0,0,0,${vignette})`);
  ctx.fillStyle = v; ctx.fillRect(0, 0, W, H);
  if (bars > 0) { ctx.fillStyle = "#000"; ctx.fillRect(0, 0, W, bars); ctx.fillRect(0, H - bars, W, bars); }
}

// ---- camera and depth -----------------------------------------------------
/** cam = { z, x, y, r }. Depth 1 = character plane; <1 moves less (far), >1 more (near). */
export function layer(ctx, cam, depth, fn) {
  ctx.save();
  const z = 1 + (cam.z - 1) * depth;
  ctx.translate(CX, GY); ctx.rotate((cam.r || 0) * depth); ctx.scale(z, z);
  ctx.translate(-CX + (cam.x || 0) * depth, -GY + (cam.y || 0) * depth);
  fn(ctx); ctx.restore();
}
/** Same as layer, drawn soft (shallow depth of field). */
export function blurLayer(ctx, cam, depth, px, fn) {
  ctx.save(); ctx.filter = `blur(${px}px)`; layer(ctx, cam, depth, fn); ctx.restore();
}
export const shake = (t, amp, f = 22, seed = 1) => [noise(t * f, seed) * amp, noise(t * f, seed + 7) * amp];

export function glow(ctx, x, y, r, color, a = 1) {
  ctx.save(); ctx.globalCompositeOperation = "lighter";
  const g = ctx.createRadialGradient(x, y, 0, x, y, r);
  g.addColorStop(0, rgba(color, 0.55 * a)); g.addColorStop(0.35, rgba(color, 0.18 * a)); g.addColorStop(1, rgba(color, 0));
  ctx.fillStyle = g; ctx.fillRect(x - r, y - r, r * 2, r * 2); ctx.restore();
}
