import {TerrainStreamCellBuilder} from './terrain-stream-cells.mjs';
import {TerrainCellStreamSession} from './terrain-cell-stream-session.mjs';
import {terrainViewFootprint} from './terrain-view-footprint.mjs';
import {containsHuntLandform} from './world-generation/hunt-landform-footprint.mjs';
import {projectVoxel} from './camera-presets.mjs';
import {HUNT_FIXED_STEP,HUNT_WALK_SPEED} from './hunt-play-runtime.mjs';

const LOOKAHEAD_SECONDS=1.5;
const at=(b,x,z)=>x>=b.minX&&x<b.maxX+1&&z>=b.minZ&&z<b.maxZ+1;
const visible=(b,v)=>b.minX<=v.maxX&&b.maxX+1>=v.minX&&b.minZ<=v.maxZ&&b.maxZ+1>=v.minZ;

export class HuntCellCatalog {
  #pending;
  #graph;
  #builder=null;
  #current;
  cells=[];
  height={minY:Infinity,maxY:-Infinity};
  constructor(graph){
    this.#graph=graph;
    this.#pending=[...graph.layout.regions,...graph.layout.links];
  }
  get done(){return !this.#pending.length&&!this.#builder;}
  step(){
    if(this.done)return;
    if(!this.#builder){
      this.#current=this.#pending.shift();
      const definition=this.#graph.materialize(this.#current.id).definition;
      for(const run of definition.runs){
        this.height.minY=Math.min(this.height.minY,run.y);
        this.height.maxY=Math.max(this.height.maxY,run.y+1);
      }
      this.#builder=new TerrainStreamCellBuilder(definition);
    }
    if(this.#builder.step(256).done){
      for(const cell of this.#builder.cells)this.cells.push({...cell,band:this.#current});
      this.#builder=null;
    }
  }
}

// Play Hunt translates camera and physics constraints into the generic
// streaming contract. Graph IDs still identify regions, props and objectives.
export class HuntCellResidency {
  #catalog;
  #graph;
  #session;
  #byId;
  #grid=new Map();
  #ticket=null;
  #published;
  #peakRegions=0;
  #entry;
  #ready=null;
  #encounterCells=new Map();
  #planningReason=null;

  constructor(world,graph,catalog,initialIds,{removedCells,entry}){
    this.#catalog=catalog;
    this.#graph=graph;
    this.#entry=entry;
    this.#byId=new Map(catalog.cells.map(cell=>[cell.id,cell]));
    for(const cell of catalog.cells){
      const key=cell.bounds.minX+','+cell.bounds.minZ;
      if(!this.#grid.has(key))this.#grid.set(key,[]);
      this.#grid.get(key).push(cell);
    }
    for(const region of graph.layout.regions.filter(band=>band.role==='horde')){
      const longitudinal=new Set(region.ports.filter(port=>port.direction==='north'||port.direction==='south')
        .map(port=>port.peerRegionId));
      const bands=new Set([region.id,...graph.layout.links.filter(link=>
        (link.fromId===region.id&&longitudinal.has(link.toId))||
        (link.toId===region.id&&longitudinal.has(link.fromId))).map(link=>link.id)]);
      this.#encounterCells.set(region.id,catalog.cells.filter(cell=>bands.has(cell.band.id)).map(cell=>cell.id));
    }
    const initialResidentIds=catalog.cells.filter(cell=>initialIds.includes(cell.band.id)).map(cell=>cell.id);
    this.#session=new TerrainCellStreamSession(world,catalog.cells,
      {limit:96,preload:8,retain:16,removedCells,initialResidentIds});
    this.#sync();
  }

  #sync(){
    this.#published=new Set(this.#session.metrics.residentIds);
    this.#peakRegions=Math.max(this.#peakRegions,this.metrics.residentRegions.length);
  }

  get metrics(){
    const {residentIds,...base}=this.#session.metrics;
    const bands=new Set(residentIds.map(id=>this.#byId.get(id).band));
    return {...base,residentIds:[...bands].map(band=>band.id),residentCellIds:residentIds,
      residentRegions:[...bands].filter(band=>band.role).map(band=>band.id),
      residentLinks:[...bands].filter(band=>!band.role).map(band=>band.id),
      peakRegions:this.#peakRegions};
  }
  get storageMetrics(){return this.#session.storageMetrics;}

  location(x,z){
    for(const band of [...this.#graph.layout.regions,...this.#graph.layout.links]){
      if(at(band.bounds,x,z))return band.id;
    }
    return null;
  }

  #at(x,z){
    const key=Math.floor(x/8)*8+','+Math.floor(z/8)*8;
    return (this.#grid.get(key)??[]).find(cell=>containsHuntLandform(cell.band,x,z));
  }
  publishedAt(x,z){return this.#published.has(this.#at(x,z)?.id);}

  constrainInput(actor,input){
    const {moveX=0,moveZ=0}=input;
    const speed=HUNT_WALK_SPEED*HUNT_FIXED_STEP/Math.max(1,Math.hypot(moveX,moveZ));
    const ok=(x,z)=>[-.65,.65].every(dx=>[-.65,.65].every(dz=>
      this.publishedAt(actor.x+x+dx,actor.z+z+dz)));
    const x=moveX*speed,z=moveZ*speed;
    if(ok(x,z)&&ok(x,0)&&ok(0,z))return {moveX,moveZ};
    if(ok(moveX*HUNT_WALK_SPEED*HUNT_FIXED_STEP,0))return {moveX,moveZ:0};
    if(ok(0,moveZ*HUNT_WALK_SPEED*HUNT_FIXED_STEP))return {moveX:0,moveZ};
    return {moveX:0,moveZ:0};
  }

  encounterReady(section){
    return this.#encounterCells.get(section)?.every(id=>this.#published.has(id))??false;
  }

  propRegionKey(id){
    return [...this.#published].filter(cellId=>this.#byId.get(cellId).band.id===id).sort().join('|');
  }

  covers(view){
    const rect=terrainViewFootprint(view,this.#catalog.height);
    return this.#catalog.cells.every(cell=>!visible(cell.bounds,rect)||this.#published.has(cell.id));
  }

  cameraHold(view){
    const bounds=terrainViewFootprint(view,this.#catalog.height);
    const missing=this.#catalog.cells.filter(cell=>visible(cell.bounds,bounds)&&!this.#published.has(cell.id));
    return {missingCellCount:missing.length,missingCellIds:missing.slice(0,8).map(cell=>cell.id),
      planningReason:this.#planningReason,transition:this.#session.metrics.transition};
  }

  next(actor,{view,displayedView,respawn,prepareEncounter,holdEncounterResidency,movement}){
    if(!view)return null;
    if(holdEncounterResidency&&!respawn&&this.covers(view)){
      this.#planningReason='encounter-hold';
      return null;
    }
    let target=view;
    if(respawn){
      const focus=projectVoxel(this.#entry.x,actor.y,this.#entry.z-2,view);
      target={...view,panX:view.panX+view.width/2-focus.x,panY:view.panY+view.height*.51-focus.y};
      if(this.publishedAt(this.#entry.x+.5,this.#entry.z-2)&&this.covers(target))return {action:'respawn'};
    }
    const bounds=terrainViewFootprint(target,this.#catalog.height);
    const old=terrainViewFootprint(displayedView??view,this.#catalog.height);
    const protectedIds=new Set();
    const section=this.location(actor.x,actor.z);
    for(const cell of this.#catalog.cells){
      if(!respawn&&visible(cell.bounds,old)&&this.#published.has(cell.id))protectedIds.add(cell.id);
    }
    const preparationCells=prepareEncounter&&!respawn?this.#encounterCells.get(section):null;
    for(const id of preparationCells??[])protectedIds.add(id);
    for(const dx of [-.65,.65])for(const dz of [-.65,.65]){
      const cell=this.#at(actor.x+dx,actor.z+dz);
      if(cell)protectedIds.add(cell.id);
    }
    let lookahead;
    const {moveX=0,moveZ=0}=movement??{};
    const magnitude=Math.hypot(moveX,moveZ);
    if(!respawn&&!preparationCells&&!holdEncounterResidency&&magnitude>=.2){
      const travel=HUNT_WALK_SPEED*LOOKAHEAD_SECONDS/Math.max(1,magnitude);
      // Translating the camera along the ground translates its footprint equally.
      const x=moveX*travel,z=moveZ*travel;
      lookahead={minX:bounds.minX+x,maxX:bounds.maxX+x,minZ:bounds.minZ+z,maxZ:bounds.maxZ+z};
    }
    const {ticket,reason}=this.#session.begin({view:bounds,lookahead,protectedIds});
    this.#planningReason=reason;
    return ticket;
  }

  begin(ticket){this.#ticket=ticket;this.#sync();}
  step(budget){
    const progress=this.#session.write(this.#ticket,budget);
    this.#ready=progress.dirtyChunks;
    return progress;
  }
  get dirtyChunks(){return new Set(this.#ready??[]);}
  publish(){
    // Host reaches here only after the worker result and renderer queue drain.
    if(!this.#session.acknowledgeMeshes(this.#ticket,this.#ready)||
        !this.#session.acknowledgeUpload(this.#ticket))throw new Error('Cell publication failed');
    this.#ticket=null;
    this.#ready=null;
    this.#sync();
  }
}
