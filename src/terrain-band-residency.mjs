// H08-02B: bounded residency of one authored terrain band.
// The caller owns admission, movement safety, mesh publication and exclusive
// access while a transition runs. The world/port/edit ledger never change.
// Full-voxel additions have an explicit owner and share the write budget.
import {validateExternalTerrainDefinition,MAX_INITIAL_TERRAIN_STEP_CELLS} from './external-terrain-loader.mjs';
import {markDirtyForEditedVoxel} from './chunk-dirty.mjs';
import {V2_BEDROCK_MATERIAL} from './terrain-edit-ledger.mjs';

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
  #additions=new Map();
  #additionQueue=[];
  #additionIndex=0;
  #surfaceOverrides=new Map();
  #phase='resident';
  #run=0;
  #offset=0;
  #tile=0;
  #dirty=new Set();
  #operations=0;
  #savedRemovals;

  constructor(world,definition,{resident=true,regenerate=null,removedCells=null,addedCells=[]}={}) {
    if(typeof resident!=='boolean')throw new TypeError('Expected initial band residency');
    this.#definition=validateExternalTerrainDefinition(definition);
    if(!world || world.chunkEdge!==this.#definition.chunkEdge) {
      throw new TypeError('Expected the existing authoritative V2 world');
    }
    if(regenerate!==null&&typeof regenerate!=='function')throw new TypeError('Expected terrain definition factory');
    this.#world=world;
    this.#savedRemovals=removedCells;
    this.#regenerate=regenerate;
    this.#signature=definitionSignature(this.#definition);
    this.#phase=resident?'resident':'evicted';
    this.#rememberAdditions(addedCells,resident,512);
  }

  get retainedDefinition() {
    return this.#definition?{runs:this.#definition.runs.length,
      microTiles:this.#definition.surfaceTiles?.length??0}:null;
  }

  get progress() {
    return Object.freeze({phase:this.#phase,operations:this.#operations,
      removedCells:this.#removed.size,addedCells:this.#additions.size,surfaceOverrides:this.#surfaceOverrides.size,
      done:['resident','evicted'].includes(this.#phase)});
  }

  get dirtyChunks() {
    if(!this.progress.done)throw new Error('Terrain residency transition incomplete');
    return new Set(this.#dirty);
  }

  get addedCellKeys(){return this.#additions.keys();}

  pruneMissingAddedCells(){
    if(this.#phase!=='resident')return;
    for(const [id,{x,y,z}] of this.#additions){
      if(!this.#world.get(x,y,z))this.#additions.delete(id);
    }
  }

  trackAddedCells(cells){
    if(this.#phase!=='resident')throw new Error('Added voxels require a resident owner');
    this.#rememberAdditions(cells,true,256);
  }

  #rememberAdditions(cells,resident,limit){
    if(!Array.isArray(cells)||cells.length>limit)throw new RangeError('Invalid added voxel batch');
    const next=new Map(this.#additions);
    for(const {x,y,z,material} of cells){
      if(![x,y,z].every(Number.isSafeInteger)||!Number.isInteger(material)||material<1||material>255||
          material===V2_BEDROCK_MATERIAL||resident&&(this.#world.get(x,y,z)!==material||
          this.#world.microSurfaceTile(x,y,z))){
        throw new RangeError('Expected a committed full voxel addition');
      }
      next.set(key(x,y,z),{x,y,z,material});
    }
    if(next.size>512)throw new RangeError('Terrain band addition capacity exceeded');
    this.#additions=next;
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
    this.#additionQueue=[...this.#additions.values()];this.#additionIndex=0;
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
      if(actual===0||this.#additions.has(id))this.#removed.add(id);
      else {
        if(actual!==material)throw new Error('Unsupported non-destructive terrain mutation');
        this.#world.set(x,y,z,0);
        this.#mark(x,y,z);
      }
    } else {
      if(actual!==0)throw new Error('Reload would overwrite authoritative occupancy');
      if(!this.#removed.has(id)&&!this.#additions.has(id)&&
          (material===V2_BEDROCK_MATERIAL||!this.#savedRemovals?.has(id))) {
        this.#world.set(x,y,z,material);
        this.#mark(x,y,z);
      }
    }
    if(++this.#offset===run.length){this.#offset=0;this.#run++;}
  }

  #restoreSurface(tile) {
    const {x,y,z,levels}=tile;
    const id=key(x,y,z);
    if(!this.#world.get(x,y,z)||this.#world.get(x,y+1,z)||this.#additions.has(id))return;
    const actual=this.#surfaceOverrides.has(id)?this.#surfaceOverrides.get(id):levels;
    if(actual!==null) {
      this.#world.setMicroSurfaceTile(x,y,z,actual);
      this.#mark(x,y,z);
    }
  }

  #visitAddition({x,y,z,material}){
    const actual=this.#world.get(x,y,z);
    if(this.#phase==='evicting'){
      if(!actual){
        this.#additions.delete(key(x,y,z));
        return;
      }
      if(actual!==material||this.#world.microSurfaceTile(x,y,z)){
        throw new Error('Unsupported mutation of a tracked terrain addition');
      }
      this.#world.set(x,y,z,0);
    }else{
      if(actual!==0)throw new Error('Added voxel would overwrite authoritative occupancy');
      this.#world.set(x,y,z,material);
    }
    this.#mark(x,y,z);
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
      } else if(this.#additionIndex<this.#additionQueue.length) {
        this.#visitAddition(this.#additionQueue[this.#additionIndex++]);
      } else if(this.#phase==='reloading'&&this.#tile<tiles.length) {
        this.#restoreSurface(tiles[this.#tile++]);
      } else break;
      remaining--;this.#operations++;
    }
    if(this.#run===runs.length&&this.#tile===tiles.length&&this.#additionIndex===this.#additionQueue.length) {
      this.#additionQueue=[];
      this.#phase=this.#phase==='evicting'?'evicted':'resident';
      if(this.#phase==='evicted'&&this.#regenerate)this.#definition=null;
      if(this.#phase==='resident') {
        this.#removed.clear();this.#surfaceOverrides.clear();
      }
    }
    return this.progress;
  }
}
