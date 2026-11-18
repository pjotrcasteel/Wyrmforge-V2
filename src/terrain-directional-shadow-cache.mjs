// Renderer-owned bounded and cached terrain receiver projection.
// Sprite alpha is read ONCE per variant, never during each frame.
import {projectVoxel,getCameraPreset} from './camera-presets.mjs';
import {CANOPY_COLS,CANOPY_ROWS,projectDirectionalReceivers,HUNT_SUN_CAST,HUNT_SUN_RAY,HUNT_SUN_RAY_LENGTH}
  from './lighting/directional-sunlight.mjs';
export const DIRECTIONAL_MAX_ENTRIES=128;
export const DIRECTIONAL_RAYS_PER_FRAME=16;
export const DIRECTIONAL_DRAW_LIMIT=1100;
const spriteKey=s=>s.name??[s.x,s.y,s.w,s.h].join(':');
const CAMERA_RAY_DISTANCE=6;
const RECEIVER_EPSILON=.045;
const MAX_CLIFF_DROP=3.5;
const normalize=vector=>vector.map(n=>n/Math.hypot(...vector));
function cameraCastDirection(camera){
  const {right,down}=getCameraPreset(camera);
  return normalize([
    right[1]*down[2]-right[2]*down[1],
    right[2]*down[0]-right[0]*down[2],
    right[0]*down[1]-right[1]*down[0]
  ]);
}
function normalOf(hit){
  // A missing normal from a very old/custom port is safe only for top
  // receivers. Native Voxel DDA always provides normals for outside hits.
  return hit?.normal??{x:0,y:1,z:0};
}
function validReceiver(hit,tree,direction){
  if(!hit?.point||!Number.isFinite(hit.point.y)||hit.distance<=0)return null;
  const normal=normalOf(hit);
  const isTop=normal.y>.5;
  const isWall=Math.abs(normal.x)>.5||Math.abs(normal.z)>.5;
  if(!isTop&&!isWall)return null;
  const exposure=-(normal.x*HUNT_SUN_RAY[0]+normal.y*HUNT_SUN_RAY[1]+normal.z*HUNT_SUN_RAY[2]);
  if(exposure<.12||Math.abs(hit.point.y-tree.y)>MAX_CLIFF_DROP)return null;
  const cameraExposure=-(normal.x*direction[0]+normal.y*direction[1]+normal.z*direction[2]);
  if(cameraExposure<.12)return null;
  return {normal,isWall};
}
function cameraSeesReceiver(terrain,point,normal,direction){
  const lifted=[point.x+normal.x*RECEIVER_EPSILON,
    point.y+normal.y*RECEIVER_EPSILON,
    point.z+normal.z*RECEIVER_EPSILON];
  const eye=lifted.map((value,index)=>value-direction[index]*CAMERA_RAY_DISTANCE);
  const seen=terrain.raycast({origin:eye,direction,maxDistance:CAMERA_RAY_DISTANCE+.2});
  return Boolean(seen?.point)&&
    Math.hypot(seen.point.x-point.x,seen.point.y-point.y,seen.point.z-point.z)<.20;
}
// Broad-phase projection independent of sprite visibility: a tree crown
// can leave the right edge while its sunlight cast still falls ON screen.
// No terrain queries are needed for this conservative AABB check.
export function directionalShadowMayReachView(caster,view){
  if(!caster||!view||![caster.x,caster.y,caster.z,view.width,view.height,
      view.scale].every(Number.isFinite))return false;
  const silhouette=caster.silhouette??caster.sprite;
  const volume=caster.bounds;
  if(!silhouette&&!volume)return false;
  const scale=(caster.scale??1)/32;
  const height=silhouette?
    Math.max(0,silhouette.ay*scale):
    Math.max(0,volume.max[1]-caster.y);
  const minX=silhouette?caster.x-silhouette.ax*scale:volume.min[0];
  const maxX=silhouette?caster.x+(silhouette.w-silhouette.ax)*scale:volume.max[0];
  const minZ=volume?volume.min[2]:caster.z;
  const maxZ=volume?volume.max[2]:caster.z;
  const worldMinX=minX+height*Math.min(0,HUNT_SUN_CAST.x);
  const worldMaxX=maxX+height*Math.max(0,HUNT_SUN_CAST.x);
  const worldMinZ=minZ+height*Math.min(0,HUNT_SUN_CAST.z);
  const worldMaxZ=maxZ+height*Math.max(0,HUNT_SUN_CAST.z);
  let x0=Infinity,x1=-Infinity,y0=Infinity,y1=-Infinity;
  for(const x of [worldMinX,worldMaxX]){
    for(const z of [worldMinZ,worldMaxZ]){
      for(const y of [caster.y-MAX_CLIFF_DROP,caster.y+MAX_CLIFF_DROP]){
        const pixel=projectVoxel(x,y,z,view);
        x0=Math.min(x0,pixel.x);x1=Math.max(x1,pixel.x);
        y0=Math.min(y0,pixel.y);y1=Math.max(y1,pixel.y);
      }
    }
  }
  const margin=view.scale*.5;
  return x1>=-margin&&x0<=view.width+margin&&
    y1>=-margin&&y0<=view.height+margin;
}

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
  #queries=0;#drawn=0;#hits=0;#built=0;#times=[];#frame=0;#cliffDrawn=0;#occluded=0;#evicted=0;#cold=0;
  constructor(maskFactory=spriteMask){this.maskFactory=maskFactory;}
  beginFrame(){this.#frame++;this.#queries=0;this.#drawn=0;this.#cliffDrawn=0;}
  endFrame(ms){
    // A caster partially built before a camera move must never starve new
    // visible trees while it remains resident but outside the viewport.
    if(this.#pending?.seenFrame!==this.#frame)this.#pending=null;
    this.#times.push(Math.max(0,ms));
    if(this.#times.length>120)this.#times.shift();
  }
  get statistics(){
    const sorted=[...this.#times].sort((a,b)=>a-b);
    const q=n=>sorted.length?Number(sorted[Math.ceil((sorted.length-1)*n)].toFixed(2)):null;
    return {entries:this.#entries.size,maskVariants:this.#masks.size,
      approxBytes:this.#entries.size*CANOPY_COLS*CANOPY_ROWS*44+
        this.#masks.size*CANOPY_COLS*CANOPY_ROWS*4,
      frameRays:this.#queries,frameStamps:this.#drawn,frameCliffStamps:this.#cliffDrawn,
      occlusionRejects:this.#occluded,cacheHits:this.#hits,cacheEvictions:this.#evicted,coldCasters:this.#cold,
      completed:this.#built,building:Boolean(this.#pending),
      p50CpuMs:q(.5),p95CpuMs:q(.95),p99CpuMs:q(.99),
      gpuTimerMs:null,gpuTimerStatus:'unavailable: Canvas2D shadow overlay'};
  }
  clear(){this.#masks.clear();this.#entries.clear();this.#pending=null;this.#epoch=null;this.#evicted=0;this.#cold=0;}
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
  stamps(tree,terrain,isPublished=null,camera='hunt'){
    const silhouette=tree?.silhouette??tree?.sprite;
    if(!tree?.id||!terrain||typeof terrain.raycast!=='function'||
       !silhouette&&!tree?.bounds)return [];
    if(this.#epoch!==terrain.epoch){
      this.#entries.clear();this.#pending=null;this.#epoch=terrain.epoch;
    }
    const sourceSignature=silhouette?spriteKey(silhouette):
      [...tree.bounds.min,...tree.bounds.max].join(',');
    const signature=[tree.id,tree.x,tree.y,tree.z,tree.scale??1,sourceSignature,
      tree.shadowRevision??0,camera].join(':');
    const cached=this.#entries.get(tree.id);
    if(cached?.signature===signature){
      // Refresh recency only on a *visible* caller. FIFO eviction used to
      // repeatedly discard the same foreground shadows while walking.
      this.#entries.delete(tree.id);
      this.#entries.set(tree.id,cached);
      this.#hits++;
      return cached.stamps;
    }
    if(this.#queries>=DIRECTIONAL_RAYS_PER_FRAME)return [];
    if(this.#pending&&this.#pending.id!==tree.id)return [];
    if(!this.#pending||this.#pending.signature!==signature){
      let mask=[];
      if(silhouette){
        const maskKey=spriteKey(silhouette);
        if(!this.#masks.has(maskKey)){
          this.#masks.set(maskKey,this.maskFactory(tree.image,silhouette)??[]);
        }
        mask=this.#masks.get(maskKey);
      }
      const samples=projectDirectionalReceivers(tree,mask);
      this.#cold++;
      const xs=samples.map(s=>s.x),zs=samples.map(s=>s.z);
      const bounds={minX:Math.min(tree.x,...xs)-.6,maxX:Math.max(tree.x,...xs)+.6,
        minZ:Math.min(tree.z,...zs)-.6,maxZ:Math.max(tree.z,...zs)+.6};
      this.#pending={id:tree.id,signature,bounds,samples,index:0,stamps:[],seenFrame:this.#frame};
    }
    const job=this.#pending;
    job.seenFrame=this.#frame;
    const viewRay=cameraCastDirection(camera);
    // Two bounded physical queries per receiver: first solid struck by sun,
    // then nearest face visible to the Hunt camera. This avoids full-height
    // columns, light through solid cliffs and shadows drawn through ridges.
    while(job.index<job.samples.length&&this.#queries+2<=DIRECTIONAL_RAYS_PER_FRAME){
      const s=job.samples[job.index++];
      this.#queries++;
      const rayLength=Math.min(16,(s.height+MAX_CLIFF_DROP+.4)*HUNT_SUN_RAY_LENGTH);
      const hit=terrain.raycast({
        origin:[s.source[0],s.source[1]+.025,s.source[2]],
        direction:HUNT_SUN_RAY,maxDistance:rayLength
      });
      const face=validReceiver(hit,tree,viewRay);
      if(!face||isPublished&&!isPublished(hit.point.x,hit.point.z))continue;
      this.#queries++;
      if(!cameraSeesReceiver(terrain,hit.point,face.normal,viewRay)){
        this.#occluded++;
        continue;
      }
      const {x,y,z}=hit.point;
      job.stamps.push({...s,x,y:y+face.normal.y*RECEIVER_EPSILON,
        z:z+face.normal.z*RECEIVER_EPSILON,face:face.isWall?'cliff':'ground'});
    }
    if(job.index<job.samples.length)return [];
    while(this.#entries.size>=DIRECTIONAL_MAX_ENTRIES){
      this.#entries.delete(this.#entries.keys().next().value);
      this.#evicted++;
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
      const h=s.face==='cliff'
        ?Math.max(2,Math.round(Math.min(.7,s.depth)*view.scale*.64))
        :Math.max(1,Math.round(s.depth*view.scale*.77));
      if(p.x+w<0||p.x-w>view.width||p.y+h<0||p.y-h>view.height)continue;
      ctx.globalAlpha=s.alpha;
      ctx.fillRect(Math.round(p.x-w*.5),Math.round(p.y-h*.5),w,h);
      this.#drawn++;
      if(s.face==='cliff')this.#cliffDrawn++;
    }
    ctx.restore();
  }
}
