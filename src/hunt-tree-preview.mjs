import { projectVoxel } from './camera-presets.mjs';
import {HuntWoodlandObjects} from './hunt-woodland-objects.mjs';
import {ScenicForest,projectTreeSprite} from './hunt-scenic-forest.mjs';

const BOULDER_SPRITE={x:0,y:416,w:26,h:27,ax:12,ay:26};
const LUMP_SPRITE={x:32,y:416,w:16,h:14,ax:8,ay:13};
const LOG_SPRITE={x:52,y:416,w:34,h:20,ax:17,ay:17};

function paintProp(ctx,image,prop,view,foot){
  const sprite=prop.kind==='log'?LOG_SPRITE:
    prop.radius<.65?LUMP_SPRITE:BOULDER_SPRITE;
  const footprintWidth=2*(prop.radius+(prop.halfLength??0))*view.scale;
  const scale=footprintWidth/sprite.w;
  const x=Math.round(foot.x-sprite.ax*scale);
  const y=Math.round(foot.y-sprite.ay*scale);
  ctx.drawImage(image,sprite.x,sprite.y,sprite.w,sprite.h,x,y,
    Math.max(1,Math.round(sprite.w*scale)),Math.max(1,Math.round(sprite.h*scale)));
}

// H08-05 first visual slice. Placement IDs survive eviction and regenerated
// instances choose the same original art. Cache only published regions.
export class HuntTreePreview {
  objects;
  #image;
  #scenery;
  constructor(graph,image){
    this.objects=new HuntWoodlandObjects(graph);
    this.#image=image;
    this.#scenery=new ScenicForest(graph.layout);
  }
  update(regionIds,terrain){
    if(this.#image.complete&&this.#image.naturalWidth)this.objects.update(regionIds,terrain);
  }
  paint(ctx,view,actor,paintActor,feature=null){
    const layers=[];
    const visible=[this.#scenery.trees(view),...this.objects.regions];
    if(this.#image.complete&&this.#image.naturalWidth){
      for(const trees of visible)for(const tree of trees){
        if(tree.kind){
          const foot=projectVoxel(tree.x,tree.y,tree.z,view);
          const margin=2*view.scale;
          if(foot.x>=-margin&&foot.x<=view.width+margin&&foot.y>=-margin&&foot.y<=view.height+margin){
            layers.push({depth:foot.depth,prop:tree,foot});
          }
          continue;
        }
        const layer=projectTreeSprite(tree,view);
        if(!layer)continue;
        if(feature&&tree.scenic&&layer.x<feature.x+feature.w&&layer.x+layer.w>feature.x&&
          layer.y<feature.y+feature.h&&layer.y+layer.h>feature.y){
          layer.depth=Math.max(layer.depth,feature.depth+.000001);
        }
        layers.push(layer);
      }
    }
    if(feature)layers.push(feature);
    const foot=projectVoxel(actor.x,actor.y,actor.z,view);
    layers.push({depth:foot.depth});
    layers.sort((a,b)=>b.depth-a.depth);
    ctx.save();
    ctx.imageSmoothingEnabled=false;
    for(const layer of layers){
      const {sprite,x,y,w,h}=layer;
      if(sprite)ctx.drawImage(this.#image,sprite.x,sprite.y,sprite.w,sprite.h,x,y,w,h);
      else if(layer.paint)layer.paint(ctx);
      else if(layer.prop)paintProp(ctx,this.#image,layer.prop,view,layer.foot);
      else paintActor();
    }
    ctx.restore();
  }
}


// Only forest floor belongs behind terrain. Every tree is drawn whole in
// the same depth-sorted overlay; a terrain edge can never slice a bitmap crown.
export function createForestBackdrop(){
  return (ctx,view)=>{
    ctx.save();
    ctx.fillStyle='#304732';
    ctx.fillRect(0,0,view.width,view.height);
    ctx.restore();
  };
}
