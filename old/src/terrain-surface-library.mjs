// Data-driven V2 surface variants. This module does not load GPU textures or change voxel IDs.
// Variants are stable across chunk remeshing and destruction: selection uses world coordinates.
import { terrainSurfaceKey } from './terrain-materials.mjs';

export const TERRAIN_SURFACE_LIBRARY = Object.freeze({
  'terrain/grass': Object.freeze({
    variants: Object.freeze([
      Object.freeze({ key: 'meadow', weight: 6, textures: Object.freeze({ albedo: 'grass/meadow/albedo', normal: 'grass/meadow/normal', orm: 'grass/meadow/orm' }) }),
      Object.freeze({ key: 'meadow-dark', weight: 2, textures: Object.freeze({ albedo: 'grass/meadow-dark/albedo', normal: 'grass/meadow-dark/normal', orm: 'grass/meadow-dark/orm' }) })
    ]),
    scale: 4
  }),
  'terrain/grass-soil-side': Object.freeze({
    variants: Object.freeze([Object.freeze({ key: 'rooted-soil', weight: 1, textures: Object.freeze({ albedo: 'grass/rooted-soil/albedo', normal: 'grass/rooted-soil/normal', orm: 'grass/rooted-soil/orm' }) })]),
    scale: 4
  }),
  'terrain/dirt': Object.freeze({
    variants: Object.freeze([
      Object.freeze({ key: 'earth', weight: 4, textures: Object.freeze({ albedo: 'dirt/earth/albedo', normal: 'dirt/earth/normal', orm: 'dirt/earth/orm' }) }),
      Object.freeze({ key: 'earth-dark', weight: 1, textures: Object.freeze({ albedo: 'dirt/earth-dark/albedo', normal: 'dirt/earth-dark/normal', orm: 'dirt/earth-dark/orm' }) })
    ]),
    scale: 4
  }),
  'terrain/stone': Object.freeze({
    variants: Object.freeze([Object.freeze({ key: 'bedrock', weight: 1, textures: Object.freeze({ albedo: 'stone/bedrock/albedo', normal: 'stone/bedrock/normal', orm: 'stone/bedrock/orm' }) })]),
    scale: 4
  })
});

function hashCell(x, y, z, seed) {
  // Integer arithmetic is deterministic in JS, including negative world coordinates.
  let value = Math.imul(x, 374761393) ^ Math.imul(y, 668265263) ^
    Math.imul(z, 2147483647) ^ Math.imul(seed, 1274126177);
  value = Math.imul(value ^ (value >>> 13), 1274126177);
  return (value ^ (value >>> 16)) >>> 0;
}

/** Selects a deterministic variant for an exposed face, without changing its voxel material. */
export function selectTerrainVariant(materialId, normalY, world, seed = 0, library = TERRAIN_SURFACE_LIBRARY) {
  const surfaceKey = terrainSurfaceKey(materialId, normalY);
  const surface = surfaceKey === null ? null : library[surfaceKey];
  if (!surface) return null;
  if (!world || !['x', 'y', 'z'].every(axis => Number.isFinite(world[axis])) ||
      !Number.isSafeInteger(seed) || !Number.isFinite(surface.scale) || surface.scale <= 0 ||
      !Array.isArray(surface.variants) || surface.variants.length === 0) {
    throw new TypeError('Invalid terrain variant input');
  }
  const total = surface.variants.reduce((sum, variant) => {
    if (!Number.isSafeInteger(variant.weight) || variant.weight <= 0) {
      throw new TypeError('Variant weights must be positive integers');
    }
    return sum + variant.weight;
  }, 0);
  if (!Number.isSafeInteger(total)) throw new RangeError('Variant weights exceed safe integer range');
  const x = Math.floor(world.x / surface.scale);
  const y = Math.floor(world.y / surface.scale);
  const z = Math.floor(world.z / surface.scale);
  let choice = hashCell(x, y, z, seed) % total;
  for (const variant of surface.variants) {
    if (choice < variant.weight) return Object.freeze({ surfaceKey, variantKey: variant.key, textures: variant.textures });
    choice -= variant.weight;
  }
  throw new Error('Variant selection failed');
}

/** Validate user-supplied packs before allocating any GPU resources. */
export function validateTerrainSurfaceLibrary(library) {
  if (!library || typeof library !== 'object') throw new TypeError('Expected material library');
  for (const key of ['terrain/grass', 'terrain/grass-soil-side', 'terrain/dirt', 'terrain/stone']) {
    const surface = library[key];
    if (!surface || !Number.isFinite(surface.scale) || surface.scale <= 0 ||
        !Array.isArray(surface.variants) || surface.variants.length === 0) {
      throw new TypeError('Missing or invalid terrain surface: ' + key);
    }
    const keys = new Set();
    for (const variant of surface.variants) {
      if (!variant || typeof variant.key !== 'string' || !variant.key ||
          keys.has(variant.key) || !Number.isSafeInteger(variant.weight) || variant.weight <= 0 ||
          !variant.textures || typeof variant.textures.albedo !== 'string' || !variant.textures.albedo) {
        throw new TypeError('Invalid terrain variant: ' + key);
      }
      keys.add(variant.key);
    }
  }
  return true;
}
