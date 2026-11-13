import test from 'node:test';
import assert from 'node:assert/strict';
import {
  benchmarkWorldGeneration, WORLDGEN_STRESS_SEEDS
} from '../scripts/benchmark-world-generation.mjs';

test('World Generation V2 stress samples all authored kinds through real bounded terrain activation',()=>{
  const report=benchmarkWorldGeneration({seeds:[7,101]});
  assert.equal(report.schema,'wyrmforge.worldgen-stress-report.v1');
  assert.equal(report.count,6*2*2);
  assert.deepEqual(report.kinds,['wet-forest','forest-highland','mountain-pass',
    'scorched-approach','mini-boss-arena','wyrm-lair']);
  assert.deepEqual(report.pitches,[16,32]);
  assert.equal(report.samples.length,24);
  assert.ok(report.peakRuns>0 && report.peakRuns<=8192);
  assert.ok(report.peakCells>0 && report.peakCells<=1048576);
  assert.ok(report.peakChunks>1);
  for(const sample of report.samples) {
    assert.match(sample.hash,/^wg2-[0-9a-f]{8}$/);
    assert.ok(sample.chunks>0);
    assert.ok(sample.steps>=1 && sample.steps<=300);
    assert.ok(sample.walkableCells>=100);
    for(const metric of ['generateMs','loadMs','worstStepMs']) {
      assert.ok(Number.isFinite(sample[metric]) && sample[metric]>=0);
    }
  }
  const byKind=new Map();
  for(const sample of report.samples.filter(row=>row.pitch===16)) {
    const set=byKind.get(sample.kind) ?? new Set();
    set.add(sample.hash);
    byKind.set(sample.kind,set);
  }
  for(const digests of byKind.values()) assert.equal(digests.size,2);
});

test('World Generation stress harness never accepts unbounded seed sweeps',()=>{
  assert.ok(WORLDGEN_STRESS_SEEDS.length>=4);
  assert.throws(()=>benchmarkWorldGeneration({seeds:[]}),RangeError);
  assert.throws(()=>benchmarkWorldGeneration({seeds:new Array(17).fill(7)}),RangeError);
  assert.throws(()=>benchmarkWorldGeneration({seeds:[-1]}),RangeError);
  assert.throws(()=>benchmarkWorldGeneration({seeds:[1.5]}),RangeError);
});
