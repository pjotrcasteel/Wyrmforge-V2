import test from 'node:test';
import assert from 'node:assert/strict';
import {HuntStreamingEvidence} from '../src/hunt-streaming-evidence.mjs';

test('device evidence captures phase-specific CPU, hitches and route coverage with bounded history',()=>{
  const witness=new HuntStreamingEvidence();
  witness.observe({section:'entry',world:{allocatedVoxelBytes:500,chunkCount:3,microSurfaceCount:17},storage:{definitions:3}});
  witness.observe({section:'entry',world:{allocatedVoxelBytes:1200,chunkCount:7,microSurfaceCount:31},storage:{definitions:5}});
  witness.observe({section:'forest'});
  witness.movement({x:0,z:0},{x:1,z:0},{moveX:1,moveZ:0},{moveX:1,moveZ:0},1);
  witness.movement({x:1,z:0},{x:1,z:0},{moveX:1,moveZ:0},{moveX:0,moveZ:0},1);
  for(let i=0;i<60;i++){
    witness.begin({id:'site-'+i,action:i%2?'load':'evict'},i*200,6.25);
    witness.write(512,2.5);
    witness.write(10,3.1);
    witness.frame(16.7); witness.frame(41.7);
    witness.publish(i*200+180);
  }
  const result=witness.snapshot;
  assert.deepEqual(result.visitedSections,['entry','forest']);
  assert.equal(result.distanceMetres,1);
  assert.equal(result.blockedInputSteps,1);
  assert.equal(result.peakVoxelPayloadBytes,1200);
  assert.equal(result.peakDefinitions,undefined);
  assert.equal(result.peakRetainedDefinitions,5);
  assert.equal(result.completedTransitions,60);
  assert.equal(result.loads,30);
  assert.equal(result.evictions,30);
  assert.equal(result.recentTransitions.length,48);
  assert.equal(result.recentTransitions[0].id,'site-12');
  assert.equal(result.recentTransitions.at(-1).operations,522);
  assert.equal(result.streamingFrames,120);
  assert.equal(result.streamingHitchesOver33Ms,60);
  assert.equal(result.maxStreamingFrameMs,41.7);
  assert.equal(result.maxElapsedMs,180);
  assert.equal(result.maxWriteCpuMs,3.1);
  assert.equal(result.activeTransition,null);
});
