import { PALETTE } from './palette.js';
import { SPRITES, KEEPER, KEEPER_STAGE, BARE_STAGES, headOf } from './sprites.js';

// Frame lists for animations; each entry is a texture key made by makeTextures.
export const FRAMES = {
  idle: ['liz', 'liz', 'liz', 'liz', 'liz', 'liz_blink'],
  walk: ['liz', 'liz_walk1'],
  trollWalk: ['troll', 'troll_walk1'],
};

// Texture keys of one species' keeper at one stage of BALANCE.evolution (default teen, the frames the species started with): stand, blink
// and the frame lists of the idle and walk animations (the lizard's teen ones are FRAMES). An unknown species is the lizard, an unknown stage teen.
export function keeperFrames(species, stage = 'teen') {
  const looks = KEEPER_STAGE[Object.hasOwn(KEEPER, species) ? species : 'lizard'];
  const { stand, blink, walk } = looks[Object.hasOwn(looks, stage) ? stage : 'teen'];
  return { stand, blink, idle: [stand, stand, stand, stand, stand, blink], walk: [stand, walk] };
}

// The idle animation of one species (made once, key `idle:<species>`, with a stage `idle:<species>:<stage>`): the village and the workshop
// show several species at once, so they cannot share the oasis' single 'idle'. Returns the key.
export function keeperAnim(scene, species, stage) {
  const key = stage ? `idle:${species}:${stage}` : `idle:${species}`;
  if (!scene.anims.exists(key)) scene.anims.create({ key, frames: keeperFrames(species, stage).idle.map((k) => ({ key: k })), frameRate: 2, repeat: -1 });
  return key;
}

// An outfit on the head of a keeper sprite (origin 0.5, 1). Returns null without an outfit (and on an egg or a baby, too small to wear one), else { img, sync }; call sync() after
// the sprite moved: the outfit takes its place, mirroring, scale, fade and visibility, and stays one layer above it.
export function dress(scene, sprite, species, outfit, stage = 'teen') {
  if (!outfit || BARE_STAGES.includes(stage)) return null;
  const head = headOf(species, stage);
  const img = scene.add.image(0, 0, outfit).setOrigin(0.5, 1);
  const dx = head.x + Math.floor((head.w - img.width) / 2) + img.width / 2 - sprite.width / 2; // outfit middle from the sprite's middle
  const dy = sprite.height - (head.y + 1); // its bottom edge above the sprite's bottom edge
  const sync = () => {
    const flip = sprite.flipX ? -1 : 1;
    img.setPosition(sprite.x + flip * dx * sprite.scaleX, sprite.y - dy * sprite.scaleY)
      .setScale(sprite.scaleX, sprite.scaleY).setFlipX(sprite.flipX).setAlpha(sprite.alpha).setVisible(sprite.visible).setDepth(sprite.depth + 0.1);
  };
  sync();
  return { img, sync };
}

// Turns every pixel map into a Phaser canvas texture of the same key (call once at boot).
export function makeTextures(scene) {
  for (const [key, rows] of Object.entries(SPRITES)) {
    if (scene.textures.exists(key)) continue;
    const w = Math.max(...rows.map((r) => r.length));
    const tex = scene.textures.createCanvas(key, w, rows.length);
    const ctx = tex.getContext();
    rows.forEach((row, y) => {
      for (let x = 0; x < row.length; x++) {
        if (row[x] === '.') continue;
        ctx.fillStyle = PALETTE[row[x]];
        ctx.fillRect(x, y, 1, 1);
      }
    });
    tex.refresh();
  }
}
