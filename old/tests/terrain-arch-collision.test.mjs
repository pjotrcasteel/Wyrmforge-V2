import test from 'node:test';
import assert from 'node:assert/strict';
import { createScene } from '../src/voxel-world.mjs';
import {
  ACTOR_HALF_WIDTH, ACTOR_HEIGHT, actorOverlapsTerrain,
  spawnTerrainActor, simulateTerrainActor, sweepActorAxis
} from '../src/terrain-actor.mjs';

const archSpawn = { x:0.5, z:2.5, searchTopY:6 };

function walk(world,start,options,steps=140) {
  let actor=start;
  let blocked=false,stepsUp=0;
  for(let step=0;step<steps;step++){
    actor=simulateTerrainActor(world,actor,{...options,dt:1/60});
    assert.equal(actor.error,null);
    assert.equal(actorOverlapsTerrain(world,actor),false,
      'the authoritative 3D actor collider must never overlap arch voxels');
    blocked ||= actor.wallContact;
    if(actor.stepUp) stepsUp++;
  }
  return {actor,blocked,stepsUp};
}

test('arch fixture spawn is INSIDE opening (same Z as pillars), not in foreground', () => {
  for (const chunkEdge of [16,32]) {
    const world=createScene('arch',7,{chunkEdge});
    const actor=spawnTerrainActor(world,archSpawn);
    assert.ok(actor?.grounded);
    assert.ok(Math.abs(actor.y-2)<0.001);
    assert.equal(actor.z,2.5);
    assert.equal(world.get(5,2,2),3,'east pillar exists at walking height');
    assert.equal(world.get(-5,2,2),3,'west pillar exists at walking height');
    assert.equal(world.get(0,8,2),3,'lintel is above actor');
    assert.equal(actorOverlapsTerrain(world,actor),false);
  }
});

test('arch pillars block both sides at their real 3D depth, 16³ and 32³', () => {
  for (const chunkEdge of [16,32]) {
    for (const seed of [0,7,4294967295]) {
      const world=createScene('arch',seed,{chunkEdge});
      const actor=spawnTerrainActor(world,archSpawn);
      const east=walk(world,actor,{moveX:1});
      assert.ok(east.blocked,'east pillar must produce actual wall contact');
      assert.ok(east.actor.x<=5-ACTOR_HALF_WIDTH+0.001);
      assert.ok(east.actor.x>3.5);
      assert.ok(Math.abs(east.actor.z-2.5)<1e-8);
      assert.equal(east.actor.grounded,true);
      assert.equal(east.stepsUp,0,'solid pillar must not be auto-climbed');

      const west=walk(world,actor,{moveX:-1});
      assert.ok(west.blocked,'west pillar must produce actual wall contact');
      assert.ok(west.actor.x>=-5+ACTOR_HALF_WIDTH-0.001);
      assert.ok(west.actor.x<-3.5);
      assert.equal(west.actor.grounded,true);
      assert.equal(west.stepsUp,0);
    }
  }
});

test('arch overhead lintel is a real solid ceiling, not a heightmap-only obstruction', () => {
  for(const chunkEdge of [16,32]){
    const world=createScene('arch',7,{chunkEdge});
    const actor=spawnTerrainActor(world,archSpawn);
    const hit=sweepActorAxis(world,actor,'y',12);
    assert.equal(hit.collided,true);
    assert.ok(hit.position<8-ACTOR_HEIGHT);
    assert.equal(actorOverlapsTerrain(world,{...actor,y:hit.position}),false);
  }
});

test('old foreground spawn can walk past projected arch, demonstrating the test-lane mismatch', () => {
  for (const chunkEdge of [16,32]) {
    const world=createScene('arch',7,{chunkEdge});
    const old=spawnTerrainActor(world,{x:-7.5,z:-5.5});
    assert.ok(old?.grounded);
    const moved=walk(world,old,{moveX:1},190);
    assert.equal(moved.blocked,false,
      'no actual arch pillars exist at Z=-5.5, outside the Z=1..3 collision lane');
    assert.ok(moved.actor.x>5);
  }
});

test('actor can leave the arch opening along Z without passing through a wall', () => {
  const world=createScene('arch',7,{chunkEdge:32});
  const actor=spawnTerrainActor(world,archSpawn);
  const moved=walk(world,actor,{moveZ:-1},65);
  assert.ok(moved.actor.z<1,'the open entrance may be exited through terrain depth');
  assert.equal(moved.actor.grounded,true);
  assert.equal(moved.blocked,false);
});
