import {projectVoxel} from './camera-presets.mjs';
import {V2_BEDROCK_MATERIAL} from './terrain-materials.mjs';

const TURF=['#90a258','#687641','#72513a'];
const EARTH=['#cc9866','#9a6344','#603d2e'];
const STONE=['#a3a5a9','#737882','#514e54'];
const WOOD=['#bd9366','#82664b','#534337'];
const SPARKS=['#fff0a2','#ffb747','#ed682c'];

export function createHuntFireballImpact(point,at,{material,removed=0,propKind,reducedMotion=false}={}){
  const bedrock=material===V2_BEDROCK_MATERIAL;
  const palette=propKind==='tree'?WOOD:material===1?TURF:material===2?EARTH:STONE;
  const sparks=bedrock?9:6;
  const debris=propKind?6:Math.min(12,removed);
  const particles=[];
  if(!reducedMotion)for(let i=0;i<sparks+debris;i++){
    const spark=i<sparks;
    const angle=i*2.39996323+point.x*.41+point.z*.23;
    const speed=(spark?3.1:1.8)+(i%4)*.38;
    particles.push({
      dx:Math.cos(angle)*speed,dz:Math.sin(angle)*speed,lift:2.2+(i%5)*.31,
      color:(spark?SPARKS:palette)[i%3],size:spark?1:2+(i%2),
      duration:spark?240+(i%4)*34:400+(i%4)*32
    });
  }
  return {point,at,particles,duration:reducedMotion?115:530};
}

export function paintHuntFireballImpact(ctx,view,impact,now){
  const age=now-impact.at;
  if(age>=impact.duration)return false;
  const {x,y,z}=impact.point;
  const unit=Math.max(1,Math.round(view.scale/16));
  ctx.save();
  if(age<115){
    const center=projectVoxel(x,y,z,view);
    const px=Math.round(center.x),py=Math.round(center.y);
    ctx.globalAlpha=1-age/115;
    ctx.fillStyle='#ffad48';
    ctx.fillRect(px-5*unit,py-unit,11*unit,3*unit);
    ctx.fillRect(px-unit,py-5*unit,3*unit,11*unit);
    ctx.fillStyle='#fff0a2';
    ctx.fillRect(px-2*unit,py-2*unit,5*unit,5*unit);
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
