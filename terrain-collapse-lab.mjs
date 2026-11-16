import {COMMIT} from './src/build-info.mjs';
import {projectVoxel} from './src/camera-presets.mjs';
import {TERRAIN_CLUSTER_FIXED_STEP} from './src/terrain-cluster-physics.mjs';
import {TerrainCollapseFixture} from './src/terrain-collapse-fixture.mjs';

const canvas=document.querySelector('#scene');
const ctx=canvas.getContext('2d');
const status=document.querySelector('#status');
const collapse=document.querySelector('#collapse');
const key='wyrmforge.terrain-collapse-fixture.v1';
const view={width:canvas.width,height:canvas.height,scale:32,camera:'hunt',panY:48};
const directions=new Set();
const arrows={ArrowLeft:'left',ArrowRight:'right',ArrowUp:'up',ArrowDown:'down'};
let fixture,revision=-1,staticFaces=[],lastFrame=null,accumulator=0,saveStatus='';
let lastRenderKey=null;

function load(){
  try{return TerrainCollapseFixture.restore(JSON.parse(localStorage.getItem(key)));}
  catch{return null;}
}

function setFixture(next){
  fixture=next;
  revision=-1;
  lastRenderKey=null;
  accumulator=0;
  saveStatus='';
}

function project(x,y,z){return projectVoxel(x,y,z,view);}

function facesFor(x,y,z,material,occluded,falling=false){
  const faces=[];
  const stone=falling?'#b8a184':'#969790';
  const floor=material===4;
  if(!occluded(x,y+1,z)){
    const color=floor?
      (z>=-1&&z<=0&&x>=-3&&x<=4?'#586653':(x+z)%2===0?'#687b60':'#65785e'):stone;
    faces.push({depth:project(x+.5,y+1,z+.5).depth,color,
      points:[project(x,y+1,z),project(x+1,y+1,z),project(x+1,y+1,z+1),project(x,y+1,z+1)]});
  }
  if(!occluded(x,y,z+1)){
    faces.push({depth:project(x+.5,y+.5,z+1).depth,color:floor?'#414c42':falling?'#837160':'#646966',
      points:[project(x,y,z+1),project(x+1,y,z+1),project(x+1,y+1,z+1),project(x,y+1,z+1)]});
  }
  return faces;
}

function render(){
  const {world,actor,bodies}=fixture;
  const renderKey=[world.revision,actor.x,actor.y,actor.z,...bodies.map(body=>body.offsetY)].join(',');
  if(renderKey===lastRenderKey)return;
  lastRenderKey=renderKey;
  if(revision!==world.revision){
    revision=world.revision;
    staticFaces=[];
    for(let x=-7;x<=7;x++)for(let z=-4;z<=5;z++)for(let y=0;y<=6;y++){
      const material=world.get(x,y,z);
      if(material)staticFaces.push(...facesFor(x,y,z,material,(a,b,c)=>world.get(a,b,c)!==0));
    }
  }
  const layers=staticFaces.slice();
  for(const {body,offsetY} of bodies){
    const occupied=new Set(body.cells.map(cell=>[cell.x,cell.y,cell.z].join(',')));
    for(const cell of body.cells){
      layers.push(...facesFor(cell.x,cell.y+offsetY,cell.z,cell.material,
        (x,y,z)=>occupied.has([x,Math.round(y-offsetY),z].join(',')),true));
    }
  }
  const feet=project(actor.x,actor.y,actor.z);
  layers.push({depth:feet.depth,actor:true});
  layers.sort((a,b)=>b.depth-a.depth);
  ctx.clearRect(0,0,canvas.width,canvas.height);
  for(const layer of layers){
    if(layer.actor){
      ctx.fillStyle='#282c42';
      ctx.fillRect(Math.round(feet.x)-5,Math.round(feet.y)-23,10,23);
      ctx.fillStyle='#ead6a3';
      ctx.fillRect(Math.round(feet.x)-4,Math.round(feet.y)-26,8,7);
    }else{
      ctx.fillStyle=layer.color;
      ctx.beginPath();
      layer.points.forEach(({x,y},index)=>index?ctx.lineTo(Math.round(x),Math.round(y)):
        ctx.moveTo(Math.round(x),Math.round(y)));
      ctx.closePath();
      ctx.fill();
    }
  }
}

const labels={ready:'Break the support to release the stone shelf.',
  falling:'Stone is falling.', 'actor-blocked':'Stone stopped above the actor. Move clear to let it settle.',
  settled:'Stone settled. Try walking into it, then refresh to check the saved landing.',
  blocked:'The fixture could not detach its stone shelf.'};

function frame(now){
  if(lastFrame!==null)accumulator=Math.min(accumulator+Math.min((now-lastFrame)/1000,.067),.067);
  lastFrame=now;
  let ticks=0;
  while(accumulator>=TERRAIN_CLUSTER_FIXED_STEP&&ticks<4){
    fixture.tick({moveX:Number(directions.has('right'))-Number(directions.has('left')),
      moveZ:Number(directions.has('down'))-Number(directions.has('up'))});
    accumulator-=TERRAIN_CLUSTER_FIXED_STEP;
    ticks++;
  }
  if(fixture.save&&!saveStatus){
    try{localStorage.setItem(key,JSON.stringify(fixture.save));saveStatus='Saved.';}
    catch{saveStatus='Save unavailable in this browser.';}
  }
  collapse.disabled=fixture.phase!=='ready';
  const message=[labels[fixture.phase],saveStatus].filter(Boolean).join(' ');
  if(status.textContent!==message)status.textContent=message;
  render();
  requestAnimationFrame(frame);
}

for(const button of document.querySelectorAll('[data-move]')){
  button.addEventListener('pointerdown',event=>{
    button.setPointerCapture(event.pointerId);
    directions.add(button.dataset.move);
  });
  for(const event of ['pointerup','pointercancel','lostpointercapture']){
    button.addEventListener(event,()=>directions.delete(button.dataset.move));
  }
}
window.addEventListener('keydown',event=>{
  if(!Object.hasOwn(arrows,event.key))return;
  event.preventDefault();
  directions.add(arrows[event.key]);
});
window.addEventListener('keyup',event=>directions.delete(arrows[event.key]));
window.addEventListener('blur',()=>directions.clear());
document.addEventListener('visibilitychange',()=>{
  directions.clear();
  lastFrame=null;
  accumulator=0;
});
collapse.addEventListener('click',()=>fixture.removeSupport());
document.querySelector('#reset').addEventListener('click',()=>{
  try{localStorage.removeItem(key);}catch{}
  setFixture(new TerrainCollapseFixture());
});
document.querySelector('#build').textContent=COMMIT.slice(0,7);
setFixture(load()??new TerrainCollapseFixture());
requestAnimationFrame(frame);
