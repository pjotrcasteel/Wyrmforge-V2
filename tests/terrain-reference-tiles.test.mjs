import test from 'node:test';
import assert from 'node:assert/strict';
import { createReferenceTerrainPixels, createReferenceMaterialPixels, sealReferenceTileEdges, REFERENCE_TERRAIN_KEYS } from '../src/terrain-reference-tiles.mjs';
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

test('dark variants are independently generated and remain stable', () => {
  const meadow = createReferenceTerrainPixels('grass');
  const meadowDark = createReferenceTerrainPixels('grass-dark');
  const earth = createReferenceTerrainPixels('dirt');
  const earthDark = createReferenceTerrainPixels('dirt-dark');
  assert.notDeepEqual(meadow, meadowDark);
  assert.notDeepEqual(earth, earthDark);
  assert.deepEqual(meadowDark, createReferenceTerrainPixels('grass-dark'));
  assert.deepEqual(earthDark, createReferenceTerrainPixels('dirt-dark'));
  assert.equal(REFERENCE_TERRAIN_KEYS['grass/meadow-dark/albedo'], 'grass-dark');
  assert.equal(REFERENCE_TERRAIN_KEYS['dirt/earth-dark/albedo'], 'dirt-dark');
});

test('every reference variant has tileable, neutral-metalness normal and ORM maps', () => {
  const manifest = compileTerrainTextureManifest();
  for (const [key, kind] of Object.entries(REFERENCE_TERRAIN_KEYS)) {
    for (const channel of ['normal', 'orm']) {
      const mapKey = key.replace(/\/albedo$/, '/' + channel);
      assert.ok(manifest.assets.some(asset => asset.key === mapKey && asset.channel === channel));
      const pixels = createReferenceMaterialPixels(kind, channel);
      assert.equal(pixels.length, 256 * 256 * 4);
      assert.deepEqual(pixels, createReferenceMaterialPixels(kind, channel));
      for (let i = 0; i < pixels.length; i += 4 * 101) {
        assert.equal(pixels[i + 3], 255);
        if (channel === 'orm') {
          assert.equal(pixels[i + 2], 0, 'terrain is nonmetallic');
          assert.ok(pixels[i + 1] > 140, 'terrain remains rough');
        } else {
          assert.ok(pixels[i + 2] >= 128, 'normal points away from tangent plane');
        }
      }
    }
  }
  assert.throws(() => createReferenceMaterialPixels('grass', 'height'), RangeError);
});

test('every 64px reference material and channel has continuous repeated-image borders',()=>{
  for(const kind of Object.values(REFERENCE_TERRAIN_KEYS)) {
    for(const [channel,pixels] of [
      ['albedo',createReferenceTerrainPixels(kind,64)],
      ['normal',createReferenceMaterialPixels(kind,'normal',64)],
      ['orm',createReferenceMaterialPixels(kind,'orm',64)]
    ]) {
      let minimum=255, maximum=0;
      for(let axis=0;axis<64;axis++) {
        for(let color=0;color<3;color++) {
          const left=(axis*64)*4+color;
          const right=(axis*64+63)*4+color;
          const top=axis*4+color;
          const bottom=(63*64+axis)*4+color;
          assert.equal(pixels[left],pixels[right],kind+' '+channel+' horizontal seam');
          assert.equal(pixels[top],pixels[bottom],kind+' '+channel+' vertical seam');
        }
      }
      for(let i=0;i<pixels.length;i+=4) {
        minimum=Math.min(minimum,pixels[i]);
        maximum=Math.max(maximum,pixels[i]);
        assert.equal(pixels[i+3],255,'all reference pixels remain opaque');
      }
      if(channel==='albedo') {
        assert.ok(maximum-minimum>12,kind+' retains actual pixel detail');
      }
    }
  }
});

test('reference tile edge sealing is deterministic, bounded, and rejects malformed RGBA',()=>{
  for(const kind of Object.values(REFERENCE_TERRAIN_KEYS)) {
    const before=createReferenceTerrainPixels(kind,64);
    const copy=before.slice();
    assert.deepEqual(sealReferenceTileEdges(copy,64),before,
      'a second seam stitch must be stable');
  }
  assert.throws(()=>sealReferenceTileEdges(new Uint8Array(64*64*4),64),RangeError);
  assert.throws(()=>sealReferenceTileEdges(new Uint8ClampedArray(63*64*4),64),RangeError);
  assert.throws(()=>sealReferenceTileEdges(new Uint8ClampedArray(64*64*4),80),RangeError);
});
