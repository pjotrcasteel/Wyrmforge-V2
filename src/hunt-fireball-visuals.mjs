import {projectVoxel} from './camera-presets.mjs';
import {V2_BEDROCK_MATERIAL} from './terrain-materials.mjs';
import {MICRO_VOXEL_EDGE} from './microvoxel-surface.mjs';

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
  const sparks=(bedrock?6:3)+rank;
  const debris=propKind?8+rank*2:Math.min(14+rank*3,removed);
  const particles=[];
  if(!reducedMotion)for(let i=0;i<sparks+debris;i++){
    const spark=i<sparks;
    const angle=i*2.39996323+point.x*.41+point.z*.23;
    const speed=(spark?2.15:1.25)+(i%4)*.24+rank*.20;
    particles.push({
      dx:Math.cos(angle)*speed,dz:Math.sin(angle)*speed,lift:1.55+(i%5)*.25+rank*.16,
      color:(spark?SPARKS:palette)[i%3],spark,
      duration:(spark?145+(i%4)*20:345+(i%4)*24)+rank*18
    });
  }
  const flashMs=reducedMotion?115:130+rank*14;
  return {point,at,particles,flashMs,radius:reducedMotion?5+rank:7+rank*3,
    duration:reducedMotion?flashMs:417+rank*18};
}

export function paintHuntFireballImpact(ctx,view,impact,now){
  const age=now-impact.at;
  if(age>=impact.duration)return false;
  const {x,y,z}=impact.point;
  const unit=Math.max(1,Math.round(view.scale/16));
  const blockSide=Math.max(2,Math.ceil(view.scale/MICRO_VOXEL_EDGE));
  const blockTop=Math.max(1,Math.round(blockSide*.28));
  ctx.save();
  if(age<impact.flashMs){
    const center=projectVoxel(x,y,z,view);
    const px=Math.round(center.x),py=Math.round(center.y);
    const radius=Math.round(impact.radius*(.7+.3*age/impact.flashMs))*unit;
    ctx.globalAlpha=1-age/impact.flashMs;
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
    const px=Math.round(p.x),py=Math.round(p.y);
    if(particle.spark){
      ctx.fillRect(px,py,unit,unit);
    }else{
      const left=px-Math.floor(blockSide/2);
      ctx.fillRect(left,py-blockSide,blockSide,blockSide);
      ctx.globalAlpha*=.65;
      ctx.fillStyle='#f8d8a6';
      ctx.fillRect(left+1,py-blockSide,blockSide-1,blockTop);
    }
  }
  ctx.restore();
  return true;
}
