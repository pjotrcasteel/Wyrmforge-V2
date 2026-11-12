import test from 'node:test';
import assert from 'node:assert/strict';
import { VoxelWorld, createScene } from '../src/voxel-world.mjs';
import { buildExposedFaceMeshes } from '../src/exposed-face-mesher.mjs';
import { demoCarveTarget, carveDemoSphere } from '../src/demo-carve.mjs';
import {
  createTerrainMeshJob, processTerrainMeshJob, terrainJobTransfers,
  terrainMeshTransfers, isCurrentTerrainMeshReply, MAX_TERRAIN_JOB_CHUNKS,
  MAX_TERRAIN_RESULT_BYTES
} from '../src/terrain-mesh-protocol.mjs';

test('actual worker output matches local exposed-face meshes after destructive carving', () => {
  for (const edge of [16,32]) {
    for (const scene of ['hill','arch']) {
      const world = createScene(scene,7,{chunkEdge:edge});
      const dirty = new Set();
      const removed = carveDemoSphere(world,demoCarveTarget(scene),{dirtyChunks:dirty});
      assert.ok(removed > 0);
      const before=world.snapshots(), revision=world.revision;
      const job=createTerrainMeshJob(world,dirty,1);
      assert.ok(job.snapshotBytes <= 2*1024*1024);
      const received=structuredClone(job,{transfer:terrainJobTransfers(job)});
      assert.equal(job.snapshots[0].data.byteLength,0);
      const reply=processTerrainMeshJob(received);
      assert.equal(isCurrentTerrainMeshReply(reply,received,revision),true);
      const full=buildExposedFaceMeshes(world,{chunkIds:dirty});
      const a=new Map(reply.meshes.map(m=>[m.id,m]));
      const b=new Map(full.map(m=>[m.id,m]));
      assert.deepEqual([...a.keys()].sort(),[...b.keys()].sort());
      for(const [id,mesh] of a) assert.deepEqual(mesh,b.get(id));
      const transfer=structuredClone(reply,{transfer:terrainMeshTransfers(reply)});
      assert.equal(isCurrentTerrainMeshReply(transfer,received,revision),true);
      assert.deepEqual(world.snapshots(),before);
    }
  }
});

test('deleted chunk produces explicit empty replacement, not resurrected GPU geometry', () => {
  const world=new VoxelWorld({chunkEdge:16});
  world.set(16,1,0,3);
  const dirty=new Set(['1,0,0','0,0,0']);
  world.set(16,1,0,0);
  const job=createTerrainMeshJob(world,dirty,12);
  const reply=processTerrainMeshJob(job);
  assert.equal(reply.meshes.length,0);
  assert.deepEqual(reply.dirtyIds,['0,0,0','1,0,0']);
  assert.equal(isCurrentTerrainMeshReply(reply,job,world.revision),true);
});

test('stale results are rejected after edit and reset, and never mutate terrain', () => {
  const world=createScene('arch',7,{chunkEdge:32});
  const dirty=new Set(['0,0,0']);
  const job=createTerrainMeshJob(world,dirty,5);
  const reply=processTerrainMeshJob(job);
  assert.equal(isCurrentTerrainMeshReply(reply,job,world.revision),true);
  world.set(5,5,2,0);
  assert.equal(isCurrentTerrainMeshReply(reply,job,world.revision),false);
  world.clear();
  assert.equal(isCurrentTerrainMeshReply(reply,job,world.revision),false);
  assert.equal(isCurrentTerrainMeshReply(reply,{...job,id:6},job.revision),false);
  assert.equal(isCurrentTerrainMeshReply({...reply,dirtyIds:[]},job,job.revision),false);
  assert.equal(isCurrentTerrainMeshReply({...reply,meshes:[{id:'9,9,9'}]},job,job.revision),false);
});

test('signed boundary snapshots include neighbor faces without reading whole world', () => {
  for (const edge of [16,32]) {
    const world=new VoxelWorld({chunkEdge:edge});
    world.set(-1,0,0,2);
    world.set(0,0,0,2);
    const proxy={
      chunkEdge:edge,revision:world.revision,
      chunkSnapshot:(...coords)=>world.chunkSnapshot(...coords),
      snapshots:()=>{throw new Error('Global snapshot should not be used');}
    };
    const job=createTerrainMeshJob(proxy,new Set(['-1,0,0','0,0,0']),2);
    assert.equal(job.snapshots.length,2);
    const reply=processTerrainMeshJob(job);
    assert.equal(reply.meshes.reduce((s,m)=>s+m.triangleCount,0),20);
    for (const mesh of reply.meshes) assert.equal(mesh.faceCount,5);
  }
});

test('job creation enforces ID, count, type and payload safety limits', () => {
  const world=new VoxelWorld({chunkEdge:32});
  world.set(0,0,0,1);
  assert.throws(()=>createTerrainMeshJob(world,new Set(),1),RangeError);
  assert.throws(()=>createTerrainMeshJob(world,new Set(['0,0,0']),0),RangeError);
  assert.throws(()=>createTerrainMeshJob(world,new Set(['01,0,0']),1),TypeError);
  assert.throws(()=>createTerrainMeshJob(world,new Set(['9007199254740992,0,0']),1),TypeError);
  assert.throws(()=>createTerrainMeshJob(world,Array(65).fill(0).map((_,i)=>`${i},0,0`),1),RangeError);
  assert.equal(MAX_TERRAIN_JOB_CHUNKS,64);
  const job=createTerrainMeshJob(world,new Set(['0,0,0']),1);
  assert.throws(()=>processTerrainMeshJob({...job,dirtyIds:['0,0,0','0,0,0']}),TypeError);
  assert.throws(()=>processTerrainMeshJob({...job,chunkEdge:17}),TypeError);
  assert.throws(()=>processTerrainMeshJob({...job,snapshotBytes:1}),TypeError);
  assert.throws(()=>processTerrainMeshJob({...job,snapshots:[...job.snapshots,...job.snapshots]}),TypeError);
});


test('malformed worker mesh buffers and indices are rejected before GPU upload', () => {
  const world = new VoxelWorld({chunkEdge:16});
  world.set(0,0,0,3);
  const job = createTerrainMeshJob(world,new Set(['0,0,0']),77);
  const reply = processTerrainMeshJob(job);
  assert.equal(isCurrentTerrainMeshReply(reply,job,world.revision),true);
  const mesh = reply.meshes[0];
  const invalid = [
    {...mesh,vertexCount:-1},
    {...mesh,triangleCount:NaN},
    {...mesh,normals:new Int8Array(0)},
    {...mesh,materials:new Uint8Array(0)},
    {...mesh,indices:new Uint32Array([...mesh.indices.slice(0,-1),mesh.vertexCount])}
  ];
  for (const replacement of invalid) {
    assert.equal(isCurrentTerrainMeshReply({...reply,meshes:[replacement]},job,world.revision),false);
  }
});

test('expanded worker geometry has an independent byte ceiling',()=>{
  assert.equal(MAX_TERRAIN_RESULT_BYTES,16*1024*1024);
  // Two dense alternating 32-cubed snapshots fit comfortably under the
  // 2 MiB input cap yet expand beyond 16 MiB of exposed-face geometry.
  const edge=32, snapshots=new Map();
  for(let cx=0;cx<2;cx++) {
    const data=new Uint8Array(edge**3);
    for(let y=0;y<edge;y++) {
      for(let z=0;z<edge;z++) {
        for(let x=0;x<edge;x++) {
          if((x+y+z)%2) data[x+edge*(z+edge*y)]=3;
        }
      }
    }
    const id=cx+',0,0';
    snapshots.set(id,{id,data,revision:1});
  }
  const world={
    chunkEdge:edge,revision:1,
    chunkSnapshot:(x,y,z)=>snapshots.get(x+','+y+','+z) ?? null
  };
  const job=createTerrainMeshJob(world,new Set(['0,0,0','1,0,0']),41);
  assert.ok(job.snapshotBytes<MAX_TERRAIN_RESULT_BYTES);
  assert.throws(()=>processTerrainMeshJob(job),/output byte budget exceeded/);
});

test('worker replies reject forged or mismatched mesh byte accounting',()=>{
  const world=new VoxelWorld({chunkEdge:16});
  world.set(0,0,0,3);
  const job=createTerrainMeshJob(world,new Set(['0,0,0']),52);
  const reply=processTerrainMeshJob(job);
  assert.equal(isCurrentTerrainMeshReply(reply,job,world.revision),true);
  assert.equal(isCurrentTerrainMeshReply({...reply,meshBytes:MAX_TERRAIN_RESULT_BYTES+1},
    job,world.revision),false);
  assert.equal(isCurrentTerrainMeshReply({...reply,meshBytes:reply.meshBytes-1},
    job,world.revision),false);
  const corrupted={...reply.meshes[0],cpuBufferBytes:1};
  assert.equal(isCurrentTerrainMeshReply({...reply,meshes:[corrupted]},
    job,world.revision),false);
});
