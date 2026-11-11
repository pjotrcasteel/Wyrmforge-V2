import test from 'node:test';
import assert from 'node:assert/strict';
import { createReferenceTerrainPixels, REFERENCE_TERRAIN_KEYS } from '../src/terrain-reference-tiles.mjs';
import { compileTerrainTextureManifest } from '../src/terrain-texture-manifest.mjs';

test('all preview tiles match logical albedo keys and manifest dimensions', () => {
  const manifest = compileTerrainTextureManifest();
  for (const [key, kind] of Object.entries(REFERENCE_TERRAIN_KEYS)) {
    assert.ok(manifest.assets.some(asset => asset.channel === 'albedo' && asset.key === key));
    const pixels = createReferenceTerrainPixels(kind);
    assert.equal(pixels.length, 256 * 256 * 4);
    assert.equal(pixels[3], 255);
    assert.equal(pixels[pixels.length - 1], 255);
  }
});

test('reference terrain is deterministic and distinct per material', () => {
  const grass = createReferenceTerrainPixels('grass');
  const repeat = createReferenceTerrainPixels('grass');
  const stone = createReferenceTerrainPixels('stone');
  assert.deepEqual(grass, repeat);
  assert.notDeepEqual(grass, stone);
  assert.throws(() => createReferenceTerrainPixels('unknown'), RangeError);
});

test('generated texture contains spatial detail rather than a flat color', () => {
  for (const kind of Object.values(REFERENCE_TERRAIN_KEYS)) {
    const pixels = createReferenceTerrainPixels(kind);
    const samples = new Set();
    for (let i = 0; i < pixels.length; i += 4 * 97) samples.add(pixels[i]);
    assert.ok(samples.size > 10, kind + ' lacks texture detail');
  }
});
