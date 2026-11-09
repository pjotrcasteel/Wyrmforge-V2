// Reproducible Node-only comparison, NOT a phone/WebGL2 performance claim.
// Usage: node scripts/benchmark-chunks.mjs
import { performance } from 'node:perf_hooks';
import { createScene, CHUNK_EDGE_CANDIDATES } from '../src/voxel-world.mjs';

function runFixture(scene, chunkEdge, seed = 7) {
  const start = performance.now();
  const world = createScene(scene, seed, { chunkEdge });
  const generationMs = performance.now() - start;
  const initialVoxelBytes = world.allocatedVoxelBytes;

  let checksum = 0;
  const queryStart = performance.now();
  for (let z = -12; z <= 12; z++) {
    for (let x = -12; x <= 12; x++) {
      for (let y = -3; y <= 15; y++) {
        checksum += world.get(x, y, z);
      }
    }
  }
  const queryMs = performance.now() - queryStart;

  let editsChanged = 0;
  const editStart = performance.now();
  for (let z = -5; z <= 5; z++) {
    for (let x = -5; x <= 5; x++) {
      for (let y = -2; y <= 9; y++) {
        if (x * x + z * z + (y - 3) ** 2 <= 25 && world.set(x, y, z, 0)) {
          editsChanged++;
        }
      }
    }
  }
  const editMs = performance.now() - editStart;

  return {
    scene, chunkEdge, checksum, editsChanged,
    initialChunks: Math.round(initialVoxelBytes / chunkEdge ** 3),
    initialVoxelBytes, afterEditChunks: world.chunkCount,
    afterEditVoxelBytes: world.allocatedVoxelBytes,
    generationMs, queryMs, editMs
  };
}

const results = [];
for (const scene of ['flat', 'hill', 'cliff', 'arch']) {
  for (const edge of CHUNK_EDGE_CANDIDATES) {
    results.push(runFixture(scene, edge));
  }
}

process.stdout.write(JSON.stringify({
  schema: 'voxel-v2.chunk-compare.v1',
  engine: 'V2 only',
  environment: { node: process.version, platform: process.platform, arch: process.arch },
  seed: 7,
  limits: 'One desktop Node run; no warm-up, mobile GPU metrics or statistical acceptance claim. Times are diagnostic only.',
  voxelBytes: 'Packed Uint8Array payload only; excludes JavaScript Map/object, worker and GPU overhead',
  results
}, null, 2) + '\n');
