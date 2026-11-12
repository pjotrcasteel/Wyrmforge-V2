import test from 'node:test';
import assert from 'node:assert/strict';
import { WebGLVoxelView } from '../src/webgl-voxel-view.mjs';

function fakeCanvas() {
  let clock = 0;
  let deletedBuffers = 0;
  const gl = {
    VERTEX_SHADER:1, FRAGMENT_SHADER:2, COMPILE_STATUS:3, LINK_STATUS:4,
    DEPTH_TEST:5, LEQUAL:6, BLEND:7, CULL_FACE:8, ARRAY_BUFFER:9,
    ELEMENT_ARRAY_BUFFER:10, STATIC_DRAW:11, FLOAT:12, BYTE:13, UNSIGNED_BYTE:14,
    createShader:()=>({}), shaderSource(){}, compileShader(){}, getShaderParameter:()=>true,
    createProgram:()=>({}), attachShader(){}, linkProgram(){}, deleteShader(){},
    getProgramParameter:()=>true, getUniformLocation:()=>({}), enable(){},
    depthFunc(){}, disable(){}, createVertexArray:()=>({}), bindVertexArray(){},
    createBuffer:()=>({}), bindBuffer(){}, bufferData(){ clock++; },
    enableVertexAttribArray(){}, vertexAttribPointer(){}, deleteVertexArray(){},
    deleteBuffer(){ deletedBuffers++; clock++; }, isContextLost:()=>false, deleteProgram(){}
  };
  const listeners = new Map();
  let contextLost = false;
  gl.getExtension = name => name === 'WEBGL_lose_context' && !contextLost ? {
    loseContext: () => { contextLost = true; listeners.get('webglcontextlost')?.({preventDefault(){}}); },
    restoreContext: () => { contextLost = false; listeners.get('webglcontextrestored')?.({preventDefault(){}}); }
  } : null;
  gl.isContextLost = () => contextLost;
  return { canvas:{getContext:()=>gl,addEventListener:(type,fn)=>listeners.set(type,fn)},
    now:()=>clock, deletedBuffers:()=>deletedBuffers,
    emit:(type)=>listeners.get(type)?.({preventDefault(){}}) };
}
function drain(view, now) {
  while (view.pendingUploads) view.flushQueuedUploads({ budgetMs: 2, now });
}
function mesh(id) {
  return { id, origin:[0,0,0], positions:new Float32Array(9),
    normals:new Int8Array(9), materials:new Uint8Array(3),
    indices:new Uint32Array([0,1,2]), triangleCount:1, cpuBufferBytes:60 };
}
test('GPU upload queue drains within bounded per-frame CPU budget', () => {
  const {canvas,now} = fakeCanvas();
  const view = new WebGLVoxelView(canvas);
  view.queueReplacementMeshes(['-1,0,0','0,0,0','1,0,0'],
    [mesh('-1,0,0'),mesh('0,0,0'),mesh('1,0,0')]);
  assert.equal(view.pendingUploads,3);
  assert.equal(view.uploadQueueStatistics.pendingBytes,180);
  const first=view.flushQueuedUploads({budgetMs:2,now});
  assert.equal(first.chunks,1);
  assert.equal(view.pendingUploads,2);
  view.flushQueuedUploads({budgetMs:2,now});
  view.flushQueuedUploads({budgetMs:2,now});
  assert.equal(view.pendingUploads,0);
  assert.equal(view.statistics.drawCalls,3);
  assert.equal(view.uploadQueueStatistics.pendingBytes,0);
  assert.throws(() => view.queueReplacementMeshes(['huge'], [{
    ...mesh('huge'), positions:new Float32Array(5 * 1024 * 1024)
  }]), /byte capacity/);
  view.dispose();
});
test('cancel and full scene replacement invalidate stale pending geometry', () => {
  const {canvas,now}=fakeCanvas();
  const view=new WebGLVoxelView(canvas);
  view.queueReplacementMeshes(['-1,0,0'],[mesh('-1,0,0')]);
  view.cancelQueuedUploads();
  assert.equal(view.flushQueuedUploads({now}).chunks,0);
  assert.equal(view.statistics.drawCalls,0);
  view.queueReplacementMeshes(['0,0,0'],[mesh('0,0,0')]);
  view.setMeshes([mesh('2,0,0')]);
  assert.equal(view.uploadQueueStatistics.sceneChunks,1);
  assert.equal(view.statistics.drawCalls,0);
  drain(view,now);
  assert.equal(view.pendingUploads,0);
  assert.equal(view.statistics.drawCalls,1);
  assert.throws(()=>view.queueReplacementMeshes(Array.from({length:129},(_,i)=>String(i)),[]),RangeError);
  view.dispose();
});

test('context restoration reuploads across frames instead of blocking restore event', () => {
  const {canvas,now,emit}=fakeCanvas();
  const view=new WebGLVoxelView(canvas);
  view.setMeshes([mesh('a'),mesh('b'),mesh('c')]);
  drain(view,now);
  assert.equal(view.statistics.drawCalls,3);
  emit('webglcontextlost');
  assert.equal(view.ready,false);
  emit('webglcontextrestored');
  assert.equal(view.ready,true);
  assert.equal(view.statistics.drawCalls,0);
  assert.equal(view.uploadQueueStatistics.recoveryChunks,3);
  assert.equal(view.flushQueuedUploads({budgetMs:2,now}).chunks,1);
  assert.equal(view.statistics.drawCalls,1);
  assert.equal(view.uploadQueueStatistics.recoveryChunks,2);
  view.replaceMeshes(new Set(['b']),[mesh('b')]);
  assert.equal(view.uploadQueueStatistics.recoveryChunks,2);
  view.flushQueuedUploads({budgetMs:2,now});
  assert.equal(view.statistics.drawCalls,2);
  view.flushQueuedUploads({budgetMs:2,now});
  assert.equal(view.statistics.drawCalls,3);
  assert.equal(view.recovering,false);
  view.dispose();
});
test('reset during context recovery discards old-world uploads', () => {
  const {canvas,now,emit}=fakeCanvas();
  const view=new WebGLVoxelView(canvas);
  view.setMeshes([mesh('old-a'),mesh('old-b')]);
  drain(view,now);
  emit('webglcontextlost');
  emit('webglcontextrestored');
  view.setMeshes([mesh('new')]);
  assert.equal(view.uploadQueueStatistics.recoveryChunks,0);
  assert.equal(view.uploadQueueStatistics.sceneChunks,1);
  assert.equal(view.statistics.drawCalls,0);
  drain(view,now);
  assert.equal(view.pendingUploads,0);
  assert.equal(view.statistics.drawCalls,1);
  view.dispose();
});

test('superseding queued uploads keeps byte accounting bounded and exact', () => {
  const {canvas,now} = fakeCanvas();
  const view = new WebGLVoxelView(canvas);
  const first = mesh('0,0,0');
  view.queueReplacementMeshes(['0,0,0'], [first]);
  assert.equal(view.uploadQueueStatistics.pendingBytes, 60);
  view.queueReplacementMeshes(['0,0,0'], [mesh('0,0,0')]);
  assert.equal(view.pendingUploads, 1);
  assert.equal(view.uploadQueueStatistics.pendingBytes, 60);
  view.queueReplacementMeshes(['0,0,0'], []);
  assert.equal(view.uploadQueueStatistics.pendingBytes, 0);
  view.queueReplacementMeshes(['0,0,0'], [first]);
  assert.equal(view.uploadQueueStatistics.pendingBytes, 60);
  view.flushQueuedUploads({budgetMs:2,now});
  assert.equal(view.uploadQueueStatistics.pendingBytes, 0);
  assert.equal(view.statistics.drawCalls, 1);
  view.dispose();
});

test('browser diagnostic context loss and restore drains retained meshes', () => {
  const {canvas,now} = fakeCanvas();
  const view = new WebGLVoxelView(canvas);
  view.setMeshes([mesh('a'), mesh('b')]);
  drain(view,now);
  assert.equal(view.simulateContextTransition('lose'), true);
  assert.equal(view.ready, false);
  assert.equal(view.statistics.contextLosses, 1);
  assert.equal(view.simulateContextTransition('restore'), true);
  assert.equal(view.ready, true);
  assert.equal(view.uploadQueueStatistics.recoveryChunks, 2);
  while (view.pendingUploads) view.flushQueuedUploads({budgetMs:2,now});
  assert.equal(view.statistics.drawCalls, 2);
  assert.equal(view.uploadQueueStatistics.pendingBytes, 0);
  assert.equal(view.simulateContextTransition('restore'), false);
  view.dispose();
});

test('context loss during queued uploads restores latest authoritative meshes only', () => {
  const {canvas,now} = fakeCanvas();
  const view = new WebGLVoxelView(canvas);
  view.setMeshes([mesh('old-a'), mesh('old-b')]);
  drain(view,now);
  view.queueReplacementMeshes(['old-a'], [mesh('old-a')]);
  view.queueReplacementMeshes(['old-b'], []);
  assert.equal(view.pendingUploads, 2);
  assert.equal(view.simulateContextTransition('lose'), true);
  assert.equal(view.ready, false);
  assert.equal(view.simulateContextTransition('restore'), true);
  // Pending replacements have priority; recovery must never resurrect a deleted mesh.
  while (view.pendingUploads) view.flushQueuedUploads({budgetMs:2,now});
  assert.equal(view.uploadQueueStatistics.pendingBytes, 0);
  assert.equal(view.statistics.drawCalls, 1);
  assert.equal(view.statistics.contextLosses, 1);
  view.dispose();
});

test('scene reset during lost context does not restore old-world meshes', () => {
  const {canvas,now} = fakeCanvas();
  const view = new WebGLVoxelView(canvas);
  view.setMeshes([mesh('old-a'), mesh('old-b')]);
  drain(view,now);
  assert.equal(view.simulateContextTransition('lose'), true);
  view.setMeshes([mesh('new-world')]);
  assert.equal(view.simulateContextTransition('restore'), true);
  while (view.pendingUploads) view.flushQueuedUploads({budgetMs:2,now});
  assert.equal(view.statistics.drawCalls, 1);
  assert.equal(view.uploadQueueStatistics.recoveryChunks, 0);
  view.dispose();
});

test('dirty replacements during context recovery remain frame-budgeted', () => {
  const {canvas,now,emit}=fakeCanvas();
  const view=new WebGLVoxelView(canvas);
  view.setMeshes([mesh('a'),mesh('b'),mesh('c')]);
  drain(view,now);
  emit('webglcontextlost');
  emit('webglcontextrestored');
  assert.equal(view.statistics.drawCalls,0);

  // A new authoritative edit must not bypass the incremental recovery budget.
  view.replaceMeshes(new Set(['b']),[mesh('b')]);
  assert.equal(view.statistics.drawCalls,0);
  assert.equal(view.uploadQueueStatistics.recoveryChunks,3);
  assert.equal(view.uploadQueueStatistics.pendingBytes,180);
  assert.equal(view.flushQueuedUploads({budgetMs:2,now}).chunks,1);
  assert.equal(view.statistics.drawCalls,1);

  // Removing a not-yet-recovered chunk must not resurrect stale geometry.
  view.replaceMeshes(new Set(['c']),[]);
  while (view.pendingUploads) view.flushQueuedUploads({budgetMs:2,now});
  assert.equal(view.statistics.drawCalls,2);
  assert.equal(view.uploadQueueStatistics.pendingBytes,0);
  view.dispose();
});


test('direct authoritative replacement invalidates stale queued uploads without affecting other chunks', () => {
  const {canvas,now} = fakeCanvas();
  const view = new WebGLVoxelView(canvas);
  view.setMeshes([mesh('a'),mesh('b')]);
  drain(view,now);
  view.queueReplacementMeshes(['a','b'],[mesh('a'),mesh('b')]);
  assert.equal(view.uploadQueueStatistics.pendingBytes,120);
  view.replaceMeshes(new Set(['a']),[]);
  assert.equal(view.pendingUploads,1);
  assert.equal(view.uploadQueueStatistics.pendingBytes,60);
  view.replaceMeshes(new Set(['b']),[mesh('b')]);
  assert.equal(view.pendingUploads,0);
  assert.equal(view.uploadQueueStatistics.pendingBytes,0);
  assert.equal(view.flushQueuedUploads({now}).chunks,0);
  assert.equal(view.statistics.drawCalls,1,'removed chunk must not reappear');
  view.dispose();
});

test('full-scene initialization is frame-budgeted and rapid reset never draws stale meshes', () => {
  const {canvas,now} = fakeCanvas();
  const view = new WebGLVoxelView(canvas);
  view.setMeshes([mesh('old-a'),mesh('old-b'),mesh('old-c')]);
  assert.equal(view.statistics.drawCalls,0);
  assert.equal(view.uploadQueueStatistics.sceneChunks,3);
  assert.equal(view.uploadQueueStatistics.pendingBytes,180);
  assert.equal(view.flushQueuedUploads({budgetMs:2,now}).chunks,1);
  assert.equal(view.statistics.drawCalls,1);
  view.setMeshes([mesh('new')]);
  assert.equal(view.statistics.drawCalls,0);
  assert.equal(view.uploadQueueStatistics.sceneChunks,1);
  assert.equal(view.uploadQueueStatistics.pendingBytes,60);
  drain(view,now);
  assert.equal(view.statistics.drawCalls,1);
  assert.equal(view.statistics.triangles,1);
  assert.equal(view.uploadQueueStatistics.pendingBytes,0);
  view.dispose();
});

test('edits supersede incomplete initial scene and context loss replays only latest meshes', () => {
  const {canvas,now,emit} = fakeCanvas();
  const view = new WebGLVoxelView(canvas);
  view.setMeshes([mesh('a'),mesh('b'),mesh('c')]);
  view.replaceMeshes(new Set(['b']),[mesh('b')]);
  view.replaceMeshes(new Set(['c']),[]);
  assert.equal(view.uploadQueueStatistics.sceneChunks,2);
  assert.equal(view.uploadQueueStatistics.pendingBytes,120);
  assert.equal(view.flushQueuedUploads({budgetMs:2,now}).chunks,1);
  emit('webglcontextlost');
  emit('webglcontextrestored');
  assert.equal(view.uploadQueueStatistics.sceneChunks,0);
  assert.equal(view.uploadQueueStatistics.recoveryChunks,2);
  drain(view,now);
  assert.equal(view.statistics.drawCalls,2);
  assert.equal(view.uploadQueueStatistics.pendingBytes,0);
  view.dispose();
});

test('scene reset defers GPU deletes and drains them before uploading the replacement scene', () => {
  const runtime = fakeCanvas();
  const view = new WebGLVoxelView(runtime.canvas);
  view.setMeshes([mesh('old-a'),mesh('old-b')]);
  drain(view,runtime.now);
  assert.equal(runtime.deletedBuffers(),0);

  view.setMeshes([mesh('new')]);
  assert.equal(runtime.deletedBuffers(),0,'reset must not synchronously delete old GPU handles');
  assert.equal(view.statistics.drawCalls,0,'old scene must vanish immediately');
  assert.equal(view.uploadQueueStatistics.pendingGpuDisposals,2);
  assert.equal(view.uploadQueueStatistics.retiredGpuBytesEstimate,120);
  assert.equal(view.statistics.gpuBufferBytesEstimate,120);

  const first=view.flushQueuedUploads({budgetMs:2,now:runtime.now});
  assert.equal(first.chunks,1,'only one retired chunk should be deleted once budget expires');
  assert.equal(runtime.deletedBuffers(),4);
  assert.equal(view.uploadQueueStatistics.pendingGpuDisposals,1);
  assert.equal(view.statistics.drawCalls,0,'new allocations wait for old GPU cleanup');

  drain(view,runtime.now);
  assert.equal(runtime.deletedBuffers(),8);
  assert.equal(view.uploadQueueStatistics.pendingGpuDisposals,0);
  assert.equal(view.statistics.drawCalls,1);
  assert.equal(view.statistics.gpuBufferBytesEstimate,60);
  view.dispose();
});

test('repeated resets and edits cannot allocate ahead of pending retirement', () => {
  const runtime=fakeCanvas();
  const view=new WebGLVoxelView(runtime.canvas);
  view.setMeshes([mesh('old-a'),mesh('old-b'),mesh('old-c')]);
  drain(view,runtime.now);
  view.setMeshes([mesh('intermediate')]);
  view.setMeshes([mesh('latest')]);
  assert.equal(view.uploadQueueStatistics.pendingGpuDisposals,3);
  assert.equal(view.uploadQueueStatistics.sceneChunks,1);
  assert.equal(view.statistics.drawCalls,0);

  view.flushQueuedUploads({budgetMs:2,now:runtime.now});
  assert.equal(view.statistics.drawCalls,0);
  view.replaceMeshes(new Set(['latest']),[]);
  view.replaceMeshes(new Set(['edited']),[mesh('edited')]);
  assert.equal(view.uploadQueueStatistics.sceneChunks,1);
  drain(view,runtime.now);
  assert.equal(view.statistics.drawCalls,1);
  assert.equal(view.uploadQueueStatistics.pendingBytes,0);
  assert.equal(view.uploadQueueStatistics.pendingGpuDisposals,0);
  view.dispose();
});

test('context loss while disposing old scene drops obsolete handles and rebuilds only latest scene', () => {
  const runtime=fakeCanvas();
  const view=new WebGLVoxelView(runtime.canvas);
  view.setMeshes([mesh('a'),mesh('b')]);
  drain(view,runtime.now);
  view.setMeshes([mesh('c')]);
  assert.equal(view.uploadQueueStatistics.pendingGpuDisposals,2);
  runtime.emit('webglcontextlost');
  assert.equal(view.ready,false);
  assert.equal(view.uploadQueueStatistics.pendingGpuDisposals,0);
  assert.equal(view.uploadQueueStatistics.retiredGpuBytesEstimate,0);
  runtime.emit('webglcontextrestored');
  assert.equal(view.uploadQueueStatistics.recoveryChunks,1);
  drain(view,runtime.now);
  assert.equal(view.statistics.drawCalls,1);
  assert.equal(view.statistics.gpuBufferBytesEstimate,60);
  view.dispose();
});

test('terminal dispose synchronously releases both active and queued retired GPU resources', () => {
  const runtime=fakeCanvas();
  const view=new WebGLVoxelView(runtime.canvas);
  view.setMeshes([mesh('a'),mesh('b')]);
  drain(view,runtime.now);
  view.setMeshes([mesh('c')]);
  assert.equal(runtime.deletedBuffers(),0);
  view.dispose();
  assert.equal(runtime.deletedBuffers(),8);
  assert.equal(view.pendingUploads,0);
  assert.equal(view.statistics.gpuBufferBytesEstimate,0);
});
