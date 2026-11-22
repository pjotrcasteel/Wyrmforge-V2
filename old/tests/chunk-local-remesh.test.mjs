import test from 'node:test';
import assert from 'node:assert/strict';
import { VoxelWorld, createScene } from '../src/voxel-world.mjs';
import { markDirtyForEditedVoxel } from '../src/chunk-dirty.mjs';
import { buildExposedFaceMeshes } from '../src/exposed-face-mesher.mjs';
import { carveDemoSphere, demoCarveTarget } from '../src/demo-carve.mjs';

test('a voxel away from the chunk seams invalidates only its own mesh', () => {
  for (const edge of [16, 32]) {
    const ids = markDirtyForEditedVoxel(new Set(), edge, 5, 5, 5);
    assert.deepEqual([...ids], ['0,0,0']);
  }
});

test('signed chunk seam edits invalidate just the six exposed-face neighbors', () => {
  for (const edge of [16, 32]) {
    const atZero = markDirtyForEditedVoxel(new Set(), edge, 0, 0, 0);
    assert.deepEqual([...atZero].sort(), ['-1,0,0','0,-1,0','0,0,-1','0,0,0'].sort());
    const beforeZero = markDirtyForEditedVoxel(new Set(), edge, -1, -1, -1);
    assert.deepEqual([...beforeZero].sort(),
      ['-1,-1,-1','0,-1,-1','-1,0,-1','-1,-1,0'].sort());
    const atPositiveBoundary = markDirtyForEditedVoxel(new Set(), edge, edge - 1, 2, 2);
    assert.deepEqual([...atPositiveBoundary].sort(), ['0,0,0','1,0,0'].sort());
  }
});

test('isolated chunk snapshots are immutable copies and disappear on reclamation', () => {
  const world = new VoxelWorld({ chunkEdge: 32 });
  assert.equal(world.chunkSnapshot(0, 0, 0), null);
  world.set(3, 4, 5, 2);
  const first = world.chunkSnapshot(0, 0, 0);
  assert.equal(first.id, '0,0,0');
  first.data.fill(0);
  assert.equal(world.get(3, 4, 5), 2);
  world.set(3, 4, 5, 0);
  assert.equal(world.chunkSnapshot(0, 0, 0), null);
});

test('localized remeshing exactly matches full rebuilt chunk at positive and negative seams', () => {
  for (const edge of [16, 32]) {
    const world = new VoxelWorld({ chunkEdge: edge });
    for (const x of [-1, 0, edge - 1, edge]) {
      world.set(x, 0, 0, 2);
    }
    const dirty = new Set();
    world.set(0, 0, 0, 0);
    markDirtyForEditedVoxel(dirty, edge, 0, 0, 0);
    world.set(edge, 0, 0, 0);
    markDirtyForEditedVoxel(dirty, edge, edge, 0, 0);

    const full = new Map(buildExposedFaceMeshes(world).map(m => [m.id, m]));
    const partial = buildExposedFaceMeshes(world, { chunkIds: dirty });
    for (const mesh of partial) assert.deepEqual(mesh, full.get(mesh.id));
    assert.equal(partial.length, 2);
    assert.ok(partial.every(mesh => mesh.faceCount === 6));
  }
});

test('a removed empty chunk produces no mesh and is selected for GPU deletion', () => {
  const world = new VoxelWorld();
  world.set(16, 1, 1, 3);
  const dirty = new Set();
  world.set(16, 1, 1, 0);
  markDirtyForEditedVoxel(dirty, 16, 16, 1, 1);
  assert.ok(dirty.has('1,0,0'));
  assert.ok(dirty.has('0,0,0'));
  assert.deepEqual(buildExposedFaceMeshes(world, { chunkIds: dirty }), []);
});

test('scoped meshing never snapshots the entire world', () => {
  const world = createScene('arch', 7, { chunkEdge: 32 });
  const proxy = {
    chunkEdge: world.chunkEdge,
    chunkSnapshot: (x, y, z) => world.chunkSnapshot(x, y, z),
    snapshots: () => { throw new Error('global snapshot is forbidden in localized mode'); }
  };
  const partial = buildExposedFaceMeshes(proxy, { chunkIds: new Set(['0,0,0']) });
  assert.equal(partial.length, 1);
  assert.deepEqual(partial[0],
    buildExposedFaceMeshes(world).find(m => m.id === '0,0,0'));
});

test('arch demo carve only rebuilds affected chunk meshes', () => {
  for (const edge of [16, 32]) {
    const world = createScene('arch', 7, { chunkEdge: edge });
    const before = new Map(buildExposedFaceMeshes(world).map(m => [m.id, m]));
    const dirty = new Set();
    const removed = carveDemoSphere(world, demoCarveTarget('arch'), { dirtyChunks: dirty });
    assert.ok(removed > 0);
    assert.ok(dirty.size < world.chunkCount, 'localized edit must not rebuild all world chunks');
    const after = new Map(before);
    for (const id of dirty) after.delete(id);
    for (const mesh of buildExposedFaceMeshes(world, { chunkIds: dirty })) after.set(mesh.id, mesh);
    const full = new Map(buildExposedFaceMeshes(world).map(m => [m.id, m]));
    assert.deepEqual([...after.keys()].sort(), [...full.keys()].sort());
    for (const [id, mesh] of after) {
      const fresh = full.get(id);
      if (dirty.has(id)) {
        // Rebuilt chunks carry current revision and neighbor metadata.
        assert.deepEqual(mesh, fresh);
      } else {
        // Unaffected GPU geometry is intentionally retained. Its neighborRevision
        // metadata records when it was built, not when unrelated interior voxels changed.
        const oldGeometry = { ...mesh };
        const newGeometry = { ...fresh };
        delete oldGeometry.neighborRevisions;
        delete newGeometry.neighborRevisions;
        assert.deepEqual(oldGeometry, newGeometry);
      }
    }
  }
});

test('invalid scoped chunk identifiers and footprints are rejected', () => {
  const world = new VoxelWorld();
  for (const id of ['1', '1,1', '01,0,0', '1.2,0,0', '0,0,Infinity', '9007199254740992,0,0']) {
    assert.throws(() => buildExposedFaceMeshes(world, { chunkIds: [id] }));
  }
  assert.throws(() => buildExposedFaceMeshes(world, { chunkIds: Array(129).fill(0).map((_,i)=>`${i},0,0`) }), RangeError);
  assert.throws(() => markDirtyForEditedVoxel([], 16, 0, 0, 0), TypeError);
  assert.throws(() => markDirtyForEditedVoxel(new Set(), 24, 0, 0, 0), RangeError);
});
