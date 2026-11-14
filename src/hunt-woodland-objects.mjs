// Resident, grounded tree instances shared by rendering and movement.
import {LIVE_TREES} from './wet-forest-tree-sprites.mjs';
import {ACTOR_HALF_WIDTH,ACTOR_HEIGHT} from './terrain-actor.mjs';

export class HuntWoodlandObjects {
  #regions=new Map();
  #graph;
  constructor(graph){this.#graph=graph;}
  get regions(){return this.#regions.values();}
  update(regionIds,terrain){
    for(const id of this.#regions.keys()){
      if(!regionIds.includes(id))this.#regions.delete(id);
    }
    const next=regionIds.find(id=>!this.#regions.has(id));
    if(next===undefined)return;
    const instances=[];
    for(const item of this.#graph.placement(next).placements){
      if(item.kind!=='tree')continue;
      const {x,y,z}=item.position;
      const hit=terrain.raycast({origin:[x,32,z],direction:[0,-1,0],maxDistance:42});
      if(!hit||Math.abs(hit.point.y-y)>.5)continue;
      instances.push({id:item.id,x,y:hit.point.y,z,scale:item.scale,
        radius:.23*item.scale,height:2*item.scale,
        sprite:LIVE_TREES[(item.seed>>>8)%LIVE_TREES.length]});
    }
    this.#regions.set(next,instances);
  }
  // Sweep a horizontal actor axis against the trunk's circular footprint.
  // An actor already intersecting a newly published trunk can walk out.
  limitTravel(position,axis,distance){
    const across=axis==='x'?'z':'x';
    const sign=Math.sign(distance);
    let travel=Math.abs(distance);
    for(const instances of this.regions)for(const trunk of instances){
      if(position.y>=trunk.y+trunk.height||position.y+ACTOR_HEIGHT<=trunk.y)continue;
      const gap=Math.max(0,Math.abs(position[across]-trunk[across])-ACTOR_HALF_WIDTH);
      if(gap>=trunk.radius)continue;
      const half=ACTOR_HALF_WIDTH+Math.sqrt(trunk.radius**2-gap**2);
      const offset=(trunk[axis]-position[axis])*sign;
      if(offset<=0)continue;
      travel=Math.min(travel,Math.max(0,offset-half-1e-5));
    }
    return travel*sign;
  }
}
