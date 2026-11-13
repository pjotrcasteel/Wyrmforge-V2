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
import { V2TerrainEpochClock } from './src/terrain-world-epoch.mjs';
import { createWorldSiteRecipe } from './src/world-generation/site-recipe.mjs';
import { generateWorldSite } from './src/world-generation/index.mjs';
import {
  fitWorldgenSiteView, clampWorldgenViewZoom
} from './src/diagnostics/worldgen-viewport.mjs';

const canvas=document.querySelector('#site-view');
const status=document.querySelector('#status');
const pitch=document.querySelector('#chunk-edge');
const siteKind=document.querySelector('#site-kind');
const siteSeed=document.querySelector('#site-seed');
const viewCamera=document.querySelector('#view-camera');
const resetButton=document.querySelector('#reset-site');
const breachButton=document.querySelector('#breach-site');
const saveButton=document.querySelector('#save-site');
const restoreButton=document.querySelector('#restore-site');
const previewMessage=document.querySelector('#preview-message');
const siteSummary=document.querySelector('#site-summary');
const controls=document.querySelector('#controls');
const focusButton=document.querySelector('#focus-view');
const fitButton=document.querySelector('#fit-view');
const zoomInButton=document.querySelector('#zoom-in');
const zoomOutButton=document.querySelector('#zoom-out');
document.querySelector('#build').textContent='v'+VERSION+' · '+COMMIT.slice(0,7);

const terrainEpochs=new V2TerrainEpochClock();
let loader=null;
let restoredSession=null;
let restoring=null;
let savedCheckpoint=null;
let active=null;
let breachCount=0;
let lastImpactRemoved=0;
let lastStatusAt=-Infinity;
let errorMessage=null;
let rendererErrorMessage=null;
let renderer=null;
let meshBridge=null;
let pendingMesh=null;
let pendingEdit=null;
let meshSource='worker';
let generatedSite=null;

// Viewer-only navigation. Positions are CSS pixels so DPR changes do not
// change the user's pan; neither controls nor camera touch the voxel world.
let viewZoom=1;
let viewPanX=0;
let viewPanY=0;
const activePointers=new Map();

function resetPreviewView() {
  viewZoom=1;
  viewPanX=0;
  viewPanY=0;
}

function updateSiteSummary() {
  const selected=siteKind.selectedOptions[0]?.textContent ?? siteKind.value;
  siteSummary.textContent=selected.split(' — ')[0]+
    (siteKind.value==='fixture' ? ' · diagnostic' : ' · seed '+siteSeed.value);
}

function setPreviewStatus(message,brief) {
  status.textContent=message;
  previewMessage.textContent=brief;
}

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
  const displayedError=errorMessage ?? rendererErrorMessage;
  if(displayedError) {
    setPreviewStatus('V2.6 error: '+displayedError,'Error: '+displayedError);
    return;
  }
  if(pendingEdit) {
    const progress=meshBridge.status;
    setPreviewStatus('V2.7 localized worker edit · '+
      progress.completedChunks+'/'+progress.totalChunks+
      ' dirty chunks · '+lastImpactRemoved+' voxels removed',
      'Updating '+progress.completedChunks+'/'+progress.totalChunks+
      ' chunks · '+lastImpactRemoved+' voxels removed');
    return;
  }
  if(pendingMesh) {
    const progress=meshBridge.status;
    setPreviewStatus('V2.7 worker meshing · '+progress.completedChunks+
      '/'+progress.totalChunks+' chunks · '+pendingMesh.kind+
      ' · original scene remains visible until ready',
      'Preparing 3D scene · '+progress.completedChunks+'/'+progress.totalChunks+' chunks');
    return;
  }
  if(restoring) {
    const progress=restoring.progress;
    setPreviewStatus('Restoring verified V2 terrain · '+
      progress.loadedCells+'/'+progress.totalCells+' cells · '+
      progress.appliedEdits+'/'+progress.totalEdits+' replayed edits',
      'Restoring terrain · '+progress.loadedCells+'/'+progress.totalCells+' cells');
    return;
  }
  if(!loader && !restoredSession) return;
  const progress=loader?.progress ?? restoredSession.progress;
  const loaded=active?.world;
  status.textContent=progress.done
    ? '3D site '+active.source.siteId+' · '+loaded.chunkCount+
      ' chunks · '+loaded.revision+' authoritative revisions · '+
      'runtime epoch '+active.port.epoch+' · '+
      'renderer scene '+renderer.sceneEpoch+' · '+
      renderer.pendingUploads+' GPU operations remaining'+
      ' · '+(viewCamera.value==='inspection' ? '3D inspection' : 'Hunt camera')+
      (breachCount ? ' · '+breachCount+' span impacts'+
        ' · last removed '+lastImpactRemoved+' voxels' : '')+
      (savedCheckpoint ? ' · saved state available' : '')+
      ' · stale GPU replies blocked: '+renderer.uploadQueueStatistics.staleUploadRejections+
      ' · mesh source: '+meshSource+
      (generatedSite ? ' · WorldGen '+generatedSite.recipe.kind+
        ' · plan '+generatedSite.hash : '')
    : 'Loading '+progress.siteId+' · '+progress.loadedCells+
      '/'+progress.totalCells+' voxels · staged (not yet rendered)';
  previewMessage.textContent=progress.done
    ? (generatedSite ? generatedSite.recipe.kind : 'Fixed voxel fixture')+
      ' · '+loaded.chunkCount+' chunks · '+renderer.pendingUploads+' GPU jobs'
    : 'Loading '+Math.round(100*progress.loadedCells/Math.max(1,progress.totalCells))+
      '% of terrain · '+progress.loadedCells+'/'+progress.totalCells+' cells';
}

function resetSite() {
  try {
    updateSiteSummary();
    errorMessage=null;
    breachCount=0;
    lastImpactRemoved=0;
    breachButton.disabled=true;
    saveButton.disabled=true;
    restoreButton.disabled=true;
    meshBridge?.cancel();
    pendingMesh=null;
    pendingEdit=null;
    restoring?.unload();
    restoring=null;
    restoredSession?.unload();
    restoredSession=null;
    // Tear down the previous authority before a new one becomes public.
    // Renderer removes stale scene data and retires GPU records per frame.
    if(loader) loader.unload();
    active=null;
    renderer.setMeshes([]);
    generatedSite=null;
    if(siteKind.value==='fixture') {
      loader=new V2ExternalTerrainLoader(createExternalSiteFixture({
        chunkEdge:Number(pitch.value),seed:7
      }),{epoch:terrainEpochs.next()});
    } else {
      // The World Generation engine knows only site recipes and the public
      // terrain initialization contract; this host owns the adapter lifecycle.
      const recipe=createWorldSiteRecipe({
        regionId:'starter-region',siteId:'preview-'+siteKind.value,
        encounterId:'preview-001',kind:siteKind.value,
        seed:Number(siteSeed.value),worldRevision:0,
        chunkEdge:Number(pitch.value),corruption:0
      });
      generatedSite=generateWorldSite(recipe);
      loader=new V2ExternalTerrainLoader(generatedSite.definition,
        {epoch:terrainEpochs.next()});
    }
    breachButton.textContent=generatedSite ? 'Carve generated terrain' : 'Break stone span';
    lastStatusAt=-Infinity;
    updateStatus();
  } catch(error) {
    errorMessage=error.message;
    breachButton.disabled=true;
    updateStatus();
  }
}

function impactSpan() {
  if(!active || restoring || pendingMesh || pendingEdit || errorMessage ||
      !renderer.ready || renderer.pendingUploads) return;
  if(typeof Worker!=='function' && active.world.chunkCount>8) {
    errorMessage='Web Worker is required to edit larger external terrain';
    lastStatusAt=-Infinity;
    updateStatus();
    return;
  }
  try {
    let target=EXTERNAL_SITE_BREACH;
    if(generatedSite) {
      const spot=generatedSite.layout.clearings[0];
      let top=null;
      for(let y=30;y>=-3;y--) {
        if(active.world.get(spot.x,y,spot.z)!==0) {top=y;break;}
      }
      if(top===null) throw new Error('Generated landmark has no terrain surface');
      target={x:spot.x,y:top,z:spot.z,radius:2.3};
    }
    const result=active.port.apply({
      id:'v26-site-breach-'+(++breachCount),
      type:'carve-sphere',...target,
      expectedRevision:active.world.revision
    });
    lastImpactRemoved=result.removedVoxels;
    const dirty=new Set(result.dirtyChunks);
    if(dirty.size) {
      if(typeof Worker==='function') {
        // Authoritative edits are immediately visible to queries; derived
        // GPU meshes now use the existing bounded worker path.
        const epoch=meshBridge.replace(active.world,dirty);
        if(!meshBridge.status.busy) {
          throw new Error('Localized V2 mesh worker did not start');
        }
        pendingEdit={world:active.world,epoch,dirty:[...dirty],
          rendererSceneEpoch:renderer.sceneEpoch};
      } else {
        // Only the existing tiny-site compatibility exception remains.
        const meshes=buildExposedFaceMeshes(active.world,{chunkIds:dirty});
        renderer.queueReplacementMeshes(dirty,meshes,
          {sceneEpoch:renderer.sceneEpoch});
        meshSource='small-site sync compatibility';
      }
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
  if(!active || restoring || pendingEdit || renderer.pendingUploads) return;
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
  if(!active || !savedCheckpoint || restoring || pendingEdit || renderer.pendingUploads) return;
  try {
    // Keep the active world visible until the new source + journal is verified.
    restoring=new V2ExternalTerrainReplaySession(savedCheckpoint,
      {epoch:terrainEpochs.next()});
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
    if (!document.hidden) meshBridge?.pollTimeout();
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
      const pixelRatio=canvas.width/Math.max(1,canvas.clientWidth);
      const fit=generatedSite
        ? fitWorldgenSiteView({
          width:canvas.width,height:canvas.height,
          footprint:generatedSite.layout.footprint,camera
        })
        : null;
      const scale=fit
        ? fit.scale*viewZoom
        : Math.max(9,Math.min(20,
          canvas.width/(camera==='inspection' ? 37 : 34)))*viewZoom;
      const panX=(fit?.panX ?? 0)*viewZoom+viewPanX*pixelRatio;
      const panY=(fit?.panY ?? 0)*viewZoom+viewPanY*pixelRatio;
      renderer.render({
        width:canvas.width,height:canvas.height,
        scale,panX,panY,camera
      });
    }
    const blocked=!active || !renderer?.ready || renderer.pendingUploads ||
      Boolean(errorMessage) || Boolean(rendererErrorMessage) || Boolean(restoring) ||
      Boolean(pendingMesh) || Boolean(pendingEdit);
    breachButton.disabled=blocked;
    saveButton.disabled=blocked;
    restoreButton.disabled=blocked || !savedCheckpoint;
    updateStatus(now);
  } catch(error) {
    meshBridge?.cancel();
    pendingMesh=null;
    pendingEdit=null;
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

resetButton.addEventListener('click',()=>{
  resetPreviewView();
  controls.open=false;
  resetSite();
});
pitch.addEventListener('change',()=>{
  resetPreviewView();
  controls.open=false;
  resetSite();
});
siteKind.addEventListener('change',()=>{
  resetPreviewView();
  controls.open=false;
  resetSite();
});
siteSeed.addEventListener('change',()=>{
  resetPreviewView();
  controls.open=false;
  resetSite();
});
viewCamera.addEventListener('change',()=>{
  resetPreviewView();
  controls.open=false;
  lastStatusAt=-Infinity;
  updateStatus();
});
fitButton.addEventListener('click',resetPreviewView);
zoomInButton.addEventListener('click',()=>{
  viewZoom=clampWorldgenViewZoom(viewZoom*1.25);
});
zoomOutButton.addEventListener('click',()=>{
  viewZoom=clampWorldgenViewZoom(viewZoom/1.25);
});
focusButton.addEventListener('click',()=>{
  const focused=document.body.classList.toggle('focus-mode');
  focusButton.textContent=focused?'Exit focus':'Focus';
  focusButton.setAttribute('aria-pressed',String(focused));
  controls.open=false;
});

// Two-pointer pinch and single-pointer pan are viewer interactions only.
// Touch-action:none prevents page scrolling while inspecting a generated map.
canvas.addEventListener('pointerdown',event=>{
  if(event.pointerType==='mouse' && event.button!==0) return;
  canvas.setPointerCapture?.(event.pointerId);
  activePointers.set(event.pointerId,{x:event.clientX,y:event.clientY});
});
canvas.addEventListener('pointermove',event=>{
  if(!activePointers.has(event.pointerId)) return;
  const before=[...activePointers.values()];
  activePointers.set(event.pointerId,{x:event.clientX,y:event.clientY});
  const after=[...activePointers.values()];
  if(before.length===1) {
    viewPanX+=after[0].x-before[0].x;
    viewPanY+=after[0].y-before[0].y;
  } else if(before.length>=2) {
    const distance=points=>Math.hypot(points[0].x-points[1].x,
      points[0].y-points[1].y);
    const prior=distance(before);
    if(prior>1) viewZoom=clampWorldgenViewZoom(viewZoom*distance(after)/prior);
    viewPanX+=((after[0].x+after[1].x)-(before[0].x+before[1].x))/2;
    viewPanY+=((after[0].y+after[1].y)-(before[0].y+before[1].y))/2;
  }
  event.preventDefault();
});
function releasePointer(event) {
  activePointers.delete(event.pointerId);
}
canvas.addEventListener('pointerup',releasePointer);
canvas.addEventListener('pointercancel',releasePointer);
canvas.addEventListener('lostpointercapture',releasePointer);
breachButton.addEventListener('click',impactSpan);
saveButton.addEventListener('click',saveState);
restoreButton.addEventListener('click',restoreState);
document.addEventListener('visibilitychange',()=>
  meshBridge?.setPaused(document.hidden));
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
      // A restored GL context cannot clear an unrelated worker or replay failure.
      rendererErrorMessage=ready ? null : (error?.message ?? 'WebGL context lost');
      lastStatusAt=-Infinity;
      updateStatus();
    }
  });
  meshBridge=new V2ExternalTerrainMeshBridge({
    createWorker:()=>new Worker(new URL('./src/terrain-mesh.worker.mjs',import.meta.url),
      {type:'module'}),
    now:()=>performance.now(),
    onReady:(world,meshes,epoch,kind,dirtyIds)=>{
      if(kind==='edit') {
        if(!pendingEdit || pendingEdit.world!==world ||
            pendingEdit.epoch!==epoch || active?.world!==world) return;
        try {
          // The original dirty IDs also remove emptied GPU chunks when
          // the worker sends no replacement mesh for a deleted chunk.
          if(!renderer.queueReplacementMeshes(new Set(dirtyIds),meshes,
              {sceneEpoch:pendingEdit.rendererSceneEpoch})) {
            throw new Error('Renderer scene changed while external mesh was building');
          }
          meshSource='worker (full + localized)';
          pendingEdit=null;
          lastStatusAt=-Infinity;
        } catch(error) {
          pendingEdit=null;
          errorMessage=error.message;
          lastStatusAt=-Infinity;
        }
        return;
      }
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
      pendingEdit=null;
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
