import React from 'react';
import { AbsoluteFill, useCurrentFrame } from 'remotion';
import { defineEpisode, Timeline, LookDef, HudChip } from '../../engine';
import timeline from './timeline.json';
import words from './words.json';
import { S1, S2, S3, S4, S5, S6, S7, S8, S9, S10, S11, S12 } from './shots';

// The mute look: the picture cools and desaturates while the touched world stays silent, a เงียบ chip pulses.
// NOTE: only the touched-world shots carry it — the "this is real" science look S11 runs with NO look overlay.
const muteLook: LookDef = {
  grade: (lv) => `saturate(${1 - 0.28 * lv}) hue-rotate(${-10 * lv}deg) brightness(${1 + 0.04 * lv})`,
  Overlay: ({ f }) => <HudChip f={f} label="เงียบ" icon="pause" />,
};

const FPS = 30;

type Phrase = { w: string; s: number; e: number };

/** Thai burn-in captions: the 17 phrase groups from words.json, exact text at their exact s/e, bottom band,
 ** never over the faces. Thonburi / Noto Sans Thai, ~46px, at most 2 short lines. */
const ThaiCaptions: React.FC = () => {
  const f = useCurrentFrame();
  const cur = (words as Phrase[]).find((p) => f >= Math.round(p.s * FPS) && f < Math.round(p.e * FPS));
  if (!cur) return null;
  return (
    <AbsoluteFill style={{ position: 'absolute', inset: 0, pointerEvents: 'none' }}>
      <div
        style={{
          position: 'absolute',
          left: '50%',
          transform: 'translateX(-50%)',
          bottom: 58,
          width: '78%', // 2-line band; the text center sits offset only via the safe-area transform above
          textAlign: 'center',
          fontFamily: 'Thonburi, Noto Sans Thai, sans-serif',
          fontSize: 46,
          lineHeight: 1.28,
          color: '#F6EFE3',
          textShadow: '0 2px 10px rgba(10,8,20,0.9), 0 0 4px rgba(10,8,20,0.8)',
        }}
      >
        {cur.w}
      </div>
    </AbsoluteFill>
  );
};

const Base = defineEpisode('MuteTouch', {
  timeline: timeline as Timeline,
  shots: { S1, S2, S3, S4, S5, S6, S7, S8, S9, S10, S11, S12 },
  looks: { mute: muteLook },
});

export const muteTouch = {
  ...Base,
  Main: () => (
    <>
      <Base.Main />
      <ThaiCaptions />
    </>
  ),
};
