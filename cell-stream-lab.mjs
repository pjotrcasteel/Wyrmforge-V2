import {COMMIT} from './src/build-info.mjs';
import {VoxelWorld} from './src/voxel-world.mjs';
import {WebGLVoxelView} from './src/webgl-voxel-view.mjs';
import {V2ExternalTerrainMeshBridge} from './src/external-terrain-mesh-bridge.mjs';
import {TerrainStreamCellBuilder} from './src/terrain-stream-cells.mjs';
import {TerrainCellStreamSession} from './src/terrain-cell-stream-session.mjs';
import {terrainViewFootprint} from './src/terrain-view-footprint.mjs';
import {projectVoxel} from './src/camera-presets.mjs';

const canvas=document.querySelector('#view');
const start=document.querySelector('#start');
const save=document.querySelector('#save');
const status=document.querySelector('#status');
const WORLD_HEIGHT={minY:-2,maxY:3};
const SPEED=8;
const START_Z=-30;
const END_Z=30;

// Deterministic lab fixture. The trail crosses both signed cell boundaries
// and shared 16m storage chunks.
const runs=[];
for(let z=-72;z<72;z++){
  runs.push({x:-24,y:-2,z,length:48,material:3});
  runs.push({x:-24,y:-1,z,length:48,material:2});
  runs.push({x:-24,y:0,z,length:21,material:1},{x:-3,y:0,z,length:6,material:2},
    {x:3,y:0,z,length:21,material:1});
  if(z%12<3&&z%12>=0){
    runs.push({x:-22,y:1,z,length:5,material:3},{x:17,y:1,z,length:5,material:3});
  }
}
const builder=new TerrainStreamCellBuilder({schema:'voxel-v2.terrain-initialization.v1',
  siteId:'camera-trail',generatorVersion:'lab-v1',seed:7,chunkEdge:16,runs});

let cells,world,stream,renderer,bridge;
let flight=null,failure=null,phase='preparing',cameraZ=START_Z,desiredZ=START_Z,direction=1;
let runStarted=0,previous=null,intervals=[],renderedFrames=0,heldFrames=0,heldMs=0;

function viewAt(z){
  const view={width:canvas.width,height:canvas.height,scale:16,panX:0,panY:0,camera:'hunt'};
  const focus=projectVoxel(0,1,z,view);
  view.panY=Math.round(view.height/2-focus.y);
  view.depthOrigin=focus.depth;
  return view;
}

function visibleIds(view){
  const rect=terrainViewFootprint(view,WORLD_HEIGHT);
  return cells.filter(({bounds:b})=>b.minX<=rect.maxX&&b.maxX+1>=rect.minX&&
    b.minZ<=rect.maxZ&&b.maxZ+1>=rect.minZ).map(({id})=>id);
}

function stepStream(view,protectedIds){
  if(!flight){
    const {ticket}=stream.begin({view:terrainViewFootprint(view,WORLD_HEIGHT),protectedIds});
    if(!ticket)return;
    flight={ticket};
  }
  const {ticket}=flight;
  if(!flight.meshing&&!flight.uploading){
    const progress=stream.write(ticket,256);
    if(progress.dirtyChunks===null)return;
    if(!progress.dirtyChunks.length){
      stream.acknowledgeMeshes(ticket,[]);
      if(!stream.acknowledgeUpload(ticket))throw new Error('Empty terrain publication failed');
      flight=null;
      return;
    }
    flight.meshing=true;
    flight.sceneEpoch=renderer.sceneEpoch;
    flight.workerEpoch=bridge.replace(world,progress.dirtyChunks);
  }
}

function fail(error){
  failure=String(error?.message??error);
  status.textContent='Lab stopped · '+failure;
  start.disabled=true;
}

function install(){
  cells=builder.cells;
  world=new VoxelWorld({chunkEdge:16});
  stream=new TerrainCellStreamSession(world,cells,{limit:64,preload:8,retain:16});
  renderer=new WebGLVoxelView(canvas,{fastHuntMode:true});
  renderer.setMeshes([]);
  bridge=new V2ExternalTerrainMeshBridge({
    createWorker:()=>new Worker(new URL('./src/terrain-mesh.worker.mjs',import.meta.url),{type:'module'}),
    now:()=>performance.now(),
    onFailure:fail,
    onReady:(source,meshes,epoch,kind,dirtyIds)=>{
      if(!flight?.meshing||source!==world||epoch!==flight.workerEpoch||kind!=='edit')return;
      if(!renderer.queueReplacementMeshes(dirtyIds,meshes,{sceneEpoch:flight.sceneEpoch})||
          !stream.acknowledgeMeshes(flight.ticket,dirtyIds)){
        fail('Replacement mesh was not accepted');
        return;
      }
      flight.uploading=true;
    }
  });
  phase='loading';
}

function frame(now){
  if(failure)return;
  try{
    if(!cells){
      if(builder.step(64).done)install();
      requestAnimationFrame(frame);
      return;
    }
    const delta=previous===null?0:Math.min(50,now-previous);
    if(phase==='running'){
      if(now-runStarted>120_000)throw new Error('Camera pass exceeded two minutes');
      if(previous!==null&&intervals.length<16_000)intervals.push(now-previous);
    }
    previous=now;
    const width=Math.max(1,Math.round(canvas.clientWidth));
    const height=Math.max(1,Math.round(canvas.clientHeight));
    if(canvas.width!==width)canvas.width=width;
    if(canvas.height!==height)canvas.height=height;
    if(!renderer.ready){
      status.textContent='Waiting for WebGL…';
      requestAnimationFrame(frame);
      return;
    }
    bridge.pollTimeout();
    if(renderer.pendingUploads)renderer.flushQueuedUploads({budgetMs:2});
    if(flight?.uploading&&!renderer.pendingUploads){
      if(!stream.acknowledgeUpload(flight.ticket))throw new Error('GPU readiness acknowledgement failed');
      flight=null;
    }

    const resident=new Set(stream.metrics.residentIds);
    const displayed=viewAt(cameraZ);
    const shown=visibleIds(displayed).filter(id=>resident.has(id));
    const target=viewAt(desiredZ);
    stepStream(target,shown);
    const ready=visibleIds(target).every(id=>resident.has(id));
    if(ready){
      cameraZ=desiredZ;
      if(phase==='loading'){
        phase='ready';
        start.disabled=false;
        status.textContent='Ready · build '+COMMIT.slice(0,7);
      }else if(phase==='running'){
        if(direction===1&&cameraZ>=END_Z)direction=-1;
        else if(direction===-1&&cameraZ<=START_Z){
          phase='done';
          status.textContent='Done · camera held '+heldFrames+' frames. Save report.';
          start.disabled=false;
          save.disabled=false;
        }
        if(phase==='running'){
          desiredZ=Math.max(START_Z,Math.min(END_Z,cameraZ+direction*SPEED*delta/1000));
        }
      }
    }else if(phase==='running'){
      heldFrames++;
      heldMs+=delta;
    }
    if(phase!=='loading'){
      renderer.render(viewAt(cameraZ));
      if(phase==='running')renderedFrames++;
    }
  }catch(error){fail(error);}
  if(!failure)requestAnimationFrame(frame);
}

start.addEventListener('click',()=>{
  if(!['ready','done'].includes(phase))return;
  phase='running';
  runStarted=performance.now();
  direction=1;
  intervals=[];
  renderedFrames=heldFrames=heldMs=0;
  start.disabled=save.disabled=true;
  status.textContent='Running camera pass…';
});

save.addEventListener('click',()=>{
  if(phase!=='done')return;
  const values=intervals.slice().sort((a,b)=>a-b);
  const percentile=q=>values.length?Number(values[Math.ceil(q*(values.length-1))].toFixed(1)):null;
  const frameIntervals={samples:values.length,p95Ms:percentile(.95),p99Ms:percentile(.99),
    over33Ms:values.filter(ms=>ms>33.34).length};
  const data={schema:'wyrmforge.voxel-cell-stream-lab.v1',commit:COMMIT,
    device:navigator.userAgent,viewport:{width:canvas.width,height:canvas.height},
    renderedFrames,heldFrames,heldMs,frameIntervals,
    residency:stream.metrics,gpuQueue:renderer.uploadQueueStatistics};
  const url=URL.createObjectURL(new Blob([JSON.stringify(data,null,2)],{type:'application/json'}));
  const link=document.createElement('a');
  link.href=url;
  link.download='wyrmforge-cell-stream-'+COMMIT.slice(0,7)+'.json';
  document.body.append(link);
  link.click();
  link.remove();
  setTimeout(()=>URL.revokeObjectURL(url),1000);
});
document.addEventListener('visibilitychange',()=>{
  bridge?.setPaused(document.hidden);
  previous=null;
});
requestAnimationFrame(frame);
