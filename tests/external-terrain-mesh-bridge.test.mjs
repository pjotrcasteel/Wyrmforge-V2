import test from 'node:test';
import assert from 'node:assert/strict';
import { V2ExternalTerrainLoader } from '../src/external-terrain-loader.mjs';
import { createExternalSiteFixture } from '../src/diagnostics/external-site-fixture.mjs';
import { buildExposedFaceMeshes } from '../src/exposed-face-mesher.mjs';
import { processTerrainMeshJob } from '../src/terrain-mesh-protocol.mjs';
import {
  V2ExternalTerrainMeshBridge, EXTERNAL_MESH_BATCH_CHUNKS
} from '../src/external-terrain-mesh-bridge.mjs';

function fakeWorker() {
  const handlers=new Map();
  return {
    sent:[],terminated:false,
    addEventListener(type,handler) { handlers.set(type,handler); },
    postMessage(payload,transfer=[]) { this.sent.push({payload,transfer}); },
    terminate() { this.terminated=true; },
    message(payload) { handlers.get('message')?.({data:payload}); },
    error(message) { handlers.get('error')?.({message,preventDefault(){}}); }
  };
}

function loaded(chunkEdge=32) {
  const loader=new V2ExternalTerrainLoader(createExternalSiteFixture({chunkEdge}));
  while(!loader.progress.done) loader.loadStep(192);
  return loader;
}

function bridge(workers,ready,errors) {
  return new V2ExternalTerrainMeshBridge({
    createWorker:()=>{const w=fakeWorker();workers.push(w);return w;},
    now:()=>0,
    onReady:(world,meshes,epoch)=>ready.push({world,meshes,epoch}),
    onFailure:(reason,epoch)=>errors.push({reason,epoch})
  });
}

function warm(worker) {
  assert.equal(worker.sent[0].payload.type,'warmup');
  worker.message({schema:'voxel-v2.terrain-mesh-job.v1',
    type:'warm',id:worker.sent[0].payload.id});
}

function complete(worker,guard=64) {
  for(let i=0;i<guard;i++) {
    const pending=worker.sent.find(row=>row.payload.type==='build' &&
      !row.completed);
    if(!pending) return;
    pending.completed=true;
    worker.message(processTerrainMeshJob(pending.payload));
  }
  throw new Error('Unexpectedly large external mesh batch sequence');
}

test('worker-backed external meshes match full CPU geometry, with one bounded job at a time',()=>{
  assert.equal(EXTERNAL_MESH_BATCH_CHUNKS,4);
  for(const chunkEdge of [16,32]) {
    const loader=loaded(chunkEdge);
    const workers=[],ready=[],errors=[];
    const runner=bridge(workers,ready,errors);
    const epoch=runner.begin(loader.terrain.world);
    assert.equal(ready.length,0,'no synchronous mesh publish on initialization');
    assert.equal(runner.status.busy,true);
    assert.equal(runner.status.totalChunks,loader.terrain.world.chunkCount);
    assert.equal(workers.length,1);
    assert.equal(workers[0].sent.length,1,'work must wait for warm handshake');
    warm(workers[0]);
    assert.equal(workers[0].sent.length,2);
    complete(workers[0]);
    assert.equal(ready.length,1);
    assert.equal(ready[0].epoch,epoch);
    assert.equal(ready[0].world,loader.terrain.world);
    assert.deepEqual(
      new Map(ready[0].meshes.map(mesh=>[mesh.id,mesh])),
      new Map(buildExposedFaceMeshes(loader.terrain.world).map(mesh=>[mesh.id,mesh]))
    );
    const batches=workers[0].sent.filter(row=>row.payload.type==='build');
    assert.ok(batches.length>=2,'real signed site loads in multiple batches');
    assert.ok(batches.every(row=>row.payload.dirtyIds.length<=EXTERNAL_MESH_BATCH_CHUNKS));
    assert.ok(batches.every(row=>row.payload.snapshotBytes<=2*1024*1024));
    assert.equal(runner.status.busy,false);
    assert.deepEqual(errors,[]);
    runner.close();
    assert.equal(workers[0].terminated,true);
    loader.unload();
  }
});

test('world replacement ignores late completion even when both worlds have the same revision',()=>{
  const original=loaded();
  const replacement=loaded();
  assert.notEqual(original.terrain.world,replacement.terrain.world);
  assert.equal(original.terrain.world.revision,replacement.terrain.world.revision);
  const workers=[],ready=[],errors=[];
  const runner=bridge(workers,ready,errors);
  const staleEpoch=runner.begin(original.terrain.world);
  warm(workers[0]);
  const staleJob=workers[0].sent[1].payload;
  const nextEpoch=runner.begin(replacement.terrain.world);
  assert.ok(nextEpoch>staleEpoch);
  assert.equal(workers[0].terminated,true);
  workers[0].message(processTerrainMeshJob(staleJob));
  assert.equal(ready.length,0,'old worker can never publish into the new world');
  assert.equal(workers.length,2);
  warm(workers[1]);
  complete(workers[1]);
  assert.equal(ready.length,1);
  assert.equal(ready[0].world,replacement.terrain.world);
  assert.equal(ready[0].epoch,nextEpoch);
  assert.deepEqual(errors,[]);
  runner.close();
  original.unload();
  replacement.unload();
});

test('authoritative voxel edits during an in-flight mesh invalidate the entire pending scene',()=>{
  const loader=loaded(16);
  const workers=[],ready=[],errors=[];
  const runner=bridge(workers,ready,errors);
  runner.begin(loader.terrain.world);
  warm(workers[0]);
  const stale=workers[0].sent[1].payload;
  loader.terrain.port.apply({
    id:'edit-mid-meshing',type:'carve-sphere',x:0,y:6,z:0,radius:2.3,
    expectedRevision:loader.terrain.world.revision
  });
  workers[0].message(processTerrainMeshJob(stale));
  assert.equal(ready.length,0);
  assert.equal(errors.length,1);
  assert.match(errors[0].reason,/Stale or invalid/);
  assert.equal(runner.status.busy,false);
  assert.equal(workers[0].terminated,false,'idle warmed worker remains available');
  const epoch=runner.begin(loader.terrain.world);
  complete(workers[0]);
  assert.equal(ready.length,1);
  assert.equal(ready[0].epoch,epoch);
  runner.close();
  loader.unload();
});

test('worker failure clears partial scene and a subsequent build uses a new worker',()=>{
  const loader=loaded(32);
  const workers=[],ready=[],errors=[];
  const runner=bridge(workers,ready,errors);
  runner.begin(loader.terrain.world);
  warm(workers[0]);
  workers[0].message(processTerrainMeshJob(workers[0].sent[1].payload));
  assert.equal(ready.length,0,'first chunk batch alone must never publish a scene');
  workers[0].error('Simulated worker fault');
  assert.equal(errors.length,1);
  assert.match(errors[0].reason,/Simulated worker fault/);
  assert.equal(runner.status.busy,false);
  assert.equal(workers[0].terminated,true);
  runner.begin(loader.terrain.world);
  assert.equal(workers.length,2);
  warm(workers[1]);
  complete(workers[1]);
  assert.equal(ready.length,1);
  runner.close();
  loader.unload();
});

test('cancel and close reject stale results without exposing partial geometry',()=>{
  const loader=loaded();
  const workers=[],ready=[],errors=[];
  const runner=bridge(workers,ready,errors);
  runner.begin(loader.terrain.world);
  warm(workers[0]);
  const old=workers[0].sent[1].payload;
  assert.equal(runner.cancel(),true);
  workers[0].message(processTerrainMeshJob(old));
  assert.deepEqual(ready,[]);
  assert.deepEqual(errors,[]);
  assert.equal(runner.cancel(),false);
  runner.close();
  assert.equal(runner.status.closed,true);
  assert.throws(()=>runner.begin(loader.terrain.world),/closed/);
  assert.throws(()=>runner.begin(null),/closed/);
  loader.unload();
});

test('worker staging does not copy every chunk before making its first bounded job',()=>{
  const loader=loaded(32);
  const world=loader.terrain.world;
  const snapshots=world.snapshots;
  world.snapshots=()=>{throw new Error('Full-world snapshot forbidden during staged meshing');};
  const workers=[],ready=[],errors=[];
  const runner=bridge(workers,ready,errors);
  runner.begin(world);
  warm(workers[0]);
  complete(workers[0]);
  assert.equal(ready.length,1);
  assert.deepEqual(errors,[]);
  delete world.snapshots;
  assert.deepEqual(
    new Map(ready[0].meshes.map(mesh=>[mesh.id,mesh])),
    new Map(buildExposedFaceMeshes(world).map(mesh=>[mesh.id,mesh]))
  );
  runner.close();
  loader.unload();
});
