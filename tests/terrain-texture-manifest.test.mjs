import test from 'node:test';
import assert from 'node:assert/strict';
import { compileTerrainTextureManifest, TERRAIN_TEXTURE_DEFAULTS } from '../src/terrain-texture-manifest.mjs';
import { TERRAIN_SURFACE_LIBRARY } from '../src/terrain-surface-library.mjs';

test('manifest compiles all material variants without touching voxel IDs', () => {
  const manifest = compileTerrainTextureManifest();
  assert.equal(Object.keys(manifest.surfaces).length, 4);
  assert.equal(manifest.surfaces['terrain/grass'].length, 2);
  assert.ok(manifest.assets.every(asset => ['srgb', 'linear'].includes(asset.colorSpace)));
  assert.equal(manifest.estimatedBytes, manifest.assets.length * 256 * 256 * 4);
  assert.deepEqual(TERRAIN_TEXTURE_DEFAULTS.normal, [128, 128, 255, 255]);
  assert.deepEqual(TERRAIN_TEXTURE_DEFAULTS.orm, [255, 255, 0, 255]);
});

test('shared texture keys are deduplicated per channel', () => {
  const shared = {
    ...TERRAIN_SURFACE_LIBRARY,
    'terrain/grass': {
      scale: 4,
      variants: [
        { key: 'one', weight: 1, textures: { albedo: 'same', normal: 'same' } },
        { key: 'two', weight: 1, textures: { albedo: 'same', normal: 'same' } }
      ]
    }
  };
  const manifest = compileTerrainTextureManifest(shared);
  assert.equal(manifest.assets.filter(asset => asset.key === 'same').length, 2);
});

test('budget checks prevent excessive allocation before GPU upload', () => {
  assert.throws(() => compileTerrainTextureManifest(undefined, { tileSize: 250 }), RangeError);
  assert.throws(() => compileTerrainTextureManifest(undefined, { maxLayers: 1 }), RangeError);
  assert.throws(() => compileTerrainTextureManifest(undefined, { maxEstimatedBytes: 1000 }), RangeError);
});

test('missing optional maps receive neutral defaults, not fake asset paths', () => {
  const custom = {
    ...TERRAIN_SURFACE_LIBRARY,
    'terrain/stone': {
      scale: 4,
      variants: [{ key: 'plain', weight: 1, textures: { albedo: 'stone/plain' } }]
    }
  };
  const manifest = compileTerrainTextureManifest(custom);
  const slots = manifest.surfaces['terrain/stone'][0].slots;
  assert.equal(slots.normal, null);
  assert.equal(slots.orm, null);
  assert.equal(slots.height, null);
});
