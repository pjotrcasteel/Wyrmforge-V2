// Hunt-only adapter for the independent AI sensor port. Physics/Voxel and
// World Objects remain the authority: AI never reads their mutable internals.
import {raycastTerrain} from './terrain-raycast.mjs';
import {simulateTerrainActor} from './terrain-actor.mjs';

const finite=p=>p&&[p.x,p.y,p.z].every(Number.isFinite);
const intersectsSegment=(shape,origin,direction,length)=>{
  if(!Array.isArray(shape?.min)||!Array.isArray(shape?.max))return false;
  let near=0,far=length;
  for(let i=0;i<3;i++){
    const d=direction[i],start=origin[i];
    if(Math.abs(d)<1e-9){
      if(start<shape.min[i]||start>shape.max[i])return false;
      continue;
    }
    const a=(shape.min[i]-start)/d,b=(shape.max[i]-start)/d;
    near=Math.max(near,Math.min(a,b));
    far=Math.min(far,Math.max(a,b));
    if(near>far)return false;
  }
  return near<length&&far>0;
};

export class HuntAISpatialPort{
  #world=null;
  #objects=null;
  #accept=null;
  #shapes=[];
  #revision=-1;
  bind(world,objects,accept){
    if(!world||typeof world.get!=='function'||typeof accept!=='function'){
      throw new TypeError('AI spatial port requires authoritative Voxel and footprint provider');
    }
    if(this.#world!==world||this.#objects!==objects){
      this.#shapes=[];
      this.#revision=-1;
    }
    this.#world=world;
    this.#objects=objects;
    this.#accept=accept;
  }
  get objectsRevision(){return this.#objects?.physicalRevision??0;}
  #physicalShapes(focus){
    const revision=this.objectsRevision;
    if(revision!==this.#revision){
      this.#shapes=this.#objects?.physicalOccluders?.(focus,64)??[];
      this.#revision=revision;
    }
    return this.#shapes;
  }
  visible(enemy,target,maxDistance=18){
    if(!finite(enemy)||!finite(target)||!(maxDistance>0&&maxDistance<=64)){
      throw new RangeError('Expected bounded physical sight segment');
    }
    const start=[enemy.x,enemy.y+.82,enemy.z];
    const end=[target.x,target.y+.82,target.z];
    const delta=end.map((v,i)=>v-start[i]);
    const length=Math.hypot(...delta);
    if(length>maxDistance)return false;
    if(length<=.2)return true;
    const direction=delta.map(v=>v/length);
    const origin=start.map((v,i)=>v+direction[i]*.045);
    const reach=length-.14;
    const hit=raycastTerrain(this.#world,{origin,direction,maxDistance:reach});
    if(hit&&hit.distance<reach-.002)return false;
    return !this.#physicalShapes(enemy).some(shape=>
      intersectsSegment(shape,origin,direction,reach));
  }
  canMove(enemy,moveX,moveZ,traversalProfile){
    if(!finite(enemy)||![moveX,moveZ].every(Number.isFinite)||
        !traversalProfile){
      throw new TypeError('Expected movement intention and creature capability');
    }
    const limitHorizontal=(position,axis,distance)=>{
      const x=position.x+(axis==='x'?distance:0);
      const z=position.z+(axis==='z'?distance:0);
      if(!this.#accept(x,z))return 0;
      return this.#objects?.limitTravel(position,axis,distance)??distance;
    };
    const next=simulateTerrainActor(this.#world,enemy,{
      moveX,moveZ,dt:1/20,moveSpeed:4,limitHorizontal,traversalProfile
    });
    return !next.error&&(!next.wallContact||next.autoHopStarted)&&
      next.y>=enemy.y-.11;
  }
}
