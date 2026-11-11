// Deterministic, tileable reference albedo textures for the first visual inspection.
// These are temporary art placeholders, not the final authored Wyrmforge textures.
// Pixel values depend only on wrapped tile coordinates, never on chunk boundaries.
export const REFERENCE_TERRAIN_KEYS = Object.freeze({
  'grass/meadow/albedo': 'grass',
  'grass/meadow-dark/albedo': 'grass-dark',
  'grass/rooted-soil/albedo': 'roots',
  'dirt/earth/albedo': 'dirt',
  'dirt/earth-dark/albedo': 'dirt-dark',
  'stone/bedrock/albedo': 'stone'
});

function hash(x, y, seed) {
  let n = Math.imul(x, 374761393) ^ Math.imul(y, 668265263) ^ seed;
  n = Math.imul(n ^ (n >>> 13), 1274126177);
  return ((n ^ (n >>> 16)) >>> 0) / 4294967295;
}

function wrap(value, size) { return ((value % size) + size) % size; }

function smoothNoise(x, y, frequency, seed) {
  const sx = x / frequency;
  const sy = y / frequency;
  const x0 = Math.floor(sx);
  const y0 = Math.floor(sy);
  const tx = sx - x0;
  const ty = sy - y0;
  const fx = tx * tx * (3 - 2 * tx);
  const fy = ty * ty * (3 - 2 * ty);
  const period = 256 / frequency;
  const n = (dx, dy) => hash(wrap(x0 + dx, period), wrap(y0 + dy, period), seed);
  const a = n(0, 0) * (1 - fx) + n(1, 0) * fx;
  const b = n(0, 1) * (1 - fx) + n(1, 1) * fx;
  return a * (1 - fy) + b * fy;
}

/** Pure pixel generator, useful for repeatability and seam tests. */
export function createReferenceTerrainPixels(kind, size = 256) {
  if (!['grass', 'grass-dark', 'roots', 'dirt', 'dirt-dark', 'stone'].includes(kind) || size !== 256) {
    throw new RangeError('Unknown reference terrain material or tile size');
  }
  const data = new Uint8ClampedArray(size * size * 4);
  const palettes = {
    grass: [65, 93, 39], 'grass-dark': [42, 70, 32], roots: [103, 72, 46],
    dirt: [113, 76, 48], 'dirt-dark': [78, 55, 39], stone: [102, 107, 110]
  };
  const base = palettes[kind];
  const seed = { grass: 11, 'grass-dark': 17, roots: 29, dirt: 47, 'dirt-dark': 53, stone: 71 }[kind];
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const low = smoothNoise(x, y, 32, seed);
      const mid = smoothNoise(x, y, 8, seed + 3);
      const fine = hash(x, y, seed + 9);
      const grain = (low - 0.5) * 43 + (mid - 0.5) * 29 + (fine - 0.5) * 17;
      const grassBlade = (kind === 'grass' || kind === 'grass-dark') && hash(Math.floor(x / 2), Math.floor(y / 5), seed + 19) > 0.78;
      const stoneVein = kind === 'stone' && Math.abs(mid - 0.49) < 0.065;
      const roots = kind === 'roots' && Math.abs(mid - 0.52) < 0.055;
      const detail = grassBlade ? 16 : stoneVein ? -20 : roots ? -15 : 0;
      const i = (y * size + x) * 4;
      data[i] = Math.max(0, Math.min(255, base[0] + grain + detail));
      data[i + 1] = Math.max(0, Math.min(255, base[1] + grain + (grassBlade ? 19 : detail)));
      data[i + 2] = Math.max(0, Math.min(255, base[2] + grain + detail));
      data[i + 3] = 255;
    }
  }
  return data;
}

export function createReferenceTerrainCanvas(kind, documentRef = document) {
  const canvas = documentRef.createElement('canvas');
  canvas.width = 256;
  canvas.height = 256;
  const context = canvas.getContext('2d');
  if (!context) throw new Error('2D canvas is unavailable');
  const image = context.createImageData(256, 256);
  image.data.set(createReferenceTerrainPixels(kind));
  context.putImageData(image, 0, 0);
  return canvas;
}
