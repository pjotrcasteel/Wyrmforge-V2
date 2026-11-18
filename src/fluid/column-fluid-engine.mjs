// Water V2 foundation: a bounded, deterministic, engine-owned fluid column state.
// Voxel/WorldGen supply read-only floor heights and source descriptors.
// Rendering, materials, DOM and concrete terrain implementations are not imported.
export const FLUID_STATE_SCHEMA='wyrmforge.fluid-state.v1';
export const FLUID_SURFACE_SCHEMA='wyrmforge.fluid-surface.v1';
export const MAX_FLUID_COLUMNS=4096;
export const MAX_FLUID_FLIGHTS=256;
export const MAX_FLUID_SOURCES=8;
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
  // Units actually in the air, not already in the receiving pool. Each
  // destination capacity is reserved; in-flight volume remains conserved.
  #flights=[];
  #incoming;
  #flightCursor=0;
  #sourceManifest=[];
  #sourceCursor=0;
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
    this.#incoming=new Uint16Array(width*height);
    this.#floorAt=floorAt;
    this.#kind=kind;
    for(let i=0;i<this.#floors.length;i++){
      const x=minX+i%width,z=minZ+Math.floor(i/width);
      this.#floors[i]=this.#readFloor(x,z);
    }
    if(!Array.isArray(initial)||!Array.isArray(sources))throw new TypeError('Expected fluid seed arrays');
    if(sources.length>MAX_FLUID_SOURCES)throw new RangeError('Too many bounded fluid inlet sources');
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
      x,z,kind:this.#kind,floorY,depth,pendingArrival:this.#incoming[index],
      surfaceY:depth?floorY+depth/FLUID_DEPTH_UNITS:null
    });
  }

  #exchange(from,to){
    const amount=this.#depths[from];
    if(!amount||this.#depths[to]+this.#incoming[to]>=MAX_DEPTH)return 0;
    const headFrom=this.#floors[from]*FLUID_DEPTH_UNITS+amount;
    const floorTo=this.#floors[to]*FLUID_DEPTH_UNITS;
    if(headFrom<=floorTo)return 0; // intact bank or higher solid floor
    const headTo=floorTo+this.#depths[to]+this.#incoming[to];
    const difference=headFrom-headTo;
    if(difference<2)return 0;
    const moved=Math.min(RATE[this.#kind],Math.floor(difference/2),
      amount,MAX_DEPTH-this.#depths[to]-this.#incoming[to]);
    if(moved<1)return 0;
    const drop=this.#floors[from]-this.#floors[to];
    const falling=drop>=1 && headFrom-headTo>=FLUID_DEPTH_UNITS;
    if(falling&&this.#flights.length>=MAX_FLUID_FLIGHTS)return 0;
    if(!falling){
      if(!this.#depths[to])this.#wet++;
      this.#depths[from]-=moved;
      this.#depths[to]+=moved;
    }else{
      // No instant teleportation to the lower basin. Water leaves the source
      // and stays in a bounded flight until its physical fall time elapses.
      this.#depths[from]-=moved;
      this.#incoming[to]+=moved;
      const flightTicks=Math.max(2,Math.min(12,
        Math.ceil(Math.sqrt(drop*FLUID_DEPTH_UNITS))));
      this.#flights.push({
        from,to,units:moved,departedAt:this.#steps,
        arrivesAt:this.#steps+flightTicks,
        startDeci:headFrom
      });
    }
    if(!this.#depths[from])this.#wet--;
    return moved;
  }

  #landFlights(budget){
    const count=Math.min(budget,this.#flights.length);
    let landed=0,processed=0;
    while(processed<count&&this.#flights.length){
      const packet=this.#flights[this.#flightCursor];
      processed++;
      if(packet.arrivesAt<=this.#steps){
        const {to,units}=packet;
        if(!this.#depths[to])this.#wet++;
        this.#incoming[to]-=units;
        this.#depths[to]+=units;
        landed+=units;
        this.#flights.splice(this.#flightCursor,1);
        if(this.#flightCursor>=this.#flights.length)this.#flightCursor=0;
      }else{
        this.#flightCursor=(this.#flightCursor+1)%this.#flights.length;
      }
    }
    return {landed,processed};
  }

  // Inlets are hydrologic boundary conditions, not ordinary map columns.
  // The former cursor-only service could refill one source once per ~40 Hunt
  // frames in a 4096-column region while downstream water drained every tick.
  // Reserve a small slice of the SAME budget for real upstream inlet work.
  #injectSources(budget){
    if(!budget||!this.#sourceManifest.length)return {injected:0,processed:0};
    let injected=0;
    const processed=Math.min(budget,this.#sourceManifest.length);
    for(let i=0;i<processed;i++){
      const source=this.#sourceManifest[this.#sourceCursor];
      this.#sourceCursor=(this.#sourceCursor+1)%this.#sourceManifest.length;
      const {index,surfaceDeci,rate}=source;
      const wanted=Math.min(MAX_DEPTH,
        Math.max(0,surfaceDeci-this.#floors[index]*FLUID_DEPTH_UNITS));
      const added=Math.min(rate,Math.max(0,wanted-this.#depths[index]));
      if(!this.#depths[index]&&added)this.#wet++;
      this.#depths[index]+=added;
      injected+=added;
    }
    return {injected,processed};
  }

  // No more than "budget" source+column visits per step. Existing flights
  // are independently capped and budgeted just as before this change.
  step({budget=128}={}){
    if(!Number.isSafeInteger(budget)||budget<1||budget>MAX_FLUID_COLUMNS){
      throw new RangeError('Invalid per-step fluid column budget');
    }
    const sourceBudget=this.#sourceManifest.length
      ?budget===1?(this.#steps%2===0?1:0)
        :Math.min(this.#sourceManifest.length,Math.max(1,Math.floor(budget/4)))
      :0;
    const {injected,processed:sourcesProcessed}=this.#injectSources(sourceBudget);
    const count=Math.min(budget-sourcesProcessed,this.columnCount);
    const {landed,processed:flightsProcessed}=this.#landFlights(budget);
    let transferred=0;
    for(let i=0;i<count;i++){
      const index=this.#cursor;
      this.#cursor=(this.#cursor+1)%this.columnCount;
      if(!this.#depths[index])continue;
      const x=this.#bounds.minX+index%this.#width;
      const z=this.#bounds.minZ+Math.floor(index/this.#width);
      for(const [dx,dz] of DIRECTIONS){
        const neighbor=this.#index(x+dx,z+dz);
        if(neighbor>=0)transferred+=this.#exchange(index,neighbor);
      }
    }
    this.#steps++;
    return Object.freeze({
      processed:count+sourcesProcessed,columnsProcessed:count,
      sourcesProcessed,flightsProcessed,transferred,injected,landed,
      inFlight:this.#flights.length,wet:this.#wet
    });
  }

  get wetCount(){return this.#wet;}
  get inFlightCount(){return this.#flights.length;}
  get inFlightUnits(){
    return this.#flights.reduce((sum,packet)=>sum+packet.units,0);
  }

  get totalDepth(){
    let sum=0;
    for(const value of this.#depths)sum+=value;
    return sum+this.inFlightUnits;
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
    const flights=this.#flights.map(packet=>{
      const x=this.#bounds.minX+packet.from%this.#width;
      const z=this.#bounds.minZ+Math.floor(packet.from/this.#width);
      const toX=this.#bounds.minX+packet.to%this.#width;
      const toZ=this.#bounds.minZ+Math.floor(packet.to/this.#width);
      const progress=Math.max(0,Math.min(1,
        (this.#steps-packet.departedAt)/
          (packet.arrivesAt-packet.departedAt)));
      return Object.freeze({
        x,z,toX,toZ,units:packet.units,progress,
        startY:packet.startDeci/FLUID_DEPTH_UNITS,
        landingY:this.#floors[packet.to]+this.#depths[packet.to]/FLUID_DEPTH_UNITS
      });
    });
    return Object.freeze({
      schema:FLUID_SURFACE_SCHEMA,kind:this.#kind,step:this.#steps,
      bounds:this.#bounds,cells:Object.freeze(cells),
      flights:Object.freeze(flights)
    });
  }

  snapshot(){
    return {
      schema:FLUID_STATE_SCHEMA,kind:this.#kind,bounds:{...this.#bounds},
      floors:Array.from(this.#floors),depths:Array.from(this.#depths),
      sources:this.#sourceManifest.map(source=>({...source})),
      sourceCursor:this.#sourceCursor,
      cursor:this.#cursor,steps:this.#steps,
      flights:this.#flights.map(packet=>({...packet})),
      flightCursor:this.#flightCursor
    };
  }

  restore(state){
    const bounds=state?.bounds;
    const sourceCursor=state?.sourceCursor??0;
    if(state?.schema!==FLUID_STATE_SCHEMA||state.kind!==this.#kind||
        !bounds||Object.keys(this.#bounds).some(key=>bounds[key]!==this.#bounds[key])||
        !Array.isArray(state.floors)||!Array.isArray(state.depths)||
        state.floors.length!==this.columnCount||state.depths.length!==this.columnCount||
        JSON.stringify(state.sources)!==JSON.stringify(this.#sourceManifest)||
        !Number.isSafeInteger(sourceCursor)||sourceCursor<0||
        sourceCursor>=Math.max(1,this.#sourceManifest.length)||
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
    // Old V1 snapshots without flight data remain valid: they contain no
    // suspended transfer. A new snapshot is validated before any mutation.
    const packets=state.flights??[];
    const flightCursor=state.flightCursor??0;
    if(!Array.isArray(packets)||packets.length>MAX_FLUID_FLIGHTS||
        !Number.isSafeInteger(flightCursor)||
        flightCursor<0||flightCursor>=Math.max(1,packets.length)){
      throw new TypeError('Invalid bounded in-flight fluid snapshot');
    }
    const reserved=new Uint16Array(this.columnCount);
    for(const packet of packets){
      if(!packet||!['from','to','units','departedAt','arrivesAt','startDeci']
        .every(name=>Number.isSafeInteger(packet[name]))||
          packet.from<0||packet.from>=this.columnCount||
          packet.to<0||packet.to>=this.columnCount||
          packet.units<1||packet.units>RATE[this.#kind]||
          packet.departedAt<0||packet.departedAt>state.steps||
          packet.arrivesAt<=packet.departedAt||
          packet.arrivesAt-packet.departedAt>12||
          packet.startDeci< -10240||packet.startDeci>10400){
        throw new TypeError('Invalid in-flight fluid transfer');
      }
      const fromX=packet.from%this.#width,fromZ=Math.floor(packet.from/this.#width);
      const toX=packet.to%this.#width,toZ=Math.floor(packet.to/this.#width);
      if(Math.abs(fromX-toX)+Math.abs(fromZ-toZ)!==1||
          this.#floors[packet.from]<=this.#floors[packet.to]){
        throw new TypeError('In-flight water must cross a real downhill edge');
      }
      reserved[packet.to]+=packet.units;
      if(reserved[packet.to]+state.depths[packet.to]>MAX_DEPTH){
        throw new RangeError('Fluid snapshot exceeds reserved receiving capacity');
      }
    }
    this.#depths.set(state.depths);
    this.#incoming.set(reserved);
    this.#flights=packets.map(packet=>({...packet}));
    this.#flightCursor=flightCursor;
    this.#wet=state.depths.reduce((count,depth)=>count+(depth>0?1:0),0);
    this.#cursor=state.cursor;
    this.#sourceCursor=sourceCursor;
    this.#steps=state.steps;
  }
}
