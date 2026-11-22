import test from 'node:test';
import assert from 'node:assert/strict';
import { V2ExternalTerrainLoader } from '../src/external-terrain-loader.mjs';
import { createExternalSiteFixture } from '../src/diagnostics/external-site-fixture.mjs';
import {
  createExternalTerrainCheckpoint, V2ExternalTerrainReplaySession
} from '../src/external-terrain-checkpoint.mjs';
import {
  createTerrainMeshJob, processTerrainMeshJob, isCurrentTerrainMeshReply
} from '../src/terrain-mesh-protocol.mjs';
import { TerrainWorkerSession } from '../src/terrain-worker-session.mjs';
import { buildExposedFaceMeshes } from '../src/exposed-face-mesher.mjs';
import { worldDigest } from '../src/replay-checkpoint.mjs';

function fakeWorker() {
  const listeners=new Map();
  return {
    terminated:false,
    sent:[],
    addEventListener(type,callback) { listeners.set(type,callback); },
    postMessage(message,transfer=[]) { this.sent.push({message,transfer}); },
    terminate() { this.terminated=true; },
    message(data) { listeners.get('message')?.({data}); }
  };
}

function complete(loader) {
  while(!loader.progress.done) loader.loadStep(192);
  return loader;
}

function restore(checkpoint) {
  const session=new V2ExternalTerrainReplaySession(
    JSON.parse(JSON.stringify(checkpoint)));
  while(!session.progress.done) session.step({maxCells:192,maxEdits:1});
  return session;
}

test('late V2 worker geometry cannot replace verified restored external terrain',()=>{
  for(const chunkEdge of [16,32]) {
    const original=complete(new V2ExternalTerrainLoader(
      createExternalSiteFixture({chunkEdge})));
    const baseWorld=original.terrain.world;
    const originalRoof=baseWorld.get(0,6,0);
    assert.equal(originalRoof,3);
    const firstJob=createTerrainMeshJob(baseWorld,new Set(['0,0,0']),1);
    const workers=[],accepted=[],failures=[];
    let liveWorld=baseWorld;
    const workerSession=new TerrainWorkerSession({
      createWorker:()=>{
        const worker=fakeWorker();
        workers.push(worker);
        return worker;
      },
      now:()=>0,
      onResult:(reply,job)=>{
        if(isCurrentTerrainMeshReply(reply,job,liveWorld.revision)) {
          accepted.push({reply,job});
        }
      },
      onFailure:reason=>failures.push(reason)
    });
    workerSession.submit(firstJob);
    workers[0].message({
      schema:'voxel-v2.terrain-mesh-job.v1',type:'warm',id:1
    });
    assert.equal(workers[0].sent.at(-1).message.id,firstJob.id);

    // A real committed terrain edit is saved and restored while the old
    // worker is still computing geometry for the pre-edit scene.
    const edit=original.terrain.port.apply({
      id:'breach-before-reload',type:'carve-sphere',
      x:0,y:6,z:0,radius:2.3,
      expectedRevision:baseWorld.revision
    });
    assert.equal(edit.status,'accepted');
    assert.ok(edit.removedVoxels>0);
    const saved=createExternalTerrainCheckpoint(original);
    const replay=restore(saved);
    liveWorld=replay.terrain.world;
    assert.equal(liveWorld.get(0,6,0),0);
    assert.equal(worldDigest(liveWorld),worldDigest(baseWorld));

    assert.equal(workerSession.cancel(),true);
    assert.equal(workers[0].terminated,true);
    const staleReply=processTerrainMeshJob(firstJob);
    workers[0].message(staleReply);
    assert.equal(accepted.length,0,'terminated worker must never publish stale geometry');

    const dirty=new Set(edit.dirtyChunks);
    const restoredJob=createTerrainMeshJob(liveWorld,dirty,2);
    workerSession.submit(restoredJob);
    assert.equal(workers.length,2);
    workers[1].message({
      schema:'voxel-v2.terrain-mesh-job.v1',type:'warm',id:2
    });
    // An out-of-order response from the first worker remains inert.
    workers[0].message(staleReply);
    assert.equal(accepted.length,0);
    workers[1].message(processTerrainMeshJob(restoredJob));
    assert.equal(accepted.length,1);
    assert.equal(accepted[0].job.id,2);
    assert.deepEqual(accepted[0].reply.meshes,
      buildExposedFaceMeshes(liveWorld,{chunkIds:dirty}));
    assert.deepEqual(failures,[]);
    assert.equal(liveWorld.get(0,6,0),0);
    assert.equal(worldDigest(liveWorld),saved.checksums.world);

    workerSession.close();
    replay.unload();
    original.unload();
  }
});

test('any newer edit invalidates a pending mesh response after external replay',()=>{
  for(const chunkEdge of [16,32]) {
    const original=complete(new V2ExternalTerrainLoader(
      createExternalSiteFixture({chunkEdge})));
    const checkpoint=createExternalTerrainCheckpoint(original);
    const replay=restore(checkpoint);
    const world=replay.terrain.world;
    const dirty=new Set(['0,0,0']);
    const workerJob=createTerrainMeshJob(world,dirty,9);
    const pending=processTerrainMeshJob(workerJob);
    assert.equal(isCurrentTerrainMeshReply(pending,workerJob,world.revision),true);

    const before=worldDigest(world);
    const result=replay.terrain.port.apply({
      id:'new-edit-invalidates-old-mesh',type:'carve-sphere',
      x:7,y:0,z:7,radius:.7,expectedRevision:world.revision
    });
    assert.equal(result.status,'accepted');
    assert.equal(result.removedVoxels,1);
    assert.equal(replay.terrain.port.materialAt(7,0,7),0);
    assert.notEqual(worldDigest(world),before);
    assert.equal(isCurrentTerrainMeshReply(pending,workerJob,world.revision),false,
      'newly committed terrain cannot be represented by an older mesh response');
    replay.unload();
    original.unload();
  }
});
