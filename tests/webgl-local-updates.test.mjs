import test from 'node:test';
import assert from 'node:assert/strict';
import { VoxelWorld } from '../src/voxel-world.mjs';
import { markDirtyForEditedVoxel } from '../src/chunk-dirty.mjs';
import { buildExposedFaceMeshes } from '../src/exposed-face-mesher.mjs';
import { WebGLVoxelView } from '../src/webgl-voxel-view.mjs';

function fakeCanvas() {
  let nextId = 0;
  const stats = { createdArrays: [], deletedArrays: [], createdBuffers: [], deletedBuffers: [], draws: [], cameraUniforms: [] };
  const events = new Map();
  const gl = {
    VERTEX_SHADER: 35633, FRAGMENT_SHADER: 35632, COMPILE_STATUS: 35713, LINK_STATUS: 35714,
    DEPTH_TEST: 2929, LEQUAL: 515, BLEND: 3042, CULL_FACE: 2884,
    ARRAY_BUFFER: 34962, ELEMENT_ARRAY_BUFFER: 34963, STATIC_DRAW: 35044,
    FLOAT: 5126, BYTE: 5120, UNSIGNED_BYTE: 5121, UNSIGNED_INT: 5125,
    TRIANGLES: 4, COLOR_BUFFER_BIT: 16384, DEPTH_BUFFER_BIT: 256,
    createShader: () => ({ id: ++nextId }), shaderSource() {}, compileShader() {},
    getShaderParameter: () => true, getShaderInfoLog: () => '',
    deleteShader() {}, createProgram: () => ({ id: ++nextId }), attachShader() {},
    linkProgram() {}, getProgramParameter: () => true, deleteProgram() {},
    getUniformLocation: (_, name) => name, enable() {}, disable() {}, depthFunc() {},
    createVertexArray: () => {
      const vao = { id: ++nextId };
      stats.createdArrays.push(vao);
      return vao;
    },
    deleteVertexArray: vao => stats.deletedArrays.push(vao),
    bindVertexArray() {},
    createBuffer: () => {
      const buffer = { id: ++nextId };
      stats.createdBuffers.push(buffer);
      return buffer;
    },
    deleteBuffer: buffer => stats.deletedBuffers.push(buffer),
    bindBuffer() {}, bufferData() {}, enableVertexAttribArray() {}, vertexAttribPointer() {},
    isContextLost: () => false, viewport() {}, clearColor() {}, clearDepth() {}, clear() {},
    useProgram() {}, uniform2f() {}, uniform1f() {},
    uniform3fv: (location, value) => {
      if (location.startsWith('uCamera')) stats.cameraUniforms.push({ location, value: [...value] });
    },
    drawElements: (...args) => stats.draws.push(args)
  };
  const canvas = {
    getContext: name => name === 'webgl2' ? gl : null,
    addEventListener: (event, listener) => events.set(event, listener)
  };
  return { canvas, stats, events };
}

test('GPU partial replacement removes only modified chunk resources, preserving distant ones', () => {
  const { canvas, stats } = fakeCanvas();
  const view = new WebGLVoxelView(canvas);
  const world = new VoxelWorld();
  world.set(2, 2, 2, 1);
  world.set(20, 2, 2, 3);
  view.setMeshes(buildExposedFaceMeshes(world));
  assert.equal(view.statistics.drawCalls, 2);
  assert.equal(stats.createdArrays.length, 2);
  assert.equal(stats.deletedBuffers.length, 0);

  const dirty = new Set();
  world.set(2, 2, 2, 0);
  markDirtyForEditedVoxel(dirty, world.chunkEdge, 2, 2, 2);
  view.replaceMeshes(dirty, buildExposedFaceMeshes(world, { chunkIds: dirty }));
  assert.equal(view.statistics.drawCalls, 1);
  assert.equal(view.statistics.triangles, 12);
  assert.equal(stats.createdArrays.length, 2);
  assert.equal(stats.deletedArrays.length, 1);
  assert.equal(stats.deletedBuffers.length, 4);

  view.render({ width: 800, height: 600, scale: 11, panX: 0, panY: 0 });
  assert.equal(stats.draws.length, 1);

  world.set(2, 2, 2, 1);
  view.replaceMeshes(dirty, buildExposedFaceMeshes(world, { chunkIds: dirty }));
  assert.equal(view.statistics.drawCalls, 2);
  assert.equal(stats.createdArrays.length, 3);
  assert.equal(stats.deletedArrays.length, 1);
  view.dispose();
  assert.equal(stats.deletedArrays.length, 3);
  assert.equal(stats.deletedBuffers.length, 12);
});

test('a seam edit replaces both touched meshes, and context recovery uploads retained data once', () => {
  const { canvas, events, stats } = fakeCanvas();
  const view = new WebGLVoxelView(canvas);
  const world = new VoxelWorld();
  world.set(15, 3, 3, 2);
  world.set(16, 3, 3, 3);
  view.setMeshes(buildExposedFaceMeshes(world));
  assert.equal(view.statistics.triangles, 20);
  world.set(15, 3, 3, 0);
  const dirty = markDirtyForEditedVoxel(new Set(), 16, 15, 3, 3);
  view.replaceMeshes(dirty, buildExposedFaceMeshes(world, { chunkIds: dirty }));
  assert.equal(stats.deletedArrays.length, 2);
  assert.equal(view.statistics.triangles, 12);

  events.get('webglcontextlost')({ preventDefault() {} });
  assert.equal(view.ready, false);
  events.get('webglcontextrestored')();
  assert.equal(view.ready, true);
  // V2.4 now restores incrementally; GPU resources are not ready immediately.
  assert.equal(view.statistics.drawCalls, 0);
  assert.equal(view.uploadQueueStatistics.recoveryChunks, 1);
  view.flushQueuedUploads({ budgetMs: 2 });
  assert.equal(view.statistics.triangles, 12);
  assert.equal(view.statistics.drawCalls, 1);
  assert.equal(view.uploadQueueStatistics.recoveryChunks, 0);
  view.dispose();
});

test('GPU partial replacement rejects results for unrelated chunks', () => {
  const { canvas } = fakeCanvas();
  const view = new WebGLVoxelView(canvas);
  const world = new VoxelWorld();
  world.set(0, 0, 0, 1);
  const [mesh] = buildExposedFaceMeshes(world);
  assert.throws(() => view.replaceMeshes(['1,0,0'], [mesh]), TypeError);
  assert.throws(() => view.replaceMeshes(null, []), TypeError);
  view.dispose();
});

test('switching camera uniforms does not reallocate or replace GPU chunk buffers', () => {
  const { canvas, stats } = fakeCanvas();
  const view = new WebGLVoxelView(canvas);
  const world = new VoxelWorld();
  world.set(0, 0, 0, 3);
  view.setMeshes(buildExposedFaceMeshes(world));
  const initial = view.statistics;
  const createdBuffers = stats.createdBuffers.length;
  const createdArrays = stats.createdArrays.length;

  for (const camera of ['inspection', 'hunt', 'inspection']) {
    view.render({ width: 400, height: 800, scale: 10, panX: 0, panY: 0, camera });
  }

  assert.deepEqual(view.statistics, initial);
  assert.equal(stats.createdBuffers.length, createdBuffers);
  assert.equal(stats.createdArrays.length, createdArrays);
  assert.equal(stats.deletedBuffers.length, 0);
  assert.equal(stats.draws.length, 3);

  const rightBases = stats.cameraUniforms
    .filter(item => item.location === 'uCameraRight')
    .map(item => item.value);
  assert.deepEqual(rightBases, [[0.75, 0, -0.75], [1, 0, 0], [0.75, 0, -0.75]]);
  view.dispose();
});
