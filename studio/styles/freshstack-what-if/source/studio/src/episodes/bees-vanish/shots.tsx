import React from 'react';
import {
  Hero, Pose, basePose, poseAt, faceAt, joints, toWorld, kf, clamp, easeOut, backOut, camT,
  rnd, settle, LOOKS, Look, DuskSky, NightSky, Stars, Moon, Sun, Glow, LightVeil, Dust, Bokeh,
  Foreground, Mug, Schematic, SCH, ShotProps,
} from '../../engine';
import { FONT } from '../../engine/fonts';

// "ถ้าผึ้งหายไปจากโลกพรุ่งนี้" — seven shots, each a pure function of its own clock t and its length.
// The vertical film crops the 1920 x 1080 world around x = 960, so all action stays within x 660..1260.

export const THAI = 'Chakra Petch';
const PIP = LOOKS.pipHood;
const INK = '#121019';
const AMBER = '#F2C35B';
const CORAL = '#FF8271';
const CYAN = '#87DBD6';

const actor = (look: Look, pose: Pose, face: { expr: any; blink: number }, rim = 'rimR') => (
  <Hero look={look} pose={{ ...pose, ...face }} rimId={rim} shadow={1} />
);

/** A small garden bee: body, two stripes, flapping wings, a bob that never stops. */
const Bee: React.FC<{ x: number; y: number; t: number; s?: number }> = ({ x, y, t, s = 1 }) => {
  const bob = Math.sin(t / 5) * 4 * s;
  const flap = Math.sin(t / 1.6) * 0.7;
  return (
    <g transform={`translate(${x} ${y + bob}) scale(${s})`}>
      <g transform={`translate(-8 -8) rotate(${flap * 26})`}>
        <ellipse cx={3} cy={-4} rx={9} ry={5} fill="#D9E4F7" opacity={0.85} stroke={INK} strokeWidth={2} />
      </g>
      <g transform={`translate(10 -8) rotate(${-flap * 26})`}>
        <ellipse cx={-3} cy={-4} rx={9} ry={5} fill="#D9E4F7" opacity={0.85} stroke={INK} strokeWidth={2} />
      </g>
      <ellipse cx={2} cy={0} rx={13} ry={8.5} fill={AMBER} stroke={INK} strokeWidth={3} />
      <path d="M -3 -8 L -3 8 M 6 -8 L 6 8" stroke={INK} strokeWidth={3.5} />
      <circle cx={-10} cy={-2} r={6.5} fill="#1D2033" />
      <ellipse cx={16} cy={1} rx={4} ry={4.5} fill={INK} />
    </g>
  );
};

/** The dotted outline a vanished bee leaves behind, drifting upward slightly. */
const BeeGhost: React.FC<{ x: number; y: number; t: number; s?: number }> = ({ x, y, t, s = 1 }) => {
  if (t < 0) return null;
  const k = clamp(t / 30);
  return (
    <g transform={`translate(${x} ${y - k * 10 * s}) scale(${s})`} opacity={clamp(1 - t / 90, 0.55, 1)}>
      <ellipse cx={2} cy={0} rx={13} ry={8.5} fill="none" stroke="#EFE6D0" strokeWidth={3} strokeDasharray="6 7" />
      <ellipse cx={-6} cy={-11} rx={9} ry={5} fill="none" stroke="#EFE6D0" strokeWidth={2.5} strokeDasharray="5 6" transform="rotate(-18 -6 -11)" />
      <ellipse cx={4} cy={-21} rx={8} ry={4.5} fill="none" stroke="#EFE6D0" strokeWidth={2.5} strokeDasharray="5 6" transform="rotate(16 4 -21)" />
    </g>
  );
};

/** A small pop ring + sparks where something blinks out, from t = 0. */
const PopRing: React.FC<{ x: number; y: number; t: number; s?: number; color?: string }> = ({ x, y, t, s = 1, color = '#FFEFC2' }) => {
  if (t <= 0 || t > 14) return null;
  const k = easeOut(t / 14);
  return (
    <g transform={`translate(${x} ${y}) scale(${s})`} opacity={1 - k}>
      <circle r={10 + k * 34} fill="none" stroke={color} strokeWidth={5} />
      <circle r={6 + k * 16} fill="none" stroke={color} strokeWidth={3} opacity={0.6} />
      {[45, 135, 225, 315].map((a) => (
        <path key={a} transform={`rotate(${a}) translate(${22 + k * 26} 0) rotate(${t * 8})`} d="M 0 -7 L 5 0 L 0 7 L -5 0 Z" fill={color} />
      ))}
    </g>
  );
};

/** A garden flower: stem, two leaves, six petals and a centre disc. `droop` bends the head down. */
const Flower: React.FC<{ x: number; y: number; s?: number; petal?: string; drop?: number; dropT?: number }> = ({ x, y, s = 1, petal = '#E9A0B4', drop = 0, dropT = 0 }) => {
  const head = y - 150;
  return (
    <g transform={`translate(${x} ${y}) scale(${s})`}>
      <path d={`M 0 0 Q ${4 + drop * 1.6} -70 ${drop * 2.4} -150`} stroke="#3E5A34" strokeWidth={9} fill="none" strokeLinecap="round" />
      <path d={`M 1 -62 Q ${-46 + drop * 1.4} -84 ${-58 + drop} -58 Q ${-16 - drop} -66 1 -62 Z`} fill="#48673B" stroke="#31482A" strokeWidth={3} />
      <path d={`M 1 -104 Q ${48} -126 ${60 - drop} -100 Q ${18 - drop} -108 1 -104 Z`} fill="#48673B" stroke="#31482A" strokeWidth={3} />
      <ellipse cx={0} cy={0} rx={34} ry={9} fill="#000" opacity={0.2} />
      <g transform={`translate(${drop * 2.4} -150) rotate(${drop * 1.4})`}>
        {[0, 60, 120, 180, 240, 300].map((a) => (
          <ellipse key={a} transform={`rotate(${a}) translate(0 -30)`} cx={0} cy={0} rx={15} ry={22} fill={petal} stroke="#8A5468" strokeWidth={2.5} />
        ))}
        <circle r={15} fill={AMBER} stroke="#8A6A34" strokeWidth={3} />
      </g>
    </g>
  );
};

/** The market auntie's wide straw hat, drawn over her head after the rig. */
const StrawHat: React.FC<{ x: number; y: number; s?: number; tilt?: number }> = ({ x, y, s = 1, tilt = 0 }) => (
  <g transform={`translate(${x} ${y}) rotate(${tilt}) scale(${s})`}>
    <ellipse cx={0} cy={-64} rx={96} ry={24} fill="#D8B268" stroke={INK} strokeWidth={4} />
    <path d="M -46 -66 A 46 36 0 0 1 46 -66 L 42 -48 A 42 24 0 0 0 -42 -48 Z" fill="#C69E52" stroke={INK} strokeWidth={4} strokeLinejoin="round" />
    <path d="M -46 -64 L 46 -64" stroke="#8A6A34" strokeWidth={6} />
  </g>
);

/** A grass ground band with deterministic tufts and a contact-darkening near the horizon. */
const Lawn: React.FC<{ y: number; h: number; seed: number; x0?: number; x1?: number; band?: string; grass?: string }> = ({ y, h, seed, x0 = -200, x1 = 2120, band = '#2A2039', grass = '#31482C' }) => (
  <g>
    <rect x={x0} y={y} width={x1 - x0} height={h} fill={grass} />
    <rect x={x0} y={y} width={x1 - x0} height={26} fill="#000" opacity={0.18} />
    {Array.from({ length: 60 }).map((_, i) => {
      const gx = x0 + i * ((x1 - x0) / 60) + rnd(seed, i) * 18;
      const gh = 12 + rnd(seed + 1, i) * 26;
      return <path key={i} d={`M ${gx} ${y} q 6 ${-gh} ${rnd(seed + 2, i) * 14 - 7} ${-gh}`} stroke={grass} strokeWidth={3} fill="none" opacity={1} />;
    })}
    <rect x={x0} y={y} width={x1 - x0} height={h} fill={band} opacity={0.14} />
  </g>
);

/** A pale blossom cluster: five puffs on a short twig, for the lychee canopy. */
const Blossom: React.FC<{ x: number; y: number; s?: number }> = ({ x, y, s = 1 }) => (
  <g transform={`translate(${x} ${y}) scale(${s})`}>
    {[[0, -14], [-16, -4], [16, -2], [-8, 8], [10, 10]].map(([dx, dy], i) => (
      <circle key={i} cx={dx} cy={dy} r={9 - (i % 2) * 2} fill={i % 2 ? '#EFE0BC' : '#F6EBD2'} stroke="#B49B68" strokeWidth={2} />
    ))}
    <path d="M 0 16 L 0 34" stroke="#5A4430" strokeWidth={5} strokeLinecap="round" />
  </g>
);

/** A ripe lychee: a rough red ball with a leaf. */
const Litchi: React.FC<{ x: number; y: number; s?: number }> = ({ x, y, s = 1 }) => (
  <g transform={`translate(${x} ${y}) scale(${s})`}>
    <circle r={13} fill="#D8524A" stroke="#7E2A26" strokeWidth={2.5} />
    {rnd(2, x) > 5 ? null : <circle cx={-4} cy={-4} r={5} fill="#E06A5A" opacity={0.8} />}
    <path d="M 2 -12 Q 10 -26 24 -24" stroke="#48673B" strokeWidth={5} fill="none" strokeLinecap="round" />
  </g>
);

/** A durian flower: a big pale star that can close its petals (the cliffhanger). */
const DurianFlower: React.FC<{ x: number; y: number; s?: number; shut?: number }> = ({ x, y, s = 1, shut = 0 }) => (
  <g transform={`translate(${x} ${y}) scale(${s})`}>
    {[0, 72, 144, 216, 288].map((a) => (
      <ellipse key={a} transform={`rotate(${a}) translate(0 ${-16 - shut * 6}) scale(${1 - shut * 0.5})`} cx={0} cy={0} rx={7.5} ry={15} fill="#F6E8C0" stroke="#C9B62A" strokeWidth={2} />
    ))}
    <circle r={8 - shut * 3} fill="#EFE2A8" stroke="#C9B62A" strokeWidth={2} />
  </g>
);

/** A hanging durian: a spiky oval. */
const Durian: React.FC<{ x: number; y: number; s?: number }> = ({ x, y, s = 1 }) => (
  <g transform={`translate(${x} ${y}) scale(${s})`}>
    <ellipse rx={20} ry={26} fill="#7E8F4E" stroke="#3F4A26" strokeWidth={3} />
    {Array.from({ length: 10 }).map((_, i) => {
      const a = (i / 10) * Math.PI * 2;
      return <path key={i} d={`M ${Math.cos(a) * 17} ${Math.sin(a) * 22} L ${Math.cos(a) * 24} ${Math.sin(a) * 30} M ${Math.cos(a) * 17} ${Math.sin(a) * 22} L ${Math.cos(a) * 29} ${Math.sin(a) * 28}`} stroke="#5A6A34" strokeWidth={2.5} strokeLinecap="round" />;
    })}
    <path d="M 0 -26 L 0 -38" stroke="#4A3826" strokeWidth={5} strokeLinecap="round" />
  </g>
);

/** A cave nectar bat silhouette, wings flapping; drawn dark against the sky. */
const Bat: React.FC<{ x: number; y: number; t: number; s?: number; flip?: boolean }> = ({ x, y, t, s = 1, flip = false }) => {
  const flap = Math.sin(t / 2.6);
  return (
    <g transform={`translate(${x} ${y}) scale(${flip ? -s : s} ${s})`}>
      <path d={`M 0 0 L 6 -8 L 16 -4 M -6 -8 L -16 -9 M 0 0`} stroke={INK} strokeWidth={5} fill="none" strokeLinecap="round" />
      <g transform={`rotate(${flap * 18})`}>
        <path d="M 2 -2 Q 26 -18 52 -6 Q 30 -2 18 6 Q 10 -2 2 2 Z" fill="#241A2E" stroke={INK} strokeWidth={2} />
      </g>
      <g transform={`rotate(${-flap * 18})`}>
        <path d="M -2 -2 Q -26 -18 -52 -6 Q -30 -2 -18 6 Q -10 -2 -2 2 Z" fill="#241A2E" stroke={INK} strokeWidth={2} />
      </g>
      <ellipse cx={0} cy={0} rx={9} ry={12} fill="#241A2E" />
      <path d="M -4 -10 L -6 -18 M 4 -10 L 6 -18" stroke={INK} strokeWidth={4} strokeLinecap="round" />
    </g>
  );
};

/** The dotted outline a vanished bat leaves behind. */
const BatGhost: React.FC<{ x: number; y: number; t: number; s?: number }> = ({ x, y, t, s = 1 }) => {
  if (t < 0) return null;
  const k = clamp(t / 30);
  return (
    <g transform={`translate(${x} ${y - k * 12 * s}) scale(${s})`} opacity={clamp(1 - t / 100, 0.55, 1)}>
      <path d="M 2 -2 Q 26 -18 52 -6 Q 30 -2 18 6 Q 10 -2 2 2 Z M -2 -2 Q -26 -18 -52 -6 Q -30 -2 -18 6 Q -10 -2 -2 2 Z" fill="none" stroke="#EFE6D0" strokeWidth={3.5} strokeDasharray="7 9" />
      <ellipse rx={9} ry={12} fill="none" stroke="#EFE6D0" strokeWidth={3} strokeDasharray="6 8" />
      <path d="M -4 -10 L -6 -18 M 4 -10 L 6 -18" stroke="#EFE6D0" strokeWidth={3.5} strokeLinecap="round" strokeDasharray="5 6" />
    </g>
  );
};

// ---------- S1 hook: the garden at first light; the macro bee blinks out, then every bee, at once ----------
export const S1: React.FC<ShotProps> = ({ t, len }) => {
  const z = kf(t, [[0, 2.7], [10, 3.1], [15, 3.04], [46, 1.0], [len, 1.13]]);
  const cx = kf(t, [[0, 1066], [15, 1066], [46, 960], [len, 960]]); // host: macro framed right of Pip so the caption never sits on his face
  const cy = kf(t, [[0, 540], [15, 540], [46, 615], [len, 592]]);
  // the macro flower droops after its bee vanishes
  const droop = settle(t - 12, 14, 1.1, 10);
  const bedT = t + 60;
  // Pip holds his mug, watches the bees vanish, lowers it, worried
  const mugHand = (() => {
    // hips raised so the whole face clears the caption band (world y ~745+): head at ~y 590
    const p = poseAt(t, [
      { f: 0, p: { ...basePose, x: 922, y: 754, scale: 0.95, yaw: 0.15, armL: { a: 128, b: 26 } } },
      { f: 30, p: { headTilt: -3, sway: 3 } },
      { f: 40, p: { armL: { a: 138, b: 30 } } },
      { f: 48, p: { armL: { a: 26, b: 22 } } },
      { f: 56, p: { armL: { a: 20, b: 16 } } },
      { f: len, p: { headTilt: -1, sway: 1 } },
    ]);
    const target = toWorld(p, joints(p).armL.end);
    return { pose: p, mug: target };
  })();
  // a few bees visit the bed before they all blink out at t = 20
  const bees: [number, number, number][] = [
    [782, 566, 1], [872, 610, 0.9], [1036, 576, 1.05], [1146, 626, 0.92], [826, 668, 0.85],
  ];
  return (
    <g transform={camT(cx, cy, z)}>
      <DuskSky id="bs1sky" horizonY={505} x0={200} y0={-300} w={1520} h={1100} />
      <Sun x={1130} y={352} r={64} t={bedT} rays={true} />
      {/* a soft morning skyline beyond the fence */}
      <rect x={200} y={470} width={1520} height={46} fill="#4A2E55" opacity={0.85} />
      <rect x={340} y={444} width={26} height={44} fill="#3A2247" />
      <rect x={402} y={426} width={40} height={62} fill="#3A2247" />
      <rect x={1516} y={430} width={34} height={58} fill="#3A2247" />
      {/* the fence */}
      <g transform="translate(0 0)">
        <rect x={452} y={548} width={1000} height={10} fill="#3A2E52" />
        <rect x={456} y={578} width={1000} height={9} fill="#3A2E52" opacity={0.8} />
        {Array.from({ length: 13 }).map((_, i) => {
          const px = 470 + i * 78;
          return <path key={i} d={`M ${px + 6} ${640} L ${px + 6} 540 L ${px + 20} 528 L ${px + 34} 540 L ${px + 34} 640 Z`} fill="#453562" stroke="#2C2140" strokeWidth={3} />;
        })}
      </g>
      <Lawn y={636} h={560} seed={11} />
      {/* a big tree behind the bed, framing left */}
      <path d="M 672 700 L 664 452 Q 660 420 640 400 M 668 560 Q 700 520 742 500" stroke="#33253E" strokeWidth={34} fill="none" strokeLinecap="round" />
      <ellipse cx={668} cy={384} rx={158} ry={88} fill="#3C4A31" opacity={0.9} />
      <ellipse cx={760} cy={420} rx={110} ry={62} fill="#465439" opacity={0.85} />
      {/* the flower bed */}
      <ellipse cx={970} cy={742} rx={420} ry={64} fill="#53422F" />
      <ellipse cx={970} cy={742} rx={420} ry={64} fill="none" stroke="#3A2E22" strokeWidth={5} opacity={0.6} />
      <Flower x={746} y={742} s={0.9} petal="#D97F9A" />
      <Flower x={856} y={748} s={1.05} petal="#E9A0B4" />
      <Flower x={984} y={738} s={1.5} petal="#E9A0B4" drop={droop} dropT={t} />
      <Flower x={1102} y={746} s={0.98} petal="#DE90AB" />
      <Flower x={1194} y={752} s={0.86} petal="#D97F9A" />
      {/* the watering can */}
      <g transform="translate(1252 828)">
        <ellipse cx={0} cy={40} rx={44} ry={9} fill="#000" opacity={0.28} />
        <rect x={-34} y={-18} width={68} height={56} rx={10} fill="#8A5A44" stroke={INK} strokeWidth={4} />
        <path d="M 34 2 Q 66 8 62 34" stroke={INK} strokeWidth={9} fill="none" />
        <path d="M -32 -6 Q -58 -26 -46 -50" stroke="#8A5A44" strokeWidth={9} fill="none" strokeLinecap="round" />
      </g>
      {/* Pip with his mug */}
      {actor(PIP, mugHand.pose, faceAt(t, [[0, 'neutral'], [38, 'worried']]))}
      <Mug x={mugHand.mug.x} y={mugHand.mug.y + 6} rot={t > 48 ? -12 : 8} steam={t < 44 ? 1 : 0} f={t} />
      {/* the bees: the macro bee is gone at t = 12; every bee pops together at t = 20 */}
      {bees.map(([bx, by, bs], i) => (
        <g key={i}>
          {t < 20 ? (
            <g>
              <Bee x={bx + Math.sin(t / 7 + i * 2) * 12} y={by + Math.cos(t / 9 + i * 3) * 9} t={i * 13 + t} s={bs} />
            </g>
          ) : (
            <BeeGhost x={bx} y={by} t={t - 20 - i} s={bs} />
          )}
          <PopRing x={bx} y={by} t={i === 2 ? t - 20 : -1} s={bs} />
        </g>
      ))}
      {t < 12 ? (
        <g>
          {/* the macro bee, big in the close-up, visiting the centre flower */}
          <Bee x={990 + (t - 11) * 6} y={532 - Math.max(0, 11 - t) * 3} t={t} s={2.2} />
          <PopRing x={996} y={532} t={t - 12} s={2.4} />
        </g>
      ) : (
        <g>
          <BeeGhost x={1002} y={538} t={t - 12} s={2.4} />
          <PopRing x={1002} y={538} t={t - 12} s={2.4} />
        </g>
      )}
      <Glow x={1105} y={430} r={330} o={0.34} />
      <Glow x={984} y={600} r={220} o={0.25} />
      <LightVeil id="bs1v" lights={[[1130, 380, 300], [984, 640, 240]]} o={0.3} />
      <Dust t={bedT} seed={9} x0={700} y0={430} w={520} h={330} />
      <Bokeh seed={4} n={7} x0={680} y0={470} w={520} h={260} t={bedT} o={0.16} />
      <Foreground blur={10}>
        <ellipse cx={646} cy={1010} rx={190} ry={70} fill="#24311F" />
        <ellipse cx={700} cy={1080} rx={150} ry={60} fill="#2C3A26" />
        <ellipse cx={1252} cy={1046} rx={120} ry={46} fill="#2C3A26" />
      </Foreground>
    </g>
  );
};

// ---------- S2 lychee orchard, next season: blossom everywhere, almost no fruit, ป้าสวน shrugs ----------
export const S2: React.FC<ShotProps> = ({ t, len }) => {
  const sky = 'bs2sky';
  // ป้าสวน looks up at the blossom, then at Pip, then shrugs
  const paPose = poseAt(t, [
    { f: 0, p: { ...basePose, x: 1012, y: 795, scale: 1.0, yaw: -0.5, facing: -1, look: -0.5, armL: { a: 14, b: -6 }, armR: { a: 12, b: -6 } } },
    { f: 8, p: { headTilt: 6, look: -0.9, armR: { a: -34, b: -18 } } },
    { f: 48, p: { headTilt: 3 } },
    { f: 62, p: { look: 0.2, armR: { a: 26, b: -12 } } },
    { f: 84, p: { armL: { a: 150, b: 36 }, armR: { a: 150, b: 36 }, headTilt: 3 } },
    { f: 104, p: { armL: { a: 20, b: -8 }, armR: { a: 24, b: -10 } } },
    { f: len, p: { headTilt: 1 } },
  ]);
  const pip = poseAt(t, [
    { f: 0, p: { ...basePose, x: 846, y: 806, scale: 0.98, yaw: 0.5, facing: 1, look: 0.6, armL: { a: 12, b: -6 }, armR: { a: 12, b: -6 } } },
    { f: 10, p: { headTilt: -5, look: 0.6 } },
    { f: 60, p: { headTilt: 0, look: 0.4 } },
    { f: 84, p: { look: -0.2, headTilt: 2 } },
    { f: len, p: { headTilt: 1 } },
  ]);
  const paFace = faceAt(t, [[0, 'happy'], [92, 'neutral']]);
  const pipFace = faceAt(t, [[0, 'neutral'], [88, 'worried']]);
  const hatP = { x: paPose.x, y: paPose.y - 176 * paPose.scale };
  // blossom falls the whole shot; red fruits appear late
  const petalY = (i: number) => 470 + ((t * (7 + rnd(21, i) * 5) + rnd(23, i) * 300) % 400);
  const fruitIn = (d: number) => backOut(clamp((t - 64 - d) / 8));
  return (
    <g transform={camT(960, kf(t, [[0, 612], [len, 586]]), kf(t, [[0, 1.04], [len, 1.18]]))}>
      <DuskSky id={sky} horizonY={512} x0={200} y0={-300} w={1520} h={1060} />
      <Sun x={1000} y={300} r={56} t={t + 40} />
      <Lawn y={640} h={520} seed={31} />
      {/* two lychee trunks and a canopy of arcs overhead */}
      <path d="M 690 1060 Q 700 820 682 640 Q 672 550 700 470" stroke="#4A3626" strokeWidth={46} fill="none" strokeLinecap="round" />
      <path d="M 1214 1060 Q 1206 840 1218 660 Q 1226 560 1198 480" stroke="#4A3626" strokeWidth={44} fill="none" strokeLinecap="round" />
      <path d="M 700 470 Q 850 386 960 400 Q 1100 380 1200 452" stroke="#4A3626" strokeWidth={26} fill="none" strokeLinecap="round" />
      <ellipse cx={860} cy={398} rx={200} ry={70} fill="#3C4A31" opacity={0.92} />
      <ellipse cx={1080} cy={412} rx={210} ry={72} fill="#465439" opacity={0.9} />
      {/* blossom hangs in clusters (and a few late red fruits show below them) */}
      <Blossom x={806} y={470} s={1.25} />
      <Blossom x={928} y={438} s={1.15} />
      <Blossom x={1046} y={470} s={1.3} />
      <Blossom x={1150} y={444} s={1.2} />
      <g opacity={fruitIn(0)}><Litchi x={828} y={512} s={fruitIn(0)} /></g>
      <g opacity={fruitIn(9)}><Litchi x={946} y={492} s={fruitIn(9)} /></g>
      <g opacity={fruitIn(16)}><Litchi x={1166} y={498} s={fruitIn(16)} /></g>
      {/* falling petals */}
      {Array.from({ length: 12 }).map((_, i) => {
        const px = 760 + rnd(25, i) * 460;
        const drift = Math.sin(t / 16 + i) * 18;
        const py = petalY(i);
        return py > 0 ? (
          <ellipse key={i} cx={px + drift} cy={py} rx={7} ry={4} fill="#F6EBD2" stroke="#D9C49A" strokeWidth={1.5} transform={`rotate(${Math.sin(t / 20 + i) * 30} ${px} ${py})`} opacity={clamp(1 - (py - 470) / 380, 0, 0.9)} />
        ) : null;
      })}
      {/* fallen blossom collecting on the ground */}
      {Array.from({ length: Math.min(9, Math.floor(t / 15)) }).map((_, i) => (
        <ellipse key={i} cx={770 + rnd(33, i) * 440} cy={856 + rnd(35, i) * 40} rx={9 + rnd(36, i) * 6} ry={4} fill="#EFE0BC" opacity={0.75} />
      ))}
      {actor(LOOKS.mom, paPose, paFace)}
      <StrawHat x={hatP.x} y={hatP.y} tilt={paPose.headTilt * 0.5} />
      {actor(PIP, pip, pipFace)}
      <Glow x={1000} y={340} r={340} o={0.3} />
      <Glow x={940} y={500} r={260} o={0.18} />
      <LightVeil id="bs2v" lights={[[1000, 360, 320], [930, 690, 260]]} o={0.32} />
      <Dust t={t + 30} seed={17} x0={740} y0={430} w={460} h={320} o={0.5} />
      <Foreground blur={16}>
        <g transform="translate(796 208)">
          <path d="M 0 40 Q 90 6 240 30" stroke="#3A2E1E" strokeWidth={22} fill="none" strokeLinecap="round" />
          <Blossom x={30} y={54} s={2.6} />
          <Blossom x={150} y={64} s={2.2} />
          <ellipse cx={90} cy={30} rx={54} ry={24} fill="#3C4A31" />
          <ellipse cx={210} cy={24} rx={58} ry={26} fill="#465439" />
        </g>
      </Foreground>
    </g>
  );
};

// ---------- S3 the rule card: one rule, only bees ----------
const MiniBee: React.FC<{ color: string }> = ({ color }) => (
  <g stroke={color} strokeWidth={4.5} fill="none" strokeLinecap="round">
    <ellipse rx={20} ry={13} />
    <path d="M -6 -13 L -6 13 M 6 -13 L 6 13" />
    <path d="M -4 -14 Q 2 -30 14 -24 Q 4 -20 -4 -14 Z M -22 -10 Q -30 -26 -42 -20" />
  </g>
);
const MiniBug: React.FC<{ color: string }> = ({ color }) => (
  <g stroke={color} strokeWidth={4.5} fill="none" strokeLinecap="round">
    <ellipse rx={17} ry={22} />
    <path d="M 0 -22 L 0 22 M -6 -24 L -14 -32 M 6 -24 L 14 -32" />
    <path d="M -17 -12 L -30 -16 M -17 0 L -32 0 M -17 12 L -30 16 M 17 -12 L 30 -16 M 17 0 L 32 0 M 17 12 L 30 16" strokeWidth={3.5} />
  </g>
);
const MiniBat: React.FC<{ color: string }> = ({ color }) => (
  <g stroke={color} strokeWidth={4.5} fill="none" strokeLinecap="round" strokeLinejoin="round">
    <path d="M 0 -6 Q 8 -18 0 -26 Q -8 -18 0 -6" />
    <ellipse rx={7} ry={12} />
    <path d="M -3 -4 Q -22 -20 -44 -10 Q -26 -6 -16 4 Q -10 -2 -3 2" />
    <path d="M 3 -4 Q 22 -20 44 -10 Q 26 -6 16 4 Q 10 -2 3 2" />
  </g>
);
const MiniBird: React.FC<{ color: string }> = ({ color }) => (
  <g stroke={color} strokeWidth={4.5} fill="none" strokeLinecap="round" strokeLinejoin="round" />
);
const RuleRow: React.FC<{ y: number; t: number; text: string; color: string; icon: React.ReactNode; markT: number; mark: 'x' | 'check'; punch?: number }> = ({ y, t, text, color, icon, markT, mark, punch = 0 }) => {
  if (t < 0) return null;
  const s = backOut(clamp(t / 7));
  const m = clamp((t - markT) / 5);
  return (
    <g transform={`translate(694 ${y}) scale(${s})`}>
      <rect x={0} y={-48} width={532} height={96} rx={22} fill="#0B1424" stroke={color} strokeWidth={3.5} opacity={0.96} style={punch > 0 ? { filter: `drop-shadow(0 0 ${10 * punch}px ${color})` } : undefined} />
      <g transform="translate(56 0) scale(1.05)" opacity={0.95}>{icon}</g>
      <text x={426} y={15} textAnchor="end" fontFamily={THAI} fontWeight={600} fontSize={40} fill={SCH.line}>{text}</text>
      {mark === 'x' ? (
        <path d={`M 452 -30 L 496 26 M 496 -30 L 452 26`} stroke={CORAL} strokeWidth={11} strokeLinecap="round" strokeDasharray={130} strokeDashoffset={130 * (1 - m)} />
      ) : (
        <path d={`M 448 0 L 470 26 L 512 -28`} stroke={CYAN} strokeWidth={11} strokeLinecap="round" strokeLinejoin="round" fill="none" strokeDasharray={150} strokeDashoffset={150 * (1 - m)} />
      )}
    </g>
  );
};
export const S3: React.FC<ShotProps> = ({ t, len }) => {
  // every row and its mark lands early enough to read by mid-line (frame ~318): rows at 6/16/30, checks by ~21/21/44
  const mark1 = 16, row2 = 16, row3 = 14, punch = clamp((t - 62) / 6);
  const trem = (a: number) => (t > 12 && t < mark1 + 14 ? Math.sin(t * 2.6) * a : 0);
  return (
    <g transform={camT(960, 510, kf(t, [[0, 1.0], [len, 1.08]]))}>
      <Schematic t={t} id="bs3" />
      <text x={960} y={242} textAnchor="middle" fontFamily={THAI} fontWeight={600} fontSize={54} fill={SCH.glow}>กฎมีข้อเดียว</text>
      <text x={960} y={288} textAnchor="middle" fontFamily={FONT.ui} fontSize={26} fill={SCH.dim} letterSpacing={4}>EPISODE RULE · NOT REAL</text>
      <g transform={`translate(${trem(4)} 0)`}>
        <RuleRow y={402} t={t - 6} text="ผึ้ง" color={CORAL} mark="x" markT={mark1} icon={<MiniBee color={CORAL} />} />
      </g>
      <RuleRow y={542} t={t - 16} text="แมลงอื่น" color={SCH.line} mark="check" markT={row2} icon={<MiniBug color={SCH.line} />} />
      <RuleRow y={682} t={t - 30} text="ค้างคาว · นก" color={CYAN} mark="check" markT={row3} punch={punch} icon={<MiniBat color={CYAN} />} />
      <Dust t={t} seed={5} x0={720} y0={220} w={480} h={220} n={22} o={0.28} />
    </g>
  );
};

// ---------- S4 the real fact: more than three in four leading crops rely on animal pollination, to some extent ----------
const CropIcon: React.FC<{ kind: number; lit: number }> = ({ kind, lit }) => {
  const c = lit > 0 ? SCH.line : SCH.dim;
  const w = { stroke: c, strokeWidth: 4, fill: 'none' as const, strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const };
  const shapes: React.ReactNode[] = [
    <path key="rice" {...w} d="M 0 26 L 0 -14 M 0 -14 Q -16 -26 -12 -34 M 0 -14 Q 14 -30 24 -24 M 0 -20 Q -6 -36 2 -44" />,
    <g key="corn" {...w}><path d="M -14 26 Q -18 -8 0 -30 Q 18 -8 14 26 Z M -8 -6 L 8 -6 M -10 8 L 10 8 M -12 20 L 12 20" /></g>,
    <g key="tom" {...w}><circle r={18} /><path d="M 0 -18 L -8 -28 M 0 -18 L 8 -28 M 0 -18 Q -2 -30 0 -34" /></g>,
    <g key="chili" {...w}><path d="M -8 -30 Q 14 -26 6 6 Q 0 26 -18 18 Q -6 8 -2 -6 Q -2 -18 -8 -30 Z" /></g>,
    <g key="mango" {...w}><path d="M 0 -26 Q 16 -18 14 4 Q 10 24 0 26 Q -14 20 -16 0 Q -18 -18 0 -26 Z" /></g>,
    <g key="gourd" {...w}><circle r={19} /><path d="M -19 0 L 19 0 M 0 -19 L 0 19" /></g>,
  ];
  return <g transform={`translate(0 2) scale(0.95) scale(${0.8 + 0.2 * Math.max(0.01, lit)})`}>{shapes[kind % 6]}</g>;
};
const PollTag: React.FC<{ t: number }> = ({ t }) => {
  if (t <= 0) return null;
  const s = backOut(clamp(t / 6));
  return (
    <g transform="translate(26 -26)" opacity={Math.min(1, t / 4)}>
      <circle r={17 * s} fill="#0B1424" stroke={SCH.live} strokeWidth={3} style={{ filter: `drop-shadow(0 0 ${8 * clamp(t / 10)}px ${SCH.glow})` }} />
      <g transform={`scale(${0.5 * s})`}>
        <g stroke={SCH.live} strokeWidth={7} fill="none" strokeLinecap="round">
          <ellipse rx={20} ry={13} />
          <path d="M -6 -13 L -6 13 M 6 -13 L 6 13" strokeWidth={8} />
        </g>
      </g>
    </g>
  );
};
export const S4: React.FC<ShotProps> = ({ t, len }) => {
  // 12 of the 16 cells carry a pollinator tag: three of every four
  const tagged = [0, 1, 2, 4, 5, 8, 10, 11, 12, 13, 14, 15];
  const gridY0 = 290; // host: grid tightened so its label clears the caption band
  return (
    <g transform={camT(960, 500, kf(t, [[0, 1.0], [len, 1.06]]))}>
      <Schematic t={t} id="bs4" />
      <text x={960} y={170} textAnchor="middle" fontFamily={THAI} fontWeight={600} fontSize={50} fill={SCH.line}>เรื่องจริง</text>
      <text x={960} y={208} textAnchor="middle" fontFamily={FONT.ui} fontSize={24} fill={SCH.dim} letterSpacing={3}>IPBES 2016 · LEADING FOOD CROPS</text>
      {Array.from({ length: 16 }).map((_, i) => {
        const r = Math.floor(i / 4), c = i % 4;
        const gx = 762 + c * 100 + 48;
        const gy = gridY0 + r * 100 + 48;
        const inT = backOut(clamp((t - 6 - i * 2.6) / 7));
        const isTag = tagged.indexOf(i) >= 0;
        const tagT = isTag ? clamp((t - 66 - i * 1.6) / 8) : 0;
        if (inT <= 0) return null;
        return (
          <g key={i} transform={`translate(${gx} ${gy}) scale(${inT})`}>
            <rect x={-44} y={-44} width={88} height={88} rx={14} fill="#0B1424" stroke={isTag ? (tagT > 0 ? SCH.live : SCH.dim) : SCH.dim} strokeWidth={isTag && tagT > 0 ? 3.5 : 2.5} opacity={isTag && tagT > 0 ? 1 : 0.8} />
            <CropIcon kind={i % 6 + Math.floor(i / 6)} lit={isTag && tagT > 0 ? 1 : 0} />
            {isTag ? <PollTag t={tagT} /> : null}
          </g>
        );
      })}
      <g opacity={clamp((t - 122) / 6)}>
        <text x={960} y={254} textAnchor="middle" fontFamily={THAI} fontWeight={600} fontSize={36} fill={CYAN}>พึ่ง ไม่มากก็น้อย · TO SOME EXTENT</text>
              </g>
    </g>
  );
};

// ---------- S5 the real study: bag the lychee blossom, keep the insects out — fruit set falls to ~1/5 ----------
const Branch: React.FC<{ x: number; bag?: number }> = ({ x, bag = 0 }) => (
  <g>
    <path d={`M ${x + 130} 560 Q ${x} 520 ${x - 60} 470`} stroke="#5A4430" strokeWidth={12} fill="none" strokeLinecap="round" />
    <path d={`M ${x - 30} 492 Q ${x - 70} 500 ${x - 92} 488`} stroke="#5A4430" strokeWidth={7} fill="none" strokeLinecap="round" />
    <path d={`M ${x + 40} 528 Q ${x + 74} 512 ${x + 92} 516`} stroke="#5A4430" strokeWidth={7} fill="none" strokeLinecap="round" />
    <ellipse cx={x + 66} cy={502} rx={30} ry={12} fill="#48673B" transform={`rotate(-18 ${x + 66} 502)`} />
    <ellipse cx={x - 76} cy={484} rx={28} ry={11} fill="#48673B" transform={`rotate(14 ${x - 76} 484)`} />
    <Blossom x={x - 6} y={446} s={1.2} />
    <Blossom x={x + 62} y={472} s={1.05} />
    {/** the mesh bag draws over the right branch's blossom */}
    {bag > 0 ? (
      <g opacity={clamp(bag)}>
        <rect x={x - 52} y={416} width={148} height={128} rx={26} fill="#7FA0B4" opacity={0.16} />
        <rect x={x - 52} y={416} width={148} height={128} rx={26} fill="url(#bs5mesh)" stroke="#9FB9CB" strokeWidth={4} strokeDasharray="10 8" />
        <path d={`M ${x - 26} 416 q 26 14 52 0 q 26 14 48 -2`} stroke="#9FB9CB" strokeWidth={5} fill="none" />
      </g>
    ) : null}
  </g>
);
export const S5: React.FC<ShotProps> = ({ t, len }) => {
  // by mid-line (local t ~93): the bag shows its 1, the readout is up; the open branch already reads 5
  const bagIn = easeOut(clamp((t - 4) / 16));
  const vOpen = 5 * easeOut(clamp((t - 40) / 22));
  const vBag = 1 * easeOut(clamp((t - 70) / 16));
  const show = clamp((t - 84) / 8);
  const punch = Math.sin(clamp((t - 84) / 8) * Math.PI) * 4;
  return (
    <g transform={camT(960, 500, kf(t, [[0, 1.0], [len, 1.07]]))}>
      <Schematic t={t} id="bs5" />
      <defs>
        <pattern id="bs5mesh" width={16} height={16} patternUnits="userSpaceOnUse">
          <path d="M 0 0 L 16 16 M 16 0 L 0 16" stroke="#9FB9CB" strokeWidth={2.5} />
        </pattern>
      </defs>
      <text x={960} y={216} textAnchor="middle" fontFamily={THAI} fontWeight={600} fontSize={50} fill={SCH.line}>การทดลองจริง</text>
      <text x={960} y={258} textAnchor="middle" fontFamily={FONT.ui} fontSize={24} fill={SCH.dim} letterSpacing={3}>NORTHERN THAILAND · 2021</text>
      {/* left: the open branch */}
      <Branch x={830} />
      {/* right: the bagged branch */}
      <Branch x={1090} bag={bagIn} />
      {/* five fruits on the open branch, one under the bag */}
      {[0, 1, 2, 3, 4].map((i) => (
        <Litchi key={i} x={796 + i * 34} y={520} s={clamp((t - 40 - i * 3) / 6)} />
      ))}
      <Litchi x={1122} y={524} s={clamp((t - 76) / 6)} />
      {t > 40 ? <text x={830} y={372} textAnchor="middle" fontFamily={FONT.ui} fontWeight={400} fontSize={86} fill={SCH.live} style={{ filter: `drop-shadow(0 0 12px ${SCH.glow}66)` }}>{Math.round(vOpen)}</text> : null}
      {t > 70 ? <text x={1090} y={372} textAnchor="middle" fontFamily={FONT.ui} fontWeight={400} fontSize={86} fill={SCH.dim}>{Math.round(vBag)}</text> : null}
      {t > 24 ? (
        <g opacity={clamp((t - 24) / 6)}>
          <text x={830} y={404} textAnchor="middle" fontFamily={THAI} fontWeight={600} fontSize={26} fill={SCH.dim}>ไม่คลุม</text>
          <text x={1090} y={404} textAnchor="middle" fontFamily={THAI} fontWeight={600} fontSize={26} fill={SCH.dim}>คลุมตาข่าย</text>
        </g>
      ) : null}
      {show > 0 ? (
        <g transform={`translate(960 ${648 + punch})`} opacity={show}>
          <rect x={-236} y={-56} width={472} height={112} rx={22} fill="#0B1424" stroke={SCH.live} strokeWidth={3.5} style={{ filter: `drop-shadow(0 0 ${10 * show}px ${SCH.glow})` }} />
          <text x={-96} y={22} textAnchor="middle" fontFamily={FONT.ui} fontSize={70} fill={SCH.live}>~1/5</text>
          <text x={110} y={6} textAnchor="middle" fontFamily={THAI} fontWeight={600} fontSize={30} fill={SCH.line}>เหลือราว</text>
          <text x={110} y={44} textAnchor="middle" fontFamily={THAI} fontWeight={600} fontSize={30} fill={SCH.line}>หนึ่งในห้า</text>
        </g>
      ) : null}
      {/* bees can only reach the open branch; the bag keeps them off the right one */}
      <Bee x={742} y={466} t={t} s={0.85} />
      <Bee x={896} y={438} t={t + 11} s={0.8} />
      <Bee x={664} y={516} t={t + 23} s={0.75} />
    </g>
  );
};

// ---------- S6 split screen: rice self-pollinates; durian's true pollinator is the bat, at night ----------
/** A high-contrast tag pill at the top band of each half (world y ~120-220): Thai name, mono alias, a drawn check. */
const SplitTag: React.FC<{ cx: number; y: number; w: number; t: number; th: string; en: string; color: string }> = ({ cx, y, w, t, th, en, color }) => {
  if (t < 0) return null;
  const s = backOut(clamp(t / 7));
  const m = clamp((t - 12) / 6);
  return (
    <g transform={`translate(${cx} ${y}) scale(${s})`}>
      <rect x={-w / 2} y={-40} width={w} height={80} rx={18} fill="#0B1424" opacity={0.94} stroke={color} strokeWidth={3}
        style={{ filter: `drop-shadow(0 0 ${8 * clamp(t / 12)}px ${color}55)` }} />
      <text x={-26} y={-6} textAnchor="middle" fontFamily={THAI} fontWeight={600} fontSize={28} fill={SCH.line}>{th}</text>
      <text x={-26} y={26} textAnchor="middle" fontFamily={FONT.ui} fontSize={16} fill="#CBD6E8" letterSpacing={2}>{en}</text>
      <path d={`M ${w / 2 - 46} -8 L ${w / 2 - 28} 12 L ${w / 2 - 4} -28`} stroke={color} strokeWidth={9} fill="none" strokeLinecap="round" strokeLinejoin="round" strokeDasharray={90} strokeDashoffset={90 * (1 - m)} />
    </g>
  );
};
/** A rice plant: green-gold stalk in warm daylight, drooping grain head, a gentle wind sway. */
const RicePlant: React.FC<{ x: number; y: number; t: number; s?: number; seed?: number }> = ({ x, y, t, s = 1, seed = 0 }) => {
  const sway = Math.sin(t / 21 + seed * 1.9) * 6;
  const tip = Math.sin(t / 27 + seed * 2.7) * 5;
  return (
    <g transform={`translate(${x} ${y}) scale(${s}) rotate(${sway})`}>
      <path d="M 0 0 Q 5 -70 8 -138" stroke="#6FA248" strokeWidth={7} fill="none" strokeLinecap="round" />
      <path d="M 0 -44 Q -36 -64 -56 -40 Q -26 -58 0 -36 Z" fill="#7FB257" stroke="#5D8A3F" strokeWidth={2.5} />
      <path d="M 2 -74 Q 34 -92 48 -68 Q 22 -82 2 -62 Z" fill="#74AC50" stroke="#5D8A3F" strokeWidth={2.5} />
      <g transform={`translate(8 -138) rotate(${14 + tip})`}>
        <path d="M 0 0 Q 8 12 24 20 Q 34 26 44 22" stroke="#C9A94E" strokeWidth={4} fill="none" strokeLinecap="round" />
        {[0, 1, 2, 3, 4].map((i) => {
          const gx = 4 + i * 9, gy = 3 + i * 4.4;
          return <ellipse key={i} cx={gx} cy={gy} rx={4.5} ry={9} fill="#E8C862" stroke="#B08F3E" strokeWidth={2} transform={`rotate(${24 + i * 10} ${gx} ${gy})`} />;
        })}
      </g>
    </g>
  );
};
export const S6: React.FC<ShotProps> = ({ t, len }) => {
  const riceTag = clamp((t - 6) / 7);
  const batTag = clamp((t - 152) / 7);
  // the bat is bigger (wingspan ~140) and hovers right at the durian flowers, visiting them
  const batX = 1152 + Math.sin(t / 23) * 20;
  const batY = 532 + Math.sin(t / 15 + 1.1) * 14;
  return (
    <g transform={camT(960, 540, kf(t, [[0, 1.0], [len, 1.07]]))}>
      {/* LEFT: the rice paddy in bright warm daylight */}
      <g>
        <DuskSky id="bs6l" horizonY={560} x0={200} y0={-300} w={780} h={1040} />
        <Sun x={770} y={268} r={54} t={t + 70} />
        {/* golden light band at the horizon, then the flooded paddy */}
        <rect x={260} y={552} width={698} height={16} fill="#E4C878" opacity={0.6} />
        <rect x={260} y={568} width={698} height={520} fill="#88B45E" />
        <rect x={260} y={958} width={698} height={130} fill="#9FC48E" opacity={0.7} />
        {/* three rows of plants: back, mid, near */}
        {Array.from({ length: 16 }).map((_, i) => (
          <RicePlant key={`b${i}`} x={300 + i * 42} y={634 + (i * 13) % 10} t={t} s={0.72} seed={i * 3} />
        ))}
        {Array.from({ length: 12 }).map((_, i) => (
          <RicePlant key={`m${i}`} x={332 + i * 52} y={706 + (i * 9) % 8} t={t} s={1.05} seed={7 + i * 5} />
        ))}
        {Array.from({ length: 9 }).map((_, i) => (
          <RicePlant key={`n${i}`} x={364 + i * 64} y={796} t={t} s={1.5} seed={17 + i * 4} />
        ))}
        <SplitTag cx={806} y={170} w={288} t={riceTag} th="ผสมเกสรตัวเอง" en="SELF-POLLINATING" color="#5BE08A" />
        <Glow x={770} y={300} r={330} o={0.32} />
        <Bokeh seed={8} n={6} x0={340} y0={380} w={420} h={200} t={t + 50} o={0.12} />
      </g>
      <rect x={956} y={40} width={8} height={1000} fill={SCH.dim} opacity={0.5} />
      {/* RIGHT: the durian orchard at night */}
      <g>
        <NightSky id="bs6r" horizonY={640} x0={962} y0={-300} w={760} h={1080} />
        <Stars seed={7} x0={980} y0={40} w={700} h={420} t={t} n={26} o={0.7} />
        <Moon x={1180} y={300} r={40} />
        <rect x={964} y={0} width={756} height={1080} fill="#101830" opacity={0.16} />
        <Lawn y={648} h={452} seed={43} x0={962} x1={1720} band="#0A0E22" grass="#141B33" />
        <path d="M 1150 1060 Q 1136 830 1152 640 Q 1162 540 1140 470" stroke="#241A33" strokeWidth={52} fill="none" strokeLinecap="round" />
        <path d="M 1146 470 Q 1060 420 986 448 M 1150 460 Q 1240 416 1300 444" stroke="#241A33" strokeWidth={24} fill="none" strokeLinecap="round" />
        {[0, 1, 2, 3].map((i) => (
          <ellipse key={i} cx={1020 + i * 92} cy={430 + rnd(51, i) * 30} rx={120} ry={52} fill={i % 2 ? '#1C2748' : '#212E52'} opacity={0.92} />
        ))}
        <DurianFlower x={1042} y={518} />
        <DurianFlower x={1124} y={568} s={1.15} />
        <DurianFlower x={1216} y={514} />
        <DurianFlower x={1234} y={570} s={0.95} />
        <Durian x={1096} y={648} s={1.15} />
        <Durian x={1244} y={688} s={0.9} />
        <Bat x={batX} y={batY} t={t} s={1.35} />
        <SplitTag cx={1118} y={170} w={206} t={batTag} th="ค้างคาว" en="BATS" color="#5BE08A" />
        <Glow x={1180} y={320} r={300} kind="cool" o={0.3} />
        <Dust t={t} seed={23} x0={1000} y0={440} w={260} h={200} n={14} o={0.26} />
      </g>
    </g>
  );
};

// ---------- S7 cliffhanger: the night orchard; the bat vanishes like the bees did; a flower closes; Pip turns with a "?" ----------
export const S7: React.FC<ShotProps> = ({ t, len }) => {
  const tPop = 52;
  const pipPose = poseAt(t, [
    { f: 0, p: { ...basePose, x: 892, y: 806, scale: 0.94, yaw: 0.55, facing: 1, look: 0.5, headTilt: -6, armL: { a: 12, b: -6 }, armR: { a: 14, b: -4 } } },
    { f: 10, p: { headTilt: -9, look: 0.9 } },
    { f: tPop, p: { headTilt: -10, squash: 0.03 } },
    { f: tPop + 8, p: { squash: 0.0, headTilt: -7 } },
    { f: 84, p: { yaw: 0.2, look: 0.1, headTilt: -2 } },
    { f: 96, p: { yaw: 0, look: 0, headTilt: 0, squash: 0.02 } },
    { f: len, p: { squash: 0.05 } },
  ]);
  const pipFace = faceAt(t, [[0, 'neutral'], [tPop, 'shock'], [96, 'worried']]);
  const popLocal = t - tPop;
  const shut = clamp((t - 68) / 26);
  const qIn = backOut(t < 0 ? 0 : clamp((t - 100) / 9));
  // the camera finds Pip as he turns (and holds the unresolved question)
  const z = kf(t, [[0, 1.04], [84, 1.06], [len, 1.34]]);
  const cxs = kf(t, [[0, 966], [84, 962], [len, 926]]);
  const cys = kf(t, [[0, 560], [84, 570], [len, 610]]);
  return (
    <g transform={camT(cxs, cys, z)}>
      <NightSky id="bs7" horizonY={540} x0={400} y0={-300} w={1120} h={1040} />
      <Stars seed={13} x0={430} y0={20} w={1060} h={420} t={t} n={34} o={0.75} />
      <Moon x={1100} y={290} r={44} />
      <Lawn y={652} h={452} seed={47} band="#0A0E22" grass="#141B33" />
      {/* the big durian overhead */}
      <path d="M 1214 1060 Q 1198 830 1212 650 Q 1222 540 1198 462" stroke="#241A33" strokeWidth={58} fill="none" strokeLinecap="round" />
      <path d="M 1204 468 Q 1070 408 952 440 M 1208 458 Q 1300 412 1360 440" stroke="#241A33" strokeWidth={26} fill="none" strokeLinecap="round" />
      {[0, 1, 2].map((i) => (
        <ellipse key={i} cx={1010 + i * 100} cy={424 + rnd(53, i) * 26} rx={128} ry={56} fill={i % 2 ? '#1C2748' : '#212E52'} opacity={0.92} />
      ))}
      <Durian x={1152} y={620} s={1.2} />
      <Durian x={1078} y={706} s={0.85} />
      {/* the flower that closes after the bat is gone */}
      <DurianFlower x={1064} y={512} s={1.2} shut={shut} />
      <DurianFlower x={1240} y={540} s={1.0} shut={clamp(shut * 0.6)} />
      {/* the bat's flight and its pop */}
      {t < tPop ? (
        <Bat x={1004 + Math.max(0, 30 - t) * -1.4} y={498 + Math.max(0, 26 - t) * -1.2} t={t} s={1.2} />
      ) : (
        <g>
          <BatGhost x={1004} y={498} t={popLocal} s={1.2} />
          <PopRing x={1004} y={498} t={popLocal} s={1.6} />
        </g>
      )}
      {actor(PIP, pipPose, pipFace, 'rimBlue')}
      {/* the big unresolved "?" */}
      {t >= 100 ? (
        <g transform={`translate(1008 ${520 - settle(t - 100, 10, 1.3, 12) * 0.6}) scale(${qIn}) rotate(${Math.sin(t / 2.4) * (2 * Math.min(1, (t - 100) / 12))})`}>
          <text textAnchor="middle" fontFamily={FONT.title} fontWeight={800} fontSize={170 - 4 * clamp((t - 100) / 20)} fill={AMBER} stroke={INK} strokeWidth={10} paintOrder="stroke">?</text>
        </g>
      ) : null}
      {/* fallen durian on the ground */}
      <Durian x={972} y={856} s={0.7} />
      <Glow x={1100} y={320} r={320} kind="cool" o={0.3} />
      <LightVeil id="bs7v" lights={[[1100, 320, 280], [960, 660, 200]]} o={0.36} />
      <Dust t={t + 20} seed={29} x0={850} y0={430} w={300} h={260} n={18} o={0.3} />
      <Foreground blur={10}>
        <g transform="translate(1246 240)">
          <path d="M 60 30 Q 10 60 -60 90" stroke="#241A33" strokeWidth={20} fill="none" strokeLinecap="round" />
          <ellipse cx={-20} cy={60} rx={90} ry={38} fill="#1C2748" />
          <ellipse cx={-90} cy={96} rx={70} ry={30} fill="#212E52" />
        </g>
      </Foreground>
    </g>
  );
};
