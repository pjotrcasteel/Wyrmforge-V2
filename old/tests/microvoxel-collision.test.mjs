import test from 'node:test';
import assert from 'node:assert/strict';
import { VoxelWorld } from '../src/voxel-world.mjs';
import { raycastTerrain } from '../src/terrain-raycast.mjs';
import {
  actorOverlapsTerrain,sweepActorAxis,spawnTerrainActor
} from '../src/terrain-actor.mjs';

function worldWithStep(steps=7) {
  const world=new VoxelWorld();
  for(let x=-1;x<=1;x++)for(let z=-1;z<=1;z++) {
    world.set(x,-1,z,3);
    world.set(x,0,z,2);
    world.setMicroSurfaceTile(x,0,z,new Array(100).fill(steps));
  }
  return world;
}

test('vertical terrain ray hits the actual 70cm occupied cap, not the old whole-block top',()=>{
  const world=worldWithStep(7);
  const ray={origin:[0.5,4,0.5],direction:[0,-1,0],maxDistance:10};
  const hit=raycastTerrain(world,ray);
  assert.ok(hit);
  assert.equal(hit.cell.y,0);
  assert.ok(Math.abs(hit.point.y-0.7)<0.0001,
    'microvoxel ray must not pretend the full 1m voxel is solid');
  assert.deepEqual(hit.normal,{x:0,y:1,z:0});
  assert.equal(world.materialAtPoint(0.5,0.75,0.5),0);
  assert.equal(world.materialAtPoint(0.5,0.65,0.5),2);
});

test('sideways rays pass above a shallow microvoxel track and hit at real height',()=>{
  const world=worldWithStep(7);
  const above=raycastTerrain(world,{
    origin:[-3,0.8,0.5],direction:[1,0,0],maxDistance:8
  });
  assert.equal(above,null,'the 70cm road is not a full-height side wall');
  const below=raycastTerrain(world,{
    origin:[-3,0.4,0.5],direction:[1,0,0],maxDistance:8
  });
  assert.ok(below);
  assert.equal(below.cell.x,-1);
});

test('actor feet and downward sweeps agree with microvoxel physical surface',()=>{
  const world=worldWithStep(7);
  const feet={x:0.5,y:0.70001,z:0.5};
  assert.equal(actorOverlapsTerrain(world,feet),false);
  assert.equal(actorOverlapsTerrain(world,{...feet,y:0.6}),true);
  const fall=sweepActorAxis(world,{x:0.5,y:1.2,z:0.5},'y',-0.8);
  assert.equal(fall.collided,true);
  assert.ok(Math.abs(fall.position-0.70001)<0.0001);
  const spawn=spawnTerrainActor(world,{
    x:0.5,z:0.5,searchTopY:5,maxSearchDistance:20
  });
  assert.ok(spawn);
  assert.equal(spawn.grounded,true);
  assert.ok(Math.abs(spawn.y-0.70001)<0.0001);
});

test('destroying a refined road voxel restores empty space to ray, collision and movement',()=>{
  const world=worldWithStep(7);
  world.set(0,0,0,0);
  assert.equal(world.microSurfaceTile(0,0,0),null);
  assert.equal(world.materialAtPoint(0.5,0.4,0.5),0);
  const hit=raycastTerrain(world,{
    origin:[0.5,4,0.5],direction:[0,-1,0],maxDistance:10
  });
  assert.ok(hit);
  assert.equal(hit.cell.y,-1);
  assert.ok(Math.abs(hit.point.y)<0.0001);
  assert.equal(actorOverlapsTerrain(world,{x:0.5,y:0.1,z:0.5}),false);
});

test('plain integer worlds retain existing collision/raycast fast path',()=>{
  const world=new VoxelWorld();
  world.set(0,0,0,3);
  assert.equal(world.microSurfaceCount,0);
  const hit=raycastTerrain(world,{
    origin:[0.5,3,0.5],direction:[0,-1,0],maxDistance:8
  });
  assert.ok(hit);
  assert.equal(hit.point.y,1);
  const sweep=sweepActorAxis(world,{x:0.5,y:2,z:0.5},'y',-2);
  assert.equal(sweep.collided,true);
  assert.ok(Math.abs(sweep.position-1.00001)<0.0001);
});
