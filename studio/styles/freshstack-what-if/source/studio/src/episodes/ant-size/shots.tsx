import React from 'react';
import {
  Hero, LOOKS, Pose, Expr, basePose, poseAt, faceAt, kf, clamp, easeOut, easeInOut, easeIn, backOut,
  camT, rnd, settle, Schematic, SCH, DrawOn, Arrow, Dust, Glow, Foreground,
  Sparkle, Mug, ShotProps,
} from '../../engine';
import { FONT } from '../../engine/fonts';

// "What if you shrank to the size of an ant?" — seven shots, each a pure function of its own clock t (frames)
// and its length. The vertical film crops the 1920 x 1080 world around x = 960, so all action stays within
// x 660..1260. Scale gag everywhere: tiny Pip (LOOKS.pipHood) beside huge everyday things.

export const THAI = 'Chakra Petch';
const PIP = LOOKS.pipHood;

const actor = (pose: Pose, face: { expr: Expr; blink: number }) => (
  <Hero look={PIP} pose={{ ...pose, ...face }} rimId="rimR" shadow={0} />
);

/** A contact shadow ellipse for something standing at (x, y). */
const Spot: React.FC<{ x: number; y: number; rx?: number; ry?: number; o?: number }> = ({ x, y, rx = 40, ry = 9, o = 0.3 }) =>
  x == null ? null : <ellipse cx={x} cy={y} rx={rx} ry={ry} fill="#000" opacity={o} />;

// ---------- S1 hook: Pip wakes in bed, a pop shrinks him, the camera crash-zooms to the pillow hill ----------
export const S1: React.FC<ShotProps> = ({ t, len }) => {
  const pose = poseAt(t, [
    { f: 0, p: { ...basePose, x: 856, y: 848, yaw: 0.25, armL: { a: 118, b: 96 }, armR: { a: 118, b: 96 }, legL: { a: 76, b: -80 }, legR: { a: 66, b: -74 } } },
    { f: 5, p: { armL: { a: 158, b: 14 }, armR: { a: 158, b: 14 }, headTilt: -6 } }, // stretch awake
    { f: 11, p: { armL: { a: 36, b: -12 }, armR: { a: 36, b: -12 }, headTilt: 0 } },
    { f: 14, p: { x: 958, y: 830, scale: 0.05, armL: { a: 150, b: 18 }, armR: { a: 150, b: 18 }, legL: { a: 2, b: 0 }, legR: { a: -2, b: 0 } }, ease: easeIn }, // the pop
    { f: 27, p: { x: 960, y: 816, scale: 0.078, squash: 0.09, armL: { a: 168, b: 10 }, armR: { a: 168, b: 10 }, headTilt: -5 } }, // lands on the pillow hill
    { f: 35, p: { squash: 0, armL: { a: 168, b: 10 }, armR: { a: 168, b: 10 }, headTilt: -5 } }, // arms up, mouth open
    { f: 66, p: { yaw: 0.8, armL: { a: 24, b: 14 }, armR: { a: 168, b: 10 }, look: 0.8, headTilt: 0 } }, // looks over the dunes, right
    { f: 88, p: { yaw: -0.8, armL: { a: 168, b: 10 }, armR: { a: 24, b: 14 }, look: -0.8, headTilt: 4 } }, // and left
    { f: len, p: {} },
  ]);
  const face = faceAt(t, [[0, 'tired'], [3, 'happy'], [12, 'shock'], [40, 'worried'], [70, 'shock']]);
  const sh = t >= 12 && t < 24 ? { x: Math.sin(t * 2.9) * 11 * (1 - (t - 12) / 12), y: Math.cos(t * 3.7) * 7 * (1 - (t - 12) / 12) } : { x: 0, y: 0 };
  const cx = kf(t, [[0, 872], [12, 852], [20, 902], [36, 957], [len, 957]]) + sh.x;
  const cy = kf(t, [[0, 792], [12, 772], [22, 782], [38, 788], [len, 784]]) + sh.y;
  const z = kf(t, [[0, 1.05], [12, 1.1], [22, 1.4], [36, 2.5], [len, 2.75]]);
  const pk = clamp((t - 12) / 12); // pop ripple
  return (
    <g transform={camT(cx, cy, z)}>
      {/* the bedroom in soft morning light */}
      <rect x={-400} y={-200} width={2720} height={1120} fill="#6E545B" />
      <rect x={-400} y={820} width={2720} height={280} fill="#5A444E" />
      {/* the window with the morning sun in it */}
      <rect x={1080} y={128} width={430} height={432} fill="#57474F" />
      <rect x={1102} y={150} width={386} height={388} fill="#F3CE96" />
      <circle cx={1408} cy={268} r={86} fill="#FFF3D6" />
      <rect x={1290} y={150} width={10} height={388} fill="#57474F" />
      <Glow x={1295} y={330} r={430} o={0.42} />
      {/* headboard, bed, duvet */}
      <rect x={470} y={636} width={960} height={272} rx={22} fill="#4E3A46" />
      {[0, 1, 2, 3, 4, 5].map((i) => (
        <rect key={`sl${i}`} x={506 + i * 158} y={668} width={54} height={196} rx={10} fill="#5E4652" />
      ))}
      <rect x={420} y={896} width={1100} height={70} rx={8} fill="#B4A88E" />
      {/* the three giant blanket dunes the pillow sits among */}
      <path d="M 560 974 Q 690 850 850 972 Q 940 1030 1040 986 Q 1180 906 1320 990 Q 1400 1036 1480 1010 L 1480 1090 L 540 1090 Z" fill="#DCD2BA" />
      <path d="M 600 980 Q 700 886 830 976" stroke="#C7BCA2" strokeWidth={7} fill="none" />
      <path d="M 1120 928 Q 1200 920 1280 986" stroke="#C7BCA2" strokeWidth={7} fill="none" />
      {/* the pillow hill Pip lands on */}
      <Spot x={960} y={902} rx={250} ry={22} o={0.25} />
      <path d="M 706 902 Q 786 830 960 826 Q 1134 830 1214 902 Q 1100 920 960 916 Q 820 920 706 902 Z" fill="#EAE1CB" />
      <path d="M 812 866 Q 960 850 1108 866" stroke="#D3C9B1" strokeWidth={6} fill="none" />
      <path d="M 870 892 Q 960 882 1050 892" stroke="#D3C9B1" strokeWidth={5} fill="none" />
      {actor(pose, face)}
      <Spot x={960} y={838} rx={22} ry={5} o={0.28} />
      {/* the duvet fold in front, huge */}
      <path d="M 620 1002 Q 760 946 940 976 Q 1120 1006 1264 962 Q 1340 942 1420 966 L 1420 1100 L 600 1100 Z" fill="#E4DBC5" />
      <path d="M 700 1000 Q 900 968 1140 986" stroke="#CDC2A8" strokeWidth={8} fill="none" />
      {/* the pop itself: a ripple and little lines */}
      {t >= 12 && t < 30 ? (
        <g opacity={1 - pk}>
          <circle cx={958} cy={830} r={16 + 70 * pk} fill="none" stroke="#FFF3DC" strokeWidth={7 * (1 - pk * 0.6)} />
          {[0, 60, 120, 180, 240, 300].map((a, i) => {
            const r = (a * Math.PI) / 180;
            return <path key={i} d={`M ${958 + Math.cos(r) * (10 + 26 * pk)} ${830 + Math.sin(r) * (10 + 26 * pk)} L ${958 + Math.cos(r) * (44 + 40 * pk)} ${830 + Math.sin(r) * (44 + 40 * pk)}`} stroke="#FFF3DC" strokeWidth={6} strokeLinecap="round" />;
          })}
        </g>
      ) : null}
      <Dust t={t} seed={31} x0={1080} y0={340} w={380} h={420} n={16} o={0.4} />
      <Foreground blur={8}>
        <path d="M 620 1088 Q 820 1036 1040 1072 Q 1240 1100 1400 1064 L 1440 1120 L 600 1120 Z" fill="#3A3040" />
      </Foreground>
    </g>
  );
};

// ---------- S2 worm's-eye floor: the house cat becomes a tower, its paw lands beside Pip ----------
export const S2: React.FC<ShotProps> = ({ t, len }) => {
  // the paw drops with accelerating weight, lands at 26 with a settle
  const fall = Math.pow(clamp((t - 2) / 24), 3);
  const pawY = -910 * (1 - fall) + (t > 26 ? settle(t - 26, 6, 1.7, 7) : 0);
  const pip = poseAt(t, [
    { f: 0, p: { ...basePose, x: 776, y: 928, scale: 0.085, yaw: 0.85, facing: 1, armL: { a: 16, b: -8 }, armR: { a: 16, b: -8 }, headTilt: 4 } },
    { f: 22, p: { armL: { a: 60, b: 30 }, headTilt: -2 } }, // checks the sound above
    { f: 28, p: { x: 742, y: 926, squash: 0.12, armL: { a: 165, b: 12 }, armR: { a: 165, b: 12 }, headTilt: -4 } }, // hop back at the thump
    { f: 34, p: { squash: 0, yaw: 0.85, facing: -1, armL: { a: 170, b: 8 }, armR: { a: 170, b: 8 } } },
    { f: 58, p: { x: 722, y: 924, legL: { a: 26, b: -40 }, legR: { a: -18, b: 0 } } }, // step back one
    { f: 62, p: { legL: { a: 0, b: -10 }, legR: { a: 22, b: -44 } } },
    { f: 92, p: { x: 700, y: 922, legL: { a: 20, b: -34 }, legR: { a: -14, b: 0 }, armL: { a: 168, b: 10 }, armR: { a: 168, b: 10 } } },
    { f: len, p: {} },
  ]);
  const face = faceAt(t, [[0, 'neutral'], [20, 'worried'], [26, 'shock'], [64, 'shock']]);
  const tilt = easeInOut(clamp((t - 30) / 34)); // the camera tilts up the giant
  const sh = t >= 26 && t < 38 ? { x: Math.sin(t * 3.1) * 14 * (1 - (t - 26) / 12), y: Math.sin(t * 4.3) * 9 * (1 - (t - 26) / 12) } : { x: 0, y: 0 };
  const cx = (kf(t, [[0, 880], [30, 880], [64, 1050], [len, 1050]]) + sh.x);
  const cy = (kf(t, [[0, 850], [30, 850], [64, 512], [len, 500]]) + sh.y);
  const z = kf(t, [[0, 1.18], [30, 1.18], [64, 0.98], [len, 1.04]]);
  const ring = clamp((t - 26) / 14); // impact dust
  const tw = clamp((t - 64) / 22); // the ghost tower draws on
  return (
    <g transform={camT(cx, cy, z)}>
      {/* the dark room at floor level */}
      <rect x={-400} y={-400} width={2720} height={1300} fill="#2A2330" />
      <rect x={-400} y={880} width={2720} height={320} fill="#3E3038" />
      {[-200, 60, 320, 580, 840, 1100, 1360, 1620, 1880, 2140].map((x, i) => (
        <path key={`pl${i}`} d={`M ${x + 30} 880 L ${x} 1080`} stroke="#332832" strokeWidth={5} fill="none" />
      ))}
      {/* a bookcaseful of shelves looming behind, dark */}
      {[0, 1, 2].map((i) => (
        <g key={`bc${i}`}>
          <rect x={1216 + 0} y={430 + i * 130} width={300} height={100} fill="#241C28" />
          <rect x={1216} y={430 + i * 130} width={300} height={100} fill="none" stroke="#1E1720" strokeWidth={6} />
        </g>
      ))}
      <Glow x={730} y={905} r={200} o={0.16} kind="warm" />
      {/* the giant cat: body, head, then the paw */}
      <g>
        <path d="M 940 470 Q 1030 430 1160 470 L 1205 880 L 900 880 Z" fill="#C06A30" />
        <circle cx={1030} cy={170} r={470} fill="#E8853E" />
        <path d="M 1290 -180 L 1330 70 L 1130 -40 Z" fill="#D97536" />
        <path d="M 660 -220 L 720 90 L 900 -60 Z" fill="#E8853E" />
        {[0, 1, 2].map((i) => (
          <path key={`st${i}`} d={`M ${930 + i * 80} -300 Q ${950 + i * 80} -200 ${960 + i * 80} -140`} stroke="#B85B28" strokeWidth={22} fill="none" strokeLinecap="round" />
        ))}
        {/* eyes with slit pupils, a nose, a mouth, whiskers */}
        {[-165, 165].map((exd, i) => (
          <g key={`eye${i}`}>
            <ellipse cx={1030 + exd} cy={230} rx={112} ry={86} fill="#D9E39A" />
            <ellipse cx={1030 + exd} cy={230} rx={16 + 4 * Math.sin(t / 9 + i)} ry={64} fill="#22301E" />
          </g>
        ))}
        <path d="M 1004 372 L 1056 372 L 1030 404 Z" fill="#E8A0A8" />
        <path d="M 1030 404 Q 1000 440 962 428 M 1030 404 Q 1060 440 1098 428" stroke="#8A4A22" strokeWidth={10} fill="none" strokeLinecap="round" />
        {[-1, 1].map((w) => [0, 1, 2].map((k) => (
          <path key={`wh${w}${k}`} d={`M ${1030 + w * 60} ${392 + k * 18} Q ${1030 + w * 300} ${370 + k * 40} ${1030 + w * 520} ${300 + k * 70}`} stroke="#F6EFE3" strokeWidth={9} fill="none" strokeLinecap="round" opacity={0.85} />
        )))}
      </g>
      {/* the paw: anticipation high, it slams the floor */}
      <g transform={`translate(0 ${pawY})`}>
        <Spot x={1020} y={886} rx={300} ry={26} o={0.35 * fall} />
        <ellipse cx={1020} cy={830} rx={238} ry={82} fill="#E8853E" />
        <ellipse cx={1020} cy={830} rx={238} ry={82} fill="none" stroke="#B85B28" strokeWidth={7} />
        {[[900, 896], [1024, 902], [1148, 896]].map(([tx, ty], i) => (
          <circle key={`to${i}`} cx={tx} cy={ty - 10} r={44} fill="#F29A56" stroke="#B85B28" strokeWidth={6} />
        ))}
      </g>
      {/* impact dust */}
      {t >= 26 && t < 44 ? (
        <g opacity={1 - ring} stroke="#F6EFE3" strokeWidth={6} fill="none" strokeLinecap="round">
          <path d={`M ${1020 - 120 * ring} 880 Q ${1020 - 200 * ring} 850 ${1020 - 250 * ring} 820`} />
          <path d={`M ${1020 + 120 * ring} 880 Q ${1020 + 200 * ring} 850 ${1020 + 250 * ring} 820`} />
          <path d={`M ${1020 - 60 * ring} 900 Q ${1020} 916 ${1020 + 60 * ring} 900`} />
        </g>
      ) : null}
      {actor(pip, face)}
      <Spot x={776 - (t > 58 ? 66 : 0)} y={941} rx={20} ry={5} o={0.3} />
      {/* the ghost of a 40-storey tower for scale */}
      {t >= 64 ? (
        <g opacity={0.1 + 0.5 * tw}>
          <rect x={1152} y={880 - 810 * tw} width={104} height={810 * tw} fill="none" stroke="#87DBD6" strokeWidth={5} strokeDasharray="16 10" />
          {Array.from({ length: 39 }).map((_, i) => (i / 39 < tw ? <path key={`fl${i}`} d={`M 1152 ${875 - (i + 1) * 20.3} L 1256 ${875 - (i + 1) * 20.3}`} stroke="#87DBD6" strokeWidth={3} opacity={0.65} /> : null))}
          <text x={1234} y={62} textAnchor="end" fontFamily={THAI} fontWeight={600} fontSize={44} fill="#87DBD6" opacity={tw}>
            ~125 ม.
          </text>
        </g>
      ) : null}
      <Foreground blur={10}>
        <path d="M 620 1010 Q 900 970 1280 1006 L 1300 1120 L 600 1120 Z" fill="#241C26" />
      </Foreground>
    </g>
  );
};

// ---------- S3 schematic rule card: the episode's one made-up rule, marked NOT REAL ----------
const RuleRow: React.FC<{ y: number; t: number; text: string; color: string }> = ({ y, t, text, color }) => {
  if (t < 0) return null;
  const s = backOut(clamp(t / 7));
  return (
    <g transform={`translate(960 ${y}) scale(${s})`}>
      <rect x={-270} y={-46} width={540} height={92} rx={18} fill="#0B1424" stroke={color} strokeWidth={4} />
      <path d="M -230 4 L -204 30 L -158 -28" stroke={color} strokeWidth={10} fill="none" strokeLinecap="round" strokeLinejoin="round" />
      <text x={20} y={16} textAnchor="middle" fontFamily={THAI} fontWeight={600} fontSize={46} fill={SCH.line}>
        {text}
      </text>
    </g>
  );
};
export const S3: React.FC<ShotProps> = ({ t, len }) => {
  const human = clamp((t - 10) / 10);
  const ant = clamp((t - 22) / 10);
  const arrow = easeOut(clamp((t - 30) / 12));
  return (
    <g transform={camT(960, 545, kf(t, [[0, 1.0], [len, 1.05]]))}>
      <Schematic t={t} id="rule" />
      <text x={960} y={252} textAnchor="middle" fontFamily={THAI} fontWeight={600} fontSize={56} fill={SCH.glow}>
        กฎข้อเดียว
      </text>
      <text x={960} y={298} textAnchor="middle" fontFamily={FONT.ui} fontSize={26} fill={SCH.dim} letterSpacing={3}>
        EPISODE RULE · NOT REAL
      </text>
      {/* the shrink: a person becomes an ant-sized one */}
      {human > 0 ? (
        <g stroke={SCH.line} strokeWidth={6} fill="none" strokeLinecap="round" transform={`translate(748 ${502 - (1 - human) * 30})`}>
          <circle cx={0} cy={-58} r={20} fill={SCH.line} opacity={human} />
          <path d="M 0 -38 L 0 6 M 0 -26 L -22 -4 M 0 -26 L 22 -4 M 0 6 L -20 42 M 0 6 L 20 42" opacity={human} />
        </g>
      ) : null}
      {ant > 0 ? (
        <g stroke={SCH.glow} strokeWidth={4} fill="none" strokeLinecap="round" transform={`translate(1150 ${496 - (1 - ant) * 40})`}>
          <ellipse cx={-16} cy={0} rx={10} ry={8} opacity={ant} fill={SCH.glow} />
          <ellipse cx={0} cy={-2} rx={7} ry={6} opacity={ant} />
          <ellipse cx={12} cy={-3} rx={6} ry={5} opacity={ant} />
          {[-6, 2, 10].map((lx, i) => (
            <path key={`lg${i}`} d={`M ${lx} 2 L ${lx - 4} 12 M ${lx} 2 L ${lx + 5} 12`} opacity={ant} />
          ))}
          <path d="M 16 -7 L 22 -16 M 19 -6 L 26 -13" opacity={ant} />
        </g>
      ) : null}
      {arrow > 0 ? (
        <g opacity={arrow}>
          <Arrow x0={830} y0={498} x1={1082} y1={498} t={t - 30} dur={10} color={SCH.dim} bend={0.14} />
          <text x={958} y={470} textAnchor="middle" fontFamily={FONT.ui} fontSize={38} fill={SCH.live} opacity={easeOut(clamp((t - 40) / 6))} style={{ filter: `drop-shadow(0 0 12px ${SCH.glow}66)` }}>
            ×500
          </text>
        </g>
      ) : null}
      <text x={748} y={560} textAnchor="middle" fontFamily={THAI} fontWeight={600} fontSize={30} fill={SCH.dim} opacity={human}>
        1.7 ม.
      </text>
      <text x={1150} y={560} textAnchor="middle" fontFamily={THAI} fontWeight={600} fontSize={30} fill={SCH.dim} opacity={ant}>
        3.4 มม.
      </text>
      <RuleRow y={666} t={t - 6} text="เล็กลง 500 เท่า" color="#FFB15A" />
      <RuleRow y={800} t={t - 104} text="คนเดิม ร่างเดิม" color="#87DBD6" />
    </g>
  );
};

// ---------- S4 desk edge: Pip slips, falls slowly past a huge pencil and a mug, lands unharmed ----------
export const S4: React.FC<ShotProps> = ({ t, len }) => {
  // hips: standing on the desk top (548), over the edge at 30, a long slow fall, a squashy landing on the rug
  const pipX = kf(t, [[0, 690], [16, 724], [30, 748], [len, 760]]);
  const pose = poseAt(t, [
    { f: 0, p: { x: pipX, y: 535, scale: 0.095, yaw: 1, facing: 1, armL: { a: 26, b: -10 }, armR: { a: 26, b: -10 } } },
    { f: 18, p: { tilt: -12, armL: { a: 96, b: 30 }, armR: { a: 120, b: 40 } } }, // the slip: lean, windmill
    { f: 26, p: { tilt: -26, armL: { a: 178, b: 30 }, armR: { a: 40, b: 34 }, legL: { a: 50, b: -20 } } },
    { f: 36, p: { y: 610, tilt: 8, spin: 12, armL: { a: 150, b: 26 }, armR: { a: -30, b: 26 }, legL: { a: 34, b: -26 }, legR: { a: -6, b: -14 } }, ease: easeIn }, // over the edge, flailing
    { f: 58, p: { y: 790, spin: -8, armL: { a: 60, b: 26 }, armR: { a: 176, b: 26 }, headTilt: 6 }, ease: easeIn },
    { f: 74, p: { y: 962, spin: 0, tilt: 0, armL: { a: 150, b: 24 }, armR: { a: 150, b: 24 }, legL: { a: 30, b: -30 }, legR: { a: -8, b: -12 } }, ease: easeIn },
    { f: 78, p: { x: 730, y: 978, squash: 0.2 } }, // hits the rug
    { f: 88, p: { squash: 0, y: 976, armL: { a: 24, b: -10 }, armR: { a: 160, b: 70 }, headTilt: -10 } }, // dusts himself off
    { f: 100, p: { armR: { a: 168, b: 20 }, headTilt: 0, handR: 'point' } }, // thumbs-up
    { f: len, p: {} },
  ]);
  const face = faceAt(t, [[0, 'neutral'], [16, 'shock'], [40, 'worried'], [80, 'dizzy'], [92, 'oops'], [100, 'cool']]);
  const camY = kf(t, [[0, 510], [26, 512], [40, 640], [76, 916], [len, 912]]);
  const camZ = kf(t, [[0, 1.2], [30, 1.35], [76, 1.55], [len, 1.6]]);
  const puff = clamp((t - 78) / 16);
  return (
    <g transform={camT(kf(t, [[0, 850], [len, 900]]), camY, camZ)}>
      {/* the wall behind, then the desk slab with its edge */}
      <rect x={-400} y={-200} width={2720} height={1260} fill="#5A4850" />
      <rect x={-400} y={300} width={2200} height={60} fill="#6A564E" opacity={0.5} />
      <Spot x={726} y={1024} rx={360} ry={26} o={0.3} />
      <rect x={-300} y={548} width={1010} height={34} rx={8} fill="#8A6A50" />
      <rect x={-300} y={582} width={1010} height={16} fill="#6E5240" />
      <rect x={664} y={582} width={44} height={440} fill="#6E5240" />
      <rect x={664} y={582} width={16} height={440} fill="#5A4438" />
      {/* a drawer front on the desk edge */}
      <rect x={440} y={620} width={200} height={120} rx={10} fill="#7A5A44" />
      <circle cx={614} cy={684} r={9} fill="#C9A46A" />
      {/* the giant mug on the desk, steaming */}
      <g transform={`translate(880 548) scale(3.2)`}>
        <Mug x={0} y={0} rot={0} steam={1} f={t} />
      </g>
      {/* the giant pencil leaning on the side, eraser down, tip up */}
      <g>
        <Spot x={1092} y={1022} rx={90} ry={12} o={0.3} />
        <rect x={1044} y={264} width={96} height={740} rx={8} fill="#E8B84B" />
        <rect x={1044} y={264} width={20} height={740} fill="#C89A38" />
        <rect x={1120} y={264} width={20} height={740} fill="#F2C463" />
        <rect x={1040} y={196} width={104} height={74} rx={10} fill="#E89AA0" />
        <rect x={1038} y={252} width={108} height={18} fill="#9AA0AA" />
        <path d="M 1092 196 L 1064 92 L 1120 92 Z" fill="#D8CCB0" />
        <path d="M 1092 196 L 1092 92" stroke="#2E2B3D" strokeWidth={16} strokeLinecap="round" />
        <path d="M 1092 92 L 1064 92 L 1078 140 Z" fill="#2E2B3D" />
      </g>
      {/* the floor and the rug */}
      <rect x={-400} y={1020} width={2720} height={200} fill="#3A2E36" />
      <ellipse cx={840} cy={1036} rx={330} ry={52} fill="#4A3C50" />
      <ellipse cx={840} cy={1036} rx={286} ry={40} fill="none" stroke="#5C4C64" strokeWidth={8} />
      {actor(pose, face)}
      <Spot x={t < 30 ? pipX + 10 : 730} y={t < 30 ? 552 : 992} rx={26} ry={6} o={0.3} />
      {/* the tiny pof of landing dust */}
      {t >= 78 && t < 96 ? (
        <g opacity={1 - puff} stroke="#F6EFE3" strokeWidth={5} fill="none" strokeLinecap="round">
          <path d={`M ${730 - 60 * puff} 1002 Q ${730 - 110 * puff} 978 ${730 - 140 * puff} 952`} />
          <path d={`M ${730 + 60 * puff} 1002 Q ${730 + 110 * puff} 978 ${730 + 140 * puff} 952`} />
        </g>
      ) : null}
      {t >= 100 && t < 118 ? <Sparkle x={776} y={806} t={t - 100} s={0.8} /> : null}
      <Dust t={t} seed={44} x0={200} y0={340} w={360} h={380} n={12} o={0.3} />
    </g>
  );
};

// ---------- S5 schematic, real physics: square-cube, weight sheds faster than drag area ----------
// Layout lives inside x 690..1230 and above world y ~760: the formula sits under the subtitle, the big cube
// stands left, the drifting small cube right with its two ratios stacked under it, arrows flanking.
export const S5: React.FC<ShotProps> = ({ t, len }) => {
  const drift = t > 60 ? Math.sin(t / 4) * 10 : 0;
  const bob = t > 60 ? Math.sin(t / 3.2) * 12 : 0;
  const fIn = clamp((t - 12) / 8);
  return (
    <g transform={camT(960, 560, kf(t, [[0, 1.0], [len, 1.06]]))}>
      <Schematic t={t} id="phys" />
      <text x={960} y={198} textAnchor="middle" fontFamily={THAI} fontWeight={600} fontSize={42} fill={SCH.line}>
        ฟิสิกส์จริง
      </text>
      <text x={960} y={238} textAnchor="middle" fontFamily={FONT.ui} fontSize={22} fill={SCH.dim} letterSpacing={3}>
        SQUARE–CUBE LAW
      </text>
      {/* the terminal-speed formula, straight from the book — small, under the subtitle, inside the window */}
      <text x={960} y={284} textAnchor="middle" fontFamily={FONT.ui} fontSize={29} fill={SCH.glow} opacity={fIn} style={{ filter: `drop-shadow(0 0 10px ${SCH.glow}55)` }}>
        v<tspan dy={7} fontSize={20}>T</tspan><tspan dy={-7}> = √( 2mg / ρCA )</tspan>
      </text>
      {/* the base line */}
      <path d="M 694 700 L 1226 700" stroke={SCH.dim} strokeWidth={4} strokeDasharray="14 10" opacity={fIn} />
      {/* the big cube: your body today */}
      <g transform={`translate(800 556)`}>
        <DrawOn d="M -100 -135 L 100 -135 L 100 135 L -100 135 Z" t={t - 6} dur={12} color={SCH.line} width={6} fill="#0B1424" />
        <path d="M -100 -135 L 100 135" stroke={SCH.dim} strokeWidth={2.5} opacity={0.5} />
      </g>
      <text x={800} y={736} textAnchor="middle" fontFamily={THAI} fontWeight={600} fontSize={30} fill={SCH.dim} opacity={clamp((t - 20) / 5)}>
        ตัวคุณ
      </text>
      {/* the small cube: a side ×1/10 lighter and lighter, too light to sit still */}
      <g transform={`translate(${1105 + drift} ${468 - bob})`}>
        <DrawOn d="M -30 -30 L 30 -30 L 30 30 L -30 30 Z" t={t - 24} dur={10} color={SCH.line} width={4} fill="#0B1424" />
        <path d="M -30 -30 L 30 30" stroke={SCH.dim} strokeWidth={2} opacity={0.5} />
      </g>
      <text x={1105} y={414} textAnchor="middle" fontFamily={FONT.ui} fontSize={34} fill={SCH.live} opacity={clamp((t - 30) / 6)} style={{ filter: `drop-shadow(0 0 12px ${SCH.glow}55)` }}>
        ×1/10
      </text>
      {/* the two ratios stacked under the small cube, the down/up arrows flanking them */}
      <Arrow x0={890} y0={542} x1={890} y1={608} t={t - 52} dur={9} color="#FFB15A" bend={0} />
      <Arrow x0={1220} y0={686} x1={1220} y1={606} t={t - 72} dur={9} color="#87DBD6" bend={0} />
      <text x={1062} y={596} textAnchor="middle" fontFamily={THAI} fontWeight={600} fontSize={30} fill="#FFB15A" opacity={clamp((t - 52) / 6)}>
        น้ำหนัก ÷1,000
      </text>
      <text x={1062} y={652} textAnchor="middle" fontFamily={THAI} fontWeight={600} fontSize={30} fill="#87DBD6" opacity={clamp((t - 72) / 6)}>
        พื้นผิว ÷100
      </text>
    </g>
  );
};

// ---------- S6 schematic, real data: a mouse down a ~900 m mine shaft, Haldane 1926 ----------
const Mouse: React.FC<{ x: number; y: number; s?: number; walk?: number; flip?: number }> = ({ x, y, s = 1, walk = 0, flip = 1 }) => {
  const w = Math.sin(walk * 0.9);
  return (
    <g transform={`translate(${x} ${y}) scale(${flip * s} ${s})`} stroke={SCH.line} strokeWidth={4} fill="none" strokeLinecap="round" strokeLinejoin="round">
      <ellipse cx={-4} cy={-14} rx={26} ry={15} fill={SCH.ground} />
      <circle cx={20} cy={-22} r={11} fill={SCH.ground} />
      <circle cx={14} cy={-34} r={7} />
      <path d="M 26 -20 L 34 -18" strokeWidth={3} />
      <path d="M 28 -16 L 40 -14 M 28 -12 L 40 -10" strokeWidth={2.5} />
      <path d="M -28 -12 Q -46 -6 -52 -20" strokeWidth={3} />
      <path d={`M -14 1 L ${-14 + w * 5} 10 M 6 1 L ${6 - w * 5} 10`} />
      <circle cx={22} cy={-24} r={2.5} fill={SCH.line} stroke="none" />
    </g>
  );
};
export const S6: React.FC<ShotProps> = ({ t, len }) => {
  // the mouse drifts down the shaft slowly (small => slow), lands on the pad at 195, then walks off
  const drop = easeInOut(clamp((t - 112) / 83));
  const my = 318 + drop * 544 + (t > 195 ? settle(t - 195, 4, 2, 6) : 0);
  const squash = t > 195 && t < 203 ? 0.25 * (1 - (t - 195) / 8) : 0;
  const walk = t > 208 ? easeOut(clamp((t - 208) / 56)) : 0;
  const mx = 962 + walk * 148;
  const rulerY = (m: number) => 880 - (m / 914) * 618; // 0 m at the pad, 914 m at the mouth
  return (
    <g transform={camT(960, 600, kf(t, [[0, 0.8], [len, 0.83]]))}> {/* host: pulled back so the shaft floor clears the caption band */}
      <Schematic t={t} id="shaft" />
      <text x={960} y={196} textAnchor="middle" fontFamily={THAI} fontWeight={600} fontSize={44} fill={SCH.line}>
        หนูกับบ่อเหมืองลึก
      </text>
      {/* small enough to sit fully inside the visible window */}
      <text x={960} y={236} textAnchor="middle" fontFamily={FONT.ui} fontSize={20} fill={SCH.dim} letterSpacing={1.5}>
        HALDANE, 1926 · 1,000 YD ≈ 914 M
      </text>
      {/* the shaft: two walls with rungs, a depth ruler beside it */}
      <DrawOn d="M 900 262 L 900 880" t={t - 4} dur={16} color={SCH.line} width={6} />
      <DrawOn d="M 1024 262 L 1024 880" t={t - 8} dur={16} color={SCH.line} width={6} />
      {Array.from({ length: 12 }).map((_, i) => (i / 12 < clamp((t - 14) / 16) ? <path key={`rg${i}`} d={`M 900 ${262 + 50 + i * 48} L 1024 ${262 + 50 + i * 48}`} stroke={SCH.dim} strokeWidth={4} opacity={0.7} /> : null))}
      <path d={`M 830 262 L 830 880`} stroke={SCH.dim} strokeWidth={3} strokeDasharray="10 8" />
      {[0, 200, 400, 600, 800, 914].map((m, i) => (
        <g key={`tk${i}`} opacity={clamp((t - 26) / 5)}>
          <path d={`M 824 ${rulerY(m)} L 836 ${rulerY(m)}`} stroke={SCH.dim} strokeWidth={3} />
          <text x={818} y={rulerY(m) + 8} textAnchor="end" fontFamily={FONT.ui} fontSize={20} fill={SCH.dim}>{m === 914 ? '914' : m}</text>
        </g>
      ))}
      {/* the depth readout, beside the ruler at mid-height, clear of the subtitle */}
      <text x={818} y={573} textAnchor="end" fontFamily={FONT.ui} fontSize={26} fill={SCH.live} opacity={clamp((t - 36) / 6)} style={{ filter: `drop-shadow(0 0 10px ${SCH.glow}55)` }}>
        ~914 ม.
      </text>
      <text x={962} y={292} textAnchor="middle" fontFamily={FONT.ui} fontSize={20} fill={SCH.dim} opacity={clamp((t - 30) / 5)}>
        SHAFT MOUTH
      </text>
      {/* the mine floor and a soft sand pad */}
      <path d="M 830 880 L 1240 880" stroke={SCH.line} strokeWidth={5} />
      <path d="M 880 880 Q 962 848 1080 880 Z" fill="#6B5426" opacity={0.85} stroke="#C9A44A" strokeWidth={3} />
      <text x={1150} y={720} textAnchor="middle" fontFamily={THAI} fontWeight={600} fontSize={34} fill="#87DBD6" opacity={clamp((t - 226) / 6)}> {/* host: beside the shaft, off the ladder */}
        ถ้าพื้นนุ่มพอ ✓
      </text>
      {/* the mouse: down (slow), the tiny squash, then it walks away */}
      <Mouse x={mx} y={my - squash * 10 + squash * 4} s={1 - squash * 0.3} walk={t > 208 ? (t - 208) : 0} />
      {t >= 193 && t < 212 ? (
        <g opacity={clamp((212 - t) / 10)} stroke="#F6EFE3" strokeWidth={4} fill="none" strokeLinecap="round">
          <path d={`M ${962 - 40} ${884 - 8 * clamp((t - 195) / 17)} Q ${962 - 70} ${876 - 14 * clamp((t - 195) / 17)} ${962 - 92} ${868 - 18 * clamp((t - 195) / 17)}`} />
          <path d={`M ${962 + 40} ${884 - 8 * clamp((t - 195) / 17)} Q ${962 + 70} ${876 - 14 * clamp((t - 195) / 17)} ${962 + 92} ${868 - 18 * clamp((t - 195) / 17)}`} />
        </g>
      ) : null}
    </g>
  );
};

// ---------- S7 cliffhanger, windowsill in grey rain light: a drop as big as Pip wobbles closer ----------
export const S7: React.FC<ShotProps> = ({ t, len }) => {
  const pose = poseAt(t, [
    { f: 0, p: { ...basePose, x: 806, y: 818, scale: 0.085, yaw: 0.75, facing: 1, armL: { a: 18, b: -8 }, armR: { a: 18, b: -8 } } },
    { f: 40, p: { armL: { a: 30, b: 20 } } }, // idle watch
    { f: 92, p: { headTilt: -12, armL: { a: 60, b: 36 }, look: 0.9 } }, // looks up: something above
    { f: 122, p: { armL: { a: 172, b: 10 }, armR: { a: 172, b: 10 }, headTilt: -14, squash: -0.03 } }, // arms up, aghast
    { f: len, p: {} },
  ]);
  const face = faceAt(t, [[0, 'neutral'], [30, 'worried'], [100, 'shock']]);
  const grow = kf(t, [[46, 0.5], [92, 0.85], [128, 1.0], [len, 1.2]]);
  const dy = kf(t, [[46, 152], [92, 300], [128, 392], [len, 452]]);
  const dx = 1012 + Math.sin(t / 3) * 9;
  const wob = Math.sin(t / 2.6) * 4;
  return (
    <g transform={camT(kf(t, [[0, 950], [len, 940]]), kf(t, [[0, 530], [len, 480]]), kf(t, [[0, 1.14], [len, 1.42]]))}>
      {/* the grey pane and its frame */}
      <rect x={620} y={-100} width={700} height={960} fill="#39435A" />
      <rect x={620} y={-100} width={700} height={380} fill="#2E3850" />
      <rect x={620} y={-100} width={40} height={960} fill="#232A3C" />
      <rect x={1280} y={-100} width={40} height={960} fill="#232A3C" />
      <rect x={620} y={-100} width={700} height={44} fill="#232A3C" />
      {/* rain streaks sliding down the glass */}
      {Array.from({ length: 14 }).map((_, i) => {
        const sx = 690 + rnd(41, i) * 540;
        const sp = 34 + rnd(42, i) * 52;
        const sy = 120 + ((t * sp + i * 173) % 620);
        return (
          <g key={`rs${i}`}>
            <path d={`M ${sx} ${sy - 26} L ${sx} ${sy}`} stroke="#8FA3C6" strokeWidth={3} opacity={0.35} strokeLinecap="round" />
            <circle cx={sx} cy={sy} r={4} fill="#AFC6E8" opacity={0.5} />
          </g>
        );
      })}
      <Glow x={960} y={400} r={420} o={0.3} kind="cool" />
      {/* the sill Pip stands on */}
      <rect x={600} y={830} width={760} height={30} fill="#5A5264" />
      <rect x={600} y={858} width={760} height={54} fill="#4A4554" />
      <Spot x={806} y={836} rx={26} ry={6} o={0.3} />
      {actor(pose, face)}
      <Spot x={806} y={838} rx={18} ry={4} o={0.25} />
      {/* the drop: wobbles toward camera, slow, Pip reflected in it */}
      {t >= 46 ? (
        <g transform={`translate(${dx} ${dy})`}>
          <g transform={`scale(${grow * (1 - wob * 0.012)} ${grow * (1 + wob * 0.012)}) rotate(${wob * -1.4})`}>
            <path d="M 0 -46 C 26 -14 30 14 0 32 C -30 14 -26 -14 0 -46 Z" fill="#BFD6FF" opacity={0.55} stroke="#DCEBFF" strokeWidth={3.5} />
            <path d="M 8 -20 Q 16 -2 6 14" stroke="#FFFFFF" strokeWidth={4} fill="none" strokeLinecap="round" opacity={0.7} />
            {/* Pip reflected, upside down in the water */}
            <g transform="translate(0 2) scale(0.32)">
              <circle cx={0} cy={-160} r={62} fill="#F6EFE3" stroke="#121019" strokeWidth={4} />
              <path d="M -58 -134 Q 0 -214 58 -134 Q 30 -168 0 -166 Q -30 -168 -58 -134 Z" fill="#2E2B3D" />
              <circle cx={-14} cy={-158} r={5} fill="#1D2033" />
              <circle cx={14} cy={-158} r={5} fill="#1D2033" />
            </g>
          </g>
        </g>
      ) : null}
      {t >= 118 ? (
        <g transform={`translate(${830} ${kf(t, [[118, 700], [len, 676]])}) scale(${backOut(clamp((t - 118) / 8))})`}>
          <text textAnchor="middle" fontFamily={FONT.ui} fontSize={86} fill="#87DBD6" style={{ filter: `drop-shadow(0 0 14px #87DBD688)` }}>
            ?
          </text>
        </g>
      ) : null}
      <Foreground blur={8}>
        <rect x={560} y={930} width={780} height={190} fill="#3C3844" />
      </Foreground>
    </g>
  );
};
