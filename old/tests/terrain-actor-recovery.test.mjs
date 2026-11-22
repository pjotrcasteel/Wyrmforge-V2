import test from 'node:test';
import assert from 'node:assert/strict';
import { VoxelWorld } from '../src/voxel-world.mjs';
import {
  ACTOR_PHYSICS_SCHEMA, actorOverlapsTerrain,
  recoverTerrainActor, simulateTerrainActor
} from '../src/terrain-actor.mjs';

const SKIN=1e-5;
function ground(edge=16) {
  const world=new VoxelWorld({chunkEdge:edge});
  for(let x=-4;x<=4;x++) {
    for(let z=-4;z<=4;z++) world.set(x,0,z,3);
  }
  return world;
}
const at=(x=.5,y=1+SKIN,z=.5)=>({x,y,z,vy:-2,grounded:false,
  wallContact:true,ceilingContact:true,stepUp:true});

test('V2 actor recovery preserves an already safe supported position', () => {
  for(const edge of [16,32]) {
    const world=ground(edge);
    const source=at(.8,1+SKIN,-.3);
    const before=world.snapshots();
    const result=recoverTerrainActor(world,source);
    assert.deepEqual({x:result.x,y:result.y,z:result.z},
      {x:source.x,y:source.y,z:source.z});
    assert.equal(result.schema,ACTOR_PHYSICS_SCHEMA);
    assert.equal(result.grounded,true);
    assert.equal(result.vy,0);
    assert.equal(result.wallContact,false);
    assert.equal(result.ceilingContact,false);
    assert.equal(result.stepUp,false);
    assert.equal(result.worldRevision,world.revision);
    assert.deepEqual(world.snapshots(),before,'recovery never edits authority');
  }
});

test('blocked origin recovers horizontally before teleporting up onto a tall pillar', () => {
  for(const edge of [16,32]) {
    const world=ground(edge);
    world.set(0,1,0,3);
    world.set(0,2,0,3);
    const source=at();
    assert.equal(actorOverlapsTerrain(world,source),true);
    const recovered=recoverTerrainActor(world,source,{horizontalRadius:1,verticalRange:3});
    assert.ok(recovered);
    assert.equal(recovered.x,-.5,'stable nearest-available-cell tie order');
    assert.equal(recovered.z,.5);
    assert.ok(Math.abs(recovered.y-(1+SKIN))<1e-6);
    assert.equal(recovered.grounded,true);
    assert.equal(actorOverlapsTerrain(world,recovered),false);
    const stationary=simulateTerrainActor(world,recovered,{dt:1/60});
    assert.equal(stationary.error,null);
    assert.equal(stationary.grounded,true);
  }
});

test('recovery under a real overhang chooses available support, not an air pocket', () => {
  const world=ground(16);
  world.set(0,2,0,3);
  const candidate=recoverTerrainActor(world,at(),{
    horizontalRadius:1,verticalRange:4
  });
  assert.ok(candidate);
  assert.equal(candidate.x,-.5);
  assert.equal(candidate.y,1+SKIN);
  assert.equal(actorOverlapsTerrain(world,candidate),false);
});

test('recovery across signed negative chunk seams is deterministic for 16 and 32', () => {
  for(const edge of [16,32]) {
    const world=ground(edge);
    world.set(-1,1,0,2);
    world.set(-1,2,0,2);
    const origin=at(-.5,1+SKIN,.5);
    const results=Array.from({length:3},()=>recoverTerrainActor(world,origin,{
      horizontalRadius:1,verticalRange:3
    }));
    assert.ok(results[0]);
    assert.deepEqual(results,[results[0],results[0],results[0]]);
    assert.equal(results[0].x,-1.5);
    assert.equal(results[0].worldRevision,world.revision);
  }
});

test('no valid supporting surface fails closed instead of spawning airborne', () => {
  const world=new VoxelWorld();
  assert.equal(recoverTerrainActor(world,at()),null);
  assert.equal(recoverTerrainActor(world,at(),{
    horizontalRadius:0,verticalRange:0
  }),null);
});

test('bounded recovery validates its inputs instead of scanning an entire world', () => {
  const world=ground();
  const actor=at();
  assert.throws(()=>recoverTerrainActor(world,{...actor,x:Infinity}),TypeError);
  assert.throws(()=>recoverTerrainActor(null,actor),TypeError);
  assert.throws(()=>recoverTerrainActor(world,actor,{horizontalRadius:-1}),RangeError);
  assert.throws(()=>recoverTerrainActor(world,actor,{horizontalRadius:9}),RangeError);
  assert.throws(()=>recoverTerrainActor(world,actor,{verticalRange:13}),RangeError);
  assert.throws(()=>recoverTerrainActor(world,actor,{verticalRange:.5}),RangeError);
});
