import test from 'node:test';
import assert from 'node:assert/strict';
import { VoxelWorld } from '../src/voxel-world.mjs';
import { buildExposedFaceMeshes } from '../src/exposed-face-mesher.mjs';

function visibleFaces(world) {
  const faces = [];
  for (const mesh of buildExposedFaceMeshes(world)) {
    for (let i = 0; i < mesh.faceCount; i++) {
      faces.push({
        material: mesh.materials[i * 4],
        normal: Array.from(mesh.normals.slice(i * 12, i * 12 + 3)),
        center: [0, 1, 2].map(axis =>
          (mesh.positions[i * 12 + axis] + mesh.positions[i * 12 + 3 + axis] +
           mesh.positions[i * 12 + 6 + axis] + mesh.positions[i * 12 + 9 + axis]) / 4 +
          mesh.origin[axis])
      });
    }
  }
  return faces;
}

test('intact grass hides dirt and stone faces below it', () => {
  const world = new VoxelWorld();
  for (let y = 0; y <= 2; y++) {
    world.set(0, y, 0, y === 2 ? 1 : y === 1 ? 2 : 3);
  }
  const faces = visibleFaces(world);
  assert.equal(faces.filter(f => f.normal[1] === 1).length, 1);
  assert.equal(faces.find(f => f.normal[1] === 1).material, 1);
  assert.equal(faces.some(f => f.material === 2 && f.normal[1] === 1), false);
  assert.equal(faces.some(f => f.material === 3 && f.normal[1] === 1), false);
});

test('removing grass exposes dirt, then removing dirt exposes stone', () => {
  const world = new VoxelWorld();
  world.set(0, 0, 0, 3);
  world.set(0, 1, 0, 2);
  world.set(0, 2, 0, 1);
  world.set(0, 2, 0, 0);
  let top = visibleFaces(world).filter(f => f.normal[1] === 1);
  assert.deepEqual(top.map(f => f.material), [2]);
  world.set(0, 1, 0, 0);
  top = visibleFaces(world).filter(f => f.normal[1] === 1);
  assert.deepEqual(top.map(f => f.material), [3]);
});

test('crater-like grass removal exposes only excavated dirt, not buried dirt', () => {
  const world = new VoxelWorld();
  for (let x = 0; x < 5; x++) for (let z = 0; z < 5; z++) {
    world.set(x, 0, z, 3);
    world.set(x, 1, z, 2);
    world.set(x, 2, z, 1);
  }
  for (let x = 1; x <= 3; x++) for (let z = 1; z <= 3; z++) {
    world.set(x, 2, z, 0);
  }
  const top = visibleFaces(world).filter(f => f.normal[1] === 1);
  assert.equal(top.filter(f => f.material === 1).length, 16);
  assert.equal(top.filter(f => f.material === 2).length, 9);
  assert.equal(top.filter(f => f.material === 3).length, 0);
});
