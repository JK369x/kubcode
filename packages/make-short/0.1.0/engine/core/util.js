// core/util.js: seeded rng, easings, noise, key tracks. Pure ES module, no DOM, no deps.
export const TAU = Math.PI * 2;
export const clamp = (x, a = 0, b = 1) => Math.min(b, Math.max(a, x));
export const lerp = (a, b, t) => a + (b - a) * t;
export const seg = (t, a, b) => clamp((t - a) / (b - a));            // progress of t inside [a,b], 0..1
export const twos = f => Math.floor(f / 2) * 2;                      // animation on twos
export const wrapPi = a => { a = (a + Math.PI) % TAU; if (a < 0) a += TAU; return a - Math.PI; };

// seeded rng: const r = rng(7); r() -> [0,1)
export function mulberry32(seed) {
  let a = seed >>> 0;
  return () => { a = (a + 0x6D2B79F5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}
export const rng = mulberry32;
export const hash = n => { n = Math.sin(n * 127.1 + 311.7) * 43758.5453; return n - Math.floor(n); };   // stateless 0..1

// easings: all take t in 0..1 and return 0..1 (back may overshoot)
export const ease = {
  lin: t => t,
  i: t => t * t, i3: t => t * t * t,                                  // slow start
  o: t => 1 - (1 - t) * (1 - t), o3: t => 1 - Math.pow(1 - t, 3),   // slow end ("snap": fast start, long settle)
  io: t => t * t * (3 - 2 * t),                                       // smoothstep
  io3: t => t < .5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2,
  back: (t, c = 1.7) => 1 + (c + 1) * Math.pow(t - 1, 3) + c * Math.pow(t - 1, 2),  // overshoot ~10% at c=1.7, ~20% at c=3
  hold: t => (t >= 1 ? 1 : 0),                                        // step: change at the end of the segment
};
ease.snap = ease.o3;

// 1D value noise in -1..1 (smooth, deterministic)
export function noise(x, seed = 0) {
  const i = Math.floor(x), f = x - i, a = hash(i + seed * 91.7) * 2 - 1, b = hash(i + 1 + seed * 91.7) * 2 - 1;
  return lerp(a, b, f * f * (3 - 2 * f));
}
export function noise2(x, y, seed = 0) {
  const ix = Math.floor(x), iy = Math.floor(y), fx = x - ix, fy = y - iy;
  const h = (a, b) => hash(a * 57.3 + b * 131.9 + seed * 17.1) * 2 - 1;
  const sx = fx * fx * (3 - 2 * fx), sy = fy * fy * (3 - 2 * fy);
  return lerp(lerp(h(ix, iy), h(ix + 1, iy), sx), lerp(h(ix, iy + 1), h(ix + 1, iy + 1), sx), sy);
}

// key track: K([[t,v,ease?],...]) -> f(t). The ease on key i shapes the segment that ENDS at key i. Default 'io'.
export function K(keys) {
  const ks = keys.map(k => ({ t: k[0], v: k[1], e: typeof k[2] === 'function' ? k[2] : ease[k[2] || 'io'] }));
  return t => {
    if (t <= ks[0].t) return ks[0].v;
    for (let i = 1; i < ks.length; i++) if (t <= ks[i].t) { const a = ks[i - 1], b = ks[i]; return lerp(a.v, b.v, b.e((t - a.t) / (b.t - a.t))); }
    return ks[ks.length - 1].v;
  };
}
