// Diagnostic adapter only. Fluid engine does not import Voxel, WorldGen or the renderer.
import {VoxelWorld} from './src/voxel-world.mjs';
import {TerrainEditLedger} from './src/terrain-edit-ledger.mjs';
import {V2TerrainPort} from './src/terrain-integration-port.mjs';
import {createWorldGenFluidEngine,attachWorldGenFluid} from './src/fluid/worldgen-fluid-adapter.mjs';

const canvas=document.querySelector('#scene');
const ctx=canvas.getContext('2d');
const stats=document.querySelector('#stats');
const pauseButton=document.querySelector('#pause');
const COLS=17,ROWS=11,TILE=50;
const bounds={minX:0,maxX:COLS-1,minZ:0,maxZ:ROWS-1};
let world,port,fluid,detachFluid=null,paused=false,breaches=new Set(),lastTick=0;

function reset(){
  detachFluid?.();
  port?.dispose();
  world=new VoxelWorld();
  breaches=new Set();
  const initial=[];
  for(let z=0;z<ROWS;z++)for(let x=0;x<COLS;x++){
    const river=(z===3||z===4);
    const basin=(x>=7&&x<=11&&z>=6&&z<=9);
    const floor=river?0:basin?-2:3;
    for(let y=-4;y<floor;y++)world.set(x,y,z,y===-4?4:3);
    if(river)initial.push({x,z,depth:10});
  }
  const floor=initial.map(({x,z})=>({x,z,y:0}));
  const layout={
    footprint:{...bounds,minY:-4,maxY:3},
    riverChannels:[{
      kind:'water',floor,from:{x:0,z:3},to:{x:COLS-1,z:4},
      nodes:Array.from({length:COLS},(_,x)=>({x,z:3,y:0}))
    }]
  };
  port=new V2TerrainPort(world,new TerrainEditLedger(world));
  fluid=createWorldGenFluidEngine(layout,port).fluid;
  detachFluid=attachWorldGenFluid(port,fluid);
  draw();
}

function breachAt(x){
  if(x<4||x>12||breaches.has(x))return;
  // A real Voxel command publishes the committed edit once. The fluid
  // consumer reacts through the existing engine port, never a fake event.
  const result=port.apply({
    id:'fluid-lab-bank-'+x,type:'carve-tunnel',
    x,y:2,z:5,toX:x,toY:-2,toZ:5,radius:1.1
  });
  if(result.removedVoxels){
    breaches.add(x);
    draw();
  }
}

function draw(){
  ctx.fillStyle='#15232d';
  ctx.fillRect(0,0,canvas.width,canvas.height);
  for(let z=0;z<ROWS;z++)for(let x=0;x<COLS;x++){
    const cell=fluid.sample(x,z);
    const basin=cell.floorY<0;
    const river=cell.floorY===0;
    let base=basin?'#25373c':river?'#425651':'#4c5648';
    if(z===5)base=basin?'#334b4a':'#737059';
    ctx.fillStyle=base;
    ctx.fillRect(x*TILE,z*TILE,TILE,TILE);
    if(basin){
      ctx.fillStyle='rgba(5,13,21,.20)';
      ctx.fillRect(x*TILE+5,z*TILE+5,TILE-10,TILE-10);
    }
    if(cell.depth){
      const alpha=Math.min(.93,.45+cell.depth/100);
      ctx.fillStyle='rgba(37,148,170,'+alpha+')';
      ctx.fillRect(x*TILE+1,z*TILE+1,TILE-2,TILE-2);
      const foam=cell.surfaceY===null?0:Math.floor(cell.surfaceY*7);
      if((x+z+foam+Math.floor(fluid.steps/5))%5===0){
        ctx.fillStyle='rgba(184,230,215,.35)';
        ctx.fillRect(x*TILE+11,z*TILE+17,18,3);
      }
    }
    ctx.strokeStyle='rgba(8,19,27,.25)';
    ctx.strokeRect(x*TILE+.5,z*TILE+.5,TILE-1,TILE-1);
  }
  ctx.font='600 17px system-ui';
  ctx.fillStyle='#ccecef';
  ctx.fillText('RIVER  /  SOURCE',24,3*TILE+30);
  ctx.fillStyle='#ede1b7';
  ctx.fillText('INTACT BANK',24,5*TILE+31);
  ctx.fillStyle='#c7d6d4';
  ctx.fillText('CRATER',8*TILE,8*TILE+30);
  for(const x of breaches){
    ctx.strokeStyle='#a7d8c8';
    ctx.lineWidth=2;
    ctx.strokeRect(x*TILE+2,5*TILE+2,TILE-4,TILE-4);
  }
  stats.textContent='Tick '+fluid.steps+' · '+fluid.wetCount+' wet columns · '+port.metrics().published+' voxel edits';
}

function animate(now){
  if(!paused&&now-lastTick>=65){
    fluid.step({budget:COLS*ROWS});
    lastTick=now;
    draw();
  }
  requestAnimationFrame(animate);
}

document.querySelector('#breach').addEventListener('click',()=>breachAt(9));
document.querySelector('#reset').addEventListener('click',()=>{
  paused=false;
  pauseButton.textContent='Pause';
  reset();
});
pauseButton.addEventListener('click',()=>{
  paused=!paused;
  pauseButton.textContent=paused?'Resume':'Pause';
});
canvas.addEventListener('pointerup',event=>{
  const rect=canvas.getBoundingClientRect();
  const x=Math.floor((event.clientX-rect.left)/rect.width*COLS);
  const z=Math.floor((event.clientY-rect.top)/rect.height*ROWS);
  if(z===5)breachAt(x);
});
reset();
requestAnimationFrame(animate);
