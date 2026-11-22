// Terrain + physical objects are two interchangeable visibility providers.
// This file has no spell, tree, building, Water, renderer or Voxel imports.
import {LIGHT_OCCLUDER_SCHEMA} from './occluder-contract.mjs';
import {nearestLightObstruction} from './spatial-visibility.mjs';

export const POINT_VISIBILITY_SCHEMA='wyrmforge.point-visibility.v1';
export const POINT_VISIBILITY_BINS=12;
export const POINT_VISIBILITY_BANDS=2;
export const POINT_VISIBILITY_MAX_LIGHTS=2;
export const POINT_VISIBILITY_RAY_BUDGET=24;
export const POINT_VISIBILITY_FLOATS=POINT_VISIBILITY_BINS*
  POINT_VISIBILITY_BANDS*POINT_VISIBILITY_MAX_LIGHTS;
const TAU=2*Math.PI;
const EPSILON=.085;
const ELEVATION=[-.24,.24];

export function samplePointVisibility(field,index,position){
  if(!field||index>=field.lights.length||index<0)return 1;
  const light=field.lights[index];
  const dx=position[0]-light.position[0],dz=position[2]-light.position[2];
  const radial=Math.hypot(dx,dz);
  if(radial<.12)return 1;
  const angle=Math.atan2(dz,dx);
  const sector=Math.floor((angle+Math.PI)/TAU*POINT_VISIBILITY_BINS+.5)%
    POINT_VISIBILITY_BINS;
  const band=position[1]>light.position[1]+.25?1:0;
  const blockedAt=field.distances[index*POINT_VISIBILITY_BINS*POINT_VISIBILITY_BANDS+
    band*POINT_VISIBILITY_BINS+sector];
  const edge=Math.max(0,Math.min(1,(radial-blockedAt+.10)/.34));
  return 1-edge*edge*(3-2*edge);
}

function castRay(terrain,source,direction,range,shapes){
  const origin=source.map((value,i)=>value+direction[i]*EPSILON);
  const distance=range-EPSILON;
  const nearest=nearestLightObstruction(terrain,origin,direction,distance,shapes);
  return Math.max(.12,(nearest+EPSILON)*Math.hypot(direction[0],direction[2]));
}

export class PointLightVisibility {
  #port;#state=null;#processed=0;#frames=0;#rays=0;#resets=0;#lastCpu=0;#times=[];
  constructor(port){if(!port||typeof port.raycast!=='function')
    throw new TypeError('Expected public spatial raycast provider');this.#port=port;}
  clear(){this.#state=null;}
  get statistics(){
    const samples=[...this.#times].sort((a,b)=>a-b);
    const percentile=q=>samples.length?Number(
      samples[Math.ceil((samples.length-1)*q)].toFixed(3)):null;
    return {frameRays:this.#rays,completed:this.#processed,
      resets:this.#resets,frames:this.#frames,lastCpuMs:this.#lastCpu,
      p50CpuMs:percentile(.5),p95CpuMs:percentile(.95),p99CpuMs:percentile(.99),
      retainedBytes:this.#state?POINT_VISIBILITY_FLOATS*4:0,
      pending:Boolean(this.#state?.pending)};
  }
  update(lights,occluders=null){
    const begin=performance.now();
    this.#frames++;this.#rays=0;
    const records=lights?.emitters??[];
    if(records.length>POINT_VISIBILITY_MAX_LIGHTS)throw new RangeError('Too many active local lights');
    if(occluders&&occluders.schema!==LIGHT_OCCLUDER_SCHEMA)
      throw new TypeError('Invalid physical occluder contract');
    const identity=[lights?.epoch??this.#port.epoch,lights?.revision??this.#port.revision,
      occluders?.revision??0,records.map(light=>[
        light.id,light.radius,...light.position.map(v=>Math.round(v*2)/2)
      ].join(':')).join('|')].join('/');
    if(!this.#state||this.#state.identity!==identity){
      const distances=new Float32Array(POINT_VISIBILITY_FLOATS);
      for(let i=0;i<records.length;i++){
        const offset=i*POINT_VISIBILITY_BINS*POINT_VISIBILITY_BANDS;
        distances.fill(records[i].radius+.5,offset,offset+POINT_VISIBILITY_BINS*POINT_VISIBILITY_BANDS);
      }
      this.#state={identity,distances,lights:records.map(({id,position,radius})=>(
        {id,position:[...position],radius})),epoch:lights?.epoch??this.#port.epoch,
        revision:lights?.revision??this.#port.revision,pending:records.length*24,
        next:0,shapes:occluders?.entries??[],counted:false};
      this.#resets++;
    }
    const state=this.#state;
    while(state.next<state.lights.length*POINT_VISIBILITY_BINS*POINT_VISIBILITY_BANDS&&
      this.#rays<POINT_VISIBILITY_RAY_BUDGET){
      const slot=state.next++;
      const lightIndex=Math.floor(slot/(POINT_VISIBILITY_BINS*POINT_VISIBILITY_BANDS));
      const directionIndex=slot%POINT_VISIBILITY_BINS;
      const band=Math.floor(slot/POINT_VISIBILITY_BINS)%POINT_VISIBILITY_BANDS;
      const light=state.lights[lightIndex];
      // Angles are world-anchored, independent of camera, sprite type and material.
      const angle=-Math.PI+directionIndex*TAU/POINT_VISIBILITY_BINS;
      const normalized=Math.hypot(1,ELEVATION[band]);
      const direction=[Math.cos(angle)/normalized,ELEVATION[band]/normalized,
        Math.sin(angle)/normalized];
      const reach=(light.radius+.25)*normalized;
      state.distances[slot]=castRay(this.#port,light.position,direction,reach,state.shapes);
      this.#rays++;state.pending--;
    }
    if(!state.pending&&!state.counted){
      this.#processed++;
      state.counted=true;
    }
    this.#lastCpu=performance.now()-begin;
    this.#times.push(this.#lastCpu);
    if(this.#times.length>180)this.#times.shift();
    return {schema:POINT_VISIBILITY_SCHEMA,epoch:state.epoch,revision:state.revision,
      lights:state.lights,distances:state.distances,pending:state.pending,
      ready:state.pending===0};
  }
}

export function writePointVisibility(field,lights,dest){
  if(!(dest instanceof Float32Array)||dest.length!==POINT_VISIBILITY_FLOATS)
    throw new TypeError('Expected fixed-sized point occlusion upload');
  dest.fill(0);
  const emitters=lights?.emitters??[];
  if(!field?.ready||field.schema!==POINT_VISIBILITY_SCHEMA||
      field.epoch!==lights.epoch||field.revision!==lights.revision||
      field.lights.length!==emitters.length||
      !(field.distances instanceof Float32Array)||
      field.distances.length!==POINT_VISIBILITY_FLOATS)return false;
  for(let i=0;i<emitters.length;i++){
    const a=field.lights[i],b=emitters[i];
    if(a.id!==b.id||Math.hypot(...a.position.map((n,j)=>n-b.position[j]))>.75||
        a.radius!==b.radius)return false;
  }
  if(!field.distances.every(n=>Number.isFinite(n)&&n>=0&&n<=33))return false;
  dest.set(field.distances);
  return true;
}

export const POINT_VISIBILITY_GLSL=`
uniform bool uPointVisibilityEnabled;
uniform float uPointVisibilityDistances[48];
float pointLightVisibility(int lightIndex,vec3 point,vec3 source){
  if(!uPointVisibilityEnabled)return 1.0;
  vec2 offset=point.xz-source.xz;
  float radial=length(offset);
  if(radial<.12)return 1.0;
  float angle=atan(offset.y,offset.x);
  int sector=int(mod(floor((angle+3.1415926536)/6.2831853072*12.0+.5),12.0));
  int band=point.y>source.y+.25?1:0;
  int index=lightIndex*24+band*12+sector;
  float blockedAt=uPointVisibilityDistances[index];
  return 1.0-smoothstep(blockedAt-.10,blockedAt+.24,radial);
}
`;
