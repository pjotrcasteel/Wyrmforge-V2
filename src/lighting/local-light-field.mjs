// Read-only local irradiance approximation. No Voxel, Fluid or GPU imports.
export const LIGHT_FIELD_EDGE=24;
export const LIGHT_FIELD_WORK=24;
const key=(x,z)=>x+','+z;
export class LocalLightField {
  #sampleHeight;#key=null;#pending=null;#published=null;#nextRefresh=0;
  constructor(sampleHeight){
    if(typeof sampleHeight!=='function')throw new TypeError('Expected read-only height sampler');
    this.#sampleHeight=sampleHeight;
  }
  get snapshot(){return this.#published;}
  get pending(){return Boolean(this.#pending);}
  update({epoch,revision,center,liquid=null,now=0}={}){
    if(!Number.isSafeInteger(epoch)||epoch<1||!Number.isSafeInteger(revision)||revision<0||
      !center||![center.x,center.y,center.z,now].every(Number.isFinite)){
      throw new TypeError('Invalid local lighting identity or position');
    }
    const ox=Math.floor(center.x/6)*6-12,oz=Math.floor(center.z/6)*6-12;
    const identity=[epoch,revision,ox,oz].join(':');
    if(identity!==this.#key){
      this.#key=identity;this.#pending=null;this.#nextRefresh=0;
      if(this.#published?.epoch!==epoch||this.#published?.revision!==revision)this.#published=null;
    }
    if(!this.#pending&&now>=this.#nextRefresh){
      const sameGrid=this.#published?.origin[0]===ox&&this.#published?.origin[1]===oz;
      const heights=(sameGrid?this.#published.heights:null)??new Float32Array(LIGHT_FIELD_EDGE**2).fill(NaN);
      const wet=new Map();
      if(liquid?.kind==='lava'){
        if(!Array.isArray(liquid.cells)||liquid.cells.length>4096)throw new RangeError('Unbounded light sources');
        for(const cell of liquid.cells){
          if([cell.x,cell.z,cell.surfaceY,cell.depth].every(Number.isFinite)&&cell.depth>0&&
              cell.x>=ox-3&&cell.x<ox+27&&cell.z>=oz-3&&cell.z<oz+27){
            wet.set(key(cell.x,cell.z),cell.surfaceY);
          }
        }
      }
      this.#pending={heights,wet,index:0,stage:sameGrid?'shade':'height',
        data:new Float32Array(LIGHT_FIELD_EDGE**2*4),origin:[ox,oz],epoch,revision};
    }
    const job=this.#pending;if(!job)return {processed:0,queries:0};
    let processed=0,queries=0;
    while(processed<LIGHT_FIELD_WORK&&job.index<job.heights.length){
      const i=job.index++,x=ox+i%24,z=oz+Math.floor(i/24);processed++;
      if(job.stage==='height'){
        const y=this.#sampleHeight(x+.5,z+.5,center.y);
        job.heights[i]=Number.isFinite(y)?y:NaN;queries++;
      }else{
        const y=job.heights[i];let strength=0,sourceY=y;
        if(Number.isFinite(y)&&job.wet.size)for(let dz=-3;dz<=3;dz++)for(let dx=-3;dx<=3;dx++){
          const sy=job.wet.get(key(x+dx,z+dz));if(sy===undefined)continue;
          // Store horizontal irradiance potential. The shader evaluates vertical
          // separation at the actual fragment, including faces BELOW this top.
          const distance=Math.hypot(dx,dz);
          if(distance>=3.5)continue;
          // Conservative height-field occlusion along the path to the source.
          let blocked=false;
          for(const t of [.33,.66]){
            const sx=Math.floor(i%24+dx*t),sz=Math.floor(i/24+dz*t);
            if(sx<0||sx>=24||sz<0||sz>=24){blocked=true;break;}
            // The receiving bank and source columns are not intervening blockers.
            if((sx===i%24&&sz===Math.floor(i/24))||
                (sx===i%24+dx&&sz===Math.floor(i/24)+dz))continue;
            if(job.heights[sz*24+sx]>y+(sy-y)*t+.65){blocked=true;break;}
          }
          if(blocked)continue;
          const t=distance/3.5;
          const energy=1-t*t*(3-2*t);
          if(energy>strength){strength=energy;sourceY=sy;}
        }
        job.data.set([Number.isFinite(y)?y:0,Number.isFinite(sourceY)?sourceY:0,strength,Number.isFinite(y)?1:0],i*4);
      }
    }
    if(job.index===job.heights.length){
      if(job.stage==='height'){job.stage='shade';job.index=0;}
      else{
        this.#published=Object.freeze({schema:'wyrmforge.local-light-field.v1',
          epoch,revision,origin:job.origin,size:[24,24],hasEmission:job.wet.size>0,data:job.data,heights:job.heights});
        this.#pending=null;this.#nextRefresh=now+500;
      }
    }
    return {processed,queries};
  }
}
