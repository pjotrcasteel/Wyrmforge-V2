// Water V2 region lifecycle. The host owns streamed Voxel residency and
// supplies a new engine only after replaying authoritative terrain edits.
// Dormant region state is retained, never simulated through unloaded solids.
import {FLUID_STATE_SCHEMA,MAX_FLUID_COLUMNS} from './column-fluid-engine.mjs';

export const FLUID_REGION_CHECKPOINT_SCHEMA='wyrmforge.fluid-region-checkpoints.v1';
export const MAX_FLUID_REGIONS=48;
export const MAX_ACTIVE_FLUID_REGIONS=5;
const MAX_REGION_BYTES=131072;
const MAX_CHECKPOINT_BYTES=2097152;
const VALID_ID=/^[A-Za-z0-9][A-Za-z0-9:._-]{0,127}$/;

function requireId(id,label){
  if(typeof id!=='string'||!VALID_ID.test(id)){
    throw new TypeError('Invalid Water V2 '+label);
  }
  return id;
}

function copyState(state){
  if(state?.schema!==FLUID_STATE_SCHEMA||
      !Array.isArray(state.floors)||!Array.isArray(state.depths)||
      !state.floors.length||state.floors.length>MAX_FLUID_COLUMNS||
      state.floors.length!==state.depths.length){
    throw new TypeError('Expected a bounded Water V2 engine snapshot');
  }
  const json=JSON.stringify(state);
  if(!json||json.length>MAX_REGION_BYTES){
    throw new RangeError('Water V2 region snapshot exceeds its byte budget');
  }
  return {state:JSON.parse(json),bytes:json.length};
}

function checkTotal(entries){
  const total=entries.reduce((sum,entry)=>sum+entry.bytes,0);
  if(total>MAX_CHECKPOINT_BYTES){
    throw new RangeError('Water V2 checkpoint exceeds its total byte budget');
  }
  return total;
}

// An engine instance and its terrain-event unsubscribe are owned by the host.
// Call close BEFORE eviction and open AFTER Voxel replay. restore() validates
// exact floor heights, inlet/outlet contracts and in-flight destinations.
export class FluidRegionCheckpoints {
  #identity;
  #active=new Map();
  #dormant=new Map();
  #roundRobin=0;

  constructor(identity){
    this.#identity=requireId(identity,'world identity');
  }

  get activeIds(){return [...this.#active.keys()];}
  get dormantIds(){return [...this.#dormant.keys()];}

  open(regionId,createEngine){
    const id=requireId(regionId,'region ID');
    if(typeof createEngine!=='function')throw new TypeError('Expected fluid factory');
    if(this.#active.has(id))throw new Error('Fluid region is already active');
    if(this.#active.size>=MAX_ACTIVE_FLUID_REGIONS){
      throw new RangeError('Too many active Water V2 regions');
    }
    if(this.#active.size+this.#dormant.size>=MAX_FLUID_REGIONS&&!this.#dormant.has(id)){
      throw new RangeError('Water V2 region count exceeds its budget');
    }
    const engine=createEngine();
    if(!engine||typeof engine.restore!=='function'||
        typeof engine.snapshot!=='function'||typeof engine.step!=='function'){
      throw new TypeError('Expected a Water V2 engine');
    }
    const saved=this.#dormant.get(id);
    if(saved){
      // The replayed solid terrain must match. Never silently reseed an edited
      // region or discard a checkpoint if restoration fails.
      engine.restore(saved.state);
    }
    this.#active.set(id,engine);
    this.#dormant.delete(id);
    return engine;
  }

  close(regionId){
    const id=requireId(regionId,'region ID');
    const engine=this.#active.get(id);
    if(!engine)return false;
    const saved=copyState(engine.snapshot());
    checkTotal([...this.#dormant.values(),saved]);
    this.#dormant.set(id,saved);
    this.#active.delete(id);
    return true;
  }

  // One shared per-frame budget, not budget * active region count.
  // Rotate the first region on each tick so small budgets cannot starve sites.
  step({budget=96}={}){
    if(!Number.isSafeInteger(budget)||budget<1||budget>MAX_FLUID_COLUMNS){
      throw new RangeError('Invalid shared Water V2 step budget');
    }
    const entries=[...this.#active.values()];
    if(!entries.length)return Object.freeze({processed:0,regions:0});
    const count=Math.min(entries.length,budget);
    const start=this.#roundRobin%entries.length;
    let processed=0,remaining=budget;
    for(let i=0;i<count;i++){
      const share=Math.ceil(remaining/(count-i));
      const engine=entries[(start+i)%entries.length];
      const result=engine.step({budget:share});
      if(!Number.isSafeInteger(result?.processed)||
          result.processed<0||result.processed>share){
        throw new Error('Water V2 engine exceeded its shared step budget');
      }
      processed+=result.processed;
      remaining-=share;
    }
    this.#roundRobin=(start+1)%entries.length;
    return Object.freeze({processed,regions:count});
  }

  exportCheckpoint(){
    const merged=new Map(this.#dormant);
    for(const [id,engine] of this.#active)merged.set(id,copyState(engine.snapshot()));
    if(merged.size>MAX_FLUID_REGIONS)throw new RangeError('Too many Water V2 checkpoints');
    checkTotal([...merged.values()]);
    return {
      schema:FLUID_REGION_CHECKPOINT_SCHEMA,identity:this.#identity,
      regions:[...merged].sort(([a],[b])=>a.localeCompare(b))
        .map(([id,{state}])=>({id,state:copyState(state).state}))
    };
  }

  importCheckpoint(checkpoint){
    if(this.#active.size)throw new Error('Evict active fluid regions before import');
    if(checkpoint?.schema!==FLUID_REGION_CHECKPOINT_SCHEMA||
        checkpoint.identity!==this.#identity||
        !Array.isArray(checkpoint.regions)||
        checkpoint.regions.length>MAX_FLUID_REGIONS){
      throw new TypeError('Incompatible Water V2 region checkpoint');
    }
    const next=new Map();
    for(const entry of checkpoint.regions){
      const id=requireId(entry?.id,'region ID');
      if(next.has(id))throw new Error('Duplicate Water V2 region checkpoint');
      next.set(id,copyState(entry.state));
    }
    checkTotal([...next.values()]);
    this.#dormant=next; // atomically replace only after every entry validated
    this.#roundRobin=0;
  }
}
