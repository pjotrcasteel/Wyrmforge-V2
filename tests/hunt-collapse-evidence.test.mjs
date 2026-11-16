import test from 'node:test';
import assert from 'node:assert/strict';
import {HuntCollapseEvidence} from '../src/diagnostics/hunt-collapse-evidence.mjs';

const world={chunkCount:12,allocatedVoxelBytes:8192};

test('collapse timing ends at static render and survives reload in the same tab',()=>{
  const records=new Map();
  const storage={getItem:key=>records.get(key),setItem:(key,value)=>records.set(key,value)};
  const evidence=new HuntCollapseEvidence(storage,'build-1');
  evidence.begin({sequence:3,at:100,activationCpuMs:4.531,ownerCount:2,world});
  evidence.frame(16.7);
  evidence.presented(120,null,'ready');
  evidence.presented(150,null,'ready');
  assert.equal(evidence.snapshot.tracking,true);
  assert.deepEqual(evidence.snapshot.recent,[]);
  assert.equal(records.size,0);
  evidence.observe({chunkCount:15,allocatedVoxelBytes:10000});
  evidence.step(2.145,true);
  evidence.step(3.234,false);
  evidence.frame(41.23);
  evidence.presented(190,[{},{}],'saved');
  evidence.presented(200,[{},{}],'saved');
  assert.equal(evidence.snapshot.tracking,false);
  const [sample]=evidence.snapshot.recent;
  assert.deepEqual(sample,{sequence:3,activationCpuMs:4.5,ownerCount:2,fallVisibleMs:20,
    physicsSteps:2,actorBlockedSteps:1,frames:2,hitchesOver33Ms:1,peakChunks:15,
    peakVoxelPayloadBytes:10000,interrupted:false,maxFrameMs:41.2,maxPhysicsStepCpuMs:3.2,
    settlementVisibleMs:90,landedVoxels:2,saveStatus:'saved'});
  assert.deepEqual(new HuntCollapseEvidence(storage,'build-1').snapshot,
    {...evidence.snapshot,restoredSamples:1});
  assert.deepEqual(new HuntCollapseEvidence(storage,'build-2').snapshot.recent,[]);
});

test('collapse history stays bounded and survives unavailable tab storage',()=>{
  const unavailable={getItem:()=>{throw new Error('disabled');},setItem:()=>{throw new Error('full');}};
  const evidence=new HuntCollapseEvidence(unavailable,'build');
  for(let sequence=1;sequence<=10;sequence++){
    evidence.begin({sequence,at:0,activationCpuMs:0,ownerCount:1,world});
    evidence.interrupt();
    evidence.presented(300,[{}],'saved');
  }
  const {recent}=evidence.snapshot;
  assert.equal(recent.length,8);
  assert.equal(recent[0].sequence,3);
  assert.equal(recent.at(-1).sequence,10);
  assert.ok(recent.every(sample=>sample.interrupted&&sample.fallVisibleMs===null));
});
