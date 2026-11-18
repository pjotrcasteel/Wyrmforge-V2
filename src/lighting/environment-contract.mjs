// Linear ambient irradiance, owned by Lighting. No material/world/GPU imports.
export const LIGHTING_ENVIRONMENT_SCHEMA='wyrmforge.lighting-environment.v1';
export function defineLightingEnvironment({daylight=1,exposure=1,ambient=null}={}){
  if(!Number.isFinite(daylight)||daylight<0||daylight>1||
      !Number.isFinite(exposure)||exposure<0||exposure>1){
    throw new RangeError('Expected normalized lighting daylight and exposure');
  }
  const color=ambient??[.52+.48*daylight,.62+.38*daylight,.76+.24*daylight];
  if(!Array.isArray(color)||color.length!==3||
      !color.every(n=>Number.isFinite(n)&&n>=0&&n<=2)){
    throw new RangeError('Expected bounded linear ambient irradiance');
  }
  return Object.freeze({schema:LIGHTING_ENVIRONMENT_SCHEMA,
    daylight,exposure,ambient:Object.freeze(color.map(n=>n*exposure))});
}
