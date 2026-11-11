import test from 'node:test';
import assert from 'node:assert/strict';
import { terrainSurfaceKey } from '../src/terrain-materials.mjs';
import { MATERIAL_LIGHTING_CONTRACT_VERSION, V2_SURFACES, ORM_CHANNELS,
  getV2Surface, createLightingFrame } from '../src/material-lighting-contract.mjs';

test('every exposed terrain face has a lighting-ready surface descriptor', () => {
  for (const id of [1, 2, 3]) {
    for (const normalY of [-1, 0, 1]) {
      const key = terrainSurfaceKey(id, normalY);
      const material = getV2Surface(key);
      assert.ok(material, key);
      assert.equal(material.key, key);
      assert.equal(material.metallic, 0);
      assert.ok(material.roughness > 0 && material.roughness <= 1);
      assert.equal(material.baseColor.length, 3);
      assert.ok(material.textures.albedo);
    }
  }
  assert.equal(getV2Surface('terrain/unknown'), null);
  assert.equal(Object.keys(V2_SURFACES).length, 4);
});

test('ORM packing follows linear ambient-occlusion/roughness/metallic convention', () => {
  assert.deepEqual(ORM_CHANNELS, { ambientOcclusion: 'r', roughness: 'g', metallic: 'b' });
});

test('lighting frame is versioned and snapshots input arrays without mutating them', () => {
  const ambient = [0.2, 0.3, 0.4];
  const localLights = [{ intensity: 2, radius: 5 }];
  const frame = createLightingFrame({ ambient, localLights });
  ambient[0] = 1;
  localLights[0].intensity = 8;
  assert.equal(frame.version, MATERIAL_LIGHTING_CONTRACT_VERSION);
  assert.deepEqual(frame.ambient, [0.2, 0.3, 0.4]);
  assert.equal(frame.localLights[0].intensity, 2);
  assert.ok(Object.isFrozen(frame));
  assert.ok(Object.isFrozen(frame.localLights[0]));
  assert.throws(() => createLightingFrame({ ambient: [-1, 0, 0] }), TypeError);
});
