// Lighting owns bounded emitter descriptions, never material or terrain edits.
export const LIGHT_SET_SCHEMA='wyrmforge.light-set.v1';
export const MAX_LIGHT_EMITTERS=32;
export const MAX_LIGHT_RADIUS=32;
export function defineLightSet({epoch,revision,emitters=[]}={}){
  if(!Number.isSafeInteger(epoch)||epoch<0||!Number.isSafeInteger(revision)||revision<0||
      !Array.isArray(emitters)||emitters.length>MAX_LIGHT_EMITTERS){
    throw new RangeError('Invalid bounded lighting snapshot');
  }
  const ids=new Set();
  const records=emitters.map(light=>{
    const {id,position,radiance,radius}=light??{};
    if(typeof id!=='string'||!id.length||id.length>128||ids.has(id)||
        !Array.isArray(position)||position.length!==3||
        !position.every(n=>Number.isFinite(n)&&Math.abs(n)<=1e6)||
        !Array.isArray(radiance)||radiance.length!==3||
        !radiance.every(n=>Number.isFinite(n)&&n>=0&&n<=64)||
        !Number.isFinite(radius)||radius<=0||radius>MAX_LIGHT_RADIUS){
      throw new RangeError('Invalid light emitter');
    }
    ids.add(id);
    return Object.freeze({id,position:Object.freeze([...position]),
      radiance:Object.freeze([...radiance]),radius});
  });
  return Object.freeze({schema:LIGHT_SET_SCHEMA,epoch,revision,emitters:Object.freeze(records)});
}
