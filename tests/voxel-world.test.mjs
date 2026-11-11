import test from 'node:test';
import assert from 'node:assert/strict';
import { VoxelWorld, createScene, CHUNK_EDGE, CHUNK_EDGE_CANDIDATES } from '../src/voxel-world.mjs';

test('signed coordinates and chunk boundaries are independent', () => {
  const world = new VoxelWorld();
  for (const [x,y,z] of [[-1,-1,-1],[0,0,0],[16,16,16],[-17,-17,-17]]) {
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

test('editing one chunk does not invalidate unrelated chunk snapshots', () => {
  const world = new VoxelWorld();
  world.set(0, 0, 0, 1);
  world.set(16, 0, 0, 2);
  const before = new Map(world.snapshots().map(s => [s.id, s.revision]));
  world.set(0, 0, 0, 3);
  const after = new Map(world.snapshots().map(s => [s.id, s.revision]));
  assert.notEqual(after.get('0,0,0'), before.get('0,0,0'));
  assert.equal(after.get('1,0,0'), before.get('1,0,0'));
  assert.equal(world.chunkRevision(1, 0, 0), before.get('1,0,0'));
});

test('chunk occupancy is retained until its last solid voxel is removed', () => {
  const world = new VoxelWorld();
  world.set(-1, 0, 0, 1);
  world.set(-2, 0, 0, 2);
  world.set(-1, 0, 0, 0);
  assert.equal(world.chunkCount, 1);
  assert.equal(world.get(-2, 0, 0), 2);
  world.set(-2, 0, 0, 0);
  assert.equal(world.chunkCount, 0);
});

test('clear invalidates chunk revision history', () => {
  const world = new VoxelWorld();
  world.set(0, 0, 0, 1);
  assert.ok(world.chunkRevision(0, 0, 0) > 0);
  world.clear();
  assert.equal(world.chunkRevision(0, 0, 0), 0);
});

test('removed chunks do not retain revision records', () => {
  const world = new VoxelWorld();
  world.set(0, 0, 0, 1);
  const firstRevision = world.chunkRevision(0, 0, 0);
  world.set(0, 0, 0, 0);
  assert.equal(world.chunkRevision(0, 0, 0), 0);
  world.set(0, 0, 0, 1);
  assert.ok(world.chunkRevision(0, 0, 0) > firstRevision);
});

test('hill generation is repeatable and responds to the scene seed', () => {
  const first = createScene('hill', 7).snapshots();
  const repeated = createScene('hill', 7).snapshots();
  const different = createScene('hill', 8).snapshots();
  assert.deepEqual(repeated, first);
  assert.notDeepEqual(different, first);
});

test('fixed comparison scenes remain stable across different seeds', () => {
  for (const name of ['flat', 'cliff', 'arch']) {
    assert.deepEqual(createScene(name, 7).snapshots(), createScene(name, 8).snapshots());
  }
});

test('scene generation rejects out-of-range seeds', () => {
  for (const seed of [-1, 0x100000000, 1.5, NaN, Infinity]) {
    assert.throws(() => createScene('hill', seed));
  }
  assert.ok(createScene('hill', 0).chunkCount > 0);
  assert.ok(createScene('hill', 0xffffffff).chunkCount > 0);
});

test('16 and 32 chunk sizes keep the same authoritative terrain', () => {
  assert.deepEqual([...CHUNK_EDGE_CANDIDATES], [16, 32]);
  for (const scene of ['flat', 'hill', 'cliff', 'arch']) {
    const small = createScene(scene, 7, { chunkEdge: 16 });
    const large = createScene(scene, 7, { chunkEdge: 32 });
    assert.equal(small.chunkEdge, 16);
    assert.equal(large.chunkEdge, 32);

    for (let x = -12; x <= 12; x++) {
      for (let z = -12; z <= 12; z++) {
        for (let y = -3; y <= 15; y++) {
          assert.equal(small.get(x, y, z), large.get(x, y, z),
            `mismatch in ${scene} at (${x}, ${y}, ${z})`);
        }
      }
    }
  }
});

test('32-sized chunks use Euclidean boundaries in all three axes', () => {
  const world = new VoxelWorld({ chunkEdge: 32 });
  for (const [x, y, z] of [[-1,-1,-1], [0,0,0], [31,31,31],
    [32,32,32], [-32,-32,-32], [-33,-33,-33]]) {
    assert.equal(world.set(x, y, z, 3), true);
    assert.equal(world.get(x, y, z), 3);
  }
  assert.equal(world.chunkCount, 4);
  assert.equal(world.allocatedVoxelBytes, 4 * 32 ** 3);
});

test('chunk allocation and reclamation use the chosen chunk size', () => {
  for (const chunkEdge of CHUNK_EDGE_CANDIDATES) {
    const world = new VoxelWorld({ chunkEdge });
    assert.equal(world.allocatedVoxelBytes, 0);
    world.set(chunkEdge - 1, 0, 0, 1);
    world.set(chunkEdge, 0, 0, 2);
    assert.equal(world.chunkCount, 2);
    assert.equal(world.allocatedVoxelBytes, 2 * chunkEdge ** 3);
    world.set(chunkEdge - 1, 0, 0, 0);
    assert.equal(world.allocatedVoxelBytes, chunkEdge ** 3);
    world.clear();
    assert.equal(world.allocatedVoxelBytes, 0);
  }
});

test('unrelated chunk revisions stay fixed at both chunk sizes', () => {
  for (const chunkEdge of CHUNK_EDGE_CANDIDATES) {
    const world = new VoxelWorld({ chunkEdge });
    world.set(0, 0, 0, 1);
    world.set(chunkEdge, 0, 0, 2);
    const untouched = world.chunkRevision(1, 0, 0);
    world.set(0, 0, 0, 3);
    assert.equal(world.chunkRevision(1, 0, 0), untouched);
  }
});

test('unsupported or invalid chunk sizes are rejected', () => {
  for (const chunkEdge of [0, 8, 24, 64, -16, 16.5, NaN, null]) {
    assert.throws(() => new VoxelWorld({ chunkEdge }), RangeError);
  }
});

test('Arch is a freestanding solid span with an actual see-through opening', () => {
  for (const chunkEdge of CHUNK_EDGE_CANDIDATES) {
    const world = createScene('arch', 7, { chunkEdge });
    for (const z of [0, 1, 2, 3, 4]) {
      assert.equal(world.get(0, 1, z), 1, 'ground remains solid under and around arch');
      assert.equal(world.get(0, 3, z), 0, 'passage is unobstructed along its depth');
    }
    for (const z of [1, 2, 3]) {
      assert.equal(world.get(-5, 3, z), 3, 'left pillar is solid stone');
      assert.equal(world.get(5, 3, z), 3, 'right pillar is solid stone');
      assert.equal(world.get(0, 8, z), 3, 'stone roof bridges open air');
      assert.equal(world.get(0, 7, z), 0, 'the roof has an exposed underside');
      assert.equal(world.get(4, 4, z), 0, 'lower shoulder is open');
      assert.equal(world.get(4, 5, z), 3, 'upper shoulder is solid');
      assert.equal(world.get(3, 6, z), 0, 'upper opening tapers');
      assert.equal(world.get(3, 7, z), 3, 'stepped arch remains connected');
    }
    assert.equal(world.get(0, 8, 0), 0, 'roof does not fill the approach');
    assert.equal(world.get(0, 8, 4), 0, 'roof does not fill the exit');
    assert.deepEqual(world.snapshots(),
      createScene('arch', 7, { chunkEdge }).snapshots(), 'the fixture is deterministic');
  }
});


test('hunt-load fixture is larger, bounded, deterministic and independent of legacy terrain', () => {
  const a = createScene('hunt-load', 7, {chunkEdge:32});
  const b = createScene('hunt-load', 7, {chunkEdge:32});
  assert.equal(a.chunkCount,32, '96×96 footprint spans 4×4 horizontal chunks and two vertical layers');
  assert.equal(a.allocatedVoxelBytes,32 * 32 ** 3);
  assert.deepEqual(a.snapshots(),b.snapshots());
  assert.equal(a.get(-48,0,-48),2);
  assert.equal(a.get(47,0,47),2);
  assert.equal(a.get(48,0,0),0);
});
