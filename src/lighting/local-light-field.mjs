// Bounded read-only local emission field; no Voxel/Water/World Objects imports.
// Generic emissive surface cells are supplied by the Hunt composition layer.
// Geometry visibility uses exactly the same public ray path as point lights.
import {lightSegmentVisible} from './spatial-visibility.mjs';
import {LIGHT_OCCLUDER_SCHEMA} from './occluder-contract.mjs';

export const LIGHT_FIELD_EDGE=24;
export const LIGHT_FIELD_WORK=24;
export const LIGHT_FIELD_SCHEMA='wyrmforge.local-light-field.v2';
const key=(x,z)=>x+','+z;
const smooth=value=>value*value*(3-2*value);

function strongestSource(sources,x,z){
  let best=null,energy=0;
  for(let dz=-3;dz<=3;dz++)for(let dx=-3;dx<=3;dx++){
    const candidate=sources.get(key(x+dx,z+dz));
    if(!candidate)continue;
    const distance=Math.hypot(dx,dz);
    if(distance>=3.5)continue;
    const amount=candidate.energy*(1-smooth(distance/3.5));
    if(amount>energy){energy=amount;best={...candidate,energy:amount};}
  }
  return best;
}

export class LocalLightField {
  #sampleHeight;
  #geometry;
  #key=null;
  #pending=null;
  #published=null;
  #nextRefresh=0;
  #lastVisibilityRays=0;
  #lastProcessed=0;
  #resets=0;
  constructor(sampleHeight,{geometry=null}={}){
    if(typeof sampleHeight!=='function')throw new TypeError('Expected read-only height sampler');
    if(geometry&&typeof geometry.raycast!=='function'){
      throw new TypeError('Expected a public read-only spatial raycast provider');
    }
    this.#sampleHeight=sampleHeight;
    this.#geometry=geometry;
  }
  get snapshot(){return this.#published;}
  get pending(){return Boolean(this.#pending);}
  get statistics(){
    return {pending:Boolean(this.#pending),lastVisibilityRays:this.#lastVisibilityRays,
      lastProcessed:this.#lastProcessed,retainedBytes:this.#published?.data.byteLength??0,
      geometryAware:Boolean(this.#geometry),
      identity:this.#key,resets:this.#resets,
      pendingStage:this.#pending?.stage??null,
      pendingIndex:this.#pending?.index??null,
      pendingSourceCount:this.#pending?.sources.size??0};
  }
  update({epoch,revision,center,emissionCells=[],emissionColor=[0,0,0],
    occluders=null,occlusionEnabled=true,now=0}={}){
    if(!Number.isSafeInteger(epoch)||epoch<1||!Number.isSafeInteger(revision)||revision<0||
      !center||![center.x,center.y,center.z,now].every(Number.isFinite)){
      throw new TypeError('Invalid local lighting identity or position');
    }
    if(!Array.isArray(emissionCells)||emissionCells.length>4096){
      throw new RangeError('Unbounded emissive surface source cells');
    }
    if(!Array.isArray(emissionColor)||emissionColor.length!==3||
        !emissionColor.every(v=>Number.isFinite(v)&&v>=0&&v<=4)){
      throw new TypeError('Invalid material-owned emission colour');
    }
    if(occluders&&occluders.schema!==LIGHT_OCCLUDER_SCHEMA){
      throw new TypeError('Invalid physical occluder snapshot');
    }
    const ox=Math.floor(center.x/6)*6-12,oz=Math.floor(center.z/6)*6-12;
    const identity=[epoch,revision,ox,oz,occlusionEnabled?occluders?.revision??0:0,
      occlusionEnabled?1:0,...emissionColor].join(':');
    if(identity!==this.#key){
      this.#resets++;
      this.#key=identity;this.#pending=null;this.#nextRefresh=0;
      if(this.#published?.epoch!==epoch||this.#published?.revision!==revision){
        this.#published=null;
      }
    }
    if(!this.#pending&&now>=this.#nextRefresh){
      const sameGrid=this.#published?.origin[0]===ox&&
        this.#published?.origin[1]===oz&&
        this.#published?.epoch===epoch&&this.#published?.revision===revision;
      // Do NOT reuse cached heights after terrain destruction/revision changes.
      const heights=sameGrid?this.#published.heights:
        new Float32Array(LIGHT_FIELD_EDGE**2).fill(NaN);
      const sources=new Map();
      for(const cell of emissionCells){
        const {x,z,surfaceY}=cell??{};
        const energy=cell?.energy??1;
        if(![x,z,surfaceY,energy].every(Number.isFinite)||energy<=0)continue;
        if(x<ox-3||x>=ox+27||z<oz-3||z>=oz+27)continue;
        sources.set(key(x,z),{x:x+.5,z:z+.5,surfaceY,energy:Math.min(1,energy)});
      }
      this.#pending={heights,sources,index:0,stage:sameGrid?'shade':'height',
        data:new Float32Array(LIGHT_FIELD_EDGE**2*4),origin:[ox,oz],
        epoch,revision,emission:Object.freeze([...emissionColor]),
        shape:occluders?.entries??[],visibilityRays:0,
        spatialEnabled:occlusionEnabled&&Boolean(this.#geometry)};
    }
    const job=this.#pending;
    if(!job){this.#lastVisibilityRays=0;this.#lastProcessed=0;return {processed:0,queries:0,visibilityRays:0};}
    let processed=0,queries=0,visibilityRays=0;
    const cellCount=LIGHT_FIELD_EDGE**2;
    while(processed<LIGHT_FIELD_WORK&&
      job.index<(job.stage==='height'?cellCount:job.sources.size?cellCount*2:cellCount)){
      const slot=job.index++;
      const i=job.stage==='height'?slot:Math.floor(slot/2);
      const band=job.stage==='height'?0:slot%2;
      const x=ox+i%LIGHT_FIELD_EDGE,z=oz+Math.floor(i/LIGHT_FIELD_EDGE);
      processed++;
      if(job.stage==='height'){
        const y=this.#sampleHeight(x+.5,z+.5,center.y);
        job.heights[i]=Number.isFinite(y)?y:NaN;
        queries++;
        continue;
      }
      const y=job.heights[i],offset=i*4;
      if(!Number.isFinite(y))continue;
      const source=strongestSource(job.sources,x,z);
      if(band===0){
        job.data[offset]=y;
        job.data[offset+1]=source?.surfaceY??y;
        job.data[offset+3]=1; // Valid terrain receiver, side-band energy initially zero.
      }
      if(!source)continue;
      let strength=source.energy;
      if(job.spatialEnabled){
        const dx=source.x-(x+.5),dz=source.z-(z+.5);
        const reach=Math.hypot(dx,dz);
        // One top and one source-facing lower receiver for walls/banks.
        // The shader blends them by actual fragment height.
        const receiver=band===0?[x+.5,y+.12,z+.5]:[
          x+.5+(reach>.01?dx/reach*.49:0),y-.8,
          z+.5+(reach>.01?dz/reach*.49:0)
        ];
        strength=lightSegmentVisible(this.#geometry,
          [source.x,source.surfaceY+.12,source.z],receiver,job.shape)
          ?strength:0;
        queries++;visibilityRays++;job.visibilityRays++;
      }
      if(band===0)job.data[offset+2]=strength;
      else job.data[offset+3]=1+strength;
    }
    if(job.index===(job.stage==='height'?cellCount:job.sources.size?cellCount*2:cellCount)){
      if(job.stage==='height'){job.stage='shade';job.index=0;}
      else{
        this.#published=Object.freeze({
          schema:LIGHT_FIELD_SCHEMA,epoch,revision,origin:job.origin,
          size:[LIGHT_FIELD_EDGE,LIGHT_FIELD_EDGE],
          hasEmission:job.sources.size>0,emission:job.emission,
          data:job.data,heights:job.heights,
          visibilityRays:job.visibilityRays,geometryAware:job.spatialEnabled
        });
        this.#pending=null;
        this.#nextRefresh=now+500;
      }
    }
    this.#lastVisibilityRays=visibilityRays;
    this.#lastProcessed=processed;
    return {processed,queries,visibilityRays};
  }
}
