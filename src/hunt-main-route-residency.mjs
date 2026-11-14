// Live northbound streaming slice, not the final branching Hunt.
// A geography band contains its authored site and the connector to its south.
// No terrain generation here: the caller supplies native WorldGen definitions.
import {V2TerrainResidencySet} from './terrain-residency-set.mjs';

export class HuntMainRouteResidency {
  #bands;
  #set;
  #ids;
  constructor(world,bands) {
    if(!Array.isArray(bands)||bands.length<3)throw new Error('Expected authored route bands');
    this.#bands=bands;
    this.#ids=bands.map(b=>b.id);
    for(let i=1;i<bands.length;i++)
      if(bands[i].maxZ!==bands[i-1].minZ-1)throw new Error('Noncontiguous route bands');
    this.#set=new V2TerrainResidencySet(world);
    for(let i=0;i<bands.length;i++)
      this.#set.register(bands[i].id,bands[i].definition,{resident:i<2});
  }
  get metrics(){return this.#set.metrics;}
  get dirtyChunks(){return this.#set.dirtyChunks;}
  step(budget){return this.#set.step(budget);}
  publish(){return this.#set.publish();}
  #index(z){return this.#bands.findIndex(b=>z>=b.minZ&&z<b.maxZ+1);}
  #resident(){return this.#ids.map((id,i)=>this.#set.residentIds.includes(id)?i:-1).filter(i=>i>=0);}
  #interval(z) {
    const resident=this.#resident(),at=this.#index(z);
    if(!resident.includes(at))throw new Error('Actor outside published terrain');
    let south=at,north=at;
    while(resident.includes(south-1))south--;
    while(resident.includes(north+1))north++;
    return {south,north,at,resident};
  }
  bounds(z,footprint) {
    const {south,north}=this.#interval(z);
    return {...footprint,minZ:this.#bands[north].minZ,maxZ:this.#bands[south].maxZ};
  }
  // Keep the actor's band and its adjacent escape space. Hysteresis:
  // prefetch the next northern/southern band shortly after entering the
  // outermost resident band. Never initiate a load above the hard cap.
  next(z,{respawn=false}={}) {
    if(this.metrics.transition)return null;
    const {south,north,at,resident}=this.#interval(z);
    if(respawn&&resident.includes(0))return {action:'respawn'};
    const protectedIds=[this.#ids[at]];
    const evict=i=>({id:this.#ids[i],action:'evict',protectedIds});
    const load=i=>({id:this.#ids[i],action:'load',protectedIds});
    if(respawn) {
      if(resident.length===3)return evict(resident.find(i=>i!==at));
      return load(0);
    }
    const isolated=resident.find(i=>i<south||i>north);
    if(isolated!==undefined)return evict(isolated);
    const northWanted=north<this.#bands.length-1&&z<=this.#bands[north].maxZ-5;
    const southWanted=south>0&&z>=this.#bands[south].minZ+5;
    // A one-band window can occur only after explicit respawn. Rebuild
    // the neighboring buffer before allowing further expedition travel.
    if(resident.length===1&&south===0&&!resident.includes(1))return load(1);
    if(northWanted) {
      if(resident.length<3)return load(north+1);
      if(south!==at&&z<=this.#bands[south].minZ-45)return evict(south);
    }
    if(southWanted) {
      if(resident.length<3)return load(south-1);
      if(north!==at&&z>=this.#bands[north].maxZ+45)return evict(north);
    }
    return null;
  }
  begin(job){this.#set.begin(job.id,job.action,{protectedIds:job.protectedIds});}
}
