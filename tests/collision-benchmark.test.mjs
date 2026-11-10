import test from 'node:test';
import assert from 'node:assert/strict';
import { VoxelWorld } from '../src/voxel-world.mjs';
import { runCollisionProbe } from '../src/collision-benchmark.mjs';

test('collision probe traverses supported ground without overlap',()=>{
  const world=new VoxelWorld();
  for(let x=-12;x<=12;x++) for(let z=-12;z<=12;z++) world.set(x,0,z,1);
  const report=runCollisionProbe(world,{steps:240});
  assert.equal(report.verdict,'pass');
  assert.equal(report.overlaps,0);
  assert.equal(report.steps,240);
  assert.ok(report.groundedSteps>0);
});
test('collision probe rejects unsupported spawn and unbounded step count',()=>{
  const world=new VoxelWorld();
  assert.equal(runCollisionProbe(world).reason,'no-supported-spawn');
  assert.throws(()=>runCollisionProbe(world,{steps:3601}),RangeError);
});
