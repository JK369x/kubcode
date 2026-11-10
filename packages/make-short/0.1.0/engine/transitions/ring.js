// transitions/ring.js: THE signature seam of "One Door, Ten Worlds" (owner B1; used at b = 50, 110, 170, 230, 290, 470).
// A is drawn first. B is drawn inside a circle centred at scene.impact with an eased radius; at p = 1 the circle covers the far corner of the frame.
// The edge is a 6-10 px band in B's own look: B's style exports ringEdge(ctx, r, cx, cy, s) (named export, kit.ringEdge or default.ringEdge);
// without one the band is a line in B's accent colour (kit.accent / accent), else white. No flash, no fade: both styles draw the same pose,
// so the hero lines up across the edge. Nothing here is story-specific except where the impact point comes from (core/scene.js).
import { TAU, clamp, lerp, ease } from '../core/util.js';

const EDGE = {}, ACC = {};
let sceneFn = null, ready = false;

export default {
  id: 'ring',
  async init() {
    if (ready) return; ready = true;
    const m = await import('../core/scene.js').catch(() => null); sceneFn = m && m.scene;
    const tl = await (await fetch(new URL('../timeline.json', import.meta.url))).json();
    for (const st of tl.styles) {                                           // the style modules are already loaded by compose: these imports are cache hits
      try {
        const mod = await import(new URL('../' + st.file, import.meta.url).href), d = mod.default || {}, k = mod.kit || d.kit || {};
        const fn = mod.ringEdge || k.ringEdge || d.ringEdge; if (fn) EDGE[st.id] = fn;
        ACC[st.id] = k.accent || d.accent || mod.accent;
      } catch (e) { /* style not built yet: default band */ }
    }
  },
  render(g, A, B, p, s) {
    const W = A.width, H = A.height, sc = s.sc || (sceneFn ? sceneFn(s.f, s.tl) : null), im = (sc && sc.impact) || { x: 1040, y: 900 }, cx = im.x, cy = im.y;
    const far = Math.max(Math.hypot(cx, cy), Math.hypot(W - cx, cy), Math.hypot(cx, H - cy), Math.hypot(W - cx, H - cy)) + 24;
    const r = far * lerp(p, ease.io(p), .35);                                // eased: starts as a shock, settles over the far corner
    g.drawImage(A, 0, 0);
    if (r < 1) return;
    g.save(); g.beginPath(); g.arc(cx, cy, r, 0, TAU); g.clip(); g.drawImage(B, 0, 0); g.restore();
    const fn = EDGE[s.B];
    g.save();
    if (fn) fn(g, r, cx, cy, s);
    else { g.strokeStyle = ACC[s.B] || '#ffffff'; g.lineWidth = 8; g.beginPath(); g.arc(cx, cy, r, 0, TAU); g.stroke(); }
    g.restore();
  },
};
