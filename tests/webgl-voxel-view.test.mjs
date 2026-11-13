import test from 'node:test';
import assert from 'node:assert/strict';
import {
  projectVoxel,WebGLVoxelView,
  WEBGL_V2_VERTEX_SHADER_SOURCE,WEBGL_V2_FRAGMENT_SHADER_SOURCE
} from '../src/webgl-voxel-view.mjs';
import { VoxelWorld } from '../src/voxel-world.mjs';
import { buildExposedFaceMeshes } from '../src/exposed-face-mesher.mjs';

const camera = { width: 800, height: 600, scale: 12, panX: 15, panY: -8 };

test('V2 projection is fixed orthographic 2.5D with correct screen directions', () => {
  const center = projectVoxel(0, 0, 0, camera);
  assert.equal(center.x, 415);
  assert.equal(center.y, 292);
  const east = projectVoxel(1, 0, 0, camera);
  const south = projectVoxel(0, 0, 1, camera);
  const above = projectVoxel(0, 1, 0, camera);
  assert.ok(east.x > center.x);
  assert.ok(south.x < center.x);
  assert.ok(east.y > center.y);
  assert.ok(south.y > center.y);
  assert.equal(above.x, center.x);
  assert.ok(above.y < center.y);
});

test('camera near/far depth is coherent with the fixed projection', () => {
  const far = projectVoxel(0, 0, 0, camera);
  const near = projectVoxel(1, 0.7, 1, camera);
  assert.ok(Math.abs(near.x - far.x) < 1e-6);
  assert.ok(Math.abs(near.y - far.y) < 1e-6);
  assert.ok(near.depth < far.depth);
});

test('pan and zoom only change projection, not the voxels', () => {
  const world = new VoxelWorld();
  world.set(-1, 1, 3, 2);
  const before = world.snapshots();
  const origin = projectVoxel(2, 1, -1, camera);
  const moved = projectVoxel(2, 1, -1, { ...camera, panX: 24, panY: -18 });
  assert.equal(moved.x - origin.x, 9);
  assert.equal(moved.y - origin.y, -10);
  assert.deepEqual(world.snapshots(), before);
});

test('WebGL2 absence is explicit so the lab can keep its Canvas2D fallback', () => {
  assert.throws(
    () => new WebGLVoxelView({ getContext: () => null }),
    /WebGL2 is unavailable/
  );
});

test('mesher arrays have correct WebGL2-compatible typed formats and index ranges', () => {
  const world = new VoxelWorld({ chunkEdge: 16 });
  world.set(-1, 0, 0, 1);
  world.set(0, 0, 0, 2);
  const meshes = buildExposedFaceMeshes(world);
  for (const mesh of meshes) {
    assert.ok(mesh.positions instanceof Float32Array);
    assert.ok(mesh.normals instanceof Int8Array);
    assert.ok(mesh.materials instanceof Uint8Array);
    assert.ok(mesh.indices instanceof Uint32Array);
    assert.equal(mesh.positions.length, mesh.vertexCount * 3);
    assert.equal(mesh.indices.length, mesh.triangleCount * 3);
    assert.ok(mesh.indices.every(index => index < mesh.vertexCount));
  }
  assert.equal(meshes.reduce((sum, mesh) => sum + mesh.triangleCount, 0), 20);
});

test('WebGL2 shader exports include the complete fast Hunt and legacy paths',()=>{
  assert.match(WEBGL_V2_VERTEX_SHADER_SOURCE,/^#version 300 es/);
  assert.match(WEBGL_V2_FRAGMENT_SHADER_SOURCE,/^#version 300 es/);
  assert.match(WEBGL_V2_FRAGMENT_SHADER_SOURCE,/if \(uFastHuntMode\)/);
  assert.match(WEBGL_V2_FRAGMENT_SHADER_SOURCE,/float grassVariation=/);
  // GLSL ES reserves "patch" for tessellation. It is not a JavaScript
  // syntax error, so the real shader compiler runs separately in CI.
  assert.doesNotMatch(WEBGL_V2_FRAGMENT_SHADER_SOURCE,/\bpatch\b/);
});
