import test from 'node:test';
import assert from 'node:assert/strict';
import {HuntPursuitSteering,PURSUIT_STEERING_MAX_AGENTS}
  from '../src/ai/pursuit-steering.mjs';
import {VoxelWorld} from '../src/voxel-world.mjs';
import {spawnTerrainActor,simulateTerrainActor,actorOverlapsTerrain}
  from '../src/terrain-actor.mjs';
const DT=1/60;

test('AI pursuit is a pure bounded intention, not another collision or teleport engine',()=>{
  const steer=new HuntPursuitSteering();
  const a={x:0,y:1,z:0},b={x:3,y:1,z:0};
  const direct=steer.direction(0,a,b,0,DT);
  assert.deepEqual(direct,{moveX:1,moveZ:0,detouring:false});
  for(let frame=0;frame<8;frame++){
    steer.observe(0,a,{...a,wallContact:true},0,DT,2);
  }
  const detour=steer.direction(0,a,b,0,DT);
  assert.equal(detour.detouring,true);
  assert.ok(detour.moveZ>.8&&detour.moveX<.4);
  assert.ok(Math.hypot(detour.moveX,detour.moveZ)<=1.000001);
  assert.equal(steer.statistics.detours,1);
  assert.equal(steer.direction(0,a,b,1,DT).detouring,false,
    'committed terrain edits must immediately invalidate obsolete steering');
  steer.clear();
  assert.equal(steer.statistics.tracked,0);
  assert.throws(()=>steer.direction(16,a,b,1,DT),RangeError);
  assert.throws(()=>steer.direction(0,a,b,1,.2),RangeError);
  assert.throws(()=>steer.observe(0,a,b,1,DT,7),RangeError);
});

test('AI repeatedly attempts a new side when a physical route remains obstructed',()=>{
  const steer=new HuntPursuitSteering();
  const start={x:0,y:1,z:0};
  const sides=[];
  for(let cycle=0;cycle<2;cycle++){
    for(let i=0;i<9;i++)steer.observe(1,start,{...start,wallContact:true},2,DT,2);
    const dir=steer.direction(1,start,{x:4,y:1,z:0},2,DT);
    assert.equal(dir.detouring,true);
    sides.push(Math.sign(dir.moveZ));
    for(let i=0;i<85;i++)steer.direction(1,start,{x:4,y:1,z:0},2,DT);
  }
  assert.deepEqual(sides,[-1,1],'different physical detour must be attempted on repeat');
});

test('AI uses actual 3D Voxel support and wall contacts to clear a blocked chase',()=>{
  const world=new VoxelWorld({chunkEdge:16});
  for(let x=-8;x<=8;x++)for(let z=-8;z<=8;z++)world.set(x,0,z,3);
  // A real 3m high rock obstacle spans the direct line x=-2 -> x=4.
  for(let z=-1;z<=1;z++)for(let y=1;y<=3;y++)world.set(0,y,z,3);
  let actor=spawnTerrainActor(world,{x:-2.5,z:.5});
  assert.ok(actor?.grounded);
  const target={x:4.5,y:actor.y,z:.5};
  const steering=new HuntPursuitSteering();
  let movedSide=false,detoured=false;
  for(let step=0;step<480;step++){
    const intent=steering.direction(0,actor,target,world.revision,DT);
    const next=simulateTerrainActor(world,actor,{
      moveX:intent.moveX,moveZ:intent.moveZ,dt:DT,moveSpeed:2
    });
    assert.equal(next.error,null);
    assert.equal(actorOverlapsTerrain(world,next),false);
    if(intent.detouring)detoured=true;
    if(Math.abs(next.z-.5)>1.6)movedSide=true;
    steering.observe(0,actor,next,world.revision,DT,2);
    actor=next;
  }
  assert.ok(detoured,'the enemy must notice the physically blocked direct approach');
  assert.ok(movedSide,'the enemy must go sideways around the actual rock');
  assert.ok(actor.x>1.1,'the enemy must reach the far side without going through the rock');
  assert.ok(steering.statistics.tracked<=PURSUIT_STEERING_MAX_AGENTS);
});
