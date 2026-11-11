import React from 'react';
import { AbsoluteFill, Audio, staticFile, useCurrentFrame } from 'remotion';
import { loadFont } from '@remotion/fonts';
import { KitDefs, SetDefs, clamp, ShotProps } from '../../engine';
import timing from './timing.json';
import cueList from './cues.json';
import { S1, S2, S3, S4, S5, S6, S7, THAI } from './shots';

// Vertical 1080 x 1920 cut of the FreshStack world: each shot is drawn in the 1920 x 1080 world and the frame
// crops a 9:16 window around x = 960. Captions follow shared/captions (Thai with one highlight + small English).

loadFont({ family: THAI, url: staticFile('fonts/ChakraPetch-SemiBold.ttf'), weight: '600' });

const SHOTS: Record<string, React.FC<ShotProps>> = { S1, S2, S3, S4, S5, S6, S7 };
type Seg = { shot: string; a: number; b: number };
type Line = { id: string; a: number; b: number; text: string };
type RawCue = { line: string; spoken: string; pre: string; key: string; post: string; color: string; en: string };
type Cue = { a: number; b: number; pre: string; key: string; post: string; color: string; en: string };
const TL = timing as { total: number; segments: Seg[]; lines: Line[]; flashes: number[] };
const RAWS = cueList as RawCue[];

// Caption frames: each line's window (timing.json lines) is split across its cues proportionally to spoken length.
const CUE_TIME = (line: Line, raws: RawCue[]): Cue[] => {
  const total = raws.reduce((s, c) => s + c.spoken.length, 0) || 1;
  let a = line.a;
  return raws.map((c) => {
    const w = Math.round(((line.b - line.a) * c.spoken.length) / total);
    const q: Cue = { a, b: a + w, pre: c.pre, key: c.key, post: c.post, color: c.color, en: c.en };
    a += w;
    return q;
  });
};
const CUES: Cue[] = TL.lines.flatMap((line) => CUE_TIME(line, RAWS.filter((r) => r.line === line.id)));

const CROP_W = (1080 / 1920) * 1080; // world width visible in the 9:16 window

const Grade: React.FC<{ f: number }> = ({ f }) => (
  <svg width={1080} height={1920} viewBox="0 0 1080 1920" style={{ position: 'absolute', inset: 0, pointerEvents: 'none' }}>
    <defs>
      <radialGradient id="vVig" cx="50%" cy="50%" r="75%">
        <stop offset="55%" stopColor="#000" stopOpacity={0} />
        <stop offset="100%" stopColor="#000" stopOpacity={0.5} />
      </radialGradient>
      <filter id="vGrain" x="0" y="0" width="100%" height="100%">
        <feTurbulence type="fractalNoise" baseFrequency="0.9" numOctaves={2} seed={Math.floor(f / 2) % 97} />
        <feColorMatrix type="matrix" values="0 0 0 0 1  0 0 0 0 1  0 0 0 0 1  0 0 0 0.06 0" />
      </filter>
    </defs>
    <rect width="1080" height="1920" fill="url(#vVig)" />
    <rect width="1080" height="1920" filter="url(#vGrain)" />
  </svg>
);

const Captions: React.FC<{ f: number }> = ({ f }) => {
  const c = CUES.find((q) => f >= q.a && f < q.b);
  if (!c) return null;
  const tin = clamp((f - c.a) / 4); // ~140 ms entrance
  const kin = clamp((f - c.a) / 5.4); // ~180 ms keyword settle
  const out = clamp((c.b - f) / 2.4); // ~80 ms exit
  const stroke = '5px #0b1015';
  return (
    <div style={{ position: 'absolute', left: 90, right: 90, top: 1430, textAlign: 'center', opacity: Math.min(tin, out), transform: `translateY(${9 * (1 - tin)}px)` }}>
      <div style={{ fontFamily: THAI, fontWeight: 600, fontSize: 64, lineHeight: 1.28, color: '#fffaf0', WebkitTextStroke: stroke, paintOrder: 'stroke fill' }}>
        {c.pre}
        <span style={{ color: c.color, display: 'inline-block', transform: `scale(${1.06 - 0.06 * kin})` }}>{c.key}</span>
        {c.post}
      </div>
      <div style={{ marginTop: 9, display: 'inline-block', fontFamily: THAI, fontWeight: 600, fontSize: 30, letterSpacing: 1.1, color: '#e5e7df', background: '#0b1015b8', padding: '4px 14px', borderRadius: 6, textTransform: 'uppercase' }}>
        {c.en}
      </div>
    </div>
  );
};

/** The episode chip and the title, top of the vertical frame. */
const TopHud: React.FC<{ f: number }> = ({ f }) => {
  const titleOn = clamp((f - 4) / 8) * clamp((TL.segments[0].b - f) / 6);
  const blink = Math.floor(f / 6) % 2 ? 1 : 0.55;
  const shot = TL.segments.find((s) => f >= s.a && f < s.b)?.shot;
  const chip = shot === 'S1' || shot === 'S3' || shot === 'S5' || shot === 'S7';
  return (
    <>
      {chip ? (
        <div style={{ position: 'absolute', left: 64, top: 150, display: 'flex', alignItems: 'center', gap: 16, background: '#0B0816aa', borderRadius: 40, padding: '12px 28px 12px 20px' }}>
          <div style={{ width: 22, height: 22, borderRadius: 11, background: '#FF5A4A', opacity: blink }} />
          <div style={{ fontFamily: THAI, fontWeight: 600, fontSize: 38, color: '#F6EFE3', letterSpacing: 2 }}>ละลายในคืนเดียว</div>
        </div>
      ) : null}
      {titleOn > 0 ? (
        <div style={{ position: 'absolute', left: 0, right: 0, top: 250, textAlign: 'center', opacity: titleOn, transform: `scale(${0.9 + 0.1 * titleOn})` }}>
          <div style={{ fontFamily: 'Bricolage Grotesque', fontWeight: 600, fontSize: 52, letterSpacing: 4, color: '#F6EFE3', WebkitTextStroke: '8px #1A1230', paintOrder: 'stroke fill' }}>WHAT IF ALL THE ICE</div>
          <div style={{ fontFamily: 'Bricolage Grotesque', fontWeight: 800, fontSize: 94, color: '#FF8A3D', WebkitTextStroke: '12px #1A1230', paintOrder: 'stroke fill', lineHeight: 1.05 }}>MELTED OVERNIGHT?</div>
        </div>
      ) : null}
    </>
  );
};

export const Episode: React.FC = () => {
  const f = useCurrentFrame();
  const seg = TL.segments.find((s) => f >= s.a && f < s.b) ?? TL.segments[TL.segments.length - 1];
  const Shot = SHOTS[seg.shot];
  const flash = TL.flashes.some((x) => f === x) ? 0.35 : TL.flashes.some((x) => f === x + 1) ? 0.12 : 0;
  return (
    <AbsoluteFill style={{ backgroundColor: '#0E0C1E' }}>
      <svg width={1080} height={1920} viewBox={`${960 - CROP_W / 2} 0 ${CROP_W} 1080`} style={{ position: 'absolute', inset: 0 }}>
        <KitDefs />
        <SetDefs />
        <Shot t={f - seg.a} len={seg.b - seg.a} f={f} />
      </svg>
      <Grade f={f} />
      <TopHud f={f} />
      <Captions f={f} />
      {flash ? <AbsoluteFill style={{ backgroundColor: '#FFF3DC', opacity: flash }} /> : null}
      <Audio src={staticFile('ice-melts-overnight/voice.wav')} />
    </AbsoluteFill>
  );
};

export const TOTAL = TL.total;
