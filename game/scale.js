// Whole-number zoom for the pixel world. Pure, no Phaser.
export const WORLD = { w: 240, h: 200 };
export const SAFE = { w: 160, h: 140 };

export const zoomFor = (viewW, viewH) => Math.max(2, Math.floor(Math.min(viewW / SAFE.w, viewH / SAFE.h)));
