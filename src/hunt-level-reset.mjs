// A deliberate, scoped clean-start for the current authored Hunt world.
// Respawn only relocates the actor; this clears the persisted Voxel edits,
// Water V2 solver, damaged woodland props, findings, and completed extraction.
// Never call localStorage.clear() or remove saves belonging to another seed.
import {HUNT_FLUID_SAVE_PREFIX} from './fluid/hunt-fluid-save.mjs';

const MAX_IDENTITY=512;
const validIdentity=value=>typeof value==='string'&&
  value.length>0&&value.length<=MAX_IDENTITY;

export function huntLevelResetKeys({
  terrainIdentity,worldIdentity,seed,worldRevision
}={}){
  if(!validIdentity(terrainIdentity)||!validIdentity(worldIdentity)||
      !Number.isSafeInteger(seed)||!Number.isSafeInteger(worldRevision)||
      seed<0||worldRevision<0){
    throw new TypeError('Expected current authored Hunt world identities and seed');
  }
  return Object.freeze([
    'wyrmforge.hunt-terrain.v1:'+terrainIdentity,
    HUNT_FLUID_SAVE_PREFIX+terrainIdentity,
    'wyrmforge.hunt-tree-damage.v1:'+worldIdentity,
    'wyrmforge.hunt-findings.v1:'+seed+':'+worldRevision,
    'wyrmforge.hunt-extraction.v1:'+seed+':'+worldRevision
  ]);
}

// Read the exact keys before touching storage. On a removal error, attempt
// to restore what was present, then FAIL rather than reloading a half-reset
// world. No broad prefix scan and no mutation of unrelated localStorage.
export function resetHuntLevelSave(storage,identity){
  if(!storage||typeof storage.getItem!=='function'||
      typeof storage.removeItem!=='function'||
      typeof storage.setItem!=='function'){
    throw new TypeError('Browser storage unavailable for a safe Hunt reset');
  }
  const keys=huntLevelResetKeys(identity);
  const before=new Map(keys.map(key=>[key,storage.getItem(key)]));
  try{
    for(const key of keys)storage.removeItem(key);
  }catch(error){
    for(const [key,value] of before){
      try{
        if(value===null)storage.removeItem(key);
        else storage.setItem(key,value);
      }catch{
        // Keep the original failure as the caller-visible result.
      }
    }
    throw new Error('Reset could not clear this Hunt save; no reload was requested',{
      cause:error
    });
  }
  return Object.freeze({
    schema:'wyrmforge.hunt-level-reset.v1',
    scopedKeys:keys.length,
    clearedKeys:[...before.values()].filter(value=>value!==null).length
  });
}
