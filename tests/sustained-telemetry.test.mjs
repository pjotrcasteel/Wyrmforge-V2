import test from 'node:test';
import assert from 'node:assert/strict';
import { SustainedTelemetry } from '../src/sustained-telemetry.mjs';

const input = n => ({
  frames: {p95:20,p99:30,hitchesOver50Ms:0},
  queue:{pendingChunks:n,pendingBytes:n*100,recoveryChunks:0},
  renderer:{gpuBufferBytesEstimate:1000+n},
  voxelBytes:262144,edits:n,pendingTerrainChunks:0
});

test('sustained telemetry samples at most once per interval and stays bounded', () => {
  const telemetry = new SustainedTelemetry({intervalMs:1000,capacity:3});
  assert.equal(telemetry.record(0,input(1)),true);
  assert.equal(telemetry.record(500,input(2)),false);
  for(let i=1;i<=5;i++) telemetry.record(i*1000,input(i));
  const report=telemetry.report();
  assert.equal(report.sampleCount,3);
  assert.deepEqual(report.samples.map(x=>x.edits),[3,4,5]);
  assert.equal(report.peakPendingBytes,500);
  assert.equal(report.elapsedSeconds,5);
  telemetry.reset();
  assert.equal(telemetry.report().sampleCount,0);
});

test('telemetry snapshot is immutable and handles missing GPU metrics', () => {
  const telemetry=new SustainedTelemetry();
  telemetry.record(0,{...input(0),queue:null,renderer:null});
  const snapshot=telemetry.report();
  assert.equal(snapshot.heapAvailable,false);
  assert.equal(snapshot.samples[0].pendingBytes,null);
  snapshot.samples[0].edits=100;
  assert.equal(telemetry.report().samples[0].edits,0);
  assert.throws(()=>new SustainedTelemetry({capacity:0}),RangeError);
});

test('subsecond upload peaks survive the next one-second sample', () => {
  const telemetry = new SustainedTelemetry();
  telemetry.record(0,input(0));
  telemetry.observeQueue({pendingChunks:8,pendingBytes:32768,recoveryChunks:3});
  telemetry.observeQueue({pendingChunks:0,pendingBytes:0,recoveryChunks:0});
  telemetry.record(1000,input(0));
  const report=telemetry.report();
  assert.equal(report.samples[1].pendingBytes,0);
  assert.equal(report.peakPendingBytes,32768);
  assert.equal(report.peakPendingChunks,8);
  assert.equal(report.peakRecoveryChunks,3);
  telemetry.reset();
  assert.equal(telemetry.report().peakPendingBytes,0);
});
