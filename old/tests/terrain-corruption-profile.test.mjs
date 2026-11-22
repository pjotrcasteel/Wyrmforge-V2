import test from 'node:test';
import assert from 'node:assert/strict';
import { CORRUPTION_STOPS, terrainCorruptionProfile, corruptionFromDistance, createHuntRouteMaterialProfile } from '../src/terrain-corruption-profile.mjs';

test('living forest is bright and the Wyrmlayer is visibly more hostile', () => {
  const forest = terrainCorruptionProfile(0);
  const wyrm = terrainCorruptionProfile(1);
  assert.equal(forest.region, 'living-forest');
  assert.equal(wyrm.region, 'wyrmlayer');
  assert.ok(forest.daylight > wyrm.daylight);
  assert.ok(forest.saturation > wyrm.saturation);
  assert.ok(forest.ash < wyrm.ash);
  assert.ok(forest.volcanic < wyrm.volcanic);
});

test('all progression channels remain continuous and within their endpoints', () => {
  for (let i = 0; i <= 100; i++) {
    const profile = terrainCorruptionProfile(i / 100);
    for (const channel of ['daylight', 'saturation', 'ash', 'volcanic']) {
      assert.ok(profile[channel] >= 0 && profile[channel] <= 1, channel);
    }
  }
  for (const stop of CORRUPTION_STOPS) {
    assert.equal(terrainCorruptionProfile(stop.at).region, stop.key);
  }
});

test('distance mapping is deterministic and capped, never changes world state', () => {
  assert.equal(corruptionFromDistance(0, 100), 0);
  assert.equal(corruptionFromDistance(50, 100), 0.5);
  assert.equal(corruptionFromDistance(150, 100), 1);
  assert.throws(() => corruptionFromDistance(10, 0), RangeError);
  assert.throws(() => terrainCorruptionProfile(-0.1), RangeError);
  assert.throws(() => terrainCorruptionProfile(Number.NaN), RangeError);
});

test('short and long Hunt routes preserve clean arena and fully corrupted lair endpoints', () => {
  for (const count of [3, 4, 10]) {
    const nodes = Array.from({ length: count }, (_, i) => ({
      biome: i === count - 1 ? 'wyrm-lair' : 'mountain-pass',
      distance: i * 24
    }));
    const sample = createHuntRouteMaterialProfile(nodes);
    assert.equal(sample(0).corruption.progress, 0);
    assert.equal(sample(12).corruption.progress, 0.5 / (count - 1));
    assert.equal(sample(nodes.at(-1).distance).corruption.progress, 1);
    assert.equal(sample(nodes.at(-1).distance).biomeBlend, 1);
  }
});

test('biome blends use the local segment and corruption uses total route distance', () => {
  const sample = createHuntRouteMaterialProfile([
    { biome: 'wet-forest', distance: 0 },
    { biome: 'mountain-pass', distance: 20 },
    { biome: 'wyrm-lair', distance: 100 }
  ]);
  const change = sample(10);
  assert.deepEqual([change.fromBiome, change.toBiome, change.biomeBlend], ['wet-forest', 'mountain-pass', 0.5]);
  assert.equal(change.corruption.progress, 0.1);
  assert.equal(sample(1000).corruption.progress, 1);
  assert.throws(() => createHuntRouteMaterialProfile([
    { biome: 'wet-forest', distance: 0 }, { biome: 'wyrm-lair', distance: 0 }
  ]), RangeError);
});
