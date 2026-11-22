import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { terrainPresentationState } from '../src/terrain-presentation-state.mjs';

// This host-level contract complements the actual scene/GPU queue tests.
// In particular, preserve the CPU fallback while browser WebGL has no draws.
const host=readFileSync(new URL('../main.mjs',import.meta.url),'utf8');
const html=readFileSync(new URL('../index.html',import.meta.url),'utf8');

test('the live mobile host only presents a complete, populated GPU terrain scene',()=>{
  assert.match(host,/import \{ terrainPresentationState \} from '\.\/src\/terrain-presentation-state\.mjs'/);
  assert.match(host,/const readyToPresent = terrainPresentationState\(gpuRenderer, world\.chunkCount\) === 'gpu'/);
  assert.match(host,/if \(readyToPresent && gpuRenderer\.render\(\{/);
  assert.match(host,/gpuCanvas\.style\.display = 'block';\s*return;\s*\}\s*gpuCanvas\.style\.display = 'none';/);
  assert.match(host,/gpuCanvas\.style\.display = 'none';\s*ctx\.fillStyle = '#101820'/);
  assert.match(html,/#gpu-view\{position:absolute;inset:0;pointer-events:none/);
});

test('GPU upload faults terminate the broken renderer and keep fallback visible without endless restaging',()=>{
  assert.match(host,/GPU terrain upload failed:/);
  assert.match(host,/gpuRenderer\?\.dispose\(\);\s*gpuRenderer = null;/);
  assert.match(host,/Canvas2D terrain active; Reset retries WebGL2/);
  assert.doesNotMatch(host,/gpuError = error\.message;\s*terrainMeshMode\.value = 'sync';\s*rebuildGpuMeshes\(\)/);
  assert.match(host,/if \(gpuRenderer\) rebuildGpuMeshes\(\);\s*else initializeGpuRenderer\(\)/);
  assert.match(host,/function initializeGpuRenderer\(\)/);
  assert.match(host,/initializeGpuRenderer\(\);\s*resize\(\);\s*requestAnimationFrame\(tick\)/);
});

test('stage and missing geometry are distinct from successful GPU presentation',()=>{
  const idle={ready:true,
    uploadQueueStatistics:{sceneChunks:0,recoveryChunks:0,pendingGpuDisposals:0},
    statistics:{drawCalls:0,triangles:0}};
  assert.equal(terrainPresentationState(idle,4),'missing-geometry');
  assert.equal(terrainPresentationState({
    ...idle,uploadQueueStatistics:{...idle.uploadQueueStatistics,sceneChunks:4}},4),'staging');
  assert.equal(terrainPresentationState({
    ...idle,statistics:{drawCalls:4,triangles:100}},4),'gpu');
  assert.equal(terrainPresentationState({...idle,ready:false},4),'fallback');
});
