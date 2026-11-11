import test from 'node:test';
import assert from 'node:assert/strict';
import { TERRAIN_MATERIALS, terrainMaterial, terrainMaterialGlsl } from '../src/terrain-materials.mjs';

test('terrain material IDs remain stable for existing saves and meshing', () => {
  assert.deepEqual(TERRAIN_MATERIALS.map(m => [m.id,m.key,m.textureKey]), [
    [1,'grass','terrain/grass'],[2,'dirt','terrain/dirt'],[3,'stone','terrain/stone']
  ]);
  assert.equal(terrainMaterial(0),null);
  assert.equal(terrainMaterial(4),null);
  assert.equal(terrainMaterial(2)?.key,'dirt');
});
test('material shader lookup contains each distinct albedo and unknown fallback', () => {
  const glsl=terrainMaterialGlsl();
  for(const material of TERRAIN_MATERIALS) {
    assert.ok(glsl.includes(material.albedo.map(x=>x.toFixed(2)).join(', ')));
  }
  assert.match(glsl,/return vec3\(1\.0, 0\.0, 1\.0\)/);
});
