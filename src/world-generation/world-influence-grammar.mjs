// World Generation V2.7 — deterministic Wyrm-influence terrain foundation.
// World Map owns the corruption parameter. This pure grammar only describes
// changes to natural landforms and stone exposure. It does NOT create fire,
// lava, objects, shaders, spawn rules, or new voxel/collision authority.
import { siteNoise } from './map-kinds.mjs';

export const WORLD_INFLUENCE_SCHEMA='wyrmforge.world-influence-terrain.v1';

const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
const smooth=t=>t*t*(3-2*t);

// The northern end of the authored route approaches the Wyrm. Broad,
// coherent noise creates connected rocky patches, not random pixel speckles.
// At corruption=0 this policy is exactly inert (the accepted baseline).
export function sampleWorldInfluence({radius,seed,corruption,x,z}) {
  if(!Number.isSafeInteger(radius) || radius<2 || radius>32 ||
      !Number.isSafeInteger(seed) || seed<0 || seed>0xffffffff ||
      !Number.isFinite(corruption) || corruption<0 || corruption>1 ||
      !Number.isSafeInteger(x) || !Number.isSafeInteger(z) ||
      x<-radius || x>=radius || z<-radius || z>=radius) {
    throw new RangeError('Wyrm influence requires a bounded site and 0..1 progress');
  }
  if(corruption===0) {
    return Object.freeze({strength:0,elevationShift:0,weatheredStone:false});
  }
  const north=(radius-1-z)/(radius*2-1);
  const front=smooth(clamp((north-0.18)/0.82,0,1));
  const strength=corruption*front*
    (0.65+0.35*siteNoise(seed,x,z,12,71));
  // Broad height variation remains small beside the 1.6m character; the
  // normal authored corridor grading later establishes final walkability.
  const elevationShift=Math.round(
    (siteNoise(seed,x,z,9,72)-0.5)*strength*5
  );
  const weatheredStone=strength>=0.25 &&
    siteNoise(seed,x,z,9,73)>0.77-0.48*strength;
  return Object.freeze({strength,elevationShift,weatheredStone});
}
