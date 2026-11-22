import test from 'node:test';
import assert from 'node:assert/strict';
import { VoxelWorld, createScene } from '../src/voxel-world.mjs';
import { buildExposedFaceMeshes } from '../src/exposed-face-mesher.mjs';

function totals(meshes) {
  const faces = meshes.reduce((sum, mesh) => sum + mesh.faceCount, 0);
  const triangles = meshes.reduce((sum, mesh) => sum + mesh.triangleCount, 0);
  return { faces, triangles };
}

test('a single voxel emits exactly six faces with valid materials and outward winding', () => {
  const world = new VoxelWorld();
  world.set(0, 0, 0, 7);
  const [mesh] = buildExposedFaceMeshes(world);
  assert.deepEqual(totals([mesh]), { faces: 6, triangles: 12 });
  assert.equal(mesh.vertexCount, 24);
  assert.deepEqual(Object.values(mesh.faceCounts), [1, 1, 1, 1, 1, 1]);
  assert.equal(mesh.positions.length, 72);
  assert.equal(mesh.normals.length, 72);
  assert.equal(mesh.materials.length, 24);
  assert.equal(mesh.indices.length, 36);
  assert.ok(mesh.materials.every(material => material === 7));
  assert.deepEqual(mesh.origin, [0, 0, 0]);

  for (let face = 0; face < 6; face++) {
    const v = face * 12;
    const a = Array.from(mesh.positions.subarray(v, v + 3));
    const b = Array.from(mesh.positions.subarray(v + 3, v + 6));
    const c = Array.from(mesh.positions.subarray(v + 6, v + 9));
    const ab = b.map((n, i) => n - a[i]);
    const ac = c.map((n, i) => n - a[i]);
    const cross = [
      ab[1] * ac[2] - ab[2] * ac[1],
      ab[2] * ac[0] - ab[0] * ac[2],
      ab[0] * ac[1] - ab[1] * ac[0]
    ];
    const normal = Array.from(mesh.normals.subarray(v, v + 3));
    assert.ok(cross.reduce((sum, n, i) => sum + n * normal[i], 0) > 0,
      'Face triangle must wind outward');
    assert.deepEqual(Array.from(mesh.indices.subarray(face * 6, face * 6 + 6)),
      [face*4, face*4+1, face*4+2, face*4, face*4+2, face*4+3]);
  }
});

test('two adjacent voxels hide their shared face without losing their materials', () => {
  const world = new VoxelWorld();
  world.set(0, 0, 0, 2);
  world.set(1, 0, 0, 9);
  const [mesh] = buildExposedFaceMeshes(world);
  assert.equal(mesh.faceCount, 10);
  assert.equal(mesh.faceCounts['+x'], 1);
  assert.equal(mesh.faceCounts['-x'], 1);
  assert.equal(mesh.materials.filter(m => m === 2).length, 20);
  assert.equal(mesh.materials.filter(m => m === 9).length, 20);
});

test('across positive and negative chunk seams, no internal face is emitted', () => {
  for (const edge of [16, 32]) {
    for (const x of [0, edge]) {
      const world = new VoxelWorld({ chunkEdge: edge });
      world.set(x - 1, 0, 0, 1);
      world.set(x, 0, 0, 2);
      const meshes = buildExposedFaceMeshes(world);
      assert.equal(meshes.length, 2);
      assert.deepEqual(totals(meshes), { faces: 10, triangles: 20 });
      const leftId = String(Math.floor((x - 1) / edge)) + ',0,0';
      const rightId = String(Math.floor(x / edge)) + ',0,0';
      const left = meshes.find(mesh => mesh.id === leftId);
      const right = meshes.find(mesh => mesh.id === rightId);
      assert.equal(left.faceCounts['+x'], 0);
      assert.equal(right.faceCounts['-x'], 0);
      assert.equal(left.neighborRevisions['+x'], right.revision);
      assert.equal(right.neighborRevisions['-x'], left.revision);
    }
  }
});

test('a carved interior void produces six real internal cavity faces', () => {
  const world = new VoxelWorld();
  for (let z = 0; z < 3; z++) {
    for (let y = 0; y < 3; y++) {
      for (let x = 0; x < 3; x++) world.set(x, y, z, 3);
    }
  }
  assert.equal(totals(buildExposedFaceMeshes(world)).faces, 54);
  world.set(1, 1, 1, 0);
  assert.equal(totals(buildExposedFaceMeshes(world)).faces, 60);
});

test('visible arch fixture generates a downward-facing roof above open space', () => {
  const world = createScene('arch', 7);
  assert.equal(world.get(0, 8, 2), 3);
  assert.equal(world.get(0, 7, 2), 0);
  const mesh = buildExposedFaceMeshes(world).find(part => part.id === '0,0,0');
  let underside = false;
  for (let i = 0; i < mesh.faceCount; i++) {
    const begin = i * 12;
    const positions = Array.from(mesh.positions.subarray(begin, begin + 12));
    const xs = [positions[0],positions[3],positions[6],positions[9]];
    const ys = [positions[1],positions[4],positions[7],positions[10]];
    const zs = [positions[2],positions[5],positions[8],positions[11]];
    if (Math.min(...xs) === 0 && Math.max(...xs) === 1 &&
        ys.every(y => y === 8) &&
        Math.min(...zs) === 2 && Math.max(...zs) === 3 &&
        mesh.normals[begin + 1] === -1) {
      underside = true;
      break;
    }
  }
  assert.equal(underside, true);
});

test('meshing is repeatable and cannot modify authoritative voxel data or revisions', () => {
  const world = createScene('cliff', 7, { chunkEdge: 32 });
  const beforeRevision = world.revision;
  const before = world.snapshots();
  const a = buildExposedFaceMeshes(world);
  const b = buildExposedFaceMeshes(world);
  assert.deepEqual(a, b);
  assert.equal(world.revision, beforeRevision);
  assert.deepEqual(world.snapshots(), before);
  a[0].positions.fill(99);
  assert.equal(world.revision, beforeRevision);
  assert.deepEqual(world.snapshots(), before);
});

test('exposed face budget is checked before large CPU buffers are allocated', () => {
  const world = new VoxelWorld();
  world.set(0, 0, 0, 1);
  assert.throws(() => buildExposedFaceMeshes(world, { maxFacesPerChunk: 5 }), RangeError);
  for (const limit of [0, -1, 1.3, 150001, Infinity]) {
    assert.throws(() => buildExposedFaceMeshes(world, { maxFacesPerChunk: limit }), RangeError);
  }
});

test('an empty world has no meshes, and removing a voxel updates visible faces', () => {
  const world = new VoxelWorld({ chunkEdge: 32 });
  assert.deepEqual(buildExposedFaceMeshes(world), []);
  world.set(31, 0, 0, 1);
  world.set(32, 0, 0, 1);
  assert.equal(totals(buildExposedFaceMeshes(world)).faces, 10);
  world.set(32, 0, 0, 0);
  assert.equal(totals(buildExposedFaceMeshes(world)).faces, 6);
});
