import test from 'node:test';
import assert from 'node:assert/strict';
import { compileTerrainTextureManifest } from '../src/terrain-texture-manifest.mjs';
import { TerrainTextureLoader } from '../src/terrain-texture-loader.mjs';

const manifest = compileTerrainTextureManifest(undefined, { tileSize: 16 });
const [assetA, assetB] = manifest.assets.filter(asset => asset.channel === 'albedo');

test('deduplicates concurrent decode and reference counts acquired assets', async () => {
  let calls = 0;
  const loader = new TerrainTextureLoader(manifest, {
    decode: async () => { calls++; return { width: 16, height: 16 }; }
  });
  const [first, second] = await Promise.all([
    loader.acquire(assetA.channel, assetA.key),
    loader.acquire(assetA.channel, assetA.key)
  ]);
  assert.strictEqual(first, second);
  assert.equal(calls, 1);
  assert.equal(loader.statistics.residentBytes, 1024);
  loader.release(assetA.channel, assetA.key);
  loader.clearUnused();
  assert.equal(loader.statistics.cachedAssets, 1);
  loader.release(assetA.channel, assetA.key);
  loader.clearUnused();
  assert.equal(loader.statistics.residentBytes, 0);
});

test('keeps acquired assets resident and rejects budget overflow', async () => {
  const loader = new TerrainTextureLoader(manifest, {
    maxResidentBytes: 1024, decode: async () => ({ width: 16, height: 16 })
  });
  await loader.acquire(assetA.channel, assetA.key);
  await assert.rejects(loader.acquire(assetB.channel, assetB.key), RangeError);
  loader.release(assetA.channel, assetA.key);
  await loader.acquire(assetB.channel, assetB.key);
  assert.equal(loader.statistics.cachedAssets, 1);
  loader.release(assetB.channel, assetB.key);
});

test('rejects wrong dimensions, unknown keys and duplicate releases', async () => {
  const loader = new TerrainTextureLoader(manifest, {
    decode: async () => ({ width: 32, height: 16 })
  });
  await assert.rejects(loader.acquire(assetA.channel, assetA.key), RangeError);
  await assert.rejects(loader.acquire('albedo', 'does-not-exist'), RangeError);
  assert.throws(() => loader.release(assetA.channel, assetA.key), RangeError);
  assert.equal(loader.statistics.inflightAssets, 0);
});

test('limits simultaneous decodes without queuing unlimited memory', async () => {
  let complete;
  const gate = new Promise(resolve => { complete = resolve; });
  const loader = new TerrainTextureLoader(manifest, {
    maxConcurrent: 1, decode: async () => { await gate; return { width: 16, height: 16 }; }
  });
  const pending = loader.acquire(assetA.channel, assetA.key);
  await assert.rejects(loader.acquire(assetB.channel, assetB.key), RangeError);
  complete();
  await pending;
  loader.release(assetA.channel, assetA.key);
});
