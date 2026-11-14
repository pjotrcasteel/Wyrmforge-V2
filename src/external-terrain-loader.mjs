// V2.6 -> V2.8: platform-neutral initialization of externally planned 3D terrain.
// The future Map Generation V2 engine owns the site recipe and produces runs.
// This module owns no generation, V1 adapters, WebGL calls, or browser scheduling.
import { VoxelWorld, CHUNK_EDGE_CANDIDATES, MAX_SCENE_SEED } from './voxel-world.mjs';
import { TerrainEditLedger } from './terrain-edit-ledger.mjs';
import { V2TerrainPort } from './terrain-integration-port.mjs';
import { validateMicroSurfaceTiles,MAX_MICRO_SURFACE_TILES } from './microvoxel-surface.mjs';
import { markDirtyForEditedVoxel } from './chunk-dirty.mjs';

export const TERRAIN_INITIALIZATION_SCHEMA = 'voxel-v2.terrain-initialization.v1';
export const TERRAIN_INITIALIZATION_MICRO_SCHEMA='voxel-v2.terrain-initialization.v2';
export const MAX_INITIAL_TERRAIN_RUNS = 8192;
export const MAX_INITIAL_TERRAIN_CELLS = 1048576;
export const MAX_INITIAL_TERRAIN_COORDINATE = 8192;
export const MAX_INITIAL_TERRAIN_STEP_CELLS = 4096;
const NAME = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/;

function validateName(value, label) {
  if (typeof value !== 'string' || !NAME.test(value)) {
    throw new TypeError(label + ' must be a bounded stable identifier');
  }
}

function boundedCoordinate(value) {
  return Number.isSafeInteger(value) &&
    value >= -MAX_INITIAL_TERRAIN_COORDINATE &&
    value <= MAX_INITIAL_TERRAIN_COORDINATE;
}

/**
 * Validate every run before allocating the world, and canonicalize row order.
 * Each run is an X-directed inclusive solid span (not a heightmap), so arches,
 * overhangs, tunnels, and negative chunk coordinates retain full 3D authority.
 */
export function validateExternalTerrainDefinition(definition) {
  if (!definition || typeof definition !== 'object' ||
      ![TERRAIN_INITIALIZATION_SCHEMA,TERRAIN_INITIALIZATION_MICRO_SCHEMA]
        .includes(definition.schema)) {
    throw new TypeError('Unsupported V2 external terrain initialization schema');
  }
  validateName(definition.siteId, 'Site ID');
  validateName(definition.generatorVersion, 'Generator version');
  if (!CHUNK_EDGE_CANDIDATES.includes(definition.chunkEdge) ||
      !Number.isSafeInteger(definition.seed) || definition.seed < 0 ||
      definition.seed > MAX_SCENE_SEED ||
      !Array.isArray(definition.runs) || definition.runs.length === 0 ||
      definition.runs.length > MAX_INITIAL_TERRAIN_RUNS) {
    throw new RangeError('Invalid chunk pitch, seed, or bounded run count');
  }

  let cells = 0;
  const runs = definition.runs.map(run => {
    if (!run || ![run.x, run.y, run.z].every(boundedCoordinate) ||
        !Number.isSafeInteger(run.length) || run.length < 1 ||
        run.length > 256 || !boundedCoordinate(run.x + run.length - 1) ||
        !Number.isSafeInteger(run.material) || run.material < 1 ||
        run.material > 255) {
      throw new RangeError('Invalid 3D terrain run or material');
    }
    cells += run.length;
    if (cells > MAX_INITIAL_TERRAIN_CELLS) {
      throw new RangeError('External terrain initialization cell budget exceeded');
    }
    // Reconstruct a strictly typed copy; the generator cannot mutate a
    // pending initialization by changing the original definition later.
    return Object.freeze({
      x: run.x, y: run.y, z: run.z,
      length: run.length, material: run.material
    });
  });
  runs.sort((a,b) => a.y-b.y || a.z-b.z || a.x-b.x);
  for(let i=1;i<runs.length;i++) {
    const previous=runs[i-1],current=runs[i];
    if (previous.y===current.y && previous.z===current.z &&
        current.x < previous.x+previous.length) {
      throw new RangeError('External terrain contains overlapping 3D runs');
    }
  }
  const surfaceTiles=definition.schema===TERRAIN_INITIALIZATION_MICRO_SCHEMA
    ? validateMicroSurfaceTiles(definition.surfaceTiles)
    : Object.freeze([]);
  return Object.freeze({
    schema:definition.schema,
    siteId:definition.siteId,
    generatorVersion:definition.generatorVersion,
    seed:definition.seed,
    chunkEdge:definition.chunkEdge,
    totalCells:cells,
    runs:Object.freeze(runs),
    ...(definition.schema===TERRAIN_INITIALIZATION_MICRO_SCHEMA
      ? {surfaceTiles} : {})
  });
}

/**
 * A bounded, activation-safe loader for an independent World Generation V2
 * result. No incomplete world/port is visible to consumers. Call loadStep()
 * from a host-specific scheduler; never do a large synchronous world rebuild
 * on a mobile frame. The unit budget bounds cell operations, NOT CPU time.
 */
export class V2ExternalTerrainLoader {
  #definition;
  #world;
  #epoch;
  #ledger=null;
  #port=null;
  #runIndex=0;
  #runOffset=0;
  #surfaceIndex=0;
  #loaded=0;
  #closed=false;

  constructor(definition,{epoch=1}={}) {
    if(!Number.isSafeInteger(epoch) || epoch<1) {
      throw new RangeError('Expected a positive V2 terrain world epoch');
    }
    this.#definition=validateExternalTerrainDefinition(definition);
    this.#epoch=epoch;
    this.#world=new VoxelWorld({chunkEdge:this.#definition.chunkEdge});
  }

  get progress() {
    return Object.freeze({
      siteId:this.#definition.siteId,
      loadedCells:this.#loaded,
      totalCells:this.#definition.totalCells,
      done:this.#runIndex===this.#definition.runs.length &&
        this.#surfaceIndex===(this.#definition.surfaceTiles?.length??0) &&
        !this.#closed,
      surfaceTilesLoaded:this.#surfaceIndex,
      surfaceTilesTotal:this.#definition.surfaceTiles?.length??0,
      closed:this.#closed
    });
  }

  loadStep(maxCells=MAX_INITIAL_TERRAIN_STEP_CELLS) {
    if (this.#closed) throw new Error('External terrain loader is unloaded');
    if (!Number.isSafeInteger(maxCells) || maxCells<1 ||
        maxCells>MAX_INITIAL_TERRAIN_STEP_CELLS) {
      throw new RangeError('External terrain step cell budget exceeded');
    }
    let remaining=maxCells;
    while(remaining>0 && this.#runIndex<this.#definition.runs.length) {
      const run=this.#definition.runs[this.#runIndex];
      const count=Math.min(remaining,run.length-this.#runOffset);
      for(let offset=0;offset<count;offset++) {
        this.#world.set(run.x+this.#runOffset+offset,run.y,run.z,run.material);
      }
      this.#loaded+=count;
      remaining-=count;
      this.#runOffset+=count;
      if(this.#runOffset===run.length) {
        this.#runIndex++;
        this.#runOffset=0;
      }
    }
    if(this.#runIndex===this.#definition.runs.length &&
        this.#definition.surfaceTiles) {
      // Microtile occupancy is budgeted alongside coarse voxel writes.
      while(remaining>0 &&
          this.#surfaceIndex<this.#definition.surfaceTiles.length) {
        const tile=this.#definition.surfaceTiles[this.#surfaceIndex++];
        this.#world.setMicroSurfaceTile(tile.x,tile.y,tile.z,tile.levels);
        remaining--;
      }
    }
    if(this.progress.done && !this.#port) {
      this.#ledger=new TerrainEditLedger(this.#world);
      this.#port=new V2TerrainPort(this.#world,this.#ledger,{epoch:this.#epoch});
    }
    return this.progress;
  }

  // A canonical serializable copy for V2.7 replay. Never hand out the
  // private retained generator runs: consumer mutations must stay isolated.
  exportDefinition() {
    if(this.#closed) throw new Error('External terrain loader is unloaded');
    return {
      schema:this.#definition.schema,
      siteId:this.#definition.siteId,
      generatorVersion:this.#definition.generatorVersion,
      seed:this.#definition.seed,
      chunkEdge:this.#definition.chunkEdge,
      runs:this.#definition.runs.map(run=>({...run})),
      ...(this.#definition.surfaceTiles
        ? {surfaceTiles:this.#definition.surfaceTiles.map(tile=>({
          x:tile.x,y:tile.y,z:tile.z,levels:[...tile.levels]
        }))} : {})
    };
  }

  get terrain() {
    if(this.#closed) throw new Error('External terrain loader is unloaded');
    if(!this.#port) throw new Error('External terrain is not fully initialized');
    return Object.freeze({
      source:Object.freeze({
        schema:this.#definition.schema,
        siteId:this.#definition.siteId,
        generatorVersion:this.#definition.generatorVersion,
        seed:this.#definition.seed,
        chunkEdge:this.#definition.chunkEdge
      }),
      world:this.#world,
      ledger:this.#ledger,
      port:this.#port
    });
  }

  unload() {
    if(this.#closed) return;
    this.#closed=true;
    this.#port?.dispose();
    this.#world.clear();
    this.#ledger=null;
    this.#port=null;
  }
}


// Add a validated, disjoint northward band to the SAME initialized Voxel V2
// authority. The host owns activation: keep actor bounds at the old published
// footprint until this writer, the worker and GPU upload queue have finished.
// The existing ledger and port survive; streaming is not a destructive edit.
export class V2ExternalTerrainAppend {
  #world;
  #definition;
  #run=0;
  #offset=0;
  #tile=0;
  #dirty=new Set();
  #written=0;
  constructor(world,definition,{previousMinZ}={}) {
    this.#definition=validateExternalTerrainDefinition(definition);
    if(!world || world.chunkEdge!==this.#definition.chunkEdge ||
        !Number.isSafeInteger(previousMinZ) || this.#definition.runs.some(r=>r.z>=previousMinZ) ||
        this.#definition.surfaceTiles?.some(t=>t.z>=previousMinZ)) {
      throw new RangeError('Streamed band must be north of the published footprint');
    }
    if(world.microSurfaceCount+(this.#definition.surfaceTiles?.length??0)>MAX_MICRO_SURFACE_TILES)
      throw new RangeError('Streamed band exceeds resident microtile capacity');
    // The caller supplies an unopened band; no pre-existing world may own
    // chunks wholly beyond that band boundary. Shared edge chunks are allowed.
    this.#world=world;
  }
  get progress() {
    return Object.freeze({loadedCells:this.#written,totalCells:this.#definition.totalCells,
      done:this.#run===this.#definition.runs.length &&
        this.#tile===(this.#definition.surfaceTiles?.length??0)});
  }
  get dirtyChunks() {
    if(!this.progress.done)throw new Error('Streamed terrain band is incomplete');
    return new Set(this.#dirty);
  }
  step(maxCells=512) {
    if(!Number.isSafeInteger(maxCells) || maxCells<1 || maxCells>MAX_INITIAL_TERRAIN_STEP_CELLS)
      throw new RangeError('Invalid streaming cell budget');
    let remaining=maxCells;
    while(remaining>0 && this.#run<this.#definition.runs.length) {
      const run=this.#definition.runs[this.#run];
      const x=run.x+this.#offset;
      if(this.#world.get(x,run.y,run.z)!==0)
        throw new Error('Streamed terrain would overwrite authoritative occupancy');
      this.#world.set(x,run.y,run.z,run.material);
      markDirtyForEditedVoxel(this.#dirty,this.#world.chunkEdge,x,run.y,run.z);
      this.#written++;remaining--;this.#offset++;
      if(this.#offset===run.length){this.#run++;this.#offset=0;}
    }
    const tiles=this.#definition.surfaceTiles??[];
    while(remaining>0 && this.#run===this.#definition.runs.length && this.#tile<tiles.length) {
      const tile=tiles[this.#tile++];
      this.#world.setMicroSurfaceTile(tile.x,tile.y,tile.z,tile.levels);
      markDirtyForEditedVoxel(this.#dirty,this.#world.chunkEdge,tile.x,tile.y,tile.z);
      remaining--;
    }
    return this.progress;
  }
}
