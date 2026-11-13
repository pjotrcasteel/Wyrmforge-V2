import test from 'node:test';
import assert from 'node:assert/strict';
import { VoxelWorld,createScene } from '../src/voxel-world.mjs';
import { TerrainEditLedger } from '../src/terrain-edit-ledger.mjs';
import {
  ACTOR_PHYSICS_SCHEMA, ACTOR_HALF_WIDTH, ACTOR_HEIGHT,
  actorOverlapsTerrain, sweepActorAxis, spawnTerrainActor,
  simulateTerrainActor
} from '../src/terrain-actor.mjs';

const s = 1e-5;
const actor = (x=.5,y=1+s,z=.5) => ({
  schema:ACTOR_PHYSICS_SCHEMA,x,y,z,vy:0,grounded:true,worldRevision:0
});
function run(world,state,count,options) {
  let current=state;
  for(let i=0;i<count;i++)current=simulateTerrainActor(world,current,options);
  return current;
}
function flat(size=12) {
  const world=new VoxelWorld();
  for(let x=-size;x<=size;x++)for(let z=-size;z<=size;z++)world.set(x,0,z,3);
  return world;
}

test('safe spawn stands on true V2 terrain across scenes and chunk sizes', () => {
  for(const chunkEdge of [16,32]) {
    for(const scene of ['flat','hill','cliff','arch']) {
      const world=createScene(scene,7,{chunkEdge});
      const state=spawnTerrainActor(world,{x:-7.5,z:-5.5});
      assert.ok(state,`expected safe actor spawn in ${scene}`);
      assert.equal(state.schema,ACTOR_PHYSICS_SCHEMA);
      assert.equal(state.worldRevision,world.revision);
      assert.equal(state.grounded,true);
      assert.equal(actorOverlapsTerrain(world,state),false);
      const after=run(world,state,40,{moveX:0,moveZ:0,dt:1/60});
      assert.ok(Math.abs(after.y-state.y)<.01,`standing ${scene} must not sink`);
      assert.equal(after.grounded,true);
      assert.equal(after.error,null);
    }
  }
});

test('digging support under an actor makes it fall, even before a new mesh is uploaded', () => {
  for(const chunkEdge of [16,32]){
    const world=createScene('flat',7,{chunkEdge});
    const start=spawnTerrainActor(world,{x:0.5,z:0.5});
    assert.ok(start?.grounded);
    const edit=new TerrainEditLedger(world).apply({
      id:'underfoot',type:'carve-sphere',x:0,y:0,z:0,radius:2.5,
      expectedRevision:world.revision
    });
    assert.ok(edit.removedVoxels>0);
    assert.equal(actorOverlapsTerrain(world,start),false);
    const moved=run(world,start,32,{moveX:0,moveZ:0,dt:1/60});
    assert.ok(moved.y<start.y-.25,'actor must fall into freshly committed hole');
    assert.equal(moved.grounded,false);
    assert.equal(moved.worldRevision,world.revision);
  }
});

test('two-voxel wall blocks the player without high-speed tunneling', () => {
  const world=flat();
  for(let y=1;y<=3;y++)world.set(2,y,0,3);
  const start=actor();
  const contact=sweepActorAxis(world,start,'x',20);
  assert.equal(contact.collided,true);
  assert.ok(contact.position<2-ACTOR_HALF_WIDTH);
  let current=start;
  let walls=0;
  for(let i=0;i<80;i++) {
    current=simulateTerrainActor(world,current,{moveX:1,dt:1/60});
    if(current.wallContact)walls++;
    assert.equal(actorOverlapsTerrain(world,current),false);
  }
  assert.ok(walls>0);
  assert.ok(current.x<2-ACTOR_HALF_WIDTH,'must never pass through tall wall');
  assert.equal(current.grounded,true);
});

test('a 50cm physical ledge is climbable; full 1m and taller cliffs are not', () => {
  const world=flat();
  for(let x=2;x<=4;x++) {
    world.set(x,1,0,3);
    world.setMicroSurfaceTile(x,1,0,Array(100).fill(5));
  }
  let current=actor(),stepped=false;
  for(let i=0;i<48;i++) {
    current=simulateTerrainActor(world,current,{moveX:1,dt:1/60});
    stepped ||= current.stepUp || current.autoHopStarted;
  }
  assert.equal(stepped,true);
  assert.ok(current.x>2.3,'actor must climb the one-voxel edge');
  assert.ok(current.y>1.48,'feet must rest on the microvoxel landing');
  assert.equal(current.grounded,true);

  const fullMetre=flat();
  for(let x=2;x<=4;x++)fullMetre.set(x,1,0,3);
  current=run(fullMetre,actor(),65,{moveX:1,dt:1/60});
  assert.ok(current.x<2-ACTOR_HALF_WIDTH,
    'a 1m ledge must NOT count as comfortable passive traversal');
  const cliff=flat();
  for(let y=1;y<=8;y++)for(let x=2;x<6;x++)cliff.set(x,y,0,3);
  current=run(cliff,actor(),70,{moveX:1,dt:1/60});
  assert.ok(current.x<2-ACTOR_HALF_WIDTH,'high cliff must remain impassable');
  assert.ok(current.y<1.1,'wall must not magically teleport player upwards');
});

test('axis-separated sweep slides along long wall without crossing it', () => {
  const world=flat();
  for(let z=-4;z<=4;z++)for(let y=1;y<=3;y++)world.set(2,y,z,3);
  let current=actor();
  current=run(world,current,60,{moveX:1,moveZ:1,dt:1/60});
  assert.ok(current.x<2-ACTOR_HALF_WIDTH);
  assert.ok(current.z>.5);
  assert.equal(actorOverlapsTerrain(world,current),false);
});

test('ceiling blocks an upward swept actor volume', () => {
  const world=new VoxelWorld();
  world.set(0,3,0,3);
  const start=actor(.5,1,.5);
  const ceiling=sweepActorAxis(world,start,'y',6);
  assert.equal(ceiling.collided,true);
  assert.ok(ceiling.position<3-ACTOR_HEIGHT);
  assert.equal(actorOverlapsTerrain(world,{...start,y:ceiling.position}),false);
});

test('signed negative chunk seam is collision-solid at both chunk pitches', () => {
  for(const chunkEdge of [16,32]) {
    const world=new VoxelWorld({chunkEdge});
    world.set(-1,1,0,2);
    world.set(0,1,0,2);
    const start=actor(-2.5,1+s,.5);
    const result=sweepActorAxis(world,start,'x',8);
    assert.equal(result.collided,true);
    assert.ok(result.position<-1-ACTOR_HALF_WIDTH);
    assert.equal(actorOverlapsTerrain(world,{...start,x:result.position}),false);
  }
});

test('collider samples actual 3D overhang interior instead of a heightmap', () => {
  const world=new VoxelWorld();
  world.set(0,6,0,3); // floating rock above an empty tunnel
  const low=actor(.5,0,.5);
  const high=actor(.5,5,.5);
  assert.equal(actorOverlapsTerrain(world,low),false);
  assert.equal(actorOverlapsTerrain(world,high),true);
  const fromBelow=sweepActorAxis(world,low,'y',7);
  assert.equal(fromBelow.collided,true);
  assert.ok(fromBelow.position<6-ACTOR_HEIGHT);
});

test('invalid spawn has no safe actor and fixed-step input rejects huge deltas', () => {
  const world=new VoxelWorld();
  assert.equal(spawnTerrainActor(world),null);
  world.set(0,0,0,3);
  const start=spawnTerrainActor(world,{x:.5,z:.5});
  assert.ok(start);
  assert.throws(()=>simulateTerrainActor(world,start,{dt:1}),RangeError);
  assert.throws(()=>simulateTerrainActor(world,start,{moveX:Infinity}),RangeError);
  assert.throws(()=>sweepActorAxis(world,start,'x',100),RangeError);
  assert.throws(()=>sweepActorAxis(world,start,'q',1),RangeError);
  assert.throws(()=>actorOverlapsTerrain(world,{x:Infinity,y:0,z:0}),TypeError);
});

test('world changes are authoritative immediately; actor simulation never writes voxels', () => {
  const world=createScene('hill',7,{chunkEdge:32});
  const start=spawnTerrainActor(world,{x:-7.5,z:-5.5});
  const revision=world.revision;
  const snapshots=world.snapshots();
  const moved=run(world,start,25,{moveX:1,dt:1/60});
  assert.ok(moved.x>start.x);
  assert.equal(world.revision,revision);
  assert.deepEqual(world.snapshots(),snapshots);
});
