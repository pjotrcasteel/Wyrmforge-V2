// Bounded World Generation V2 load/stress baseline (Node, not a browser FPS
// claim). Runs during development of *this* next engine, not voxel closeout.
import { performance } from 'node:perf_hooks';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { createWorldSiteRecipe } from '../src/world-generation/site-recipe.mjs';
import { MAP_KIND_IDS } from '../src/world-generation/map-kinds.mjs';
import { WorldGeneratorV2 } from '../src/world-generation/world-generator.mjs';
import {
  V2ExternalTerrainLoader, MAX_INITIAL_TERRAIN_RUNS,
  MAX_INITIAL_TERRAIN_CELLS, MAX_INITIAL_TERRAIN_STEP_CELLS
} from '../src/external-terrain-loader.mjs';

export const WORLDGEN_STRESS_SEEDS=Object.freeze([7,19,101,267]);

export function benchmarkWorldGeneration({seeds=WORLDGEN_STRESS_SEEDS}={}) {
  if(!Array.isArray(seeds) || seeds.length<1 || seeds.length>16 ||
      !seeds.every(seed=>Number.isSafeInteger(seed) &&
        seed>=0 && seed<=0xffffffff)) {
    throw new RangeError('Expected bounded, nonnegative World Generation V2 seeds');
  }
  const generator=new WorldGeneratorV2();
  const samples=[];
  const uniqueByKind=new Map();
  let maximalRuns=0, maximalCells=0, maximalChunks=0;
  for(const kind of MAP_KIND_IDS) {
    const hashes=new Set();
    for(const pitch of [16,32])for(const seed of seeds) {
      const recipe=createWorldSiteRecipe({
        kind,seed,siteId:'stress-'+kind,regionId:'stress-region',
        encounterId:'stress-encounter',worldRevision:0,chunkEdge:pitch,
        corruption:kind==='wet-forest'?0:0.4
      });
      const start=performance.now();
      const generated=generator.generate(recipe);
      const generateMs=performance.now()-start;
      if(generated.definition.runs.length>MAX_INITIAL_TERRAIN_RUNS ||
          generated.totalCells>MAX_INITIAL_TERRAIN_CELLS ||
          !generated.layout.topology.reachable) {
        throw new Error('World Generation V2 exceeded the terrain boundary budget');
      }
      const loadStart=performance.now();
      const loader=new V2ExternalTerrainLoader(generated.definition);
      let steps=0, peakStepMs=0;
      try {
        while(!loader.progress.done) {
          const began=performance.now();
          loader.loadStep(MAX_INITIAL_TERRAIN_STEP_CELLS);
          peakStepMs=Math.max(peakStepMs,performance.now()-began);
          if(++steps>300) throw new Error('World Generation V2 loader stalled');
        }
        const {world}=loader.terrain;
        maximalChunks=Math.max(maximalChunks,world.chunkCount);
        hashes.add(generated.hash);
        maximalRuns=Math.max(maximalRuns,generated.definition.runs.length);
        maximalCells=Math.max(maximalCells,generated.totalCells);
        samples.push({
          kind,pitch,seed,hash:generated.hash,
          runs:generated.definition.runs.length,
          cells:generated.totalCells,chunks:world.chunkCount,
          steps,generateMs:Number(generateMs.toFixed(2)),
          loadMs:Number((performance.now()-loadStart).toFixed(2)),
          worstStepMs:Number(peakStepMs.toFixed(2)),
          walkableCells:generated.layout.topology.walkableFromEntry
        });
      } finally {
        loader.unload();
      }
    }
    uniqueByKind.set(kind,hashes.size);
  }
  for(const [kind,count] of uniqueByKind) {
    // At least one different seed must generate a visibly different site.
    if(seeds.length>1 && count<2) {
      throw new Error('Generator returned identical sites for every seed: '+kind);
    }
  }
  return {
    schema:'wyrmforge.worldgen-stress-report.v1',
    testType:'Node integration and loading (not browser FPS)',
    count:samples.length,
    kinds:[...MAP_KIND_IDS],
    pitches:[16,32],
    seeds:[...seeds],
    peakRuns:maximalRuns,peakCells:maximalCells,peakChunks:maximalChunks,
    maxGenerateMs:Math.max(...samples.map(sample=>sample.generateMs)),
    maxLoadMs:Math.max(...samples.map(sample=>sample.loadMs)),
    maxStepMs:Math.max(...samples.map(sample=>sample.worstStepMs)),
    samples
  };
}
if(process.argv[1] && pathToFileURL(resolve(process.argv[1])).href===import.meta.url) {
  process.stdout.write(JSON.stringify(benchmarkWorldGeneration(),null,2)+'\n');
}
