import { projectVoxel } from './camera-presets.mjs';
import {HuntWoodlandObjects} from './hunt-woodland-objects.mjs';
import {ScenicForest,projectTreeSprite} from './hunt-scenic-forest.mjs';

function paintProp(ctx,prop,view,foot){
  const width=Math.max(2,Math.round(2*(prop.radius+(prop.halfLength??0))*view.scale));
  const height=Math.max(2,Math.round(prop.height*view.scale));
  const x=Math.round(foot.x-width/2), y=Math.round(foot.y-height*.85);
  const log=prop.kind==='log';
  const inset=Math.max(1,Math.round(width*(log?.08:.19)));
  ctx.fillStyle=log?'#412c22':'#343a3d';
  ctx.fillRect(x,y+Math.round(height*.25),width,Math.round(height*.75));
  ctx.fillStyle=log?'#70503b':'#606b69';
  ctx.fillRect(x+inset,y,width-inset*2,Math.max(1,Math.round(height*.58)));
  ctx.fillStyle=log?'#a27b51':'#84918a';
  ctx.fillRect(log?x:x+inset*2,y+Math.round(height*.25),
    Math.max(1,Math.round(width*(log?.16:.38))),Math.max(1,Math.round(height*.25)));
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
  paint(ctx,view,actor,paintActor){
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
      else if(layer.prop)paintProp(ctx,layer.prop,view,layer.foot);
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
