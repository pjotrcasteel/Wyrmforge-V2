// Desktop/CI diagnostic only. Physical iOS/Android results are required before promotion.
// Usage: node scripts/benchmark-meshes.mjs
import { performance } from 'node:perf_hooks';
import { createScene } from '../src/voxel-world.mjs';
import { compareMeshing } from '../src/meshing-comparison.mjs';

function prepare(scene, edge) {
  const world = createScene(scene === 'fragmented' ? 'hill' : scene, 7, { chunkEdge: edge });
  if (scene === 'fragmented') {
    // Deterministic, damaged terrain: separate many small faces and material seams.
    for (let z = -10; z < 10; z++) {
      for (let x = -10; x < 10; x++) {
        for (let y = 0; y <= 7; y++) {
          if ((x * 17 + z * 31 + y * 7) % 5 === 0) world.set(x, y, z, 0);
        }
      }
    }
  }
  return world;
}

const median = values => {
  const sorted = [...values].sort((a,b) => a-b);
  return sorted[Math.floor(sorted.length / 2)];
};

const results = [];
for (const scene of ['flat','hill','cliff','arch','fragmented']) {
  for (const edge of [16,32]) {
    const world = prepare(scene,edge);
    compareMeshing(world,()=>performance.now()); // Warm-up; results not included.
    const runs = Array.from({ length: 3 }, () => compareMeshing(world,()=>performance.now()));
    const baseline = runs[0];
    results.push({
      scene, chunkEdge: edge,
      chunks: world.chunkCount,
      unitFaces: baseline.exposed.unitFaces,
      exposed: {
        triangles: baseline.exposed.triangles,
        cpuGeometryBytes: baseline.exposed.cpuGeometryBytes,
        medianCpuBuildMs: median(runs.map(run=>run.exposed.cpuBuildMs))
      },
      greedy: {
        triangles: baseline.greedy.triangles,
        cpuGeometryBytes: baseline.greedy.cpuGeometryBytes,
        medianCpuBuildMs: median(runs.map(run=>run.greedy.cpuBuildMs))
      },
      triangleReductionPercent: 100*(1-baseline.greedy.triangles/baseline.exposed.triangles)
    });
  }
}
process.stdout.write(JSON.stringify({
  schema:'voxel-v2.mesh-compare.v1',
  purpose:'CPU geometry cost comparison (no live renderer change)',
  environment:{ node:process.version, platform:process.platform, arch:process.arch },
  seed:7,
  warmups:1, measuredRuns:3,
  caveat:'Single Node machine, synchronous CPU timing. No GPU uploads, mobile frame pacing, heat or memory growth measured.',
  results
},null,2)+'\n');
