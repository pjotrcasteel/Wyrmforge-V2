import test from 'node:test';
import assert from 'node:assert/strict';
import { VoxelWorld, createScene } from '../src/voxel-world.mjs';
import { TerrainEditLedger } from '../src/terrain-edit-ledger.mjs';
import { buildExposedFaceMeshes } from '../src/exposed-face-mesher.mjs';
import { createTerrainMeshJob, processTerrainMeshJob } from '../src/terrain-mesh-protocol.mjs';
import {
  spawnTerrainActor, simulateTerrainActor, actorOverlapsTerrain
} from '../src/terrain-actor.mjs';
import {
  excavateActorSupport, ACTOR_SUPPORT_TEST_RADIUS
} from '../src/actor-support-excavation.mjs';

function raisedPlatform(chunkEdge) {
  const world=new VoxelWorld({chunkEdge});
  for(let x=-6;x<=6;x++) {
    for(let z=-6;z<=6;z++) world.set(x,0,z,3);
  }
  for(let x=-1;x<=1;x++) {
    for(let z=-1;z<=1;z++) world.set(x,4,z,2);
  }
  return world;
}
function stepActor(world,actor,steps=1) {
  let current=actor;
  for(let index=0;index<steps;index++) {
    current=simulateTerrainActor(world,current,{dt:1/60});
    assert.equal(current.error,null,'collision remains valid during excavated fall');
    assert.equal(actorOverlapsTerrain(world,current),false);
  }
  return current;
}

test('excavation removes support and physics falls, then lands on lower voxels', () => {
  for (const chunkEdge of [16,32]) {
    const world=raisedPlatform(chunkEdge);
    const ledger=new TerrainEditLedger(world);
    const actor=spawnTerrainActor(world,{x:0.5,z:0.5,searchTopY:12});
    assert.ok(actor?.grounded);
    assert.ok(Math.abs(actor.y-5)<.01);

    const worldBefore=world.revision;
    const change=excavateActorSupport(world,ledger,actor,'excavate-1');
    assert.equal(change.status,'accepted');
    assert.equal(change.supportBefore,1);
    assert.equal(change.supportAfter,0);
    assert.ok(change.removedVoxels>0);
    assert.ok(change.dirtyChunks.length>0);
    assert.equal(world.revision-worldBefore,change.removedVoxels);
    // Collision reads the newly committed world before the renderer receives
    // updated geometry, so the next fixed step must already be airborne.
    let state=stepActor(world,actor);
    assert.equal(state.grounded,false);
    assert.ok(state.y<actor.y);

    let lowest=state.y;
    for(let i=0;i<150 && !state.grounded;i++) {
      state=stepActor(world,state);
      lowest=Math.min(lowest,state.y);
    }
    assert.equal(state.grounded,true,'actor must reach solid lower ground');
    assert.ok(Math.abs(state.y-1)<.02,'lower ground is at y=1');
    assert.ok(lowest<actor.y-2.5,'actor fell several real voxels');
    assert.equal(state.vy,0);
    assert.equal(ledger.recordedEdits,1);
    assert.equal(ACTOR_SUPPORT_TEST_RADIUS,2.5);
  }
});

test('synchronous and worker meshes reproduce the same committed support excavation', () => {
  for(const chunkEdge of [16,32]) {
    const world=raisedPlatform(chunkEdge);
    const ledger=new TerrainEditLedger(world);
    const actor=spawnTerrainActor(world,{x:0.5,z:0.5,searchTopY:12});
    const change=excavateActorSupport(world,ledger,actor,'excavate-1');
    const dirty=new Set(change.dirtyChunks);
    const expected=buildExposedFaceMeshes(world,{chunkIds:dirty});
    const job=createTerrainMeshJob(world,dirty,1);
    const result=processTerrainMeshJob(job);
    assert.deepEqual(result.meshes,expected);
    assert.equal(result.revision,world.revision);
    assert.ok(change.removedVoxels>0);
  }
});

test('actor on tall V2 cliff loses support and descends without phantom collision', () => {
  for(const chunkEdge of [16,32]) {
    const world=createScene('cliff',7,{chunkEdge});
    const ledger=new TerrainEditLedger(world);
    const actor=spawnTerrainActor(world,{x:7.5,z:1.5});
    assert.ok(actor?.grounded);
    assert.ok(actor.y>4,'spawn starts on tall solid cliff');
    const change=excavateActorSupport(world,ledger,actor,'cliff-footing');
    assert.equal(change.supportAfter,0);
    assert.ok(change.removedVoxels>0);
    let state=stepActor(world,actor);
    assert.equal(state.grounded,false);
    let hasLanded=false;
    for(let i=0;i<100;i++){
      state=stepActor(world,state);
      if(state.grounded){hasLanded=true;break;}
    }
    assert.ok(state.y<actor.y-.2,'player drops into destroyed cliff');
    assert.ok(!hasLanded || state.y<actor.y,'must never land on removed support');
  }
});

test('excavation works across signed voxel/chunk seams', () => {
  for(const chunkEdge of [16,32]) {
    const world=new VoxelWorld({chunkEdge});
    for(let x=-3;x<=3;x++)for(let z=-3;z<=3;z++)world.set(x,0,z,3);
    const ledger=new TerrainEditLedger(world);
    const actor=spawnTerrainActor(world,{x:-0.1,z:-0.1,searchTopY:5});
    assert.ok(actor?.grounded);
    const change=excavateActorSupport(world,ledger,actor,'negative-seam');
    assert.equal(change.supportAfter,0);
    assert.ok(change.dirtyChunks.some(id=>id.startsWith('-1,')));
    assert.ok(change.dirtyChunks.some(id=>id.startsWith('0,')));
    assert.equal(stepActor(world,actor).grounded,false);
  }
});

test('unsupported actor does not create a command or mutate the terrain', () => {
  const world=new VoxelWorld();
  const ledger=new TerrainEditLedger(world);
  const unsupported={x:0.5,y:4.00001,z:0.5,grounded:true};
  const change=excavateActorSupport(world,ledger,unsupported,'no-support');
  assert.equal(change.status,'no-support');
  assert.deepEqual(change.dirtyChunks,[]);
  assert.equal(change.removedVoxels,0);
  assert.equal(ledger.recordedEdits,0);
  assert.equal(world.revision,0);
  assert.throws(()=>excavateActorSupport(world,ledger,
    {...unsupported,grounded:false},'airborne'),/grounded/);
});

test('reapplying a supporting edit ID never silently changes different terrain', () => {
  const world=raisedPlatform(16);
  const ledger=new TerrainEditLedger(world);
  const initialActor=spawnTerrainActor(world,{x:0.5,z:0.5,searchTopY:12});
  const first=excavateActorSupport(world,ledger,initialActor,'actor-dig-1');
  assert.ok(first.removedVoxels>0);
  // New actor footing elsewhere cannot claim the old ID, even though the
  // original excavation may already be stale with respect to world revision.
  const next=spawnTerrainActor(world,{x:-3.5,z:0.5,searchTopY:12});
  assert.ok(next?.grounded);
  assert.throws(()=>excavateActorSupport(world,ledger,next,'actor-dig-1'),
    /Edit ID conflict/);
});
