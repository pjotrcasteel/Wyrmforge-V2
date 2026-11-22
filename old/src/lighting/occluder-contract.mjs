// Generic read-only physical occluder boundary. A tree, building, wall or
// future prop uses the SAME AABB schema; no sprite/name/type branching.
export const LIGHT_OCCLUDER_SCHEMA='wyrmforge.light-occluders.v1';
export const MAX_LIGHT_OCCLUDERS=64;

export function defineLightOccluders({revision=0,entries=[]}={}){
  if(!Number.isSafeInteger(revision)||revision<0||!Array.isArray(entries)||
      entries.length>MAX_LIGHT_OCCLUDERS){
    throw new RangeError('Invalid bounded light occluder snapshot');
  }
  const ids=new Set();
  const colliders=entries.map(shape=>{
    if(typeof shape?.id!=='string'||!shape.id||ids.has(shape.id)||
      !Array.isArray(shape.min)||!Array.isArray(shape.max)||
      shape.min.length!==3||shape.max.length!==3||
      !shape.min.every(Number.isFinite)||!shape.max.every(Number.isFinite)||
      shape.min.some((v,i)=>v>=shape.max[i])){
      throw new TypeError('Expected a physical AABB occluder');
    }
    ids.add(shape.id);
    return Object.freeze({id:shape.id,min:Object.freeze([...shape.min]),
      max:Object.freeze([...shape.max])});
  });
  return Object.freeze({schema:LIGHT_OCCLUDER_SCHEMA,revision,
    entries:Object.freeze(colliders)});
}
// Returns the nearest intersection of a bounded ray, including the exit
// intersection when an emitter starts inside a solid building.
export function nearestOccluderDistance(origin,direction,maxDistance,shapes){
  let closest=maxDistance;
  for(const shape of shapes){
    let near=-Infinity,far=Infinity;
    for(let axis=0;axis<3;axis++){
      const o=origin[axis],d=direction[axis];
      if(Math.abs(d)<1e-9){
        if(o<shape.min[axis]||o>shape.max[axis]){far=-Infinity;break;}
        continue;
      }
      const a=(shape.min[axis]-o)/d,b=(shape.max[axis]-o)/d;
      near=Math.max(near,Math.min(a,b));
      far=Math.min(far,Math.max(a,b));
    }
    if(near>far||far<=0)continue;
    const hit=near>.03?near:far;
    if(hit<closest&&hit>0)closest=hit;
  }
  return closest;
}
