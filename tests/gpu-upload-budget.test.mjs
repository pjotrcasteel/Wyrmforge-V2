import test from 'node:test';
import assert from 'node:assert/strict';
import { WebGLVoxelView } from '../src/webgl-voxel-view.mjs';

function fakeCanvas() {
  let clock = 0;
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
    deleteBuffer(){}, isContextLost:()=>false, deleteProgram(){}
  };
  return { canvas:{getContext:()=>gl,addEventListener(){}}, now:()=>clock };
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
  assert.equal(view.pendingUploads,0);
  assert.equal(view.statistics.drawCalls,1);
  assert.throws(()=>view.queueReplacementMeshes(Array.from({length:129},(_,i)=>String(i)),[]),RangeError);
  view.dispose();
});
