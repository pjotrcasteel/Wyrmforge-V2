import {markDirtyForEditedVoxel} from './chunk-dirty.mjs';
import {V2_BEDROCK_MATERIAL} from './terrain-edit-ledger.mjs';
import {isCurrentTerrainSupportCandidate} from './terrain-support-scan.mjs';
import {VoxelWorld} from './voxel-world.mjs';

const MAX_CLUSTERS=8;
const MAX_DYNAMIC_CELLS=512;

// Opt-in handoff for a single VoxelWorld. Static terrain leaves the world
// before the immutable payload becomes visible to Physics consumers.
export class TerrainClusterHandoff {
  #world;
  #bodies=[];
  #cellCount=0;

  constructor(world){
    if(!(world instanceof VoxelWorld))throw new TypeError('Expected an authoritative V2 voxel world');
    this.#world=world;
  }

  get bodies(){return this.#bodies.slice();}
  isBoundTo(world){return this.#world===world;}

  detach(candidate){
    const world=this.#world;
    if(!isCurrentTerrainSupportCandidate(world,candidate))return {status:'stale-candidate'};
    const {cells,bounds}=candidate;
    if(this.#bodies.length>=MAX_CLUSTERS||this.#cellCount+cells.length>MAX_DYNAMIC_CELLS){
      return {status:'capacity'};
    }
    const dirty=new Set();
    for(const {x,y,z,material} of cells){
      // Full-voxel payloads cannot preserve a partial surface or an invalidated
      // tile on the solid beneath them. Defer until the payload represents both.
      if(material===V2_BEDROCK_MATERIAL||world.get(x,y,z)!==material||
          world.microSurfaceTile(x,y,z)||world.microSurfaceTile(x,y-1,z)){
        return {status:'ineligible-terrain'};
      }
      markDirtyForEditedVoxel(dirty,world.chunkEdge,x,y,z);
    }
    const body=Object.freeze({id:this.#bodies.length+1,cells,bounds});
    const dirtyChunks=Object.freeze([...dirty].sort());
    for(const {x,y,z} of cells)world.set(x,y,z,0);
    this.#bodies.push(body);
    this.#cellCount+=cells.length;
    return {status:'detached',body,dirtyChunks,worldRevision:world.revision};
  }
}
