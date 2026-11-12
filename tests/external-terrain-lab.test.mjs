import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

test('visible V2.6 proof uses real terrain loader, authority, mesher and WebGL renderer',()=>{
  const entry=readFileSync(new URL('../external-terrain-lab.mjs',import.meta.url),'utf8');
  const html=readFileSync(new URL('../external-terrain-lab.html',import.meta.url),'utf8');
  const main=readFileSync(new URL('../index.html',import.meta.url),'utf8');
  assert.match(html,/id="site-view"/);
  assert.match(html,/src="\.\/external-terrain-lab\.mjs"/);
  assert.match(main,/href="\.\/external-terrain-lab\.html"/);
  assert.match(entry,/new V2ExternalTerrainLoader\(createExternalSiteFixture\(/);
  assert.match(entry,/loader\.loadStep\(192\)/);
  assert.match(entry,/active=loader\.terrain/);
  assert.match(entry,/renderer\.setMeshes\(buildExposedFaceMeshes\(active\.world\)\)/);
  assert.match(entry,/const result=active\.port\.apply\(/);
  assert.match(entry,/renderer\.queueReplacementMeshes\(dirty,meshes\)/);
  assert.match(entry,/renderer\.flushQueuedUploads\(\{budgetMs:2\}\)/);
  assert.match(entry,/loader\.unload\(\)/);
  assert.doesNotMatch(entry,/createScene\(|new VoxelWorld\(|carveDemoSphere\(/);
});

test('external proof fixture remains a fixed material input, not the world generator',()=>{
  const fixture=readFileSync(
    new URL('../src/diagnostics/external-site-fixture.mjs',import.meta.url),'utf8');
  assert.match(fixture,/NOT a biome generator/);
  assert.match(fixture,/TERRAIN_INITIALIZATION_SCHEMA/);
  assert.match(fixture,/EXTERNAL_SITE_BREACH/);
  assert.doesNotMatch(fixture,/Math\.random|import .*Wyrmforge/);
});
