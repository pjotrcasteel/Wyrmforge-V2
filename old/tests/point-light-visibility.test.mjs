import test from 'node:test';
import assert from 'node:assert/strict';
import {VoxelWorld} from '../src/voxel-world.mjs';
import {raycastTerrain} from '../src/terrain-raycast.mjs';
import {defineLightSet} from '../src/lighting/light-contract.mjs';
import {defineLightOccluders,nearestOccluderDistance}
  from '../src/lighting/occluder-contract.mjs';
import {PointLightVisibility,POINT_VISIBILITY_RAY_BUDGET,
  samplePointVisibility} from '../src/lighting/point-light-visibility.mjs';

const light=(id='spell',position=[0.5,2.5,0.5])=>defineLightSet({
  epoch:1,revision:1,emitters:[{id,position,radius:8,radiance:[4,1,0]}]});
const port=world=>({epoch:1,revision:world.revision,raycast:ray=>raycastTerrain(world,ray)});
function complete(controller,set,occluders=null){
  let result;
  for(let i=0;i<12;i++){
    result=controller.update(set,occluders);
    assert.ok(controller.statistics.frameRays<=POINT_VISIBILITY_RAY_BUDGET);
    if(result.ready)break;
  }
  assert.ok(result.ready);
  return result;
}
test('physical wall blocks light behind it but leaves the near side illuminated',()=>{
  const world=new VoxelWorld({chunkEdge:16});
  for(let z=-2;z<=2;z++)for(let y=1;y<=4;y++)world.set(3,y,z,3);
  const f=complete(new PointLightVisibility(port(world)),light());
  assert.ok(samplePointVisibility(f,0,[5.5,2.2,.5])<.1);
  assert.ok(samplePointVisibility(f,0,[1.5,2.2,.5])>.95);
  assert.ok(samplePointVisibility(f,0,[-4,2.2,.5])>.9);
});
test('destroying a wall reopens its light ray after authoritative revision',()=>{
  const world=new VoxelWorld({chunkEdge:16});
  // Both the eye-level and lower sloped ray must cross physical material.
  world.set(3,1,0,3);
  world.set(3,2,0,3);
  const controller=new PointLightVisibility(port(world));
  const first=complete(controller,light());
  assert.ok(samplePointVisibility(first,0,[6,2,.5])<.2);
  world.set(3,1,0,0);
  world.set(3,2,0,0);
  const changed=defineLightSet({epoch:1,revision:world.revision,
    emitters:light().emitters});
  const after=complete(controller,changed);
  assert.ok(samplePointVisibility(after,0,[6,2,.5])>.9);
});
test('new building or tree geometry uses the SAME occluder contract',()=>{
  const world=new VoxelWorld({chunkEdge:16}),controller=new PointLightVisibility(port(world));
  const building=defineLightOccluders({revision:3,entries:[{
    id:'building.alpha',min:[2,0,-2],max:[3,5,3]}]});
  const behind=complete(controller,light(),building);
  assert.ok(samplePointVisibility(behind,0,[5,2,.5])<.1);
  const tree=defineLightOccluders({revision:4,entries:[{
    id:'tree.oak',min:[2,0,-2],max:[3,5,3]}]});
  const same=complete(controller,light(),tree);
  assert.deepEqual([...behind.distances],[...same.distances]);
  assert.equal(nearestOccluderDistance([.5,2.5,.5],[1,0,0],8,tree.entries),1.5);
});
test('bounded work, two sources and epoch replacement never retain stale occlusion',()=>{
  const world=new VoxelWorld({chunkEdge:16}),controller=new PointLightVisibility(port(world));
  const both=defineLightSet({epoch:1,revision:1,emitters:[
    light().emitters[0],{id:'lava',position:[-4,2,0],radius:5,radiance:[1,.2,0]}]});
  const field=complete(controller,both);
  assert.equal(field.lights.length,2);
  assert.equal(field.distances.length,48);
  assert.equal(controller.statistics.retainedBytes,192);
  assert.ok(controller.statistics.resets===1);
  const newEpoch=defineLightSet({epoch:2,revision:0,emitters:both.emitters});
  complete(controller,newEpoch);
  assert.equal(controller.statistics.resets,2);
  controller.clear();assert.equal(controller.statistics.retainedBytes,0);
});
test('an emitter inside a solid object is blocked at the exit boundary',()=>{
  const shell=defineLightOccluders({revision:1,entries:[{
    id:'room',min:[0,0,0],max:[3,5,3]}]});
  const exit=nearestOccluderDistance([1,2,1],[1,0,0],12,shell.entries);
  assert.equal(exit,2);
  assert.throws(()=>defineLightOccluders({entries:[{
    id:'bad',min:[0,0,0],max:[0,2,3]}]}),TypeError);
});
