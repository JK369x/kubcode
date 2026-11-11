import React from 'react';
import {
  Hero, Pose, basePose, poseAt, faceAt, kf, clamp, easeOut, camT, LOOKS, reachAngle, joints, toWorld,
  Bedroom, BEDROOM, bedSit, LAMP, BedDuvet, Rooftop, Tabletop, Glow, TitleCard,
  Schematic, SCH, DrawOn, SchLabel, CountUp, ShotProps,
} from '../../engine';
import { FONT } from '../../engine/fonts';

// "Mute until laughing" — 12 shots roster. Static boards upgraded to real anticipation/contact-hold/overshoot:
// S1–S6 the three touched objects (alarm, jackhammer, truck horn), S7 the title, S8 the conditional
// laugh → ALL stored sounds release together → he clamps it and the rings claw back (hypothesis beaten back),
// S9/S10 the real air-speed fact (~20 °C, ~343 m/s), S11 a pure schematic still (no fantasy, no look overlay),
// S12 the unresolved held-laugh cliffhanger. Each shot is a pure function of its own clock t.

const PIP = LOOKS.pipHood;
const MO = LOOKS.mo;
const BELLE = '#FFE2A8';
const hero = (pose: Pose, face: { expr?: any; blink?: number }) => (
  <Hero look={PIP} pose={{ ...pose, ...face }} rimId="rimR" shadow={0} />
);
const polar = (cx: number, cy: number, r: number, deg: number) => ({
  x: cx + r * Math.cos((deg * Math.PI) / 180),
  y: cy - r * Math.sin((deg * Math.PI) / 180),
});

/** Three wavy sound rings; dy>0 collapses and freezes them (the mute); negative dy pops them live (release). */
const Rings: React.FC<{ x: number; y: number; r?: number; t: number; dy?: number; seed?: number; n?: number }> = ({ x, y, r = 40, t, dy = 0, seed = 0, n = 3 }) => (
  <g>
    {Array.from({ length: n }).map((_, i) => {
      const rr = dy > 0 ? Math.max(12, r - dy * 0.6 + i * 8) : r + i * 24 + Math.sin(t / 4 + seed + i * 1.7) * 6;
      const wob = dy > 0 ? 0 : Math.sin(t / 3.2 + seed + i) * 8;
      return <path key={i} d={`M ${polar(x, y, rr, -155 + wob).x} ${polar(x, y, rr, -155 + wob).y} Q ${polar(x, y, rr * 1.15, -90 + wob).x} ${polar(x, y, rr * 1.15, -90 + wob).y} ${polar(x, y, rr, -25 + wob).x} ${polar(x, y, rr, -25 + wob).y}`} stroke={BELLE} strokeWidth={7 - i * 1.4} fill="none" strokeLinecap="round" opacity={dy > 0 ? 0.55 : 0.8} />;
    })}
  </g>
);

const Alarm = ({ x, y, s = 1, tilt = 0 }: { x: number; y: number; s?: number; tilt?: number }) => (
  <g transform={`translate(${x} ${y}) scale(${s}) rotate(${tilt})`}>
    <path d="M -13 8 L -22 22 M 13 8 L 22 22" stroke="#B8763A" strokeWidth={5} strokeLinecap="round" />
    <circle cx={0} cy={0} r={24} fill="#E9C46A" stroke="#B8763A" strokeWidth={3} />
    <circle cx={0} cy={0} r={17} fill="#F6EFE3" />
    <path d="M 0 0 L 0 -11 M 0 0 L 7 -4" stroke="#3A3552" strokeWidth={3} strokeLinecap="round" />
    <circle cx={-9} cy={-21} r={10} fill="#D8A25A" />
    <circle cx={9} cy={-21} r={10} fill="#D8A25A" />
  </g>
);

const Wheel = ({ cx, cy, deg }: { cx: number; cy: number; deg: number }) => (
  <g>
    <circle cx={cx} cy={cy} r={32} fill="#141220" stroke="#2A2338" strokeWidth={6} />
    <path d={`M ${cx - 24} ${cy} H ${cx + 24} M ${cx} ${cy - 24} V ${cy + 24}`} stroke="#3A3552" strokeWidth={5} transform={`rotate(${deg} ${cx} ${cy})`} />
  </g>
);

/** Truck: front bumper at transform x, ground y 760. `s` scales; the horn is its own brass trumpet on the grille. */
const Truck: React.FC<{ x: number; s?: number; spin?: number; hornRings?: { t: number; dy?: number; seed?: number }; puffs?: { t: number; on: boolean } }> = ({ x, s = 1, spin = 0, hornRings, puffs }) => (
  <g transform={`translate(${x} 760) scale(${s})`}>
    <rect x={-190} y={-224} width={190} height={216} rx={14} fill={hornRings ? '#3F4E68' : '#3A4558'} />
    <rect x={-160} y={-196} width={64} height={54} rx={8} fill="#8FB6E2" opacity={0.85} />
    <circle cx={-120} cy={-248} r={26} fill={hornRings ? '#FFD35A' : '#5A5468'} />
    <rect x={0} y={-252} width={340} height={240} fill="#4A4438" />
    <rect x={14} y={-236} width={312} height={30} fill="#55503F" />
    {/* the horn: a separate brass trumpet under the grille, its own part, not the light, not a wheel */}
    <g>
      <path d="M -176 -150 L -206 -150 Q -224 -150 -224 -132 Q -224 -114 -206 -114 L -176 -114 Z" fill="#D9A441" stroke="#8A5A22" strokeWidth={4} />
      <ellipse cx={-210} cy={-132} rx={13} ry={17} fill="#B8763A" />
    </g>
    {hornRings ? (
      <g transform="translate(-210 -132)">
        <Rings x={0} y={0} r={30} t={hornRings.t} dy={hornRings.dy} seed={hornRings.seed ?? 8} />
      </g>
    ) : null}
    <Wheel cx={-120} cy={0} deg={spin} />
    <Wheel cx={200} cy={0} deg={spin} />
    {puffs && puffs.on
      ? Array.from({ length: 3 }).map((_, i) => (
          <circle key={`p${i}`} cx={360 + i * 26} cy={-260 + i * 8} r={11 + Math.sin(spin / 3 + i) * 4} fill="#6A6478" opacity={0.5 - i * 0.1} />
        ))
      : null}
    <ellipse cx={-196} cy={-8} rx={14} ry={6} fill="#000" opacity={0.35} />
  </g>
);

const JH = ({ x, y, s = 1 }: { x: number; y: number; s?: number }) => (
  <g transform={`translate(${x} ${y}) scale(${s})`}>
    <rect x={-40} y={-158} width={80} height={16} rx={8} fill="#3A4256" />
    <rect x={-20} y={-170} width={40} height={120} rx={9} fill="#5A6478" />
    <rect x={-14} y={-52} width={28} height={26} fill="#46506A" />
    <rect x={-6} y={-28} width={12} height={30} fill="#9AA4B8" />
  </g>
);

const Mitten = ({ x, y, rot = 20, look = PIP }: { x: number; y: number; rot?: number; look?: any }) => (
  <g transform={`translate(${x} ${y}) rotate(${rot})`}>
    <ellipse rx={30} ry={24} fill={look.hand} stroke={look.line} strokeWidth={5} />
    <ellipse cx={-6} cy={-14} rx={10} ry={7} fill={look.hand} stroke={look.line} strokeWidth={4} />
  </g>
);

const BUILD = [[-60, 150, 230], [180, 210, 180], [340, 170, 260], [600, 240, 210], [800, 150, 280], [1080, 200, 240], [1300, 170, 300], [1600, 220, 340], [1860, 140, 320]];
/** Dusk street backdrop: sky, skyline with sparse lit windows, road, lampposts, crosswalk. */
const Street: React.FC<{ t: number }> = ({ t }) => (
  <g>
    <rect x={-400} y={-400} width={2720} height={1240} fill="#241539" />
    <rect x={-400} y={-400} width={2720} height={500} fill="#2B1A48" opacity={0.7} />
    {BUILD.map(([x, y, w], i) => (
      <g key={i}>
        <rect x={x} y={620 - y} width={w} height={y + 40} fill="#181030" />
        {[0, 1, 2, 3, 4].map((j) => (
          <rect key={j} x={x + 22 + ((j * 53) % (w - 44))} y={620 - y + 18 + ((j * 68) % (y - 40))} width={16} height={20} fill={(i * 7 + j) % 3 === 0 ? '#FFC98A' : '#2A2048'} opacity={0.9} />
        ))}
      </g>
    ))}
    <rect x={-400} y={620} width={2720} height={60} fill="#2C2540" />
    <rect x={-400} y={680} width={2720} height={400} fill="#211A30" />
    {Array.from({ length: 14 }).map((_, i) => (
      <rect key={`d${i}`} x={-60 - ((1500 - t * 4) % 160) + i * 170} y={856} width={90} height={12} rx={6} fill="#3A3352" />
    ))}
    <rect x={760} y={700} width={420} height={300} fill="none" stroke="#3A3352" strokeWidth={8} strokeDasharray="50 40" />
    <ellipse cx={400} cy={620} rx={120} ry={16} fill="#141024" />
    <ellipse cx={1500} cy={620} rx={120} ry={16} fill="#141024" />
  </g>
);

// ---------- S1 (0.000–1.333 · f0–40, len 40): 04:12 — asleep, wake, windup, the tap lands at t35 (after the phrase) ----------
const AL = BEDROOM.P(0.485, 0.77, 0.02);
export const S1: React.FC<ShotProps> = ({ t, len }) => {
  const sit = bedSit(0.17);
  const face = faceAt(t, [[0, 'tired'], [9, 'shock'], [30, 'shock'], [36, 'worried']]);
  const base: Pose = { ...basePose, x: sit.x, y: sit.y, scale: sit.scale, yaw: -0.25, tilt: -3, legL: { a: 62, b: -46 }, legR: { a: 54, b: -36 }, armL: { a: 34, b: 20 } };
  const lean = poseAt(t, [{ f: 0, p: base }]);
  const aim = reachAngle({ ...base, x: base.x + (t > 30 ? 52 : 0) }, AL);
  // asleep → wake with a small flinch → windup back → reach → contact at 35 → hold
  const pose = poseAt(t, [
    { f: 0, p: { ...base, headTilt: 14, armR: { a: 50, b: -30 } } },
    { f: 8, p: { headTilt: 3, armR: { a: 44, b: -24 } }, ease: easeOut },
    { f: 18, p: { armR: { a: aim - 34, b: -26 } } }, // windup
    { f: 22, p: { x: sit.x + 24, tilt: -6, armR: { a: aim - 22, b: -20 } } },
    { f: 30, p: { x: sit.x + 52, tilt: -7, armR: { a: aim - 8, b: -10 }, handR: 'point', headTilt: 5 }, ease: easeOut },
    { f: 35, p: { armR: { a: aim, b: 0 }, headTilt: 6, squash: 0.02 } },
    { f: 39, p: { squash: 0 } },
  ]);
  // Parent geometry conform: reachAngle points toward a target but cannot extend a finite arm.
  // Smoothly slide the seated rig so its attached wrist actually meets the alarm's top.
  const contact = clamp((t - 22) / 13);
  const wrist = toWorld(pose, joints(pose).armR.end);
  pose.x += (AL.x - wrist.x) * contact;
  pose.y += (AL.y - 26 - wrist.y) * contact;
  const dy = t < 35 ? 0 : clamp((t - 35) * 9, 0, 80);
  return (
    <g transform={camT(kf(t, [[0, 905], [len, 898]]), 620, kf(t, [[0, 1.04], [len, 1.1]]))}>
      <Bedroom t={t} id="mt" duvet={false} clock="04:12" />
      <Glow x={LAMP.x} y={LAMP.y} r={430} o={0.5} />
      <Rings x={AL.x} y={AL.y - 26} r={30} t={t} dy={dy} />
      {hero(pose, { expr: face.expr, blink: t < 6 || face.blink ? 1 : 0 })}
      <BedDuvet from={0.1} />
      <Alarm x={AL.x} y={AL.y} s={1.1} tilt={t >= 35 ? -3 : 0} />
      {/* proportionate fingertip mitten riding the rig's OWN arm end (no extra limb); he leans/slide-steps to the nightstand */}
      {t >= 18 ? (() => {
        const tip = toWorld(pose, joints(pose).armR.end);
        return (
          <g filter="url(#rimR)" transform={`translate(${tip.x} ${tip.y}) scale(${0.55 * pose.scale})`}>
            <Mitten x={0} y={0} rot={-18} />
          </g>
        );
      })() : null}
    </g>
  );
};

// ---------- S2 (1.333–2.760 · f40–83, len 43): macro — the alarm dead, sleeve withdraws, last ring collapses ----------
export const S2: React.FC<ShotProps> = ({ t, len }) => {
  const hx = kf(t, [[0, 860], [12, 820], [43, 560]]);
  const hy = kf(t, [[0, 400], [12, 424], [43, 470]]);
  return (
    <g transform={camT(900, kf(t, [[0, 520], [len, 502]]), 1.15)}>
      <Tabletop edge={880} wood="#6A5A66" grain="#5E505C" lip="#54484F" kind="stone" floor="#221A26" floorLines="#1C1620" />
      <Glow x={900} y={430} r={560} o={0.42} />
      <Rings x={900} y={444} r={86} t={t} dy={clamp(t * 5, 0, 95)} seed={2} />
      <Alarm x={900} y={560} s={3.4} tilt={clamp((t - 2) * 2, 0, 5) - clamp((t - 8) * 2, 0, 5)} />
      <g filter="url(#rimR)">
        <path d={`M ${hx + 20} ${hy - 10} Q ${(hx + 300) / 2} ${hy - 240} 300 -300`} stroke={PIP.line} strokeWidth={108} fill="none" strokeLinecap="round" />
        <path d={`M ${hx + 20} ${hy - 10} Q ${(hx + 300) / 2} ${hy - 240} 300 -300`} stroke={PIP.limb} strokeWidth={86} fill="none" strokeLinecap="round" />
        <Mitten x={hx} y={hy} rot={-40} />
      </g>
    </g>
  );
};

// ---------- S3 (2.760–4.200 · f83–126, len 43): wide — crew drills, rings live; Pip winds up and lands the slap at t40 ----------
export const S3: React.FC<ShotProps> = ({ t, len }) => {
  const wx = kf(t, [[0, 980], [22, 680], [len, 620]]); // he closes right up to the drill, inside arm reach
  const bounce = t > 0 ? Math.abs(Math.sin(t / 3.4)) * 6 : 0;
  const moP: Pose = { ...basePose, x: 430, y: 772 - bounce, scale: 0.72, yaw: -0.8, tilt: 6 + bounce, armR: { a: 168, b: -14 }, armL: { a: 40, b: 30 }, legL: { a: 8, b: 0 }, legR: { a: -14, b: 2 } };
  const pip: Pose = { ...basePose, x: wx, y: 806, scale: 0.8, yaw: -0.5, armL: { a: 26, b: 8 }, legL: { a: 18, b: 6 }, legR: { a: -10, b: -4 } };
  const aim = reachAngle(pip, { x: 546, y: 702 });
  const pose = poseAt(t, [
    { f: 0, p: { ...pip, armR: { a: -96, b: -20 } } },
    { f: 22, p: { armR: { a: aim - 46, b: -30 } } }, // windup back high
    { f: 38, p: { armR: { a: aim - 6, b: -8 }, handR: 'point', tilt: 8 }, ease: easeOut },
    { f: 40, p: { armR: { a: aim, b: 0 }, tilt: 10, squash: 0.02 } }, // contact on the handle
    { f: 43, p: { squash: 0 } },
  ]);
  // Parent geometry conform: keep the native attached arm, close the final wrist-to-handle gap.
  const contact = clamp((t - 30) / 10);
  const wrist = toWorld(pose, joints(pose).armR.end);
  pose.x += (540 - wrist.x) * contact;
  pose.y += (704 - wrist.y) * contact;
  return (
    <g transform={camT(kf(t, [[0, 1000], [len, 920]]), 640, kf(t, [[0, 1.02], [len, 1.08]]))}>
      <Street t={t} />
      <Glow x={1400} y={560} r={200} kind="warm" o={0.35} />
      {/* drill rides ON the road where the crew stands (bit at ~878 like their feet): handle bar at world (454..546, ~704) */}
      <JH x={500} y={876} s={1.15} />
      <Hero look={MO} pose={{ ...moP, ...faceAt(t, [[0, 'neutral']]) }} rimId="rimR" shadow={0} />
      {/* the worker's sleeves: slim, anchored to his ACTUAL shoulders, both hands on the bar's left section */}
      {(() => {
        const shL = toWorld(moP, joints(moP).armL.root); // measured anchor: no floating arm start
        const shR = toWorld(moP, joints(moP).armR.root);
        return (
          <g filter="url(#rimR)">
            <path d={`M ${shL.x + 24} ${shL.y + 10} Q ${(shL.x + 454) / 2} ${shL.y + 66} 454 696`} stroke={MO.line} strokeWidth={17} fill="none" strokeLinecap="round" />
            <path d={`M ${shL.x + 24} ${shL.y + 10} Q ${(shL.x + 454) / 2} ${shL.y + 66} 454 696`} stroke={MO.limb} strokeWidth={13} fill="none" strokeLinecap="round" />
            <g transform="translate(454 704) rotate(40) scale(0.5)"><Mitten x={0} y={0} look={MO} /></g>
            <path d={`M ${shR.x + 24} ${shR.y + 6} Q ${(shR.x + 508) / 2} ${shR.y + 62} 508 696`} stroke={MO.line} strokeWidth={17} fill="none" strokeLinecap="round" />
            <path d={`M ${shR.x + 24} ${shR.y + 6} Q ${(shR.x + 508) / 2} ${shR.y + 62} 508 696`} stroke={MO.limb} strokeWidth={13} fill="none" strokeLinecap="round" />
            <g transform="translate(508 704) rotate(30) scale(0.5)"><Mitten x={0} y={0} look={MO} /></g>
          </g>
        );
      })()}
            <Rings x={500} y={800} r={30} t={t} seed={4} />
      <Truck x={1420} s={0.72} spin={t * 8} puffs={{ t, on: true }} />
      {hero(pose, { expr: 'neutral' })}
    </g>
  );
};

// ---------- S4 (4.200–4.913 · f126–147, len 21): macro low — hand stays on the handle from the cut; rings dry up, bit keeps chewing ----------
export const S4: React.FC<ShotProps> = ({ t, len }) => {
  const hx = kf(t, [[0, 470], [4, 462], [10, 470], [21, 468]]);
  const hy = kf(t, [[0, 430], [4, 436], [10, 430], [21, 434]]);
  return (
    <g transform={camT(620, kf(t, [[0, 560], [len, 548]]), 1.3)}>
      <rect x={-400} y={760} width={2720} height={320} fill="#2A2338" />
      <rect x={-400} y={742} width={2720} height={30} fill="#332B44" />
      <path d={`M 240 760 L 300 780 L 430 762 L 560 786 L 740 760`} stroke="#1C1728" strokeWidth={10} fill="none" />
      <Glow x={520} y={560} r={520} o={0.36} />
      {/* the same drill, same ground line: bit tip ~762 y on the road, bar at ~428 */}
      <JH x={400} y={758} s={2.2} />
      {t < 14 ? <Rings x={400} y={396} r={70} t={t} dy={clamp((t - 2) * 8, 0, 95)} seed={6} /> : null}
      {/* worker's grip sleeve holds the left bar end the whole time */}
      <g filter="url(#rimR)">
        <path d="M 80 120 Q 200 300 320 420" stroke={MO.line} strokeWidth={64} fill="none" strokeLinecap="round" />
        <path d="M 80 120 Q 200 300 320 420" stroke={MO.limb} strokeWidth={50} fill="none" strokeLinecap="round" />
        <Mitten x={320} y={428} rot={60} look={MO} />
      </g>
      {/* Pip's hand stays pressed on the right end (continuity from S3's contact), a tiny press-recoil, then holds */}
      <g filter="url(#rimR)">
        <path d={`M ${hx + 30} ${hy + 40} Q ${(hx + 1100) / 2 + 240} ${hy + 240} 1100 -260`} stroke={PIP.line} strokeWidth={112} fill="none" strokeLinecap="round" />
        <path d={`M ${hx + 30} ${hy + 40} Q ${(hx + 1100) / 2 + 240} ${hy + 240} 1100 -260`} stroke={PIP.limb} strokeWidth={90} fill="none" strokeLinecap="round" />
        <Mitten x={hx} y={hy} rot={-64} />
      </g>
    </g>
  );
};

// ---------- S5 (4.913–6.860 · f147–206, len 59): wide low — the tap lands at t57, just after the phrase's live run ends (local f56) ----------
export const S5: React.FC<ShotProps> = ({ t, len }) => {
  const bx = kf(t, [[0, 1500], [30, 1250], [len, 1146]]); // still creeping closer even muted (rule beat ahead)
  const px = kf(t, [[0, 660], [16, 800], [24, 880]]);
  const reach: Pose = { ...basePose, x: px, y: 806, scale: 0.8, yaw: 0.7, tilt: 10, legL: { a: 34, b: 10 }, legR: { a: -26, b: -12 } };
  // the horn trumpet's world point from Truck's own transform: local (-210,-132) at ground 760, s 0.85
  const HORN = { x: bx - 210 * 0.85, y: 760 - 132 * 0.85 };
  const pose = poseAt(t, [
    { f: 0, p: { ...reach, x: 660, armR: { a: -50, b: -16 } } },
    { f: 24, p: { x: 880, tilt: 14 }, ease: easeOut }, // closes right up to the hood
    { f: 34, p: { armR: { a: reachAngle({ ...reach, x: 880 }, HORN) - 44, b: -28 } } }, // windup back
    { f: 52, p: { armR: { a: reachAngle({ ...reach, x: 880 }, HORN) - 8, b: -10 }, handR: 'point' }, ease: easeOut },
    { f: 55, p: { armR: { a: reachAngle({ ...reach, x: 880 }, HORN) - 2, b: -2 }, handR: 'point', tilt: 12 } },
    { f: 57, p: { armR: { a: reachAngle({ ...reach, x: 880 }, HORN), b: 0 }, squash: 0.02, tilt: 12 } }, // contact on the horn, held
    { f: 59, p: { squash: 0 } },
  ]);
  const face = faceAt(t, [[0, 'shock'], [57, 'worried']]);
  const dy = t < 57 ? 0 : clamp((t - 57) * 20, 0, 95);
  return (
    <g transform={camT(kf(t, [[0, 1030], [len, 996]]), 610, kf(t, [[0, 1.16], [len, 1.26]]))}>
      <Street t={t} />
      <Glow x={bx - 160} y={610} r={240} kind={t < 57 ? 'warm' : 'red'} o={0.42} />
      <Truck x={bx} s={0.85} spin={t * 11} hornRings={{ t, dy, seed: 12 }} puffs={{ t, on: true }} />
      {hero(pose, face)}
    </g>
  );
};

// ---------- S6 (6.860–9.540 · f206–286, len 80): medium — the horn stays dead, engine rings + puffs continue, truck still rolls past ----------
export const S6: React.FC<ShotProps> = ({ t, len }) => {
  const bx = kf(t, [[0, 700], [len, -900]]);
  const pip: Pose = { ...basePose, x: 850, y: 815, scale: 0.8, yaw: 1, tilt: -6, armL: { a: -140, b: -22 }, armR: { a: -120, b: -16 }, legL: { a: -22, b: 4 }, legR: { a: 20, b: -8 } };
  const pose = poseAt(t, [{ f: 0, p: pip }, { f: 30, p: { x: 902, legL: { a: -18, b: 0 } } }, { f: 70, p: { headTilt: -6 } }]);
  return (
    <g transform={camT(kf(t, [[0, 640], [len, 430]]), 600, kf(t, [[0, 1.2], [len, 1.14]]))}>
      <Street t={t} />
      <Rings x={bx + 380} y={545} r={22} t={t} seed={10} n={2} /> {/* engine rings keep running: only the horn was stored */}
      <Truck x={bx} s={1.15} spin={t * 14} puffs={{ t, on: true }} />
      {hero(pose, { expr: 'shock', blink: t > 38 && t < 42 ? 1 : 0 })}
    </g>
  );
};

// ---------- S7 (9.540–11.633 · f286–349, len 63): title wide, rooftop dusk ----------
export const S7: React.FC<ShotProps> = ({ t, len }) => {
  const pip: Pose = { ...basePose, x: 952, y: 812, scale: 0.95, yaw: 0, armL: { a: 14, b: -6 }, armR: { a: 14, b: -6 } };
  return (
    <g transform={camT(960, kf(t, [[0, 660], [len, 640]]), kf(t, [[0, 1.06], [len, 1.14]]))}>
      <Rooftop t={t} />
      <Glow x={960} y={880} r={520} o={0.3} />
      {hero(pip, { expr: 'neutral' })}
      <TitleCard t={t - 6} lines={['WHAT IF YOU COULD', 'SILENCE UNTIL LAUGHTER?']} accent="LAUGHTER" accentT={12} y={440} size={92} />
    </g>
  );
};

// ---------- S8 (11.633–14.673 · f349–440, len 91): the rule, demonstrated: an ALREADY LAUGHING mouth at t52 releases EVERY stored sound at once; they expand, fade, gone — no return, no storage ----------
export const S8: React.FC<ShotProps> = ({ t, len }) => {
  const released = t >= 52;
  const hx = (ox: number) => ox + (940 - ox) * (released ? 0 : clamp((t - 30) / 22) * 0.4);
  const pip: Pose = { ...basePose, x: 940, y: 810, scale: 0.82, yaw: 0, tilt: released ? -8 : -4 };
  const pose = poseAt(t, [
    { f: 0, p: { ...pip, armL: { a: 20, b: -8 }, armR: { a: 20, b: -8 }, headTilt: 0 } },
    { f: 26, p: { headTilt: -8, squash: -0.03, armL: { a: 26, b: 10 }, armR: { a: 26, b: 10 } } }, // the laugh building
    { f: 46, p: { headTilt: -10, squash: -0.05 }, ease: easeOut }, // mouth opens — it's genuinely funny to him
    { f: 54, p: { headTilt: 2, armL: { a: 150, b: 34 }, armR: { a: 150, b: 34 }, squash: 0.05 } }, // caught: hands to face
    { f: 78, p: { squash: 0.02 } },
  ]);
  // every halo pops LIVE at t52 and expands forever: dy 60 -> 0, then wider and fading to nothing permanently
  const hdy = released ? 0 : 60;
  const hr = released ? 40 + (t - 52) * 2.6 : 26;
  const fade = released ? clamp(1 - (t - 52) / 46) : 1;
  return (
    <g transform={camT(940, 620, kf(t, [[0, 1.04], [len, 1.12]]))}>
      <Street t={t} />
      <g opacity={fade}>
        <Rings x={hx(360)} y={590} r={hr} t={t} dy={hdy} seed={2} />
        <Rings x={hx(760)} y={600} r={hr - 8} t={t} dy={hdy} seed={5} />
        <Truck x={1120} s={0.66} spin={0} />
        <Rings x={hx(1156)} y={540} r={hr - 4} t={t} dy={hdy} seed={8} />
      </g>
      {hero(pose, { expr: faceAt(t, [[0, 'neutral'], [22, 'happy'], [50, 'shock']]).expr })}
    </g>
  );
};

// ---------- S9 (14.673–16.700 · f440–501, len 61): schematic — the real fact: sound in air at ~20 °C spreads over a ruler ----------
export const S9: React.FC<ShotProps> = ({ t, len }) => (
  <g transform={camT(960, 540, 1.08)}>
    <Schematic t={t} id="mts" />
    <DrawOn d="M 300 640 L 1660 640" t={t} dur={12} width={5} />
    {Array.from({ length: 7 }).map((_, i) => (
      <g key={i}>
        <path d={`M ${300 + i * 229} 640 v 26`} stroke={SCH.dim} strokeWidth={4} />
        <DrawOn d={`M ${300 + i * 229} 640 v 26`} t={t - i * 2} dur={6} width={4} color={SCH.dim} />
      </g>
    ))}
    {Array.from({ length: 3 }).map((_, i) => {
      const p = (t * 0.03 + i * 0.33) % 1.02;
      return <circle key={i} cx={470 + p * 1120} cy={640} r={26 - p * 10} fill="none" stroke={SCH.glow} strokeWidth={5} opacity={(1 - p) * 0.8} />;
    })}
    <DrawOn d="M 430 640 L 380 590 M 430 640 L 380 690" t={t} dur={8} />
    <circle cx={470} cy={640} r={16} fill={SCH.live} />
    <g style={{ fontFamily: 'Thonburi, Noto Sans Thai, sans-serif' }}>
      <SchLabel x={960} y={820} t={t - 2} text="เสียงในอากาศ ~20 °C" size={46} color={SCH.live} />
    </g>
    <SchLabel x={960} y={360} t={t} text="SOUND SPREADS · เสียงแผ่ไปตามระยะ" size={34} color={SCH.dim} />
  </g>
);

// ---------- S10 (16.700–19.860 · f501–596, len 95): schematic — ~343 m/s counts up over the tick column ----------
export const S10: React.FC<ShotProps> = ({ t, len }) => (
  <g transform={camT(960, 540, kf(t, [[0, 1.06], [len, 1.12]]))}>
    <Schematic t={t} id="mts2" />
    <text x={806} y={502} fontFamily={FONT.ui} fontSize={110} fill={SCH.live}>~</text>
    <CountUp x={1000} y={500} t={t - 4} to={343} dur={40} size={150} color={SCH.live} />
    <g style={{ fontFamily: 'Thonburi, Noto Sans Thai, sans-serif' }}>
      <SchLabel x={960} y={646} t={t} text="เมตรต่อวินาที · m/s" size={52} color={SCH.line} />
    </g>
    {Array.from({ length: 5 }).map((_, i) => {
      const p = (t * 0.02 + i * 0.2) % 1.02;
      return <circle key={i} cx={p * 1800} cy={330} r={9} fill={SCH.glow} opacity={(1 - p) * 0.9} />;
    })}
    <DrawOn d="M 60 330 H 1840" t={t} dur={14} width={3} color={SCH.dim} />
    <text x={240} y={250} fontFamily={FONT.ui} fontSize={30} fill={SCH.dim} letterSpacing={2}>~20 °C air</text>
  </g>
);

// ---------- S11 (19.860–20.934 · f596–628, len 32): "this bit is real" — a pure factual SCHEMATIC still, settled
//          (~343 m/s held, in air ~20 °C). No fantasy rings, no characters, no mute look, no HUD ----------
export const S11: React.FC<ShotProps> = ({ t, len }) => (
  <g transform={camT(960, 540, 1.1)}>
    <Schematic t={t} id="mts3" />
    <DrawOn d="M 300 640 L 1660 640" t={0} dur={1} width={5} />
    {Array.from({ length: 7 }).map((_, i) => (
      <path key={i} d={`M ${300 + i * 229} 640 v 26`} stroke={SCH.dim} strokeWidth={4} />
    ))}
    <circle cx={470} cy={640} r={16} fill={SCH.live} />
    <DrawOn d="M 430 640 L 380 590 M 430 640 L 380 690" t={0} dur={1} />
    {Array.from({ length: 3 }).map((_, i) => {
      const p = (t * 0.03 + i * 0.33) % 1.02;
      return <circle key={i} cx={470 + p * 1120} cy={640} r={26 - p * 10} fill="none" stroke={SCH.glow} strokeWidth={5} opacity={(1 - p) * 0.8} />;
    })}
    {/* settled fact, readable from frame 0: ~343 */}
    <text x={960} y={470} textAnchor="middle" fontFamily={FONT.ui} fontSize={112} fill={SCH.line} letterSpacing={2}>~343</text>
    <text x={960} y={548} textAnchor="middle" fontFamily={FONT.ui} fontSize={38} fill={SCH.dim} letterSpacing={2}>m/s · เมตรต่อวินาที</text>
    <text x={960} y={820} textAnchor="middle" fontFamily={FONT.ui} fontSize={46} fill={SCH.live} letterSpacing={2} style={{ fontFamily: 'Thonburi, Noto Sans Thai, sans-serif' }}>~20 °C ในอากาศ · ของจริง</text>
  </g>
);

// ---------- S12 (20.934–23.887 · f628–717, len 89): close cliffhanger — guarded low arms, two proportional mittens
//          actually pressed over the mouth (rig-anchored), rings crowd in on ONE continuous radius and hold, unresolved ----------
export const S12: React.FC<ShotProps> = ({ t, len }) => {
  const face = faceAt(t, [[0, 'worried']]);
  const pose: Pose = poseAt(t, [
    { f: 0, p: { ...basePose, x: 960, y: 1060, scale: 1.55, yaw: 0, headTilt: -4, armL: { a: 26, b: 12 }, armR: { a: 26, b: 12 }, squash: 0.02 } },
    { f: 24, p: { headTilt: 6, squash: 0.03 }, ease: easeOut },
    { f: 45, p: { squash: 0.05, armL: { a: 32, b: 10 }, armR: { a: 32, b: 10 } } },
    { f: 62, p: { squash: 0.07, headTilt: 8 } },
    { f: 78, p: { squash: 0.07 } },
  ]);
  const trem = t > 40 ? Math.sin(t / 2.1) * 3 : 0;
  // one continuous radius: converges, then HOLDS short of the mouth (no radius jump at t80)
  const rr = Math.max(164, 300 - t * 2.4);
  const mouth = toWorld(pose, { x: 0, y: -176 + 46 }); // rig face center -> the mouth sits just below the head centre
  const mittenScale = 0.62 * pose.scale;
  return (
    <g transform={camT(960 + trem, kf(t, [[0, 700], [len, 692]]), kf(t, [[0, 1.55], [len, 1.72]]))}>
      {[0, 1, 2].map((i) => (
        <Rings key={i} x={950} y={660} r={rr + i * 52} t={t} seed={i * 7 + 2} n={1} />
      ))}
      {hero(pose, { expr: face.expr, blink: face.blink })}
      {/* proportional muzzle mittens from below frame, pressed on cheeks/mouth (post-rig, rig arms stay low) */}
      <g filter="url(#rimR)">
        <g transform={`translate(${mouth.x - 34} ${mouth.y + 16}) scale(${mittenScale})`}>
          <path d="M -34 96 Q -10 130 26 122 L 30 -6 Q 4 -22 -24 -14 Z" stroke={PIP.line} strokeWidth={34} fill="none" strokeLinecap="round" />
          <path d="M -34 96 Q -10 130 26 122 L 30 -6 Q 4 -22 -24 -14 Z" stroke={PIP.limb} strokeWidth={26} fill="none" strokeLinecap="round" />
        </g>
        <g transform={`translate(${mouth.x - 34} ${mouth.y + 16}) scale(${mittenScale})`}>
          <Mitten x={0} y={0} rot={30} />
        </g>
        <g transform={`translate(${mouth.x + 30} ${mouth.y + 20}) scale(${mittenScale})`}>
          <path d="M 34 100 Q 8 132 -30 124 L -30 -4 Q 0 -20 28 -12 Z" stroke={PIP.line} strokeWidth={34} fill="none" strokeLinecap="round" />
          <path d="M 34 100 Q 8 132 -30 124 L -30 -4 Q 0 -20 28 -12 Z" stroke={PIP.limb} strokeWidth={26} fill="none" strokeLinecap="round" />
          <Mitten x={0} y={0} rot={-30} />
        </g>
      </g>
      <g fill="#8FD4FF">
        <ellipse cx={838} cy={536 - Math.min(26, t * 0.6)} rx={9} ry={13} opacity={0.85} />
        <ellipse cx={1082} cy={522 - Math.min(20, t * 0.5)} rx={9} ry={13} opacity={0.85} />
      </g>
    </g>
  );
};

