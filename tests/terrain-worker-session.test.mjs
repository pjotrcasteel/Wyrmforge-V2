import test from 'node:test';
import assert from 'node:assert/strict';
import { VoxelWorld } from '../src/voxel-world.mjs';
import { createTerrainMeshJob, processTerrainMeshJob } from '../src/terrain-mesh-protocol.mjs';
import { TerrainWorkerSession } from '../src/terrain-worker-session.mjs';

function fakeWorker() {
  const listeners = new Map();
  return {
    sent: [], terminated: false,
    addEventListener(type, callback) {
      listeners.set(type, callback);
    },
    postMessage(payload, transfer = []) {
      this.sent.push({ payload, transfer });
    },
    terminate() { this.terminated = true; },
    message(data) { listeners.get('message')({ data }); },
    error(message) {
      listeners.get('error')({ message, preventDefault() {} });
    },
    messageError() {
      listeners.get('messageerror')({ preventDefault() {} });
    }
  };
}

function job(id) {
  const world = new VoxelWorld();
  world.set(0,0,0,3);
  return createTerrainMeshJob(world,new Set(['0,0,0']),id);
}

test('prewarmed worker is reused for consecutive real terrain mesh jobs', () => {
  let ms = 0;
  const workers = [], results = [], warmups = [];
  const session = new TerrainWorkerSession({
    createWorker: () => {
      const worker = fakeWorker();
      workers.push(worker);
      return worker;
    },
    now: () => ms,
    onWarm: value => warmups.push(value),
    onResult: (reply, source, metrics) => results.push({ reply, source, metrics })
  });

  session.start();
  assert.equal(workers.length,1);
  assert.equal(workers[0].sent[0].payload.type,'warmup');
  ms = 200;
  workers[0].message({ schema:'voxel-v2.terrain-mesh-job.v1',
    type:'warm', id:1 });
  assert.equal(session.ready,true);
  assert.equal(session.warmupMs,200);
  assert.deepEqual(warmups,[200]);

  const first=job(10);
  ms = 300;
  session.submit(first);
  assert.equal(workers[0].sent[1].payload.type,'build');
  assert.equal(workers[0].sent[1].transfer.length,first.snapshots.length);
  ms = 325;
  workers[0].message(processTerrainMeshJob(first));
  assert.equal(results.length,1);
  assert.equal(results[0].metrics.wasWarmAtSubmission,true);
  assert.equal(results[0].metrics.waitForReadyMs,0);
  assert.equal(results[0].metrics.endToEndMs,25);
  assert.equal(session.busy,false);

  const second=job(11);
  ms = 350;
  session.submit(second);
  ms = 380;
  workers[0].message(processTerrainMeshJob(second));
  assert.equal(results.length,2);
  assert.equal(results[1].metrics.workerRoundTripMs,30);
  assert.equal(workers.length,1,'same hot worker must serve second edit');
  assert.equal(workers[0].terminated,false);
  session.close();
  assert.equal(workers[0].terminated,true);
});

test('an edit queued during warmup reports preparation and startup delay separately', () => {
  let ms=0;
  const workers=[], results=[];
  const session=new TerrainWorkerSession({
    createWorker:()=>{const w=fakeWorker();workers.push(w);return w;},
    now:()=>ms,
    onResult:(_reply,_job,timing)=>results.push(timing)
  });
  session.submit(job(5));
  assert.equal(workers[0].sent.length,1,'work waits for ready handshake');
  ms=150;
  workers[0].message({ schema:'voxel-v2.terrain-mesh-job.v1',type:'warm',id:1 });
  assert.equal(workers[0].sent.length,2);
  ms=175;
  workers[0].message(processTerrainMeshJob(workers[0].sent[1].payload));
  assert.equal(results[0].wasWarmAtSubmission,false);
  assert.equal(results[0].waitForReadyMs,150);
  assert.equal(results[0].workerRoundTripMs,25);
  assert.equal(results[0].endToEndMs,175);
  session.close();
});

test('cancel drops a stale result, but an idle worker survives harmless resets', () => {
  let ms=0;
  const workers=[], results=[];
  const session=new TerrainWorkerSession({
    createWorker:()=>{const w=fakeWorker();workers.push(w);return w;},
    now:()=>ms,onResult:reply=>results.push(reply)
  });
  session.start();
  workers[0].message({schema:'voxel-v2.terrain-mesh-job.v1',type:'warm',id:1});
  assert.equal(session.cancel(),false,'idle warmed session should remain cached');
  session.submit(job(8));
  assert.equal(session.cancel(),true,'running job requires termination');
  assert.equal(workers[0].terminated,true);
  workers[0].message(processTerrainMeshJob(job(8)));
  assert.equal(results.length,0,'terminated worker result ignored');

  session.submit(job(9));
  assert.equal(workers.length,2,'new worker required only after cancel');
  workers[1].message({schema:'voxel-v2.terrain-mesh-job.v1',type:'warm',id:2});
  ms=25;
  workers[1].message(processTerrainMeshJob(job(9)));
  assert.equal(results.length,1);
  session.close();
});

test('single-in-flight rule rejects backlog and unexpected results are ignored', () => {
  const w=fakeWorker(), results=[];
  const session=new TerrainWorkerSession({
    createWorker:()=>w,now:()=>0,onResult:reply=>results.push(reply)
  });
  session.start();
  w.message({schema:'voxel-v2.terrain-mesh-job.v1',type:'warm',id:1});
  session.submit(job(14));
  assert.throws(()=>session.submit(job(15)),/already has a job/);
  w.message(processTerrainMeshJob(job(999)));
  assert.equal(results.length,0);
  w.message({schema:'other',type:'ready',id:14});
  assert.equal(session.busy,true);
  w.message(processTerrainMeshJob(job(14)));
  assert.equal(results.length,1);
  session.close();
});

test('worker runtime errors are surfaced with failed job and terminate session', () => {
  const w=fakeWorker(), errors=[];
  const session=new TerrainWorkerSession({
    createWorker:()=>w,now:()=>1,
    onFailure:(reason,source)=>errors.push({reason,source})
  });
  session.start();
  w.message({schema:'voxel-v2.terrain-mesh-job.v1',type:'warm',id:1});
  session.submit(job(4));
  w.error('Simulated mobile worker fault');
  assert.equal(errors[0].reason,'Simulated mobile worker fault');
  assert.equal(errors[0].source.id,4);
  assert.equal(w.terminated,true);
  assert.equal(session.ready,false);
});

test('invalid jobs, factories and messages are handled defensively', () => {
  assert.throws(()=>new TerrainWorkerSession({createWorker:0,now:()=>0}),TypeError);
  const w=fakeWorker();
  const session=new TerrainWorkerSession({createWorker:()=>w,now:()=>0});
  assert.throws(()=>session.submit({id:0,type:'build'}),TypeError);
  session.start();
  w.message({type:'warm',id:1,schema:'unrelated'});
  assert.equal(session.ready,false);
  session.close();
});


test('message deserialization failure terminates the worker and reports the active job', () => {
  const workers = [], failures = [], results = [];
  const session = new TerrainWorkerSession({
    createWorker: () => { const worker = fakeWorker(); workers.push(worker); return worker; },
    now: () => 0,
    onFailure: (reason, source) => failures.push({ reason, source }),
    onResult: result => results.push(result)
  });
  session.start();
  workers[0].message({ schema: 'voxel-v2.terrain-mesh-job.v1', type: 'warm', id: 1 });
  session.submit(job(41));
  workers[0].messageError();
  assert.match(failures[0].reason, /deserialized/);
  assert.equal(failures[0].source.id, 41);
  assert.equal(workers[0].terminated, true);
  assert.equal(session.busy, false);
  workers[0].message(processTerrainMeshJob(job(41)));
  assert.equal(results.length, 0, 'late response from failed worker must be ignored');
  session.submit(job(42));
  assert.equal(workers.length, 2, 'a new worker can recover after the fault');
  session.close();
});

test('message deserialization failure during warmup clears pending work', () => {
  const worker = fakeWorker(), failures = [];
  const session = new TerrainWorkerSession({
    createWorker: () => worker, now: () => 0,
    onFailure: (reason, source) => failures.push({ reason, source })
  });
  session.submit(job(43));
  worker.messageError();
  assert.equal(failures[0].source.id, 43);
  assert.equal(session.busy, false);
  assert.equal(session.ready, false);
  assert.equal(worker.terminated, true);
});
