import test from 'node:test';
import assert from 'node:assert/strict';
import { TerrainTextureRuntime } from '../src/terrain-texture-runtime.mjs';

function harness() {
  const uploaded = new Set();
  const calls = [];
  const loader = {
    acquire: async (channel, key) => { calls.push('acquire:' + key); return { width: 16, height: 16 }; },
    release: (channel, key) => calls.push('release:' + key),
    clearUnused: () => calls.push('clear')
  };
  const gpu = {
    getLayer: (channel, key) => uploaded.has(channel + ':' + key) ? 0 : null,
    upload: (channel, key) => { calls.push('upload:' + key); uploaded.add(channel + ':' + key); },
    contextLost: () => { uploaded.clear(); calls.push('lost'); },
    contextRestored: () => calls.push('restored'),
    dispose: () => calls.push('dispose')
  };
  return { runtime: new TerrainTextureRuntime(loader, gpu), calls };
}

test('deduplicates requests and uploads only one tile per frame by default', async () => {
  const { runtime, calls } = harness();
  assert.equal(runtime.enqueue('albedo', 'grass'), true);
  assert.equal(runtime.enqueue('albedo', 'grass'), false);
  runtime.enqueue('albedo', 'stone');
  assert.equal(await runtime.uploadFrame(), 1);
  assert.equal(runtime.pending, 1);
  assert.equal(await runtime.uploadFrame(), 1);
  assert.equal(runtime.pending, 0);
  assert.deepEqual(calls, [
    'acquire:grass', 'upload:grass', 'release:grass',
    'acquire:stone', 'upload:stone', 'release:stone'
  ]);
  runtime.dispose();
});

test('requeues assets after context restoration without synchronous bulk upload', async () => {
  const { runtime } = harness();
  runtime.enqueue('albedo', 'grass');
  await runtime.uploadFrame();
  runtime.contextLost();
  assert.equal(await runtime.uploadFrame(), 0);
  runtime.contextRestored([{ channel: 'albedo', key: 'grass' }]);
  assert.equal(runtime.pending, 1);
  assert.equal(await runtime.uploadFrame(), 1);
});

test('failed GPU uploads remain retryable and always release decoded images', async () => {
  const calls = [];
  let fail = true;
  const loader = {
    acquire: async () => ({}),
    release: () => calls.push('release'),
    clearUnused: () => {}
  };
  const gpu = {
    getLayer: () => null,
    upload: () => { if (fail) throw new Error('temporary'); },
    contextLost: () => {},
    contextRestored: () => {},
    dispose: () => {}
  };
  const runtime = new TerrainTextureRuntime(loader, gpu);
  runtime.enqueue('albedo', 'grass');
  await assert.rejects(runtime.uploadFrame(), /temporary/);
  assert.equal(runtime.pending, 1);
  assert.deepEqual(calls, ['release']);
  fail = false;
  assert.equal(await runtime.uploadFrame(), 1);
  assert.deepEqual(calls, ['release', 'release']);
});

test('rejects invalid upload budgets', async () => {
  const { runtime } = harness();
  await assert.rejects(runtime.uploadFrame({ maxTiles: 0 }), RangeError);
  await assert.rejects(runtime.uploadFrame({ maxTiles: 100 }), RangeError);
});
