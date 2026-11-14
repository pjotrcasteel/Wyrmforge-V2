import test from 'node:test';
import assert from 'node:assert/strict';
import {HuntWoodlandObjects} from '../src/hunt-woodland-objects.mjs';

test('grounded trunks stop both approaches, preserve canopy clearance and evict with the region',()=>{
  const tree={kind:'tree',id:'trunk-1',position:{x:0,y:5,z:0},scale:1,seed:7};
  const objects=new HuntWoodlandObjects({placement:()=>({placements:[tree]})});
  const terrain={raycast:()=>({point:{y:5}})};
  objects.update(['entry'],terrain);
  const first=[...objects.regions][0][0];
  assert.ok(Math.abs(objects.limitTravel({x:-2,y:5,z:0},'x',4)-1.48999)<1e-9);
  assert.ok(Math.abs(objects.limitTravel({x:0,y:5,z:2},'z',-4)+1.48999)<1e-9);
  assert.equal(objects.limitTravel({x:-2,y:5,z:1},'x',4),4);
  assert.equal(objects.limitTravel({x:-2,y:7,z:0},'x',4),4);
  objects.update([],terrain);
  assert.equal(objects.limitTravel({x:-2,y:5,z:0},'x',4),4);
  objects.update(['entry'],terrain);
  assert.deepEqual([...objects.regions][0][0],first);
});
