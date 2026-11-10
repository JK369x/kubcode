// core/kit-defaults.js: the engine's stage constants. Some style kits import these names from core/scene.js (flat, woodcut,
// watercolor), so every story's scene.js re-exports this file. A story does not have to use any of them. Do not edit.
export const HOME = 760;
export const DOOR = {
  x0: 1040, x1: 1420, y0: 520, y1: 1350,
  handle: { x0: 1058, x1: 1158, y: 1010 },
  plate: { x0: 1065, x1: 1185, y0: 915, y1: 970 },
  hinges: [{ x: 1420, y: 600 }, { x: 1420, y: 935 }, { x: 1420, y: 1270 }],
};
export const DRAWN = { x0: 470, x1: 700, y0: 840, y1: 1350 };
export const HEARTS = { x: 960, y: 465, gap: 60, n: 10 };
export const TITLE = { lines: [], x: 470, y: [560, 640], cap: 64 };
export const CUBE = 92;
export const TERM = { cmd: '', reply: '' };
