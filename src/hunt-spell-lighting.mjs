// Hunt composition maps existing spell presentation state to generic light data.
import {defineLightSet} from './lighting/light-contract.mjs';
import {huntFireballPosition} from './hunt-fireball-flight.mjs';
export function huntSpellLights({cast=null,impact=null,now,epoch,revision,reducedMotion=false}){
  const emitters=[];
  if(cast&&now>=cast.startedAt&&now<cast.startedAt+cast.duration){
    const rank=Math.max(0,Math.min(4,(cast.level??1)-1));
    const strength=(2.8+rank*.55)*(reducedMotion ? .5 : 1);
    emitters.push({id:'fireball-flight',position:huntFireballPosition(cast,now),
      radius:3.5+rank*.45,radiance:[strength,strength*.40,strength*.09]});
  }
  if(impact&&now>=impact.at&&now<impact.at+impact.duration){
    const rank=Math.max(0,Math.min(4,(impact.level??1)-1));
    const fade=(1-(now-impact.at)/impact.duration)**1.4;
    const strength=(5+rank*.8)*fade*(reducedMotion ? .35 : 1);
    emitters.push({id:'fireball-impact',position:[impact.point.x,impact.point.y+.4,impact.point.z],
      radius:5+rank*.65,radiance:[strength,strength*.46,strength*.12]});
  }
  return defineLightSet({epoch,revision,emitters});
}
