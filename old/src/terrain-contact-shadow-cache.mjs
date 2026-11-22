// Rendering-owned, bounded contact receiver sampler. The only terrain input
// is the public Voxel V2 terrain port; neither lighting nor renderer writes
// World Objects, fluid state, occupancy or save truth.
import {getCameraPreset,projectVoxel} from './camera-presets.mjs';
import {describeContactShadow,CONTACT_SHADOW_SAMPLE_COUNT} from './lighting/contact-shadows.mjs';
import {paintSoftShadowStamp} from './shadow-stamp-texture.mjs';

export const CONTACT_SHADOW_CACHE_LIMIT=96;
// One cold prop per frame instead of two; avoid bursty 52-64-ray
// microvoxel + visibility work during Hunt streaming.
export const CONTACT_SHADOW_RAY_BUDGET=26;
export const CONTACT_SHADOW_DRAW_BUDGET=1248;
const CAMERA_DISTANCE=2.5;
function towardsScene(camera){
  const {right:a,down:b}=getCameraPreset(camera);
  const cross=[a[1]*b[2]-a[2]*b[1],a[2]*b[0]-a[0]*b[2],a[0]*b[1]-a[1]*b[0]];
  const size=Math.hypot(...cross);
  return cross.map(value=>value/size);
}
function quantile(values,q){
  if(!values.length)return null;
  const sorted=[...values].sort((a,b)=>a-b);
  return Number(sorted[Math.ceil((sorted.length-1)*q)].toFixed(3));
}
export class TerrainContactShadowCache {
  #entries=new Map();
  #epoch=null;
  #rays=0;
  #drawn=0;
  #hits=0;
  #misses=0;
  #times=[];
  #lastMs=0;
  beginFrame(){this.#rays=0;this.#drawn=0;}
  endFrame(ms){
    this.#lastMs=Number(Math.max(0,ms).toFixed(3));
    this.#times.push(this.#lastMs);
    if(this.#times.length>180)this.#times.shift();
  }
  get statistics(){
    return {
      entries:this.#entries.size,approxBytes:this.#entries.size*CONTACT_SHADOW_SAMPLE_COUNT*64,
      frameRays:this.#rays,frameStamps:this.#drawn,cacheHits:this.#hits,cacheMisses:this.#misses,
      p50CpuMs:quantile(this.#times,.5),p95CpuMs:quantile(this.#times,.95),
      p99CpuMs:quantile(this.#times,.99),lastCpuMs:this.#lastMs,
      gpuTimerMs:null,gpuTimerStatus:'unavailable: Canvas2D contact overlay'
    };
  }
  clear(){this.#entries.clear();this.#epoch=null;}
  remove(id){this.#entries.delete(id);}
  prune(ids){for(const id of this.#entries.keys())if(!ids.has(id))this.#entries.delete(id);}
  invalidate(bounds){
    if(!bounds)return;
    for(const [id,entry] of this.#entries){
      const {x,z,radiusX, radiusZ}=entry.profile;
      if(x+radiusX>=bounds.min.x&&x-radiusX<=bounds.max.x+1&&
          z+radiusZ>=bounds.min.z&&z-radiusZ<=bounds.max.z+1)this.#entries.delete(id);
    }
  }
  stamps(prop,terrain,isPublished=null,camera='hunt'){
    if(!terrain||typeof terrain.raycast!=='function')return [];
    if(this.#epoch!==terrain.epoch){this.clear();this.#epoch=terrain.epoch;}
    const profile=describeContactShadow(prop);
    if(!profile||typeof profile.id!=='string')return [];
    const signature=[prop.x,prop.y,prop.z,prop.radius,prop.halfLength??0,prop.kind??'tree',camera].join(':');
    const cached=this.#entries.get(profile.id);
    if(cached?.signature===signature){
      this.#entries.delete(profile.id);this.#entries.set(profile.id,cached);
      this.#hits++;return cached.stamps;
    }
    if(this.#rays+CONTACT_SHADOW_SAMPLE_COUNT*2>CONTACT_SHADOW_RAY_BUDGET)return [];
    const direction=towardsScene(camera);
    const stamps=[];
    for(const sample of profile.samples){
      if(isPublished&&!isPublished(sample.x,sample.z))continue;
      this.#rays++;
      const support=terrain.raycast({
        origin:[sample.x,prop.y+.44,sample.z],direction:[0,-1,0],maxDistance:1
      });
      const y=support?.point?.y;
      if(!Number.isFinite(y)||Math.abs(y-prop.y)>.37)continue;
      const candidate=[sample.x,y,sample.z];
      this.#rays++;
      const visible=terrain.raycast({
        origin:candidate.map((value,i)=>value-direction[i]*CAMERA_DISTANCE+(i===1?.035:0)),
        direction,maxDistance:CAMERA_DISTANCE+.4
      });
      if(!visible?.point||![visible.point.x,visible.point.y,visible.point.z].every(Number.isFinite)||
          Math.hypot(visible.point.x-candidate[0],visible.point.y-candidate[1],
            visible.point.z-candidate[2])>.3)continue;
      stamps.push({...sample,y:y+.025});
    }
    this.#misses++;
    if(this.#entries.has(profile.id))this.#entries.delete(profile.id);
    while(this.#entries.size>=CONTACT_SHADOW_CACHE_LIMIT)this.#entries.delete(this.#entries.keys().next().value);
    this.#entries.set(profile.id,{signature,profile,stamps});
    return stamps;
  }
  paint(ctx,view,stamps){
    if(!stamps?.length||this.#drawn>=CONTACT_SHADOW_DRAW_BUDGET)return;
    ctx.save();
    ctx.imageSmoothingEnabled=true;
    for(const sample of stamps){
      if(this.#drawn>=CONTACT_SHADOW_DRAW_BUDGET)break;
      const center=projectVoxel(sample.x,sample.y,sample.z,view);
      const width=Math.max(1,Math.round(sample.halfX*2*view.scale));
      const height=Math.max(1,Math.round(sample.halfZ*2*view.scale*.77));
      if(center.x+width<0||center.x-width>view.width||
          center.y+height<0||center.y-height>view.height)continue;
      paintSoftShadowStamp(ctx,Math.round(center.x-width/2),
        Math.round(center.y-height/2),width,height,sample.alpha);
      this.#drawn++;
    }
    ctx.restore();
  }
}
