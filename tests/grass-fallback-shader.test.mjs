import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const source = readFileSync(new URL('../src/webgl-voxel-view.mjs', import.meta.url), 'utf8');

test('grass fallback uses stable world-space sampling and subtle variation', () => {
  assert.match(source, /vec3 grassAlbedo\(vec3 world\)/);
  assert.match(source, /floor\(world\.xz \* 7\.0\)/);
  assert.match(source, /floor\(world\.xz \* 23\.0\)/);
  assert.match(source, /coarse \* 0\.10 \+ fine \* 0\.045/);
});

test('authored grass texture overrides fallback without changing dirt rendering', () => {
  assert.match(source, /albedo = grassAlbedo\(vWorld\);\s*if \(uGrassEnabled\)/);
  assert.match(source, /albedo = texture\(uGrassTexture, uv\)\.rgb/);
  assert.match(source, /albedo = soilAlbedo\(vWorld, vNormal\)/);
});
