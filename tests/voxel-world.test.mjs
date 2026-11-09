import test from 'node:test';
import assert from 'node:assert/strict';
import { VoxelWorld, createScene, CHUNK_EDGE } from '../src/voxel-world.mjs';

test('signed coordinates and chunk boundaries are independent', () => {
  const world = new VoxelWorld();
  for (const [x,y,z] of [[-1,-1,-1],[0,0,0],[16,16,16],[-16,-16,-16]]) {
    assert.equal(world.set(x,y,z,3),true);
    assert.equal(world.get(x,y,z),3);
  }
  assert.equal(world.chunkCount,4);
  assert.equal(CHUNK_EDGE,16);
});

test('idempotent edits and empty chunk reclamation', () => {
  const world = new VoxelWorld();
  assert.equal(world.set(-1,0,0,0),false);
  assert.equal(world.set(-1,0,0,1),true);
  const revision = world.revision;
  assert.equal(world.set(-1,0,0,1),false);
  assert.equal(world.revision,revision);
  assert.equal(world.set(-1,0,0,0),true);
  assert.equal(world.chunkCount,0);
});

test('snapshots cannot mutate authoritative world', () => {
  const world = new VoxelWorld();
  world.set(0,0,0,2);
  const snapshot = world.snapshots()[0];
  snapshot.data.fill(0);
  assert.equal(world.get(0,0,0),2);
});

test('scene generation is deterministic and cliff is fully solid', () => {
  const a=createScene('cliff',7), b=createScene('cliff',7);
  assert.equal(a.get(1,9,0),1);
  assert.equal(a.get(-1,8,0),0);
  assert.deepEqual(a.snapshots(),b.snapshots());
});

test('invalid inputs are rejected', () => {
  const world = new VoxelWorld();
  assert.throws(()=>world.set(1.2,0,0,1),TypeError);
  assert.throws(()=>world.set(0,0,0,256),RangeError);
  assert.throws(()=>createScene('unknown'),RangeError);
});
