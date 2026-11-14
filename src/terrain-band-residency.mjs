// H08-02B: bounded residency of one authored terrain band.
// The caller owns admission, movement safety, mesh publication and exclusive
// access while a transition runs. The world/port/edit ledger never change.
// Only destructive edits to authored occupancy are supported by this slice.
import {validateExternalTerrainDefinition,MAX_INITIAL_TERRAIN_STEP_CELLS} from './external-terrain-loader.mjs';
import {markDirtyForEditedVoxel} from './chunk-dirty.mjs';

const key=(x,y,z)=>x+','+y+','+z;

// Cheap deterministic integrity guard over canonical runs and microlevels;
// not a cryptographic signature or a second terrain representation.
function definitionSignature(definition){
  let h=2166136261;
  const add=n=>{h=Math.imul(h^(n|0),16777619)>>>0;};
  for(const char of definition.siteId+'|'+definition.generatorVersion)add(char.charCodeAt(0));
  add(definition.seed);add(definition.chunkEdge);
  for(const r of definition.runs){add(r.x);add(r.y);add(r.z);add(r.length);add(r.material);}
  for(const t of definition.surfaceTiles??[]){add(t.x);add(t.y);add(t.z);for(const level of t.levels)add(level);}
  return h;
}

export class V2TerrainBandResidency {
  #world;
  #definition;
  #regenerate;
  #signature;
  #removed=new Set();
  #surfaceOverrides=new Map();
  #phase='resident';
  #run=0;
  #offset=0;
  #tile=0;
  #dirty=new Set();
  #operations=0;

  constructor(world,definition,{resident=true,regenerate=null}={}) {
    if(typeof resident!=='boolean')throw new TypeError('Expected initial band residency');
    this.#definition=validateExternalTerrainDefinition(definition);
    if(!world || world.chunkEdge!==this.#definition.chunkEdge) {
      throw new TypeError('Expected the existing authoritative V2 world');
    }
    if(regenerate!==null&&typeof regenerate!=='function')throw new TypeError('Expected terrain definition factory');
    this.#world=world;
    this.#regenerate=regenerate;
    this.#signature=definitionSignature(this.#definition);
    this.#phase=resident?'resident':'evicted';
  }

  get retainedDefinition() {
    return this.#definition?{runs:this.#definition.runs.length,
      microTiles:this.#definition.surfaceTiles?.length??0}:null;
  }

  get progress() {
    return Object.freeze({phase:this.#phase,operations:this.#operations,
      removedCells:this.#removed.size,surfaceOverrides:this.#surfaceOverrides.size,
      done:['resident','evicted'].includes(this.#phase)});
  }

  get dirtyChunks() {
    if(!this.progress.done)throw new Error('Terrain residency transition incomplete');
    return new Set(this.#dirty);
  }

  beginEviction() {
    if(this.#phase!=='resident')throw new Error('Band is not resident');
    this.#removed.clear();
    this.#surfaceOverrides.clear();
    this.#begin('evicting');
  }

  beginReload() {
    if(this.#phase!=='evicted')throw new Error('Band is not evicted');
    const definition=this.#definition??validateExternalTerrainDefinition(this.#regenerate());
    if(definitionSignature(definition)!==this.#signature)throw new Error('Regenerated terrain definition changed');
    const tiles=definition.surfaceTiles??[];
    // Conservative admission before the first world mutation.
    if(this.#world.microSurfaceCount+tiles.length>this.#world.microSurfaceCapacity)
      throw new RangeError('Reload exceeds resident micro surface budget');
    this.#definition=definition;
    this.#begin('reloading');
  }

  #begin(phase) {
    this.#phase=phase;
    this.#run=0;this.#offset=0;this.#tile=0;
    this.#operations=0;this.#dirty.clear();
  }

  #mark(x,y,z) {
    markDirtyForEditedVoxel(this.#dirty,this.#world.chunkEdge,x,y,z);
  }

  #captureSurface(tile) {
    const {x,y,z,levels}=tile;
    if(!this.#world.get(x,y,z))return; // Removed parents are captured by the run pass.
    const actual=this.#world.microSurfaceTile(x,y,z);
    if(!actual || !actual.every((value,i)=>value===levels[i]))
      this.#surfaceOverrides.set(key(x,y,z),actual?Array.from(actual):null);
  }

  #visitCell(run) {
    const x=run.x+this.#offset,{y,z,material}=run;
    const id=key(x,y,z),actual=this.#world.get(x,y,z);
    if(this.#phase==='evicting') {
      if(actual===0)this.#removed.add(id);
      else {
        if(actual!==material)throw new Error('Unsupported non-destructive terrain mutation');
        this.#world.set(x,y,z,0);
        this.#mark(x,y,z);
      }
    } else {
      if(actual!==0)throw new Error('Reload would overwrite authoritative occupancy');
      if(!this.#removed.has(id)) {
        this.#world.set(x,y,z,material);
        this.#mark(x,y,z);
      }
    }
    if(++this.#offset===run.length){this.#offset=0;this.#run++;}
  }

  #restoreSurface(tile) {
    const {x,y,z,levels}=tile;
    if(!this.#world.get(x,y,z))return;
    const id=key(x,y,z);
    const actual=this.#surfaceOverrides.has(id)?this.#surfaceOverrides.get(id):levels;
    if(actual!==null) {
      this.#world.setMicroSurfaceTile(x,y,z,actual);
      this.#mark(x,y,z);
    }
  }

  step(maxCells=512) {
    if(!Number.isSafeInteger(maxCells)||maxCells<1||maxCells>MAX_INITIAL_TERRAIN_STEP_CELLS)
      throw new RangeError('Invalid bounded residency budget');
    if(this.progress.done)return this.progress;
    const {runs,surfaceTiles:tiles=[]}=this.#definition;
    let remaining=maxCells;
    while(remaining>0) {
      // Capture detail before any parent deletion invalidates its mask.
      if(this.#phase==='evicting'&&this.#tile<tiles.length) {
        this.#captureSurface(tiles[this.#tile++]);
      } else if(this.#run<runs.length) {
        this.#visitCell(runs[this.#run]);
      } else if(this.#phase==='reloading'&&this.#tile<tiles.length) {
        this.#restoreSurface(tiles[this.#tile++]);
      } else break;
      remaining--;this.#operations++;
    }
    if(this.#run===runs.length&&this.#tile===tiles.length) {
      this.#phase=this.#phase==='evicting'?'evicted':'resident';
      if(this.#phase==='evicted'&&this.#regenerate)this.#definition=null;
      if(this.#phase==='resident') {
        this.#removed.clear();this.#surfaceOverrides.clear();
      }
    }
    return this.progress;
  }
}
