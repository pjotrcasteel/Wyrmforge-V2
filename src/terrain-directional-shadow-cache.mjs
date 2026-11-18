// Renderer-owned bounded and cached terrain receiver projection.
// Sprite alpha is read ONCE per variant, never during each frame.
import {projectVoxel} from './camera-presets.mjs';
import {CANOPY_COLS,CANOPY_ROWS,projectCanopyReceivers} from './lighting/directional-sunlight.mjs';
export const DIRECTIONAL_MAX_ENTRIES=48;
export const DIRECTIONAL_RAYS_PER_FRAME=16;
export const DIRECTIONAL_DRAW_LIMIT=1100;
const spriteKey=s=>s.name??[s.x,s.y,s.w,s.h].join(':');
export function sampleCanopyAlpha(data,width,height){
  if(!data||data.length<width*height*4||width<=0||height<=0)return [];
  const result=[],offsets=[[.22,.22],[.78,.22],[.22,.78],[.78,.78]];
  for(let row=0;row<CANOPY_ROWS;row++)for(let col=0;col<CANOPY_COLS;col++){
    let filled=0;
    for(const [ux,uy] of offsets){
      const x=Math.min(width-1,Math.floor((col+ux)*width/CANOPY_COLS));
      const y=Math.min(height-1,Math.floor((row+uy)*height/CANOPY_ROWS));
      if(data[(y*width+x)*4+3]>96)filled++;
    }
    if(filled>=2)result.push({col,row,coverage:filled/4});
  }
  return result;
}
function spriteMask(image,sprite){
  if(!image?.complete||!image.naturalWidth)return [];
  const canvas=typeof OffscreenCanvas==='function'
    ?new OffscreenCanvas(sprite.w,sprite.h):document.createElement('canvas');
  canvas.width=sprite.w;canvas.height=sprite.h;
  const ctx=canvas.getContext('2d',{willReadFrequently:true});
  ctx.drawImage(image,sprite.x,sprite.y,sprite.w,sprite.h,0,0,sprite.w,sprite.h);
  return sampleCanopyAlpha(ctx.getImageData(0,0,sprite.w,sprite.h).data,sprite.w,sprite.h);
}
export class TerrainDirectionalShadowCache{
  #masks=new Map();#entries=new Map();#pending=null;#epoch=null;
  #queries=0;#drawn=0;#hits=0;#built=0;#times=[];
  constructor(maskFactory=spriteMask){this.maskFactory=maskFactory;}
  beginFrame(){this.#queries=0;this.#drawn=0;}
  endFrame(ms){this.#times.push(Math.max(0,ms));if(this.#times.length>120)this.#times.shift();}
  get statistics(){
    const sorted=[...this.#times].sort((a,b)=>a-b);
    const q=n=>sorted.length?Number(sorted[Math.ceil((sorted.length-1)*n)].toFixed(2)):null;
    return {entries:this.#entries.size,maskVariants:this.#masks.size,
      approxBytes:this.#entries.size*CANOPY_COLS*CANOPY_ROWS*44+
        this.#masks.size*CANOPY_COLS*CANOPY_ROWS*4,
      frameRays:this.#queries,frameStamps:this.#drawn,cacheHits:this.#hits,
      completed:this.#built,building:Boolean(this.#pending),
      p50CpuMs:q(.5),p95CpuMs:q(.95),p99CpuMs:q(.99),
      gpuTimerMs:null,gpuTimerStatus:'unavailable: Canvas2D shadow overlay'};
  }
  clear(){this.#masks.clear();this.#entries.clear();this.#pending=null;this.#epoch=null;}
  prune(ids){
    for(const id of this.#entries.keys())if(!ids.has(id))this.#entries.delete(id);
    if(this.#pending&&!ids.has(this.#pending.id))this.#pending=null;
  }
  remove(id){
    this.#entries.delete(id);
    if(this.#pending?.id===id)this.#pending=null;
  }
  invalidate(bounds){
    if(!bounds)return;
    const overlap=b=>b&&b.maxX>=bounds.min.x&&b.minX<=bounds.max.x+1&&
      b.maxZ>=bounds.min.z&&b.minZ<=bounds.max.z+1;
    for(const [id,entry] of this.#entries)if(overlap(entry.bounds))this.#entries.delete(id);
    if(overlap(this.#pending?.bounds))this.#pending=null;
  }
  stamps(tree,terrain,isPublished=null){
    if(!tree?.sprite||!tree.id||!terrain||typeof terrain.raycast!=='function')return [];
    if(this.#epoch!==terrain.epoch){
      this.#entries.clear();this.#pending=null;this.#epoch=terrain.epoch;
    }
    const signature=[tree.id,tree.x,tree.y,tree.z,tree.scale,spriteKey(tree.sprite)].join(':');
    const cached=this.#entries.get(tree.id);
    if(cached?.signature===signature){this.#hits++;return cached.stamps;}
    if(this.#queries>=DIRECTIONAL_RAYS_PER_FRAME)return [];
    if(this.#pending&&this.#pending.id!==tree.id)return [];
    if(!this.#pending||this.#pending.signature!==signature){
      const maskKey=spriteKey(tree.sprite);
      if(!this.#masks.has(maskKey)){
        this.#masks.set(maskKey,this.maskFactory(tree.image,tree.sprite)??[]);
      }
      const samples=projectCanopyReceivers(tree,this.#masks.get(maskKey));
      const xs=samples.map(s=>s.x),zs=samples.map(s=>s.z);
      const bounds={minX:Math.min(tree.x,...xs)-.6,maxX:Math.max(tree.x,...xs)+.6,
        minZ:Math.min(tree.z,...zs)-.6,maxZ:Math.max(tree.z,...zs)+.6};
      this.#pending={id:tree.id,signature,bounds,samples,index:0,stamps:[]};
    }
    const job=this.#pending;
    while(job.index<job.samples.length&&this.#queries<DIRECTIONAL_RAYS_PER_FRAME){
      const s=job.samples[job.index++];
      if(isPublished&&!isPublished(s.x,s.z))continue;
      this.#queries++;
      const hit=terrain.raycast({origin:[s.x,tree.y+5,s.z],
        direction:[0,-1,0],maxDistance:12});
      const y=hit?.point?.y;
      if(!Number.isFinite(y)||Math.abs(y-tree.y)>3.5)continue;
      job.stamps.push({...s,y:y+.04});
    }
    if(job.index<job.samples.length)return [];
    while(this.#entries.size>=DIRECTIONAL_MAX_ENTRIES){
      this.#entries.delete(this.#entries.keys().next().value);
    }
    this.#entries.set(tree.id,{signature,bounds:job.bounds,stamps:job.stamps});
    this.#built++;this.#pending=null;
    return job.stamps;
  }
  paint(ctx,view,stamps){
    if(!stamps?.length||this.#drawn>=DIRECTIONAL_DRAW_LIMIT)return;
    ctx.save();ctx.imageSmoothingEnabled=false;ctx.fillStyle='#070d12';
    for(const s of stamps){
      if(this.#drawn>=DIRECTIONAL_DRAW_LIMIT)break;
      const p=projectVoxel(s.x,s.y,s.z,view);
      const w=Math.max(1,Math.round(s.width*view.scale));
      const h=Math.max(1,Math.round(s.depth*view.scale*.77));
      if(p.x+w<0||p.x-w>view.width||p.y+h<0||p.y-h>view.height)continue;
      ctx.globalAlpha=s.alpha;
      ctx.fillRect(Math.round(p.x-w*.5),Math.round(p.y-h*.5),w,h);
      this.#drawn++;
    }
    ctx.restore();
  }
}
