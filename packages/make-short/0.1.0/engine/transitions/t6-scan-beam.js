// transitions/t6-scan-beam.js: woodcut -> lidar. One thin laser line sweeps DOWN the frame: above it (passed) = B (the LiDAR frame), below it = A (the woodcut).
// At the beam A's dark ink pixels (sampled from A on a 6 px grid) heat up, then break into glowing points that drift up and away and fade, so the print dissolves INTO the cloud.
const W = 1920, CELL = 6, N = W / CELL;
const clamp = (x, a = 0, b = 1) => Math.min(b, Math.max(a, x));
const lerp = (a, b, t) => a + (b - a) * t;
const sstep = t => { t = clamp(t); return t * t * (3 - 2 * t); };
const hash = (a, b = 0, c = 0) => { const n = Math.sin(a * 127.1 + b * 311.7 + c * 74.7) * 43758.5453; return n - Math.floor(n); };
const PAL = [[212, 255, 240], [46, 230, 200], [127, 240, 168], [246, 230, 90], [20, 184, 166]];     // near-white front, teal, mint, yellow (the LiDAR height ramp)
let lo, lg, sprite;

export default {
  id: 't6',
  render(ctx, A, B, p, s) {
    if (!lo) {
      lo = document.createElement('canvas'); lo.width = lo.height = N; lg = lo.getContext('2d', { willReadFrequently: true });
      sprite = document.createElement('canvas'); sprite.width = sprite.height = 32; const g = sprite.getContext('2d'), r = g.createRadialGradient(16, 16, 0, 16, 16, 16);
      r.addColorStop(0, 'rgba(255,255,255,1)'); r.addColorStop(.35, 'rgba(255,255,255,.7)'); r.addColorStop(1, 'rgba(255,255,255,0)'); g.fillStyle = r; g.fillRect(0, 0, 32, 32);
    }
    const e = .75 * p + .25 * sstep(p), y = lerp(-40, W + 120, e);                // beam y (master px); the band of points it leaves behind trails 260 px above it
    ctx.drawImage(A, 0, 0);
    if (y > 0) { ctx.save(); ctx.beginPath(); ctx.rect(0, 0, W, Math.min(W, y)); ctx.clip(); ctx.drawImage(B, 0, 0); ctx.restore(); }
    // ---- ink -> points
    const fade = 1 - sstep((p - .82) / .18), onset = sstep(p / .08);
    lg.clearRect(0, 0, N, N); lg.drawImage(A, 0, 0, N, N);
    const d = lg.getImageData(0, 0, N, N).data, y0 = Math.max(0, Math.floor((y - 270) / CELL)), y1 = Math.min(N - 1, Math.ceil((y + 50) / CELL));
    ctx.save(); ctx.globalCompositeOperation = 'lighter';
    for (let cy = y0; cy <= y1; cy++) for (let cx = 0; cx < N; cx++) {
      const i = (cy * N + cx) * 4, lum = (d[i] * .3 + d[i + 1] * .59 + d[i + 2] * .11);
      if (lum > 42 || hash(cx, cy, 4) > .72) continue;                              // only the black key-line ink (not the indigo fills), thinned out
      const dk = .45 + .55 * (1 - lum / 42), h1 = hash(cx, cy, 1), h2 = hash(cx, cy, 2), h3 = hash(cx, cy, 3), py = cy * CELL + CELL / 2, dy = y - py;     // dy > 0: the beam has passed
      let a, px = cx * CELL + CELL / 2, qy = py, sz;
      if (dy < 0) { a = clamp(1 + dy / 50) * .5; sz = 4.5; }                          // heating just ahead of the beam
      else { const k = clamp(dy / 260); a = Math.pow(1 - k, 1.3); px += (h1 - .5) * 90 * k + Math.sin(k * 6 + h3 * 6) * 14 * k; qy -= (30 + 120 * h2) * k; sz = 4.6 * (1 - .6 * k); }
      a *= dk * onset * fade; if (a < .03) continue;
      const near = dy < 40 ? 1 : 0, c = near ? PAL[0] : PAL[1 + Math.floor(h3 * 4)], bx = sz * (2.6 + 1.6 * h1);
      ctx.globalAlpha = Math.min(1, a * 1.2); ctx.fillStyle = `rgb(${c[0]},${c[1]},${c[2]})`; ctx.fillRect(px - sz / 2, qy - sz / 2, sz, sz);
      ctx.globalAlpha = a * .28; ctx.drawImage(sprite, px - bx / 2, qy - bx / 2, bx, bx);
    }
    ctx.restore();
    // ---- the beam: one cool near-white line + soft glow + survey ticks (light, not colour)
    const ba = sstep(p / .06) * (1 - sstep((e - .8) / .2));
    if (ba > .01 && y > -80 && y < W + 80) {
      const gr = ctx.createLinearGradient(0, y - 90, 0, y + 90); gr.addColorStop(0, 'rgba(100,255,225,0)'); gr.addColorStop(.46, 'rgba(120,255,230,.14)'); gr.addColorStop(.5, 'rgba(240,255,250,.9)'); gr.addColorStop(.54, 'rgba(120,255,230,.14)'); gr.addColorStop(1, 'rgba(100,255,225,0)');
      ctx.save(); ctx.globalCompositeOperation = 'lighter'; ctx.globalAlpha = ba; ctx.fillStyle = gr; ctx.fillRect(0, y - 90, W, 180); ctx.fillStyle = '#e6fff8'; ctx.fillRect(0, y - 1.5, W, 3);
      ctx.globalAlpha = ba * .8; ctx.fillStyle = '#bffff0'; for (let x = 24; x < W; x += 48) ctx.fillRect(x, y - 12, 2, 10); ctx.restore();
    }
  },
};
