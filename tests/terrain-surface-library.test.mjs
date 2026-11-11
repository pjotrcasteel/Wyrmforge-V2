import test from 'node:test';
import assert from 'node:assert/strict';
import { TERRAIN_SURFACE_LIBRARY, selectTerrainVariant,
  validateTerrainSurfaceLibrary } from '../src/terrain-surface-library.mjs';

test('built-in library covers all exposed material surfaces', () => {
  assert.equal(validateTerrainSurfaceLibrary(TERRAIN_SURFACE_LIBRARY), true);
  for (const [id, normal, expected] of [
    [1, 1, 'terrain/grass'], [1, 0, 'terrain/grass-soil-side'],
    [1, -1, 'terrain/grass-soil-side'], [2, 1, 'terrain/dirt'], [3, 0, 'terrain/stone']
  ]) {
    const variant = selectTerrainVariant(id, normal, { x: 1, y: 2, z: 3 });
    assert.equal(variant.surfaceKey, expected);
    assert.ok(variant.textures.albedo);
  }
  assert.equal(selectTerrainVariant(0, 1, { x: 0, y: 0, z: 0 }), null);
});

test('selection is repeatable and independent of chunk-local coordinates', () => {
  const point = { x: 16.25, y: 4, z: -0.25 };
  const a = selectTerrainVariant(1, 1, point, 42);
  assert.deepEqual(a, selectTerrainVariant(1, 1, { ...point }, 42));
  assert.deepEqual(a, selectTerrainVariant(1, 1, { x: 16.8, y: 4, z: -0.1 }, 42));
});

test('additional variants can be supplied without changing voxel IDs', () => {
  const custom = {
    ...TERRAIN_SURFACE_LIBRARY,
    'terrain/grass': {
      scale: 2,
      variants: [
        { key: 'spring', weight: 1, textures: { albedo: 'spring.png' } },
        { key: 'autumn', weight: 1, textures: { albedo: 'autumn.png' } },
        { key: 'winter', weight: 1, textures: { albedo: 'winter.png' } }
      ]
    }
  };
  assert.equal(validateTerrainSurfaceLibrary(custom), true);
  const variant = selectTerrainVariant(1, 1, { x: -10, y: 0, z: 7 }, 5, custom);
  assert.ok(['spring', 'autumn', 'winter'].includes(variant.variantKey));
});

test('invalid packs are rejected before rendering', () => {
  assert.throws(() => validateTerrainSurfaceLibrary({
    ...TERRAIN_SURFACE_LIBRARY, 'terrain/grass': { scale: 0, variants: [] }
  }), TypeError);
  assert.throws(() => selectTerrainVariant(1, 1, { x: NaN, y: 0, z: 0 }), TypeError);
});
