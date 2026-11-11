import React from 'react';
import {
  Hero, Pose, basePose, poseAt, faceAt, kf, clamp, easeOut, backOut, camT,
  LOOKS, Look, Rooftop, Glow, Schematic, SCH, ShotProps,
} from '../../engine';
import { FONT } from '../../engine/fonts';

// "What if all the ice melted overnight" — seven shots, each a pure function of its own clock t (frames)
// and its length. The vertical film crops the 1920 x 1080 world around x = 960, so all action stays
// within x 660..1260. Invented cast (Pip only), generic towers, no real landmarks.

export const THAI = 'Chakra Petch';
const PIP = LOOKS.pipHood;
const IA = '#f2c35b';
const CO = '#ff8271';
const CY = '#87dbd6';
const CREAM = '#F6EFE3';

const actor = (look: Look, pose: Pose, face: { expr: any; blink: number }) => (
  <Hero look={look} pose={{ ...pose, ...face }} rimId="rimR" shadow={0} />
);

/** A pill tag with optional small English sub, popping on at t = 0. */
const Tag: React.FC<{ x: number; y: number; t: number; w: number; text: string; color?: string; size?: number }> = ({ x, y, t, w, text, color = CY, size = 26 }) => {
  if (t < 0) return null;
  const s = backOut(clamp(t / 7));
  return (
    <g transform={`translate(${x} ${y}) scale(${s})`} opacity={0.96}>
      <rect x={-w / 2} y={-27} width={w} height={54} rx={15} fill="#0B1424" stroke={color} strokeWidth={3} />
      <text y={9} textAnchor="middle" fontFamily={THAI} fontWeight={600} fontSize={size} fill={CREAM}>
        {text}
      </text>
    </g>
  );
};

/** A red stamp with a word that slams on at t = 0 and fades later. */
const StampWord: React.FC<{ x: number; y: number; t: number; text: string; w: number }> = ({ x, y, t, text, w }) => {
  if (t < 0) return null;
  const s = 1.6 - 0.6 * easeOut(clamp(t / 5));
  const o = t < 34 ? clamp(t / 2) : clamp(1 - (t - 34) / 8);
  return (
    <g transform={`translate(${x} ${y}) scale(${s}) rotate(-8)`} opacity={o}>
      <rect x={-w / 2} y={-32} width={w} height={64} rx={12} fill="none" stroke="#FF5A4A" strokeWidth={7} />
      <text y={13} textAnchor="middle" fontFamily={FONT.ui} fontWeight={700} fontSize={38} fill="#FF5A4A" letterSpacing={3}>
        {text}
      </text>
    </g>
  );
};

// ---------- S1 hook: rooftop at night; Pip's iced coffee flash-melts; pull out to the globe ----------
export const S1: React.FC<ShotProps> = ({ t, len }) => {
  const melt = easeOut(clamp((t - 16) / 9));
  const zoom = kf(t, [[0, 1.26], [24, 1.2], [40, 1.26], [112, 0.92]]);
  const cy = kf(t, [[0, 660], [24, 660], [40, 650], [112, 556]]);
  const globeY = 1150 - easeOut(clamp((t - 48) / 46)) * 585;
  const cap = 1 - easeOut(clamp((t - 88) / 26));
  const ring = clamp((t - 20) / 16);
  const pose = poseAt(t, [
    { f: 0, p: { ...basePose, x: 1016, y: 800, scale: 0.82, yaw: -0.3, facing: -1, armR: { a: 80, b: 38 } } },
    { f: 10, p: { armR: { a: 88, b: 42 }, headTilt: 4 } },
    { f: 24, p: { armR: { a: 22, b: -4 }, headTilt: -7, squash: 0.035, yaw: 0 } },
    { f: 66, p: { armR: { a: 30, b: -8 }, headTilt: -5 } },
    { f: len, p: { squash: 0.02 } },
  ]);
  const face = faceAt(t, [[0, 'neutral'], [17, 'shock'], [48, 'worried']]);
  const cube = (cx: number, cyy: number, s: number, r: number) => {
    const sz = s * (1 - melt * 0.92);
    return <rect x={cx - sz / 2} y={cyy - sz / 2} width={sz} height={sz} rx={3} fill="#EAF6FF" transform={`rotate(${r} ${cx} ${cyy})`} />;
  };
  return (
    <g transform={camT(960, cy, zoom)}>
      <Rooftop t={t + 40} />
      {/* generic towers, no landmarks */}
      <g fill="#1E1A32">
        <rect x={686} y={420} width={88} height={330} />
        <rect x={792} y={352} width={108} height={398} />
        <rect x={1120} y={372} width={100} height={378} />
      </g>
      {[0, 1, 2, 3].map((i) => (
        <g key={i} fill="#F6EFE3" opacity={0.09}>
          <rect x={700 + i * 20} y={450 + (i % 2) * 60} width={8} height={12} />
          <rect x={806 + (i % 3) * 28} y={390 + i * 55} width={10} height={14} />
          <rect x={1134 + (i % 2) * 30} y={410 + i * 62} width={9} height={13} />
        </g>
      ))}
      <circle cx={851} cy={344} r={5} fill="#FF5A4A" opacity={Math.floor(t / 9) % 2 ? 0.9 : 0.2} />
      {/* stars + moon */}
      {[[700, 130], [780, 210], [1180, 150], [1225, 260]].map(([sx, sy], i) => (
        <circle key={i} cx={sx} cy={sy} r={2.4} fill="#F6EFE3" opacity={0.65 + 0.3 * Math.sin(t / 7 + i)} />
      ))}
      <g transform="translate(742 208)">
        <circle r={34} fill="#F6EFE3" opacity={0.9} />
        <circle cx={14} cy={-6} r={30} fill="#0E0C1E" />
      </g>
      {/* the globe rises out of the night as the camera pulls back */}
      {t > 46 ? (
        <g transform={`translate(960 ${globeY})`}>
          <circle r={250} fill="url(#g1ocean)" stroke="#0A1930" strokeWidth={7} />
          <path d="M -160 -60 q 46 -48 96 -28 q 54 20 26 54 q -30 40 -76 26 q -60 -18 -46 -52 z" fill="#2E7D5B" />
          <path d="M 60 90 q 70 -26 118 14 q 26 44 -24 66 q -66 26 -104 -14 q -22 -40 10 -66 z" fill="#275C45" />
          <path d="M -120 130 q 40 -18 66 6 q 18 30 -18 40 q -44 10 -58 -20 q -6 -20 10 -26 z" fill="#2E7D5B" />
          <path d="M -250 0 A 250 250 0 0 1 250 0" stroke="#0A1930" strokeWidth={2} fill="none" opacity={0.35} />
          <path d="M -224 124 A 250 250 0 0 0 224 124" stroke="#0A1930" strokeWidth={2} fill="none" opacity={0.35} />
          {/* the white poles drain away */}
          <g opacity={0.95}>
            <path d={`M ${-160 * cap} -235 A 250 250 0 0 1 ${160 * cap} -235 L 0 -178 Z`} fill="#EAF6FF" />
            <path d={`M ${-120 * cap} 228 A 250 250 0 0 0 ${120 * cap} 228 L 0 192 Z`} fill="#EAF6FF" />
          </g>
          <circle r={250} fill="none" stroke="#87DBD6" strokeWidth={2} opacity={0.16} />
        </g>
      ) : null}
      <Glow x={930} y={760} r={420} o={0.22} />
      {/* the rooftop table with the iced coffee */}
      <rect x={830} y={806} width={270} height={14} rx={6} fill="#2A2340" stroke="#3A2E56" strokeWidth={3} />
      <rect x={856} y={820} width={16} height={54} fill="#221C36" />
      <rect x={1060} y={820} width={16} height={54} fill="#221C36" />
      <g>
        <rect x={912} y={700} width={56} height={100} rx={10} fill="#8FD4FF22" stroke={CREAM} strokeWidth={4} />
        <rect x={917} y={742} width={46} height={53} rx={6} fill="#8A5A33" />
        {cube(930, 752, 20, 14)}
        {cube(944, 776, 17, -18)}
        {cube(934, 786, 14, 30)}
        {melt > 0.98 ? <circle cx={940} cy={750} r={14 + ring * 60} fill="none" stroke={IA} strokeWidth={3} opacity={0.7 * (1 - ring)} /> : null}
      </g>
      {t > 20 && t < 34 ? [[920, 730], [958, 720]].map(([dx, dy], i) => (
        <g key={i} transform={`translate(${dx} ${dy - clamp((t - 20 - i * 2) / 10) * 26})`}>
          <circle r={3.2} fill="#8FD4FF" opacity={1 - clamp((t - 20 - i * 2) / 10)} />
        </g>
      )) : null}
      {actor(PIP, pose, face)}
      <StampWord x={960} y={480} t={t - 27} text="OVERNIGHT" w={420} />
    </g>
  );
};

// ---------- S2 schematic split: glass vs floating Arctic ice; water lines barely move ----------
// Two panels ~260 wide side by side, inside the visible window x 690..1230, labels above y 760.
export const S2: React.FC<ShotProps> = ({ t, len }) => {
  const melt = easeOut(clamp((t - 14) / 34));
  const inL = easeOut(clamp((t - 2) / 12));
  const inR = easeOut(clamp((t - 100) / 14));
  const tagL = backOut(clamp((t - 66) / 8));
  const tagR = backOut(clamp((t - 152) / 8));
  const bob = Math.sin(t / 9) * 5;
  const shrink = 1 - easeOut(clamp((t - 128) / 30)) * 0.14;
  const iceCube = (cx: number, cyy: number, s: number, r: number) => {
    const sz = s * (1 - melt * 0.96);
    return <rect x={cx - sz / 2} y={cyy - sz / 2} width={sz} height={sz} rx={3} fill="#EAF6FF" transform={`rotate(${r} ${cx} ${cyy})`} />;
  };
  return (
    <g transform={camT(960, 540, kf(t, [[0, 1.0], [len, 1.05]]))}>
      <Schematic t={t} id="float" />
      {/* the split */}
      <path d="M 960 300 L 960 780" stroke={SCH.dim} strokeWidth={3} strokeDasharray="10 10" opacity={0.5} />
      {/* left: ice in a glass */}
      <g transform={`translate(${820 - 240 * (1 - inL)} 520)`}>
        <rect x={-130} y={-250} width={260} height={510} rx={22} fill="#0B1424" opacity={0.75} />
        <text y={-204} textAnchor="middle" fontFamily={THAI} fontWeight={600} fontSize={26} fill={SCH.line}>
          น้ำแข็งในแก้ว
        </text>
        <path d="M -28 -58 L -28 88 Q -28 100 -17 100 L 17 100 Q 28 100 28 88 L 28 -58" fill="#2C7BB6" opacity={0.35} stroke={CREAM} strokeWidth={4} />
        {iceCube(-9, 42, 19, 10)}
        {iceCube(9, 54, 15, -16)}
        {iceCube(-2, 64, 12, 26)}
        <path d="M -42 22 L 42 22" stroke={SCH.dim} strokeWidth={3} strokeDasharray="7 6" />
        <text x={46} y={28} fontFamily={THAI} fontWeight={600} fontSize={17} fill={SCH.dim}>ก่อน</text>
        <path d="M -42 16 L 42 16" stroke={CY} strokeWidth={3.5} opacity={melt} />
        <text x={46} y={6} fontFamily={THAI} fontWeight={600} fontSize={17} fill={CY} opacity={melt}>หลัง</text>
        {tagL > 0 ? (
          <g transform={`translate(0 190) scale(${tagL})`}>
            <rect x={-112} y={-26} width={224} height={52} rx={15} fill="#0B1424" stroke={CY} strokeWidth={3} />
            <text y={9} textAnchor="middle" fontFamily={THAI} fontWeight={600} fontSize={24} fill={CREAM}>แทบไม่เปลี่ยน ✓</text>
          </g>
        ) : null}
      </g>
      {/* right: floating polar ice */}
      {t > 100 ? (
        <g transform={`translate(${1100 + 240 * (1 - inR)} 520)`}>
          <rect x={-130} y={-250} width={260} height={510} rx={22} fill="#0B1424" opacity={0.75} />
          <text y={-204} textAnchor="middle" fontFamily={THAI} fontWeight={600} fontSize={24} fill={SCH.line}>
            ทะเลขั้วโลกเหนือ
          </text>
          <rect x={-110} y={-44} width={220} height={192} fill="#173F63" />
          <path d="M -100 -36 L 100 -36" stroke={SCH.dim} strokeWidth={3} strokeDasharray="7 6" />
          <text x={-96} y={-12} fontFamily={THAI} fontWeight={600} fontSize={16} fill={SCH.dim}>ก่อน</text>
          <path d="M -100 -30 L 100 -30" stroke={CY} strokeWidth={3} opacity={melt} />
          <g transform={`translate(0 ${bob})`}>
            <rect x={-66} y={-30} width={132} height={40} fill="#BFE3F2" opacity={0.4} />
            <rect x={-84 * shrink} y={-30 - 96 * shrink} width={168 * shrink} height={96 * shrink} rx={7} fill="#EAF6FF" stroke="#9FC7DA" strokeWidth={3} />
          </g>
          {tagR > 0 ? (
            <g transform={`translate(0 190) scale(${tagR})`}>
              <rect x={-118} y={-24} width={236} height={48} rx={14} fill="#0B1424" stroke={CY} strokeWidth={3} />
              <text y={8} textAnchor="middle" fontFamily={FONT.ui} fontSize={17} fill={CREAM} letterSpacing={1}>ICE ALREADY FLOATING</text>
            </g>
          ) : null}
        </g>
      ) : null}
    </g>
  );
};

// ---------- S3 rule card: all land ice melts in one night (EPISODE RULE · NOT REAL) ----------
const RuleRow: React.FC<{ y: number; t: number; text: string; mintime: number; icon: 'check' | 'clock' }> = ({ y, t, text, mintime, icon }) => {
  if (t < 0) return null;
  const s = backOut(clamp(t / 7));
  const hot = t > mintime;
  return (
    <g transform={`translate(960 ${y}) scale(${s})`}>
      <rect x={-260} y={-46} width={520} height={92} rx={18} fill="#0B1424" stroke={CY} strokeWidth={hot ? 5 : 3} opacity={0.95} style={hot ? { filter: 'drop-shadow(0 0 12px #87dbd655)' } : undefined} />
      {icon === 'check' ? (
        <path d="M -236 0 L -214 22 L -178 -24" stroke={CY} strokeWidth={10} fill="none" strokeLinecap="round" strokeLinejoin="round" />
      ) : (
        <g stroke={CY} strokeWidth={7} fill="none" strokeLinecap="round">
          <circle cx={-207} cy={0} r={26} />
          <path d="M -207 -15 L -207 0 L -194 10" transform={`rotate(${(t * 14) % 360} -207 0)`} />
        </g>
      )}
      <text x={-148} y={13} fontFamily={THAI} fontWeight={600} fontSize={32} fill={CREAM}>
        {text}
      </text>
    </g>
  );
};
export const S3: React.FC<ShotProps> = ({ t, len }) => (
  <g transform={camT(960, 540, kf(t, [[0, 1.0], [len, 1.05]]))}>
    <Schematic t={t} id="rule-night" />
    <text x={960} y={296} textAnchor="middle" fontFamily={THAI} fontWeight={600} fontSize={52} fill={SCH.glow}>
      กฎข้อเดียว
    </text>
    <text x={960} y={344} textAnchor="middle" fontFamily={FONT.ui} fontSize={26} fill={SCH.dim} letterSpacing={3}>
      EPISODE RULE · NOT REAL
    </text>
    <RuleRow y={470} t={t - 8} mintime={999} text="น้ำแข็งบนแผ่นดิน ละลายหมด" icon="check" />    <RuleRow y={614} t={t - 22} mintime={86} text="ภายในคืนเดียว (ก่อนเช้า)" icon="clock" />
  </g>
);

// ---------- S4 real fact: Antarctica ~58 m + Greenland ~7.4 m stack into ~65 m global average ----------
// Chart centred on x 960: vertical scale on the left, stacked bar at 796..896, labels beside the bar
// within x 1230, and the ~65 m readout box above y 760.
export const S4: React.FC<ShotProps> = ({ t, len }) => {
  const K = 4.8; // px per metre
  const base = 700;
  const h1 = 58 * K * easeOut(clamp((t - 12) / 42));
  const h2 = 7.4 * K * easeOut(clamp((t - 50) / 36));
  const v = 65 * easeOut(clamp((t - 122) / 38));
  const plate = backOut(clamp((t - 118) / 9));
  const lab1 = clamp((t - 16) / 6);
  const lab2 = clamp((t - 54) / 6);
  return (
    <g transform={camT(960, 560, kf(t, [[0, 1.0], [len, 1.06]]))}>
      <Schematic t={t} id="sheets" />
      <text x={960} y={196} textAnchor="middle" fontFamily={THAI} fontWeight={600} fontSize={44} fill={SCH.line}>
        น้ำแข็งบนแผ่นดิน
      </text>
      <text x={960} y={234} textAnchor="middle" fontFamily={FONT.ui} fontSize={23} fill={SCH.dim} letterSpacing={2}>
        ข้อมูลจริง · NSIDC
      </text>
      {/* the vertical scale + baseline, centred on the window */}
      <path d={`M 776 ${base} L 776 ${base - 60 * K - 22}`} stroke={SCH.dim} strokeWidth={4} />
      <path d={`M 736 ${base} L 1230 ${base}`} stroke={SCH.dim} strokeWidth={4} />
      {[10, 20, 30, 40, 50, 60].map((m) => (
        <g key={m}>
          <path d={`M 766 ${base - m * K} L 786 ${base - m * K}`} stroke={SCH.dim} strokeWidth={2} />
          <text x={754} y={base - m * K + 6} textAnchor="middle" fontFamily={FONT.ui} fontSize={15} fill={SCH.dim}>
            {m}
          </text>
        </g>
      ))}
      <text x={776} y={base - 60 * K - 34} textAnchor="middle" fontFamily={THAI} fontWeight={600} fontSize={18} fill={SCH.dim}>
        ม.
      </text>
      {/* Antarctica bar (yellow) with Greenland (red) stacked on top */}
      <rect x={796} y={base - h1} width={100} height={h1} fill={IA} opacity={0.9} />
      <rect x={796} y={base - h1 - h2} width={100} height={h2} fill={CO} opacity={0.95} />
      <text x={916} y={base - h1 + 10} fontFamily={THAI} fontWeight={600} fontSize={25} fill={IA} opacity={lab1}>
        แอนตาร์กติกา ~58 ม.
      </text>
      <text x={916} y={base - h1 - h2 - 8} fontFamily={THAI} fontWeight={600} fontSize={24} fill={CO} opacity={lab2}>
        กรีนแลนด์ ~7.4 ม.
      </text>
      {/* the total readout, above y 760 */}
      {plate > 0 ? (
        <g transform={`translate(1064 600) scale(${plate})`}>
          <rect x={-155} y={-52} width={310} height={104} rx={18} fill="#0B1424" stroke={CY} strokeWidth={4} opacity={0.95} />
          <text y={-2} textAnchor="middle" fontFamily={THAI} fontWeight={600} fontSize={42} fill={CY}>
            ~{Math.round(v)} ม.
          </text>
          <text y={36} textAnchor="middle" fontFamily={FONT.ui} fontSize={18} fill={SCH.dim} letterSpacing={1.5}>
            · GLOBAL AVERAGE
          </text>
        </g>
      ) : null}
    </g>
  );
};

// ---------- S5 back to the rooftop at dawn: water climbs the towers, floor counter 1 -> 20+ ----------
export const S5: React.FC<ShotProps> = ({ t, len }) => {
  const seaTop = kf(t, [[6, 1030], [64, 848], [124, 640], [len, 452]]);
  const rise = clamp((t - 40) / 100);
  const fl = t < 40 ? 0 : Math.min(20, 1 + Math.floor(rise * 19.6));
  const plate = backOut(clamp((t - 40) / 9));
  const count = plate > 0 ? (t > 136 ? '20+' : `${fl}`) : '';
  const px = kf(t, [[0, 1136], [48, 1024], [92, 952], [len, 948]]);
  const py = kf(t, [[0, 834], [48, 760], [92, 672], [len, 664]]);
  const pose = poseAt(t, [
    { f: 0, p: { ...basePose, x: px, y: py, scale: 0.64, yaw: -0.15, facing: -1, armL: { a: 22, b: -4 }, armR: { a: 26, b: -2 } } },
    { f: 16, p: { armR: { a: 122, b: 42 }, armL: { a: 66, b: 16 }, headTilt: -5, x: px, y: py } },
    { f: 52, p: { armL: { a: 152, b: 38 }, armR: { a: 84, b: 22 }, headTilt: -7, x: px, y: py } },
    { f: 88, p: { armR: { a: 44, b: 8 }, armL: { a: 48, b: 10 }, headTilt: 3, x: px, y: py } },
    { f: len, p: { armR: { a: 58, b: 12 }, armL: { a: 58, b: 12 }, squash: 0.02, x: px, y: py } },
  ]);
  const face = faceAt(t, [[0, 'shock'], [86, 'worried']]);
  const top = seaTop + Math.sin(t / 5) * 5;
  const wave = [
    'M 600 ' + top.toFixed(1),
    ...Array.from({ length: 8 }, (_, i) => {
      const wx = 600 + (((i + 1) * 1000) / 8);
      return 'L ' + wx.toFixed(1) + ' ' + (top + Math.sin(wx / 90 + t / 4.5) * 9).toFixed(1);
    }),
    `L 1600 1150 L 560 1150 Z`,
  ].join(' ');
  return (
    <g transform={camT(960, 590, kf(t, [[0, 1.06], [len, 1.0]]))}>
      <Rooftop t={t} />
      {/* dawn wash */}
      <circle cx={960} cy={860} r={520} fill="url(#dawnG)" opacity={0.5} />
      {/* generic towers floor by floor */}
      <g fill="#342A4C">
        <rect x={700} y={330} width={130} height={560} />
        <rect x={1096} y={380} width={128} height={510} />
      </g>
      {[0, 1, 2, 3, 4, 5, 6].map((i) => (
        <g key={i}>
          <path d={`M 700 ${434 + i * 66} L 830 ${434 + i * 66}`} stroke="#F6EFE3" strokeWidth={2} opacity={0.12} />
          <path d={`M 1096 ${470 + i * 66} L 1224 ${470 + i * 66}`} stroke="#F6EFE3" strokeWidth={2} opacity={0.12} />
          <circle cx={726 + (i % 3) * 40} cy={384 + i * 60} r={5} fill="#FFB36B" opacity={0.75} />
          <circle cx={1122 + (i % 3) * 40} cy={420 + i * 60} r={5} fill="#FFD9A0" opacity={0.6} />
        </g>
      ))}
      {/* the water tank Pip climbs onto */}
      <g>
        <rect x={896} y={668} width={110} height={106} rx={10} fill="#4C5A6B" stroke="#33414F" strokeWidth={4} />
        <rect x={912} y={656} width={78} height={18} rx={8} fill="#5D6C7D" />
        <path d="M 908 774 L 908 830 M 994 774 L 994 830" stroke="#33414F" strokeWidth={8} />
      </g>
      {/* the water floods the street and climbs the floors */}
      <path d={wave} fill="#2B7CB3" opacity={0.88} />
      {[[700, 0], [920, 1], [1150, 2]].map(([sx, i]) => {
        const k = ((t + i * 9) % 30) / 30;
        return (
          <g key={i}>
            <circle cx={sx} cy={top + Math.sin(sx / 90 + t / 4.5) * 9} r={6 + k * 34} fill="none" stroke="#9FD8FF" strokeWidth={3} opacity={0.55 * (1 - k)} />
          </g>
        );
      })}
      {actor(PIP, pose, face)}
      {/* floor counter */}
      {plate > 0 && count ? (
        <g transform={`translate(960 272) scale(${plate})`}>
          <rect x={-96} y={-46} width={192} height={92} rx={18} fill="#0B1424" opacity={0.92} stroke={CO} strokeWidth={3} />
          <text y={14} textAnchor="middle" fontFamily={THAI} fontWeight={600} fontSize={44} fill={CREAM}>
            ชั้น {count}
          </text>
        </g>
      ) : null}
      <Tag x={960} y={730} t={t - 12} w={500} text="กรุงเทพฯ ~0.5–1.5 ม. จากระดับทะเล" color={CO} />
      <Tag x={1030} y={352} t={t - 66} w={360} text="ดอยอินทนนท์ 2,565 ม. · ยังพ้นน้ำ" color={CY} size={20} />
    </g>
  );
};

// ---------- S6 real timescale: 1 night crossed out -> centuries to millennia (IPCC AR6) ----------
export const S6: React.FC<ShotProps> = ({ t, len }) => {
  const strike = clamp((t - 50) / 10);
  const grow = easeOut(clamp((t - 62) / 64));
  const lab = clamp((t - 118) / 8);
  const breath = clamp((t - 138) / 14);
  const tR = len * 0.62;
  const pose = poseAt(t, [
    { f: 0, p: { ...basePose, x: 830, y: 892, scale: 0.56, yaw: 0.2, facing: 1, armL: { a: 40, b: 12 }, armR: { a: 36, b: 10 } } },
    { f: tR, p: { armL: { a: 14, b: -4 }, armR: { a: 16, b: -6 }, headTilt: -3, squash: 0.03, x: 835, y: 886 } },
    { f: len, p: { squash: 0.01, x: 835, y: 882 } },
  ]);
  const face = faceAt(t, [[0, 'worried'], [tR - 4, 'happy']]);
  return (
    <g transform={camT(960, 570, kf(t, [[0, 1.0], [len, 1.05]]))}>
      <Schematic t={t} id="timeline" />
      <text x={960} y={248} textAnchor="middle" fontFamily={THAI} fontWeight={600} fontSize={44} fill={SCH.line}>
        ข่าวดี · ในโลกจริง
      </text>
      {/* timeline: the 1-night bar is crossed out at the left end above the arrow, the arrow stretches */}
      <path d="M 716 560 L 1200 560" stroke={SCH.dim} strokeWidth={3} />
      <text x={752} y={534} fontFamily={THAI} fontWeight={600} fontSize={28} fill={SCH.dim}> {/* host: nudged inside the 9:16 window */}
        1 คืน
      </text>
      {strike > 0 ? (
        <path d={`M 746 ${528 - strike * 6} L 816 ${542 - strike * 6}`} stroke="#FF5A4A" strokeWidth={8} strokeLinecap="round" />
      ) : null}
      <path d={`M 802 560 L ${802 + 374 * grow} 560`} stroke={CY} strokeWidth={6} strokeLinecap="round" />
      {grow > 0.96 ? <path d={`M ${1176 - 14} 550 L 1176 560 L ${1176 - 14} 570`} fill="none" stroke={CY} strokeWidth={6} strokeLinecap="round" strokeLinejoin="round" /> : null}
      <path d={`M ${802 + 374 * grow} 548 L ${802 + 374 * grow} 572`} stroke={CY} strokeWidth={4} />
      {lab > 0 ? (
        <g opacity={lab}>
          <text x={960} y={462} textAnchor="middle" fontFamily={THAI} fontWeight={600} fontSize={38} fill={CREAM}>
            หลายร้อย–หลายพันปี
          </text>
          <text x={960} y={502} textAnchor="middle" fontFamily={FONT.ui} fontSize={18} fill={CY} letterSpacing={0.8}>
            CENTURIES TO MILLENNIA (IPCC AR6)
          </text>
        </g>
      ) : null}
      {actor(PIP, pose, face)}
      {/* relief breath */}
      {breath > 0 ? (
        <g fill="none" stroke="#9FD8FF" strokeWidth={4} strokeLinecap="round" opacity={0.8 * breath}>
          <path d={`M 872 806 q ${20 + 26 * breath} ${-16 - 8 * breath} ${40 + 52 * breath} ${-4 - 8 * breath}`} />
          <path d={`M 876 820 q ${16 + 18 * breath} ${-8 - 6 * breath} ${32 + 36 * breath} ${-2 - 6 * breath}`} opacity={0.7} />
        </g>
      ) : null}
    </g>
  );
};

// ---------- S7 cliffhanger: the street at dusk; Pip measures his front door; how high? ----------
export const S7: React.FC<ShotProps> = ({ t, len }) => {
  const tQ = 78;
  const meas = easeOut(clamp((t - 8) / 26));
  const q = backOut(clamp((t - (tQ + 22)) / 9));
  const pose = poseAt(t, [
    { f: 0, p: { ...basePose, x: 1062, y: 818, scale: 0.7, yaw: -0.55, facing: -1, armR: { a: 116, b: 34 } } },
    { f: 14, p: { armR: { a: 108, b: 28 }, headTilt: -3 } },
    { f: tQ, p: { armR: { a: 100, b: 24 }, headTilt: -2 } },
    { f: tQ + 20, p: { yaw: 0.2, facing: 1, armR: { a: 60, b: 24 }, headTilt: 6, squash: 0.03 } },
    { f: len, p: { squash: 0.05, headTilt: 4 } },
  ]);
  const face = faceAt(t, [[0, 'neutral'], [tQ + 16, 'shock']]);
  return (
    <g transform={camT(960 - 14 * clamp((t - tQ - 16) / 24), 560, kf(t, [[0, 1.04], [tQ + 16, 1.07], [len, 1.2]]))}>
      {/* dusk street, generic buildings */}
      <rect x={560} y={0} width={800} height={880} fill="url(#sky7)" />
      {[[700, 130], [760, 250], [1180, 190], [1230, 90]].map(([sx, sy], i) => (
        <circle key={i} cx={sx} cy={sy} r={2.2} fill="#F6EFE3" opacity={0.6 + 0.3 * Math.sin(t / 6 + i)} />
      ))}
      <circle cx={742} cy={212} r={30} fill="#FFD9A0" opacity={0.85} />
      <g fill="#241D3A">
        <rect x={648} y={420} width={96} height={440} />
        <rect x={756} y={500} width={80} height={360} />
        <rect x={1052} y={470} width={86} height={390} />
        <rect x={1156} y={384} width={100} height={476} />
      </g>
      {[0, 1, 2].map((i) => (
        <g key={i} fill="#FFD9A0" opacity={0.5}>
          <rect x={668 + (i % 2) * 44} y={452 + i * 70} width={14} height={18} rx={2} />
          <rect x={1168 + (i % 3) * 26} y={416 + i * 84} width={13} height={16} rx={2} />
          <rect x={1070 + (i % 2) * 40} y={500 + i * 64} width={12} height={15} rx={2} />
        </g>
      ))}
      {/* main building with the front door */}
      <rect x={886} y={308} width={148} height={552} fill="#2B2340" stroke="#1A142C" strokeWidth={4} />
      {Array.from({ length: 6 }).map((_, i) => (
        <rect key={i} x={900 + (i % 2) * 62} y={344 + Math.floor(i / 2) * 66} width={30} height={38} rx={3} fill="#FFD9A0" opacity={i % 3 ? 0.5 : 0.12} />
      ))}
      {/* the door */}
      <rect x={928} y={722} width={64} height={138} rx={7} fill="#7A4A3A" stroke="#3A241E" strokeWidth={4} />
      <circle cx={984} cy={796} r={4.5} fill="#D9A55A" />
      {/* the measuring tape */}
      <rect x={1002} y={700} width={12} height={34} rx={3} fill="#4C5A6B" stroke="#33414F" strokeWidth={2} />
      <rect x={1005} y={734} width={6} height={150 * meas} fill="#F2C94C" opacity={0.92} />
      {Array.from({ length: 9 }).map((_, i) =>
        150 * meas > 14 * i + 10 ? <path key={i} d={`M 1005 ${746 + i * 14} L 1011 ${746 + i * 14}`} stroke="#8A6A1E" strokeWidth={2} /> : null,
      )}
      <rect x={999} y={732 + 150 * meas} width={18} height={7} rx={2} fill="#F2C94C" opacity={0.92} />
      {t > 18 ? (
        <g transform={`translate(1054 ${688 + Math.sin(t / 6) * 3})`} opacity={clamp((t - 18) / 6)}>
          <rect x={-38} y={-24} width={76} height={48} rx={10} fill="#0b1015" opacity={0.78} />
          <text y={10} textAnchor="middle" fontFamily={THAI} fontWeight={600} fontSize={34} fill={IA}>
            ? ม.
          </text>
        </g>
      ) : null}
      <rect x={580} y={830} width={760} height={250} fill="#171226" />
      <path d="M 580 830 L 1340 830" stroke="#2A2340" strokeWidth={4} />
      {actor(PIP, pose, face)}
      {/* the big "?" */}
      {q > 0 ? (
        <g transform={`translate(918 636) scale(${q}) rotate(${(1 - q) * -14})`}>
          <text textAnchor="middle" fontFamily={THAI} fontWeight={700} fontSize={96} fill={CO} stroke="#0b1015" strokeWidth={7} paintOrder="stroke">
            ?
          </text>
        </g>
      ) : null}
    </g>
  );
};
