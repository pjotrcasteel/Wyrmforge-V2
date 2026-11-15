import {validateExternalTerrainDefinition} from './external-terrain-loader.mjs';

const cellId=(x,z)=>x+':'+z;

// Partition an authored terrain source across X/Z without changing its
// occupancy. Voxel storage chunks and streaming cells are independent sizes.
// The host decides which cells to load and when to publish or evict them.
export class TerrainStreamCellBuilder {
  #source;
  #edge;
  #groups=new Map();
  #run=0;
  #tile=0;
  #offset=0;

  constructor(definition,{cellEdge=8}={}){
    this.#source=validateExternalTerrainDefinition(definition);
    if(![8,16,32].includes(cellEdge)||cellEdge>this.#source.chunkEdge){
      throw new RangeError('Unsupported terrain streaming cell edge');
    }
    this.#edge=cellEdge;
  }

  get done(){
    return this.#run===this.#source.runs.length&&this.#tile===(this.#source.surfaceTiles?.length??0);
  }

  #group(x,z){
    const cx=Math.floor(x/this.#edge),cz=Math.floor(z/this.#edge);
    const id=cellId(cx,cz);
    if(!this.#groups.has(id))this.#groups.set(id,{cx,cz,runs:[],tiles:[]});
    return this.#groups.get(id);
  }

  step(maxParts=128){
    if(!Number.isSafeInteger(maxParts)||maxParts<1||maxParts>4096){
      throw new RangeError('Terrain partition budget exceeded');
    }
    const {runs,surfaceTiles=[]}=this.#source;
    let parts=0;
    while(parts<maxParts&&!this.done){
      if(this.#run<runs.length){
        const run=runs[this.#run];
        const x=run.x+this.#offset;
        const group=this.#group(x,run.z);
        const length=Math.min(run.length-this.#offset,(group.cx+1)*this.#edge-x);
        group.runs.push({...run,x,length});
        this.#offset+=length;
        if(this.#offset===run.length){this.#run++;this.#offset=0;}
      }else{
        const tile=surfaceTiles[this.#tile++];
        const group=this.#groups.get(cellId(Math.floor(tile.x/this.#edge),Math.floor(tile.z/this.#edge)));
        if(!group)throw new Error('A microtile has no terrain streaming cell');
        group.tiles.push(tile);
      }
      parts++;
    }
    return {parts,done:this.done};
  }

  get cells(){
    if(!this.done)throw new Error('Terrain streaming cells are still being prepared');
    return [...this.#groups.values()]
      .sort((a,b)=>a.cz-b.cz||a.cx-b.cx)
      .map(({cx,cz,runs,tiles})=>{
        const id=cellId(cx,cz);
        const {siteId,seed,chunkEdge,generatorVersion,schema}=this.#source;
        const siteCellId=siteId+':cell:'+this.#edge+':'+id;
        if(siteCellId.length>128)throw new RangeError('Terrain streaming cell ID is too long');
        return {
          id:siteCellId,
          bounds:{minX:cx*this.#edge,maxX:(cx+1)*this.#edge-1,
            minZ:cz*this.#edge,maxZ:(cz+1)*this.#edge-1},
          definition:{siteId:siteCellId,seed,chunkEdge,generatorVersion,schema,
            runs:runs.map(run=>({...run})),surfaceTiles:tiles.map(tile=>({...tile,levels:[...tile.levels]}))}
        };
      });
  }
}
