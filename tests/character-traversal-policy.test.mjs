import test from 'node:test';
import assert from 'node:assert/strict';
import { VoxelWorld } from '../src/voxel-world.mjs';
import {
  ACTOR_GRAVITY,actorOverlapsTerrain,simulateTerrainActor,spawnTerrainActor
} from '../src/terrain-actor.mjs';
import {
  AUTO_STEP_HEIGHT,AUTO_HOP_HEIGHT,AUTO_HOP_UPWARD_SPEED,
  classifyTraversalHeight,computeFallDamage,describeFallImpact
} from '../src/character-traversal-policy.mjs';

function flat() {
  const world=new VoxelWorld();
  for(let x=-6;x<=10;x++)for(let z=-4;z<=4;z++)world.set(x,0,z,3);
  return world;
}
function tick(world,actor,moveX=0) {
  const next=simulateTerrainActor(world,actor,{dt:1/60,moveX});
  assert.equal(next.error,null);
  assert.equal(actorOverlapsTerrain(world,next),false);
  return next;
}

test('no jump input; automatic 1m hop follows a visible ballistic arc, not a position teleport',()=>{
  const world=flat();
  for(let x=2;x<=5;x++)for(let z=-1;z<=1;z++)world.set(x,1,z,3);
  let actor=spawnTerrainActor(world,{x:0.5,z:0.5,searchTopY:10});
  let hops=0,highest=actor.y,movedUp=0;
  let previousY=actor.y;
  for(let i=0;i<110;i++) {
    actor=tick(world,actor,1);
    if(actor.autoHopStarted)hops++;
    if(actor.y>highest)highest=actor.y;
    if(actor.y>previousY+.005)movedUp++;
    assert.ok(actor.y-previousY<0.2,
      'no instant one-metre teleport to the higher ledge');
    previousY=actor.y;
    if(actor.x>3 && actor.grounded)break;
  }
  assert.equal(hops,1,'one automatic hop per reachable ledge');
  assert.ok(movedUp>=8,'hop is visible over multiple frames');
  assert.ok(highest>2.05,'the collision swept arc clears the one-metre ledge');
  assert.ok(actor.x>3);
  assert.ok(actor.y>1.9);
  assert.equal(actor.fallDamage,0,'a small auto-hop cannot inflict fall injury');
  assert.equal(AUTO_HOP_HEIGHT,1.05);
  assert.equal(AUTO_HOP_UPWARD_SPEED,7.4);
});

test('small 10cm ledges auto-step, do not launch a hop',()=>{
  const world=flat();
  for(let x=2;x<=5;x++)for(let z=-1;z<=1;z++) {
    world.set(x,1,z,2);
    world.setMicroSurfaceTile(x,1,z,Array(100).fill(2));
  }
  let actor=spawnTerrainActor(world,{x:0.5,z:0.5,searchTopY:10});
  let hops=0,stepped=0;
  for(let i=0;i<55;i++) {
    actor=tick(world,actor,1);
    if(actor.autoHopStarted)hops++;
    if(actor.stepUp)stepped++;
  }
  assert.equal(hops,0);
  assert.ok(stepped>0);
  assert.ok(actor.y>1.18);
  assert.equal(AUTO_STEP_HEIGHT,0.35);
});

test('three-metre rock wall and low overhead ceiling cannot trigger automatic hop',()=>{
  const world=flat();
  for(let y=1;y<=4;y++)for(let z=-1;z<=1;z++)world.set(2,y,z,3);
  let actor=spawnTerrainActor(world,{x:0.5,z:0.5,searchTopY:10});
  let hops=0;
  for(let i=0;i<70;i++) {
    actor=tick(world,actor,1);
    if(actor.autoHopStarted)hops++;
  }
  assert.equal(hops,0);
  assert.ok(actor.x<1.75);
  assert.equal(actor.grounded,true);

  const low=flat();
  for(let z=-1;z<=1;z++) {
    low.set(2,1,z,3);
    low.set(1,3,z,3); // low ceiling over the launch point
  }
  actor=spawnTerrainActor(low,{x:0.5,z:0.5,searchTopY:10});
  hops=0;
  for(let i=0;i<65;i++) {
    actor=tick(low,actor,1);
    hops+=Number(actor.autoHopStarted);
  }
  assert.equal(hops,0);
});

test('fall injury is emitted exactly once on a hard landing and gameplay owns HP',()=>{
  const world=flat();
  for(let x=-1;x<=1;x++)for(let z=-1;z<=1;z++) {
    world.set(x,5,z,2);
  }
  let actor=spawnTerrainActor(world,{x:0.5,z:0.5,searchTopY:12});
  assert.ok(actor.grounded);
  assert.ok(Math.abs(actor.y-6)<.001);
  for(let x=-1;x<=1;x++)for(let z=-1;z<=1;z++) {
    world.set(x,5,z,0);
  }
  let impacts=0,injury=0;
  for(let i=0;i<180;i++) {
    actor=tick(world,actor);
    if(actor.fallImpact) {
      impacts++;
      injury+=actor.fallDamage;
      assert.ok(actor.fallImpact.distance>4.9);
      assert.equal(actor.fallImpact.severity,'injury');
      assert.ok(actor.fallImpact.speed>5);
      assert.equal(actor.fallDamage,computeFallDamage(actor.fallImpact.distance));
    }
    if(actor.grounded && impacts>0)break;
  }
  assert.equal(impacts,1);
  assert.ok(injury>=60);
  assert.ok(Math.abs(actor.y-1)<.001);
  assert.equal(world.get(0,0,0),3);
  const next=tick(world,actor);
  assert.equal(next.fallImpact,null);
  assert.equal(next.fallDamage,0);
});

test('fall policy distinguishes harmless short drops, damaging falls, and lethal impacts',()=>{
  assert.equal(computeFallDamage(0.5),0);
  assert.equal(computeFallDamage(2),0);
  assert.equal(computeFallDamage(3),20);
  assert.equal(computeFallDamage(7),100);
  assert.equal(describeFallImpact({distance:1.5,speed:4}).severity,'safe');
  assert.equal(describeFallImpact({distance:3,speed:11}).severity,'injury');
  assert.equal(describeFallImpact({distance:7,speed:20}).severity,'fatal');
  assert.equal(classifyTraversalHeight(1,2).type,'auto-hop');
  assert.equal(classifyTraversalHeight(1,1.2).type,'auto-step');
  assert.equal(classifyTraversalHeight(2,0).type,'safe-descent');
  assert.equal(classifyTraversalHeight(5,1).type,'damaging-drop');
  assert.equal(classifyTraversalHeight(1,7).passable,false);
  assert.equal(classifyTraversalHeight(7,0).passable,false);
  assert.ok(ACTOR_GRAVITY>10);
});
