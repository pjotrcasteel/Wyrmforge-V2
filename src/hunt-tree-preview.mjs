import { projectVoxel } from './camera-presets.mjs';
import { LIVE_TREES } from './wet-forest-tree-sprites.mjs';
import {ScenicForest,projectTreeSprite} from './hunt-scenic-forest.mjs';

// H08-05 first visual slice. Placement IDs survive eviction and regenerated
// instances choose the same original art. Cache only published regions.
export class HuntTreePreview {
  #regions=new Map();
  #image;
  #graph;
  #scenery;
  constructor(graph,image){
    this.#graph=graph;
    this.#image=image;
    this.#scenery=new ScenicForest(graph.layout);
  }
  update(regionIds,terrain){
    for(const id of this.#regions.keys()){
      if(!regionIds.includes(id))this.#regions.delete(id);
    }
    const next=regionIds.find(id=>!this.#regions.has(id));
    if(next===undefined||!this.#image.complete||!this.#image.naturalWidth)return;
    const trees=[];
    for(const item of this.#graph.placement(next).placements){
      if(item.kind!=='tree')continue;
      const {x,z}=item.position;
      const hit=terrain.raycast({origin:[x,32,z],direction:[0,-1,0],maxDistance:42});
      if(hit&&Math.abs(hit.point.y-item.position.y)<=.5){
        trees.push({x,y:hit.point.y,z,scale:item.scale,sprite:LIVE_TREES[(item.seed>>>8)%LIVE_TREES.length]});
      }
    }
    this.#regions.set(next,trees);
  }
  paint(ctx,view,actor,paintActor){
    const layers=[];
    const visible=[this.#scenery.trees(view),...this.#regions.values()];
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
