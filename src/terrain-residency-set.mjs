// A bounded residency coordinator for native authored V2 terrain bands.
// WorldGen supplies IDs and non-overlapping definitions; the caller chooses
// the desired graph neighborhood and protects the actor/camera/active casts.
// Geometry remains in the original VoxelWorld. Mesh publication is explicit.
import {V2TerrainBandResidency} from './terrain-band-residency.mjs';

export class V2TerrainResidencySet {
  #world;
  #bands=new Map();
  #limit;
  #maxBands;
  #job=null;
  #peak=0;
  #evictions=0;
  #loads=0;

  constructor(world,{residentLimit=3,maxBands=14}={}) {
    if(!Number.isSafeInteger(residentLimit)||residentLimit<1||residentLimit>5||
        !Number.isSafeInteger(maxBands)||maxBands<residentLimit||maxBands>40)
      throw new RangeError('Invalid bounded residency limits');
    this.#world=world;this.#limit=residentLimit;this.#maxBands=maxBands;
  }

  register(id,definition,{resident=false,regenerate=null}={}) {
    if(this.#job)throw new Error('Cannot register during residency transition');
    if(typeof id!=='string'||!id||this.#bands.has(id)||this.#bands.size>=this.#maxBands)
      throw new RangeError('Invalid or duplicate terrain band ID');
    if(resident && this.residentIds.length>=this.#limit)
      throw new RangeError('Resident terrain band limit exceeded');
    this.#bands.set(id,new V2TerrainBandResidency(this.#world,definition,{resident,regenerate}));
    this.#peak=Math.max(this.#peak,this.residentIds.length);
  }

  get residentIds() {
    return [...this.#bands].filter(([id,band])=>
      band.progress.phase==='resident'&&this.#job?.id!==id).map(([id])=>id);
  }

  get metrics() {
    const job=this.#job;
    return Object.freeze({residentIds:this.residentIds,registered:this.#bands.size,
      peakResident:this.#peak,limit:this.#limit,evictions:this.#evictions,loads:this.#loads,
      transition:job?{id:job.id,action:job.action,phase:job.phase,
        operations:job.band.progress.operations}:null});
  }

  get storageMetrics() {
    let definitions=0,runs=0,microTiles=0,removedCells=0,surfaceOverrides=0;
    for(const band of this.#bands.values()){
      const retained=band.retainedDefinition;
      if(retained){definitions++;runs+=retained.runs;microTiles+=retained.microTiles;}
      removedCells+=band.progress.removedCells;
      surfaceOverrides+=band.progress.surfaceOverrides;
    }
    return {definitions,runs,microTiles,removedCells,surfaceOverrides};
  }

  begin(id,action,{protectedIds=[]}={}) {
    if(this.#job)throw new Error('Residency transition already running');
    const band=this.#bands.get(id);
    if(!band||!['load','evict'].includes(action))
      throw new RangeError('Invalid terrain transition');
    if(action==='evict') {
      if(protectedIds.includes(id))throw new Error('Cannot evict protected terrain');
      band.beginEviction();
    } else {
      if(this.residentIds.length>=this.#limit)
        throw new RangeError('Resident terrain band limit exceeded');
      band.beginReload();
    }
    this.#job={id,action,band,phase:'writing'};
  }

  step(maxCells=512) {
    const job=this.#job;
    if(!job||job.phase!=='writing')throw new Error('No writable residency transition');
    if(job.band.step(maxCells).done)job.phase='awaiting-mesh';
    return this.metrics.transition;
  }

  get dirtyChunks() {
    if(this.#job?.phase!=='awaiting-mesh')throw new Error('Terrain writes are incomplete');
    return this.#job.band.dirtyChunks;
  }

  // A host calls this after the current world's worker and GPU acknowledge
  // the dirty chunks. No second job or gameplay access to a loading band.
  publish() {
    if(this.#job?.phase!=='awaiting-mesh')throw new Error('Terrain writes are incomplete');
    if(this.#job.action==='load')this.#loads++;else this.#evictions++;
    this.#job=null;
    this.#peak=Math.max(this.#peak,this.residentIds.length);
    return this.metrics;
  }
}
