import {COMMIT} from './src/build-info.mjs';
import {projectVoxel} from './src/camera-presets.mjs';
import {buildExposedFaceMeshes} from './src/exposed-face-mesher.mjs';
import {FIRE_HUNT_MATERIALS,createMaterialLabTerrain} from './src/fire-hunt-material-lab.mjs';
import {inspectTerrainArtPngHeader,validateTerrainArtInput,terrainArtKey} from './src/terrain-material-handoff.mjs';
import {WebGLVoxelView} from './src/webgl-voxel-view.mjs';

const canvas=document.querySelector('#terrain');
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
let scene='sample',camera='hunt',excavated=false;

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

function makeSwatch(color){
  const tile=document.createElement('canvas');
  tile.width=tile.height=64;
  const ctx=tile.getContext('2d');
  const pixels=ctx.createImageData(64,64);
  for(let index=0;index<pixels.data.length;index+=4){
    const variation=((Math.imul((index>>2)+1,2654435761)>>>25)%9)-4;
    color.forEach((value,component)=>{pixels.data[index+component]=value+variation;});
    pixels.data[index+3]=255;
  }
  ctx.putImageData(pixels,0,0);
  return tile;
}

function applyTextures(){
  renderer.clearTerrainAlbedoTiles();
  for(const material of FIRE_HUNT_MATERIALS){
    if(material.swatch)continue;
    for(const kind of ['albedo','normal','orm']){
      const image=drafts.get(draftKey(material,kind));
      if(image)renderer.setTerrainMaterialTile(kind,terrainArtKey(material.slot,kind),image);
    }
  }
  const selected=current();
  if(selected.swatch){
    const slots=selected.voxel===2?['dirt/earth','dirt/earth-dark']:[selected.slot];
    const swatch=drafts.get(draftKey(selected,'albedo'))??makeSwatch(selected.swatch);
    for(const slot of slots){
      renderer.setTerrainMaterialTile('albedo',terrainArtKey(slot,'albedo'),swatch);
      for(const kind of ['normal','orm']){
        const image=drafts.get(draftKey(selected,kind));
        if(image)renderer.setTerrainMaterialTile(kind,terrainArtKey(slot,kind),image);
      }
    }
  }
  requestRender();
}

function updateSelection(){
  const material=current();
  description.textContent=material.swatch
    ?material.id==='lava'
      ?'Concept swatch on a voxel sample. Glow, flow and damage belong to later Hunt work.'
      :'Concept swatch on a voxel sample for texture review.'
    :material.id==='roots'
      ?'Live terrain surface on the vertical face beneath grass.'
      :'Live terrain slot · '+material.slot;
  clear.disabled=loading||!drafts.has(draftKey(material,channel.value));
  texture.disabled=loading;
}

function setScene(){
  fixture=createMaterialLabTerrain(picker.value,scene,excavated);
  renderer.setMeshes(buildExposedFaceMeshes(fixture.world));
  for(const button of modes)button.setAttribute('aria-pressed',String(button.dataset.scene===scene));
  excavate.hidden=scene!=='layers';
  excavate.textContent=excavated?'Restore surface':'Excavate';
  excavate.setAttribute('aria-pressed',String(excavated));
  status.textContent=excavated?fixture.removedVoxels+' voxels removed · V2 terrain edit':
    scene==='layers'?'Surface over dirt and stone. Excavate to expose the layers.':
      scene==='repeats'?'Repeated material at world scale.':'Top and exposed faces.';
  requestRender();
}

function requestRender(){
  scheduled??=requestAnimationFrame(render);
}

function render(){
  scheduled=null;
  if(!renderer?.ready||!fixture)return;
  try{
    const density=Math.min(devicePixelRatio||1,2);
    const width=Math.round(canvas.clientWidth*density),height=Math.round(canvas.clientHeight*density);
    if(!width||!height)return;
    if(canvas.width!==width)canvas.width=width;
    if(canvas.height!==height)canvas.height=height;
    renderer.flushQueuedUploads();
    const corners=[];
    for(const x of [-fixture.radius,fixture.radius])for(const z of [-fixture.radius,fixture.radius]){
      for(const y of [0,fixture.highest])corners.push(projectVoxel(x,y,z,{width:0,height:0,scale:1,camera}));
    }
    const minX=Math.min(...corners.map(p=>p.x)),maxX=Math.max(...corners.map(p=>p.x));
    const minY=Math.min(...corners.map(p=>p.y)),maxY=Math.max(...corners.map(p=>p.y));
    const scale=.82*Math.min(width/(maxX-minX),height/(maxY-minY));
    renderer.render({width,height,scale,camera,panX:-(minX+maxX)*scale/2,panY:-(minY+maxY)*scale/2});
    if(renderer.pendingUploads)requestRender();
  }catch(error){status.textContent=error.message;}
}

try{
  renderer=new WebGLVoxelView(canvas,{onAvailabilityChange:(ready,error)=>{
    if(ready)setScene();
    else status.textContent=error?.message??'Waiting for WebGL to recover…';
  }});
  for(const button of modes)button.addEventListener('click',()=>{
    scene=button.dataset.scene;
    excavated=false;
    setScene();
  });
  cameraButton.addEventListener('click',()=>{
    camera=camera==='hunt'?'inspection':'hunt';
    cameraButton.textContent=camera==='hunt'?'Inspect angle':'Hunt angle';
    cameraButton.setAttribute('aria-pressed',String(camera==='inspection'));
    requestRender();
  });
  excavate.addEventListener('click',()=>{excavated=!excavated;setScene();});
  picker.addEventListener('change',()=>{updateSelection();applyTextures();setScene();});
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
}catch(error){
  status.textContent=error.message;
  for(const control of document.querySelectorAll('button,select,input'))control.disabled=true;
}
