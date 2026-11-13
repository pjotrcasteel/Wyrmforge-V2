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
import { createWorldSiteRecipe, siteRadiusForKind } from './src/world-generation/site-recipe.mjs';
import {
  generateWorldSite,generateWorldExpeditionRegion,
  createHuntExpeditionRecipe,composeHuntExpeditionPlan
} from './src/world-generation/index.mjs';
import { buildPixelMicroSurfaceMeshes } from './src/microvoxel-mesher.mjs';
import { projectEncounterGuides } from './src/diagnostics/worldgen-combat-overlay.mjs';
import { analyzeCharacterReachability } from './src/character-reachability.mjs';
import { projectVoxel } from './src/camera-presets.mjs';
import { projectRouteDummy } from './src/diagnostics/worldgen-dummy-actor.mjs';
import { projectActorDiagnostic } from './src/diagnostics/actor-proxy.mjs';
import {
  spawnHuntExplorer,stepHuntExplorer,HuntPlayPerformance,HUNT_FIXED_STEP
} from './src/hunt-play-runtime.mjs';
import {
  fitWorldgenSiteView, clampWorldgenViewZoom
} from './src/diagnostics/worldgen-viewport.mjs';

const playMode=document.body.dataset.playHunt==='true';
const canvas=document.querySelector('#site-view');
const playJoystick=document.querySelector('#play-joystick');
const playStick=document.querySelector('#play-stick');
const playHud=document.querySelector('#play-hud');
const playRespawn=document.querySelector('#play-respawn');
const combatGuide=document.querySelector('#combat-guide');
const combatLayout=document.querySelector('#combat-layout');
const traversalLayout=document.querySelector('#traversal-layout');
const reachabilityReport=document.querySelector('#reachability-report');
const dummyActor=document.querySelector('#dummy-actor');
const dummyProgress=document.querySelector('#dummy-route-progress');
const dummyStatus=document.querySelector('#dummy-actor-status');
const combatGuideContext=combatGuide.getContext('2d');
const status=document.querySelector('#status');
const pitch=document.querySelector('#chunk-edge');
const siteKind=document.querySelector('#site-kind');
const siteSeed=document.querySelector('#site-seed');
const siteInfluence=document.querySelector('#site-influence');
const expeditionMode=document.querySelector('#expedition-mode');
const expeditionRegion=document.querySelector('#expedition-region');
const expeditionRegionField=document.querySelector('#expedition-region-field');
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
let expeditionPlan=null;
let expeditionSite=null;
let reachabilityCache=null;
let playActor=null;
let playStepAccumulator=0;
let playFrameAt=null;
const playFrameStats=new HuntPlayPerformance();
const playCpuStats=new HuntPlayPerformance();
const playKeys=new Set();
const playPointer={id:null,x:0,z:0};
let lastHudAt=-Infinity;

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
  if(playMode) {
    siteSummary.textContent='Wet Forest Hunt · seed '+siteSeed.value+
      ' · '+(expeditionSite?.regionId.replace('region-','')??'loading');
    return;
  }
  if(expeditionPlan && expeditionSite) {
    const region=expeditionPlan.regions.find(item=>
      item.id===expeditionSite.regionId);
    siteSummary.textContent='Hunt '+expeditionPlan.footprint.widthMetres+
      '×'+expeditionPlan.footprint.depthMetres+' m · '+
      (region?.id.replace('region-','')??'region')+
      ' · seed '+siteSeed.value;
    return;
  }
  const selected=siteKind.selectedOptions[0]?.textContent ?? siteKind.value;
  const percent=Number(siteInfluence.value);
  const width=siteRadiusForKind(siteKind.value)*2;
  siteSummary.textContent=selected.split(' — ')[0]+
    (siteKind.value==='fixture' ? ' · diagnostic' :
      ' · '+width+'×'+width+' m · seed '+siteSeed.value+
      (percent ? ' · influence '+percent+'%' : ''));
}

function setPreviewStatus(message,brief) {
  status.textContent=message;
  previewMessage.textContent=brief;
}

function resizeCanvas() {
  // One physical pixel per CSS pixel is intentional for the untextured,
  // pixel-art Play Hunt on mobile. The previous 2x DPR submitted FOUR
  // times as many WebGL pixels + Canvas2D overlays with no actual new art.
  // Keep the 2x diagnostic inspector unchanged. Cap tablet/desktop fill.
  const cssPixels=Math.max(1,canvas.clientWidth*canvas.clientHeight);
  const pixelRatio=playMode
    ? Math.min(1,Math.sqrt(700000/cssPixels))
    : Math.min(window.devicePixelRatio || 1,2);
  const width=Math.max(1,Math.round(canvas.clientWidth*pixelRatio));
  const height=Math.max(1,Math.round(canvas.clientHeight*pixelRatio));
  if(canvas.width!==width || canvas.height!==height) {
    canvas.width=width;
    canvas.height=height;
    combatGuide.width=width;
    combatGuide.height=height;
  }
}

function paintEncounterGuide(view) {
  if(!combatGuideContext) return;
  const ctx=combatGuideContext;
  ctx.clearRect(0,0,combatGuide.width,combatGuide.height);
  if(!combatLayout.checked || !generatedSite || !active?.world) {
    paintTraversalOverlay(ctx,view);
    paintDummyActor(ctx,view);
    paintPlayActor(ctx,view);
    return;
  }
  const guide=projectEncounterGuides(generatedSite,active.world,view);
  const pixelRatio=combatGuide.width/Math.max(1,combatGuide.clientWidth);
  for(const space of guide.combat) {
    ctx.beginPath();
    space.ring.forEach((point,index)=>{
      if(index===0) ctx.moveTo(point.x,point.y);
      else ctx.lineTo(point.x,point.y);
    });
    ctx.closePath();
    ctx.fillStyle='rgba(32,200,164,0.12)';
    ctx.fill();
    ctx.setLineDash([6*pixelRatio,5*pixelRatio]);
    ctx.strokeStyle='rgba(99,243,195,0.95)';
    ctx.lineWidth=2*pixelRatio;
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.beginPath();
    ctx.arc(space.center.x,space.center.y,4*pixelRatio,0,Math.PI*2);
    ctx.fillStyle='#bdf8dc';
    ctx.fill();
  }
  for(const escape of guide.escapes) {
    if(escape.points.length<2) continue;
    ctx.beginPath();
    escape.points.forEach((point,index)=>{
      if(index===0) ctx.moveTo(point.x,point.y);
      else ctx.lineTo(point.x,point.y);
    });
    ctx.setLineDash([9*pixelRatio,4*pixelRatio]);
    ctx.strokeStyle=escape.side==='west'
      ? 'rgba(119,215,255,0.95)' : 'rgba(243,166,251,0.95)';
    ctx.lineWidth=3*pixelRatio;
    ctx.stroke();
    ctx.setLineDash([]);
  }
  // Muted white paths and blue maneuver rings are diagnostic geography.
  // They are not spawn points, scenery objects, or hidden loot spoilers.
  for(const link of guide.links) {
    const pocket=guide.maneuvers.find(item=>item.id===link.pocketId);
    if(!pocket || !link.points.length) continue;
    ctx.beginPath();
    link.points.forEach((point,i)=>{
      if(i===0) ctx.moveTo(point.x,point.y);
      else ctx.lineTo(point.x,point.y);
    });
    ctx.strokeStyle='rgba(226,239,247,0.8)';
    ctx.lineWidth=3*pixelRatio;
    ctx.setLineDash([5*pixelRatio,4*pixelRatio]);
    ctx.stroke();
    ctx.setLineDash([]);
  }
  for(const pocket of guide.maneuvers) {
    ctx.beginPath();
    pocket.ring.forEach((point,i)=>{
      if(i===0) ctx.moveTo(point.x,point.y);
      else ctx.lineTo(point.x,point.y);
    });
    ctx.closePath();
    ctx.fillStyle='rgba(111,188,232,0.13)';
    ctx.fill();
    ctx.strokeStyle='rgba(149,212,246,0.9)';
    ctx.lineWidth=2*pixelRatio;
    ctx.stroke();
  }
  for(const approach of guide.approaches) {
    const combat=guide.combat.find(space=>space.id===approach.centerId);
    if(!combat) continue;
    ctx.beginPath();
    ctx.moveTo(approach.point.x,approach.point.y);
    ctx.lineTo(combat.center.x,combat.center.y);
    ctx.setLineDash([4*pixelRatio,7*pixelRatio]);
    ctx.strokeStyle='rgba(252,197,87,0.9)';
    ctx.lineWidth=2*pixelRatio;
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.beginPath();
    ctx.arc(approach.point.x,approach.point.y,5*pixelRatio,0,Math.PI*2);
    ctx.fillStyle='#ffca6f';
    ctx.fill();
  }
  paintTraversalOverlay(ctx,view);
  paintDummyActor(ctx,view);
  paintPlayActor(ctx,view);
}

// Navigation is a separate derived consumer of the current Voxel V2 Terrain
// Port. The generator has NO actor collision or health implementation.
function currentReachability() {
  if((!traversalLayout.checked && !dummyActor.checked) ||
      !generatedSite || !active?.port)return null;
  const revision=active.world.revision;
  const epoch=active.port.epoch;
  if(reachabilityCache?.revision===revision &&
      reachabilityCache?.epoch===epoch &&
      reachabilityCache?.hash===generatedSite.hash) {
    return reachabilityCache.report;
  }
  const entrance=generatedSite.layout.routes.find(route=>
    route.id==='entry-to-exit');
  if(!entrance) return null;
  const targets=[
    {id:'exit',...entrance.nodes.at(-1)},
    ...generatedSite.layout.combatSpaces,
    ...generatedSite.layout.maneuverPockets,
    ...generatedSite.layout.landmarks,
    ...generatedSite.layout.approaches
  ];
  const report=analyzeCharacterReachability({
    terrain:active.port,
    bounds:generatedSite.layout.footprint,
    start:entrance.nodes[0],targets
  });
  reachabilityCache={revision,epoch,hash:generatedSite.hash,report};
  const reached=report.targets.filter(target=>target.reachable).length;
  const missing=report.targets.filter(target=>!target.reachable)
    .map(target=>target.id);
  reachabilityReport.textContent=
    'Actual actor-sized reachable: '+report.reachableCells+' / '+
    report.standableCells+' standable cells\n'+
    'No-damage access: '+report.safelyReachableCells+
    ' · damaging routes: '+report.damageRiskCells+'\n'+
    'Key destinations: '+reached+' / '+report.targets.length+
    (missing.length?'\nBlocked: '+missing.join(', '):'\nAll key destinations reachable')+
    '\nGreen: safe · Amber: damaging drop · Red: inaccessible';
  return report;
}

function paintTraversalOverlay(ctx,view) {
  if(!traversalLayout.checked || !generatedSite || !active?.port)return;
  let report;
  try {
    report=currentReachability();
  } catch(error) {
    reachabilityReport.textContent='Reachability audit failed: '+error.message;
    return;
  }
  if(!report)return;
  const radius=Math.max(1.1,Math.min(3,view.scale*0.22));
  for(const cell of report.cells) {
    if(cell.state==='blocked')continue;
    const point=projectVoxel(cell.x+0.5,cell.y+0.04,cell.z+0.5,view);
    ctx.fillStyle=cell.state==='safe'
      ? 'rgba(72,218,152,0.65)'
      : cell.state==='damaging'
        ? 'rgba(255,188,87,0.85)' : 'rgba(255,86,104,0.72)';
    ctx.fillRect(point.x-radius,point.y-radius,radius*2,radius*2);
  }
  const exit=report.targets.find(target=>target.id==='exit');
  const route=exit && report.routeTo(exit.x,exit.z);
  if(route && route.length>1) {
    ctx.beginPath();
    route.forEach((node,index)=>{
      const point=projectVoxel(node.x+0.5,node.y+0.12,node.z+0.5,view);
      if(index===0)ctx.moveTo(point.x,point.y);
      else ctx.lineTo(point.x,point.y);
    });
    ctx.lineWidth=Math.max(2,view.scale*0.4);
    ctx.strokeStyle='rgba(247,251,255,0.97)';
    ctx.stroke();
  }
  for(const target of report.targets) {
    const cell=report.cells.find(item=>
      item.x===target.x && item.z===target.z);
    if(cell?.y===null || cell?.y===undefined)continue;
    const p=projectVoxel(target.x+0.5,cell.y+0.2,target.z+0.5,view);
    ctx.beginPath();
    ctx.arc(p.x,p.y,radius*2.5,0,Math.PI*2);
    ctx.strokeStyle=target.reachable?'#f0fff9':'#ff506a';
    ctx.lineWidth=2;
    ctx.stroke();
  }
}

// A clearly visible dummy is intentionally NOT game rendering. It uses
// the actual V2 1.6m collider, projected at the same unmodified camera scale
// as the terrain. The navigation report determines which solid floor can
// support its feet, and the slider selects the route index.
function paintDummyActor(ctx,view) {
  if(!dummyActor.checked || !generatedSite || !active?.port) return;
  try {
    const report=currentReachability();
    if(!report)return;
    const dummy=projectRouteDummy(report,Number(dummyProgress.value),view);
    if(!dummy) {
      dummyStatus.textContent='No supported actor location at the entry.';
      return;
    }
    const dpr=combatGuide.width/Math.max(1,combatGuide.clientWidth);
    ctx.save();
    ctx.imageSmoothingEnabled=false;
    // Collision volume edges use true projected positions, not a
    // screenshot-scale sprite that can hide an impassable one-metre cliff.
    ctx.strokeStyle='rgba(255,240,157,0.95)';
    ctx.lineWidth=Math.max(1,dpr);
    ctx.setLineDash([3*dpr,3*dpr]);
    for(const [a,b] of dummy.boxEdges) {
      ctx.beginPath();
      ctx.moveTo(a.x,a.y);
      ctx.lineTo(b.x,b.y);
      ctx.stroke();
    }
    ctx.setLineDash([]);
    const pixel=n=>Math.round(n);
    // Minimal blocky proxy, not the final Character/Sprite engine.
    const body=dummy.torso;
    ctx.fillStyle='#2d3f78';
    ctx.fillRect(pixel(body.x),pixel(body.y),
      Math.max(1,pixel(body.width)),Math.max(1,pixel(body.height*0.7)));
    ctx.fillStyle='#4f78aa';
    ctx.fillRect(pixel(body.x),pixel(body.y+body.height*0.7),
      Math.max(1,pixel(body.width*0.35)),Math.max(1,pixel(body.height*0.3)));
    ctx.fillRect(pixel(body.x+body.width*0.65),
      pixel(body.y+body.height*0.7),
      Math.max(1,pixel(body.width*0.35)),Math.max(1,pixel(body.height*0.3)));
    const h=dummy.head;
    ctx.fillStyle='#e8c89f';
    ctx.fillRect(pixel(h.x-h.radius),pixel(h.y-h.radius),
      Math.max(1,pixel(h.radius*2)),Math.max(1,pixel(h.radius*2)));
    ctx.fillStyle='#f4dc77';
    ctx.textAlign='center';
    ctx.textBaseline='bottom';
    ctx.font=Math.max(10,Math.round(11*dpr))+'px ui-monospace,monospace';
    ctx.fillText('1.6 m',pixel(dummy.top.x),pixel(dummy.top.y-6*dpr));
    ctx.restore();
    const next=dummy.nextHeightDifference;
    dummyStatus.textContent='Dummy: 1.6m tall × 0.56m wide · '+
      (dummy.routeIndex+1)+'/'+dummy.routeLength+' route cells · '+
      (next===null?'At destination':
        'Next terrain change '+(next>0?'+':'')+next.toFixed(2)+'m ('+
        dummy.nextMovement+')')+
      ' · Max passive hop '+dummy.recommendedHopLimit.toFixed(2)+'m';
  } catch(error) {
    dummyStatus.textContent='Dummy scale check failed: '+error.message;
  }
}

// Temporary physical-size Wizard proxy. Drawn from the exact Voxel V2
// collider position: no fake 2D character location or scaled collision.
function paintPlayActor(ctx,view) {
  if(!playMode || !playActor || !active?.world)return;
  const graphic=projectActorDiagnostic(playActor,view);
  const pixelRatio=canvas.width/Math.max(1,canvas.clientWidth);
  const {foot,top}=graphic;
  const pixel=value=>Math.round(value);
  const bodyWidth=Math.max(3,graphic.projectedHeight*0.3);
  const headRadius=Math.max(2,graphic.projectedHeight*0.11);
  const hatY=top.y-4*pixelRatio;
  ctx.save();
  ctx.imageSmoothingEnabled=false;
  ctx.fillStyle='rgba(0,0,0,.45)';
  ctx.beginPath();
  ctx.ellipse(foot.x,foot.y+2*pixelRatio,
    bodyWidth*.85,Math.max(2,bodyWidth*.33),0,0,Math.PI*2);
  ctx.fill();
  // Blocky charcoal-blue robes, hood, golden brim and simple staff.
  ctx.fillStyle='#37466e';
  ctx.fillRect(pixel(foot.x-bodyWidth/2),pixel(top.y+graphic.projectedHeight*.32),
    pixel(bodyWidth),pixel(graphic.projectedHeight*.68));
  ctx.fillStyle='#647493';
  ctx.fillRect(pixel(foot.x-bodyWidth*.22),pixel(top.y+graphic.projectedHeight*.42),
    pixel(bodyWidth*.4),pixel(graphic.projectedHeight*.53));
  ctx.fillStyle='#d8bb91';
  ctx.fillRect(pixel(top.x-headRadius*.65),pixel(top.y+headRadius*1.3),
    pixel(headRadius*1.3),pixel(headRadius*1.3));
  ctx.fillStyle='#263451';
  ctx.beginPath();
  ctx.moveTo(top.x,hatY);
  ctx.lineTo(top.x-bodyWidth*.48,top.y+headRadius*1.9);
  ctx.lineTo(top.x+bodyWidth*.48,top.y+headRadius*1.9);
  ctx.closePath();ctx.fill();
  ctx.strokeStyle='#a98145';ctx.lineWidth=Math.max(1.4,1.7*pixelRatio);
  ctx.beginPath();
  ctx.moveTo(foot.x+bodyWidth*.7,foot.y);
  ctx.lineTo(top.x+bodyWidth*.8,top.y+headRadius*.25);
  ctx.stroke();
  ctx.fillStyle='#f7bd57';
  ctx.fillRect(pixel(top.x+bodyWidth*.8-2*pixelRatio),
    pixel(top.y+headRadius*.25-3*pixelRatio),4*pixelRatio,4*pixelRatio);
  ctx.restore();
}

function playMovementInput() {
  const pressed=code=>playKeys.has(code);
  const x=(pressed('KeyD')||pressed('ArrowRight')?1:0)-
    (pressed('KeyA')||pressed('ArrowLeft')?1:0);
  const z=(pressed('KeyS')||pressed('ArrowDown')?1:0)-
    (pressed('KeyW')||pressed('ArrowUp')?1:0);
  return {
    moveX:Math.max(-1,Math.min(1,x+playPointer.x)),
    moveZ:Math.max(-1,Math.min(1,z+playPointer.z))
  };
}
function resetPlayInput() {
  playKeys.clear();
  playPointer.id=null;
  playPointer.x=0;playPointer.z=0;
  if(playStick)playStick.style.transform='translate(0,0)';
}
function resetPlayActor() {
  if(!playMode || !expeditionSite || !active?.world)return;
  const region=expeditionPlan.regions.find(
    item=>item.id===expeditionSite.regionId);
  playActor=spawnHuntExplorer(active.world,region);
  playStepAccumulator=0;
  resetPlayInput();
}
function updatePlayFrame(now) {
  if(!playMode)return;
  if(playFrameAt!==null && !document.hidden) {
    const delta=now-playFrameAt;
    if(delta>0 && delta<=1000)playFrameStats.recordFrame(delta);
    if(playActor && active?.world && !pendingMesh && !restoring) {
      playStepAccumulator=Math.min(.05,playStepAccumulator+Math.min(.05,delta/1000));
      const input=playMovementInput();
      let steps=0;
      while(playStepAccumulator>=HUNT_FIXED_STEP && steps<3) {
        playActor=stepHuntExplorer(active.world,playActor,
          expeditionSite.layout.footprint,input);
        playStepAccumulator-=HUNT_FIXED_STEP;steps++;
      }
      if(playActor.error){
        previewMessage.textContent='Physics: '+playActor.error+' · Respawn to recover';
      }
    }
  }
  playFrameAt=now;
  if(playHud && now-lastHudAt>=350){
    lastHudAt=now;
    const metrics=playFrameStats.snapshot;
    const ms=value=>value===null?'—':value.toFixed(1)+'ms';
    const p=playActor?[
      playActor.x.toFixed(1),playActor.y.toFixed(1),
      playActor.z.toFixed(1)].join(', '):'—';
    playHud.textContent='WIZARD · '+(playActor?'walkable':'loading')+
      '\nWorld: '+(expeditionSite?.regionId??'—')+
      '\nPosition: '+p+
      '\nFrame p50: '+ms(metrics.p50Ms)+
      '\nFrame p95: '+ms(metrics.p95Ms)+
      '\nFrame p99: '+ms(metrics.p99Ms)+
      '\nHitches >33ms: '+metrics.hitchesOver33ms+
      '\nFrame CPU p95: '+ms(playCpuStats.snapshot.p95Ms)+
      '\nRender '+canvas.width+'×'+canvas.height+' px'+
      '\nVoxel memory ~'+(active?.world?
        (active.world.allocatedVoxelBytes/1048576).toFixed(1)+' MiB':'—')+
      ' · GPU jobs '+(renderer?.pendingUploads??0)+
      '\nTouch joystick / WASD · no enemies yet';
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
        ' · plan '+generatedSite.hash :
        expeditionSite ? ' · Hunt expedition region '+expeditionSite.regionId+
          ' · plan '+expeditionPlan.hash : '')
    : 'Loading '+progress.siteId+' · '+progress.loadedCells+
      '/'+progress.totalCells+' voxels · staged (not yet rendered)';
  previewMessage.textContent=progress.done
    ? (generatedSite ? generatedSite.recipe.kind :
        expeditionSite ? 'Expedition '+expeditionSite.regionId :
        'Fixed voxel fixture')+
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
    playActor=null;
    resetPlayInput();
    expeditionSite=null;
    expeditionPlan=null;
    reachabilityCache=null;
    dummyStatus.textContent='Preparing a 1.6m actor-scale route…';
    reachabilityReport.textContent='Generating terrain before actor reachability can be traced.';
    const inspectExpedition=(playMode || expeditionMode.checked) &&
      siteKind.value!=='fixture';
    expeditionRegionField.hidden=!inspectExpedition;
    if(siteKind.value==='fixture') {
      loader=new V2ExternalTerrainLoader(createExternalSiteFixture({
        chunkEdge:Number(pitch.value),seed:7
      }),{epoch:terrainEpochs.next()});
    } else if(inspectExpedition) {
      // This selector loads only ONE bounded world-coordinate region.
      // It is not an implemented region-streaming manager or playable Hunt.
      expeditionPlan=composeHuntExpeditionPlan(createHuntExpeditionRecipe({
        journeyId:'fire-tier-one',huntId:'preview-expedition',chapter:0,
        kind:siteKind.value,seed:Number(siteSeed.value),worldRevision:0,
        chunkEdge:Number(pitch.value),
        corruption:Number(siteInfluence.value)/100,
        scope:'standard'
      }));
      const previous=expeditionRegion.value;
      expeditionRegion.replaceChildren();
      for(const region of expeditionPlan.regions) {
        const option=document.createElement('option');
        option.value=region.id;
        option.textContent=region.id.replace('region-','')+
          ' · '+region.role;
        expeditionRegion.append(option);
      }
      expeditionRegion.value=expeditionPlan.regions.some(item=>item.id===previous)
        ? previous:expeditionPlan.entryRegionId;
      expeditionSite=generateWorldExpeditionRegion(
        expeditionPlan,expeditionRegion.value
      );
      loader=new V2ExternalTerrainLoader(expeditionSite.definition,
        {epoch:terrainEpochs.next()});
      dummyStatus.textContent=
        'Regional terrain preview · expedition actor navigation is not integrated';
    } else {
      // The World Generation engine knows only site recipes and the public
      // terrain initialization contract; this host owns the adapter lifecycle.
      const recipe=createWorldSiteRecipe({
        regionId:'starter-region',siteId:'preview-'+siteKind.value,
        encounterId:'preview-001',kind:siteKind.value,
        seed:Number(siteSeed.value),worldRevision:0,
        chunkEdge:Number(pitch.value),corruption:Number(siteInfluence.value)/100
      });
      generatedSite=generateWorldSite(recipe);
      loader=new V2ExternalTerrainLoader(generatedSite.definition,
        {epoch:terrainEpochs.next()});
    }
    breachButton.textContent=generatedSite || expeditionSite
      ? 'Carve generated terrain' : 'Break stone span';
    updateSiteSummary();
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
    if(generatedSite || expeditionSite) {
      const spot=generatedSite
        ? generatedSite.layout.clearings[0]
        : expeditionSite.layout.center;
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
        renderer.queueReplacementMeshes(dirty,presentSiteMeshes(active.world,meshes),
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

function presentSiteMeshes(world,meshes) {
  // Authoritative microvoxels live in Voxel V2 and produce discrete
  // 10cm boxes. No per-vertex warping or alternate material authority.
  return buildPixelMicroSurfaceMeshes(world,meshes);
}

function showMeshedTerrain(terrain,kind,epoch,meshes,source='worker') {
  if(!pendingMesh || pendingMesh.terrain!==terrain ||
      pendingMesh.epoch!==epoch) return;
  // Only a complete revision-consistent mesh from this world can replace
  // the active GPU scene. No old voxel world is unloaded before this point.
  renderer.setMeshes(presentSiteMeshes(terrain.world,meshes));
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
  if(playMode)resetPlayActor();
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
  const playCpuBegin=playMode?performance.now():0;
  try {
    updatePlayFrame(now);
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
      const camera=viewCamera.value; // Play Hunt defaults to north-up in its own page
      const pixelRatio=canvas.width/Math.max(1,canvas.clientWidth);
      const inspected=generatedSite??expeditionSite;
      const fit=!playMode && inspected
        ? fitWorldgenSiteView({
          width:canvas.width,height:canvas.height,
          footprint:inspected.layout.footprint,camera
        })
        : null;
      const scale=playMode
        ? 16*pixelRatio*viewZoom
        : fit ? fit.scale*viewZoom
        : Math.max(9,Math.min(20,
          canvas.width/(camera==='inspection' ? 37 : 34)))*viewZoom;
      const followed=playMode && playActor
        ? projectVoxel(playActor.x,playActor.y+0.85,playActor.z,{
          width:canvas.width,height:canvas.height,scale,camera})
        : null;
      const panX=followed
        ? canvas.width/2-followed.x
        : (fit?.panX ?? 0)*viewZoom+viewPanX*pixelRatio;
      const panY=followed
        ? canvas.height*.51-followed.y
        : (fit?.panY ?? 0)*viewZoom+viewPanY*pixelRatio;
      renderer.render({
        width:canvas.width,height:canvas.height,
        scale,panX,panY,camera
      });
      paintEncounterGuide({
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
  if(playMode)playCpuStats.recordFrame(
    Math.max(0,Math.min(1000,performance.now()-playCpuBegin)));
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
siteInfluence.addEventListener('change',()=>{
  resetPreviewView();
  controls.open=false;
  resetSite();
});
expeditionMode.addEventListener('change',()=>{
  resetPreviewView();
  controls.open=false;
  resetSite();
});
expeditionRegion.addEventListener('change',()=>{
  resetPreviewView();
  controls.open=false;
  resetSite();
});
combatLayout.addEventListener('change',()=>{
  if(!combatLayout.checked && !traversalLayout.checked &&
      !dummyActor.checked && combatGuideContext) {
    combatGuideContext.clearRect(0,0,combatGuide.width,combatGuide.height);
  }
});
traversalLayout.addEventListener('change',()=>{
  reachabilityReport.hidden=!traversalLayout.checked;
  if(traversalLayout.checked) currentReachability();
  else if(!combatLayout.checked && !dummyActor.checked) {
    combatGuideContext.clearRect(0,0,combatGuide.width,combatGuide.height);
  }
});
dummyActor.addEventListener('change',()=>{
  dummyProgress.disabled=!dummyActor.checked;
  if(dummyActor.checked) currentReachability();
  else if(!combatLayout.checked && !traversalLayout.checked) {
    combatGuideContext.clearRect(0,0,combatGuide.width,combatGuide.height);
  }
});
dummyProgress.addEventListener('input',()=>{
  lastStatusAt=-Infinity;
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
    if(!playMode) {
      viewPanX+=after[0].x-before[0].x;
      viewPanY+=after[0].y-before[0].y;
    }
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
if(playMode) {
  // Safari can still rubber-band the visual viewport when a joystick
  // gesture moves down, even if the pointer target uses touch-action:none.
  // Register a NON-PASSIVE touchmove guard on the document so that a touch
  // captured by the joystick cannot promote into page scrolling.
  // Keep the WorldGen lab and the header's normal link interaction intact.
  const playStage=document.querySelector('#preview-stage');
  document.addEventListener('touchmove',event=>{
    if(event.cancelable && (playPointer.id!==null ||
        playStage.contains(event.target))) {
      event.preventDefault();
    }
  },{passive:false});
  const directions=new Set([
    'KeyW','KeyA','KeyS','KeyD',
    'ArrowUp','ArrowLeft','ArrowDown','ArrowRight'
  ]);
  document.addEventListener('keydown',event=>{
    if(!directions.has(event.code) || event.target instanceof HTMLInputElement ||
        event.target instanceof HTMLSelectElement) return;
    playKeys.add(event.code);event.preventDefault();
  });
  document.addEventListener('keyup',event=>{
    playKeys.delete(event.code);
    if(directions.has(event.code))event.preventDefault();
  });
  const moveStick=event=>{
    if(playPointer.id!==event.pointerId)return;
    const rect=playJoystick.getBoundingClientRect();
    const x=(event.clientX-rect.left-rect.width/2)/(rect.width*.34);
    const z=(event.clientY-rect.top-rect.height/2)/(rect.height*.34);
    const d=Math.max(1,Math.hypot(x,z));
    playPointer.x=x/d;playPointer.z=z/d;
    playStick.style.transform='translate('+
      (playPointer.x*rect.width*.26).toFixed(1)+'px,'+
      (playPointer.z*rect.height*.26).toFixed(1)+'px)';
    event.preventDefault();
  };
  playJoystick.addEventListener('pointerdown',event=>{
    if(playPointer.id!==null)return;
    playPointer.id=event.pointerId;
    playJoystick.setPointerCapture?.(event.pointerId);
    moveStick(event);
  });
  playJoystick.addEventListener('pointermove',moveStick);
  for(const name of ['pointerup','pointercancel','lostpointercapture']) {
    playJoystick.addEventListener(name,event=>{
      if(playPointer.id===event.pointerId)resetPlayInput();
    });
  }
  playRespawn.addEventListener('click',resetPlayActor);
  window.addEventListener('blur',()=>{
    resetPlayInput();
    playFrameAt=null;
  });
}
document.addEventListener('visibilitychange',()=>{
  meshBridge?.setPaused(document.hidden);
  if(document.hidden){
    resetPlayInput();
    playFrameAt=null;
  }
});
window.addEventListener('pagehide',()=>{
  meshBridge?.close();
  restoring?.unload();
  restoredSession?.unload();
  loader?.unload();
  renderer?.dispose();
});
try {
  renderer=new WebGLVoxelView(canvas,{
    fastHuntMode:playMode,
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
          if(!renderer.queueReplacementMeshes(new Set(dirtyIds),
              presentSiteMeshes(world,meshes),
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
