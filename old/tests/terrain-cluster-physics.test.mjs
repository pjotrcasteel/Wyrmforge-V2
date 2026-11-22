import test from 'node:test';
import assert from 'node:assert/strict';
import {sweepActorAxis,simulateTerrainActor,actorOverlapsTerrain,ACTOR_HEIGHT} from '../src/terrain-actor.mjs';
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

test('the regular actor solver sweeps fractional cluster walls, ceilings and floors',()=>{
  const world=new VoxelWorld({chunkEdge:16});
  const handoff=new TerrainClusterHandoff(world);
  detach(world,handoff,0,8);
  const physics=new TerrainClusterPhysics(world,handoff,{isKnown:known});
  const [state]=tick(physics,12);
  const bottom=8+state.offsetY,top=bottom+1;
  assert.notEqual(bottom,Math.round(bottom));
  const side=sweepActorAxis(world,{x:-2,y:bottom-.4,z:.5},'x',4,physics);
  assert.ok(side.collided&&side.position<0);
  const ceiling=sweepActorAxis(world,{x:.5,y:bottom-3,z:.5},'y',4,physics);
  assert.ok(ceiling.collided&&Math.abs(ceiling.position+ACTOR_HEIGHT-bottom)<.001);
  const landing=sweepActorAxis(world,{x:.5,y:top+3,z:.5},'y',-4,physics);
  assert.ok(landing.collided&&Math.abs(landing.position-top)<.001);
  const actor=simulateTerrainActor(world,{x:.5,y:landing.position,z:.5,vy:0},{dynamicCollision:physics});
  assert.equal(actor.grounded,true);
  assert.equal(actorOverlapsTerrain(world,actor,physics),false);
});

test('a falling cluster pauses at actor contact and resumes when the actor leaves',()=>{
  const world=new VoxelWorld({chunkEdge:32});
  const handoff=new TerrainClusterHandoff(world);
  world.set(0,0,0,4);
  detach(world,handoff,0,8);
  const physics=new TerrainClusterPhysics(world,handoff,{isKnown:known});
  const actor={x:.5,y:1,z:.5};
  for(let i=0;i<90;i++)physics.step(1,{actors:[actor]});
  const [onActor]=physics.bodies;
  assert.equal(onActor.contact,'actor');
  assert.ok(Math.abs(8+onActor.offsetY-actor.y-ACTOR_HEIGHT)<.001);
  assert.equal(actorOverlapsTerrain(world,actor,physics),false);
  const [onTerrain]=tick(physics,120);
  assert.equal(onTerrain.contact,'terrain');
  assert.equal(onTerrain.offsetY,-7);
});

test('a resting cluster settles once, retains collision and releases its body slot',()=>{
  const world=new VoxelWorld({chunkEdge:16});
  const handoff=new TerrainClusterHandoff(world);
  world.set(-1,0,0,4);
  detach(world,handoff,-1,6);
  const physics=new TerrainClusterPhysics(world,handoff,{isKnown:known});
  const [resting]=tick(physics,100);
  const actor={x:-.5,y:3,z:.5};
  const before=sweepActorAxis(world,actor,'y',-2,physics);
  const result=physics.settle(resting.body.id);
  assert.equal(result.status,'settled');
  assert.deepEqual(result.cells,[{x:-1,y:1,z:0,material:3}]);
  assert.ok(result.dirtyChunks.includes('0,0,0'));
  assert.equal(world.get(-1,1,0),3);
  assert.deepEqual(handoff.bodies,[]);
  assert.deepEqual(physics.bodies,[]);
  assert.deepEqual(sweepActorAxis(world,actor,'y',-2,physics),before);
  assert.equal(physics.settle(resting.body.id).status,'not-resting-on-terrain');
  detach(world,handoff,2,6);
  assert.ok(handoff.bodies[0].id>resting.body.id);
});

test('stale support, actors and unknown coverage block settlement without changing ownership',()=>{
  const world=new VoxelWorld({chunkEdge:16});
  const handoff=new TerrainClusterHandoff(world);
  world.set(0,0,0,3);
  detach(world,handoff,0,6);
  let knownFloor=true;
  const physics=new TerrainClusterPhysics(world,handoff,{isKnown:(x,y)=>knownFloor||y>0});
  const [resting]=tick(physics,100);
  const id=resting.body.id;
  const revision=world.revision;
  assert.equal(physics.settle(id,{actors:[{x:.5,y:1,z:.5}]}).status,'blocked-settlement');
  knownFloor=false;
  assert.equal(physics.settle(id).status,'blocked-settlement');
  assert.equal(world.revision,revision);
  knownFloor=true;
  world.set(0,0,0,0);
  assert.equal(physics.settle(id).status,'blocked-settlement');
  assert.equal(world.get(0,1,0),0);
  assert.equal(handoff.bodies[0].id,id);
});

test('airborne microvoxels expose exact low and high surfaces to actor sweeps',()=>{
  const world=new VoxelWorld({chunkEdge:16});
  const handoff=new TerrainClusterHandoff(world,{preserveMicroSurfaces:true});
  const levels=Array.from({length:100},(_,index)=>index%10<5?3:8);
  world.set(0,5,0,3);
  world.setMicroSurfaceTile(0,5,0,levels);
  const {candidates}=scanTerrainSupport(world,[{x:0,y:4,z:0}],{
    cohesive:new Set([3]),anchors:new Set([4]),isKnown:known
  });
  assert.equal(handoff.detach(candidates[0]).status,'detached');
  const physics=new TerrainClusterPhysics(world,handoff,{isKnown:known});
  const low={x:[.1,.4],y:[5.4,5.6],z:[.2,.8]};
  const high={...low,x:[.6,.9]};
  assert.equal(physics.intersects(low),false);
  assert.equal(physics.intersects(high),true);

  const drop=bounds=>physics.sweep({...bounds,y:[6,7]},'y',-2);
  assert.ok(Math.abs(drop(low)+.7)<1e-7);
  assert.ok(Math.abs(drop(high)+.2)<1e-7);
});

test('one falling body can rest on the fractional top of another body',()=>{
  const world=new VoxelWorld({chunkEdge:16});
  const handoff=new TerrainClusterHandoff(world,{preserveMicroSurfaces:true});
  world.set(0,0,0,4);
  world.set(0,4,0,3);
  world.setMicroSurfaceTile(0,4,0,Array(100).fill(5));
  const {candidates}=scanTerrainSupport(world,[{x:0,y:3,z:0}],{
    cohesive:new Set([3]),anchors:new Set([4]),isKnown:known
  });
  assert.equal(handoff.detach(candidates[0]).status,'detached');
  detach(world,handoff,0,8);
  const physics=new TerrainClusterPhysics(world,handoff,{isKnown:known});
  const [lower,upper]=tick(physics,120);
  assert.equal(lower.offsetY,-3);
  assert.equal(upper.offsetY,-6.5);
  assert.equal(upper.contact,'cluster');
});
