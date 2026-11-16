import test from 'node:test';
import assert from 'node:assert/strict';
import {VoxelWorld} from '../src/voxel-world.mjs';
import {scanTerrainSupport} from '../src/terrain-support-scan.mjs';
import {TerrainClusterHandoff} from '../src/terrain-cluster-handoff.mjs';
import {TerrainClusterPhysics} from '../src/terrain-cluster-physics.mjs';

const known=()=>true;
function detach(world,handoff,x,y){
  world.set(x,y,0,3);
  const {candidates}=scanTerrainSupport(world,[{x,y:y-1,z:0}],{
    cohesive:new Set([3]),anchors:new Set([4]),isKnown:known
  });
  assert.equal(handoff.detach(candidates[0]).status,'detached');
}
function tick(physics,ticks){
  for(let i=0;i<ticks;i++)physics.step();
  return physics.bodies;
}

test('long sweep lands on a one-voxel floor with deterministic tick batching',()=>{
  const run=batch=>{
    const world=new VoxelWorld({chunkEdge:16});
    const handoff=new TerrainClusterHandoff(world);
    world.set(-1,0,0,4);
    detach(world,handoff,-1,24);
    const physics=new TerrainClusterPhysics(world,handoff,{isKnown:known});
    for(let i=0;i<180;i+=batch)physics.step(batch);
    const [body]=physics.bodies;
    assert.equal(body.offsetY,-23);
    assert.equal(body.phase,'resting');
    assert.equal(body.contact,'terrain');
    assert.equal(world.get(-1,1,0),0,'the resting body remains dynamic until settlement');
    return body;
  };
  assert.deepEqual(run(1),run(4));
});

test('stacked clusters stop against each other and fall again after support removal',()=>{
  const world=new VoxelWorld({chunkEdge:32});
  const handoff=new TerrainClusterHandoff(world);
  world.set(0,0,0,3);
  world.set(0,-2,0,4);
  detach(world,handoff,0,4);
  detach(world,handoff,0,8);
  const physics=new TerrainClusterPhysics(world,handoff,{isKnown:known});
  const [lower,upper]=tick(physics,100);
  assert.equal(lower.offsetY,-3);
  assert.equal(upper.offsetY,-6);
  assert.equal(upper.contact,'cluster');
  world.set(0,0,0,0);
  const [movedLower,movedUpper]=tick(physics,100);
  assert.equal(movedLower.offsetY,-5);
  assert.equal(movedUpper.offsetY,-8);
});

test('unknown terrain pauses a body and resumes when coverage becomes known',()=>{
  const world=new VoxelWorld({chunkEdge:16});
  const handoff=new TerrainClusterHandoff(world);
  world.set(0,0,0,4);
  detach(world,handoff,0,5);
  let loaded=false;
  const physics=new TerrainClusterPhysics(world,handoff,{isKnown:(x,y)=>loaded||y>=5});
  const [paused]=tick(physics,20);
  assert.equal(paused.phase,'waiting-coverage');
  assert.equal(paused.offsetY,0);
  loaded=true;
  const [resting]=tick(physics,100);
  assert.equal(resting.offsetY,-4);
  assert.equal(resting.phase,'resting');
  assert.throws(()=>physics.step(5),RangeError);
});

test('an intersecting terrain edit freezes the body and a void fall stops at the travel cap',()=>{
  const world=new VoxelWorld({chunkEdge:16});
  const handoff=new TerrainClusterHandoff(world);
  detach(world,handoff,0,5);
  const physics=new TerrainClusterPhysics(world,handoff,{isKnown:known});
  world.set(0,5,0,3);
  const [overlapping]=physics.step();
  assert.equal(overlapping.phase,'occupied');
  assert.equal(overlapping.offsetY,0);
  world.set(0,5,0,0);
  const [bounded]=tick(physics,300);
  assert.equal(bounded.phase,'drop-limit');
  assert.equal(bounded.offsetY,-64);
});
