import React from 'react';
import { Composition } from 'remotion';
import './engine/fonts';
import { STUDIO } from './studio.config';
import { CastSheet } from './CastSheet';
import { VerticalEpisodes } from './episodes/vertical.generated';

// Vertical 9:16 Thai What If shorts listed in READY (host/host_root.py regenerates
// src/episodes/vertical.generated.tsx). Cast renders the cast sheet.
//   npx remotion studio src/index.ts --port 3430
export const Root: React.FC = () => (
  <>
    <Composition id="Cast" component={CastSheet} durationInFrames={1} width={STUDIO.width} height={STUDIO.height} fps={STUDIO.fps} />
    <VerticalEpisodes />
  </>
);
