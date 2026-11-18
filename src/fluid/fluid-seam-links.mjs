// Pure Water V2 seam-transfer scheduler. WorldGen must supply a REAL 1m
// adjacent, physically authored region/link interface; this module never
// guesses a riverbed or opens an unloaded Voxel band.
export const FLUID_SEAM_STATE_SCHEMA='wyrmforge.fluid-seam-state.v1';
export const MAX_FLUID_SEAM_LINKS=64;
export const MAX_FLUID_SEAM_VISITS=8;
const ID=/^[A-Za-z0-9][A-Za-z0-9:._-]{0,127}$/;

const pointKey=(point)=>point.bandId+':'+point.x+','+point.z;

function validPoint(point){
  return point&&typeof point.bandId==='string'&&ID.test(point.bandId)&&
    Number.isSafeInteger(point.x)&&Number.isSafeInteger(point.z);
}

function copyLink(link){
  if(!link||typeof link.id!=='string'||!ID.test(link.id)||
      !validPoint(link.from)||!validPoint(link.to)||
      link.from.bandId===link.to.bandId||
      Math.abs(link.from.x-link.to.x)+Math.abs(link.from.z-link.to.z)!==1){
    throw new TypeError('Expected an adjacent authored Water V2 region/link seam');
  }
  return Object.freeze({
    id:link.id,
    from:Object.freeze({...link.from}),
    to:Object.freeze({...link.to})
  });
}

export class FluidSeamLinks {
  #links;
  #cursor=0;
  #visits=0;

  constructor(links){
    if(!Array.isArray(links)||links.length>MAX_FLUID_SEAM_LINKS){
      throw new RangeError('Too many Water V2 physical seam links');
    }
    const ids=new Set(),edges=new Set();
    this.#links=Object.freeze(links.map(copyLink).sort((a,b)=>a.id.localeCompare(b.id)));
    for(const link of this.#links){
      const points=[pointKey(link.from),pointKey(link.to)].sort().join('|');
      if(ids.has(link.id)||edges.has(points)){
        throw new Error('Duplicate physical Water V2 seam link');
      }
      ids.add(link.id);
      edges.add(points);
    }
  }

  get linkCount(){return this.#links.length;}
  get totalVisits(){return this.#visits;}

  // The caller already holds the active-water residency table. If either
  // side is absent, keep the mass at the source: no queue, no ghost engine
  // and no synthesized downstream inlet.
  step(resident,{budget=MAX_FLUID_SEAM_VISITS}={}){
    if(!(resident instanceof Map)||
        !Number.isSafeInteger(budget)||budget<1||
        budget>MAX_FLUID_SEAM_VISITS){
      throw new TypeError('Expected resident fluids and bounded seam visit budget');
    }
    const count=Math.min(this.#links.length,budget);
    let moved=0,held=0;
    for(let index=0;index<count;index++){
      const link=this.#links[(this.#cursor+index)%this.#links.length];
      const from=resident.get(link.from.bandId);
      const to=resident.get(link.to.bandId);
      if(!from||!to){
        held++;
        continue;
      }
      if(typeof from.transferToAdjacent!=='function'){
        throw new TypeError('Expected the Water V2 column boundary contract');
      }
      moved+=from.transferToAdjacent(to,{
        x:link.from.x,z:link.from.z,
        toX:link.to.x,toZ:link.to.z,maxUnits:from.kind==='lava'?1:2
      });
    }
    if(this.#links.length)this.#cursor=(this.#cursor+count)%this.#links.length;
    this.#visits+=count;
    return Object.freeze({inspected:count,moved,held});
  }

  snapshot(){
    return Object.freeze({
      schema:FLUID_SEAM_STATE_SCHEMA,
      linkIds:this.#links.map(link=>link.id),
      cursor:this.#cursor,visits:this.#visits
    });
  }

  restore(snapshot){
    if(snapshot?.schema!==FLUID_SEAM_STATE_SCHEMA||
        !Array.isArray(snapshot.linkIds)||
        JSON.stringify(snapshot.linkIds)!==JSON.stringify(this.#links.map(link=>link.id))||
        !Number.isSafeInteger(snapshot.cursor)||snapshot.cursor<0||
        snapshot.cursor>=Math.max(1,this.#links.length)||
        !Number.isSafeInteger(snapshot.visits)||snapshot.visits<0){
      throw new TypeError('Incompatible physical Water V2 seam checkpoint');
    }
    this.#cursor=snapshot.cursor;
    this.#visits=snapshot.visits;
  }
}
