import test from 'node:test';
import assert from 'node:assert/strict';
import { VoxelWorld, createScene } from '../src/voxel-world.mjs';
import {
  TerrainEditLedger, MAX_AREA_HALF_EXTENT, MAX_CRATER_DEPTH,
  V2_BEDROCK_MATERIAL
} from '../src/terrain-edit-ledger.mjs';
import { V2TerrainPort } from '../src/terrain-integration-port.mjs';
import {
  createReplayCheckpoint, restoreReplayCheckpoint, worldDigest, damageDigest
} from '../src/replay-checkpoint.mjs';
import { buildExposedFaceMeshes } from '../src/exposed-face-mesher.mjs';
import { createTerrainMeshJob, processTerrainMeshJob } from '../src/terrain-mesh-protocol.mjs';

const crater=(id,overrides={})=>({
  id,type:'carve-crater',x:0,y:2,z:0,radius:4,depth:3,...overrides
});
const area=(id,overrides={})=>({
  id,type:'damage-area',x:0,y:1,z:0,halfX:2,halfY:1,halfZ:2,power:1,...overrides
});

function layeredField(chunkEdge) {
  const world=new VoxelWorld({chunkEdge});
  for(let z=-7;z<=7;z++)for(let x=-7;x<=7;x++) {
    for(let y=-3;y<=2;y++) {
      world.set(x,y,z,y===2 ? 1 : y>=0 ? 2 : 3);
    }
  }
  world.set(-2,-1,0,V2_BEDROCK_MATERIAL);
  return world;
}

test('crater is a downward bowl exposing actual layered soil while retaining protected bedrock',()=>{
  assert.equal(MAX_CRATER_DEPTH,6);
  for(const chunkEdge of [16,32]) {
    const world=layeredField(chunkEdge);
    const ledger=new TerrainEditLedger(world);
    const before=world.revision;
    const result=ledger.apply(crater('crater-a'));
    assert.equal(result.status,'accepted');
    assert.ok(result.removedVoxels>20);
    assert.equal(world.revision-before,result.removedVoxels);
    assert.equal(world.get(0,2,0),0);
    assert.equal(world.get(0,1,0),0);
    assert.equal(world.get(0,0,0),0,'center is the deepest');
    assert.equal(world.get(0,-1,0),3,'crater does not excavate below its depth');
    assert.equal(world.get(3,2,2),0,'rim removes only shallow grass');
    assert.equal(world.get(3,1,2),2,'outside the bowl depth remains solid');
    assert.equal(world.get(4,2,0),1,'outside radius is untouched');
    assert.equal(world.get(-2,-1,0),V2_BEDROCK_MATERIAL);
    assert.deepEqual(result.changedBounds.min.y,0);
    assert.deepEqual(result.changedBounds.max.y,2);
    assert.ok(result.dirtyChunks.some(id=>id.startsWith('-1,')));
    assert.ok(result.dirtyChunks.some(id=>id.startsWith('0,')));
    assert.deepEqual(ledger.exportJournal().commands,[crater('crater-a')]);
  }
});

test('crater is idempotent, detects conflicting identifiers and does not duplicate geometry',()=>{
  const world=layeredField(16);
  const ledger=new TerrainEditLedger(world);
  const command=crater('once');
  const first=ledger.apply(command);
  const digest=worldDigest(world);
  const again=ledger.apply({...command});
  assert.equal(again.status,'duplicate');
  assert.deepEqual(again.dirtyChunks,[]);
  assert.equal(again.originalWorldRevision,first.worldRevision);
  assert.equal(worldDigest(world),digest);
  assert.throws(()=>ledger.apply({...command,depth:2}),/Edit ID conflict/);
  assert.throws(()=>ledger.apply({...command,radius:3}),/Edit ID conflict/);
  assert.equal(ledger.recordedEdits,1);
});

test('axis-aligned damage area weakens material atomically, then destroys it',()=>{
  assert.equal(MAX_AREA_HALF_EXTENT,4);
  for(const chunkEdge of [16,32]) {
    const world=new VoxelWorld({chunkEdge});
    world.set(-1,0,0,3);
    world.set(0,0,0,3);
    world.set(1,0,0,3);
    world.set(2,0,0,V2_BEDROCK_MATERIAL);
    const ledger=new TerrainEditLedger(world);
    const command=area('wave-1',{x:0,y:0,z:0,halfX:2,halfY:0,halfZ:0});
    const first=ledger.apply(command);
    assert.equal(first.removedVoxels,0);
    assert.equal(first.damagedVoxels,3);
    assert.deepEqual(first.dirtyChunks,[]);
    assert.equal(first.changedBounds,null);
    assert.equal(world.revision,4);
    assert.equal(ledger.damageAt(0,0,0),1);
    assert.equal(ledger.exportDamage().length,3);
    const second=ledger.apply({...command,id:'wave-2'});
    assert.equal(second.removedVoxels,0);
    assert.equal(second.damagedVoxels,3);
    const third=ledger.apply({...command,id:'wave-3'});
    assert.equal(third.removedVoxels,3);
    assert.equal(third.damagedVoxels,0);
    assert.equal(ledger.pendingDamageCells,0);
    assert.equal(world.get(-1,0,0),0);
    assert.equal(world.get(0,0,0),0);
    assert.equal(world.get(1,0,0),0);
    assert.equal(world.get(2,0,0),V2_BEDROCK_MATERIAL);
    assert.deepEqual(third.changedBounds,{
      min:{x:-1,y:0,z:0},max:{x:1,y:0,z:0}
    });
    assert.ok(third.dirtyChunks.some(id=>id.startsWith('-1,')));
  }
});

test('both spatial shapes reject invalid and oversized requests before mutation',()=>{
  const world=layeredField(16);
  const ledger=new TerrainEditLedger(world);
  const digest=worldDigest(world);
  const invalid=[
    crater('depth-zero',{depth:0}),
    crater('depth-large',{depth:MAX_CRATER_DEPTH+1}),
    crater('fraction-depth',{depth:2.5}),
    crater('power-not-crater',{power:1}),
    crater('half-not-crater',{halfX:1}),
    crater('edge-overflow',{x:Number.MAX_SAFE_INTEGER}),
    area('missing-power',{power:undefined}),
    area('negative-half',{halfZ:-1}),
    area('half-large',{halfX:MAX_AREA_HALF_EXTENT+1}),
    area('fraction-half',{halfY:0.5}),
    area('radius-not-area',{radius:3}),
    area('depth-not-area',{depth:3}),
    area('unsafe-coordinate',{z:Number.MAX_SAFE_INTEGER}),
    area('endpoint-not-area',{toX:1})
  ];
  for(const command of invalid) assert.throws(()=>ledger.apply(command),command.id);
  assert.equal(worldDigest(world),digest);
  assert.equal(ledger.recordedEdits,0);
});

test('crater and area damage round-trip through versioned JSON replay on every scene and chunk size',()=>{
  for(const chunkEdge of [16,32]) for(const scene of ['flat','hill','cliff','arch']) {
    const world=createScene(scene,7,{chunkEdge});
    const ledger=new TerrainEditLedger(world);
    const c=ledger.apply(crater('bowl',{x:0,y:2,z:0,radius:3.5,depth:3,
      expectedRevision:world.revision,expectedEditRevision:ledger.editRevision}));
    assert.equal(c.status,'accepted');
    const d=ledger.apply(area('pulse',{x:0,y:1,z:0,halfX:2,halfY:1,halfZ:2,power:1,
      expectedRevision:world.revision,expectedEditRevision:ledger.editRevision}));
    assert.equal(d.status,'accepted');
    const checkpoint=createReplayCheckpoint({scene,seed:7,world,ledger});
    const restored=restoreReplayCheckpoint(JSON.parse(JSON.stringify(checkpoint)));
    assert.equal(worldDigest(restored.world),worldDigest(world),scene+' '+chunkEdge);
    assert.equal(damageDigest(restored.ledger),damageDigest(ledger));
    assert.deepEqual(restored.ledger.exportJournal(),ledger.exportJournal());
    assert.equal(restored.ledger.recordedEdits,2);
  }
});

test('spatial edits emit one V2 notification per accepted command, with exact dirty geometry',()=>{
  for(const chunkEdge of [16,32]) {
    const world=layeredField(chunkEdge);
    const ledger=new TerrainEditLedger(world);
    const port=new V2TerrainPort(world,ledger,{epoch:7});
    const seen=[];
    port.subscribe('physics',event=>seen.push(event));
    port.subscribe('lighting',event=>seen.push(event));
    const first=port.apply(crater('event-bowl'));
    assert.ok(first.removedVoxels>0);
    assert.equal(seen.length,2);
    assert.equal(seen[0],seen[1]);
    assert.equal(seen[0].editType,'carve-crater');
    assert.equal(seen[0].epoch,7);
    assert.deepEqual(seen[0].dirtyChunks,first.dirtyChunks);
    const pulse=port.apply(area('event-area',{halfY:0,power:1}));
    assert.equal(pulse.status,'accepted');
    assert.equal(seen.length,4);
    assert.equal(seen[2].editType,'damage-area');
    assert.equal(seen[2].sequence,2);
    assert.equal(port.metrics().published,2);
    assert.equal(port.metrics().delivered,4);
  }
});

test('localized worker geometry matches canonical exposed faces after a crater',()=>{
  for(const chunkEdge of [16,32]) {
    const world=layeredField(chunkEdge);
    const ledger=new TerrainEditLedger(world);
    const result=ledger.apply(crater('worker-bowl'));
    const dirty=new Set(result.dirtyChunks);
    assert.ok(dirty.size>0);
    const reference=buildExposedFaceMeshes(world,{chunkIds:dirty});
    // Use production-sized four-chunk worker batches with exact dirty IDs.
    const ids=[...dirty].sort();
    const workerMeshes=[];
    for(let i=0;i<ids.length;i+=4) {
      const job=createTerrainMeshJob(world,new Set(ids.slice(i,i+4)),3+i);
      const response=processTerrainMeshJob(job);
      assert.equal(response.revision,world.revision);
      workerMeshes.push(...response.meshes);
    }
    assert.deepEqual(new Map(workerMeshes.map(mesh=>[mesh.id,mesh])),
      new Map(reference.map(mesh=>[mesh.id,mesh])));
  }
});
