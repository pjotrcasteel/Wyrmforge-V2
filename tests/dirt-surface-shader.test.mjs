import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const shader = readFileSync(new URL('../src/webgl-voxel-view.mjs', import.meta.url), 'utf8');

test('dirt detail is world anchored on horizontal and vertical exposed faces', () => {
  assert.match(shader, /vec3 soilAlbedo\(vec3 world, vec3 normal\)/);
  assert.match(shader, /world\.xz/);
  assert.match(shader, /world\.zy/);
  assert.match(shader, /world\.xy/);
  assert.match(shader, /albedo = soilAlbedo\(vWorld, vNormal\)/);
});

test('grass sides share soil appearance but preserve a narrow grassy rim', () => {
  assert.match(shader, /vec3 soil = soilAlbedo\(vWorld, vNormal\)/);
  assert.match(shader, /smoothstep\(0\.79, 0\.94, fract\(vWorld\.y\)\)/);
});

test('dirt appearance does not alter the authoritative material IDs or geometry', () => {
  assert.doesNotMatch(shader, /world\.set\(/);
  assert.match(shader, /abs\(vMaterial - 2\.0\) < 0\.5/);
});

test('forest bank weathering is seamless and remains a pure material receiver',()=>{
  assert.match(shader,/vec3 huntWoodlandBankSurface\(vec3 surface,int material\)/);
  assert.match(shader,/uHuntGrassArt/);
  assert.match(shader,/abs\(vNormal\.y\)>\.5/);
  assert.match(shader,/uHuntCorruption\.z>\.25/);
  assert.match(shader,/vWorld\.zy:vWorld\.xy/);
  assert.match(shader,/mix\(bank,moss,coverage\*\(material==2\?\.18:\.26\)\)/);
  assert.match(shader,/float mineralChips=smoothstep/);
  assert.match(shader,/mix\(surface,earth,material==2\?\.54:\.40\)/);
  assert.match(shader,/linearAlbedo=huntWoodlandBankSurface\(linearAlbedo,int\(vMaterial\)\)/);
  assert.doesNotMatch(shader,/materialAtPoint|world\.setMicroSurfaceTile/);
});
