import test from 'node:test';
import assert from 'node:assert/strict';
import { createScene, VoxelWorld } from '../src/voxel-world.mjs';
import { TerrainEditLedger, MAX_RECORDED_EDITS } from '../src/terrain-edit-ledger.mjs';
import { demoBurstTargets, applyDemoBurst } from '../src/demo-burst.mjs';
import { carveDemoSphere } from '../src/demo-carve.mjs';
import { buildExposedFaceMeshes } from '../src/exposed-face-mesher.mjs';
import { createTerrainMeshJob, processTerrainMeshJob } from '../src/terrain-mesh-protocol.mjs';

test('all deterministic burst scenes match sequential authoritative changes at both chunk pitches', () => {
  for (const edge of [16,32]) {
    for (const scene of ['flat','hill','cliff','arch']) {
      const world=createScene(scene,7,{chunkEdge:edge});
      const expected=createScene(scene,7,{chunkEdge:edge});
      const ledger=new TerrainEditLedger(world);
      const initialRevision=world.revision;
      const result=applyDemoBurst(world,ledger,{scene,runId:1});
      const dirty=new Set();
      const expectedRemoved=demoBurstTargets(scene).reduce(
        (sum,target)=>sum+carveDemoSphere(expected,target,{dirtyChunks:dirty}),0
      );
      assert.equal(result.schema,'voxel-v2.demo-burst.v1');
      assert.equal(result.impactCount,3);
      assert.equal(result.edits.length,3);
      assert.ok(result.edits.every(e=>e.status==='accepted'));
      assert.ok(result.edits.every(e=>e.removedVoxels>0), `${scene} burst must hit solid cells`);
      assert.equal(result.removedVoxels,expectedRemoved);
      assert.equal(result.worldRevision-initialRevision,expectedRemoved);
      assert.deepEqual(result.dirtyChunks,[...dirty].sort());
      assert.deepEqual(world.snapshots(),expected.snapshots());
      assert.equal(ledger.recordedEdits,3);
      assert.ok(result.changedBounds);
      assert.deepEqual(result.edits.map(e=>e.editId),
        ['lab-burst-1-hit-1','lab-burst-1-hit-2','lab-burst-1-hit-3']);

      const chunkIds=new Set(result.dirtyChunks);
      const job=createTerrainMeshJob(world,chunkIds,1);
      const reply=processTerrainMeshJob(job);
      const expectedMeshes=buildExposedFaceMeshes(world,{chunkIds});
      assert.deepEqual(reply.meshes,expectedMeshes,
        'one combined worker job must equal local meshing after all three edits');
    }
  }
});

test('one combined dirty set never loses overlapping or negative-coordinate chunks', () => {
  const world=createScene('hill',7,{chunkEdge:16});
  const ledger=new TerrainEditLedger(world);
  const result=applyDemoBurst(world,ledger,{scene:'hill',runId:1});
  const combined=new Set(result.edits.flatMap(edit=>edit.dirtyChunks));
  assert.deepEqual(result.dirtyChunks,[...combined].sort());
  assert.ok(result.dirtyChunks.some(id=>id.startsWith('-1,')));
  assert.equal(new Set(result.dirtyChunks).size,result.dirtyChunks.length);
  assert.ok(result.changedBounds.min.x<0 && result.changedBounds.max.x>0);
});

test('repeating the same geometric sequence with new IDs is a harmless zero-change batch', () => {
  const world=createScene('hill',7,{chunkEdge:32});
  const ledger=new TerrainEditLedger(world);
  const first=applyDemoBurst(world,ledger,{scene:'hill',runId:1});
  const before=world.snapshots();
  const revision=world.revision;
  const second=applyDemoBurst(world,ledger,{scene:'hill',runId:2});
  assert.ok(first.removedVoxels>0);
  assert.equal(second.removedVoxels,0);
  assert.deepEqual(second.dirtyChunks,[]);
  assert.equal(second.changedBounds,null);
  assert.equal(world.revision,revision);
  assert.deepEqual(world.snapshots(),before);
  assert.equal(ledger.recordedEdits,6);
});

test('two fresh worlds yield byte-identical three-hit terrain and logs', () => {
  for(const edge of [16,32]) {
    const produce=()=>{
      const world=createScene('arch',7,{chunkEdge:edge});
      const ledger=new TerrainEditLedger(world);
      const result=applyDemoBurst(world,ledger,{scene:'arch',runId:10});
      return {result,snapshots:world.snapshots()};
    };
    assert.deepEqual(produce(),produce());
  }
});

test('burst failure before dispatch rejects invalid scene/run and insufficient journal capacity', () => {
  const world=new VoxelWorld();
  const ledger=new TerrainEditLedger(world);
  const baseline=world.snapshots();
  for(const id of [0,-1,1.5,1000001,NaN]) {
    assert.throws(()=>applyDemoBurst(world,ledger,{scene:'flat',runId:id}),RangeError);
  }
  assert.throws(()=>applyDemoBurst(world,ledger,{scene:'bad',runId:1}),RangeError);
  const nearlyFull={
    recordedEdits:MAX_RECORDED_EDITS-2,
    apply:()=>{ throw new Error('Should fail before applying any edit'); }
  };
  assert.throws(()=>applyDemoBurst(world,nearlyFull,{scene:'flat',runId:1}),
    /Insufficient edit history capacity/);
  assert.deepEqual(world.snapshots(),baseline);
  assert.equal(ledger.recordedEdits,0);
});

test('non-empty burst makes no changes to protected voxel-only worlds', () => {
  const world=new VoxelWorld({chunkEdge:16});
  world.set(-6,1,-4,4);
  world.set(0,1,0,4);
  world.set(6,1,4,4);
  const ledger=new TerrainEditLedger(world);
  const initial=world.snapshots(), revision=world.revision;
  const result=applyDemoBurst(world,ledger,{scene:'flat',runId:1});
  assert.equal(result.removedVoxels,0);
  assert.deepEqual(result.dirtyChunks,[]);
  assert.equal(world.revision,revision);
  assert.deepEqual(world.snapshots(),initial);
});
