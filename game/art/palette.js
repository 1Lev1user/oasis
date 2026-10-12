// The one palette of the oasis: letter -> '#rrggbb'. Pixel maps use these letters, '.' is transparent.
// Scenes never write a colour literal; they take colours from here.
export const PALETTE = {
  K: '#3b2a20', // outline, 1 px around every object
  E: '#1d1d1d', // eye, pupil
  N: '#2a1d16', // dark hole (burrow mouth, mine door)
  W: '#ffffff', // eye shine, white highlight
  // lizard and plants
  G: '#7ccf5a', // lizard body light
  g: '#3f8f3a', // lizard body shade, carrot leaf
  Y: '#d8ef8a', // lizard belly
  C: '#5fae4e', // cactus body
  c: '#2f7a34', // cactus shade
  L: '#4fae4e', // palm leaf, sprout
  l: '#2e7d32', // palm leaf shade, stems
  F: '#f28ab2', // pink: flower petal, butterfly, brush
  U: '#e86a5a', // red: heart
  // wood, earth and stone
  P: '#9a6a3a', // palm trunk light
  p: '#6b4423', // palm trunk shade
  R: '#a0683a', // wood light (fence, chest, planks)
  r: '#6b4423', // wood shade
  S: '#b3ada3', // stone light
  s: '#7a746c', // stone shade
  A: '#f0d79a', // sand light (burrow, castle)
  a: '#c9a35f', // sand shade
  // water, glass and sky
  B: '#4fa4d8', // water light
  b: '#2f7fb8', // water shade
  J: '#cfeaf0', // glass light (jar, window, pond glint)
  j: '#8fbfca', // glass shade
  H: '#f6ecc8', // cream (egg, moon, cloud, paper)
  // gold and warm colours
  O: '#f2c14e', // gold light (coin, fire, star)
  o: '#c98b1a', // gold shade
  Q: '#fff4b0', // pale yellow shine
  Z: '#f2a15a', // orange (carrot, fire, book)
  z: '#c96a2a', // orange shade
  // monsters and gems
  M: '#7a68b0', // purple (bug, bag)
  m: '#4a3c7a', // purple shade
  T: '#9a8fbf', // troll skin light
  t: '#6a5f8c', // troll skin shade
  D: '#b06ac0', // dragon light
  d: '#7a3f8a', // dragon shade
  V: '#5fd3c8', // gem light
  v: '#2a9a90', // gem shade
  // species recolours of the lizard
  I: '#5fc4b0', // chameleon body light
  i: '#2f8a7a', // chameleon body shade
  X: '#e8a64a', // gecko body light
  x: '#b06a2a', // gecko body shade
};
