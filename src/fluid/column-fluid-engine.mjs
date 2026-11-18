// Water V2 foundation: a bounded, deterministic, engine-owned fluid column state.
// Voxel/WorldGen supply read-only floor heights and source descriptors.
// Rendering, materials, DOM and concrete terrain implementations are not imported.
export const FLUID_STATE_SCHEMA='wyrmforge.fluid-state.v1';
export const FLUID_SURFACE_SCHEMA='wyrmforge.fluid-surface.v1';
export const MAX_FLUID_COLUMNS=4096;
export const MAX_FLUID_FLIGHTS=256;
export const MAX_FLUID_SOURCES=8;
export const MAX_FLUID_OUTLETS=8;
export const MAX_FLUID_CURRENTS=MAX_FLUID_COLUMNS;
export const FLUID_DEPTH_UNITS=10; // 10 cm of water per column unit
const MAX_DEPTH=160; // 16 m of resident liquid per 1 m2 column
const DIRECTIONS=[[1,0],[0,1],[-1,0],[0,-1]];
const RATE=Object.freeze({water:4,lava:1});

function integer(value,name){
  if(!Number.isSafeInteger(value))throw new TypeError(name+' must be a safe integer');
  return value;
}

// Inlet and outlet levels may be 10cm increments: floor+0.4m is a valid
// real surface, unlike the old integer-only floor+1m river filling rule.
function waterLevelDeci(value,name){
  const deci=Math.round(value*FLUID_DEPTH_UNITS);
  if(!Number.isFinite(value)||!Number.isSafeInteger(deci)||
      Math.abs(value*FLUID_DEPTH_UNITS-deci)>1e-6){
    throw new TypeError(name+' must align with the 10cm fluid grid');
  }
  return deci;
}

export class ColumnFluidEngine {
  #bounds;
  #width;
  #floors;
  #depths;
  #active=new Set();
  // Terrain edits wake nearby wet columns immediately instead of waiting for
  // the normal round-robin scan of a large resident river. This queue owns
  // scheduling only; all water still moves via the same conservative solver.
  #urgent=[];
  #urgentSet=new Set();
  #processingUrgent=false;
  #sources=new Map();
  #outlets=new Map();
  #currents=new Map();
  #currentManifest=[];
  // Units actually in the air, not already in the receiving pool. Each
  // destination capacity is reserved; in-flight volume remains conserved.
  #flights=[];
  #incoming;
  #flightCursor=0;
  #sourceManifest=[];
  #sourceCursor=0;
  #outletManifest=[];
  #outletCursor=0;
  #drainedTotal=0;
  #floorAt;
  #kind;
  #cursor=0;
  #steps=0;
  #wet=0;

  constructor({bounds,floorAt,kind='water',initial=[],sources=[],outlets=[],currents=[]}={}){
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
    if(!Array.isArray(initial)||!Array.isArray(sources)||!Array.isArray(outlets)||
        !Array.isArray(currents)){
      throw new TypeError('Expected bounded fluid seed and boundary arrays');
    }
    if(currents.length>MAX_FLUID_CURRENTS){
      throw new RangeError('Fluid current channel exceeds resident column budget');
    }
    if(sources.length>MAX_FLUID_SOURCES)throw new RangeError('Too many bounded fluid inlet sources');
    if(outlets.length>MAX_FLUID_OUTLETS)throw new RangeError('Too many bounded fluid outlets');
    for(const {x,z,depth} of initial){
      const index=this.#requiredIndex(x,z);
      if(!Number.isSafeInteger(depth)||depth<0||depth>MAX_DEPTH){
        throw new RangeError('Invalid initial fluid depth');
      }
      if(!this.#depths[index]&&depth)this.#wet++;
      if(this.#depths[index]&&!depth)this.#wet--;
      this.#depths[index]=depth;
      if(depth)this.#active.add(index);
      else this.#active.delete(index);
    }
    for(const {x,z,surfaceY,rate=2} of sources){
      const index=this.#requiredIndex(x,z);
      const surfaceDeci=waterLevelDeci(surfaceY,'source surfaceY');
      if(!Number.isSafeInteger(rate)||rate<1||rate>FLUID_DEPTH_UNITS){
        throw new RangeError('Invalid bounded source rate');
      }
      this.#sources.set(index,Object.freeze({surfaceDeci,rate}));
    }
    this.#sourceManifest=[...this.#sources.entries()].sort(([a],[b])=>a-b)
      .map(([index,{surfaceDeci,rate}])=>Object.freeze({index,surfaceDeci,rate}));
    for(const {x,z,surfaceY,rate=2} of outlets){
      const index=this.#requiredIndex(x,z);
      const surfaceDeci=waterLevelDeci(surfaceY,'outlet surfaceY');
      if(!Number.isSafeInteger(rate)||rate<1||rate>FLUID_DEPTH_UNITS){
        throw new RangeError('Invalid bounded outlet rate');
      }
      if(this.#sources.has(index))throw new RangeError('River inlet and outlet must be separate');
      if(this.#outlets.has(index))throw new RangeError('Duplicate physical outlet');
      this.#outlets.set(index,Object.freeze({
        surfaceDeci,rate
      }));
    }
    this.#outletManifest=[...this.#outlets.entries()].sort(([a],[b])=>a-b)
      .map(([index,{surfaceDeci,rate}])=>Object.freeze({index,surfaceDeci,rate}));
    for(const {x,z,dx,dz} of currents){
      const from=this.#requiredIndex(x,z);
      if(!Number.isSafeInteger(dx)||!Number.isSafeInteger(dz)||
          Math.abs(dx)+Math.abs(dz)!==1){
        throw new RangeError('River current direction must be one cardinal cell');
      }
      const to=this.#requiredIndex(x+dx,z+dz);
      if(this.#currents.has(from))throw new RangeError('Duplicate river current cell');
      this.#currents.set(from,to);
    }
    this.#currentManifest=[...this.#currents.entries()].sort(([a],[b])=>a-b)
      .map(([from,to])=>Object.freeze({from,to}));
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

  // Cross-band transfers must not destroy/recreate water via independent
  // outlet/source manifests. Only an actually resident, touching 1m column
  // pair may move units. A lower cross-band fall needs the separate bounded
  // airborne-parcel protocol; do NOT teleport those units.
  transferToAdjacent(receiver,{x,z,toX,toZ,maxUnits=2}={}){
    if(!(receiver instanceof ColumnFluidEngine)||receiver===this||
        receiver.#kind!==this.#kind){
      throw new TypeError('Expected a distinct resident fluid engine of the same kind');
    }
    if(![x,z,toX,toZ].every(Number.isSafeInteger)||
        Math.abs(x-toX)+Math.abs(z-toZ)!==1){
      throw new RangeError('Water V2 seam columns must share one cardinal voxel face');
    }
    if(!Number.isSafeInteger(maxUnits)||maxUnits<1||
        maxUnits>RATE[this.#kind]){
      throw new RangeError('Invalid bounded seam transfer rate');
    }
    const from=this.#index(x,z),to=receiver.#index(toX,toZ);
    if(from<0||to<0){
      throw new RangeError('Water V2 seam requires both published fluid footprints');
    }
    const floor=this.#floors[from],targetFloor=receiver.#floors[to];
    // A real water fall cannot be represented as an instantaneous jump.
    // Fail closed until a cross-band falling-flight contract is installed.
    if(floor!==targetFloor)return 0;
    const sourceDepth=this.#depths[from];
    const targetDepth=receiver.#depths[to];
    const targetReserved=receiver.#incoming[to];
    const difference=sourceDepth-targetDepth-targetReserved;
    if(difference<2||!sourceDepth)return 0;
    const film=this.#currents.has(from)?1:0;
    const moved=Math.min(maxUnits,RATE[this.#kind],
      Math.floor(difference/2),sourceDepth-film,
      MAX_DEPTH-targetDepth-targetReserved);
    if(moved<1)return 0;
    // Both writes are synchronous. No storage/network operations or callback
    // can observe half of the transfer. Source and receiver never overlap.
    this.#depths[from]-=moved;
    receiver.#depths[to]+=moved;
    if(!this.#depths[from]){
      this.#wet--;
      this.#active.delete(from);
    }
    if(!targetDepth){
      receiver.#wet++;
      receiver.#active.add(to);
    }
    return moved;
  }

  #wake(index){
    if(index<0||!this.#depths[index]||this.#urgentSet.has(index))return;
    this.#urgent.push(index);
    this.#urgentSet.add(index);
  }

  #exchange(from,to){
    const amount=this.#depths[from];
    if(!amount||this.#depths[to]+this.#incoming[to]>=MAX_DEPTH)return 0;
    const newlyWet=this.#depths[to]===0;
    const headFrom=this.#floors[from]*FLUID_DEPTH_UNITS+amount;
    const floorTo=this.#floors[to]*FLUID_DEPTH_UNITS;
    if(headFrom<=floorTo)return 0; // intact bank or higher solid floor
    const headTo=floorTo+this.#depths[to]+this.#incoming[to];
    const difference=headFrom-headTo;
    const current=this.#currents.get(from)===to &&
      this.#floors[to]<=this.#floors[from]&&difference>=-1;
    if(difference<2&&!current)return 0;
    // The authored riverbed supplies downstream inertia on nearly level
    // shelves. Without it, 10cm vertical quantization would demand a
    // >=20cm hydraulic gradient at *every 1m cell*, drying a 30m river
    // despite a valid upstream inlet. Never push uphill through a bank.
    const reservedFilm=this.#currents.has(from)?1:0;
    const available=Math.max(0,amount-reservedFilm);
    const rate=current?Math.min(RATE[this.#kind],2):
      Math.min(RATE[this.#kind],Math.floor(difference/2));
    const moved=Math.min(rate,available,
      MAX_DEPTH-this.#depths[to]-this.#incoming[to]);
    if(moved<1)return 0;
    const drop=this.#floors[from]-this.#floors[to];
    const falling=drop>=1 && (current||difference>=FLUID_DEPTH_UNITS);
    if(falling&&this.#flights.length>=MAX_FLUID_FLIGHTS)return 0;
    if(!falling){
      if(!this.#depths[to])this.#wet++;
      this.#depths[from]-=moved;
      this.#depths[to]+=moved;
      this.#active.add(to);
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
    if(!this.#depths[from]){
      this.#wet--;
      this.#active.delete(from);
    }
    // A fresh bank breach advances as a bounded hydraulic wave: revisit its
    // donors and newly wetted receivers next tick, including downhill craters.
    // The ordinary sweep still receives at least half of every frame budget.
    if(this.#processingUrgent &&
        (newlyWet||this.#floors[to]<this.#floors[from])){
      this.#wake(to);
      this.#wake(from);
    }
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
        this.#active.add(to);
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
      if(added)this.#active.add(index);
      injected+=added;
    }
    return {injected,processed};
  }

  // Drain only real lower-river water above its downstream boundary head.
  // This makes the authored river an open stream rather than a closed bathtub
  // which would eventually equalize and permanently stop its own waterfall.
  #drainOutlets(budget){
    if(!budget||!this.#outletManifest.length)return {drained:0,processed:0};
    let drained=0;
    const processed=Math.min(budget,this.#outletManifest.length);
    for(let i=0;i<processed;i++){
      const outlet=this.#outletManifest[this.#outletCursor];
      this.#outletCursor=(this.#outletCursor+1)%this.#outletManifest.length;
      const {index,surfaceDeci,rate}=outlet;
      const target=Math.max(0,surfaceDeci-this.#floors[index]*FLUID_DEPTH_UNITS);
      const removed=Math.min(rate,Math.max(0,this.#depths[index]-target));
      this.#depths[index]-=removed;
      if(!this.#depths[index]&&removed){
        this.#wet--;
        this.#active.delete(index);
      }
      drained+=removed;
    }
    this.#drainedTotal+=drained;
    return {drained,processed};
  }

  // No more than "budget" inlet+outlet+column visits per step. Existing
  // flights are independently capped and budgeted just as before this change.
  step({budget=128}={}){
    if(!Number.isSafeInteger(budget)||budget<1||budget>MAX_FLUID_COLUMNS){
      throw new RangeError('Invalid per-step fluid column budget');
    }
    const nSources=this.#sourceManifest.length,nOutlets=this.#outletManifest.length;
    let sourceBudget=0,outletBudget=0;
    if(nSources+nOutlets){
      if(budget===1){
        if(this.#steps%3===0&&nSources)sourceBudget=1;
        if(this.#steps%3===1&&nOutlets)outletBudget=1;
      }else{
        const boundarySlots=Math.min(nSources+nOutlets,
          Math.max(nSources&&nOutlets?2:1,Math.floor(budget/4)));
        if(nSources&&nOutlets&&boundarySlots===1){
          if(this.#steps%2===0)sourceBudget=1;
          else outletBudget=1;
        }else{
          sourceBudget=Math.min(nSources,Math.ceil(boundarySlots/2));
          outletBudget=Math.min(nOutlets,boundarySlots-sourceBudget);
          const remaining=boundarySlots-sourceBudget-outletBudget;
          const extraSources=Math.min(remaining,nSources-sourceBudget);
          sourceBudget+=extraSources;
          outletBudget+=Math.min(remaining-extraSources,nOutlets-outletBudget);
        }
      }
    }
    const {injected,processed:sourcesProcessed}=this.#injectSources(sourceBudget);
    const {drained,processed:outletsProcessed}=this.#drainOutlets(outletBudget);
    const {landed,processed:flightsProcessed}=this.#landFlights(budget);
    // A Fireball can open a riverbank late in a 4096-column footprint.
    // Reserve at most half the remaining work for disturbed wet cells so
    // the newly opened path reacts immediately, without starving old water.
    const columnBudget=budget-sourcesProcessed-outletsProcessed;
    const wakeBudget=Math.min(24,Math.floor(columnBudget/2),this.#urgent.length);
    let transferred=0,urgentProcessed=0;
    for(let i=0;i<wakeBudget;i++){
      const index=this.#urgent.shift();
      this.#urgentSet.delete(index);
      if(!this.#depths[index])continue;
      const x=this.#bounds.minX+index%this.#width;
      const z=this.#bounds.minZ+Math.floor(index/this.#width);
      this.#processingUrgent=true;
      try{
        for(const [dx,dz] of DIRECTIONS){
          const neighbor=this.#index(x+dx,z+dz);
          if(neighbor>=0)transferred+=this.#exchange(index,neighbor);
        }
      }finally{
        this.#processingUrgent=false;
      }
      urgentProcessed++;
    }
    // Deterministic regular sweeps still visit the entire wet river, with a
    // persistent absolute cursor. This is the same single shared budget.
    const active=[...this.#active].sort((a,b)=>a-b);
    const count=Math.min(columnBudget-urgentProcessed,active.length);
    let position=active.findIndex(index=>index>=this.#cursor);
    if(position<0)position=0;
    for(let i=0;i<count;i++){
      const index=active[(position+i)%active.length];
      this.#cursor=(index+1)%this.columnCount;
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
      processed:count+urgentProcessed+sourcesProcessed+outletsProcessed,
      columnsProcessed:count+urgentProcessed,urgentProcessed,
      sourcesProcessed,outletsProcessed,flightsProcessed,
      transferred,injected,drained,landed,
      inFlight:this.#flights.length,wet:this.#wet
    });
  }

  get wetCount(){return this.#wet;}
  get totalDrained(){return this.#drainedTotal;}
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
      // Wake water at the changed physical floor and every shared face.
      // An intact, higher bank remains dry: waking never creates liquid.
      this.#wake(index);
      for(const [dx,dz] of DIRECTIONS)this.#wake(this.#index(x+dx,z+dz));
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
      let currentX=0,currentZ=0;
      const downstream=this.#currents.get(i);
      if(downstream!==undefined&&this.#floors[downstream]<=this.#floors[i]){
        const downstreamHead=this.#floors[downstream]*FLUID_DEPTH_UNITS+
          this.#depths[downstream]+this.#incoming[downstream];
        if(head>=downstreamHead-1){
          currentX=downstream%this.#width-i%this.#width;
          currentZ=Math.floor(downstream/this.#width)-
            Math.floor(i/this.#width);
          flowX=currentX;
          flowZ=currentZ;
        }
      }
      cells.push(Object.freeze({
        x,z,kind:this.#kind,floorY:this.#floors[i],depth,
        surfaceY:head/FLUID_DEPTH_UNITS,flowX,flowZ,
        currentX,currentZ
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
      outlets:this.#outletManifest.map(outlet=>({...outlet})),
      outletCursor:this.#outletCursor,drainedTotal:this.#drainedTotal,
      currents:this.#currentManifest.map(current=>({...current})),
      cursor:this.#cursor,steps:this.#steps,
      urgent:this.#urgent.filter(index=>this.#depths[index]>0),
      flights:this.#flights.map(packet=>({...packet})),
      flightCursor:this.#flightCursor
    };
  }

  restore(state){
    const bounds=state?.bounds;
    const sourceCursor=state?.sourceCursor??0;
    const outletCursor=state?.outletCursor??0;
    const drainedTotal=state?.drainedTotal??0;
    if(state?.schema!==FLUID_STATE_SCHEMA||state.kind!==this.#kind||
        !bounds||Object.keys(this.#bounds).some(key=>bounds[key]!==this.#bounds[key])||
        !Array.isArray(state.floors)||!Array.isArray(state.depths)||
        state.floors.length!==this.columnCount||state.depths.length!==this.columnCount||
        JSON.stringify(state.sources)!==JSON.stringify(this.#sourceManifest)||
        JSON.stringify(state.outlets??[])!==JSON.stringify(this.#outletManifest)||
        JSON.stringify(state.currents??[])!==JSON.stringify(this.#currentManifest)||
        !Number.isSafeInteger(outletCursor)||outletCursor<0||
        outletCursor>=Math.max(1,this.#outletManifest.length)||
        !Number.isSafeInteger(drainedTotal)||drainedTotal<0||
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
    const urgent=state.urgent??[];
    if(!Array.isArray(urgent)||urgent.length>this.columnCount||
        urgent.some(index=>!Number.isSafeInteger(index)||
          index<0||index>=this.columnCount)||
        new Set(urgent).size!==urgent.length){
      throw new TypeError('Invalid bounded terrain-disturbance queue');
    }
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
    this.#active=new Set();
    for(let i=0;i<this.columnCount;i++){
      if(this.#depths[i])this.#active.add(i);
    }
    this.#urgent=[...urgent];
    this.#urgentSet=new Set(urgent);
    this.#processingUrgent=false;
    this.#cursor=state.cursor;
    this.#sourceCursor=sourceCursor;
    this.#outletCursor=outletCursor;
    this.#drainedTotal=drainedTotal;
    this.#steps=state.steps;
  }
}
