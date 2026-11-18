import test from 'node:test';
import assert from 'node:assert/strict';
import {huntScreenMovement} from '../src/hunt-movement-input.mjs';
import {VoxelWorld} from '../src/voxel-world.mjs';
import {simulateTerrainActor} from '../src/terrain-actor.mjs';

test('screen diagonals stay within Voxel actor bounds after inspection-camera rotation',()=>{
  const world=new VoxelWorld();
  const actor={x:.5,y:4,z:.5,vy:0,grounded:false};
  for(const inspection of [false,true])for(const right of [-1,-.7071067811865476,0,.7071067811865476,1])
    for(const down of [-1,-.7071067811865476,0,.7071067811865476,1]) {
      const input=huntScreenMovement(right,down,inspection);
      assert.ok(Math.abs(input.moveX)<=1&&Math.abs(input.moveZ)<=1);
      assert.ok(Math.hypot(input.moveX,input.moveZ)<=1+1e-14);
      assert.doesNotThrow(()=>simulateTerrainActor(world,actor,{...input,dt:1/60}));
    }
  assert.deepEqual(huntScreenMovement(1,1,true),{moveX:1,moveZ:0});
});

test('small analog input keeps magnitude and map rotation keeps direction',()=>{
  const input=huntScreenMovement(.2,.3,true);
  assert.ok(Math.abs(Math.hypot(input.moveX,input.moveZ)-Math.hypot(.2,.3))<1e-12);
  assert.ok(huntScreenMovement(1,0,true).moveZ<0);
  assert.throws(()=>huntScreenMovement(NaN,0),/finite/);
});
