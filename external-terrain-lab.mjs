// V2.6 end-to-end diagnostic host. It is a separate page, not World Generation V2.
// Input -> bounded V2 initializer -> authoritative world/port -> existing
// exposed-face mesher -> existing WebGL2 renderer and queued edit uploads.
import { VERSION, COMMIT } from './src/build-info.mjs';
import { V2ExternalTerrainLoader } from './src/external-terrain-loader.mjs';
import {
  createExternalTerrainCheckpoint, V2ExternalTerrainReplaySession
} from './src/external-terrain-checkpoint.mjs';
import {
  createExternalSiteFixture, EXTERNAL_SITE_BREACH
} from './src/diagnostics/external-site-fixture.mjs';
import { buildExposedFaceMeshes } from './src/exposed-face-mesher.mjs';
import { WebGLVoxelView } from './src/webgl-voxel-view.mjs';
import { V2ExternalTerrainMeshBridge } from './src/external-terrain-mesh-bridge.mjs';

const canvas=document.querySelector('#site-view');
const status=document.querySelector('#status');
const pitch=document.querySelector('#chunk-edge');
const viewCamera=document.querySelector('#view-camera');
const resetButton=document.querySelector('#reset-site');
const breachButton=document.querySelector('#breach-site');
const saveButton=document.querySelector('#save-site');
const restoreButton=document.querySelector('#restore-site');
document.querySelector('#build').textContent='v'+VERSION+' · '+COMMIT.slice(0,7);

let loader=null;
let restoredSession=null;
let restoring=null;
let savedCheckpoint=null;
let active=null;
let breachCount=0;
let lastImpactRemoved=0;
let lastStatusAt=-Infinity;
let errorMessage=null;
let renderer=null;
let meshBridge=null;
let pendingMesh=null;
let meshSource='worker';

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
  if(pendingMesh) {
    const progress=meshBridge.status;
    status.textContent='V2.7 worker meshing · '+progress.completedChunks+
      '/'+progress.totalChunks+' chunks · '+pendingMesh.kind+
      ' · original scene remains visible until ready';
    return;
  }
  if(restoring) {
    const progress=restoring.progress;
    status.textContent='Restoring verified V2 terrain · '+
      progress.loadedCells+'/'+progress.totalCells+' cells · '+
      progress.appliedEdits+'/'+progress.totalEdits+' replayed edits';
    return;
  }
  if(!loader && !restoredSession) return;
  const progress=loader?.progress ?? restoredSession.progress;
  const loaded=active?.world;
  status.textContent=progress.done
    ? '3D site '+active.source.siteId+' · '+loaded.chunkCount+
      ' chunks · '+loaded.revision+' authoritative revisions · '+
      renderer.pendingUploads+' GPU operations remaining'+
      ' · '+(viewCamera.value==='inspection' ? '3D inspection' : 'Hunt camera')+
      (breachCount ? ' · '+breachCount+' span impacts'+
        ' · last removed '+lastImpactRemoved+' voxels' : '')+
      (savedCheckpoint ? ' · saved state available' : '')+
      ' · mesh source: '+meshSource
    : 'Loading '+progress.siteId+' · '+progress.loadedCells+
      '/'+progress.totalCells+' voxels · staged (not yet rendered)';
}

function resetSite() {
  try {
    errorMessage=null;
    breachCount=0;
    lastImpactRemoved=0;
    breachButton.disabled=true;
    saveButton.disabled=true;
    restoreButton.disabled=true;
    meshBridge?.cancel();
    pendingMesh=null;
    restoring?.unload();
    restoring=null;
    restoredSession?.unload();
    restoredSession=null;
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
  if(!active || restoring || !renderer.ready || renderer.pendingUploads) return;
  try {
    const result=active.port.apply({
      id:'v26-site-breach-'+(++breachCount),
      type:'carve-sphere',...EXTERNAL_SITE_BREACH,
      expectedRevision:active.world.revision
    });
    lastImpactRemoved=result.removedVoxels;
    const dirty=new Set(result.dirtyChunks);
    if(dirty.size) {
      // Small localized edits remain on the existing current meshing path.
      // Full import/replay geometry never runs synchronously in this host.
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

function saveState() {
  if(!active || restoring || renderer.pendingUploads) return;
  try {
    const checkpoint=restoredSession
      ? restoredSession.saveCheckpoint()
      : createExternalTerrainCheckpoint(loader);
    // Prove the checkpoint survives the JSON boundary used by real saves.
    savedCheckpoint=JSON.parse(JSON.stringify(checkpoint));
    errorMessage=null;
    lastStatusAt=-Infinity;
    updateStatus();
  } catch(error) {
    errorMessage=error.message;
    updateStatus();
  }
}

function restoreState() {
  if(!active || !savedCheckpoint || restoring || renderer.pendingUploads) return;
  try {
    // Keep the active world visible until the new source + journal is verified.
    restoring=new V2ExternalTerrainReplaySession(savedCheckpoint);
    errorMessage=null;
    lastStatusAt=-Infinity;
    updateStatus();
  } catch(error) {
    errorMessage=error.message;
    updateStatus();
  }
}

function showMeshedTerrain(terrain,kind,epoch,meshes,source='worker') {
  if(!pendingMesh || pendingMesh.terrain!==terrain ||
      pendingMesh.epoch!==epoch) return;
  // Only a complete revision-consistent mesh from this world can replace
  // the active GPU scene. No old voxel world is unloaded before this point.
  renderer.setMeshes(meshes);
  if(kind==='restore') {
    loader?.unload();
    restoredSession?.unload();
    loader=null;
    restoredSession=restoring;
    restoring=null;
    breachCount=savedCheckpoint.journal.commands.length;
    lastImpactRemoved=0;
  }
  active=terrain;
  pendingMesh=null;
  meshSource=source;
  lastStatusAt=-Infinity;
}

function stageTerrainMeshes(terrain,kind) {
  if(pendingMesh) throw new Error('An external terrain mesh build is already pending');
  if(typeof Worker!=='function') {
    // Explicit bounded compatibility path for the eight-chunk lab fixture.
    // Larger future sites cannot silently fall back to blocking the UI.
    if(terrain.world.chunkCount>8) throw new Error('Web Worker required for large sites');
    pendingMesh={terrain,kind,epoch:-1};
    const meshes=buildExposedFaceMeshes(terrain.world);
    showMeshedTerrain(terrain,kind,-1,meshes,'small-site sync fallback');
    return;
  }
  // The worker bridge takes bounded 4-chunk batches, independently of
  // initial terrain construction and replay verification.
  const epoch=meshBridge.begin(terrain.world);
  if(!meshBridge.status.busy) {
    throw new Error('External terrain worker could not start');
  }
  pendingMesh={terrain,kind,epoch};
  lastStatusAt=-Infinity;
}

function frame(now) {
  try {
    if(restoring && !pendingMesh) {
      if(!restoring.progress.done) restoring.step({maxCells:192,maxEdits:1});
      if(restoring.progress.done) {
        // Keep the previous world visible until *both* replay and worker
        // geometry complete; GPU uploads stay frame-budgeted as before.
        stageTerrainMeshes(restoring.terrain,'restore');
      }
    }
    if(loader && !loader.progress.done) {
      loader.loadStep(192); // bounded cells per animation frame, not CPU milliseconds
      if(loader.progress.done) {
        stageTerrainMeshes(loader.terrain,'initial');
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
    const blocked=!active || !renderer?.ready || renderer.pendingUploads ||
      Boolean(errorMessage) || Boolean(restoring) || Boolean(pendingMesh);
    breachButton.disabled=blocked;
    saveButton.disabled=blocked;
    restoreButton.disabled=blocked || !savedCheckpoint;
    updateStatus(now);
  } catch(error) {
    meshBridge?.cancel();
    pendingMesh=null;
    restoring?.unload();
    restoring=null;
    errorMessage=error.message;
    breachButton.disabled=true;
    saveButton.disabled=true;
    restoreButton.disabled=true;
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
saveButton.addEventListener('click',saveState);
restoreButton.addEventListener('click',restoreState);
window.addEventListener('pagehide',()=>{
  meshBridge?.close();
  restoring?.unload();
  restoredSession?.unload();
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
  meshBridge=new V2ExternalTerrainMeshBridge({
    createWorker:()=>new Worker(new URL('./src/terrain-mesh.worker.mjs',import.meta.url),
      {type:'module'}),
    now:()=>performance.now(),
    onReady:(world,meshes,epoch)=>{
      if(!pendingMesh || pendingMesh.terrain.world!==world ||
          pendingMesh.epoch!==epoch) return;
      try {
        showMeshedTerrain(pendingMesh.terrain,pendingMesh.kind,epoch,meshes);
      } catch(error) {
        pendingMesh=null;
        restoring?.unload();
        restoring=null;
        errorMessage=error.message;
        lastStatusAt=-Infinity;
      }
    },
    onFailure:message=>{
      pendingMesh=null;
      // Never retry a failed restore every animation frame or leave an
      // unverified temporary world allocated behind the existing scene.
      restoring?.unload();
      restoring=null;
      errorMessage='External mesh worker: '+message;
      lastStatusAt=-Infinity;
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
