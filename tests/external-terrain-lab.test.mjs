import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { projectVoxel } from '../src/camera-presets.mjs';

test('visible V2.6 proof uses real terrain loader, authority, mesher and WebGL renderer',()=>{
  const entry=readFileSync(new URL('../external-terrain-lab.mjs',import.meta.url),'utf8');
  const html=readFileSync(new URL('../external-terrain-lab.html',import.meta.url),'utf8');
  const main=readFileSync(new URL('../index.html',import.meta.url),'utf8');
  assert.match(html,/id="site-view"/);
  assert.match(html,/src="\.\/external-terrain-lab\.mjs"/);
  assert.match(main,/href="\.\/external-terrain-lab\.html"/);
  assert.match(entry,/new V2ExternalTerrainLoader\(createExternalSiteFixture\(/);
  assert.match(entry,/loader\.loadStep\(192\)/);
  assert.match(entry,/stageTerrainMeshes\(loader\.terrain,'initial'\)/);
  assert.match(entry,/new V2ExternalTerrainMeshBridge\(\{/);
  assert.match(entry,/renderer\.setMeshes\(meshes\)/);
  assert.doesNotMatch(entry,/renderer\.setMeshes\(buildExposedFaceMeshes\(/);
  assert.match(entry,/const result=active\.port\.apply\(/);
  assert.match(entry,/renderer\.queueReplacementMeshes\(new Set\(dirtyIds\),meshes,/);
  assert.match(entry,/meshBridge\.replace\(active\.world,dirty\)/);
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

test('external site opens with diagonal 3D inspection, while keeping the optional Hunt comparison',()=>{
  const html=readFileSync(new URL('../external-terrain-lab.html',import.meta.url),'utf8');
  const host=readFileSync(new URL('../external-terrain-lab.mjs',import.meta.url),'utf8');
  assert.match(html,/<select id="view-camera"/);
  assert.match(html,/<option value="inspection" selected>3D inspection/);
  assert.match(html,/<option value="hunt">Hunt camera/);
  assert.match(host,/const camera=viewCamera\.value/);
  assert.match(host,/renderer\.render\(\{[\s\S]*?scale,panX:0,panY:0,camera/);
  assert.doesNotMatch(host,/camera:'hunt'/,
    'external proof must not force the nearly top-down Hunt camera');
  assert.doesNotMatch(host,/viewCamera\.addEventListener\('change',resetSite\)/,
    'a camera-only change must not destroy and reload the voxel world');
});

test('diagonal inspection visibly separates a 3D arch underside and side depths',()=>{
  const options={width:390,height:700,scale:11,panX:0,panY:0};
  const floor=projectVoxel(0,1,0,{...options,camera:'inspection'});
  const arch=projectVoxel(0,6,0,{...options,camera:'inspection'});
  const near=projectVoxel(4,1,0,{...options,camera:'inspection'});
  const away=projectVoxel(0,1,4,{...options,camera:'inspection'});
  assert.ok(arch.y<floor.y-50,'six-voxel roof projects well above ground');
  assert.ok(near.x>floor.x && away.x<floor.x,
    'both ground axes are visible in an actual diagonal 3D view');
  assert.notEqual(near.depth,floor.depth,
    'the oblique camera preserves actual depth ordering of geometry');
});

test('external proof builds complete scenes on worker while allowing small-device fallback',()=>{
  const entry=readFileSync(new URL('../external-terrain-lab.mjs',import.meta.url),'utf8');
  assert.match(entry,/new Worker\(new URL\('\.\/src\/terrain-mesh\.worker\.mjs'/);
  assert.match(entry,/pendingMesh=\{terrain,kind,epoch\}/);
  assert.match(entry,/if\(!meshBridge\.status\.busy\)/);
  assert.match(entry,/renderer\.setMeshes\(meshes\)/);
  assert.match(entry,/if\(pendingMesh\) \{/);
  assert.match(entry,/if\(kind==='restore'\) \{/);
  assert.match(entry,/meshBridge\?\.cancel\(\)/);
  assert.match(entry,/meshBridge\?\.close\(\)/);
  assert.match(entry,/if\(terrain\.world\.chunkCount>8\)/,
    'large scenes must not silently fall back to synchronous meshing');
});

test('localized edits stay in the V2 worker queue and block saves until GPU sync',()=>{
  const host=readFileSync(new URL('../external-terrain-lab.mjs',import.meta.url),'utf8');
  assert.match(host,/pendingEdit=\{world:active\.world,epoch,dirty:\[\.\.\.dirty\],\s*rendererSceneEpoch:renderer\.sceneEpoch\}/);
  assert.match(host,/if\(kind==='edit'\) \{/);
  assert.match(host,/if\(!pendingEdit \|\| pendingEdit\.world!==world \|\|/);
  assert.match(host,/renderer\.queueReplacementMeshes\(new Set\(dirtyIds\),meshes,/);
  assert.match(host,/Boolean\(pendingMesh\) \|\| Boolean\(pendingEdit\)/);
  assert.match(host,/meshBridge\?\.cancel\(\);\s*pendingMesh=null;\s*pendingEdit=null/);
  assert.match(host,/if\(typeof Worker!=='function' && active\.world\.chunkCount>8\)/,
    'a large site cannot synchronously rebuild edited terrain');
});

test('external worker completions carry renderer scene identity and context faults stay isolated',()=>{
  const host=readFileSync(new URL('../external-terrain-lab.mjs',import.meta.url),'utf8');
  assert.match(host,/rendererSceneEpoch:renderer\.sceneEpoch/);
  assert.match(host,/\{sceneEpoch:pendingEdit\.rendererSceneEpoch\}/);
  assert.match(host,/rendererErrorMessage=ready \? null/);
  assert.match(host,/errorMessage \?\? rendererErrorMessage/);
  assert.doesNotMatch(host,/errorMessage=ready \? null/,
    'restoring WebGL must not clear a failed worker/replay safety stop');
  assert.match(host,/staleUploadRejections/);
});
