// Durable Water V2 save envelope for the *same* authored Hunt world identity.
// Terrain saves still own Voxel edits. Restore must happen only AFTER those
// solids have been replayed, BEFORE opening any resident fluid engine.
import {
  FluidRegionCheckpoints,FLUID_REGION_CHECKPOINT_SCHEMA
} from './fluid-region-checkpoints.mjs';

export const HUNT_FLUID_SAVE_PREFIX='wyrmforge.hunt-water.v1:';
export const MAX_HUNT_FLUID_SAVE_CHARS=2*1024*1024;

function validated(identity,checkpoint){
  // Reuse the sole solver checkpoint validator, including region counts,
  // duplicate IDs, snapshot byte caps and WorldGen identity binding.
  const clean=new FluidRegionCheckpoints(identity);
  clean.importCheckpoint(checkpoint);
  return clean.exportCheckpoint();
}

export class HuntFluidSave {
  #storage;
  #key;
  #identity;
  #checkpoint=null;
  #status='ready';
  #error=null;

  constructor(storage,identity){
    // Fail early if the world identity cannot be understood by Water V2.
    new FluidRegionCheckpoints(identity);
    this.#identity=identity;
    this.#key=HUNT_FLUID_SAVE_PREFIX+identity;
    this.#storage=storage;
    if(!storage){
      this.#status='unavailable';
      return;
    }
    try{
      const raw=storage.getItem(this.#key);
      if(raw===null)return;
      if(typeof raw!=='string'||raw.length>MAX_HUNT_FLUID_SAVE_CHARS){
        throw new RangeError('Water V2 save exceeds its size budget');
      }
      this.#checkpoint=validated(identity,JSON.parse(raw));
      this.#status='loaded';
    }catch(error){
      // Never silently reset a damaged save, destroying the player's water.
      this.#status='unreadable';
      this.#error=error.message;
    }
  }

  get status(){return this.#status;}
  get error(){return this.#error;}
  get hasCheckpoint(){return this.#checkpoint!==null;}

  restoreInto(stream){
    if(this.#status==='unreadable'){
      throw new Error('Water V2 save refused: '+this.#error);
    }
    if(!this.#checkpoint)return false;
    if(!stream||typeof stream.importCheckpoint!=='function'){
      throw new TypeError('Expected a dormant streamed Water V2 host');
    }
    stream.importCheckpoint(this.#checkpoint);
    return true;
  }

  saveFrom(stream){
    if(this.#status==='unreadable'){
      throw new Error('Water V2 cannot overwrite an unreadable save');
    }
    if(!this.#storage)return false;
    if(!stream||typeof stream.exportCheckpoint!=='function'){
      throw new TypeError('Expected a streamed Water V2 host');
    }
    const copy=validated(this.#identity,stream.exportCheckpoint());
    if(copy.schema!==FLUID_REGION_CHECKPOINT_SCHEMA){
      throw new TypeError('Expected the Water V2 region schema');
    }
    const json=JSON.stringify(copy);
    if(json.length>MAX_HUNT_FLUID_SAVE_CHARS){
      throw new RangeError('Water V2 save exceeds its size budget');
    }
    try{
      this.#storage.setItem(this.#key,json);
      this.#checkpoint=copy;
      this.#status='saved';
      this.#error=null;
      return true;
    }catch(error){
      this.#status='unavailable';
      this.#error=error.message;
      return false;
    }
  }
}
