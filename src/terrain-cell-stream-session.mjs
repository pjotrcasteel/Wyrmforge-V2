import {V2TerrainResidencySet} from './terrain-residency-set.mjs';
import {TerrainViewResidencyPolicy} from './terrain-view-residency-policy.mjs';

// Coordinates one write/mesh/upload flight for a Voxel world. Renderer and
// physics clients remain outside the session and use their own authorities.
// A ticket is a session-local capability, never a worker message ID.
export class TerrainCellStreamSession {
  #policy;
  #residency;
  #cells;
  #registered=new Set();
  #flight=null;

  constructor(world,cells,{limit=48,preload=8,retain=16,removedCells=null,initialResidentIds=[]}={}){
    this.#policy=new TerrainViewResidencyPolicy(cells,{limit,preload,retain});
    this.#residency=new V2TerrainResidencySet(world,{residentLimit:limit,
      maxBands:Math.max(cells.length,limit),removedCells});
    this.#cells=new Map(cells.map(cell=>[cell.id,cell.definition]));
    for(const id of initialResidentIds)this.#register(id,true);
  }

  get metrics(){
    const base=this.#residency.metrics;
    return {...base,transition:this.#flight?{...base.transition,phase:this.#flight.phase}:null};
  }

  begin({view,protectedIds=[]}){
    const {job,reason}=this.#policy.next({view,protectedIds,
      residentIds:this.#residency.residentIds,busy:Boolean(this.#flight)});
    if(!job)return {ticket:null,reason};
    this.#register(job.id,false);
    this.#residency.begin(job.id,job.action,{protectedIds:[...protectedIds]});
    const ticket=Object.freeze({...job});
    this.#flight={ticket,phase:'writing',dirty:null};
    return {ticket,reason};
  }

  #register(id,resident){
    if(this.#registered.has(id))return;
    const regenerate=()=>this.#cells.get(id);
    this.#residency.register(id,regenerate(),{resident,regenerate});
    this.#registered.add(id);
  }

  get storageMetrics(){return this.#residency.storageMetrics;}

  write(ticket,maxCells){
    if(!this.#matches(ticket,'writing'))return null;
    const progress=this.#residency.step(maxCells);
    if(progress.phase==='awaiting-mesh'){
      this.#flight.phase='awaiting-mesh';
      this.#flight.dirty=[...this.#residency.dirtyChunks].sort();
    }
    return {...progress,dirtyChunks:this.#flight.dirty?.slice()??null};
  }

  acknowledgeMeshes(ticket,processedChunkIds){
    if(!this.#matches(ticket,'awaiting-mesh'))return false;
    const processed=new Set(processedChunkIds);
    const dirty=this.#flight.dirty;
    if(processed.size!==dirty.length||dirty.some(id=>!processed.has(id)))return false;
    this.#flight.phase='awaiting-upload';
    return true;
  }

  acknowledgeUpload(ticket){
    if(!this.#matches(ticket,'awaiting-upload'))return false;
    this.#residency.publish();
    this.#flight=null;
    return true;
  }

  #matches(ticket,phase){return this.#flight?.ticket===ticket&&this.#flight.phase===phase;}
}
