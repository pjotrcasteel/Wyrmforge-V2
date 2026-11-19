// Pure Lighting art direction. World Map owns progress/biome; this module
// owns only immutable irradiance. No WorldGen/Voxel/Water or renderer imports.
import {defineLightingEnvironment} from './environment-contract.mjs';

const clamp=x=>Math.max(0,Math.min(1,x));
const smooth=x=>{const t=clamp(x);return t*t*(3-2*t);};
const lerp=(a,b,t)=>a+(b-a)*t;
export const HUNT_BIOME_MOODS=Object.freeze({
  'wet-forest':0,'forest-highland':.22,'mountain-pass':.48,
  'scorched-approach':.72,'mini-boss-arena':.86,'wyrm-lair':1
});

/**
 * Healthy forest daylight -> cool wilderness -> ash-lit Wyrm lair.
 * An early Wet Forest is warmer and substantially brighter than the former
 * all-biome .42 exposure. Dark regions still retain emissive readability.
 * Keeps the progress curve monotonic and never introduces frame-time work.
 */
export function describeHuntBiomeMood({kind='wet-forest',progress=0,daylight=1}={}){
  if(typeof kind!=='string'||!Number.isFinite(progress)||progress<0||progress>1||
      !Number.isFinite(daylight)||daylight<0||daylight>1){
    throw new RangeError('Expected supported biome and normalized World Map progression');
  }
  const influence=Math.max(progress,HUNT_BIOME_MOODS[kind]??progress);
  const fading=smooth(influence/.7);
  const ash=smooth((influence-.38)/.62);
  const exposure=lerp(.70,.34,smooth(influence));
  const color=[
    lerp(1.08,.84,fading),
    lerp(1.16,.89,fading),
    lerp(.94,1.10,fading)
  ];
  const warm=lerp(1,.18,ash);
  return Object.freeze({
    kind,progress:influence,exposure,
    warmth:warm,ash,
    environment:defineLightingEnvironment({
      daylight:Math.min(daylight,lerp(1,.45,influence)),
      exposure,ambient:color
    })
  });
}
