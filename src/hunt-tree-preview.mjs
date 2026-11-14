import { projectVoxel } from './camera-presets.mjs';
import { containsHuntLandform } from './world-generation/hunt-landform-footprint.mjs';
import { LIVE_TREES } from './wet-forest-tree-sprites.mjs';

const EDGE_SPRITES=LIVE_TREES.filter(sprite=>sprite.h>=150);

const EDGE_OFFSETS=Array.from({length:4},(_,i)=>i+1)
  .flatMap(d=>[[0,-d],[-d,0],[d,0],[0,d]]);
const edgeHash=(x,z)=>(Math.imul(x,73856093)^Math.imul(z,19349663))>>>0;

function nearTrailMouth(region,x,z){
  if(region.role==='arrival'&&z>=region.bounds.maxZ-4&&Math.abs(x-region.offsetX)<6)return true;
  if(region.role==='extraction'&&z<=region.bounds.minZ+4&&Math.abs(x-region.offsetX)<6)return true;
  return (region.ports??[]).some(({at,direction})=>{
    const sideways=direction==='east'||direction==='west';
    return Math.abs(sideways?x-at.x:z-at.z)<5&&Math.abs(sideways?z-at.z:x-at.x)<6;
  });
}

export function placeScenicEdgeTrees(region,layout,terrain){
  const inside=(x,z)=>layout.regions.some(band=>containsHuntLandform(band,x,z))||
    layout.links.some(band=>containsHuntLandform(band,x,z));
  const {minX,maxX,minZ,maxZ}=region.bounds;
  const candidates=[];
  for(let z=minZ-4;z<=maxZ+4;z++){
    for(let x=minX-4;x<=maxX+4;x++){
      const hash=edgeHash(x,z);
      if(hash%4!==0||inside(x,z)||nearTrailMouth(region,x+.5,z+.5))continue;
      const edge=EDGE_OFFSETS.find(([dx,dz])=>containsHuntLandform(region,x+dx,z+dz));
      if(!edge)continue;
      const owner=layout.regions.find(band=>EDGE_OFFSETS.some(([dx,dz])=>
        containsHuntLandform(band,x+dx,z+dz)));
      if(owner!==region)continue;
      candidates.push({x,z,hash,edge});
    }
  }
  const trees=[];
  for(const {x,z,hash,edge} of candidates.sort((a,b)=>a.hash-b.hash)){
    if(trees.some(tree=>Math.hypot(tree.x-x-.5,tree.z-z-.5)<2.8))continue;
    const hit=terrain.raycast({origin:[x+edge[0]+.5,32,z+edge[1]+.5],
      direction:[0,-1,0],maxDistance:42});
    if(!hit)continue;
    const setback=Math.abs(edge[0])+Math.abs(edge[1]);
    trees.push({x:x+.5,y:hit.point.y-.35-setback*.18,z:z+.5,
      scale:.84+((hash>>>8)%6)*.08,opacity:1-setback*.12,
      sprite:EDGE_SPRITES[(hash>>>16)%EDGE_SPRITES.length],scenic:true});
  }
  return trees;
}

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
    const region=this.#graph.layout.regions.find(band=>band.id===next);
    const trees=placeScenicEdgeTrees(region,this.#graph.layout,terrain);
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
      if(tree.scenic&&view.camera!=='hunt')continue;
      const foot=projectVoxel(tree.x,tree.y,tree.z,view);
      const {sprite}=tree;
      const scale=view.scale*tree.scale/32;
      const x=Math.round(foot.x-sprite.ax*scale),y=Math.round(foot.y-sprite.ay*scale);
      const w=Math.round(sprite.w*scale),h=Math.round(sprite.h*scale);
      if(x+w<=0||x>=view.width||y+h<=0||y>=view.height)continue;
      layers.push({depth:foot.depth,x,y,w,h,sprite,opacity:tree.opacity??1});
    }
    const foot=projectVoxel(actor.x,actor.y,actor.z,view);
    layers.push({depth:foot.depth});
    layers.sort((a,b)=>b.depth-a.depth);
    ctx.save();
    ctx.imageSmoothingEnabled=false;
    for(const layer of layers){
      const {sprite,x,y,w,h}=layer;
      ctx.globalAlpha=layer.opacity??1;
      if(sprite)ctx.drawImage(this.#image,sprite.x,sprite.y,sprite.w,sprite.h,x,y,w,h);
      else paintActor();
    }
    ctx.restore();
  }
}


// A world-anchored scenic canopy behind the WebGL terrain. The repeating
// patch is drawn once and has no terrain, object or collision representation.
// Wet Forest's scenic shelf sits near the playable grass elevation. Keep
// this datum fixed so walking and Fireball edits never shift the scenery.
export function forestBackdropOrigin(view){
  return projectVoxel(0,5,0,view);
}

export function createForestBackdrop(image){
  const tile=document.createElement('canvas');
  tile.width=384;
  tile.height=384;
  const brush=tile.getContext('2d');
  let pattern;
  return (ctx,view)=>{
    if(!pattern&&image.complete&&image.naturalWidth){
      brush.fillStyle='#304732';
      brush.fillRect(0,0,384,384);
      brush.imageSmoothingEnabled=false;
      for(let row=0;row<8;row++)for(let col=0;col<8;col++){
        const sprite=LIVE_TREES[(row*11+col*7)%LIVE_TREES.length];
        const x=col*48+(row*13+col*3)%28;
        const y=row*48+(col*19+row*5)%29;
        const w=Math.round(sprite.w*.62),h=Math.round(sprite.h*.62);
        for(const dx of [-384,0,384])for(const dy of [-384,0,384]){
          brush.drawImage(image,sprite.x,sprite.y,sprite.w,sprite.h,x+dx-w/2,y+dy-h,w,h);
        }
      }
      brush.fillStyle='rgba(25,48,34,.42)';
      brush.fillRect(0,0,384,384);
      pattern=ctx.createPattern(tile,'repeat');
    }
    ctx.save();
    const origin=forestBackdropOrigin(view);
    ctx.translate(Math.round(origin.x),Math.round(origin.y));
    const scale=view.scale/16;
    ctx.scale(scale,scale);
    ctx.imageSmoothingEnabled=false;
    ctx.fillStyle=pattern??'#304732';
    ctx.fillRect(-origin.x/scale-2,-origin.y/scale-2,
      view.width/scale+4,view.height/scale+4);
    ctx.restore();
  };
}
