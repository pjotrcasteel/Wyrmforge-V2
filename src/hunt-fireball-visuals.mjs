import {projectVoxel} from './camera-presets.mjs';
import {V2_BEDROCK_MATERIAL} from './terrain-materials.mjs';

const TURF=['#90a258','#687641','#72513a'];
const EARTH=['#cc9866','#9a6344','#603d2e'];
const STONE=['#a3a5a9','#737882','#514e54'];
const WOOD=['#bd9366','#82664b','#534337'];
const SPARKS=['#fff0a2','#ffb747','#ed682c'];

export function huntFireballVisualLevel(value) {
  const level=Number(value);
  return Number.isInteger(level)&&level>=1&&level<=5?level:1;
}

export function createHuntFireballImpact(point,at,{material,removed=0,propKind,reducedMotion=false,level=1}={}){
  const rank=huntFireballVisualLevel(level)-1;
  const bedrock=material===V2_BEDROCK_MATERIAL;
  const palette=propKind==='tree'?WOOD:material===1?TURF:material===2?EARTH:STONE;
  const sparks=(bedrock?12:9)+rank*4;
  const debris=propKind?8+rank*2:Math.min(14+rank*3,removed);
  const particles=[];
  if(!reducedMotion)for(let i=0;i<sparks+debris;i++){
    const spark=i<sparks;
    const angle=i*2.39996323+point.x*.41+point.z*.23;
    const speed=(spark?3.1:1.8)+(i%4)*.38+rank*.52;
    particles.push({
      dx:Math.cos(angle)*speed,dz:Math.sin(angle)*speed,lift:2.4+(i%5)*.31+rank*.28,
      color:(spark?SPARKS:palette)[i%3],size:spark?1:2+(i%2),
      duration:(spark?270+(i%4)*34:420+(i%4)*32)+rank*34
    });
  }
  const flashMs=reducedMotion?115:130+rank*14;
  return {point,at,particles,flashMs,radius:reducedMotion?5+rank:7+rank*3,
    duration:reducedMotion?flashMs:530+rank*34};
}

export function paintHuntFireballImpact(ctx,view,impact,now){
  const age=now-impact.at;
  if(age>=impact.duration)return false;
  const {x,y,z}=impact.point;
  const unit=Math.max(1,Math.round(view.scale/16));
  ctx.save();
  if(age<impact.flashMs){
    const center=projectVoxel(x,y,z,view);
    const px=Math.round(center.x),py=Math.round(center.y);
    const radius=Math.round(impact.radius*(.7+.3*age/impact.flashMs))*unit;
    ctx.globalAlpha=1-age/impact.flashMs;
    ctx.fillStyle='#ffad48';
    ctx.fillRect(px-radius,py-unit,2*radius+unit,3*unit);
    ctx.fillRect(px-unit,py-radius,3*unit,2*radius+unit);
    const core=Math.max(2*unit,Math.round(radius*.38));
    ctx.fillStyle='#fff0a2';
    ctx.fillRect(px-core,py-core,2*core+unit,2*core+unit);
  }
  const seconds=age/1000;
  for(const particle of impact.particles){
    if(age>=particle.duration)continue;
    const lift=Math.max(0,particle.lift*seconds-7*seconds*seconds);
    const p=projectVoxel(x+particle.dx*seconds,y+lift,z+particle.dz*seconds,view);
    ctx.globalAlpha=Math.min(1,(1-age/particle.duration)*2.8);
    ctx.fillStyle=particle.color;
    ctx.fillRect(Math.round(p.x),Math.round(p.y),particle.size*unit,particle.size*unit);
  }
  ctx.restore();
  return true;
}
