import test from 'node:test';
import assert from 'node:assert/strict';
import { CAMERA_PRESETS, getCameraPreset, projectVoxel } from '../src/camera-presets.mjs';
import { createScene } from '../src/voxel-world.mjs';
import { buildExposedFaceMeshes } from '../src/exposed-face-mesher.mjs';

const view = { width: 800, height: 600, scale: 12, panX: 15, panY: -8 };

test('Hunt camera is north-up and shows elevation without diagonal tile rotation', () => {
  const origin = projectVoxel(0, 0, 0, { ...view, camera: 'hunt' });
  const east = projectVoxel(1, 0, 0, { ...view, camera: 'hunt' });
  const south = projectVoxel(0, 0, 1, { ...view, camera: 'hunt' });
  const above = projectVoxel(0, 1, 0, { ...view, camera: 'hunt' });
  assert.deepEqual([origin.x, origin.y], [415, 292]);
  assert.ok(east.x > origin.x);
  assert.equal(east.y, origin.y, 'horizontal world travel must stay horizontal');
  assert.equal(south.x, origin.x, 'north/south world travel must stay vertical');
  assert.ok(south.y > origin.y);
  assert.equal(above.x, origin.x);
  assert.ok(above.y < origin.y, 'elevated surfaces must be screen-up');
});

test('Hunt camera near/far depth agrees with the orthographic view basis', () => {
  const far = projectVoxel(0, 0, 0, { ...view, camera: 'hunt' });
  const near = projectVoxel(0, .90, .48, { ...view, camera: 'hunt' });
  assert.ok(Math.abs(near.x - far.x) < 1e-8);
  assert.ok(Math.abs(near.y - far.y) < 1e-8);
  assert.ok(near.depth < far.depth, 'near terrain must win depth testing');
});

test('inspection camera preserves the existing V2 fixed oblique view', () => {
  const origin = projectVoxel(0, 0, 0, view);
  assert.deepEqual(origin, { x: 415, y: 292, depth: 0 });
  const east = projectVoxel(1, 0, 0, view);
  const north = projectVoxel(0, 0, 1, view);
  assert.equal(east.x - origin.x, 9);
  assert.equal(north.x - origin.x, -9);
  assert.ok(east.y > origin.y && north.y > origin.y);
  assert.deepEqual(projectVoxel(3, 4, -1, { ...view, camera: 'inspection' }),
    projectVoxel(3, 4, -1, view));
});

test('camera switching does not edit, regenerate or remesh authoritative voxels', () => {
  const world = createScene('arch', 7, { chunkEdge: 32 });
  const before = world.snapshots();
  const worldRevision = world.revision;
  const mesh = buildExposedFaceMeshes(world);
  for (const camera of ['hunt', 'inspection', 'hunt']) {
    const screen = projectVoxel(5, 5, 2, { ...view, camera });
    assert.ok(Number.isFinite(screen.x) && Number.isFinite(screen.y));
  }
  assert.equal(world.revision, worldRevision);
  assert.deepEqual(world.snapshots(), before);
  assert.equal(mesh.reduce((sum, m) => sum + m.triangleCount, 0), 3612);
});

test('presets are immutable and unknown values are rejected', () => {
  assert.deepEqual(Object.keys(CAMERA_PRESETS).sort(), ['hunt', 'inspection']);
  assert.equal(getCameraPreset('hunt').id, 'hunt');
  assert.ok(Object.isFrozen(CAMERA_PRESETS.hunt.right));
  assert.throws(() => getCameraPreset('unrecognized'), RangeError);
  assert.throws(() => getCameraPreset('__proto__'), RangeError);
});
