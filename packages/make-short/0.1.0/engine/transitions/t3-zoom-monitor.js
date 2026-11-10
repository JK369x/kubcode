// transitions/t3-zoom-monitor.js: voxel -> ascii. The voxel camera swoops into the block terminal (03-voxel.js moves it); here the voxel scene is re-rendered with
// its glass showing the exact next frame (B), so the dive is real 3D, continuous and eased, and the glass fills the frame as B itself.
import { shared } from '../styles/b2-shared.js';
const sstep = t => { t = Math.min(1, Math.max(0, t)); return t * t * t * (t * (t * 6 - 15) + 10); };

export default {
  id: 't3',
  render(ctx, A, B, p, s) {
    let ok = false;
    if (shared.voxel) { try { ctx.drawImage(shared.voxel.renderGlass(B, s.f), 0, 0); ok = true; } catch (e) { console.error('[style-error] t3 glass: ' + (e && e.stack || e)); } }
    if (!ok) {                                                                    // fallback: plain eased 2D zoom of A towards the screen, then B
      const z = 1 + 5 * sstep(p) * sstep(p), cx = 1380, cy = 1090;
      ctx.save(); ctx.translate(cx, cy); ctx.scale(z, z); ctx.translate(-cx, -cy); ctx.drawImage(A, 0, 0); ctx.restore();
      ctx.globalAlpha = sstep((p - .5) / .5); ctx.drawImage(B, 0, 0); ctx.globalAlpha = 1;
    }
    if (p > .9) { ctx.globalAlpha = sstep((p - .9) / .1); ctx.drawImage(B, 0, 0); ctx.globalAlpha = 1; }   // the glass already equals B; this only removes sub-pixel filtering differences
  },
};
