import test from 'node:test';
import assert from 'node:assert/strict';
import { createScene, VoxelWorld } from '../src/voxel-world.mjs';
import { buildExposedFaceMeshes } from '../src/exposed-face-mesher.mjs';
import { carveDemoSphere, demoCarveTarget } from '../src/demo-carve.mjs';

test('Arch demo sphere strikes the actual freestanding stone arch at both chunk sizes', () => {
  for (const chunkEdge of [16, 32]) {
    const world = createScene('arch', 7, { chunkEdge });
    const target = demoCarveTarget('arch');
    assert.equal(world.get(5, 5, 2), 3, 'right stone support must exist before carve');
    assert.equal(world.get(-5, 5, 2), 3, 'left stone support must exist before carve');
    const before = buildExposedFaceMeshes(world).reduce((count, mesh) => count + mesh.triangleCount, 0);
    const revision = world.revision;
    const removed = carveDemoSphere(world, target);
    assert.ok(removed > 0, 'Arch impact must actually remove solid voxels');
    assert.equal(world.get(5, 5, 2), 0, 'visible right pillar must have a hole');
    assert.equal(world.get(-5, 5, 2), 3, 'opposite pillar should not be affected');
    assert.equal(world.get(0, 8, 2), 3, 'unaffected center of arch roof stays solid');
    assert.equal(world.revision - revision, removed, 'every reported voxel was committed');
    const after = buildExposedFaceMeshes(world).reduce((count, mesh) => count + mesh.triangleCount, 0);
    assert.notEqual(after, before, 'visible mesh must change after impact');
    assert.equal(carveDemoSphere(world, target), 0, 'the same fixed test sphere is idempotent');
    assert.equal(createScene('arch', 7, { chunkEdge }).get(5, 5, 2), 3,
      'reset via seeded regeneration restores the support');
  }
});

test('all four demo scenes have at least one solid voxel in their carve target', () => {
  for (const scene of ['flat', 'hill', 'cliff', 'arch']) {
    for (const chunkEdge of [16, 32]) {
      const world = createScene(scene, 7, { chunkEdge });
      assert.ok(carveDemoSphere(world, demoCarveTarget(scene)) > 0,
        `demo carve did not affect ${scene} at ${chunkEdge}³`);
    }
  }
});

test('demo carve target is deterministic and does not change across invocations', () => {
  assert.deepEqual(demoCarveTarget('arch'), { x: 5, y: 5, z: 2, radius: 3.5 });
  assert.deepEqual(demoCarveTarget('flat'), demoCarveTarget('hill'));
  assert.throws(() => demoCarveTarget('unknown'), RangeError);
});

test('demo carve rejects invalid radius and coordinates', () => {
  const world = new VoxelWorld();
  for (const radius of [0, -1, 8.01, Infinity, NaN]) {
    assert.throws(() => carveDemoSphere(world, { x: 0, y: 0, z: 0, radius }), RangeError);
  }
  assert.throws(() => carveDemoSphere(world, { x: 1.5, y: 0, z: 0, radius: 2 }), TypeError);
  assert.throws(() => carveDemoSphere(null, { x: 0, y: 0, z: 0, radius: 2 }), TypeError);
});
