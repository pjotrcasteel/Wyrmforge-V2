import test from 'node:test';
import assert from 'node:assert/strict';
import { spatialDamageTarget } from '../src/spatial-benchmark.mjs';

test('spatial preset visits 49 unique sites with three pulses each', () => {
  const world = {get: (_x,y,_z) => y === 2 ? 1 : 0};
  const sites = Array.from({length:147},(_,i)=>spatialDamageTarget(world,i));
  assert.equal(new Set(sites.map(s=>s.x+','+s.z)).size,49);
  for(let i=0;i<147;i+=3) {
    assert.deepEqual(sites[i],sites[i+1]);
    assert.deepEqual(sites[i],sites[i+2]);
  }
  assert.equal(sites[0].y,2);
  assert.deepEqual(spatialDamageTarget(world,147),sites[0]);
});

test('spatial preset rejects invalid indexes and uses bounded empty-column fallback', () => {
  assert.throws(()=>spatialDamageTarget({get:()=>0},-1),TypeError);
  assert.equal(spatialDamageTarget({get:()=>0},0).y,0);
});
