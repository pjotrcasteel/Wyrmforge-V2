import { projectVoxel } from './camera-presets.mjs';
import {HuntWoodlandObjects} from './hunt-woodland-objects.mjs';
import {ScenicForest,projectTreeSprite} from './hunt-scenic-forest.mjs';

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
  paint(ctx,view,actor,paintActor){
    const layers=[];
    const visible=[this.#scenery.trees(view),...this.objects.regions];
    if(this.#image.complete&&this.#image.naturalWidth){
      for(const trees of visible)for(const tree of trees){
        const layer=projectTreeSprite(tree,view);
        if(layer)layers.push(layer);
      }
    }
    const foot=projectVoxel(actor.x,actor.y,actor.z,view);
    layers.push({depth:foot.depth});
    layers.sort((a,b)=>b.depth-a.depth);
    ctx.save();
    ctx.imageSmoothingEnabled=false;
    for(const layer of layers){
      const {sprite,x,y,w,h}=layer;
      if(sprite)ctx.drawImage(this.#image,sprite.x,sprite.y,sprite.w,sprite.h,x,y,w,h);
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
