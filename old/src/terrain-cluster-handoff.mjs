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
  #preserveMicroSurfaces;

  constructor(world,{preserveMicroSurfaces=false}={}){
    if(!(world instanceof VoxelWorld))throw new TypeError('Expected an authoritative V2 voxel world');
    this.#world=world;
    this.#preserveMicroSurfaces=preserveMicroSurfaces;
  }

  get bodies(){return this.#bodies.slice();}
  isBoundTo(world){return this.#world===world;}

  #prepare(candidate){
    const world=this.#world;
    if(!isCurrentTerrainSupportCandidate(world,candidate))return {status:'stale-candidate'};
    const dirty=new Set(),payload=[];
    for(const cell of candidate.cells){
      const {x,y,z,material}=cell;
      if(material===V2_BEDROCK_MATERIAL||world.get(x,y,z)!==material||world.microSurfaceTile(x,y-1,z)){
        return {status:'ineligible-terrain'};
      }
      const levels=world.microSurfaceTile(x,y,z);
      if(levels&&!this.#preserveMicroSurfaces)return {status:'ineligible-terrain'};
      payload.push(levels?Object.freeze({...cell,levels:Object.freeze(Array.from(levels))}):cell);
      markDirtyForEditedVoxel(dirty,world.chunkEdge,x,y,z);
    }
    return {status:'ready',cells:Object.freeze(payload),bounds:candidate.bounds,dirty};
  }

  isEligibleCandidate(candidate){return this.#prepare(candidate).status==='ready';}

  detach(candidate){
    const result=this.detachBatch([candidate]);
    if(result.status!=='detached')return result;
    const {bodies,dirtyChunks,worldRevision}=result;
    return {status:'detached',body:bodies[0],dirtyChunks,worldRevision};
  }

  detachBatch(candidates){
    if(!Array.isArray(candidates)||!candidates.length)throw new TypeError('Expected terrain support candidates');
    if(this.#bodies.length+candidates.length>MAX_CLUSTERS)return {status:'capacity'};
    const prepared=[],dirty=new Set(),coordinates=new Set();
    for(const candidate of candidates){
      const plan=this.#prepare(candidate);
      if(plan.status!=='ready')return plan;
      for(const {x,y,z} of plan.cells){
        const key=x+','+y+','+z;
        if(coordinates.has(key))return {status:'overlapping-candidates'};
        coordinates.add(key);
        if(this.#cellCount+coordinates.size>MAX_DYNAMIC_CELLS)return {status:'capacity'};
      }
      for(const chunk of plan.dirty)dirty.add(chunk);
      prepared.push(plan);
    }
    const bodies=prepared.map(({cells,bounds})=>Object.freeze({id:this.#nextId++,cells,bounds}));
    // All proofs refer to the same revision. Transfer every cell only after
    // every candidate and the combined registry capacity have been checked.
    for(const {cells} of bodies)for(const {x,y,z} of cells)this.#world.set(x,y,z,0);
    this.#bodies.push(...bodies);
    this.#cellCount+=coordinates.size;
    return {status:'detached',bodies:Object.freeze(bodies),dirtyChunks:Object.freeze([...dirty].sort()),
      worldRevision:this.#world.revision};
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
    let supported=false,tileCount=0;
    for(const {x,y,z,material,levels} of body.cells){
      const targetY=y+offsetY;
      if(!isKnown(x,targetY,z)||!isKnown(x,targetY-1,z)||world.get(x,targetY,z)!==0||
          world.microSurfaceTile(x,targetY-1,z)){
        return {status:'blocked-settlement'};
      }
      if(world.get(x,targetY-1,z)!==0)supported=true;
      if(levels){
        if(!isKnown(x,targetY+1,z)||world.get(x,targetY+1,z)!==0){
          return {status:'blocked-settlement'};
        }
        tileCount++;
      }
      cells.push(Object.freeze({x,y:targetY,z,material,...(levels?{levels}:{})}));
      markDirtyForEditedVoxel(dirty,world.chunkEdge,x,targetY,z);
    }
    if(world.revision!==revision)return {status:'stale-settlement'};
    if(!supported)return {status:'blocked-settlement'};
    if(world.microSurfaceCount+tileCount>world.microSurfaceCapacity)return {status:'surface-capacity'};
    const dirtyChunks=Object.freeze([...dirty].sort());
    // Synchronous ownership transfer. No callback runs between release and write.
    this.#bodies.splice(index,1);
    this.#cellCount-=body.cells.length;
    for(const {x,y,z,material} of cells)world.set(x,y,z,material);
    for(const {x,y,z,levels} of cells){
      if(levels)world.setMicroSurfaceTile(x,y,z,levels);
    }
    return {status:'settled',id:body.id,cells:Object.freeze(cells),dirtyChunks,worldRevision:world.revision};
  }
}
