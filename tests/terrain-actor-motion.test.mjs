import test from 'node:test';
import assert from 'node:assert/strict';
import { VoxelWorld } from '../src/voxel-world.mjs';
import { TerrainEditLedger } from '../src/terrain-edit-ledger.mjs';
import {
  ACTOR_MAX_UPWARD_SPEED, ACTOR_HEIGHT, ACTOR_HALF_WIDTH,
  actorOverlapsTerrain, spawnTerrainActor, simulateTerrainActor
} from '../src/terrain-actor.mjs';

function groundWorld(edge=16) {
  const world=new VoxelWorld({chunkEdge:edge});
  for(let x=-8;x<=8;x++)for(let z=-8;z<=8;z++)world.set(x,0,z,3);
  return world;
}
function step(world,actor,options={}) {
  const result=simulateTerrainActor(world,actor,{...options,dt:1/60});
  assert.equal(result.error,null);
  assert.equal(actorOverlapsTerrain(world,result),false);
  return result;
}

test('ordinary actor walking has no jump input or spontaneous upward impulse', () => {
  for(const edge of [16,32]) {
    const world=groundWorld(edge);
    let actor=spawnTerrainActor(world,{x:.5,z:.5,searchTopY:10});
    const start=actor.y;
    for(let i=0;i<100;i++) actor=step(world,actor,{moveX:.5,moveZ:.2});
    assert.equal(actor.grounded,true);
    assert.ok(Math.abs(actor.y-start)<.01);
    assert.equal(actor.vy,0);
    assert.equal(Object.hasOwn(actor,'jumped'),false);
    // An old jump flag is not a supported game control and cannot lift actor.
    actor=step(world,actor,{jump:true});
    assert.equal(actor.grounded,true);
    assert.ok(Math.abs(actor.y-start)<.01);
  }
});

test('non-player upward impulse still collides with rock ceiling and stops', () => {
  for(const edge of [16,32]) {
    const world=groundWorld(edge);
    world.set(0,3,0,3);
    let actor=spawnTerrainActor(world,{x:.5,z:.5,searchTopY:2.9});
    assert.ok(actor?.grounded);
    actor={...actor,vy:7};
    let hitCeiling=false;
    for(let i=0;i<70;i++) {
      actor=step(world,actor);
      if(actor.ceilingContact) {
        hitCeiling=true;
        assert.equal(actor.grounded,false);
        assert.equal(actor.vy,0);
      }
      assert.ok(actor.y<3-ACTOR_HEIGHT+.01);
    }
    assert.equal(hitCeiling,true);
    assert.equal(actor.grounded,true);
    assert.ok(Math.abs(actor.y-1)<.01);
    assert.equal(ACTOR_MAX_UPWARD_SPEED,8);
  }
});

test('automatic walking step handles small ledge but not a tall wall', () => {
  for(const edge of [16,32]){
    const world=groundWorld(edge);
    for(let x=2;x<=5;x++)world.set(x,1,0,3);
    let actor=spawnTerrainActor(world,{x:.5,z:.5,searchTopY:10});
    let stepped=false;
    for(let i=0;i<55;i++){
      actor=step(world,actor,{moveX:1});
      stepped ||=actor.stepUp;
    }
    assert.equal(stepped,true);
    assert.ok(actor.x>2.5);
    assert.ok(actor.y>1.9);

    const high=groundWorld(edge);
    for(let y=1;y<=7;y++)high.set(2,y,0,3);
    actor=spawnTerrainActor(high,{x:.5,z:.5,searchTopY:10});
    let wall=false;
    for(let i=0;i<90;i++){
      actor=step(high,actor,{moveX:1});
      wall ||=actor.wallContact;
    }
    assert.equal(wall,true);
    assert.ok(actor.x<2-ACTOR_HALF_WIDTH);
    assert.equal(actor.grounded,true);
  }
});

test('moving actor passes only after the authoritative wall is removed', () => {
  for(const edge of [16,32]){
    const world=groundWorld(edge);
    for(let y=1;y<=3;y++)world.set(2,y,0,3);
    const ledger=new TerrainEditLedger(world);
    let actor=spawnTerrainActor(world,{x:.5,z:.5,searchTopY:10});
    for(let i=0;i<40;i++)actor=step(world,actor,{moveX:1});
    assert.ok(actor.x<2-ACTOR_HALF_WIDTH);
    const edit=ledger.apply({
      id:'erase-wall',type:'carve-sphere',
      x:2,y:2,z:0,radius:1.1,
      expectedRevision:world.revision,
      expectedEditRevision:ledger.editRevision
    });
    assert.ok(edit.dirtyChunks.length);
    assert.equal(world.get(2,2,0),0);
    for(let i=0;i<50;i++)actor=step(world,actor,{moveX:1});
    assert.ok(actor.x>2.5);
    assert.equal(actor.worldRevision,world.revision);
    assert.equal(actor.grounded,true);
  }
});

test('disappearing raised floor lets externally moving actor drop to lower voxels', () => {
  for(const edge of [16,32]){
    const world=groundWorld(edge);
    for(let x=-1;x<=1;x++)for(let z=-1;z<=1;z++)world.set(x,4,z,2);
    const ledger=new TerrainEditLedger(world);
    let actor=spawnTerrainActor(world,{x:.5,z:.5,searchTopY:12});
    assert.ok(Math.abs(actor.y-5)<.01);
    // Simulate a bounded Physics V2 external knockback rather than player jump.
    actor={...actor,vy:3};
    actor=step(world,actor);
    ledger.apply({
      id:'remove-airborne-support',type:'carve-sphere',
      x:0,y:4,z:0,radius:2.5,
      expectedRevision:world.revision,
      expectedEditRevision:ledger.editRevision
    });
    let lower=false,landed=false;
    for(let i=0;i<140;i++) {
      actor=step(world,actor);
      lower ||= actor.y<4;
      if(lower && actor.grounded){landed=true;break;}
    }
    assert.equal(lower,true);
    assert.equal(landed,true);
    assert.ok(Math.abs(actor.y-1)<.01);
  }
});

test('invalid external vertical velocities and long fixed steps fail closed', () => {
  const world=groundWorld();
  const actor=spawnTerrainActor(world,{x:.5,z:.5,searchTopY:10});
  assert.throws(()=>simulateTerrainActor(world,{...actor,vy:Infinity}),RangeError);
  assert.throws(()=>simulateTerrainActor(world,actor,{dt:1}),RangeError);
});
