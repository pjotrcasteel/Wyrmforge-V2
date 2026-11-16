import {COMMIT} from './src/build-info.mjs';
import {projectVoxel} from './src/camera-presets.mjs';
import {buildExposedFaceMeshes} from './src/exposed-face-mesher.mjs';
import {FIRE_HUNT_MATERIALS,TERRAIN_BASE_TILES,createMaterialLabTerrain,materialLabVolume,MATERIAL_LAB_SPAWN,MATERIAL_LAB_TARGET} from './src/fire-hunt-material-lab.mjs';
import {TerrainEditLedger} from './src/terrain-edit-ledger.mjs';
import {spawnTerrainActor,ACTOR_HEIGHT} from './src/terrain-actor.mjs';
import {stepHuntExplorer,HUNT_PIXELS_PER_VOXEL,HUNT_FIXED_STEP} from './src/hunt-play-runtime.mjs';
import {clipHuntActor} from './src/diagnostics/hunt-actor-occlusion.mjs';
import {inspectTerrainArtPngHeader,validateTerrainArtInput,terrainArtKey} from './src/terrain-material-handoff.mjs';
import {WebGLVoxelView} from './src/webgl-voxel-view.mjs';

const canvas=document.querySelector('#terrain');
const overlay=document.querySelector('#actors');
const context=overlay.getContext('2d');
const huntControls=document.querySelector('#hunt-controls');
const cast=document.querySelector('#cast');
const blend=document.querySelector('#blend');
const surfaceBlend=document.querySelector('#surface-blend');
const lavaMotion=document.querySelector('#lava-motion');
let flowing=true,lavaTime=0,lastLavaFrame=null;
const picker=document.querySelector('#material');
const description=document.querySelector('#description');
const channel=document.querySelector('#channel');
const texture=document.querySelector('#texture');
const clear=document.querySelector('#clear');
const cameraButton=document.querySelector('#camera');
const excavate=document.querySelector('#excavate');
const status=document.querySelector('#status');
const uploadStatus=document.querySelector('#upload-status');
const modes=[...document.querySelectorAll('[data-scene]')];
const drafts=new Map();
let renderer,fixture,scheduled,loading=false;
let scene='hunt',camera='hunt',excavated=false;
let actor,enemy,projectile,lastFrame,accumulator=0;
const pressed=new Set();
const directions=['ArrowLeft','ArrowRight','ArrowUp','ArrowDown'];
const art=new Map();
const tileCanvas=document.querySelector('#tile');
const repeatCanvas=document.querySelector('#tile-repeat');

const groups=new Map();
for(const material of FIRE_HUNT_MATERIALS){
  if(!groups.has(material.group)){
    const group=document.createElement('optgroup');
    group.label=material.group;
    groups.set(material.group,group);
    picker.append(group);
  }
  groups.get(material.group).append(new Option(material.name,material.id));
}
const current=()=>FIRE_HUNT_MATERIALS.find(material=>material.id===picker.value);
const draftKey=(material,kind)=>material.id+'/'+kind;
document.querySelector('#build').textContent='Build '+COMMIT.slice(0,7);

function albedo(material){
  return drafts.get(draftKey(material,'albedo'))??art.get(material.asset);
}

function isBark(material){
  return material.id==='bark'||material.id==='charred-bark';
}

function selectedSlots(material){
  if(material.slot==='grass/rooted-soil'||material.voxel===3)return [material.slot];
  if(material.voxel===2)return ['dirt/earth','dirt/earth-dark'];
  if(isBark(material))return ['grass/meadow','grass/meadow-dark','grass/rooted-soil'];
  return ['grass/meadow','grass/meadow-dark'];
}

function applyTextures(){
  renderer.clearTerrainAlbedoTiles();
  for(const [slot,asset] of Object.entries(TERRAIN_BASE_TILES)){
    const entry=FIRE_HUNT_MATERIALS.find(item=>item.asset===asset);
    renderer.setTerrainMaterialTile('albedo',terrainArtKey(slot,'albedo'),albedo(entry));
  }
  const selected=current();
  if(scene!=='hunt'||!isBark(selected)){
    for(const slot of selectedSlots(selected)){
      renderer.setTerrainMaterialTile('albedo',terrainArtKey(slot,'albedo'),albedo(selected));
      for(const kind of ['normal','orm']){
        const image=drafts.get(draftKey(selected,kind));
        if(image)renderer.setTerrainMaterialTile(kind,terrainArtKey(slot,kind),image);
      }
    }
  }
  const image=albedo(selected);
  tileCanvas.getContext('2d').drawImage(image,0,0);
  const repeat=repeatCanvas.getContext('2d');
  for(const x of [0,64])for(const y of [0,64])repeat.drawImage(image,x,y);
  requestRender();
}

function updateSelection(){
  const material=current();
  description.textContent=material.usage;
  clear.disabled=loading||!drafts.has(draftKey(material,channel.value));
  texture.disabled=loading;
}

const canWalk=()=>scene==='hunt'||scene==='lava';

function uploadTerrain(){
  renderer.setMeshes(buildExposedFaceMeshes(fixture.world));
  renderer.setLabMaterialVolume(materialLabVolume(fixture));
}

function setScene(){
  fixture=createMaterialLabTerrain(picker.value,scene,excavated,blend.value);
  actor=canWalk()?spawnTerrainActor(fixture.world,{...MATERIAL_LAB_SPAWN,searchTopY:10}):null;
  enemy=scene==='hunt'?spawnTerrainActor(fixture.world,{x:3.5,z:-2,searchTopY:10}):null;
  projectile=null;
  cast.disabled=false;
  huntControls.hidden=!canWalk();
  cast.hidden=scene==='lava';
  lavaMotion.hidden=scene!=='lava';
  lavaTime=0;
  lastLavaFrame=null;
  lastFrame=null;
  accumulator=0;
  uploadTerrain();
  for(const button of modes)button.setAttribute('aria-pressed',String(button.dataset.scene===scene));
  excavate.hidden=scene!=='layers';
  excavate.textContent=excavated?'Restore surface':'Excavate';
  excavate.setAttribute('aria-pressed',String(excavated));
  status.textContent=scene==='lava'?'Molten flow and cooled banks at Hunt scale.':scene==='hunt'?'Hunt camera · 16 px per voxel at default zoom. Use arrows or touch controls.':excavated?fixture.removedVoxels+' voxels removed · V2 terrain edit':
    scene==='layers'?'Excavate to inspect the material cut.':
      scene==='repeats'?'Repeated material at world scale.':'Top and exposed faces.';
  requestRender();
}

function requestRender(){
  scheduled??=requestAnimationFrame(render);
}

function stepScene(now){
  if(!actor)return;
  const delta=lastFrame===null?0:Math.min((now-lastFrame)/1000,.05);
  accumulator+=delta;
  const radius=fixture.radius;
  const bounds={minX:-radius,maxX:radius-1,minZ:-radius,maxZ:radius-1};
  while(accumulator>=HUNT_FIXED_STEP){
    const moveX=Number(pressed.has('ArrowRight'))-Number(pressed.has('ArrowLeft'));
    const moveZ=Number(pressed.has('ArrowDown'))-Number(pressed.has('ArrowUp'));
    actor=stepHuntExplorer(fixture.world,actor,bounds,{moveX,moveZ});
    accumulator-=HUNT_FIXED_STEP;
  }
  if(projectile&&now-projectile.started>=340){
    const result=new TerrainEditLedger(fixture.world).apply({
      id:'hunt-material-crater',type:'carve-crater',...MATERIAL_LAB_TARGET,radius:2.3,depth:2
    });
    uploadTerrain();
    projectile=null;
    status.textContent=result.removedVoxels+' voxels removed. Walk up to the crater to inspect the exposed layers.';
  }
}

function paintMarkers(view,now,density){
  if(overlay.width!==view.width)overlay.width=view.width;
  if(overlay.height!==view.height)overlay.height=view.height;
  context.clearRect(0,0,view.width,view.height);
  if(!actor)return;
  const paint=(figure,shade,head)=>{
    const foot=projectVoxel(figure.x,figure.y,figure.z,view);
    const top=projectVoxel(figure.x,figure.y+ACTOR_HEIGHT,figure.z,view);
    const width=Math.max(5*density,(foot.y-top.y)*.5);
    context.save();
    clipHuntActor(context,fixture.world,view,figure,
      {left:foot.x-width,right:foot.x+width,top:top.y-density,bottom:foot.y+density},fixture.highest,[]);
    context.fillStyle=shade;
    context.fillRect(foot.x-width/2,top.y+4*density,width,foot.y-top.y-4*density);
    context.fillStyle=head;
    context.fillRect(foot.x-3*density,top.y,6*density,5*density);
    context.restore();
  };
  if(enemy)paint(enemy,'#8e483a','#b86a4f');
  paint(actor,'#465986','#e7c68a');
  if(projectile){
    const t=Math.min(1,(now-projectile.started)/340);
    const target=MATERIAL_LAB_TARGET;
    const point=projectVoxel(projectile.x+(target.x+.5-projectile.x)*t,
      projectile.y+(target.y+1-projectile.y)*t,projectile.z+(target.z+.5-projectile.z)*t,view);
    context.fillStyle='#fba144';
    context.fillRect(point.x-3*density,point.y-2*density,6*density,4*density);
  }
}

function render(now){
  scheduled=null;
  if(!renderer?.ready||!fixture)return;
  try{
    const density=Math.min(devicePixelRatio||1,2);
    const width=Math.round(canvas.clientWidth*density),height=Math.round(canvas.clientHeight*density);
    if(!width||!height)return;
    if(canvas.width!==width)canvas.width=width;
    if(canvas.height!==height)canvas.height=height;
    const animating=scene==='lava'&&flowing;
    if(animating&&lastLavaFrame!==null&&now-lastLavaFrame<32&&!pressed.size&&!renderer.pendingUploads){
      requestRender();
      return;
    }
    if(animating){
      if(lastLavaFrame!==null)lavaTime+=Math.min((now-lastLavaFrame)/1000,.1);
      lastLavaFrame=now;
    }else lastLavaFrame=null;
    stepScene(now);
    renderer.flushQueuedUploads();
    const corners=[];
    for(const x of [-fixture.radius,fixture.radius])for(const z of [-fixture.radius,fixture.radius]){
      for(const y of [0,fixture.highest])corners.push(projectVoxel(x,y,z,{width:0,height:0,scale:1,camera}));
    }
    const minX=Math.min(...corners.map(p=>p.x)),maxX=Math.max(...corners.map(p=>p.x));
    const minY=Math.min(...corners.map(p=>p.y)),maxY=Math.max(...corners.map(p=>p.y));
    const scale=actor?HUNT_PIXELS_PER_VOXEL*density:.82*Math.min(width/(maxX-minX),height/(maxY-minY));
    const follow=actor?projectVoxel(actor.x,actor.y+.85,actor.z,{width,height,scale,camera}):null;
    const view={width,height,scale,camera,depthOrigin:follow?.depth??0,
      panX:follow?Math.round(width/2-follow.x):-(minX+maxX)*scale/2,
      panY:follow?Math.round(height*.51-follow.y):-(minY+maxY)*scale/2};
    renderer.render({...view,labBlend:surfaceBlend.checked,labTime:lavaTime});
    paintMarkers(view,now,density);
    const moving=actor&&(pressed.size||projectile||!actor.grounded);
    lastFrame=moving?now:null;
    if(renderer.pendingUploads||moving||animating)requestRender();
  }catch(error){status.textContent=error.message;}
}

try{
  await Promise.all(FIRE_HUNT_MATERIALS.map(async material=>{
    const image=new Image();
    image.src=new URL('./art/fire-hunt-materials/'+material.asset+'.png',import.meta.url);
    await image.decode();
    art.set(material.asset,image);
  }));
  renderer=new WebGLVoxelView(canvas,{onAvailabilityChange:(ready,error)=>{
    if(ready)setScene();
    else status.textContent=error?.message??'Waiting for WebGL to recover…';
  }});
  for(const button of modes)button.addEventListener('click',()=>{
    scene=button.dataset.scene;
    excavated=false;
    setScene();
    applyTextures();
  });
  cameraButton.addEventListener('click',()=>{
    camera=camera==='hunt'?'inspection':'hunt';
    cameraButton.textContent=camera==='hunt'?'Inspect angle':'Hunt angle';
    cameraButton.setAttribute('aria-pressed',String(camera==='inspection'));
    requestRender();
  });
  excavate.addEventListener('click',()=>{excavated=!excavated;setScene();});
  picker.addEventListener('change',()=>{
    if(scene==='hunt'&&isBark(current()))scene='sample';
    if(scene!=='hunt')setScene();
    updateSelection();
    applyTextures();
  });
  blend.addEventListener('change',()=>{scene='hunt';setScene();applyTextures();});
  surfaceBlend.addEventListener('change',requestRender);
  lavaMotion.addEventListener('click',()=>{
    flowing=!flowing;
    lastLavaFrame=null;
    lavaMotion.textContent=flowing?'Pause flow':'Resume flow';
    requestRender();
  });
  document.querySelector('#reset').addEventListener('click',setScene);
  cast.addEventListener('click',()=>{
    if(!actor||cast.disabled)return;
    cast.disabled=true;
    projectile={x:actor.x,y:actor.y+1.1,z:actor.z,started:performance.now()};
    requestRender();
  });
  const move=(key,active)=>{
    if(active)pressed.add(key);
    else pressed.delete(key);
    requestRender();
  };
  for(const button of document.querySelectorAll('[data-move]')){
    button.addEventListener('pointerdown',event=>{
      button.setPointerCapture(event.pointerId);
      move(button.dataset.move,true);
    });
    for(const type of ['pointerup','pointercancel','lostpointercapture']){
      button.addEventListener(type,()=>move(button.dataset.move,false));
    }
  }
  window.addEventListener('keydown',event=>{
    if(!canWalk()||!directions.includes(event.key)||['SELECT','INPUT'].includes(event.target?.tagName))return;
    event.preventDefault();
    move(event.key,true);
  });
  window.addEventListener('keyup',event=>{if(directions.includes(event.key))move(event.key,false);});
  window.addEventListener('blur',()=>pressed.clear());
  channel.addEventListener('change',updateSelection);
  clear.addEventListener('click',()=>{
    drafts.delete(draftKey(current(),channel.value));
    applyTextures();
    updateSelection();
    uploadStatus.textContent='Tile cleared.';
  });
  texture.addEventListener('change',async()=>{
    const file=texture.files[0];
    texture.value='';
    if(!file)return;
    const material=current(),kind=channel.value;
    loading=true;
    updateSelection();
    let url;
    try{
      await inspectTerrainArtPngHeader(file);
      url=URL.createObjectURL(file);
      const image=new Image();
      image.src=url;
      await image.decode();
      validateTerrainArtInput(file,image,material.slot,kind);
      drafts.set(draftKey(material,kind),image);
      applyTextures();
      uploadStatus.textContent='Loaded '+file.name+' for '+material.name+' ('+kind+').';
    }catch(error){uploadStatus.textContent=error.message;}
    finally{
      if(url)URL.revokeObjectURL(url);
      loading=false;
      updateSelection();
    }
  });
  new ResizeObserver(requestRender).observe(canvas);
  updateSelection();
  setScene();
  applyTextures();
}catch(error){
  status.textContent=error.message;
  for(const control of document.querySelectorAll('button,select,input'))control.disabled=true;
}
