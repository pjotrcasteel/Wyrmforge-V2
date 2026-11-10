import test from 'node:test';
import assert from 'node:assert/strict';
import { createEngineRuntime } from '../src/engine-runtime.mjs';

function fakeTerrain() {
  const listeners=new Map();
  return {
    listeners,started:0,stopped:0,disposed:0,
    start(){this.started++;},stop(){this.stopped++;},dispose(){this.disposed++;},
    apply(change){for(const listener of listeners.values()) listener(change);},
    subscribe(kind,listener){listeners.set(kind,listener);return ()=>listeners.delete(kind);}
  };
}
function fakeConsumer() {
  return {received:[],started:0,stopped:0,disposed:0,
    start(){this.started++;},stop(){this.stopped++;},dispose(){this.disposed++;},
    onTerrainChange(change){this.received.push(change);}};
}
test('replace physics engine without changing gameplay or terrain implementation',()=>{
  for(const replacement of [fakeConsumer(),fakeConsumer()]) {
    const terrain=fakeTerrain();
    const runtime=createEngineRuntime({terrain,physics:replacement});
    runtime.start();
    terrain.apply({sequence:1});
    assert.deepEqual(replacement.received,[{sequence:1}]);
    assert.equal(terrain.listeners.size,1);
    runtime.stop();
    terrain.apply({sequence:2});
    assert.equal(replacement.received.length,1);
    assert.equal(terrain.listeners.size,0);
    runtime.dispose();
    runtime.dispose();
    assert.equal(replacement.disposed,1);
    assert.equal(terrain.disposed,1);
  }
});
test('one consumer may be absent and consumers receive ordered changes',()=>{
  const terrain=fakeTerrain(),audio=fakeConsumer(),physics=fakeConsumer();
  const runtime=createEngineRuntime({terrain,audio,physics});
  runtime.start();
  terrain.apply({sequence:1});
  terrain.apply({sequence:2});
  assert.deepEqual(audio.received,physics.received);
  assert.equal(terrain.listeners.size,2);
  runtime.dispose();
  assert.equal(terrain.listeners.size,0);
});
test('invalid adapter is rejected and startup failure cleans up subscriptions',()=>{
  assert.throws(()=>createEngineRuntime({terrain:fakeTerrain(),physics:{}}),/physics/);
  const terrain=fakeTerrain(),physics=fakeConsumer();
  const audio={...fakeConsumer(),start(){throw new Error('startup failure');}};
  const runtime=createEngineRuntime({terrain,physics,audio});
  assert.throws(()=>runtime.start(),/startup failure/);
  assert.equal(terrain.listeners.size,0);
  assert.equal(physics.stopped,1);
  assert.equal(terrain.stopped,1);
  runtime.dispose();
});
