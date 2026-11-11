import React from 'react';
import {
  Hero, Pose, basePose, poseAt, faceAt, joints, toWorld, kf, clamp, easeOut, backOut, camT,
  rnd, settle, shake, LOOKS, Look, Glow, Cone, Foreground, WallFrame, Schematic, SCH, DrawOn,
  SchLabel, CountUp, Study, Desk, Bedroom, bedSit, BedDuvet, LAMP, walkPose, Tag, ShotProps,
} from '../../engine';
import { FONT } from '../../engine/fonts';

// "ถ้าคุณจำทุกอย่างได้ ไม่ลืมเลย" — seven shots, each a pure function of its own clock t (frames) and its length.
// The vertical film crops the 1920 x 1080 world around x = 960, so all action stays within x 660..1260.

export const THAI = 'Chakra Petch';
const PIP = LOOKS.pipHood;
const AMBER = '#F2C35B';
const CORAL = '#FF8271';
const CYAN = '#87DBD6';
const CREAM = '#F6EFE3';
const INK = '#121019';

const actor = (look: Look, pose: Pose, face: { expr: any; blink: number }, rim = 'rimR') => (
  <Hero look={look} pose={{ ...pose, ...face }} rimId={rim} shadow={0} />
);

/** A Thai label in a small dark capsule (the pills in ui.tsx use the mono face, which can't render Thai). */
const ThaiPill: React.FC<{ x: number; y: number; t: number; text: string; color?: string; size?: number }> = ({
  x, y, t, text, color = CREAM, size = 30,
}) => {
  if (t < 0) return null;
  const s = backOut(clamp(t / 6));
  const w = text.length * size * 0.62 + 56;
  return (
    <g transform={`translate(${x} ${y}) scale(${s})`}>
      <rect x={-w / 2} y={-size * 0.95} width={w} height={size * 1.9} rx={size * 0.95} fill="#0B0816" opacity={0.8} />
      <text y={size * 0.36} textAnchor="middle" fontFamily={THAI} fontWeight={600} fontSize={size} fill={color}>
        {text}
      </text>
    </g>
  );
};

/** A ✓ that pops in a ring, for a password that lands. From t = 0. */
const CheckPop: React.FC<{ x: number; y: number; t: number; r?: number }> = ({ x, y, t, r = 40 }) => {
  if (t < 0) return null;
  const s = backOut(clamp(t / 7));
  const p = easeOut(clamp((t - 3) / 5));
  return (
    <g transform={`translate(${x} ${y}) scale(${s})`}>
      <circle r={r} fill="#0B0816" opacity={0.85} />
      <circle r={r} fill="none" stroke={CYAN} strokeWidth={4} opacity={0.75} />
      <path d={`M ${-r * 0.48} 0 L ${-r * 0.1} ${r * 0.4} L ${r * 0.55} ${-r * 0.45}`} stroke={CYAN} strokeWidth={9} strokeLinecap="round" strokeLinejoin="round" fill="none" strokeDasharray={140} strokeDashoffset={140 * (1 - p)} />
    </g>
  );
};

/** A sticky note that starts stuck at (x0, y0) and from `start` flies into the memory ring at (tx, ty), shrinking away. */
const NoteFly: React.FC<{ x0: number; y0: number; tx: number; ty: number; t: number; start: number; seed: number }> = ({
  x0, y0, tx, ty, t, start, seed,
}) => {
  const dur = 26;
  const rot = (rnd(seed, 3) - 0.5) * 30;
  const k = t < start ? 0 : easeOut(clamp((t - start) / dur));
  if (k >= 1) return null;
  const mx = (x0 + tx) / 2 + (rnd(seed, 5) - 0.5) * 500;
  const my = (y0 + ty) / 2 - 60 - rnd(seed, 7) * 160;
  const x = k <= 0 ? x0 : (1 - k) * (1 - k) * x0 + 2 * (1 - k) * k * mx + k * k * tx;
  const y = k <= 0 ? y0 : (1 - k) * (1 - k) * y0 + 2 * (1 - k) * k * my + k * k * ty;
  const s = 1 - 0.92 * k;
  return (
    <g transform={`translate(${x} ${y}) rotate(${rot + k * 110}) scale(${s})`}>
      <rect x={-26} y={-26} width={52} height={52} rx={4} fill="#F8E27A" stroke="#B8A24A" strokeWidth={3} />
      <path d="M -14 8 L 14 -14 M -8 18 L 12 -4" stroke="#B8A24A" strokeWidth={3} strokeLinecap="round" opacity={0.8} />
      <rect x={-26} y={-26} width={52} height={10} rx={4} fill="#000" opacity={0.08} />
    </g>
  );
};

/** A "!" that pops over a head, for the realisation. From t = 0, gone by 26. */
const FloatBang: React.FC<{ x: number; y: number; t: number }> = ({ x, y, t }) => {
  if (t < 0 || t > 26) return null;
  const s = backOut(clamp(t / 6));
  return (
    <text x={x} y={y - easeOut(t / 24) * 40} textAnchor="middle" fontFamily={FONT.title} fontWeight={800} fontSize={92 * s} fill={CORAL} stroke={INK} strokeWidth={7} paintOrder="stroke">
      !
    </text>
  );
};

/** A birthday cake carried on the hand at (x, y); the candle flames flicker from the shot clock. */
const Cake: React.FC<{ x: number; y: number; t: number; s?: number }> = ({ x, y, t, s = 1 }) => (
  <g transform={`translate(${x} ${y}) scale(${s})`}>
    <ellipse cx={0} cy={34} rx={70} ry={9} fill="#000" opacity={0.15} />
    <rect x={-64} y={-10} width={128} height={40} rx={8} fill="#B98A5C" stroke={INK} strokeWidth={4} />
    <rect x={-64} y={-34} width={128} height={28} rx={12} fill="#F2E4CC" stroke={INK} strokeWidth={4} />
    <path d="M -46 -12 q 4 10 0 18 M -10 -14 q -4 12 6 18 M 28 -12 q 4 10 0 18" stroke="#F2E4CC" strokeWidth={7} fill="none" strokeLinecap="round" />
    {[-30, 0, 30].map((dx, i) => (
      <g key={i}>
        <rect x={dx - 3.5} y={-66} width={7} height={30} rx={3} fill={i % 2 ? CYAN : CORAL} stroke={INK} strokeWidth={2.5} />
        <path d={`M ${dx} -68 q 5 -8 0 -16 q -5 -6 0 -12`} stroke="#FFB15A" strokeWidth={4} fill="none" strokeLinecap="round" opacity={0.75 + 0.25 * Math.sin(t * 1.15 + i * 2)} transform={`translate(0 ${-3 * Math.sin(t * 1.15 + i * 2)})`} />
      </g>
    ))}
  </g>
);

/** A faint clap of wall boards for the flat hallway scene in S2c. */
const WallTimber: React.FC = () => (
  <g opacity={0.5}>
    {[0, 1, 2, 3, 4, 5].map((i) => (
      <path key={i} d={`M ${240 + i * 240} -80 L ${240 + i * 240} 1060`} stroke="#2C2530" strokeWidth={2.5} />
    ))}
    <rect x={200} y={520} width={1520} height={3} fill="#221B26" opacity={0.4} />
  </g>
);

// ---------- S1 hook: study at night; every sticky note in the room flies into the glowing ring over Pip's head ----------
export const S1: React.FC<ShotProps> = ({ t, len }) => {
  const head = { x: 960, y: 540 };
  const ringOn = clamp((t - 5) / 6);
  const ringR = 92 + Math.sin(t * 0.55) * 7;
  const typing = (a: number, b: number, f: number, o: number) => ({ a: a + Math.sin(f * 0.85 + o) * 3.5, b: b + Math.sin(f * 1.6 + o) * 3.5 });
  let pose = poseAt(t, [
    { f: 0, p: { ...basePose, x: 960, y: 712, scale: 1, yaw: 0.28, armL: { a: 40, b: -28 }, armR: { a: 48, b: -32 } } },
    { f: 16, p: { headTilt: -2, squash: -0.015 } },
    { f: 74, p: { armL: { a: 26, b: -10 }, armR: { a: 32, b: -12 }, headTilt: 3, squash: -0.04 } },
    { f: 90, p: { squash: -0.01, headTilt: 2 } },
    { f: len, p: { headTilt: 2 } },
  ]);
  pose = { ...pose, armL: typing(pose.armL.a, pose.armL.b, t, 0), armR: typing(pose.armR.a, pose.armR.b, t, 2) };
  const face = faceAt(t, [[0, 'neutral'], [16, 'happy'], [80, 'smug']]);
  const sh = shake(t, 18, 10, 6);
  const noteSpots = [
    { x: 792, y: 552 }, { x: 884, y: 548 }, { x: 744, y: 470 }, { x: 1160, y: 452 },
    { x: 730, y: 636 }, { x: 1172, y: 628 }, { x: 968, y: 396 }, { x: 1052, y: 402 },
  ];
  return (
    <g transform={camT(960 + sh.x, 545 + sh.y, kf(t, [[0, 1.06], [len, 1.3]]))}>
      <Study t={t + 40} id="nf1" night />
      <Desk x0={690} x1={1230} y={700} />
      <Glow x={head.x} y={head.y} r={190 + ringR * 0.4} o={0.55 * ringOn} />
      {actor(PIP, pose, face)}
      {/* the glowing ring over the head */}
      {ringOn > 0 ? (
        <g opacity={ringOn}>
          <circle cx={head.x} cy={head.y} r={ringR} fill="none" stroke="#FFE2B0" strokeWidth={7} opacity={0.9} style={{ filter: `drop-shadow(0 0 ${14 * ringOn}px ${AMBER})` }} />
          <circle cx={head.x} cy={head.y} r={ringR - 13} fill="none" stroke={AMBER} strokeWidth={3} opacity={0.45 + 0.2 * Math.sin(t * 0.7)} />
        </g>
      ) : null}
      {noteSpots.map((n, i) => (
        <NoteFly key={i} x0={n.x} y0={n.y} tx={head.x + (i % 2 ? 5 : -5)} ty={head.y} t={t} start={8 + i * 4.5} seed={12 + i} />
      ))}
      <Tag x={960} y={318} t={t - 70} w={430} text="MEMORY 100%" />
      <Foreground blur={10}>
        <g>
          <rect x={610} y={1002} width={740} height={180} rx={26} fill="#191320" />
          <ellipse cx={980} cy={1000} rx={280} ry={20} fill="#191320" />
        </g>
      </Foreground>
    </g>
  );
};

// ---------- S2a: (a) Pip types the Wi-Fi password without looking; the check lands ----------
const BeatWifi: React.FC<{ t: number }> = ({ t }) => {
  let pose = poseAt(t, [
    { f: 0, p: { ...basePose, x: 960, y: 712, scale: 1, yaw: 0.3, armL: { a: 40, b: -28 }, armR: { a: 48, b: -32 }, look: -1 } },
    { f: 26, p: { headTilt: 2 } },
    { f: 49, p: { headTilt: 1 } },
  ]);
  pose = {
    ...pose,
    armL: { a: pose.armL.a + Math.sin(t * 0.9) * 4, b: pose.armL.b + Math.sin(t * 1.7) * 4 },
    armR: { a: pose.armR.a + Math.sin(t * 0.95 + 2) * 4, b: pose.armR.b + Math.sin(t * 1.75 + 2) * 4 },
    look: -1,
  };
  const face = faceAt(t, [[0, 'neutral'], [30, 'happy']]);
  const panelPop = backOut(clamp((t - 2) / 7));
  return (
    <g transform={camT(900, 575, 1.9)}>
      <Study t={t + 90} id="nf2a" night />
      <Desk x0={690} x1={1230} y={700} />
      <Glow x={900} y={575} r={330} o={0.3} />
      {actor(PIP, pose, face)}
      {/* the password panel floating over the laptop */}
      <g transform={`translate(905 470) scale(${panelPop})`} opacity={panelPop}>
        <rect x={-125} y={-44} width={250} height={88} rx={16} fill="#0B0816" opacity={0.85} />
        <rect x={-125} y={-44} width={250} height={88} rx={16} fill="none" stroke={CYAN} strokeWidth={3} />
        {/* a small wifi glyph */}
        <g stroke={CYAN} strokeWidth={4} fill="none" strokeLinecap="round">
          <path d="M -108 -14 A 21 21 0 0 1 -88 -14" />
          <path d="M -103 -8 A 14 14 0 0 1 -93 -8" />
        </g>
        <circle cx={-98} cy={8} r={3.5} fill={CYAN} />
        {[0, 1, 2, 3, 4, 5, 6, 7].map((i) => {
          const on = clamp((t - (6 + i * 2)) / 3);
          return <circle key={i} cx={-64 + i * 20} cy={10} r={5} fill={CYAN} opacity={0.25 + 0.75 * on} />;
        })}
      </g>
      <CheckPop x={1046} y={468} t={t - 30} />
      <ThaiPill x={895} y={548} t={t - 36} text="เชื่อมต่อแล้ว" color={CYAN} />
      <Tag x={925} y={372} t={t - 44} w={260} text="NO PEEKING" />
      {/* a router blinking its LEDs on the desk */}
      <g transform="translate(1030 662)">
        <rect x={-30} y={-22} width={60} height={26} rx={7} fill="#2A2C3C" stroke="#1A1C28" strokeWidth={3} />
        <line x1={-8} y1={-22} x2={-4} y2={-44} stroke="#1A1C28" strokeWidth={4} strokeLinecap="round" />
        <circle cx={-16} cy={-9} r={4} fill="#5BE08A" opacity={0.5 + 0.5 * Math.sin(t * 0.6)} />
        <circle cx={2} cy={-9} r={4} fill={CYAN} opacity={0.5 + 0.5 * Math.sin(t * 0.6 + 2)} />
      </g>
      <Foreground blur={10}>
        <rect x={620} y={1006} width={680} height={180} rx={22} fill="#191320" />
      </Foreground>
    </g>
  );
};

// ---------- S2b: (b) the car park — Pip walks straight through the gloom to the B3 pillar ----------
const BeatPark: React.FC<{ t: number; len: number }> = ({ t, len }) => {
  const arrive = 34;
  const tap = 42;
  const ground = 810;
  let pose: Pose;
  if (t < arrive + 4) {
    const x = kf(clamp(t, 4, arrive + 4), [[4, 700], [arrive, 946]]);
    pose = walkPose(x, Math.max(0, t - 4) * 0.62, ground, 0.95, { armR: { a: 28, b: 10 } }, 1);
  } else {
    pose = poseAt(t, [
      { f: arrive + 4, p: { ...basePose, x: 946, y: ground - 140 * 0.95, scale: 0.95, yaw: 0.75, armR: { a: 30, b: -8 }, squash: 0.045 } },
      { f: arrive + 12, p: { squash: 0, armR: { a: 20, b: -4 } } },
      { f: tap, p: { armR: { a: 62, b: -14 }, headTilt: 3 } },
      { f: tap + 8, p: { armR: { a: 56, b: -10 }, squash: 0.02 } },
      { f: len, p: { squash: 0, armR: { a: 48, b: -8 } } },
    ]);
  }
  const face = faceAt(t, [[0, 'smug'], [tap + 6, 'shock'], [len, 'smug']]);
  const cx = t < arrive + 4 ? kf(t, [[0, 810], [arrive + 6, 952]]) : 952;
  const touch = t > tap;
  const ringT = t - tap;
  return (
    <g transform={camT(cx, 540, kf(t, [[0, 1.1], [len, 1.2]]))}>
      {/* the garage gloom */}
      <rect x={200} y={-100} width={1520} height={1180} fill="#14161F" />
      <rect x={200} y={690} width={1520} height={390} fill="#1D2130" />
      <rect x={200} y={690} width={1520} height={10} fill="#0B0E16" opacity={0.7} />
      {/* far cars, dark */}
      {[700, 1240].map((cx0, i) => (
        <g key={i} fill="#232839">
          <path d={`M ${cx0 - 80} ${ground} L ${cx0 - 72} ${ground - 58} Q ${cx0 - 58} ${ground - 96} ${cx0 - 8} ${ground - 100} L ${cx0 + 44} ${ground - 100} Q ${cx0 + 78} ${ground - 92} ${cx0 + 86} ${ground - 52} L ${cx0 + 92} ${ground} Z`} />
          <ellipse cx={cx0 - 44} cy={ground} rx={26} ry={22} fill="#151926" />
          <ellipse cx={cx0 + 46} cy={ground} rx={26} ry={22} fill="#151926" />
        </g>
      ))}
      {/* the pillar with B3 painted on */}
      <g>
        <ellipse cx={1082} cy={ground + 6} rx={110} ry={15} fill="#000" opacity={0.4} />
        <polygon points="1002,128 1164,128 1154,804 1008,804" fill="#2B3040" />
        <polygon points="1002,128 1164,128 1164,136 1002,136" fill="#3A4054" />
        <polygon points="1146,140 1164,128 1154,804 1140,804" fill="#232838" />
        <text x={1082} y={462} textAnchor="middle" fontFamily={FONT.ui} fontSize={148} fill="#E3D8BC" opacity={0.8}>
          B3
        </text>
        <rect x={1030} y={560} width={114} height={12} rx={5} fill="#262C3C" />
        <ellipse cx={1048} cy={770} rx={40} ry={8} fill="#181B26" />
      </g>
      {/* the overhead strip light */}
      <g>
        <rect x={1024} y={92} width={130} height={16} rx={6} fill="#3A415A" />
        <Glow x={1090} y={130} r={280} o={0.4} />
        <Cone d="M 1042 120 L 1140 120 L 1210 804 L 962 804 Z" o={0.2} />
      </g>
      {actor(PIP, pose, face)}
      {/* contact ring on the tap */}
      {touch ? <circle cx={1016} cy={640} r={10 + ringT * 5} fill="none" stroke={AMBER} strokeWidth={4} opacity={clamp(1 - ringT / 12)} /> : null}
      <Foreground blur={8}>
        <rect x={560} y={960} width={360} height={240} fill="#1A1530" />
      </Foreground>
    </g>
  );
};

// ---------- S2c: (c) Mo opens the door onto Pip already holding the cake; her jaw drops ----------
const BeatDoor: React.FC<{ t: number; len: number }> = ({ t, len }) => {
  const see = 20;
  const arrive = 30;
  const x0 = 712; // the hinge
  const ang = kf(t, [[2, 0.14], [14, 1.3]]);
  const lx = x0 + 218 * Math.cos(ang);
  const lyT = 218 + 66 * Math.sin(ang);
  const lyB = 752 + 40 * Math.sin(ang);
  let pose: Pose;
  if (t < arrive + 4) {
    const x = kf(clamp(t, 4, arrive + 4), [[4, 788], [arrive, 892]]);
    pose = walkPose(x, Math.max(0, t - 4) * 0.6, 792, 1, { armR: { a: 66, b: -52 }, armL: { a: 74, b: -46 }, headTilt: -3 }, 1);
  } else {
    pose = poseAt(t, [
      { f: arrive + 4, p: { ...basePose, x: 892, y: 792 - 140, scale: 1, yaw: 0.4, armR: { a: 66, b: -52 }, armL: { a: 74, b: -46 }, squash: 0.03 } },
      { f: arrive + 12, p: { squash: 0, headTilt: -4 } },
      { f: len, p: { headTilt: -2 } },
    ]);
  }
  const hand = toWorld(pose, joints(pose).armR.end);
  const m = { ...basePose, x: 1108, y: 792 - 140 * 1.06, scale: 1.06, yaw: -0.85, facing: -1 } as Pose;
  const mo = poseAt(t, [
    { f: 0, p: m },
    { f: see - 8, p: { tilt: 4, headTilt: 5, armR: { a: 24, b: 6 } } },
    { f: see, p: { tilt: -6, headTilt: -7, squash: 0.04, armR: { a: 128, b: -10 }, armL: { a: 118, b: -6 } } },
    { f: see + 9, p: { tilt: -8, squash: 0.06 } },
    { f: see + 16, p: { tilt: -6, squash: 0.04 } },
    { f: len, p: { tilt: -5, squash: 0.03, headTilt: -6 } },
  ]);
  return (
    <g transform={camT(972, 560, kf(t, [[0, 1.0], [len, 1.1]]))}>
      {/* the hallway of Pip's place */}
      <rect x={200} y={-100} width={1520} height={1180} fill="#2F2833" />
      <WallTimber />
      {/* bunting for the birthday */}
      <g>
        <path d="M 964 296 Q 1090 340 1232 306" stroke="#221B26" strokeWidth={4} fill="none" />
        {[0, 1, 2, 3, 4].map((i) => {
          const p = 964 + 268 * (i / 4);
          const q = 296 + 42 * Math.sin(Math.PI * (i / 4));
          return <path key={i} transform={`translate(${p} ${q + Math.sin(t / 12 + i) * 2})`} d="M -16 0 L 16 0 L 0 34 Z" fill={[AMBER, CORAL, CYAN][i % 3]} />;
        })}
      </g>
      <WallFrame x={1168} y={428} w={88} h={116} art={1} />
      {/* the door: opening (hall light), leaf swinging toward camera */}
      <g>
        <rect x={700} y={204} width={244} height={566} fill="#4A3B44" />
        <rect x={712} y={216} width={220} height={536} fill="#EFD9A8" />
        <circle cx={824} cy={310} r={12} fill="#FFC27A" opacity={0.8} />
        <Glow x={824} y={340} r={190} o={0.5} />
        <polygon points={`${x0},216 ${lx} ${lyT} ${lx} ${lyB} ${x0},752`} fill="#43333B" stroke="#2A2129" strokeWidth={5} />
        <rect x={x0 + (lx - x0) * 0.84 - 7} y={(lyT + lyB) / 2 - 7} width={14} height={14} rx={7} fill="#C9A46A" />
      </g>
      {/* Pip through the door, cake already in his hands */}
      {actor(PIP, pose, faceAt(t, [[0, 'happy']]), 'rimR')}
      <Cake x={hand.x + 8} y={hand.y - 6} t={t} />
      <Glow x={hand.x} y={hand.y - 40} r={120} o={0.3 * clamp((t - arrive) / 10)} />
      {/* Mo, jaw dropping */}
      {actor(LOOKS.mo, mo, faceAt(t, [[0, 'happy'], [see, 'shock']]), 'rimR')}
      <FloatBang x={1102} y={520} t={t - see} />
      <Foreground blur={8}>
        <rect x={430} y={1000} width={760} height={180} rx={20} fill="#1A1522" />
      </Foreground>
    </g>
  );
};

// ---------- S2: the three-beat montage ----------
export const S2: React.FC<ShotProps> = ({ t, len }) => {
  if (t < 49) return <BeatWifi t={t} />;
  if (t < 99) return <BeatPark t={t - 49} len={50} />;
  return <BeatDoor t={t - 99} len={len - 99} />;
};

// ---------- S3 schematic: the rule card — remembered means permanent, and there is no delete key ----------
const KeyRow1: React.FC<{ y: number; t: number; text: string }> = ({ y, t, text }) => {
  if (t < 0) return null;
  const s = backOut(clamp(t / 7));
  const p = easeOut(clamp((t - 5) / 6));
  return (
    <g transform={`translate(960 ${y}) scale(${s * 0.84})`}> {/* host: rows fit the 9:16 window */}
      <rect x={-294} y={-46} width={588} height={92} rx={18} fill="#0B1424" stroke={CYAN} strokeWidth={4} />
      <path d="M -258 0 L -238 24 L -198 -24" stroke={CYAN} strokeWidth={10} fill="none" strokeLinecap="round" strokeLinejoin="round" strokeDasharray={110} strokeDashoffset={110 * (1 - p)} />
      <text x={-160} y={15} fontFamily={THAI} fontWeight={600} fontSize={40} fill={SCH.line} textAnchor="start">
        {text}
      </text>
    </g>
  );
};

/** The delete-key row: a keycap and the Thai label; at t = 16 the ✗ lands and the cyan turns red. */
const KeyDelRow: React.FC<{ y: number; t: number }> = ({ y, t }) => {
  if (t < 0) return null;
  const s = backOut(clamp(t / 7));
  const strike = t > 16;
  const cross = strike ? easeOut(clamp((t - 16) / 6)) : 0;
  const c = strike ? '#FF5A4A' : CYAN;
  return (
    <g transform={`translate(960 ${y}) scale(${s * 0.84})`}> {/* host: rows fit the 9:16 window */}
      <rect x={-294} y={-46} width={588} height={92} rx={18} fill="#0B1424" stroke={c} strokeWidth={4} />
      <g transform="translate(-252 0)">
        <rect x={-44} y={-40} width={88} height={80} rx={14} fill="#16283C" stroke={c} strokeWidth={4} />
        <path d="M -34 -30 L 34 -30" stroke={SCH.dim} strokeWidth={3} opacity={0.7} />
        <text y={12} textAnchor="middle" fontFamily={FONT.ui} fontSize={28} fill={c}>
          DEL
        </text>
        {strike ? (
          <path d="M -28 -26 L 28 26 M 28 -26 L -28 26" stroke="#FF5A4A" strokeWidth={9} strokeLinecap="round" fill="none" strokeDasharray={160} strokeDashoffset={160 * (1 - cross)} />
        ) : null}
      </g>
      <text x={-160} y={15} fontFamily={THAI} fontWeight={600} fontSize={40} fill={strike && cross >= 1 ? '#FF5A4A' : SCH.line} textAnchor="start">
        ปุ่มลบ
      </text>
    </g>
  );
};

export const S3: React.FC<ShotProps> = ({ t, len }) => {
  const sh = shake(t, 48, 8, 5);
  const titlePop = backOut(clamp((t - 4) / 8));
  return (
    <g transform={camT(960 + sh.x, 545 + sh.y, kf(t, [[0, 1.0], [len, 1.06]]))}>
      <Schematic t={t} id="nfrule" />
      <g transform={`translate(960 250) scale(${titlePop})`}>
        <text y={16} textAnchor="middle" fontFamily={THAI} fontWeight={600} fontSize={54} fill={SCH.glow}>
          กฎข้อเดียว
        </text>
      </g>
      <SchLabel x={960} y={304} t={t - 8} text="EPISODE RULE · NOT REAL" size={24} color={SCH.dim} />
      <KeyRow1 y={424} t={t - 14} text="จำได้ทุกอย่าง" />
      <KeyDelRow y={588} t={t - 32} />
    </g>
  );
};

// ---------- S4 schematic: the real research — Ebbinghaus 1885, nonsense syllables, the 1-day curve ----------
const squig = (i: number) => {
  const x1 = -14 + rnd(i, 1) * 6;
  return `M -20 ${10 - rnd(i, 3) * 16} Q ${x1} ${-12 + rnd(i, 4) * 20} ${rnd(i, 5) * 16 - 6} ${6 - rnd(i, 6) * 18} T 20 ${-8 + rnd(i, 7) * 14}`;
};

export const S4: React.FC<ShotProps> = ({ t, len }) => {
  const X0 = 700;
  const X1 = 1230;
  const Y0 = 644;
  const Y1 = 400;
  const callout = t - (len - 66);
  const calloutPop = backOut(clamp(callout / 9));
  const settleY = callout > 10 ? settle(callout - 10, 3, 1.4, 8) : 0;
  const markPop = backOut(clamp((t - 146) / 5));
  return (
    <g transform={camT(960, 545, kf(t, [[0, 1.0], [len, 1.05]]))}>
      <Schematic t={t} id="nfebbing" />
      <g transform={`translate(960 262) scale(${backOut(clamp((t - 2) / 7))})`}>
        <text y={14} textAnchor="middle" fontFamily={THAI} fontWeight={600} fontSize={44} fill={SCH.line}>
          งานวิจัยจริง
        </text>
      </g>
      <SchLabel x={960} y={308} t={t - 6} text="EBBINGHAUS 1885 · REPLICATED 2015" size={20} color={SCH.dim} />
      {/* the nonsense-syllable tiles: they pop in, then each fades as it is forgotten */}
      {[0, 1, 2, 3, 4, 5, 6, 7].map((i) => {
        const pop = backOut(clamp((t - (8 + i * 3)) / 6));
        const fade = 1 - 0.88 * easeOut(clamp((t - (76 + i * 7)) / 10));
        return (
          <g key={i} transform={`translate(${736 + i * 62 + 31} 384) scale(${pop})`} opacity={clamp(fade)}>
            <rect x={-26} y={-26} width={52} height={52} rx={10} fill="#0F1B2C" stroke={SCH.dim} strokeWidth={3} />
            <path d={squig(i)} stroke={SCH.line} strokeWidth={5} fill="none" strokeLinecap="round" />
          </g>
        );
      })}
      {/* axes and the forgetting curve */}
      <DrawOn d={`M ${X0} ${Y1 - 24} L ${X0} ${Y0} L ${X1} ${Y0}`} t={t - 28} dur={14} color={SCH.dim} width={5} />
      <DrawOn d={`M ${X0} 428 C 790 570, 880 596, ${X1} 612`} t={t - 46} dur={60} color={SCH.live} width={6} />
      <path d={`M 810 ${Y0} L 810 ${Y0 + 10} M 948 ${Y0} L 948 ${Y0 + 10}`} stroke={SCH.dim} strokeWidth={4} />
      <SchLabel x={810} y={690} t={t - 116} text="20 MIN" size={26} color={SCH.line} />
      <SchLabel x={948} y={690} t={t - 124} text="1 H" size={26} color={SCH.line} />
      {/* one day in: the relearning-effort callout */}
      <DrawOn d={`M 1206 ${Y0} L 1206 611`} t={t - 138} dur={10} color={SCH.dim} width={4} />
      {t > 146 ? (
        <circle cx={1206} cy={611} r={(12 + Math.sin(t * 0.5) * 3) * markPop} fill={SCH.live} opacity={markPop} style={{ filter: `drop-shadow(0 0 10px ${SCH.glow})` }} />
      ) : null}
      <SchLabel x={1160} y={690} t={t - 146} text="1 DAY" size={30} color={SCH.live} />
      {callout >= 0 ? (
        <g transform={`translate(1078 464) scale(${calloutPop}) translate(0 ${settleY})`}>
          <rect x={-145} y={-52} width={290} height={104} rx={18} fill="#0B1424" stroke={SCH.live} strokeWidth={4} style={{ filter: `drop-shadow(0 0 12px ${SCH.glow}55)` }} />
          <text y={8} textAnchor="middle" fontFamily={THAI} fontWeight={600} fontSize={36} fill={SCH.line}>
            ต้องท่องใหม่ ~2/3
          </text>
          <text y={40} textAnchor="middle" fontFamily={FONT.ui} fontSize={18} fill={SCH.dim} letterSpacing={2}>
            RELEARNING EFFORT
          </text>
        </g>
      ) : null}
    </g>
  );
};

// ---------- S5 schematic: the calendar wall lights day by day; 50 confirmed figures, count with UC Irvine ----------
export const S5: React.FC<ShotProps> = ({ t, len }) => {
  const colls = 12;
  const rows = 4;
  const countT = t - 62;
  const pillPop = backOut(clamp((t - 58) / 7));
  return (
    <g transform={camT(960, 540, kf(t, [[0, 1.0], [len, 1.045]]))}>
      <Schematic t={t} id="nhsam" />
      <g transform={`translate(960 156) scale(${backOut(clamp((t - 2) / 7))})`}>
        <text y={20} textAnchor="middle" fontFamily={FONT.ui} fontSize={58} fill={SCH.live} letterSpacing={6} style={{ filter: `drop-shadow(0 0 12px ${SCH.glow}66)` }}>
          HSAM
        </text>
      </g>
      <SchLabel x={960} y={216} t={t - 5} text="HIGHLY SUPERIOR AUTOBIOGRAPHICAL MEMORY" size={18} color={SCH.dim} />
      {/* the calendar wall: every day lights, one by one (grid inside x 690..1230, well above the captions) */}
      {Array.from({ length: colls * rows }).map((_, i) => {
        const c = i % colls;
        const r = Math.floor(i / colls);
        const pop = backOut(clamp((t - (10 + i * 0.35)) / 5));
        const cx = 704 + c * 44;
        const cy = 258 + r * 40;
        return (
          <g key={i} transform={`translate(${cx + 19} ${cy + 15}) scale(${0.3 + 0.7 * pop}) translate(${-cx - 19} ${-cy - 15})`} opacity={pop}>
            <rect x={cx} y={cy} width={38} height={30} rx={5} fill="#0F1B2C" stroke="#2A3E58" strokeWidth={2} />
            <rect x={cx + 4} y={cy + 4} width={30} height={22} rx={4} fill={AMBER} opacity={0.8} />
          </g>
        );
      })}
      {/* 50 confirmed figures in two short rows under the grid — the rest of the frame stays dark */}
      {Array.from({ length: 50 }).map((_, i) => {
        const pop = backOut(clamp((t - (62 + i * 0.6)) / 4));
        const px = 716 + (i % 25) * 21;
        const py = 456 + (i < 25 ? 0 : 52);
        return (
          <g key={i} transform={`translate(${px} ${py}) scale(${0.85 * pop})`} opacity={pop}>
            <circle cx={0} cy={-12} r={8} fill={SCH.line} opacity={0.9} />
            <path d="M 0 -4 L 0 14 M 0 14 L -7 30 M 0 14 L 7 30 M 0 0 L -9 10 M 0 0 L 9 10" stroke={SCH.line} strokeWidth={5} strokeLinecap="round" fill="none" />
          </g>
        );
      })}
      {/* the confirmed count, above the captions */}
      <g transform={`translate(960 616) scale(${pillPop * 0.84})`} opacity={pillPop}> {/* host: pill fits the window */}
        <rect x={-270} y={-46} width={540} height={86} rx={43} fill="#0B1424" stroke={SCH.dim} strokeWidth={3} opacity={0.92} />
        <text x={-168} y={14} textAnchor="middle" fontFamily={THAI} fontWeight={600} fontSize={36} fill={SCH.line}>
          ยืนยันแล้ว
        </text>
        <CountUp x={0} y={22} t={countT} to={50} dur={94} size={64} format={(v) => `${Math.round(v)}+`} />
        <text x={158} y={14} textAnchor="middle" fontFamily={THAI} fontWeight={600} fontSize={38} fill={SCH.line}>
          คน
        </text>
      </g>
      <SchLabel x={960} y={706} t={t - (len - 24)} text="UC IRVINE · CNLM LAB" size={21} color={SCH.dim} />
    </g>
  );
};

// ---------- S6 schematic: same on most lab tests, and they can misremember too ----------
export const S6: React.FC<ShotProps> = ({ t, len }) => {
  const flick = t < 118 ? (t >= 96 ? (Math.floor((t - 96) / 8) % 2 === 0 ? 1 : 0) : 0) : 1;
  const balloon = flick === 1 ? CYAN : CORAL;
  const barG = (d: number) => easeOut(clamp((t - d) / 14));
  return (
    <g transform={camT(960, 545, kf(t, [[0, 1.0], [len, 1.05]]))}>
      <Schematic t={t} id="nftest" />
      <path d="M 962 300 L 962 716" stroke="#22354E" strokeWidth={3} />
      {/* left column (x 700..950): the lab test — two bars ending level */}
      <g transform={`translate(818 316) scale(${backOut(clamp((t - 6) / 7))})`}>
        <text y={12} textAnchor="middle" fontFamily={THAI} fontWeight={600} fontSize={30} fill={SCH.line}>
          แบบทดสอบในแล็บ
        </text>
      </g>
      {[
        { x: 736, w: 56, h: 168, color: AMBER, label: 'HSAM', lab: true, d: 14 },
        { x: 826, w: 56, h: 164, color: '#9AB2C8', label: 'คนทั่วไป', lab: false, d: 18 },
      ].map((b, i) => {
        const g = barG(b.d) + 0.08 * Math.sin(clamp(t - b.d, 0, 6) / 6 * Math.PI) * barG(b.d);
        return (
          <g key={i}>
            <rect x={b.x} y={640 - b.h * clamp(g)} width={b.w} height={b.h * clamp(g)} rx={9} fill={b.color} /> {/* host: bars grow up from a baseline */}
            <rect x={b.x} y={640 - b.h * clamp(g)} width={b.w} height={5} rx={2.5} fill="#fff" opacity={0.25} />
            <text x={b.x + b.w / 2} y={668} textAnchor="middle" fontFamily={b.lab ? FONT.ui : THAI} fontWeight={b.lab ? 400 : 600} fontSize={b.lab ? 20 : 24} fill={SCH.dim} opacity={clamp(barG(b.d) * 1.2)}>
              {b.label}
            </text>
          </g>
        );
      })}
      {/* the "about the same" mark between the bars */}
      <g>
        <circle cx={809} cy={504} r={19} fill="#0B1424" stroke={SCH.glow} strokeWidth={3} opacity={clamp((t - 34) / 4) * 0.9} />
        <g stroke={SCH.glow} strokeWidth={4} strokeLinecap="round" opacity={clamp((t - 34) / 4)}>
          <path d="M 800 498 L 818 498" />
          <path d="M 800 510 L 818 510" />
        </g>
      </g>
      <ThaiPill x={818} y={708} t={t - 44} text="ส่วนใหญ่พอๆ กัน" color={CYAN} size={21} />
      <SchLabel x={818} y={744} t={t - 56} text="MOST TESTS" size={17} color={SCH.dim} />
      {/* right column (x 980..1230): a memory photo whose detail flickers and changes */}
      {(() => {
        const pop = backOut(clamp((t - 70) / 8));
        return (
          <g transform={`translate(1096 430) rotate(-2) scale(${0.9 * pop})`} opacity={pop}>
            <rect x={-108} y={-130} width={216} height={260} rx={6} fill="#EDE6D8" />
            <g transform="translate(-99 -92)">
              <rect width={198} height={186} fill="#8FA6C8" />
              <rect y={120} width={198} height={66} fill="#6E7F5E" />
              <circle cx={158} cy={30} r={16} fill="#EFD9A8" opacity={0.9} />
              <circle cx={72} cy={62} r={13} fill={SCH.ground} />
              <path d="M 72 75 L 72 104 M 72 104 L 61 128 M 72 104 L 83 128 M 72 82 L 88 94 M 72 82 L 58 96" stroke={SCH.ground} strokeWidth={5} strokeLinecap="round" fill="none" />
              {/* the detail that flickers: the balloon's colour */}
              <line x1={91} y1={86} x2={123} y2={44} stroke="#4A4338" strokeWidth={2.5} />
              <ellipse cx={131} cy={34} rx={17} ry={21} fill={balloon} />
              <rect width={198} height={186} fill="#fff" opacity={0.09} />
            </g>
            <rect x={-30} y={-148} width={62} height={22} rx={4} fill="#D8CDBB" opacity={0.9} transform="rotate(-3 -30 -148)" />
          </g>
        );
      })()}
      {t > 118 ? (
        <g opacity={clamp((t - 118) / 4)}>
          <circle cx={1176} cy={342} r={24} fill="#0B0816" opacity={0.85} />
          <text x={1176} y={353} textAnchor="middle" fontFamily={FONT.ui} fontSize={32} fill={CYAN}>
            ?
          </text>
        </g>
      ) : null}
      <ThaiPill x={1096} y={616} t={t - 118} text="จำผิดได้" color={CORAL} size={28} />
      <SchLabel x={1096} y={660} t={t - 130} text="FALSE MEMORIES" size={17} color={SCH.dim} />
    </g>
  );
};

// ---------- S7 cliffhanger: bedroom 23:58 — the words replay, the pillow is pulled, Pip peeks at camera ----------
/** The faceless silhouette at the foot of the bed: invented, never named, never a face. */
const Silhouette: React.FC<{ x: number; y: number; t: number; s?: number }> = ({ x, y, t, s = 1 }) => {
  const sway = Math.sin(t / 20) * 1.4;
  return (
    <g transform={`translate(${x} ${y}) rotate(${sway} 0 40) scale(${s})`}>
      <path d="M -50 0 C -54 -120 -26 -162 0 -162 C 26 -162 54 -120 50 0 Z" fill="#131527" />
      <path d="M -50 0 C -54 -120 -26 -162 0 -162 C 26 -162 54 -120 50 0" fill="none" stroke="#4A5B90" strokeWidth={3} opacity={0.5} />
      <ellipse cx={0} cy={6} rx={62} ry={12} fill="#000" opacity={0.35} />
    </g>
  );
};

/** A speech bubble from the silhouette: the same words, stacking up, older ones fading back. */
const ReplayBubble: React.FC<{ x: number; y: number; t: number; text: string }> = ({ x, y, t, text }) => {
  if (t < 0) return null;
  const s = backOut(clamp(t / 6));
  const jx = t < 8 ? Math.sin(t * 2.3) * 3 * (1 - t / 8) : 0;
  const w = 236;
  const h = 58;
  return (
    <g transform={`translate(${x + jx} ${y}) scale(${s})`} opacity={clamp((18 - t) / 6, 0.65, 1)}>
      <path d={`M 20 ${h / 2 - 6} L 66 ${h / 2 + 34} L 58 ${h / 2 - 6} Z`} fill={CREAM} stroke={INK} strokeWidth={4} />
      <rect x={-w / 2} y={-h / 2} width={w} height={h} rx={h / 2} fill={CREAM} stroke={INK} strokeWidth={4} />
      <text y={h * 0.36} textAnchor="middle" fontFamily={THAI} fontWeight={600} fontSize={30} fill="#1D2033">
        {text}
      </text>
    </g>
  );
};

/** The pillow, pulled from off frame onto the head; then it slides down and the eyes peek at camera. */
const Pillow: React.FC<{ x: number; y: number; t: number; peek?: number }> = ({ x, y, t, peek = 0 }) => {
  if (t < 0) return null;
  const from = { x: x + 330, y: y + 226 };
  const k = easeOut(clamp(t / 18));
  const px = from.x + (x - from.x) * k;
  const py = from.y + (y - from.y) * k;
  const rot = -0.28 + 0.4 * k;
  const squash = t > 18 && t < 25 ? 1 + 0.16 * Math.sin((t - 18) * 0.9) : 1;
  const dy = 30 * easeOut(clamp(peek / 12));
  return (
    <g transform={`translate(${px} ${py + dy}) rotate(${rot}) scale(${2 - squash} ${squash})`}>
      <rect x={-112} y={-56} width={224} height={112} rx={52} fill="#E7E4DC" />
      <path d="M -86 0 Q 0 -38 86 0 Q 0 34 -86 0 Z" fill="#D8D2C6" opacity={0.8} />
      <rect x={-112} y={-56} width={224} height={112} rx={52} fill="none" stroke="#B9B2A4" strokeWidth={4} />
      <path d="M -60 -50 q 60 -22 120 0" stroke="#B9B2A4" strokeWidth={3} fill="none" opacity={0.7} />
    </g>
  );
};

export const S7: React.FC<ShotProps> = ({ t, len }) => {
  const bed = bedSit(0.28);
  const headY = bed.y - 176 * bed.scale;
  const pullStart = 44;
  const peekStart = 100;
  let pose = poseAt(t, [
    { f: 0, p: { ...basePose, x: bed.x, y: bed.y, scale: bed.scale, yaw: 0.45, facing: 1, armL: { a: 16, b: -10 }, armR: { a: 14, b: -8 } } },
    { f: pullStart - 6, p: { headTilt: -4, squash: -0.02 } },
    { f: pullStart + 20, p: { headTilt: 4, squash: 0.03 } },
    { f: pullStart + 30, p: { headTilt: 2 } },
    { f: len, p: { headTilt: -2 } },
  ]);
  if (t > 6 && t < pullStart) pose = { ...pose, headTilt: pose.headTilt + Math.sin(t / 2.1) * 2.2 };
  const face = faceAt(t, [[0, 'tired'], [peekStart, 'worried']]);
  const merge = { ...pose, ...face, blink: t < pullStart ? (t % 36 < 5 ? 1 : 0) : 0 };
  const popped = [10, 36, 62]; // bubbles stack left of the silhouette, well inside the pushed-in window (x <= 1155)
  const cx = kf(t, [[0, 958], [len, 948]]);
  return (
    <g transform={camT(cx, 560, kf(t, [[0, 1.0], [len, 1.09]]))}>
      <Bedroom t={t + 50} id="nf7" duvet={false} clock="23:58" crossed={0} lamp={0.85 + 0.05 * Math.sin(t / 9)} />
      <Glow x={LAMP.x} y={LAMP.y} r={280} o={0.28} />
      <Silhouette x={1148} y={742} t={t} />
      <Hero look={PIP} pose={merge} rimId="rimR" shadow={0} />
      <BedDuvet />
      {popped.map((p, k) => (
        <g key={k}>
          <ReplayBubble x={1024 + k * 6} y={436 - k * 42} t={t - p} text="จำได้ไหม…" />
        </g>
      ))}
      <Pillow x={bed.x} y={headY + 6} t={t - pullStart} peek={t - peekStart} />
      {t > peekStart + 16 ? (
        <text x={bed.x + 118} y={headY - 84 + Math.sin(t / 5) * 4} textAnchor="middle" fontFamily={FONT.title} fontWeight={800} fontSize={104} fill={AMBER} stroke={INK} strokeWidth={7} paintOrder="stroke" opacity={clamp((t - peekStart - 16) / 3)}>
          ?
        </text>
      ) : null}
      <Foreground blur={8}>
        <rect x={260} y={980} width={720} height={200} fill="#141126" />
      </Foreground>
    </g>
  );
};
