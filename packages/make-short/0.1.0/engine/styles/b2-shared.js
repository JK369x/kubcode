// styles/b2-shared.js: tiny bridge between styles/03-voxel.js and transitions/t3-zoom-monitor.js (one module instance, imported by both).
//   shared.voxel = { renderGlass(texCanvas, f) -> WebGL canvas }   set by 03-voxel.js at init
export const shared = { voxel: null };
