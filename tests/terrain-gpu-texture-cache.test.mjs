import test from 'node:test';
import assert from 'node:assert/strict';
import { compileTerrainTextureManifest } from '../src/terrain-texture-manifest.mjs';
import { TerrainGpuTextureCache } from '../src/terrain-gpu-texture-cache.mjs';

function fakeGl(maxLayers = 256) {
  const calls = [];
  const gl = {
    TEXTURE_2D_ARRAY: 1, MAX_ARRAY_TEXTURE_LAYERS: 2, SRGB8_ALPHA8: 3,
    RGBA8: 4, TEXTURE_MIN_FILTER: 5, TEXTURE_MAG_FILTER: 6,
    TEXTURE_WRAP_S: 7, TEXTURE_WRAP_T: 8, LINEAR: 9, REPEAT: 10,
    UNPACK_FLIP_Y_WEBGL: 11, RGBA: 12, UNSIGNED_BYTE: 13,
    getParameter: () => maxLayers,
    createTexture: () => ({}),
    bindTexture: (...args) => calls.push(['bind', ...args]),
    texStorage3D: (...args) => calls.push(['storage', ...args]),
    texParameteri: () => {},
    pixelStorei: () => {},
    texSubImage3D: (...args) => calls.push(['upload', ...args]),
    deleteTexture: () => calls.push(['delete'])
  };
  return { gl, calls };
}

const manifest = compileTerrainTextureManifest(undefined, { tileSize: 16 });

test('allocates one sRGB or linear array per used channel within budget', () => {
  const { gl, calls } = fakeGl();
  const cache = new TerrainGpuTextureCache(gl, manifest);
  cache.initialize();
  assert.equal(cache.statistics.allocatedChannels, 3);
  assert.ok(calls.some(call => call[0] === 'storage' && call[3] === gl.SRGB8_ALPHA8));
  assert.ok(calls.some(call => call[0] === 'storage' && call[3] === gl.RGBA8));
  assert.equal(cache.statistics.allocatedBytes, manifest.estimatedBytes);
  cache.dispose();
  assert.equal(cache.statistics.allocatedBytes, 0);
});

test('uploads tile to stable layer and resets handles on context loss', () => {
  const { gl, calls } = fakeGl();
  const cache = new TerrainGpuTextureCache(gl, manifest);
  const asset = manifest.assets[0];
  cache.initialize();
  assert.equal(cache.getLayer(asset.channel, asset.key), null);
  const layer = cache.upload(asset.channel, asset.key, { width: 16, height: 16 });
  assert.equal(cache.getLayer(asset.channel, asset.key), layer);
  assert.equal(calls.filter(call => call[0] === 'upload').length, 1);
  const upload = calls.find(call => call[0] === 'upload');
  assert.equal(upload.length, 9, 'TexImageSource overload requires exactly eight WebGL arguments');
  assert.equal(upload[8].width, 16);
  assert.equal(upload[8].height, 16);
  cache.contextLost();
  assert.equal(cache.statistics.allocatedBytes, 0);
  assert.equal(cache.getLayer(asset.channel, asset.key), null);
  assert.throws(() => cache.upload(asset.channel, asset.key, { width: 16, height: 16 }));
  cache.contextRestored();
  assert.equal(cache.getLayer(asset.channel, asset.key), null);
  cache.dispose();
});

test('rejects excessive GPU allocation and invalid tiles', () => {
  const { gl } = fakeGl(1);
  assert.throws(() => new TerrainGpuTextureCache(gl, manifest).initialize(), RangeError);
  const { gl: normalGl } = fakeGl();
  assert.throws(() => new TerrainGpuTextureCache(normalGl, manifest, { maxBytes: 10 }).initialize(), RangeError);
  const cache = new TerrainGpuTextureCache(normalGl, manifest);
  cache.initialize();
  const asset = manifest.assets[0];
  assert.throws(() => cache.upload(asset.channel, asset.key, { width: 8, height: 16 }), RangeError);
  assert.throws(() => cache.upload('normal', 'missing', { width: 16, height: 16 }), RangeError);
  cache.dispose();
});
