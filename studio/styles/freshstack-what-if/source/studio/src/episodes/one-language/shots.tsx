import React from 'react';
import {
  Hero, Pose, basePose, poseAt, faceAt, kf, clamp, lerp, easeOut, backOut, settle, shake, rnd, camT,
  LOOKS, Look, walkPose, Study, Glow, LightVeil, Dust, Foreground, stand,
  Schematic, SCH, DrawOn, SchLabel, makeRoom, Box, RoomShell, FloorShadow, Pendant, pendantLight, WallTexture, ShotProps,
} from '../../engine';
import { FONT } from '../../engine/fonts';

// "What if everyone spoke one language" — seven vertical shots. Each is a pure function of its own clock t (frames)
// and len, drawn in the 1920 x 1080 world; the film crops a 9:16 window around x = 960, so every action, bubble and
// card stays within x 660..1260. Real facts live on schematic blueprint cards; the invented rule is stamped
// "EPISODE RULE · NOT REAL"; foreign scripts are drawn as abstract squiggles, never real text.

export const THAI = 'Chakra Petch';
const PIP = LOOKS.pipHood;
const STAR = 'M 0 -14 L 3.2 -4.4 L 13.3 -4.3 L 5.1 1.7 L 8.2 11.3 L 0 5.4 L -8.2 11.3 L -5.1 1.7 L -13.3 -4.3 L -3.2 -4.4 Z';

const actor = (look: Look, pose: Pose, face: { expr: any; blink: number }) => (
  <Hero look={look} pose={{ ...pose, ...face }} rimId="rimR" shadow={0} />
);

/** A passer-by's speech bubble in an invented script, until every bubble flips to one star glyph. */
const ScriptBubble: React.FC<{ x: number; y: number; t: number; i: number }> = ({ x, y, t, i }) => {
  if (t < 0) return null;
  const s = backOut(clamp(t / 6));
  const flip = Math.cos(clamp((t - 15) / 4) * Math.PI);
  const seed = 40 + i;
  const squiggle = `M ${-15 + rnd(seed, i) * 5} ${-3 + rnd(seed, i + 9) * 6} q 7 ${-9 + rnd(seed, i + 3) * 14} 14 0 q 7 ${7 + rnd(seed, i + 5) * 10} 14 0`;
  return (
    <g transform={`translate(${x} ${y}) scale(${s})`}>
      <path d="M -8 20 L 0 30 L 8 20 Z" fill="#F6EFE3" stroke="#121019" strokeWidth={3} strokeLinejoin="round" />
      <rect x={-32} y={-22} width={64} height={44} rx={9} fill="#F6EFE3" stroke="#121019" strokeWidth={3.5} />
      <g transform={`scale(1 ${flip <= 0 ? Math.max(-0.999, flip) : flip})`}>
        {flip > 0 ? (
          <path d={squiggle} stroke="#1D2033" strokeWidth={5} fill="none" strokeLinecap="round" transform={flip > 0 ? undefined : undefined} />
        ) : null}
      </g>
      <path d={STAR} fill="none" stroke="#3E8C5A" strokeWidth={4.5} strokeLinejoin="round" opacity={flip <= 0 ? 1 : 0} transform={`scale(${Math.abs(Math.min(1, flip))})`} />
    </g>
  );
};

/** The ONE LANGUAGE stamp: slams on at t = 0, wobbles to rest. */
const StampEn: React.FC<{ x: number; y: number; t: number }> = ({ x, y, t }) => {
  if (t < 0) return null;
  const s = 1.3 - 0.5 * easeOut(clamp(t / 5)); // host: smaller so it fits between title and bubbles
  return (
    <g transform={`translate(${x} ${y}) rotate(${-6 + settle(t - 6, 2.4, 1.2, 9)}) scale(${s})`} opacity={clamp(t / 2)}>
      <rect x={-168} y={-46} width={336} height={92} rx={16} fill="none" stroke="#FF5A4A" strokeWidth={8} />
      <rect x={-152} y={-32} width={304} height={64} rx={10} fill="none" stroke="#FF5A4A" strokeWidth={3} opacity={0.65} />
      <text y={13} textAnchor="middle" fontFamily={FONT.ui} fontSize={34} fill="#FF5A4A" letterSpacing={3}>
        ONE LANGUAGE
      </text>
    </g>
  );
};

// ---------- S1 hook: dusk, Pip's room; six strangers' scripts flip into one at 15f; the stamp lands at 20f ----------
export const S1: React.FC<ShotProps> = ({ t, len }) => {
  const sh = shake(t, 20, 12, 8);
  const pose = poseAt(t, [
    { f: 0, p: { ...basePose, x: 946, y: 716, scale: 0.98, yaw: -0.12, armL: { a: 14, b: -6 }, armR: { a: 14, b: -6 }, headTilt: 5 } },
    { f: 8, p: { armL: { a: 42, b: -28 }, armR: { a: 42, b: -28 }, squash: -0.02, headTilt: 6 } },
    { f: 15, p: { armL: { a: 172, b: -8 }, armR: { a: 172, b: -8 }, squash: -0.04, headTilt: -7 } },
    { f: 26, p: { armL: { a: 148, b: -12 }, armR: { a: 148, b: -12 }, squash: 0.025, headTilt: 2 } },
    { f: 36, p: { armL: { a: 18, b: -8 }, armR: { a: 18, b: -8 }, squash: 0, headTilt: 4 } },
    { f: len, p: { headTilt: 0, armR: { a: 26, b: -10 } } },
  ]);
  const face = faceAt(t, [[0, 'tired'], [20, 'shock'], [34, 'neutral']]);
  return (
    <g transform={camT(960 + sh.x, kf(t, [[0, 585], [20, 575], [len, 552]]) + sh.y, kf(t, [[0, 1.14], [len, 1.28]]))}>
      <Study t={t + 40} id="s1" veil={0.4} />
      {[[822, 432], [906, 426], [992, 435], [1078, 426], [818, 500], [1104, 500]].map(([bx, by], i) => (
        <ScriptBubble key={i} x={bx + Math.sin(t / 21 + i * 1.9) * 3} y={by + Math.cos(t / 25 + i) * 2.5} t={t - 2 - i * 1.6} i={i} />
      ))}
      {actor(PIP, pose, face)}
      <StampEn x={992} y={356} t={t - 20} /> {/* host: below the title, right of the foreground pillar */}
      <Foreground blur={10}>
        <rect x={716} y={-40} width={74} height={1160} fill="#120D18" opacity={0.9} />
      </Foreground>
    </g>
  );
};

// ---------- S2 ramen counter, warm lantern: Pip orders, the uncle cracks a joke, both laugh ----------
const RAMEN = makeRoom({ x: 980, y: 490 }, { x0: 560, x1: 1420, y0: 340, y1: 735 }, 3.3);
const UNCLE: Look = {
  skin: '#EFCF9F', skinShade: '#DBB183', hand: '#EFCF9F', jacket: '#4A5A6A', jacketShade: '#3A4756',
  accent: '#E9C46A', limb: '#4A4048', line: '#14121C', shoe: '#2A2622', face: '#1D2033', hair: '#3A3440',
};

const Steam: React.FC<{ x: number; y: number; t: number }> = ({ x, y, t }) => (
  <g stroke="#FFF4E4" strokeWidth={5} fill="none" strokeLinecap="round">
    {[0, 1, 2].map((i) => (
      <path
        key={i}
        d={`M ${x - 22 + i * 22} ${y} q ${6 + Math.sin(t / 6 + i * 2) * 7} ${-14 - i * 3} ${Math.sin(t / 9 + i) * 6} ${-26} q ${7 + Math.sin(t / 7 + i * 3) * 6} ${-10} ${Math.sin(t / 11 + i * 2) * 8} ${-20}`}
        opacity={0.3 + 0.25 * Math.sin(t / 8 + i * 1.6)}
      />
    ))}
  </g>
);

/** The uncle's joke lands as an icon, never words. */
const JokeBubble: React.FC<{ x: number; y: number; t: number }> = ({ x, y, t }) => {
  if (t < 0) return null;
  const s = backOut(clamp(t / 7));
  return (
    <g transform={`translate(${x + Math.sin(t / 13) * 3} ${y}) scale(${s})`}>
      <path d="M -10 26 L 0 36 L 10 26 Z" fill="#F6EFE3" stroke="#121019" strokeWidth={3.5} strokeLinejoin="round" />
      <rect x={-46} y={-34} width={92} height={64} rx={14} fill="#F6EFE3" stroke="#121019" strokeWidth={4} />
      <path d="M -26 -6 q 8 -10 16 0 M 10 -6 q 8 -10 16 0" stroke="#1D2033" strokeWidth={5} fill="none" strokeLinecap="round" />
      <path d="M -16 6 Q 0 24 16 6 Z" fill="#1D2033" />
    </g>
  );
};

export const S2: React.FC<ShotProps> = ({ t, len }) => {
  const r = RAMEN;
  const entry = t < 26;
  const u0 = stand(r, 0.34, 0.22);
  const floorY = r.P(0.55, 1, 0.66).y;
  const walk = walkPose(kf(t, [[0, 1140], [26, 1078]]), t * 0.62, floorY, 1.2, {}, -1);
  const pipPose: Pose = entry
    ? walk
    : poseAt(t, [
        { f: 26, p: { ...basePose, x: 1078, y: floorY - 140 * 1.2, scale: 1.2, yaw: -0.55, facing: -1, armL: { a: 16, b: -8 }, armR: { a: 16, b: -8 } } },
        { f: 34, p: { armR: { a: -28, b: -30 }, headTilt: -6 } },
        { f: 44, p: { armR: { a: 118, b: -14 }, headTilt: -3 } },
        { f: 58, p: { armR: { a: 112, b: -18 } } },
        { f: 76, p: { armR: { a: 14, b: -8 }, headTilt: 3 } },
        { f: 94, p: { armR: { a: 30, b: 20 }, armL: { a: 30, b: 20 }, squash: 0.03, headTilt: -7 } },
        { f: len, p: { headTilt: 5 + Math.sin(t / 4) * 4 } },
      ]);
  const unclePose = poseAt(t, [
    { f: 0, p: { ...basePose, ...u0, yaw: 0.5, facing: 1, armL: { a: 26, b: 24 } } },
    { f: 30, p: { tilt: 7, armR: { a: 66, b: 40 }, headTilt: 5 } },
    { f: 62, p: { tilt: 4, armR: { a: 30, b: 30 }, headTilt: 2 } },
    { f: 88, p: { tilt: 9, armR: { a: 34, b: 74 }, headTilt: 7, squash: 0.03 } },
    { f: len, p: { headTilt: 6 + Math.sin(t / 3.4) * 4, squash: 0.02 } },
  ]);
  const uj = { x: u0.x, y: u0.y - 176 * u0.scale };
  const sh = shake(t, 88, 8, 4);
  const fk = clamp((t - 112) / 22);
  const pend = pendantLight(r, 0.4, 0.42);
  return (
    <g transform={camT(960 + sh.x, kf(t, [[0, 560], [88, 550], [len, 542]]) + sh.y, kf(t, [[0, 1.5], [88, 1.62], [len, 1.68]]))}>
      <RoomShell r={r} id="ram" wall="#4E3A44" side="#3E2E38" floorC="#2E2328" ceiling="#241C26" />
      <WallTexture rect={[560, 340, 860, 395]} />
      {/* doorway with the three-flap curtain on the left of the back wall */}
      <polygon points={r.Q([[0.06, 0.28, 0], [0.3, 0.28, 0], [0.3, 1, 0], [0.06, 1, 0]])} fill="#2A2028" />
      <polygon points={r.Q([[0.08, 0.32, 0], [0.28, 0.32, 0], [0.28, 0.53, 0], [0.08, 0.53, 0]])} fill="#F2C08A" opacity={0.16} style={{ mixBlendMode: 'screen' }} />
      {[0, 1, 2].map((i) => {
        const x0 = r.P(0.06 + (i + 0.5) * 0.08, 0.26, 0).x;
        const y0 = r.P(0, 0.26, 0).y;
        const y1 = r.P(0, 0.66, 0).y;
        const wob = Math.sin(t / 20 + i * 2) * 4;
        return (
          <polygon key={`nf${i}`} points={`${x0 - 24},${y0} ${x0 + 24},${y0} ${x0 + 18 + wob},${y1} ${x0 - 18 + wob * 0.6},${y1}`} fill={i === 1 ? '#A83A44' : '#8E2E38'} />
        );
      })}
      {/* the menu board: rows of an invented script with dot prices */}
      <rect x={1046} y={382} width={196} height={170} fill="#221A20" />
      <rect x={1052} y={388} width={184} height={158} fill="#2E242C" />
      {[0, 1, 2, 3].map((row) => (
        <g key={`mr${row}`}>
          {[0, 1, 2].map((k) => (
            <circle key={k} cx={1108 + k * 34} cy={432 + row * 38} r={3.4} fill="#C9A46A" opacity={0.85} />
          ))}
          <path d={`M 1064 ${424 + row * 38} q 10 ${rnd(31, row * 3) * 8 - 4} 22 2 q 12 ${rnd(31, row * 3 + 1) * 8 - 3} 22 0`} stroke="#D9C8A8" strokeWidth={4} fill="none" strokeLinecap="round" />
        </g>
      ))}
      {/* shelf with jars */}
      {[0, 1, 2].map((i) => {
        const x0 = r.P(0.32 + i * 0.075, 0.36, 0.02).x;
        const y0 = r.P(0, 0.36, 0.02).y;
        const y1 = r.P(0, 0.6, 0.02).y;
        return (
          <g key={`jr${i}`}>
            <rect x={r.P(0.3, 0.6, 0.02).x} y={r.P(0, 0.6, 0.02).y} width={r.P(0.52, 0.6, 0.02).x - r.P(0.3, 0.6, 0.02).x} height={5} fill="#33261E" />
            <ellipse cx={x0} cy={y1} rx={16} ry={5} fill="#000" opacity={0.35} />
            <rect x={x0 - 14} y={y0 + 8} width={28} height={y1 - y0 - 12} rx={5} fill={['#5A7A6A', '#8A6A4A', '#6A5A7A'][i]} />
            <rect x={x0 - 6} y={y0} width={12} height={10} rx={3} fill="#3A3444" />
          </g>
        );
      })}
      {/* a hanging banner, a squiggle down its length, and the red lantern (the warm key) */}
      <rect x={966} y={352} width={44} height={250} fill="#8E2E38" />
      <path d={`M 988 372 q ${Math.sin(t / 22) * 4} 30 0 60 q ${Math.sin(t / 22 + 1) * 4} 30 0 60 q ${Math.sin(t / 22 + 2) * 4} 30 0 60`} stroke="#F2E8C8" strokeWidth={6} fill="none" strokeLinecap="round" />
      {(() => {
        const lx = 792;
        const ly = 418 + Math.sin(t / 26) * 3;
        return (
          <g>
            <path d={`M ${lx} ${340} L ${lx - 12} ${ly - 52}`} stroke="#141018" strokeWidth={3} />
            <ellipse cx={lx - 12} cy={ly} rx={38} ry={50} fill="#C2382E" />
            <path d={`M ${lx - 42} ${ly} L ${lx + 18} ${ly}`} stroke="#8E2420" strokeWidth={5} />
            <path d={`M ${lx - 28} ${ly - 33} L ${lx + 4} ${ly - 33} M ${lx - 30} ${ly} L ${lx + 6} ${ly} M ${lx - 28} ${ly + 33} L ${lx + 4} ${ly + 33}`} stroke="#8E2420" strokeWidth={3} />
            <rect x={lx - 22} y={ly - 58} width={20} height={10} rx={3} fill="#3A3020" />
            <rect x={lx - 22} y={ly + 48} width={20} height={9} rx={3} fill="#3A3020" />
          </g>
        );
      })()}
      {/* the room's contrast pass first, then its warm glows */}
      <LightVeil id="ramveil" lights={[pend, [780, 418, 320], [1120, 520, 380], [1000, 860, 420]]} o={0.42} />
      <Glow x={780} y={424} r={300} o={0.5} />
      <Dust t={t} seed={9} x0={860} y0={430} w={280} h={300} n={16} o={0.4} />
      {/* the uncle, waist-up behind the counter */}
      {actor(UNCLE, unclePose, faceAt(t, [[0, 'neutral'], [80, 'happy']]))}
      {(() => {
        const ht = unclePose.headTilt;
        return (
          <g transform={`translate(${uj.x} ${uj.y}) scale(${u0.scale}) rotate(${ht})`}>
            <path d="M -60 -34 A 62 62 0 0 1 60 -34" fill="none" stroke="#C9493A" strokeWidth={18} strokeLinecap="round" />
            <rect x={58} y={-48} width={20} height={14} rx={4} fill="#C9493A" />
            <path d="M 66 -41 q 24 -6 32 7 q -16 5 -28 2 Z" fill="#C9493A" />
          </g>
        );
      })()}
      {/* the counter, hiding his legs */}
      <FloorShadow r={r} u={[0.13, 0.87]} w={[0.3, 0.64]} />
      <Box r={r} u={[0.13, 0.87]} v={[0.6, 1]} w={[0.28, 0.62]} front="#6B4B42" side="#52392F" top="#7A5747" rim />
      {/* the bar stools */}
      {[0.4, 0.56].map((su, i) => {
        const p = r.P(su, 1, 0.74);
        const k = r.s(0.74) * 0.6;
        return (
          <g key={`st${i}`}>
            <ellipse cx={p.x} cy={p.y + 4} rx={64 * k} ry={13 * k} fill="#000" opacity={0.35} />
            <ellipse cx={p.x} cy={p.y - 200 * k} rx={62 * k} ry={15 * k} fill="#7A5747" />
            <ellipse cx={p.x} cy={p.y - 204 * k} rx={52 * k} ry={11 * k} fill="#8A6552" />
            <path d={`M ${p.x - 46 * k} ${p.y - 198 * k} L ${p.x - 54 * k} ${p.y} M ${p.x + 46 * k} ${p.y - 198 * k} L ${p.x + 54 * k} ${p.y}`} stroke="#3A2826" strokeWidth={9 * k} strokeLinecap="round" />
          </g>
        );
      })}
      {/* Pip walks in and orders in the one tongue */}
      {entry ? null : <JokeBubble x={944} y={380} t={t - 72} />}
      {actor(PIP, pipPose, faceAt(t, [[0, 'neutral'], [40, 'smug'], [90, 'happy']]))}
      {/* the bowl lands where he pointed */}
      {t >= 54 ? (
        <g>
          {(() => {
            const s = backOut(clamp((t - 54) / 6)) * (1 + 0.05 * Math.sin((t - 54) / 2.4));
            return (
              <g transform={`translate(990 634) scale(${s})`}>
                <ellipse cx={6} cy={16} rx={78} ry={11} fill="#000" opacity={0.35} />
                <path d="M -64 -26 Q -72 8 -40 16 L 40 16 Q 72 8 64 -26 Z" fill="#EFE6D2" stroke="#121019" strokeWidth={4} strokeLinejoin="round" />
                <path d="M -64 -24 L 64 -24" stroke="#C2382E" strokeWidth={9} />
                <ellipse cx={0} cy={-26} rx={62} ry={12} fill="#F2C98A" />
                <path d="M -40 -28 q 16 -8 34 -2 M -22 -24 q 20 -8 40 -1" stroke="#D9A15C" strokeWidth={3.5} fill="none" strokeLinecap="round" />
                <ellipse cx={0} cy={-26} rx={62 * (1 - clamp((t - 54) / 2))} ry={12} fill="#2A1E26" />
              </g>
            );
          })()}
          <Steam x={990} y={600} t={t - 56} />
        </g>
      ) : null}
      {/* the phrase-book is flung away for good */}
      {t > 108 ? (
        <g transform={`translate(${lerp(1036, 560, fk)} ${lerp(660, 260, easeOut(fk))}) rotate(${-160 * fk})`}>
          <rect x={-34} y={-44} width={68} height={88} rx={6} fill="#2E4A6A" />
          <rect x={-28} y={-38} width={56} height={76} rx={4} fill="#F4EEE0" />
          <path d="M -14 -10 q 10 -14 20 0 q 10 8 20 -4" stroke="#3A4A6A" strokeWidth={5} fill="none" strokeLinecap="round" />
          {fk > 0.06 ? (
            <g stroke="#FFF4E4" strokeWidth={5} strokeLinecap="round" opacity={1 - fk}>
              <path d={`M 48 -18 l ${-58 * fk} 0`} />
              <path d={`M 56 8 l ${-72 * fk} 0`} />
            </g>
          ) : null}
        </g>
      ) : null}
      <Foreground blur={6}>
        <rect x={742} y={946} width={220} height={200} rx={20} fill="#1C1218" opacity={0.8} />
      </Foreground>
    </g>
  );
};

// ---------- S3 schematic: the invented rule — one shared language, the old ones fade to grey ----------
const RuleRow: React.FC<{ y: number; t: number; ok: boolean; text: string; color: string; w: number; fade?: number; strike?: number }> = ({ y, t, ok, text, color, w, fade = 0, strike = 0 }) => {
  if (t < 0) return null;
  const s = backOut(clamp(t / 7));
  return (
    <g transform={`translate(960 ${y}) scale(${s})`} opacity={1 - 0.4 * fade}>
      <rect x={-w / 2} y={-46} width={w} height={92} rx={18} fill="#0B1424" stroke={color} strokeWidth={4} />
      {ok ? (
        <path d={`M ${-w / 2 + 28} 0 L ${-w / 2 + 48} 20 L ${-w / 2 + 84} -24`} stroke={color} strokeWidth={10} fill="none" strokeLinecap="round" strokeLinejoin="round" />
      ) : (
        <path d={`M ${-w / 2 + 28} -20 L ${-w / 2 + 72} 20 M ${-w / 2 + 72} -20 L ${-w / 2 + 28} 20`} stroke={color} strokeWidth={10} strokeLinecap="round" />
      )}
      <text x={-w / 2 + 96} y={14} fontFamily={THAI} fontWeight={600} fontSize={34} fill={SCH.line}>
        {text}
      </text>
      {strike > 0 ? <path d={`M ${-w / 2 + 96} -2 L ${-w / 2 + 96 + (w - 128) * clamp(strike)} -2`} stroke="#FF5A4A" strokeWidth={6} strokeLinecap="round" /> : null}
    </g>
  );
};
export const S3: React.FC<ShotProps> = ({ t, len }) => {
  const fade = clamp((t - 70) / 40);
  const ghosts = [0, 1, 2].map((i) => (t > 84 + i * 16 ? clamp((t - 84 - i * 16) / 22) : 0));
  const late = clamp((t - len * 0.5) / 5);
  return (
    <g transform={camT(960, 545, kf(t, [[0, 1.0], [len, 1.07]]))}>
      <Schematic t={t} id="rule" />
      <text x={960} y={252} textAnchor="middle" fontFamily={THAI} fontWeight={600} fontSize={50} fill={SCH.glow}>
        กฎข้อเดียว
      </text>
      <text x={960} y={296} textAnchor="middle" fontFamily={FONT.ui} fontSize={24} fill={SCH.dim} letterSpacing={3}>
        EPISODE RULE · NOT REAL
      </text>
      <RuleRow y={420} t={t - 6} ok text="ทุกคนพูดภาษากลางภาษาเดียว" color="#5BE08A" w={560} />
      <RuleRow y={560} t={t - 18} ok={false} text="ภาษาเดิม" color={fade > 0.5 ? '#6E7482' : '#87DBD6'} w={430} fade={fade} strike={(t - 60) / 20} />
      {ghosts.map((k, i) =>
        k > 0 ? (
          <text key={`gh${i}`} x={860 + i * 52} y={578 - k * 90} textAnchor="middle" fontFamily={THAI} fontWeight={600} fontSize={34} fill={i % 2 ? '#87DBD6' : SCH.dim} opacity={(1 - k) * 0.5}>
            ภาษาเดิม
          </text>
        ) : null,
      )}
      <text x={960} y={706} textAnchor="middle" fontFamily={THAI} fontWeight={600} fontSize={40} fill={SCH.dim} opacity={late}>
        ค่อยๆ ไม่มีใครใช้
      </text>
      <path d={`M 856 692 L 856 668`} stroke={SCH.dim} strokeWidth={4} opacity={late} />
    </g>
  );
};

// ---------- S4 schematic, a real fact: Esperanto, 1887 — a language built to be the world's second ----------
export const S4: React.FC<ShotProps> = ({ t, len }) => (
  <g transform={camT(960, 540, kf(t, [[0, 1.0], [len, 1.06]]))}>
    <Schematic t={t} id="fact" />
    <text x={960} y={216} textAnchor="middle" fontFamily={THAI} fontWeight={600} fontSize={44} fill={SCH.glow}>
      เรื่องจริง · 1887
    </text>
    <text x={960} y={268} textAnchor="middle" fontFamily={FONT.ui} fontSize={36} fill={SCH.line} letterSpacing={8} opacity={clamp(t / 4)}>
      ESPERANTO
    </text>
    <text x={960} y={318} textAnchor="middle" fontFamily={THAI} fontWeight={600} fontSize={27} fill={SCH.dim} opacity={clamp((t - 8) / 4)}>
      ภาษาสร้างขึ้นเพื่อเป็นภาษาที่สองของโลก
    </text>
    <g transform={`translate(960 452) scale(${1 + 0.08 * Math.sin(clamp((t - 66) / 10) * Math.PI)})`} opacity={clamp((t - 66) / 6)}>
      <DrawOn d={STAR} t={t - 66} dur={10} color="#5BE08A" width={5} />
      <Glow x={0} y={0} r={70} o={0.22 * clamp((t - 74) / 4)} />
    </g>
    <g transform="translate(960 700)">
      <DrawOn
        d="M -180 0 L -128 -96 L -8 -88 L -8 10 L -128 2 Z M 8 -88 L 128 -96 L 180 0 L 8 10 Z M -8 -88 L 0 -96 L 8 -88 M 0 10 L 0 -96"
        t={t - 12}
        dur={20}
        color={SCH.line}
        width={5}
        fill="#0D1626"
      />
      {[0, 1, 2].map((i) => (
        <DrawOn key={`pl${i}`} d={`M -116 ${-70 + i * 26} q 30 ${-6 - i * 2} 56 0 q 24 ${4 - i} 44 -2`} t={t - 38 - i * 7} dur={8} color={SCH.dim} width={4} />
      ))}
      {[0, 1, 2].map((i) => (
        <DrawOn key={`pr${i}`} d={`M -96 ${-64 + i * 26} q 28 ${-4 - i} 52 0 q 24 ${2 - i} 44 0`} t={t - 52 - i * 7} dur={8} color={SCH.dim} width={4} />
      ))}
      <rect x={-128} y={-104} width={120} height={12} rx={3} fill="#5BE08A" opacity={0.35 * clamp((t - 80) / 6)} />
      <rect x={8} y={-112} width={172} height={12} rx={3} fill="#5BE08A" opacity={0.0} />
    </g>
    <SchLabel x={960} y={866} t={t - 96} text="1887" size={40} color={SCH.live} />
  </g>
);

// ---------- S5 schematic: a globe of ~70 dots — 7,000+ languages, then about half dim to amber ----------
export const S5: React.FC<ShotProps> = ({ t, len }) => {
  const R = 178;
  const cy = 604;
  const dim = clamp((t - 108) / 9);
  const count = easeOut(clamp((t - 10) / 44)) * 7000;
  const num = count >= 7000 ? '7,000+' : `${Math.max(120, Math.floor(count / 10) * 10)}`;
  return (
    <g transform={camT(960, 560, kf(t, [[0, 1.0], [len, 1.05]]))}>
      <Schematic t={t} id="globe" />
      <text x={960} y={228} textAnchor="middle" fontFamily={FONT.ui} fontSize={78} fill={SCH.live} style={{ filter: `drop-shadow(0 0 16px ${SCH.glow}66)` }}>
        {num}
      </text>
      <text x={960} y={270} textAnchor="middle" fontFamily={THAI} fontWeight={600} fontSize={28} fill={SCH.line} opacity={clamp((t - 46) / 4)}>
        ภาษา · GLOTTOLOG 2026
      </text>
      <text x={960} y={856} textAnchor="middle" fontFamily={FONT.ui} fontSize={20} fill={SCH.dim} letterSpacing={2} opacity={clamp((t - 20) / 4)}>
        1 DOT = ~100 LANGUAGES
      </text>
      <g transform="rotate(-12 960 604)">
        <g opacity={clamp((t - 4) / 3)}>
          <DrawOn d={`M ${960 - R} ${cy} A ${R} ${R} 0 1 1 ${960 + R} ${cy} A ${R} ${R} 0 1 1 ${960 - R} ${cy}`} t={t - 4} dur={14} color={SCH.line} width={4} />
          <ellipse cx={960} cy={cy} rx={R} ry={R * 0.42} fill="none" stroke={SCH.grid} strokeWidth={3} />
          <ellipse cx={960} cy={cy} rx={R * 0.52} ry={R} fill="none" stroke={SCH.grid} strokeWidth={3} />
        </g>
        {Array.from({ length: 70 }).map((_, i) => {
          const a = i * 2.39996;
          const rr = R * 0.88 * Math.sqrt(rnd(21, i) * (0.35 + rnd(23, i) * 0.65));
          const cx = 960 + Math.cos(a) * rr;
          const cyy = cy + Math.sin(a) * rr;
          const on = clamp((t - 18 - i * 0.5) / 3);
          if (on <= 0) return null;
          const bad = dim > 0 && rnd(31, i) > 0.52;
          const flick = bad ? 0.75 + 0.25 * Math.sin(t / 5 + i * 2.2) : 1;
          return <circle key={i} cx={cx} cy={cyy} r={(bad ? 8 : 9.5) * on * flick} fill={bad ? '#E0A44A' : SCH.dim} opacity={bad ? 0.55 - 0.15 * dim : 0.9} />;
        })}
      </g>
      <text x={960} y={926} textAnchor="middle" fontFamily={THAI} fontWeight={600} fontSize={40} fill="#E0A44A" opacity={dim}>
        เสี่ยงหาย
      </text>
      <text x={960} y={962} textAnchor="middle" fontFamily={FONT.ui} fontSize={22} fill={SCH.dim} letterSpacing={2} opacity={dim}>
        ANU 2022 · ~50%
      </text>
    </g>
  );
};

// ---------- S6 schematic: Thailand's outline, language bubbles popping across it (north, northeast, south, west) ----------
const TH_BOX = { x0: 830, y0: 210, w: 300, h: 600 };
const thPt = (nx: number, ny: number) => ({ x: TH_BOX.x0 + nx * TH_BOX.w, y: TH_BOX.y0 + ny * TH_BOX.h });
const TH_PATH = [
  [0.1, 0.16], [0.42, 0.02], [0.66, 0.1], [0.78, 0.04], [0.92, 0.16], [0.88, 0.34], [0.74, 0.4],
  [0.86, 0.5], [0.74, 0.6], [0.62, 0.58], [0.66, 0.72], [0.6, 0.84], [0.66, 0.98], [0.58, 1.0],
  [0.54, 0.86], [0.44, 0.74], [0.34, 0.64], [0.26, 0.5], [0.14, 0.4], [0.06, 0.28],
]
  .map(([nx, ny], i) => {
    const p = thPt(nx, ny);
    return `${i ? 'L' : 'M'} ${p.x.toFixed(0)} ${p.y.toFixed(0)}`;
  })
  .join(' ') + ' Z';
export const S6: React.FC<ShotProps> = ({ t, len }) => {
  const pops = [[0.33, 0.2], [0.72, 0.3], [0.44, 0.56], [0.2, 0.44], [0.62, 0.92]];
  const late = clamp((t - 58) / 4);
  return (
    <g transform={camT(960, 560, kf(t, [[0, 1.0], [len, 1.06]]))}>
      <Schematic t={t} id="th" />
      <text x={960} y={160} textAnchor="middle" fontFamily={THAI} fontWeight={600} fontSize={36} fill={SCH.line}>
        ประเทศไทย
      </text>
      <text x={960} y={196} textAnchor="middle" fontFamily={FONT.ui} fontSize={20} fill={SCH.dim} letterSpacing={3}>
        NORTH · NORTHEAST · SOUTH · WEST
      </text>
      <DrawOn d={TH_PATH} t={t - 4} dur={18} color={SCH.line} width={5} fill="#0D1626" />
      {pops.map(([nx, ny], i) => {
        const p = thPt(nx, ny);
        const tt = t - 26 - i * 6;
        if (tt < 0) return null;
        const s = backOut(clamp(tt / 6));
        const seed = 52 + i;
        return (
          <g key={i} transform={`translate(${p.x + Math.sin((t + i * 7) / 19) * 3} ${p.y}) scale(${s})`}>
            <path d="M -7 16 L 0 24 L 7 16 Z" fill="#F6EFE3" stroke="#121019" strokeWidth={2.5} strokeLinejoin="round" />
            <rect x={-26} y={-16} width={52} height={34} rx={8} fill="#F6EFE3" stroke="#121019" strokeWidth={3} />
            <path d={`M ${-12 + rnd(seed, i) * 4} ${-2 + rnd(seed, i + 4) * 4} q 7 ${-7 + rnd(seed, i) * 10} 12 0 q 6 ${5 + rnd(seed, i + 2) * 6} 12 -2`} stroke="#1D2033" strokeWidth={3.5} fill="none" strokeLinecap="round" />
            <circle cx={18} cy={-2} r={6 + 2 * Math.sin(t / 4 + i)} fill="none" stroke={SCH.live} strokeWidth={2.5} opacity={0.8} />
          </g>
        );
      })}
      <g opacity={late}>
        <rect x={700} y={906} width={520} height={72} rx={20} fill="#0B1424" stroke={SCH.live} strokeWidth={3} />
        <text x={960} y={954} textAnchor="middle" fontFamily={THAI} fontWeight={600} fontSize={38} fill={SCH.line}>
          ราว 70 ภาษา · 5 ตระกูลภาษา
        </text>
      </g>
      <SchLabel x={960} y={1018} t={t - 40} text="PREMSRIRAT 2011" size={18} color={SCH.dim} />
    </g>
  );
};

// ---------- S7 cliffhanger, his room at dusk: the card with เกรงใจ fades letter by letter; he holds it and asks ----------
const CARD_CHARS = ['เ', 'ก', 'ร', 'ง', 'ใ', 'จ'];
export const S7: React.FC<ShotProps> = ({ t, len }) => {
  const pose = poseAt(t, [
    { f: 0, p: { ...basePose, x: 952, y: 712, scale: 0.95, yaw: -0.35, facing: -1, armR: { a: 55, b: 66 }, armL: { a: 14, b: -6 }, look: -0.25, headTilt: -4 } },
    { f: 40, p: { armR: { a: 46, b: 70 }, headTilt: -6, look: -0.3 } },
    { f: 62, p: { armR: { a: 18, b: 82 }, armL: { a: 24, b: 76 }, squash: 0.04, headTilt: 3, look: 0 } },
    { f: 112, p: { armL: { a: 30, b: 78 }, squash: 0.05, headTilt: 6 } },
    { f: 118, p: { yaw: 0.3, facing: 1, armL: { a: 34, b: 74 }, look: 0.1, headTilt: 2 } },
    { f: len, p: { squash: 0.06, headTilt: -3 } },
  ]);
  const face = faceAt(t, [[0, 'tired'], [40, 'neutral'], [66, 'worried'], [124, 'shock']]);
  const grip = pose.scale ? { x: pose.x + 6 * pose.scale, y: pose.y - 70 * pose.scale } : { x: pose.x, y: pose.y }; // host: lower so the face stays clear
  const cardRot = kf(t, [[0, -10], [60, -4], [len, -2]]) + settle(t - 64, 2.2, 1.3, 10);
  const cx = kf(t, [[0, 984], [66, 975], [len, 958]]);
  const cy = kf(t, [[0, 585], [66, 570], [len, 560]]); // host: keep card above the caption band
  const s = kf(t, [[0, 1.5], [66, 1.58], [len, 1.62]]);
  const sh = shake(t, 66, 7, 3);
  const qIn = backOut(clamp((t - 128) / 7));
  return (
    <g transform={camT(cx + sh.x, cy + sh.y, s)}>
      <Study t={t + 77} id="s7" veil={0.42} />
      {actor(PIP, pose, face)}
      {/* host: card drawn after Pip so the word stays visible */}
      <g transform={`translate(${grip.x} ${grip.y}) rotate(${cardRot}) scale(${pose.scale * 0.82})`}>
        <rect x={-96} y={-66} width={208} height={148} rx={12} fill="#000" opacity={0.3} transform="translate(8 10)" />
        <rect x={-104} y={-74} width={208} height={148} rx={12} fill="#EFE6D2" stroke="#121019" strokeWidth={4} />
        <rect x={-92} y={-62} width={184} height={124} rx={8} fill="none" stroke="#B3A78F" strokeWidth={2.5} />
        {CARD_CHARS.map((ch, i) => {
          const k = clamp((t - 66 - i * 12) / 9);
          return (
            <text key={i} x={-64 + i * 27} y={14 + k * -8} textAnchor="middle" fontFamily={THAI} fontWeight={600} fontSize={70} fill={k >= 0.5 ? '#9A907E' : '#1D2033'} opacity={k >= 0.5 ? Math.max(0, 1 - (k - 0.5) * 2) : 1}>
              {ch}
            </text>
          );
        })}
        <path d="M -62 46 q 32 8 64 0 q 34 -8 66 0" stroke="#B3A78F" strokeWidth={3} fill="none" strokeLinecap="round" opacity={clamp((180 - t) / 4)} />
      </g>
      <text
        x={1044}
        y={-140}
        textAnchor="middle"
        fontFamily={FONT.ui}
        fontSize={120}
        fill="#F6EFE3"
        stroke="#1A1230"
        strokeWidth={10}
        paintOrder="stroke"
        opacity={qIn}
        transform={`translate(1044 0) scale(${1 + 0.05 * Math.sin(t / 3)}) translate(${-1044 + 0} 0)`}
        style={{ filter: 'drop-shadow(0 0 18px rgba(246,239,227,0.35))' }}
      />
      <g transform={`translate(1044 ${560 - 160 * qIn}) scale(${1 + 0.06 * Math.sin(t / 3)})`} opacity={qIn}>
        <text textAnchor="middle" fontFamily={FONT.ui} fontSize={116} fill="#F6EFE3" stroke="#1A1230" strokeWidth={10} paintOrder="stroke" style={{ filter: 'drop-shadow(0 0 18px rgba(246,239,227,0.35))' }}>
          ?
        </text>
      </g>
      <Foreground blur={10}>
        <ellipse cx={848} cy={748} rx={118} ry={32} fill="#2A1E26" opacity={0.9} />
      </Foreground>
    </g>
  );
};
