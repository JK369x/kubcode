// styles/b2-face.js (B2): the kid's face as a square canvas for pose p. Uses core/hero2d.js `faceCanvas(p, size)` when it exists (DROP 2), otherwise a fallback drawn from
// the same pose fields (eyes, lid, squint, pupil, look, brows, browTilt, mouth, mouthOpen). Used as the cube head's front texture (voxel) and as the colour source for the
// head points (lidar). Front view, symmetric: the 3D head yaw does the turning.
import * as H from '../core/hero2d.js';

const PAL = H.PALETTE, TAU = Math.PI * 2, clamp = (x, a = 0, b = 1) => Math.min(b, Math.max(a, x));
export function faceInto(cv, p) {
  const S = cv.width, g = cv.getContext('2d');
  g.setTransform(1, 0, 0, 1, 0, 0); g.globalAlpha = 1; g.clearRect(0, 0, S, S);
  if (typeof H.faceCanvas === 'function') {                                                    // DROP 2: equirect size x size/2, flat 2D face (head circle = 2*HR*k px) centred; crop that square
    const N = 1024, c = H.faceCanvas(p, N), k = N / 1024 * 1.29, w = 2 * 126 * k; g.drawImage(c, N / 2 - w / 2, N / 4 - w / 2, w, w, 0, 0, S, S); return cv;
  }
  g.fillStyle = PAL.skin; g.fillRect(0, 0, S, S);
  g.fillStyle = PAL.blush; g.globalAlpha = .45; for (const x of [.17, .83]) { g.beginPath(); g.ellipse(S * x, S * .7, S * .08, S * .05, 0, 0, TAU); g.fill(); } g.globalAlpha = 1;
  g.fillStyle = PAL.hair; for (let i = 0; i < 8; i++) g.fillRect(i * S / 8, 0, S / 8 + 1, S * (.13 + .045 * ((i * 37) % 3)));                                // stepped bangs
  const lid = p.eyes === 'closed' ? 1 : clamp(p.lid || 0), wide = p.eyes === 'wide' ? 1.1 : 1, sq = 1 - .35 * clamp(p.squint || 0), [lx, ly] = p.look || [0, 0], pu = p.pupil || 1;
  for (const [i, ex] of [[0, .3], [1, .7]]) {
    const cx = S * ex, cy = S * .5, rx = S * .15 * wide, ry = Math.max(S * .012, S * .21 * wide * sq * (1 - lid));
    g.fillStyle = PAL.eyeW; g.beginPath(); g.ellipse(cx, cy, rx, ry, 0, 0, TAU); g.fill(); g.lineWidth = S * .016; g.strokeStyle = PAL.outline; g.stroke();
    if (lid < .85) { g.save(); g.beginPath(); g.ellipse(cx, cy, rx, ry, 0, 0, TAU); g.clip(); g.fillStyle = PAL.pupil; g.beginPath(); g.ellipse(cx + lx * rx * .5, cy + ly * ry * .35, S * .075 * pu, S * .115 * pu, 0, 0, TAU); g.fill();
      g.fillStyle = '#fff'; g.beginPath(); g.arc(cx + lx * rx * .5 - S * .02, cy + ly * ry * .35 - S * .04, S * .02, 0, TAU); g.fill(); g.restore(); }
    const s = i ? 1 : -1, tilt = p.browTilt || 0, by = cy - S * .27 - (p.brows ?? .5) * S * .07, w = rx * 1.05;
    g.strokeStyle = PAL.brow; g.lineWidth = S * .045; g.lineCap = 'round'; g.beginPath(); g.moveTo(cx - s * w, by - tilt * S * .04); g.lineTo(cx + s * w, by + tilt * S * .04); g.stroke();   // inner end (toward the nose) is lower when angry (tilt < 0)
  }
  const mx = S * .5, my = S * .8, mo = clamp(p.mouthOpen ?? .15), m = p.mouth || 'flat';
  g.fillStyle = PAL.mouth; g.strokeStyle = PAL.mouth; g.lineWidth = S * .035; g.lineCap = 'round';
  if (m === 'o' || m === 'scream') { g.beginPath(); g.ellipse(mx, my, S * (m === 'o' ? .06 : .1), S * (m === 'o' ? .08 : .13), 0, 0, TAU); g.fill(); }
  else if (m === 'smile' || m === 'grin') { g.beginPath(); g.arc(mx, my - S * .06, S * .13, .15 * Math.PI, .85 * Math.PI); if (m === 'grin') { g.fillStyle = '#fff'; g.fill(); } g.stroke(); }
  else if (m === 'frown') { g.beginPath(); g.arc(mx, my + S * .12, S * .12, 1.15 * Math.PI, 1.85 * Math.PI); g.stroke(); }
  else if (m === 'grit') { g.fillStyle = '#fff'; g.fillRect(mx - S * .12, my - S * .03, S * .24, S * .07); g.strokeRect(mx - S * .12, my - S * .03, S * .24, S * .07); }
  else if (m === 'smirk') { g.beginPath(); g.moveTo(mx - S * .1, my + S * .01); g.quadraticCurveTo(mx + S * .04, my + S * .03, mx + S * .12, my - S * .03); g.stroke(); }
  else if (m === 'wobble') { g.beginPath(); for (let i = 0; i <= 8; i++) g.lineTo(mx - S * .12 + i * S * .03, my + Math.sin(i * 1.4) * S * .018); g.stroke(); }
  else { g.beginPath(); g.moveTo(mx - S * .08, my); g.lineTo(mx + S * .08, my + S * mo * .02); g.stroke(); }
  return cv;
}
