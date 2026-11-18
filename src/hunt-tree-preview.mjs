import {SpriteLightingCache,litSpriteColor} from './sprite-lighting-cache.mjs';
import {TerrainContactShadowCache} from './terrain-contact-shadow-cache.mjs';
import {TerrainDirectionalShadowCache,directionalShadowMayReachView} from './terrain-directional-shadow-cache.mjs';
import {describeDirectionalCaster} from './lighting/shadow-caster-contract.mjs';
import { projectVoxel } from './camera-presets.mjs';
import {HuntWoodlandObjects} from './hunt-woodland-objects.mjs';
import {ScenicForest,projectTreeSprite} from './hunt-scenic-forest.mjs';

const BOULDER_SPRITE={x:0,y:416,w:26,h:27,ax:12,ay:26};
const LUMP_SPRITE={x:32,y:416,w:16,h:14,ax:8,ay:13};
const FALL_DURATION_MS=500;
const MAX_VISIBLE_FALLS=24;
const LOG_SPRITE={x:52,y:416,w:34,h:20,ax:17,ay:17};

function paintProp(ctx,image,prop,view,foot,drawSprite=null){
  const sprite=prop.kind==='log'?LOG_SPRITE:
    prop.radius<.65?LUMP_SPRITE:BOULDER_SPRITE;
  const footprintWidth=2*(prop.radius+(prop.halfLength??0))*view.scale;
  const scale=footprintWidth/sprite.w;
  const x=Math.round(foot.x-sprite.ax*scale);
  const y=Math.round(foot.y-sprite.ay*scale);
  const rect=[x,y,Math.max(1,Math.round(sprite.w*scale)),Math.max(1,Math.round(sprite.h*scale))];
  if(drawSprite)drawSprite(sprite,rect);
  else ctx.drawImage(image,sprite.x,sprite.y,sprite.w,sprite.h,...rect);
  if(prop.damaged){
    ctx.fillStyle='#392e28';
    ctx.fillRect(Math.round(foot.x)-1,Math.round(y+sprite.h*scale*.35),2,Math.max(2,Math.round(sprite.h*scale*.35)));
  }
}

// H08-05 first visual slice. Placement IDs survive eviction and regenerated
// instances choose the same original art. Cache only published regions.
export class HuntTreePreview {
  objects;
  #image;
  #lightingCache=new SpriteLightingCache();
  #contacts=new TerrainContactShadowCache();
  #canopyShadows=new TerrainDirectionalShadowCache();
  #terrain=null;
  #coverage=null;
  #scenery;
  #falls=new Map();
  #casterProviders=new Set();
  #residentCasterIds=new Set();
  constructor(graph,image,damage,{directionalCache=null}={}){
    this.objects=new HuntWoodlandObjects(graph,damage);
    if(directionalCache)this.#canopyShadows=directionalCache;
    this.#image=image;
    this.#scenery=new ScenicForest(graph.layout);
  }
  // Register an owning scene system ONCE. A new building/tree variant only
  // publishes a descriptor, never a new shader branch or Lighting import.
  registerDirectionalCasterProvider(provider){
    if(typeof provider?.shadowCasters!=='function'){
      throw new TypeError('Expected read-only shadowCasters(view) provider');
    }
    this.#casterProviders.add(provider);
    return ()=>this.#casterProviders.delete(provider);
  }
  update(regionIds,terrain,coverage=null){
    if(this.#image.complete&&this.#image.naturalWidth){
      this.#terrain=terrain;
      this.#coverage=coverage;
      this.objects.update(regionIds,terrain,coverage);
      const ids=new Set([...this.objects.regions].flatMap(props=>props.map(prop=>prop.id)));
      this.#contacts.prune(ids);
      // Only prune casters formerly owned by these woodland regions.
      // External building/structure providers keep their independent cache.
      for(const id of this.#residentCasterIds){
        if(!ids.has(id))this.#canopyShadows.remove(id);
      }
      this.#residentCasterIds=ids;
    }
  }
  terrainChanged(bounds,terrain,isPublished,now,animate=true){
    this.#contacts.invalidate(bounds);
    this.#canopyShadows.invalidate(bounds);
    this.#animate(this.objects.terrainChanged(bounds,terrain,isPublished),now,animate);
  }
  hitProp(id,terrain,isPublished,now,animate){
    const hit=this.objects.hitProp(id,terrain,isPublished);
    if(hit){
      this.#contacts.remove(id);
      this.#canopyShadows.remove(id);
      this.#animate(hit.falls,now,animate);
    }
    return hit;
  }
  #animate(falls,now,animate){
    if(!animate)return;
    for(const {tree,landingY} of falls){
      if(this.#falls.size>=MAX_VISIBLE_FALLS)this.#falls.delete(this.#falls.keys().next().value);
      this.#falls.set(tree.id,{tree,landingY,startedAt:now});
    }
  }
  get lightingStatistics(){return this.#lightingCache.statistics;}
  get contactShadowStatistics(){return this.#contacts.statistics;}
  get directionalShadowStatistics(){return this.#canopyShadows.statistics;}
  dispose(){
    this.#contacts.clear();this.#canopyShadows.clear();this.#lightingCache.clear();this.#falls.clear();
    this.#terrain=null;this.#coverage=null;
    this.#casterProviders.clear();this.#residentCasterIds.clear();
  }
  paint(ctx,view,actor,paintActor,feature=null,now=performance.now(),lighting=null,contactShadows=true,directionalShadows=true){
    this.#lightingCache.beginFrame();
    this.#contacts.beginFrame();
    this.#canopyShadows.beginFrame();
    let directionalCpuMs=0;
    const canopyReceivers=[];
    let contactCpuMs=0;
    const collectDirectional=(instance)=>{
      if(!lighting||!directionalShadows||!this.#terrain||instance.scenic||
          this.#falls.has(instance.id))return;
      const caster=describeDirectionalCaster(instance,this.#image);
      if(!caster||!directionalShadowMayReachView(caster,view))return;
      const started=performance.now();
      const stamps=this.#canopyShadows.stamps(caster,this.#terrain,
        this.#coverage?.has,view.camera);
      directionalCpuMs+=performance.now()-started;
      if(stamps.length)canopyReceivers.push(stamps);
    };
    const addShadow=(tree,foot)=>{
      if(!lighting||!contactShadows||!this.#terrain||tree.scenic)return;
      const started=performance.now();
      const stamps=this.#contacts.stamps(tree,this.#terrain,this.#coverage?.has,view.camera);
      contactCpuMs+=performance.now()-started;
      if(stamps.length)layers.push({depth:foot.depth+.0001,shadow:stamps});
    };
    const draw=(sprite,rect,position)=>{
      if(lighting)this.#lightingCache.draw(ctx,this.#image,sprite,rect,lighting.sample(position),lighting.ambient);
      else ctx.drawImage(this.#image,sprite.x,sprite.y,sprite.w,sprite.h,...rect);
    };
    const layers=[];
    for(const [id,fall] of this.#falls){
      const progress=Math.min(1,Math.max(0,(now-fall.startedAt)/FALL_DURATION_MS));
      if(progress>=1){
        this.#falls.delete(id);
        continue;
      }
      const {tree,landingY}=fall;
      const {sprite}=tree;
      const drop=tree.y-(landingY??tree.y-1);
      const foot=projectVoxel(tree.x,tree.y-drop*progress*progress,tree.z,view);
      const scale=view.scale*tree.scale/32;
      const radius=Math.max(sprite.w,sprite.h)*scale;
      if(foot.x<-radius||foot.x>view.width+radius||foot.y<-radius||foot.y>view.height+radius)continue;
      const angle=(Math.sin(tree.x+tree.z)<0?-1:1)*Math.PI*.46*progress*progress;
      layers.push({depth:foot.depth,paint:()=>{
        ctx.save();
        ctx.translate(Math.round(foot.x),Math.round(foot.y));
        ctx.rotate(angle);
        ctx.globalAlpha=Math.min(1,(1-progress)*5);
        draw(sprite,[-sprite.ax*scale,-sprite.ay*scale,sprite.w*scale,sprite.h*scale],
          [tree.x,tree.y-drop*progress*progress+1,tree.z]);
        ctx.restore();
      }});
    }
    const visible=[this.#scenery.trees(view),...this.objects.regions];
    if(this.#image.complete&&this.#image.naturalWidth){
      for(const trees of visible)for(const tree of trees){
        if(tree.kind){
          collectDirectional(tree);
          const foot=projectVoxel(tree.x,tree.y,tree.z,view);
          const margin=2*view.scale;
          if(foot.x>=-margin&&foot.x<=view.width+margin&&foot.y>=-margin&&foot.y<=view.height+margin){
            const fall=this.#falls.get(tree.id);
            const alpha=fall?Math.max(0,Math.min(1,((now-fall.startedAt)/FALL_DURATION_MS-.8)*5)):1;
            addShadow(tree,foot);
            layers.push({depth:foot.depth,prop:tree,foot,alpha});
          }
          continue;
        }
        // A shadow can be visible after the caster sprite has left the
        // viewport. Do not tie receiver visibility to sprite culling.
        collectDirectional(tree);
        const layer=projectTreeSprite(tree,view);
        if(!layer)continue;
        if(feature&&tree.scenic&&layer.x<feature.x+feature.w&&layer.x+layer.w>feature.x&&
          layer.y<feature.y+feature.h&&layer.y+layer.h>feature.y){
          layer.depth=Math.max(layer.depth,feature.depth+.000001);
        }
        if(tree.damaged)layer.damageFoot=projectVoxel(tree.x,tree.y+.5,tree.z,view);
        layer.lightPosition=[tree.x,tree.y+1,tree.z];
        addShadow(tree,projectVoxel(tree.x,tree.y,tree.z,view));
        layers.push(layer);
      }
    }
    // Other scene systems (buildings, structures, future tree atlases) join
    // through the same bounded descriptor/provider interface.
    for(const provider of this.#casterProviders){
      const casters=provider.shadowCasters(view);
      if(!Array.isArray(casters)||casters.length>64){
        throw new RangeError('Unbounded scene shadow-caster provider');
      }
      for(const caster of casters)collectDirectional(caster);
    }
    if(feature)layers.push(feature);
    const foot=projectVoxel(actor.x,actor.y,actor.z,view);
    layers.push({depth:foot.depth});
    layers.sort((a,b)=>b.depth-a.depth);
    ctx.save();
    ctx.imageSmoothingEnabled=false;
    if(directionalShadows){
      const started=performance.now();
      for(const stamps of canopyReceivers)this.#canopyShadows.paint(ctx,view,stamps);
      directionalCpuMs+=performance.now()-started;
    }
    for(const layer of layers){
      const {sprite,x,y,w,h}=layer;
      if(layer.shadow){
        const started=performance.now();
        this.#contacts.paint(ctx,view,layer.shadow);
        contactCpuMs+=performance.now()-started;
      }
      else if(sprite){
        draw(sprite,[x,y,w,h],layer.lightPosition);
        if(layer.damageFoot){
          ctx.fillStyle='#c89962';
          ctx.fillRect(Math.round(layer.damageFoot.x)-2,Math.round(layer.damageFoot.y),5,2);
        }
      }
      else if(layer.paint)layer.paint(ctx);
      else if(layer.prop){
        ctx.globalAlpha=layer.alpha;
        paintProp(ctx,this.#image,layer.prop,view,layer.foot,lighting?
          (sprite,rect)=>draw(sprite,rect,[layer.prop.x,layer.prop.y+layer.prop.height*.5,layer.prop.z]):null);
        ctx.globalAlpha=1;
      }
      else paintActor();
    }
    ctx.restore();
    this.#contacts.endFrame(contactCpuMs);
    this.#canopyShadows.endFrame(directionalCpuMs);
  }
}


// Only forest floor belongs behind terrain. Every tree is drawn whole in
// the same depth-sorted overlay; a terrain edge can never slice a bitmap crown.
export function createForestBackdrop(){
  return (ctx,view,ambient=null)=>{
    ctx.save();
    ctx.fillStyle=ambient?litSpriteColor('#304732',ambient):'#304732';
    ctx.fillRect(0,0,view.width,view.height);
    ctx.restore();
  };
}
