import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { compileTerrainTextureManifest } from '../src/terrain-texture-manifest.mjs';
import { TERRAIN_SURFACE_LIBRARY } from '../src/terrain-surface-library.mjs';

const source = readFileSync(new URL('../src/webgl-voxel-view.mjs', import.meta.url), 'utf8');

test('renderer binds material texture arrays and keeps procedural fallback', () => {
  assert.match(source, /sampler2DArray uTerrainAlbedo/);
  assert.match(source, /layer >= 0\.0/);
  assert.match(source, /terrainAlbedo: gl\.getUniformLocation/);
  assert.match(source, /gl\.bindTexture\(gl\.TEXTURE_2D_ARRAY/);
  assert.match(source, /vWorld\.xz/);
});

test('all four terrain surfaces resolve to registered albedo assets', () => {
  const manifest = compileTerrainTextureManifest();
  for (const surfaceKey of ['terrain/grass', 'terrain/grass-soil-side', 'terrain/dirt', 'terrain/stone']) {
    const key = TERRAIN_SURFACE_LIBRARY[surfaceKey].variants[0].textures.albedo;
    assert.ok(manifest.assets.some(asset => asset.channel === 'albedo' && asset.key === key));
  }
});

test('context restoration retains authored tiles and rebuilds GPU cache', () => {
  assert.match(source, /this\.#terrainCache\?\.contextLost\(\)/);
  assert.match(source, /for \(const \[key, image\] of this\.#terrainTileImages\)/);
  assert.match(source, /this\.#terrainCache\.upload\('albedo', key, image\)/);
});
