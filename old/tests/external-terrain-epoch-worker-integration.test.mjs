import test from 'node:test';
import assert from 'node:assert/strict';
import { V2TerrainEpochClock } from '../src/terrain-world-epoch.mjs';
import { V2ExternalTerrainLoader } from '../src/external-terrain-loader.mjs';
import { createExternalSiteFixture } from '../src/diagnostics/external-site-fixture.mjs';
import { createExternalTerrainCheckpoint, V2ExternalTerrainReplaySession } from '../src/external-terrain-checkpoint.mjs';
import { V2ExternalTerrainMeshBridge } from '../src/external-terrain-mesh-bridge.mjs';
import { processTerrainMeshJob } from '../src/terrain-mesh-protocol.mjs';
import { worldDigest } from '../src/replay-checkpoint.mjs';

function fakeWorker() {
  const listeners=new Map();
  return {
    sent:[],terminated:false,
    addEventListener(type,listener) { listeners.set(type,listener); },
    postMessage(payload) { this.sent.push(payload); },
    terminate() { this.terminated=true; },
    message(payload) { listeners.get('message')?.({data:payload}); }
  };
}

function warm(worker) {
  const handshake=worker.sent[0];
  assert.equal(handshake.type,'warmup');
  worker.message({schema:'voxel-v2.terrain-mesh-job.v1',type:'warm',id:handshake.id});
}

function finish(worker) {
  for(let index=0;index<64;index++) {
    const job=worker.sent.find(payload=>payload.type==='build' && !payload.completed);
    if(!job) return;
    job.completed=true;
    worker.message(processTerrainMeshJob(job));
  }
  throw new Error('External worker failed to drain bounded batches');
}

test('host epoch and asynchronous mesh generation jointly isolate a restored world',()=>{
  for(const chunkEdge of [16,32]) {
    const clock=new V2TerrainEpochClock();
    const source=new V2ExternalTerrainLoader(createExternalSiteFixture({chunkEdge}),
      {epoch:clock.next()});
    while(!source.progress.done) source.loadStep(192);
    const {world:oldWorld,port:oldPort}=source.terrain;
    const checkpoint=JSON.parse(JSON.stringify(createExternalTerrainCheckpoint(source)));
    const workers=[],ready=[],failures=[];
    const bridge=new V2ExternalTerrainMeshBridge({
      createWorker:()=>{
        const worker=fakeWorker();
        workers.push(worker);
        return worker;
      },
      now:()=>0,
      onReady:(world,meshes,epoch)=>ready.push({world,meshes,epoch}),
      onFailure:reason=>failures.push(reason)
    });
    const oldMeshEpoch=bridge.begin(oldWorld);
    warm(workers[0]);
    const oldJob=workers[0].sent.find(payload=>payload.type==='build');
    assert.ok(oldJob);

    const restored=new V2ExternalTerrainReplaySession(checkpoint,
      {epoch:clock.next()});
    while(!restored.progress.done) restored.step({maxCells:192,maxEdits:1});
    const {world:newWorld,port:newPort}=restored.terrain;
    assert.notEqual(oldWorld,newWorld);
    assert.equal(oldWorld.revision,newWorld.revision);
    assert.equal(worldDigest(oldWorld),worldDigest(newWorld));
    assert.notEqual(oldPort.epoch,newPort.epoch);

    const newMeshEpoch=bridge.begin(newWorld);
    assert.ok(newMeshEpoch>oldMeshEpoch);
    assert.equal(workers[0].terminated,true);
    workers[0].message(processTerrainMeshJob(oldJob));
    assert.equal(ready.length,0,'old world must not publish stale worker geometry');
    warm(workers[1]);
    finish(workers[1]);
    assert.equal(ready.length,1);
    assert.equal(ready[0].world,newWorld);
    assert.equal(ready[0].epoch,newMeshEpoch);

    const events=[];
    newPort.subscribe('lighting',event=>events.push(event));
    const edit=newPort.apply({
      id:'after-restored-worker-'+chunkEdge,type:'carve-sphere',
      x:0,y:6,z:0,radius:2.3,expectedRevision:newWorld.revision
    });
    assert.equal(edit.status,'accepted');
    assert.equal(events.length,1);
    assert.equal(events[0].epoch,newPort.epoch);
    assert.notEqual(events[0].epoch,oldPort.epoch);
    assert.deepEqual(failures,[]);
    bridge.close();
    restored.unload();
    source.unload();
  }
});
