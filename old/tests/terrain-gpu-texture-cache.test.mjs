import test from 'node:test';
import assert from 'node:assert/strict';
import { compileTerrainTextureManifest } from '../src/terrain-texture-manifest.mjs';
import { TerrainGpuTextureCache } from '../src/terrain-gpu-texture-cache.mjs';

function fakeGl(maxLayers = 256) {
  const calls = [];
  const gl = {
    TEXTURE_2D_ARRAY: 1, MAX_ARRAY_TEXTURE_LAYERS: 2, SRGB8_ALPHA8: 3,
    RGBA8: 4, TEXTURE_MIN_FILTER: 5, TEXTURE_MAG_FILTER: 6,
    LINEAR_MIPMAP_LINEAR: 17,
    TEXTURE_WRAP_S: 7, TEXTURE_WRAP_T: 8, LINEAR: 9, REPEAT: 10,
    UNPACK_FLIP_Y_WEBGL: 11, RGBA: 12, UNSIGNED_BYTE: 13,
    getParameter: () => maxLayers,
    createTexture: () => ({}),
    bindTexture: (...args) => calls.push(['bind', ...args]),
    texStorage3D: (...args) => calls.push(['storage', ...args]),
    texParameteri: (...args) => calls.push(['parameter',...args]),
    pixelStorei: () => {},
    generateMipmap: (...args) => calls.push(['mipmap',...args]),
    texSubImage3D: (...args) => {
      // A permissive mock previously allowed eight arguments and hid the
      // native Safari TypeError until a player opened the material preview.
      if (args.length !== 11) throw new TypeError('Not enough arguments');
      calls.push(['upload', ...args]);
    },
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
  assert.equal(upload.length, 12, 'TexImageSource overload requires 11 WebGL arguments');
  assert.deepEqual(upload.slice(1, 9), [
    gl.TEXTURE_2D_ARRAY, 0, 0, 0, layer, 16, 16, 1
  ]);
  assert.equal(upload[9], gl.RGBA);
  assert.equal(upload[10], gl.UNSIGNED_BYTE);
  assert.equal(upload[11].width, 16);
  assert.equal(upload[11].height, 16);
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

test('native WebGL2 argument contract holds for color, normal and ORM tiles', () => {
  const { gl, calls } = fakeGl();
  const cache = new TerrainGpuTextureCache(gl, manifest);
  cache.initialize();
  for (const channel of ['albedo', 'normal', 'orm']) {
    const asset = manifest.assets.find(candidate => candidate.channel === channel);
    const image = { width: manifest.tileSize, height: manifest.tileSize };
    cache.upload(channel, asset.key, image);
  }
  const callsToUpload = calls.filter(call => call[0] === 'upload');
  assert.equal(callsToUpload.length, 3);
  for (const call of callsToUpload) {
    assert.equal(call.length, 12);
    assert.equal(call[6], manifest.tileSize);
    assert.equal(call[7], manifest.tileSize);
    assert.equal(call[8], 1, 'each tile occupies exactly one texture-array layer');
  }
  assert.equal(cache.statistics.uploadedAssets, 3);
  cache.dispose();
});

test('full 64px mip chain uses trilinear filtering and regenerates after each valid upload',()=>{
  const mips=compileTerrainTextureManifest(undefined,{tileSize:64,mipLevels:7});
  const {gl,calls}=fakeGl();
  const cache=new TerrainGpuTextureCache(gl,mips);
  cache.initialize();
  const initial=cache.statistics;
  assert.equal(initial.mipLevels,7);
  assert.equal(initial.mipGenerations,0);
  assert.equal(initial.allocatedBytes,mips.estimatedBytes);
  const storage=calls.filter(c=>c[0]==='storage');
  assert.equal(storage.length,3);
  for(const call of storage) {
    assert.equal(call[2],7);
    assert.equal(call[4],64);
    assert.equal(call[5],64);
  }
  // Inspect the exact WebGL2 minification filter, not a mock-side flag.
  const filterCalls=calls.filter(c=>c[0]==='parameter' && c[2]===gl.TEXTURE_MIN_FILTER);
  assert.equal(filterCalls.length,3);
  assert.ok(filterCalls.every(c=>c[3]===gl.LINEAR_MIPMAP_LINEAR));
  for(const channel of ['albedo','normal','orm']) {
    const asset=mips.assets.find(a=>a.channel===channel);
    cache.upload(channel,asset.key,{width:64,height:64});
  }
  assert.equal(cache.statistics.uploadedAssets,3);
  assert.equal(cache.statistics.mipGenerations,3);
  assert.equal(calls.filter(c=>c[0]==='mipmap').length,3);
  assert.ok(calls.every(c=>c[0]!=='mipmap' || c[1]===gl.TEXTURE_2D_ARRAY));
  cache.contextLost();
  assert.equal(cache.statistics.mipGenerations,0);
  cache.contextRestored();
  assert.equal(cache.statistics.allocatedBytes,mips.estimatedBytes);
  assert.equal(cache.statistics.uploadedAssets,0);
  cache.dispose();
});

test('one-level legacy material manifest does not invoke mip generation',()=>{
  const {gl,calls}=fakeGl();
  const cache=new TerrainGpuTextureCache(gl,manifest);
  cache.initialize();
  const asset=manifest.assets[0];
  cache.upload(asset.channel,asset.key,{width:16,height:16});
  assert.equal(cache.statistics.mipGenerations,0);
  assert.equal(calls.filter(c=>c[0]==='mipmap').length,0);
  const filters=calls.filter(c=>c[0]==='parameter' && c[2]===gl.TEXTURE_MIN_FILTER);
  assert.ok(filters.every(c=>c[3]===gl.LINEAR));
  cache.dispose();
});
