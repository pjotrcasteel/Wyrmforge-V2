import test from 'node:test';
import assert from 'node:assert/strict';
import { CORRUPTION_STOPS, terrainCorruptionProfile, corruptionFromDistance } from '../src/terrain-corruption-profile.mjs';

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
