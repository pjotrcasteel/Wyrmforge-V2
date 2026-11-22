import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { VoxelWorld } from '../src/voxel-world.mjs';
import {
  TerrainWorkerSession, WORKER_WARMUP_TIMEOUT_MS, WORKER_JOB_TIMEOUT_MS
} from '../src/terrain-worker-session.mjs';
import { createTerrainMeshJob, processTerrainMeshJob } from '../src/terrain-mesh-protocol.mjs';
import { V2ExternalTerrainMeshBridge } from '../src/external-terrain-mesh-bridge.mjs';

const SCHEMA='voxel-v2.terrain-mesh-job.v1';
function fakeWorker() {
  const listeners=new Map();
  return {
    terminated:false,sent:[],
    addEventListener(type,callback) { listeners.set(type,callback); },
    postMessage(payload,transfer=[]) { this.sent.push({payload,transfer}); },
    terminate() { this.terminated=true; },
    message(data) { listeners.get('message')?.({data}); }
  };
}
function createJob(id) {
  const world=new VoxelWorld({chunkEdge:16});
  world.set(0,0,0,3);
  return createTerrainMeshJob(world,new Set(['0,0,0']),id);
}
function warm(worker) {
  const handshake=worker.sent[0].payload;
  assert.equal(handshake.type,'warmup');
  worker.message({schema:SCHEMA,type:'warm',id:handshake.id});
}

test('unresponsive startup fails once and future jobs can use a fresh worker',()=>{
  assert.equal(WORKER_WARMUP_TIMEOUT_MS,15_000);
  const workers=[],failures=[],results=[];
  let time=0;
  const session=new TerrainWorkerSession({
    createWorker:()=>{const worker=fakeWorker();workers.push(worker);return worker;},
    now:()=>time,
    onFailure:(reason,job)=>failures.push({reason,job}),
    onResult:result=>results.push(result)
  });
  session.submit(createJob(1));
  time=14_999;
  assert.equal(session.pollTimeout(),false);
  assert.equal(session.busy,true);
  time=15_000;
  assert.equal(session.pollTimeout(),true);
  assert.match(failures[0].reason,/warmup timed out/);
  assert.equal(failures[0].job.id,1);
  assert.equal(session.busy,false);
  assert.equal(workers[0].terminated,true);
  assert.equal(session.pollTimeout(),false);
  workers[0].message({schema:SCHEMA,type:'warm',id:1});
  assert.equal(results.length,0);
  session.submit(createJob(2));
  assert.equal(workers.length,2);
  warm(workers[1]);
  workers[1].message(processTerrainMeshJob(createJob(2)));
  assert.equal(results.length,1);
  assert.equal(results[0].id,2);
  session.close();
});

test('a silent worker job times out and cannot publish late geometry',()=>{
  assert.equal(WORKER_JOB_TIMEOUT_MS,30_000);
  const workers=[],failures=[],results=[];
  let time=0;
  const session=new TerrainWorkerSession({
    createWorker:()=>{const w=fakeWorker();workers.push(w);return w;},
    now:()=>time,
    onFailure:(reason,job)=>failures.push({reason,job}),
    onResult:reply=>results.push(reply)
  });
  session.start();
  time=100;
  warm(workers[0]);
  session.submit(createJob(10));
  time=30_099;
  assert.equal(session.pollTimeout(),false);
  time=30_100;
  assert.equal(session.pollTimeout(),true);
  assert.equal(failures.length,1);
  assert.match(failures[0].reason,/mesh job timed out/);
  assert.equal(failures[0].job.id,10);
  assert.equal(workers[0].terminated,true);
  workers[0].message(processTerrainMeshJob(createJob(10)));
  assert.deepEqual(results,[]);
  session.submit(createJob(11));
  warm(workers[1]);
  workers[1].message(processTerrainMeshJob(createJob(11)));
  assert.equal(results.length,1);
  session.close();
});

test('mobile background suspension never counts toward worker deadlines',()=>{
  let time=0;
  const worker=fakeWorker(),failures=[],results=[];
  const session=new TerrainWorkerSession({
    createWorker:()=>worker,now:()=>time,
    onResult:(reply,job,metrics)=>results.push({reply,job,metrics}),
    onFailure:reason=>failures.push(reason)
  });
  session.start();
  time=500;
  session.setPaused(true);
  time=100_000;
  assert.equal(session.pollTimeout(),false);
  session.setPaused(false);
  assert.equal(session.pollTimeout(),false);
  time=114_499;
  assert.equal(session.pollTimeout(),false,'only foreground startup time counts');
  time=114_500;
  assert.equal(session.pollTimeout(),true,'real hung startup still expires later');
  assert.match(failures[0],/warmup timed out/);
  assert.equal(worker.terminated,true);
  session.close();
});

test('backgrounded running job resumes with its remaining budget and accurate timings',()=>{
  let time=0;
  const worker=fakeWorker(),results=[],failures=[];
  const session=new TerrainWorkerSession({
    createWorker:()=>worker,now:()=>time,
    onResult:(_reply,_job,metrics)=>results.push(metrics),
    onFailure:reason=>failures.push(reason)
  });
  session.start();
  time=100;
  warm(worker);
  time=200;
  session.submit(createJob(5));
  time=300;
  session.setPaused(true);
  time=200_300;
  session.setPaused(false);
  assert.equal(session.pollTimeout(),false);
  time=200_325;
  worker.message(processTerrainMeshJob(createJob(5)));
  assert.equal(results.length,1);
  assert.equal(results[0].workerRoundTripMs,125);
  assert.equal(results[0].endToEndMs,125);
  assert.deepEqual(failures,[]);
  session.close();
});

test('deadline configuration rejects invalid ranges, without imposing any browser timers',()=>{
  for(const invalid of [-1,0,99,120_001,NaN,1.5,Infinity,'1000']) {
    assert.throws(()=>new TerrainWorkerSession({
      createWorker:fakeWorker,now:()=>0,jobTimeoutMs:invalid
    }),RangeError);
    assert.throws(()=>new TerrainWorkerSession({
      createWorker:fakeWorker,now:()=>0,warmupTimeoutMs:invalid
    }),RangeError);
  }
  const worker=fakeWorker();
  const session=new TerrainWorkerSession({
    createWorker:()=>worker,now:()=>0,warmupTimeoutMs:200,jobTimeoutMs:300
  });
  assert.throws(()=>session.setPaused('yes'),TypeError);
  session.start();
  warm(worker);
  assert.equal(session.pollTimeout(),false,'idle warm worker never expires');
  session.close();
});

test('stalled external scene fails atomically and the next request can recover',()=>{
  const world=new VoxelWorld({chunkEdge:16});
  world.set(0,0,0,3);
  const workers=[],failures=[],ready=[];
  let time=0;
  const bridge=new V2ExternalTerrainMeshBridge({
    createWorker:()=>{const w=fakeWorker();workers.push(w);return w;},
    now:()=>time,
    onReady:(source,meshes)=>ready.push({source,meshes}),
    onFailure:(reason,epoch)=>failures.push({reason,epoch})
  });
  const firstEpoch=bridge.begin(world);
  warm(workers[0]);
  time=WORKER_JOB_TIMEOUT_MS;
  assert.equal(bridge.pollTimeout(),true);
  assert.equal(bridge.status.busy,false);
  assert.equal(bridge.status.stagedMeshBytes,0);
  assert.equal(ready.length,0,'never publish an incomplete world');
  assert.equal(failures.length,1);
  assert.equal(failures[0].epoch,firstEpoch);
  workers[0].message(processTerrainMeshJob(createJob(1)));
  assert.equal(ready.length,0);
  bridge.begin(world);
  warm(workers[1]);
  const job=workers[1].sent.find(row=>row.payload.type==='build').payload;
  workers[1].message(processTerrainMeshJob(job));
  assert.equal(ready.length,1);
  assert.equal(ready[0].source,world);
  bridge.close();
});

test('both browser hosts poll and suspend watchdogs instead of scheduling background timers',()=>{
  const main=readFileSync(new URL('../main.mjs',import.meta.url),'utf8');
  const external=readFileSync(new URL('../external-terrain-lab.mjs',import.meta.url),'utf8');
  assert.match(main,/terrainWorkerSession\?\.pollTimeout\(\)/);
  assert.match(main,/terrainWorkerSession\?\.setPaused\(document\.hidden\)/);
  assert.match(external,/meshBridge\?\.pollTimeout\(\)/);
  assert.match(external,/meshBridge\?\.setPaused\(document\.hidden\)/);
});
