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
  #nextId=1;

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
    const body=Object.freeze({id:this.#nextId++,cells,bounds});
    const dirtyChunks=Object.freeze([...dirty].sort());
    for(const {x,y,z} of cells)world.set(x,y,z,0);
    this.#bodies.push(body);
    this.#cellCount+=cells.length;
    return {status:'detached',body,dirtyChunks,worldRevision:world.revision};
  }

  // Physics supplies a revalidated, grid-aligned rest transform. The
  // handoff owns static publication and releases the body's capacity.
  settle(body,offsetY,isKnown){
    const index=this.#bodies.indexOf(body);
    if(index<0||!Number.isSafeInteger(offsetY)||offsetY>0||offsetY< -64||typeof isKnown!=='function'){
      return {status:'invalid-settlement'};
    }
    const world=this.#world,revision=world.revision;
    const dirty=new Set(),cells=[];
    let supported=false;
    for(const {x,y,z,material} of body.cells){
      const targetY=y+offsetY;
      if(!isKnown(x,targetY,z)||!isKnown(x,targetY-1,z)||world.get(x,targetY,z)!==0||
          world.microSurfaceTile(x,targetY-1,z)){
        return {status:'blocked-settlement'};
      }
      if(world.get(x,targetY-1,z)!==0)supported=true;
      cells.push(Object.freeze({x,y:targetY,z,material}));
      markDirtyForEditedVoxel(dirty,world.chunkEdge,x,targetY,z);
    }
    if(world.revision!==revision)return {status:'stale-settlement'};
    if(!supported)return {status:'blocked-settlement'};
    const dirtyChunks=Object.freeze([...dirty].sort());
    // Synchronous ownership transfer. No callback runs between release and write.
    this.#bodies.splice(index,1);
    this.#cellCount-=body.cells.length;
    for(const {x,y,z,material} of cells)world.set(x,y,z,material);
    return {status:'settled',id:body.id,cells:Object.freeze(cells),dirtyChunks,worldRevision:world.revision};
  }
}
