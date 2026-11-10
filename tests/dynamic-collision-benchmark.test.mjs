import test from 'node:test';
import assert from 'node:assert/strict';
import { runDynamicCollisionSuite } from '../src/dynamic-collision-benchmark.mjs';

test('dynamic collision stays valid during edits across 16 and 32 voxel chunk seams',()=>{
  const result=runDynamicCollisionSuite();
  assert.equal(result.total,3);
  assert.equal(result.verdict,'pass',JSON.stringify(result));
  for(const entry of result.cases) {
    assert.equal(entry.errors,0);
    assert.equal(entry.overlaps,0);
    assert.equal(entry.edits,4);
    assert.ok(entry.removedVoxels>0);
  }
});
