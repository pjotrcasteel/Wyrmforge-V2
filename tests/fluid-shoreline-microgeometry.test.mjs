import test from 'node:test';
import assert from 'node:assert/strict';
import {ColumnFluidEngine} from '../src/fluid/column-fluid-engine.mjs';
import {
  buildFluidSurfaceMesh,FLUID_SHORE_MICRO_STEPS
} from '../src/fluid/fluid-surface-mesh.mjs';

function meshWith({width=3,height=3,seed,materialFloor}){
  const bounds={minX:0,maxX:width-1,minZ:0,maxZ:height-1};
  const engine=new ColumnFluidEngine({bounds,
    floorAt:materialFloor,initial:seed
  });
  const mesh=buildFluidSurfaceMesh(engine.snapshotSurface(),{
    sampleAt:(x,z)=>engine.sample(x,z)
  });
  return {engine,mesh};
}

test('only wet geometry beside a tall physical bank gets 10cm inward micro-contours',()=>{
  const {engine,mesh}=meshWith({
    width:3,height:3,
    materialFloor:(x,z)=>x===1&&z===1?0:3,
    seed:[{x:1,z:1,depth:10}]
  });
  assert.equal(FLUID_SHORE_MICRO_STEPS,10);
  assert.equal(mesh.wetColumns,1);
  assert.equal(mesh.refinedShoreColumns,1);
  assert.ok(mesh.topFaces>1,'a shoreline is no longer a single 1m rectangle');
  assert.ok(mesh.topFaces<45,'the shore should use bounded merged micro-patches');
  assert.equal(mesh.sideFaces,0,'higher terrain hides water walls');
  assert.ok(mesh.positions.length>0);
  for(let i=0;i<mesh.positions.length;i+=3){
    const x=mesh.positions[i],y=mesh.positions[i+1],z=mesh.positions[i+2];
    assert.ok(x>=1&&x<=2&&z>=1&&z<=2,'no water may be painted onto dry land');
    assert.ok(Math.abs(x*10-Math.round(x*10))<.00001);
    assert.ok(Math.abs(z*10-Math.round(z*10))<.00001);
    assert.ok(Math.abs(y-1.006)<.00001);
  }
  assert.equal(engine.wetCount,1,'presentation does not mutate fluid authority');
  assert.deepEqual(
    buildFluidSurfaceMesh(engine.snapshotSurface(),{
      sampleAt:(x,z)=>engine.sample(x,z)
    }).positions,mesh.positions,
    'shore pixels must stay stable between identical frames'
  );
});

test('waterfalls over lower dry terrain retain full solid fluid walls and no fake shore notch',()=>{
  const {mesh}=meshWith({
    width:2,height:1,
    materialFloor:x=>x===0?0:-2,
    seed:[{x:0,z:0,depth:10}]
  });
  assert.equal(mesh.wetColumns,1);
  assert.equal(mesh.refinedShoreColumns,0);
  assert.equal(mesh.topFaces,1);
  assert.equal(mesh.sideFaces,1);
  assert.equal(mesh.faceCount,2);
  assert.deepEqual([...mesh.positions.slice(0,3)],[0,1.006,0]);
});

test('adjacent shallow wet columns share sub-meter edge heads without vertical seams',()=>{
  const {mesh}=meshWith({
    width:2,height:1,
    materialFloor:()=>0,
    seed:[{x:0,z:0,depth:10},{x:1,z:0,depth:8}]
  });
  assert.equal(mesh.wetColumns,2);
  assert.equal(mesh.topFaces,2);
  assert.equal(mesh.sideFaces,0);
  const nearX1=[...Array(mesh.positions.length/3).keys()]
    .filter(i=>Math.abs(mesh.positions[i*3]-1)<.00001)
    .map(i=>mesh.positions[i*3+1]);
  assert.equal(nearX1.length,4);
  for(const value of nearX1)assert.ok(Math.abs(value-.906)<.00001);
});

test('bounded river with thousands of micro-shore edges cannot exceed Water V2 GPU budget',()=>{
  // A long narrow river has natural exposed banks all along its course.
  // 64x32=2048 resident cells but only one row has water.
  const {engine,mesh}=meshWith({
    width:64,height:32,
    materialFloor:(_x,z)=>z===16?0:3,
    seed:Array.from({length:64},(_,x)=>({x,z:16,depth:10}))
  });
  assert.equal(mesh.wetColumns,64);
  assert.ok(mesh.refinedShoreColumns>=60);
  assert.ok(mesh.triangleCount<5000,'merged shoreline caps must remain bounded');
  const bytes=mesh.positions.byteLength+mesh.normals.byteLength+
    mesh.flows.byteLength+mesh.indices.byteLength;
  assert.ok(bytes<=2*1024*1024);
  assert.equal(engine.wetCount,64);
});
