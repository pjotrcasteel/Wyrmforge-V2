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
  assert.match(source, /for \(const \{ channel, key, image \} of this\.#terrainTileImages\.values\(\)\)/);
  assert.match(source, /this\.#terrainCache\.upload\(channel, key, image\)/);
});

test('material shader samples normal and ORM arrays with explicit fallback', () => {
  assert.match(source, /sampler2DArray uTerrainNormal/);
  assert.match(source, /sampler2DArray uTerrainOrm/);
  assert.match(source, /normalLayer >= 0\.0/);
  assert.match(source, /ormLayer >= 0\.0/);
  assert.match(source, /tangentNormal/);
  assert.match(source, /terrainNormal: gl\.getUniformLocation/);
  assert.match(source, /terrainOrm: gl\.getUniformLocation/);
  assert.match(source, /\['normal', 2/);
  assert.match(source, /\['orm', 3/);
});

test('normal and ORM maps are sampled only when corresponding terrain layers are uploaded', () => {
  assert.match(source, /sampler2DArray uTerrainNormal/);
  assert.match(source, /sampler2DArray uTerrainOrm/);
  assert.match(source, /layer >= 0\.0 && normalLayer >= 0\.0/);
  assert.match(source, /layer >= 0\.0 && ormLayer >= 0\.0/);
  assert.match(source, /vec3 detailedNormal = normalize/);
  assert.match(source, /lighting \*= mix\(0\.65, 1\.0, orm\.r\)/);
  assert.match(source, /\['normal', 2/);
  assert.match(source, /\['orm', 3/);
});
