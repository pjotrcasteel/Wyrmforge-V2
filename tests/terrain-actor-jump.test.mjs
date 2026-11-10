import test from 'node:test';
import assert from 'node:assert/strict';
import { VoxelWorld } from '../src/voxel-world.mjs';
import { TerrainEditLedger } from '../src/terrain-edit-ledger.mjs';
import {
  ACTOR_JUMP_SPEED, ACTOR_HEIGHT, ACTOR_HALF_WIDTH,
  actorOverlapsTerrain, spawnTerrainActor, simulateTerrainActor
} from '../src/terrain-actor.mjs';

function groundWorld(edge=16) {
  const world=new VoxelWorld({chunkEdge:edge});
  for(let x=-8;x<=8;x++)for(let z=-8;z<=8;z++)world.set(x,0,z,3);
  return world;
}

function step(world,state,options={}) {
  const next=simulateTerrainActor(world,state,{dt:1/60,...options});
  assert.equal(next.error,null);
  assert.equal(actorOverlapsTerrain(world,next),false);
  return next;
}

test('jump is initiated only from supported ground; arc lands without tunneling', () => {
  for(const edge of [16,32]) {
    const world=groundWorld(edge);
    let actor=spawnTerrainActor(world,{x:.5,z:.5,searchTopY:10});
    const startY=actor.y;
    actor=step(world,actor,{jump:true});
    assert.equal(actor.jumped,true);
    assert.equal(actor.grounded,false);
    assert.ok(actor.vy>0 && actor.vy<ACTOR_JUMP_SPEED);
    assert.ok(actor.y>startY);
    let peak=actor.y,landed=false;
    for(let i=0;i<90;i++){
      actor=step(world,actor,{jump:false});
      peak=Math.max(peak,actor.y);
      if(actor.grounded){landed=true;break;}
    }
    assert.equal(landed,true);
    assert.ok(peak>startY+.8,'jump must visibly clear a low ledge');
    assert.ok(Math.abs(actor.y-startY)<.01);
    assert.equal(actor.ceilingContact,false);
  }
});

test('low ceiling stops upward sweep without reporting a landing', () => {
  for(const edge of [16,32]){
    const world=groundWorld(edge);
    world.set(0,3,0,3);
    let actor=spawnTerrainActor(world,{x:.5,z:.5,searchTopY:2.9});
    assert.ok(actor?.grounded);
    let hitCeiling=false,peak=actor.y;
    for(let i=0;i<70;i++){
      actor=step(world,actor,{jump:i===0});
      peak=Math.max(peak,actor.y);
      if(actor.ceilingContact){
        hitCeiling=true;
        assert.equal(actor.grounded,false,'ceiling is never a floor');
        assert.equal(actor.vy,0,'upward velocity must stop on contact');
      }
    }
    assert.equal(hitCeiling,true);
    assert.ok(peak<3-ACTOR_HEIGHT+0.01,'actor head must stay below ceiling');
    assert.equal(actor.grounded,true);
    assert.ok(Math.abs(actor.y-1)<.01);
  }
});

test('jump can clear one-voxel obstacle while touching a two-voxel wall is blocked', () => {
  for(const edge of [16,32]) {
    const world=groundWorld(edge);
    world.set(2,1,0,3);
    let actor=spawnTerrainActor(world,{x:.5,z:.5,searchTopY:10});
    let movedPast=false;
    for(let i=0;i<85;i++){
      actor=step(world,actor,{moveX:1,jump:i===0});
      movedPast ||=actor.x>2+ACTOR_HALF_WIDTH;
    }
    assert.equal(movedPast,true,'jump arc should move beyond single-voxel ledge');
    assert.equal(actor.grounded,true);

    const wall=groundWorld(edge);
    for(let y=1;y<=5;y++)wall.set(2,y,0,3);
    let blocked=spawnTerrainActor(wall,{x:.5,z:.5,searchTopY:10});
    for(let i=0;i<90;i++){
      blocked=step(wall,blocked,{moveX:1,jump:i===0});
    }
    assert.ok(blocked.x<2-ACTOR_HALF_WIDTH,
      'full-height solid wall still blocks airborne actor');
    assert.equal(blocked.grounded,true);
  }
});

test('moving actor no longer collides with wall removed during traversal', () => {
  for(const edge of [16,32]) {
    const world=groundWorld(edge);
    for(let y=1;y<=3;y++)world.set(2,y,0,3);
    const ledger=new TerrainEditLedger(world);
    let actor=spawnTerrainActor(world,{x:.5,z:.5,searchTopY:10});
    for(let i=0;i<30;i++)actor=step(world,actor,{moveX:1});
    assert.ok(actor.x<2-ACTOR_HALF_WIDTH,'initial wall blocks walking');
    const change=ledger.apply({
      id:'remove-wall',type:'carve-sphere',x:2,y:2,z:0,radius:1.1,
      expectedRevision:world.revision,expectedEditRevision:ledger.editRevision
    });
    assert.equal(world.get(2,1,0),0);
    assert.equal(world.get(2,2,0),0);
    assert.equal(world.get(2,3,0),0);
    assert.ok(change.dirtyChunks.length>0);
    for(let i=0;i<45;i++)actor=step(world,actor,{moveX:1});
    assert.ok(actor.x>2.3,'actor crosses immediately after voxel authority changes');
    assert.equal(actor.worldRevision,world.revision);
    assert.equal(actor.grounded,true);
  }
});

test('destroying a raised platform while actor jumps causes fall to lower ground', () => {
  for(const edge of [16,32]) {
    const world=groundWorld(edge);
    for(let x=-1;x<=1;x++)for(let z=-1;z<=1;z++)world.set(x,4,z,2);
    const ledger=new TerrainEditLedger(world);
    let actor=spawnTerrainActor(world,{x:.5,z:.5,searchTopY:10});
    assert.ok(Math.abs(actor.y-5)<.01);
    actor=step(world,actor,{jump:true});
    const change=ledger.apply({
      id:'platform-removed-mid-jump',type:'carve-sphere',
      x:0,y:4,z:0,radius:2.5,
      expectedRevision:world.revision,expectedEditRevision:ledger.editRevision
    });
    assert.ok(change.removedVoxels>0);
    let fellBelowPlatform=false,landed=false;
    for(let i=0;i<130;i++){
      actor=step(world,actor);
      if(actor.y<4)fellBelowPlatform=true;
      if(fellBelowPlatform && actor.grounded){landed=true;break;}
    }
    assert.equal(fellBelowPlatform,true,'must not land on stale upper geometry');
    assert.equal(landed,true,'must land safely on lower committed terrain');
    assert.ok(Math.abs(actor.y-1)<.01);
    assert.equal(actor.worldRevision,world.revision);
  }
});

test('midair jump input cannot repeatedly reset upward velocity', () => {
  const world=groundWorld();
  let actor=spawnTerrainActor(world,{x:.5,z:.5,searchTopY:10});
  actor=step(world,actor,{jump:true});
  const initialVy=actor.vy;
  actor=step(world,actor,{jump:true});
  assert.equal(actor.jumped,false);
  assert.ok(actor.vy<initialVy);
});

test('invalid jump and upward velocity are rejected before terrain reads', () => {
  const world=groundWorld();
  const actor=spawnTerrainActor(world,{x:.5,z:.5,searchTopY:10});
  assert.throws(()=>simulateTerrainActor(world,actor,{jump:1}),RangeError);
  assert.throws(()=>simulateTerrainActor(world,{...actor,vy:Infinity}),RangeError);
});
