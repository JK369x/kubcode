// transitions/t9-shatter.js: glass -> teardown seam (b = 530, frames 522..537). The cracked window (A, frozen by the glass style at 522) breaks along the
// same fracture cells the glass style draws as cracks (same impact point); every cell becomes a 3D shard textured with A that flies outward and TOWARD
// the camera over B (the studio, same door rect, same hero pose). Shard 0 starts exactly where A is; no flash, no fade-in; at p=1 the frame is exactly B.
import { fracture, lastImpact } from '../styles/09-glass.js';

const W = 1920, D = 3000, clamp = (x, a = 0, b = 1) => Math.min(b, Math.max(a, x));
const sm = x => { x = clamp(x); return x * x * (3 - 2 * x); };
const hash = (a, b = 0) => { const n = Math.sin(a * 127.1 + b * 311.7 + 3.3) * 43758.5453; return n - Math.floor(n); };
let THREE, R, scene, cam, tex, shards = [], LIGHT, built = '';

function build(cx, cy) {
  for (const h of shards) { scene.remove(h.mesh); h.mesh.geometry.dispose(); h.m.dispose(); h.em.dispose(); } shards = [];
  const FR = fracture(cx, cy), ix = cx - 960, iy = 960 - cy;
  FR.cells.forEach((c, i) => {
    const xs = c.pts.map(q => q[0] - 960), ys = c.pts.map(q => 960 - q[1]), sx = xs.reduce((a, b) => a + b, 0) / xs.length, sy = ys.reduce((a, b) => a + b, 0) / ys.length;
    const pos = [], uv = [], idx = [];
    c.pts.forEach((q, k) => { pos.push(xs[k] - sx, ys[k] - sy, 0); uv.push(q[0] / W, 1 - q[1] / W); });
    pos.push(0, 0, 0); uv.push((sx + 960) / W, 1 - (960 - sy) / W);
    for (let k = 0; k < c.pts.length; k++) idx.push(c.pts.length, k, (k + 1) % c.pts.length);
    const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2)); g.setIndex(idx);
    const m = new THREE.MeshBasicMaterial({ side: THREE.DoubleSide, transparent: true }), mesh = new THREE.Mesh(g, m);
    const eg = new THREE.BufferGeometry(); eg.setAttribute('position', new THREE.Float32BufferAttribute(c.pts.flatMap((q, k) => [xs[k] - sx, ys[k] - sy, 1]), 3));
    const em = new THREE.LineBasicMaterial({ color: 0xffffff, transparent: true }); mesh.add(new THREE.LineLoop(eg, em));
    let dx = sx - ix, dy = sy - iy; const L = Math.hypot(dx, dy) || 1; dx /= L; dy /= L; const a = hash(i, 4) * Math.PI * 2, rr = hash(i, 5) * Math.PI * 2;
    shards.push({ mesh, m, em, cx: sx, cy: sy, dx: c.ring ? dx : Math.cos(a), dy: c.ring ? dy : Math.sin(a), lat: 140 + 700 * hash(i, 1) + (c.ring ? 0 : 200), zmax: D * (.62 + .58 * hash(i, 2)), spin: (hash(i, 3) < .5 ? -1 : 1) * (.9 + 2.6 * hash(i, 6)), axis: new THREE.Vector3(Math.cos(rr), Math.sin(rr), .35 * (hash(i, 7) - .5)).normalize(), delay: c.ring * .045 + .09 * hash(i, 8), dur: .5 + .25 * hash(i, 10), base: .84 + .16 * hash(i, 9) });
    scene.add(mesh);
  });
  built = Math.round(cx) + ':' + Math.round(cy);
}

export default {
  id: 't9',
  async init(api) {
    THREE = api.THREE;
    R = new THREE.WebGLRenderer({ antialias: true, alpha: true, premultipliedAlpha: true, preserveDrawingBuffer: true });
    R.setPixelRatio(1); R.setSize(W, W, false); R.setClearColor(0x000000, 0);
    scene = new THREE.Scene(); cam = new THREE.PerspectiveCamera(2 * Math.atan(960 / D) * 180 / Math.PI, 1, 50, D * 2); cam.position.set(0, 0, D); LIGHT = new THREE.Vector3(-.4, .6, .7).normalize();
  },
  render(ctx, A, B, p, s) {
    const f0 = s.b - 8, f = s.f;
    ctx.save(); ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.globalAlpha = 1; ctx.globalCompositeOperation = 'source-over';
    if (f <= f0) { ctx.drawImage(A, 0, 0); ctx.restore(); return; }
    const imp = lastImpact(), key = Math.round(imp.x) + ':' + Math.round(imp.y); if (key !== built) build(imp.x, imp.y);
    ctx.drawImage(B, 0, 0);
    if (!tex) { tex = new THREE.CanvasTexture(A); tex.colorSpace = THREE.SRGBColorSpace; tex.anisotropy = 4; }
    shards.forEach(h => { h.m.map = tex; h.m.needsUpdate = true; }); tex.needsUpdate = true;
    const u = clamp((f - f0) / (s.dur - 1 || 15));                // seam progress; every shard has its own start (a wave out of the impact) and flight time
    for (const h of shards) {
      const t0 = h.delay, dur = Math.min(h.dur, 1 - t0), t = clamp((u - t0) / dur), e = Math.pow(t, 1.7), zf = h.zmax * e, o = 1 - sm((t - .55) / .45);
      h.mesh.visible = o > .01; if (!h.mesh.visible) continue;
      h.mesh.position.set(h.cx + h.dx * h.lat * e, h.cy + h.dy * h.lat * e, zf); h.mesh.quaternion.setFromAxisAngle(h.axis, h.spin * e * 1.6);
      const n = new THREE.Vector3(0, 0, 1).applyQuaternion(h.mesh.quaternion), b = t < .002 ? 1 : h.base * (.7 + .45 * Math.abs(n.dot(LIGHT)));
      h.m.color.setScalar(t < .002 ? 1 : 1 - (1 - b) * sm(t * 4)); h.m.opacity = o; h.em.opacity = .85 * o * sm(t * 5);
    }
    R.render(scene, cam); ctx.drawImage(R.domElement, 0, 0); ctx.restore();
  },
};
