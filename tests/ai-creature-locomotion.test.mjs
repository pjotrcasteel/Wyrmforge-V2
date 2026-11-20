import test from 'node:test';
import assert from 'node:assert/strict';
import {VoxelWorld} from '../src/voxel-world.mjs';
import {actorOverlapsTerrain,spawnTerrainActor,simulateTerrainActor}
  from '../src/terrain-actor.mjs';
import {locomotionFor,AGILE_HOP_PROFILE}
  from '../src/encounter/enemy-locomotion.mjs';
import {classifyTraversalHeight,DEFAULT_TRAVERSAL_PROFILE}
  from '../src/character-traversal-policy.mjs';

function arena(height=1,ceiling=false){
  const world=new VoxelWorld({chunkEdge:16});
  for(let x=-5;x<=9;x++)for(let z=-3;z<=3;z++)world.set(x,0,z,3);
  for(let x=2;x<=6;x++)for(let z=-1;z<=1;z++){
    for(let y=1;y<=height;y++)world.set(x,y,z,3);
  }
  if(ceiling){
    for(let x=1;x<=2;x++)for(let z=-1;z<=1;z++)world.set(x,3,z,3);
  }
  return world;
}
function run(world,archetypeId,count=150){
  const traversalProfile=locomotionFor(archetypeId);
  let actor=spawnTerrainActor(world,{x:.5,z:.5,searchTopY:12});
  assert.ok(actor?.grounded);
  let hops=0,highest=actor.y,largestVerticalDelta=0;
  for(let i=0;i<count;i++){
    const previous=actor;
    actor=simulateTerrainActor(world,actor,{
      dt:1/60,moveSpeed:3,moveX:1,traversalProfile
    });
    assert.equal(actor.error,null);
    assert.equal(actorOverlapsTerrain(world,actor),false);
    hops+=Number(actor.autoHopStarted);
    highest=Math.max(highest,actor.y);
    largestVerticalDelta=Math.max(largestVerticalDelta,actor.y-previous.y);
  }
  return {actor,hops,highest,largestVerticalDelta};
}

test('agile Ashling and wolf climb one solid 1m voxel with real ballistic arcs',()=>{
  for(const species of ['ashling','wolf']){
    const r=run(arena(1),species);
    assert.ok(r.hops>0,species+' should start a physical ledge jump');
    assert.ok(r.highest>2.05,species+' should lift feet beyond the top');
    assert.ok(r.actor.x>3,species+' should traverse the one-voxel ledge');
    assert.ok(r.largestVerticalDelta<.2,'the leap cannot be a one-metre teleport');
  }
  assert.equal(classifyTraversalHeight(1,2,AGILE_HOP_PROFILE).passable,true);
});

test('Hollowed and the mage cannot jump one full voxel (Wizard unchanged)',()=>{
  for(const species of ['hollowed','mage']){
    const r=run(arena(1),species,110);
    assert.equal(r.hops,0);
    assert.ok(r.actor.x<2,species+' must route around the 1m obstacle');
    assert.ok(r.highest<1.6);
  }
  assert.equal(locomotionFor('mage'),DEFAULT_TRAVERSAL_PROFILE);
  assert.equal(classifyTraversalHeight(1,2,locomotionFor('hollowed')).passable,false);
});

test('agile profile still cannot jump a 2m wall or through an overhead ceiling',()=>{
  for(const world of [arena(2),arena(1,true)]){
    const result=run(world,'wolf',100);
    assert.equal(result.hops,0,'no jump without authoritative clearance');
    assert.ok(result.actor.x<2,'cannot clip through solid Voxel geometry');
  }
});

test('invalid locomotion profiles fail closed in authoritative Physics',()=>{
  const world=arena();
  const actor=spawnTerrainActor(world,{x:.5,z:.5});
  assert.throws(()=>simulateTerrainActor(world,actor,{
    traversalProfile:{autoStepHeight:.2,autoHopHeight:3,autoHopSpeed:25}
  }),RangeError);
  assert.throws(()=>locomotionFor(''),TypeError);
});
