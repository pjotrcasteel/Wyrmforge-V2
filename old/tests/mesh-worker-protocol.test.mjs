import test from 'node:test';
import assert from 'node:assert/strict';
import { VoxelWorld, createScene } from '../src/voxel-world.mjs';
import { compareMeshing } from '../src/meshing-comparison.mjs';
import {
  createMeshingJob, jobTransferBuffers, runMeshingJob,
  isCurrentMeshingResult, MAX_WORKER_CHUNKS, MAX_WORKER_SNAPSHOT_BYTES
} from '../src/mesh-worker-protocol.mjs';

test('worker snapshot transfer preserves authoritative voxel state and exact mesh output', () => {
  for (const chunkEdge of [16,32]) {
    const world = createScene('arch', 7, { chunkEdge });
    const original = world.snapshots();
    const job = createMeshingJob(world, 15);
    assert.equal(job.snapshotBytes, job.chunks.length * chunkEdge ** 3);
    const transfers = jobTransferBuffers(job);
    assert.equal(transfers.length, job.chunks.length);
    const received = structuredClone(job, { transfer: transfers });
    assert.equal(job.chunks[0].data.byteLength, 0,
      'transferred copies must detach from the main-thread packet');
    assert.equal(world.get(5,5,2), 3, 'authoritative voxel data must stay intact');
    const response = runMeshingJob(received);
    const baseline = compareMeshing(world);
    assert.equal(response.type, 'complete');
    assert.equal(response.id, 15);
    assert.deepEqual(
      [response.comparison.exposed.triangles,response.comparison.greedy.triangles],
      [baseline.exposed.triangles,baseline.greedy.triangles]
    );
    assert.equal(response.comparison.greedy.unitFaces, response.comparison.exposed.unitFaces);
    assert.deepEqual(world.snapshots(), original);
  }
});

test('stale results are rejected after edits, even with matching job IDs', () => {
  const world = createScene('flat', 7);
  const job = createMeshingJob(world, 4);
  const reply = runMeshingJob(job);
  assert.equal(isCurrentMeshingResult(reply, job.id, world.revision), true);
  world.set(0,0,0,0);
  assert.equal(isCurrentMeshingResult(reply, job.id, world.revision), false);
  assert.equal(isCurrentMeshingResult(reply, job.id+1, job.revision), false);
  assert.equal(isCurrentMeshingResult({type:'error',id:job.id}, job.id,job.revision), false);
});

test('worker packet enforces explicit chunk and memory caps', () => {
  const world = new VoxelWorld({chunkEdge:32});
  for(let x=0;x<=64;x++) world.set(x*32,0,0,1);
  assert.equal(world.chunkCount, 65);
  assert.throws(()=>createMeshingJob(world,1),RangeError);
  assert.equal(MAX_WORKER_CHUNKS,64);
  assert.equal(MAX_WORKER_SNAPSHOT_BYTES,2*1024*1024);
  const one = new VoxelWorld();
  one.set(1,2,3,1);
  assert.throws(()=>createMeshingJob(one,0),RangeError);
  assert.throws(()=>createMeshingJob(one,-1),RangeError);
});

test('worker packet rejects duplicate, corrupt, oversized and invalid snapshots', () => {
  const world = new VoxelWorld();
  world.set(1,2,3,1);
  const job = createMeshingJob(world,3);
  assert.throws(()=>runMeshingJob({...job,chunks:[...job.chunks,...job.chunks]}),TypeError);
  assert.throws(()=>runMeshingJob({...job,chunkEdge:24}),TypeError);
  assert.throws(()=>runMeshingJob({...job,chunks:[{...job.chunks[0],id:'01,0,0'}]}),TypeError);
  assert.throws(()=>runMeshingJob({...job,chunks:[{...job.chunks[0],data:new Uint8Array(3)}]}),TypeError);
  assert.throws(()=>runMeshingJob({...job,chunks:Array(65).fill(job.chunks[0])}),TypeError);
  assert.throws(()=>runMeshingJob(null),TypeError);
});

test('worker comparisons do not change scene data even after a crater', () => {
  const world = createScene('hill',7,{chunkEdge:32});
  for(let z=-3;z<=3;z++)for(let x=-3;x<=3;x++) world.set(x,3,z,0);
  const before=world.snapshots();
  const job=createMeshingJob(world,1);
  const reply=runMeshingJob(job);
  assert.equal(reply.comparison.greedy.unitFaces,reply.comparison.exposed.unitFaces);
  assert.deepEqual(world.snapshots(),before);
});
