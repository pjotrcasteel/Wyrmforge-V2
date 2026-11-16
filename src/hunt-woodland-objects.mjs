// Resident, grounded woodland instances shared by rendering and movement.
import {LIVE_TREES} from './wet-forest-tree-sprites.mjs';
import {ACTOR_HALF_WIDTH,ACTOR_HEIGHT} from './terrain-actor.mjs';

export class HuntWoodlandObjects {
  #regions=new Map();
  #graph;
  #regionKeys=new Map();
  #placementCache=new Map();
  #peakResident=0;
  #sweeps=0;
  #candidates=0;
  #maxCandidates=0;
  #treesFelled=0;
  #treesWithoutLanding=0;
  #recentTreeFalls=[];
  get diagnostics(){
    const resident=[...this.regions].reduce((count,props)=>count+props.length,0);
    return {resident,peakResident:this.#peakResident,sweeps:this.#sweeps,
      candidates:this.#candidates,maxCandidatesPerSweep:this.#maxCandidates,treesFelled:this.#treesFelled,
      treesWithoutLanding:this.#treesWithoutLanding,recentTreeFalls:this.#recentTreeFalls.slice()};
  }
  constructor(graph){this.#graph=graph;}
  get regions(){return this.#regions.values();}
  update(regionIds,terrain,coverage=null){
    for(const id of this.#regions.keys()){
      if(!regionIds.includes(id)||coverage&&this.#regionKeys.get(id)!==coverage.key(id)){
        this.#regions.delete(id);
        this.#regionKeys.delete(id);
        if(!regionIds.includes(id))this.#placementCache.delete(id);
      }
    }
    const next=regionIds.find(id=>!this.#regions.has(id));
    if(next===undefined)return;
    const instances=[];
    let placements=this.#placementCache.get(next);
    if(!placements){
      placements=this.#graph.placement(next).placements;
      this.#placementCache.set(next,placements);
    }
    if(coverage)this.#regionKeys.set(next,coverage.key(next));
    for(const item of placements){
      const {x,y,z}=item.position;
      if(coverage&&!coverage.has(x,z))continue;
      if(item.kind==='tree'){
        const tree=this.#treeInstance(item,terrain,coverage?.has);
        if(tree)instances.push(tree);
      }else if(item.kind==='boulder'){
        const hit=this.#floor(terrain,x,z);
        if(!hit||Math.abs(hit.point.y-y)>.5)continue;
        const base={id:item.id,x,y:hit.point.y,z,scale:item.scale};
        // Use the existing reserved footprint so neither prop moves into a route.
        const radius=item.footprint.radius;
        const halfLength=radius*.66;
        const supported=(item.variant==='log'||(!item.variant&&(item.seed>>>24)%3===0))&&[-halfLength,halfLength].every(offset=>{
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
    this.#peakResident=Math.max(this.#peakResident,this.diagnostics.resident);
  }
  #floor(terrain,x,z){
    return terrain.raycast({origin:[x,32,z],direction:[0,-1,0],maxDistance:42});
  }
  #treeInstance(item,terrain,isPublished){
    const {x,y,z}=item.position;
    if(isPublished&&!isPublished(x,z))return null;
    const hit=this.#floor(terrain,x,z);
    if(!hit||hit.point.y>y+.5)return null;
    const base={id:item.id,x,y:hit.point.y,z,scale:item.scale};
    const reserved=item.footprint?.radius??.46*item.scale;
    if(hit.point.y<y-.5){
      const halfLength=reserved*.75;
      const supported=[x-halfLength,x+halfLength].every(end=>{
        if(isPublished&&!isPublished(end,z))return false;
        const floor=this.#floor(terrain,end,z);
        return floor&&Math.abs(floor.point.y-base.y)<=.25;
      });
      return supported?{...base,kind:'log',radius:reserved-halfLength,
        halfLength,height:.45*item.scale}:null;
    }
    const sprite=LIVE_TREES[(item.seed>>>8)%LIVE_TREES.length];
    // Large oak roots use the reserved footprint without blocking the canopy.
    const radius=sprite.name.startsWith('tree.oak_l.')?reserved:.23*item.scale;
    return {...base,radius,height:2*item.scale,sprite};
  }
  terrainChanged(bounds,terrain,isPublished){
    const falls=[];
    if(!bounds)return falls;
    const {min,max}=bounds;
    for(const [region,instances] of this.#regions){
      const affected=this.#placementCache.get(region).filter(item=>{
        const {x,z}=item.position;
        const radius=item.footprint?.radius??.46*item.scale;
        return item.kind==='tree'&&x+radius>=min.x&&x-radius<max.x+1&&z>=min.z&&z<max.z+1;
      });
      if(!affected.length)continue;
      const byId=new Map(instances.map(instance=>[instance.id,instance]));
      for(const item of affected){
        const previous=byId.get(item.id);
        const instance=this.#treeInstance(item,terrain,isPublished);
        if(previous?.sprite&&!instance?.sprite){
          falls.push({tree:previous,landingY:instance?.y??null});
          this.#treesFelled++;
          if(!instance)this.#treesWithoutLanding++;
          this.#recentTreeFalls.push({id:item.id,x:previous.x,z:previous.z,
            fromY:previous.y,landingY:instance?.y??null});
          if(this.#recentTreeFalls.length>8)this.#recentTreeFalls.shift();
        }
        if(instance)byId.set(item.id,instance);
        else byId.delete(item.id);
      }
      this.#regions.set(region,[...byId.values()]);
    }
    return falls;
  }
  overlapsActor({x,y,z}){
    for(const instances of this.regions)for(const prop of instances){
      if(y>=prop.y+prop.height||y+ACTOR_HEIGHT<=prop.y)continue;
      const dx=Math.max(0,Math.abs(x-prop.x)-ACTOR_HALF_WIDTH-(prop.halfLength??0));
      const dz=Math.max(0,Math.abs(z-prop.z)-ACTOR_HALF_WIDTH);
      if(dx*dx+dz*dz<prop.radius*prop.radius)return true;
    }
    return false;
  }
  // Sweep a horizontal actor axis against the prop footprint.
  // An actor already intersecting a newly published trunk can walk out.
  limitTravel(position,axis,distance){
    if(!distance)return 0;
    const across=axis==='x'?'z':'x';
    const sign=Math.sign(distance);
    let travel=Math.abs(distance);
    let considered=0;
    for(const instances of this.regions)for(const trunk of instances){
      considered++;
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
    this.#sweeps++;
    this.#candidates+=considered;
    this.#maxCandidates=Math.max(this.#maxCandidates,considered);
    return travel*sign;
  }
}
