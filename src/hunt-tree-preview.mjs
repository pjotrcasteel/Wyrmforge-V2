import { projectVoxel } from './camera-presets.mjs';
import { LIVE_TREES } from './wet-forest-tree-sprites.mjs';

// H08-05 first visual slice. Placement IDs survive eviction and regenerated
// instances choose the same original art. Cache only published regions.
export class HuntTreePreview {
  #regions=new Map();
  #image;
  #graph;
  constructor(graph,image){
    this.#graph=graph;
    this.#image=image;
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
    for(const trees of this.#regions.values())for(const tree of trees){
      const foot=projectVoxel(tree.x,tree.y,tree.z,view);
      const {sprite}=tree;
      const scale=view.scale*tree.scale/32;
      const x=Math.round(foot.x-sprite.ax*scale),y=Math.round(foot.y-sprite.ay*scale);
      const w=Math.round(sprite.w*scale),h=Math.round(sprite.h*scale);
      if(x+w<=0||x>=view.width||y+h<=0||y>=view.height)continue;
      layers.push({depth:foot.depth,x,y,w,h,sprite});
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
