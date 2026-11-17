// Water V2 foundation: a bounded, deterministic, engine-owned fluid column state.
// Voxel/WorldGen supply read-only floor heights and source descriptors.
// Rendering, materials, DOM and concrete terrain implementations are not imported.
export const FLUID_STATE_SCHEMA='wyrmforge.fluid-state.v1';
export const FLUID_SURFACE_SCHEMA='wyrmforge.fluid-surface.v1';
export const MAX_FLUID_COLUMNS=4096;
export const FLUID_DEPTH_UNITS=10; // 10 cm of water per column unit
const MAX_DEPTH=160; // 16 m of resident liquid per 1 m2 column
const DIRECTIONS=[[1,0],[0,1],[-1,0],[0,-1]];
const RATE=Object.freeze({water:4,lava:1});

function integer(value,name){
  if(!Number.isSafeInteger(value))throw new TypeError(name+' must be a safe integer');
  return value;
}

export class ColumnFluidEngine {
  #bounds;
  #width;
  #floors;
  #depths;
  #sources=new Map();
  #sourceManifest=[];
  #floorAt;
  #kind;
  #cursor=0;
  #steps=0;
  #wet=0;

  constructor({bounds,floorAt,kind='water',initial=[],sources=[]}={}){
    if(!bounds||typeof floorAt!=='function'||!Object.hasOwn(RATE,kind)) {
      throw new TypeError('Expected bounded terrain floors and water or lava');
    }
    const {minX,maxX,minZ,maxZ}=bounds;
    for(const [name,value] of Object.entries({minX,maxX,minZ,maxZ}))integer(value,name);
    const width=maxX-minX+1,height=maxZ-minZ+1;
    if(width<1||height<1||width*height>MAX_FLUID_COLUMNS){
      throw new RangeError('Fluid region exceeds the resident column budget');
    }
    this.#bounds=Object.freeze({minX,maxX,minZ,maxZ});
    this.#width=width;
    this.#floors=new Int16Array(width*height);
    this.#depths=new Uint16Array(width*height);
    this.#floorAt=floorAt;
    this.#kind=kind;
    for(let i=0;i<this.#floors.length;i++){
      const x=minX+i%width,z=minZ+Math.floor(i/width);
      this.#floors[i]=this.#readFloor(x,z);
    }
    if(!Array.isArray(initial)||!Array.isArray(sources))throw new TypeError('Expected fluid seed arrays');
    for(const {x,z,depth} of initial){
      const index=this.#requiredIndex(x,z);
      if(!Number.isSafeInteger(depth)||depth<0||depth>MAX_DEPTH){
        throw new RangeError('Invalid initial fluid depth');
      }
      if(!this.#depths[index]&&depth)this.#wet++;
      if(this.#depths[index]&&!depth)this.#wet--;
      this.#depths[index]=depth;
    }
    for(const {x,z,surfaceY,rate=2} of sources){
      const index=this.#requiredIndex(x,z);
      integer(surfaceY,'source surfaceY');
      if(!Number.isSafeInteger(rate)||rate<1||rate>FLUID_DEPTH_UNITS){
        throw new RangeError('Invalid bounded source rate');
      }
      this.#sources.set(index,Object.freeze({surfaceDeci:surfaceY*FLUID_DEPTH_UNITS,rate}));
    }
    this.#sourceManifest=[...this.#sources.entries()].sort(([a],[b])=>a-b)
      .map(([index,{surfaceDeci,rate}])=>Object.freeze({index,surfaceDeci,rate}));
  }

  get schema(){return FLUID_STATE_SCHEMA;}
  get kind(){return this.#kind;}
  get bounds(){return this.#bounds;}
  get steps(){return this.#steps;}
  get columnCount(){return this.#floors.length;}

  #readFloor(x,z){
    const height=this.#floorAt(x,z);
    if(!Number.isSafeInteger(height)||height< -1024||height>1024){
      throw new RangeError('Terrain must publish a bounded integer top-of-solid height');
    }
    return height;
  }

  #index(x,z){
    if(!Number.isSafeInteger(x)||!Number.isSafeInteger(z))return -1;
    const {minX,maxX,minZ,maxZ}=this.#bounds;
    return x<minX||x>maxX||z<minZ||z>maxZ
      ?-1:(z-minZ)*this.#width+x-minX;
  }

  #requiredIndex(x,z){
    const index=this.#index(x,z);
    if(index<0)throw new RangeError('Fluid coordinate outside resident region');
    return index;
  }

  sample(x,z){
    const index=this.#index(x,z);
    if(index<0)return null;
    const floorY=this.#floors[index],depth=this.#depths[index];
    return Object.freeze({
      x,z,kind:this.#kind,floorY,depth,
      surfaceY:depth?floorY+depth/FLUID_DEPTH_UNITS:null
    });
  }

  #exchange(from,to){
    const amount=this.#depths[from];
    if(!amount||this.#depths[to]>=MAX_DEPTH)return 0;
    const headFrom=this.#floors[from]*FLUID_DEPTH_UNITS+amount;
    const floorTo=this.#floors[to]*FLUID_DEPTH_UNITS;
    if(headFrom<=floorTo)return 0; // intact bank or higher solid floor
    const headTo=floorTo+this.#depths[to];
    const difference=headFrom-headTo;
    if(difference<2)return 0;
    const moved=Math.min(RATE[this.#kind],Math.floor(difference/2),
      amount,MAX_DEPTH-this.#depths[to]);
    if(moved<1)return 0;
    if(!this.#depths[to])this.#wet++;
    this.#depths[from]-=moved;
    this.#depths[to]+=moved;
    if(!this.#depths[from])this.#wet--;
    return moved;
  }

  // Each step touches no more than "budget" columns and four neighbors.
  // Cursor/iteration are saved, so the result is deterministic across pauses.
  step({budget=128}={}){
    if(!Number.isSafeInteger(budget)||budget<1||budget>MAX_FLUID_COLUMNS){
      throw new RangeError('Invalid per-step fluid column budget');
    }
    const count=Math.min(budget,this.columnCount);
    let transferred=0,injected=0;
    for(let i=0;i<count;i++){
      const index=this.#cursor;
      this.#cursor=(this.#cursor+1)%this.columnCount;
      const source=this.#sources.get(index);
      if(source){
        const wanted=Math.min(MAX_DEPTH,
          Math.max(0,source.surfaceDeci-this.#floors[index]*FLUID_DEPTH_UNITS));
        const added=Math.min(source.rate,Math.max(0,wanted-this.#depths[index]));
        if(!this.#depths[index]&&added)this.#wet++;
        this.#depths[index]+=added;
        injected+=added;
      }
      if(!this.#depths[index])continue;
      const x=this.#bounds.minX+index%this.#width;
      const z=this.#bounds.minZ+Math.floor(index/this.#width);
      for(const [dx,dz] of DIRECTIONS){
        const neighbor=this.#index(x+dx,z+dz);
        if(neighbor>=0)transferred+=this.#exchange(index,neighbor);
      }
    }
    this.#steps++;
    return Object.freeze({processed:count,transferred,injected,wet:this.#wet});
  }

  get wetCount(){return this.#wet;}

  get totalDepth(){
    let sum=0;
    for(const value of this.#depths)sum+=value;
    return sum;
  }

  // Consumes the existing versioned Voxel change shape, without subscribing
  // to a private event bus or writing a single terrain voxel.
  onTerrainChange(change){
    if(!change?.geometryChanged||!change.changedBounds)return 0;
    return this.refreshTerrain(change.changedBounds);
  }

  refreshTerrain(changedBounds){
    const min=changedBounds?.min,max=changedBounds?.max;
    if(!min||!max||![min.x,min.z,max.x,max.z].every(Number.isSafeInteger)||
        min.x>max.x||min.z>max.z){
      throw new TypeError('Expected authoritative 3D changedBounds min/max');
    }
    const {minX,maxX,minZ,maxZ}=this.#bounds;
    const left=Math.max(minX,min.x),right=Math.min(maxX,max.x);
    const top=Math.max(minZ,min.z),bottom=Math.min(maxZ,max.z);
    let changed=0;
    for(let z=top;z<=bottom;z++)for(let x=left;x<=right;x++){
      const index=this.#index(x,z);
      const floor=this.#readFloor(x,z);
      if(floor===this.#floors[index])continue;
      this.#floors[index]=floor;
      changed++;
    }
    return changed;
  }

  // Immutable, renderer-neutral surface handoff. A horizontal flow vector
  // points toward the lowest currently reachable neighbor; no shader state
  // or private terrain arrays are exposed. This scan runs on demand only.
  snapshotSurface(){
    const cells=[];
    for(let i=0;i<this.columnCount;i++){
      const depth=this.#depths[i];
      if(!depth)continue;
      const x=this.#bounds.minX+i%this.#width;
      const z=this.#bounds.minZ+Math.floor(i/this.#width);
      const head=this.#floors[i]*FLUID_DEPTH_UNITS+depth;
      let bestHead=head,flowX=0,flowZ=0;
      for(const [dx,dz] of DIRECTIONS){
        const neighbor=this.#index(x+dx,z+dz);
        if(neighbor<0||head<=this.#floors[neighbor]*FLUID_DEPTH_UNITS)continue;
        const neighborHead=this.#floors[neighbor]*FLUID_DEPTH_UNITS+this.#depths[neighbor];
        if(neighborHead>=bestHead)continue;
        bestHead=neighborHead;
        flowX=dx;
        flowZ=dz;
      }
      cells.push(Object.freeze({
        x,z,kind:this.#kind,floorY:this.#floors[i],depth,
        surfaceY:head/FLUID_DEPTH_UNITS,flowX,flowZ
      }));
    }
    return Object.freeze({
      schema:FLUID_SURFACE_SCHEMA,kind:this.#kind,step:this.#steps,
      bounds:this.#bounds,cells:Object.freeze(cells)
    });
  }

  snapshot(){
    return {
      schema:FLUID_STATE_SCHEMA,kind:this.#kind,bounds:{...this.#bounds},
      floors:Array.from(this.#floors),depths:Array.from(this.#depths),
      sources:this.#sourceManifest.map(source=>({...source})),
      cursor:this.#cursor,steps:this.#steps
    };
  }

  restore(state){
    const bounds=state?.bounds;
    if(state?.schema!==FLUID_STATE_SCHEMA||state.kind!==this.#kind||
        !bounds||Object.keys(this.#bounds).some(key=>bounds[key]!==this.#bounds[key])||
        !Array.isArray(state.floors)||!Array.isArray(state.depths)||
        state.floors.length!==this.columnCount||state.depths.length!==this.columnCount||
        JSON.stringify(state.sources)!==JSON.stringify(this.#sourceManifest)||
        !Number.isSafeInteger(state.cursor)||state.cursor<0||state.cursor>=this.columnCount||
        !Number.isSafeInteger(state.steps)||state.steps<0){
      throw new TypeError('Incompatible fluid snapshot');
    }
    for(let i=0;i<this.columnCount;i++){
      if(state.floors[i]!==this.#floors[i]||
          !Number.isSafeInteger(state.depths[i])||state.depths[i]<0||
          state.depths[i]>MAX_DEPTH){
        throw new Error('Fluid snapshot requires the same replayed physical terrain');
      }
    }
    this.#depths.set(state.depths);
    this.#wet=state.depths.reduce((count,depth)=>count+(depth>0?1:0),0);
    this.#cursor=state.cursor;
    this.#steps=state.steps;
  }
}
