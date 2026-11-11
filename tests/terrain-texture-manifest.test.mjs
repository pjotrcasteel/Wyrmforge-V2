import test from 'node:test';
import assert from 'node:assert/strict';
import { compileTerrainTextureManifest, estimateTerrainTextureBytes, TERRAIN_TEXTURE_DEFAULTS } from '../src/terrain-texture-manifest.mjs';
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


test('GPU memory estimate accounts for every allocated mip level', () => {
  const manifest = compileTerrainTextureManifest(undefined, { tileSize: 16, mipLevels: 5 });
  const layers = manifest.assets.length;
  assert.equal(manifest.mipLevels, 5);
  assert.equal(manifest.estimatedBytes, layers * 4 * (256 + 64 + 16 + 4 + 1));
  assert.equal(estimateTerrainTextureBytes(16, manifest.layersByChannel), layers * 16 * 16 * 4);
  assert.throws(() => compileTerrainTextureManifest(undefined, { tileSize: 16, mipLevels: 6 }), RangeError);
  assert.throws(() => compileTerrainTextureManifest(undefined, {
    tileSize: 16, mipLevels: 5, maxEstimatedBytes: layers * 16 * 16 * 4
  }), RangeError);
});

test('texture cache rejects mismatched manifest accounting before GPU allocation', async () => {
  const { TerrainGpuTextureCache } = await import('../src/terrain-gpu-texture-cache.mjs');
  let created = 0;
  const gl = { createTexture() { created++; return {}; },
    getParameter() { return 256; }, MAX_ARRAY_TEXTURE_LAYERS: 1 };
  const manifest = compileTerrainTextureManifest();
  const cache = new TerrainGpuTextureCache(gl, { ...manifest, estimatedBytes: 1 });
  assert.throws(() => cache.initialize(), /estimate mismatch/);
  assert.equal(created, 0);
});
