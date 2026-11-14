// Resident, grounded woodland instances shared by rendering and movement.
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
      const {x,y,z}=item.position;
      const hit=terrain.raycast({origin:[x,32,z],direction:[0,-1,0],maxDistance:42});
      if(!hit||Math.abs(hit.point.y-y)>.5)continue;
      const base={id:item.id,x,y:hit.point.y,z,scale:item.scale};
      if(item.kind==='tree'){
        instances.push({...base,radius:.23*item.scale,height:2*item.scale,
          sprite:LIVE_TREES[(item.seed>>>8)%LIVE_TREES.length]});
      }else if(item.kind==='boulder'){
        // Use the existing reserved footprint so neither prop moves into a route.
        const radius=item.footprint.radius;
        const halfLength=radius*.66;
        const supported=(item.seed>>>24)%3===0&&[-halfLength,halfLength].every(offset=>{
          const end=terrain.raycast({origin:[x+offset,32,z],direction:[0,-1,0],maxDistance:42});
          return end&&Math.abs(end.point.y-base.y)<=.25;
        });
        if(supported){
          instances.push({...base,kind:'log',radius:radius-halfLength,halfLength,height:.55*item.scale});
        }else{
          instances.push({...base,kind:'boulder',radius,height:1.18*item.scale});
        }
      }
    }
    this.#regions.set(next,instances);
  }
  // Sweep a horizontal actor axis against the prop footprint.
  // An actor already intersecting a newly published trunk can walk out.
  limitTravel(position,axis,distance){
    if(!distance)return 0;
    const across=axis==='x'?'z':'x';
    const sign=Math.sign(distance);
    let travel=Math.abs(distance);
    for(const instances of this.regions)for(const trunk of instances){
      if(position.y>=trunk.y+trunk.height||position.y+ACTOR_HEIGHT<=trunk.y)continue;
      const halfLength=trunk.halfLength??0;
      const acrossExtent=ACTOR_HALF_WIDTH+(across==='x'?halfLength:0);
      const gap=Math.max(0,Math.abs(position[across]-trunk[across])-acrossExtent);
      if(gap>=trunk.radius)continue;
      const half=ACTOR_HALF_WIDTH+(axis==='x'?halfLength:0)+Math.sqrt(trunk.radius**2-gap**2);
      const offset=(trunk[axis]-position[axis])*sign;
      if(offset<=0)continue;
      travel=Math.min(travel,Math.max(0,offset-half-1e-5));
    }
    return travel*sign;
  }
}
