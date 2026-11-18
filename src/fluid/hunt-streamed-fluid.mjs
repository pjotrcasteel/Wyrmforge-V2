// Compose native WorldGen river channels and published Voxel terrain in
// Play Hunt. No browser, GPU, generator or authoritative solid state here.
// Whole-band graph residency only: 8m cell-preview residency needs a
// separate partial-region floor contract and must not use this host.
import {
  FLUID_SURFACE_SCHEMA,MAX_FLUID_COLUMNS,MAX_FLUID_FLIGHTS
} from './column-fluid-engine.mjs';
import {FluidRegionCheckpoints} from './fluid-region-checkpoints.mjs';
import {createWorldGenFluidEngine,attachWorldGenFluid} from './worldgen-fluid-adapter.mjs';

export class HuntStreamedFluid {
  #graph;
  #terrain;
  #checkpoints;
  #active=new Map();
  #disposers=new Map();
  #layouts=new Map();
  #steps=0;
  #revision=0;

  constructor({graph,terrain,identity}={}){
    if(!graph||typeof graph.region!=='function'||
        !terrain||typeof terrain.materialAt!=='function'||
        typeof terrain.subscribe!=='function'){
      throw new TypeError('Expected authored WorldGen graph and published Voxel terrain port');
    }
    this.#graph=graph;
    this.#terrain=terrain;
    this.#checkpoints=new FluidRegionCheckpoints(identity);
  }

  get activeIds(){return [...this.#active.keys()];}
  get steps(){return this.#steps;}
  get revision(){return this.#revision;}
  get wetCount(){return [...this.#active.values()].reduce((n,f)=>n+f.wetCount,0);}
  get totalDepth(){return [...this.#active.values()].reduce((n,f)=>n+f.totalDepth,0);}
  get inFlightCount(){return [...this.#active.values()].reduce((n,f)=>n+f.inFlightCount,0);}
  get columnCount(){return [...this.#active.values()].reduce((n,f)=>n+f.columnCount,0);}

  // Called before Voxel starts removing the region's solids.
  evict(id){
    if(!this.#active.has(id))return false;
    this.#checkpoints.close(id);
    this.#disposers.get(id)?.();
    this.#disposers.delete(id);
    this.#active.delete(id);
    this.#layouts.delete(id);
    this.#revision++;
    return true;
  }

  // Called only after Voxel has published fully resident *whole* bands,
  // committed its terrain-edit replay, and completed the renderer handshake.
  syncResident(regionIds){
    if(!Array.isArray(regionIds)||new Set(regionIds).size!==regionIds.length){
      throw new TypeError('Expected unique published WorldGen region IDs');
    }
    const published=new Set(regionIds);
    for(const id of this.#active.keys()){
      if(!published.has(id)){
        throw new Error('Water V2 must checkpoint before Voxel region eviction: '+id);
      }
    }
    let opened=0;
    for(const id of regionIds){
      if(this.#active.has(id))continue;
      const band=this.#graph.region(id);
      const layout=band.fluidLayout;
      if(!layout)continue;
      if(layout.riverChannels.length!==1||
          layout.riverChannels[0].kind!=='water'){
        throw new Error('Expected one native water channel per streamed Wet Forest region');
      }
      const fluid=this.#checkpoints.open(id,()=>
        createWorldGenFluidEngine(layout,this.#terrain).fluid);
      this.#active.set(id,fluid);
      this.#layouts.set(id,layout);
      this.#disposers.set(id,attachWorldGenFluid(this.#terrain,fluid));
      opened++;
    }
    if(opened)this.#revision++;
    return opened;
  }

  step({budget=96}={}){
    const result=this.#checkpoints.step({budget});
    if(result.regions)this.#steps++;
    return result;
  }

  sample(x,z){
    for(const fluid of this.#active.values()){
      const cell=fluid.sample(x,z);
      if(cell)return cell;
    }
    return null;
  }

  snapshotSurface(){
    if(!this.#active.size)return null;
    const surfaces=[...this.#active.values()].map(fluid=>fluid.snapshotSurface());
    const cells=surfaces.flatMap(s=>s.cells);
    const flights=surfaces.flatMap(s=>s.flights);
    if(cells.length>MAX_FLUID_COLUMNS||flights.length>MAX_FLUID_FLIGHTS){
      throw new RangeError('Combined streamed water exceeds the renderer snapshot budget');
    }
    const bounds=this.presentationLayout().footprint;
    return Object.freeze({
      schema:FLUID_SURFACE_SCHEMA,kind:'water',step:this.#steps,
      bounds:Object.freeze({
        minX:bounds.minX,maxX:bounds.maxX,
        minZ:bounds.minZ,maxZ:bounds.maxZ
      }),
      cells:Object.freeze(cells),flights:Object.freeze(flights)
    });
  }

  presentationLayout(){
    const layouts=[...this.#layouts.values()];
    if(!layouts.length)return null;
    const first=layouts[0];
    const footprint=Object.freeze({
      minX:Math.min(...layouts.map(l=>l.footprint.minX)),
      maxX:Math.max(...layouts.map(l=>l.footprint.maxX)),
      minZ:Math.min(...layouts.map(l=>l.footprint.minZ)),
      maxZ:Math.max(...layouts.map(l=>l.footprint.maxZ)),
      minY:Math.min(...layouts.map(l=>l.footprint.minY)),
      maxY:Math.max(...layouts.map(l=>l.footprint.maxY))
    });
    return Object.freeze({
      footprint,riverChannels:first.riverChannels
    });
  }

  exportCheckpoint(){return this.#checkpoints.exportCheckpoint();}
  importCheckpoint(value){
    if(this.#active.size)throw new Error('Restore before publishing streamed water regions');
    this.#checkpoints.importCheckpoint(value);
  }

  dispose(){
    for(const id of [...this.#active.keys()])this.evict(id);
  }
}
