import test from 'node:test';
import assert from 'node:assert/strict';
import { WebGLVoxelView } from '../src/webgl-voxel-view.mjs';
import { compileTerrainTextureManifest } from '../src/terrain-texture-manifest.mjs';

const assets = compileTerrainTextureManifest().assets.filter(asset => asset.channel === 'albedo');
const image = () => ({ width: 64, height: 64 });

function fakeCanvas() {
  const listeners = new Map();
  const uploaded = [];
  let lost = false;
  let clock = 0;
  let failNextUpload = false;
  const gl = {
    VERTEX_SHADER: 1, FRAGMENT_SHADER: 2, COMPILE_STATUS: 3, LINK_STATUS: 4,
    DEPTH_TEST: 5, LEQUAL: 6, BLEND: 7, CULL_FACE: 8,
    MAX_ARRAY_TEXTURE_LAYERS: 9, TEXTURE_2D_ARRAY: 10,
    SRGB8_ALPHA8: 11, RGBA8: 12, TEXTURE_MIN_FILTER: 13,
    TEXTURE_MAG_FILTER: 14, TEXTURE_WRAP_S: 15, TEXTURE_WRAP_T: 16,
    LINEAR: 17, REPEAT: 18, UNPACK_FLIP_Y_WEBGL: 19,
    LINEAR_MIPMAP_LINEAR: 27,
    RGBA: 20, UNSIGNED_BYTE: 21, ARRAY_BUFFER: 22,
    ELEMENT_ARRAY_BUFFER: 23, STATIC_DRAW: 24,
    FLOAT: 25, BYTE: 26,
    createShader: () => ({}), shaderSource() {}, compileShader() {},
    getShaderParameter: () => true, deleteShader() {},
    createProgram: () => ({}), attachShader() {}, linkProgram() {},
    getProgramParameter: () => true, getUniformLocation: () => ({}),
    enable() {}, depthFunc() {}, disable() {}, deleteProgram() {},
    createTexture: () => ({}), deleteTexture() {}, bindTexture() {},
    getParameter: () => 256, texStorage3D() {}, texParameteri() {},
    generateMipmap(target) {
      if(target!==gl.TEXTURE_2D_ARRAY) throw new Error('Unexpected mip target');
      clock += 1;
    },
    createVertexArray: () => ({}), bindVertexArray() {}, deleteVertexArray() {},
    createBuffer: () => ({}), bindBuffer() {}, deleteBuffer() {},
    bufferData() { clock += 3; }, enableVertexAttribArray() {},
    vertexAttribPointer() {},
    pixelStorei() {},
    texSubImage3D(...args) {
      if (args.length !== 11) {
        throw new TypeError('Not enough arguments');
      }
      if (failNextUpload) {
        failNextUpload = false;
        throw new Error('Simulated texture upload failure');
      }
      uploaded.push(args);
      clock += 3;
    },
    isContextLost: () => lost,
    getExtension: () => null
  };
  const canvas = {
    getContext: name => name === 'webgl2' ? gl : null,
    addEventListener: (event, handler) => listeners.set(event, handler)
  };
  return {
    canvas, uploaded, now: () => clock,
    failOnce: () => { failNextUpload = true; },
    lose: () => {
      lost = true;
      listeners.get('webglcontextlost')({ preventDefault() {} });
    },
    restore: () => {
      lost = false;
      listeners.get('webglcontextrestored')();
    }
  };
}

test('authored terrain tile replacement remains queued and last write wins', () => {
  const runtime = fakeCanvas();
  const view = new WebGLVoxelView(runtime.canvas);
  const first = image();
  const latest = image();
  view.setTerrainMaterialTile('albedo', assets[0].key, first);
  view.setTerrainMaterialTile('albedo', assets[0].key, latest);
  assert.equal(runtime.uploaded.length, 0, 'setting tiles must not synchronously upload');
  assert.equal(view.pendingUploads, 1, 'same channel/key must coalesce');
  assert.equal(view.terrainTileStagingStatistics.retainedTiles, 1);
  assert.equal(view.terrainTileStagingStatistics.pendingTiles, 1);
  assert.equal(view.flushQueuedUploads({ budgetMs: 2, now: runtime.now }).chunks, 1);
  assert.equal(runtime.uploaded.length, 1);
  assert.equal(runtime.uploaded[0].at(-1), latest, 'the last submitted image is uploaded');
  assert.equal(view.pendingUploads, 0);
  view.dispose();
});

test('texture uploads respect one non-preemptible tile per exceeded frame budget', () => {
  const runtime = fakeCanvas();
  const view = new WebGLVoxelView(runtime.canvas);
  for (const asset of assets.slice(0, 3)) view.setTerrainAlbedoTile(asset.key, image());
  assert.equal(view.pendingUploads, 3);
  for (let remaining = 2; remaining >= 0; remaining--) {
    const step = view.flushQueuedUploads({ budgetMs: 2, now: runtime.now });
    assert.equal(step.chunks, 1);
    assert.equal(view.pendingUploads, remaining);
    assert.equal(view.uploadQueueStatistics.pendingTextureTiles, remaining);
  }
  assert.equal(runtime.uploaded.length, 3);
  view.dispose();
});

test('context loss requeues the latest retained tile without uploading during loss', () => {
  const runtime = fakeCanvas();
  const view = new WebGLVoxelView(runtime.canvas);
  view.setTerrainAlbedoTile(assets[0].key, image());
  view.flushQueuedUploads({ budgetMs: 2, now: runtime.now });
  const replacement = image();
  view.setTerrainAlbedoTile(assets[0].key, replacement);
  runtime.lose();
  assert.equal(view.ready, false);
  assert.equal(view.pendingUploads, 0);
  assert.equal(view.flushQueuedUploads({ budgetMs: 2, now: runtime.now }).chunks, 0);
  runtime.restore();
  assert.equal(view.ready, true);
  assert.equal(view.pendingUploads, 1);
  assert.equal(runtime.uploaded.length, 1, 'restore event must not upload synchronously');
  view.flushQueuedUploads({ budgetMs: 2, now: runtime.now });
  assert.equal(runtime.uploaded.length, 2);
  assert.equal(runtime.uploaded[1].at(-1), replacement);
  view.dispose();
});

test('failed texture upload stays pending for a retry, clearing rejects pending work', () => {
  const runtime = fakeCanvas();
  const view = new WebGLVoxelView(runtime.canvas);
  view.setTerrainAlbedoTile(assets[0].key, image());
  runtime.failOnce();
  assert.throws(() => view.flushQueuedUploads({ now: runtime.now }), /Simulated texture upload failure/);
  assert.equal(view.pendingUploads, 1);
  assert.equal(view.flushQueuedUploads({ now: runtime.now }).chunks, 1);
  assert.equal(view.pendingUploads, 0);
  view.setTerrainAlbedoTile(assets[1].key, image());
  view.clearTerrainAlbedoTiles();
  assert.equal(view.pendingUploads, 0);
  assert.equal(view.terrainTileStagingStatistics.estimatedDecodedBytes, 0);
  assert.equal(view.flushQueuedUploads({ now: runtime.now }).chunks, 0);
  view.dispose();
});

test('renderer uses native 64px material tiles and rejects legacy 256px array images', () => {
  const runtime=fakeCanvas();
  const view=new WebGLVoxelView(runtime.canvas);
  const color=assets[0];
  assert.throws(()=>view.setTerrainAlbedoTile(color.key,{width:256,height:256}),/manifest dimensions/);
  view.setTerrainAlbedoTile(color.key,image());
  assert.equal(view.terrainTileStagingStatistics.estimatedDecodedBytes,64*64*4);
  assert.equal(view.flushQueuedUploads({budgetMs:2,now:runtime.now}).chunks,1);
  assert.equal(runtime.uploaded.at(-1).at(-1).width,64);
  assert.equal(view.statistics.terrainGpuTextureBytesEstimate,
    compileTerrainTextureManifest(undefined,{tileSize:64,mipLevels:7}).estimatedBytes);
  assert.equal(view.pendingUploads,0);
  view.dispose();
});

test('all three authored channels recover incrementally without changing voxel geometry',()=>{
  const runtime=fakeCanvas();
  const view=new WebGLVoxelView(runtime.canvas);
  const slots=compileTerrainTextureManifest(undefined,{tileSize:64}).assets;
  const names=['albedo','normal','orm'];
  const layers=names.map(channel=>slots.find(asset=>asset.channel===channel));
  for(const asset of layers) view.setTerrainMaterialTile(asset.channel,asset.key,image());
  assert.equal(view.pendingUploads,3);
  assert.equal(runtime.uploaded.length,0);
  for(let i=0;i<3;i++) view.flushQueuedUploads({budgetMs:2,now:runtime.now});
  assert.equal(runtime.uploaded.length,3);
  assert.equal(view.pendingUploads,0);
  runtime.lose();
  assert.equal(view.pendingUploads,0);
  runtime.restore();
  assert.equal(view.pendingUploads,3,'restore retains every authored channel');
  assert.equal(runtime.uploaded.length,3,'restore callback does not bulk-upload');
  for(let i=0;i<3;i++) view.flushQueuedUploads({budgetMs:2,now:runtime.now});
  assert.equal(runtime.uploaded.length,6);
  assert.equal(view.pendingUploads,0);
  view.dispose();
});

function smallMesh() {
  return {
    id:'0,0,0',origin:[0,0,0],positions:new Float32Array(9),
    normals:new Int8Array(9),materials:new Uint8Array(3),
    indices:new Uint32Array([0,1,2]),triangleCount:1,cpuBufferBytes:60
  };
}

test('a preview texture cannot block geometry presentation on a cold start',()=>{
  const runtime = fakeCanvas();
  const view = new WebGLVoxelView(runtime.canvas);
  view.setMeshes([smallMesh()]);
  view.setTerrainAlbedoTile(assets[0].key, image());
  assert.equal(view.uploadQueueStatistics.sceneChunks, 1);
  assert.equal(view.uploadQueueStatistics.pendingTextureTiles, 1);
  assert.equal(view.statistics.drawCalls, 0);
  const first=view.flushQueuedUploads({budgetMs:2,now:runtime.now});
  assert.equal(first.chunks,1);
  assert.equal(view.statistics.drawCalls,1,'terrain must be uploaded before optional art');
  assert.equal(runtime.uploaded.length,0,'art cannot prevent the terrain reaching the GPU');
  assert.equal(view.uploadQueueStatistics.pendingTextureTiles,1);
  const second=view.flushQueuedUploads({budgetMs:2,now:runtime.now});
  assert.equal(second.chunks,1);
  assert.equal(runtime.uploaded.length,1);
  assert.equal(runtime.uploaded[0].length,11,'native WebGL2 TexImageSource signature');
  assert.deepEqual(runtime.uploaded[0].slice(5,8),[64,64,1]);
  assert.equal(view.pendingUploads,0);
  view.dispose();
});

test('context restore prioritizes terrain geometry over retained material maps',()=>{
  const runtime=fakeCanvas();
  const view=new WebGLVoxelView(runtime.canvas);
  view.setMeshes([smallMesh()]);
  view.setTerrainAlbedoTile(assets[0].key,image());
  while(view.pendingUploads) view.flushQueuedUploads({budgetMs:2,now:runtime.now});
  runtime.lose();
  runtime.restore();
  assert.equal(view.uploadQueueStatistics.recoveryChunks,1);
  assert.equal(view.uploadQueueStatistics.pendingTextureTiles,1);
  const uploadedBefore=runtime.uploaded.length;
  view.flushQueuedUploads({budgetMs:2,now:runtime.now});
  assert.equal(view.statistics.drawCalls,1,'restored world recovers before art');
  assert.equal(runtime.uploaded.length,uploadedBefore);
  view.flushQueuedUploads({budgetMs:2,now:runtime.now});
  assert.equal(runtime.uploaded.length,uploadedBefore+1);
  view.dispose();
});

test('real renderer mip allocation stays bounded during material uploads and context restore',()=>{
  const runtime=fakeCanvas();
  const view=new WebGLVoxelView(runtime.canvas);
  const mips=compileTerrainTextureManifest(undefined,{tileSize:64,mipLevels:7});
  const baseline=view.statistics.terrainGpuTextureBytesEstimate;
  assert.equal(baseline,0);
  const chosen=assets.slice(0,3);
  for(const asset of chosen) view.setTerrainAlbedoTile(asset.key,image());
  assert.equal(view.pendingUploads,3);
  while(view.pendingUploads) view.flushQueuedUploads({budgetMs:2,now:runtime.now});
  assert.equal(view.statistics.terrainGpuTextureBytesEstimate,mips.estimatedBytes);
  assert.equal(runtime.uploaded.length,3);
  for(const result of runtime.uploaded) {
    assert.equal(result.length,11);
    assert.deepEqual(result.slice(5,8),[64,64,1]);
  }
  runtime.lose();
  runtime.restore();
  assert.equal(view.pendingUploads,3);
  while(view.pendingUploads) view.flushQueuedUploads({budgetMs:2,now:runtime.now});
  assert.equal(view.statistics.terrainGpuTextureBytesEstimate,mips.estimatedBytes);
  assert.equal(view.pendingUploads,0);
  view.dispose();
});
