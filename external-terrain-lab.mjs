// V2.6 end-to-end diagnostic host. It is a separate page, not World Generation V2.
// Input -> bounded V2 initializer -> authoritative world/port -> existing
// exposed-face mesher -> existing WebGL2 renderer and queued edit uploads.
import { VERSION, COMMIT } from './src/build-info.mjs';
import { V2ExternalTerrainLoader } from './src/external-terrain-loader.mjs';
import {
  createExternalSiteFixture, EXTERNAL_SITE_BREACH
} from './src/diagnostics/external-site-fixture.mjs';
import { buildExposedFaceMeshes } from './src/exposed-face-mesher.mjs';
import { WebGLVoxelView } from './src/webgl-voxel-view.mjs';

const canvas=document.querySelector('#site-view');
const status=document.querySelector('#status');
const pitch=document.querySelector('#chunk-edge');
const viewCamera=document.querySelector('#view-camera');
const resetButton=document.querySelector('#reset-site');
const breachButton=document.querySelector('#breach-site');
document.querySelector('#build').textContent='v'+VERSION+' · '+COMMIT.slice(0,7);

let loader=null;
let active=null;
let breachCount=0;
let lastImpactRemoved=0;
let lastStatusAt=-Infinity;
let errorMessage=null;
let renderer=null;

function resizeCanvas() {
  const pixelRatio=Math.min(window.devicePixelRatio || 1,2);
  const width=Math.max(1,Math.round(canvas.clientWidth*pixelRatio));
  const height=Math.max(1,Math.round(canvas.clientHeight*pixelRatio));
  if(canvas.width!==width || canvas.height!==height) {
    canvas.width=width;
    canvas.height=height;
  }
}

function updateStatus(now=performance.now()) {
  if(now-lastStatusAt<200 && !errorMessage) return;
  lastStatusAt=now;
  if(errorMessage) {
    status.textContent='V2.6 error: '+errorMessage;
    return;
  }
  if(!loader) return;
  const progress=loader.progress;
  const queue=renderer?.uploadQueueStatistics;
  const loaded=active?.world;
  status.textContent=progress.done
    ? '3D site '+active.source.siteId+' · '+loaded.chunkCount+
      ' chunks · '+loaded.revision+' authoritative revisions · '+
      renderer.pendingUploads+' GPU operations remaining'+
      ' · '+(viewCamera.value==='inspection' ? '3D inspection' : 'Hunt camera')+
      (breachCount ? ' · '+breachCount+' span impacts'+
        ' · last removed '+lastImpactRemoved+' voxels' : '')
    : 'Loading '+progress.siteId+' · '+progress.loadedCells+
      '/'+progress.totalCells+' voxels · staged (not yet rendered)';
}

function resetSite() {
  try {
    errorMessage=null;
    breachCount=0;
    lastImpactRemoved=0;
    breachButton.disabled=true;
    // Tear down the previous authority before a new one becomes public.
    // Renderer removes stale scene data and retires GPU records per frame.
    if(loader) loader.unload();
    active=null;
    renderer.setMeshes([]);
    loader=new V2ExternalTerrainLoader(createExternalSiteFixture({
      chunkEdge:Number(pitch.value),seed:7
    }));
    lastStatusAt=-Infinity;
    updateStatus();
  } catch(error) {
    errorMessage=error.message;
    breachButton.disabled=true;
    updateStatus();
  }
}

function impactSpan() {
  if(!active || !renderer.ready || renderer.pendingUploads) return;
  try {
    const result=active.port.apply({
      id:'v26-site-breach-'+(++breachCount),
      type:'carve-sphere',...EXTERNAL_SITE_BREACH,
      expectedRevision:active.world.revision
    });
    lastImpactRemoved=result.removedVoxels;
    const dirty=new Set(result.dirtyChunks);
    if(dirty.size) {
      // Only changed chunk meshes are recreated, never the entire scene.
      const meshes=buildExposedFaceMeshes(active.world,{chunkIds:dirty});
      renderer.queueReplacementMeshes(dirty,meshes);
      breachButton.disabled=true;
    }
    lastStatusAt=-Infinity;
    updateStatus();
  } catch(error) {
    errorMessage=error.message;
    updateStatus();
  }
}

function frame(now) {
  try {
    if(loader && !loader.progress.done) {
      loader.loadStep(192); // bounded cells per animation frame, not CPU milliseconds
      if(loader.progress.done) {
        active=loader.terrain;
        // This is the real V2 renderer, not a separate 2D approximation.
        renderer.setMeshes(buildExposedFaceMeshes(active.world));
      }
    }
    if(renderer?.pendingUploads) renderer.flushQueuedUploads({budgetMs:2});
    resizeCanvas();
    if(renderer?.ready) {
      // The hunt preset looks almost top-down on a small, low-profile fixture.
      // Default to the already-tested diagonal inspection basis so the actual
      // underside, stone walls and vertical height are legible on mobile.
      // This is presentation-only: switching views never remeshes terrain.
      const camera=viewCamera.value;
      const scale=Math.max(9,Math.min(20,
        canvas.width/(camera==='inspection' ? 37 : 34)));
      renderer.render({
        width:canvas.width,height:canvas.height,
        scale,panX:0,panY:0,camera
      });
    }
    breachButton.disabled=!active || !renderer?.ready || renderer.pendingUploads ||
      Boolean(errorMessage);
    updateStatus(now);
  } catch(error) {
    errorMessage=error.message;
    breachButton.disabled=true;
    updateStatus(now);
  }
  requestAnimationFrame(frame);
}

resetButton.addEventListener('click',resetSite);
pitch.addEventListener('change',resetSite);
viewCamera.addEventListener('change',()=>{
  lastStatusAt=-Infinity;
  updateStatus();
});
breachButton.addEventListener('click',impactSpan);
window.addEventListener('pagehide',()=>{
  loader?.unload();
  renderer?.dispose();
});
try {
  renderer=new WebGLVoxelView(canvas,{
    onAvailabilityChange(ready,error) {
      errorMessage=ready ? null : (error?.message ?? 'WebGL context lost');
      lastStatusAt=-Infinity;
      updateStatus();
    }
  });
  resetSite();
  requestAnimationFrame(frame);
} catch(error) {
  errorMessage=error.message;
  updateStatus();
  resetButton.disabled=true;
  pitch.disabled=true;
}
