import {raycastTerrain,terrainRayFromScreen} from '../terrain-raycast.mjs';
import {clusterCellBounds,clusterCellBoxes} from '../terrain-cluster-collision.mjs';

const residentCeilings=new WeakMap();

function residentCeiling(world){
  const cached=residentCeilings.get(world);
  if(cached?.revision===world.revision)return cached.height;
  let height=-Infinity;
  for(const id of world.chunkIds()){
    const [,y]=id.split(',');
    height=Math.max(height,(Number(y)+1)*world.chunkEdge);
  }
  residentCeilings.set(world,{revision:world.revision,height});
  return height;
}

function intersectsBox(origin,direction,distance,{x,y,z}){
  const axes=[x,y,z];
  let enter=0,exit=distance;
  for(let axis=0;axis<3;axis++){
    const [minimum,maximum]=axes[axis];
    const offset=origin[axis]-minimum;
    const size=maximum-minimum;
    const speed=direction[axis];
    if(Math.abs(speed)<1e-9){
      if(offset<0||offset>=size)return false;
      continue;
    }
    const a=-offset/speed,b=(size-offset)/speed;
    enter=Math.max(enter,Math.min(a,b));
    exit=Math.min(exit,Math.max(a,b));
    if(enter>=exit)return false;
  }
  return true;
}

function intersectsCell(origin,direction,distance,cell){
  if(!intersectsBox(origin,direction,distance,clusterCellBounds(cell,0)))return false;
  if(!cell.levels)return true;
  for(const box of clusterCellBoxes(cell)){
    if(intersectsBox(origin,direction,distance,box))return true;
  }
  return false;
}

// End each ray at the upright sprite plane through the actor's feet.
export function huntActorPixelOccluded(world,view,actor,x,y,ceiling,movingCells){
  const {origin,direction}=terrainRayFromScreen({...view,x,y});
  const [dx,dy,dz]=direction;
  const end=((actor.x-origin[0])*dx+(actor.z-origin[2])*dz)/(dx*dx+dz*dz)-0.02;
  const start=Number.isFinite(ceiling)?Math.max(0,(ceiling-origin[1])/dy):0;
  const maxDistance=end-start;
  if(maxDistance<=0)return false;
  const near=origin.map((value,axis)=>value+direction[axis]*start);
  return movingCells.some(cell=>intersectsCell(near,direction,maxDistance,cell))||
    raycastTerrain(world,{origin:near,direction,maxDistance})!==null;
}

export function clipHuntActor(ctx,world,view,actor,bounds,ceiling,movingCells){
  const staticCeiling=Number.isFinite(ceiling)?ceiling:residentCeiling(world);
  const rayCeiling=Math.max(staticCeiling,...movingCells.map(cell=>cell.y+1))+1;
  if(!Number.isFinite(rayCeiling))return;
  const left=Math.max(0,Math.floor(bounds.left));
  const right=Math.min(view.width,Math.ceil(bounds.right));
  const top=Math.max(0,Math.floor(bounds.top));
  const bottom=Math.min(view.height,Math.ceil(bounds.bottom));
  const step=Math.max(1,Math.ceil(Math.max(right-left,bottom-top)/28));
  let hidden=false;
  ctx.beginPath();
  for(let y=top;y<bottom;y+=step){
    const h=Math.min(step,bottom-y);
    let start=left;
    for(let x=left;x<right;x+=step){
      const w=Math.min(step,right-x);
      if(!huntActorPixelOccluded(world,view,actor,x+w/2,y+h/2,rayCeiling,movingCells))continue;
      hidden=true;
      if(start<x)ctx.rect(start,y,x-start,h);
      start=x+w;
    }
    if(start<right)ctx.rect(start,y,right-start,h);
  }
  if(hidden)ctx.clip();
}
