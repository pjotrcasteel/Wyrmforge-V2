// H08-02B: graph-driven streaming policy over the authoritative Voxel V2
// world. Regions and links are independent non-overlapping terrain bands.
// At most 3 full regions and 2 seam strips are published or being written.
import {V2TerrainResidencySet} from './terrain-residency-set.mjs';
import {HUNT_WALK_SPEED,HUNT_FIXED_STEP} from './hunt-play-runtime.mjs';

const distance=(b,x,z)=>Math.hypot(Math.max(b.minX-x,0,x-b.maxX-1),
  Math.max(b.minZ-z,0,z-b.maxZ-1));
const contains=(b,x,z)=>x>=b.minX&&x<b.maxX+1&&z>=b.minZ&&z<b.maxZ+1;
const MARGIN=.65;

export class HuntGraphResidency {
  #graph;
  #set;
  #regions;
  #links;
  #all;
  #registered=new Set();
  #peakRegions=0;
  constructor(world,graph,initialIds) {
    this.#graph=graph;
    this.#regions=new Map(graph.layout.regions.map(r=>[r.id,r]));
    this.#links=new Map(graph.layout.links.map(l=>[l.id,l]));
    this.#all=new Map([...this.#regions,...this.#links]);
    this.#set=new V2TerrainResidencySet(world,{residentLimit:5,maxBands:this.#all.size});
    for(const id of initialIds)this.#register(id,true);
    this.#peakRegions=this.metrics.residentRegions.length;
  }
  #register(id,resident=false) {
    if(!this.#registered.has(id)) {
      this.#set.register(id,this.#graph.materialize(id).definition,{resident});
      this.#registered.add(id);
    }
  }
  get metrics(){
    const base=this.#set.metrics;
    const residentRegions=base.residentIds.filter(id=>this.#regions.has(id));
    const residentLinks=base.residentIds.filter(id=>this.#links.has(id));
    return {...base,residentRegions,residentLinks,peakRegions:this.#peakRegions};
  }
  get dirtyChunks(){return this.#set.dirtyChunks;}
  step(budget){return this.#set.step(budget);}
  publish(){
    this.#set.publish();
    this.#peakRegions=Math.max(this.#peakRegions,this.metrics.residentRegions.length);
    return this.metrics;
  }
  location(x,z){
    return [...this.#all].find(([,b])=>contains(b.bounds,x,z))?.[0]??null;
  }
  #supports(x,z,ids){
    // All corners of the actor clearance must be supported by the union,
    // including a join between two bands. No rectangular diagonal shortcut.
    return [-MARGIN,MARGIN].every(dx=>[-MARGIN,MARGIN].every(dz=>
      ids.some(id=>contains(this.#all.get(id).bounds,x+dx,z+dz))));
  }
  constrainInput(actor,input,dt=HUNT_FIXED_STEP){
    const ids=this.#set.residentIds;
    const {moveX=0,moveZ=0}=input;
    const divisor=Math.max(1,Math.hypot(moveX,moveZ));
    const dx=moveX/divisor*HUNT_WALK_SPEED*dt,dz=moveZ/divisor*HUNT_WALK_SPEED*dt;
    const ok=(x,z)=>this.#supports(actor.x+x,actor.z+z,ids);
    if(ok(dx,dz)&&ok(dx,0)&&ok(0,dz))return {moveX,moveZ};
    if(ok(moveX*HUNT_WALK_SPEED*dt,0))return {moveX,moveZ:0};
    if(ok(0,moveZ*HUNT_WALK_SPEED*dt))return {moveX:0,moveZ};
    return {moveX:0,moveZ:0};
  }
  // Protect the actor's current band and any band supporting its clearance.
  // Pick the two closest neighboring ports; a small residency bias avoids
  // churn at an equal-distance junction. Never mutate while crossing a link.
  next(actor,{respawn=false}={}){
    const metrics=this.metrics;
    if(metrics.transition)return null;
    const {x,z}=actor,at=this.location(x,z);
    if(!at||!metrics.residentIds.includes(at))throw new Error('Actor outside published graph terrain');
    const protectedIds=metrics.residentIds.filter(id=>distance(this.#all.get(id).bounds,x,z)<2);
    const evict=id=>({id,action:'evict',protectedIds});
    const load=id=>({id,action:'load',protectedIds});
    const entry=this.#graph.layout.entryRegionId;
    if(respawn) {
      if(metrics.residentRegions.includes(entry))return {action:'respawn'};
      const oldLink=metrics.residentLinks.find(id=>!protectedIds.includes(id));
      if(oldLink)return evict(oldLink);
      if(metrics.residentRegions.length>=3){
        const oldRegion=metrics.residentRegions.find(id=>!protectedIds.includes(id)&&
          !metrics.residentLinks.some(l=>[this.#links.get(l).fromId,this.#links.get(l).toId].includes(id)));
        return oldRegion?evict(oldRegion):null;
      }
      return load(entry);
    }
    if(this.#links.has(at))return null;
    const adjacent=[...this.#links.values()].filter(l=>l.fromId===at||l.toId===at);
    const candidates=adjacent.map(link=>{
      const neighbor=link.fromId===at?link.toId:link.fromId;
      const d=distance(link.bounds,x,z);
      return {link,neighbor,d,score:d-(metrics.residentLinks.includes(link.id)?4:0)};
    }).sort((a,b)=>a.score-b.score||a.link.id.localeCompare(b.link.id)).slice(0,2);
    const wantsRegions=new Set([at,...candidates.map(c=>c.neighbor)]);
    const wantsLinks=new Set(candidates.map(c=>c.link.id));
    const oldLink=metrics.residentLinks.find(id=>!wantsLinks.has(id)&&!protectedIds.includes(id));
    if(oldLink)return evict(oldLink);
    const oldRegion=metrics.residentRegions.find(id=>!wantsRegions.has(id)&&!protectedIds.includes(id)&&
      !metrics.residentLinks.some(l=>[this.#links.get(l).fromId,this.#links.get(l).toId].includes(id)));
    if(oldRegion)return evict(oldRegion);
    for(const {link,neighbor} of candidates){
      if(!metrics.residentRegions.includes(neighbor)&&metrics.residentRegions.length<3)
        return load(neighbor);
      if(metrics.residentRegions.includes(neighbor)&&!metrics.residentLinks.includes(link.id)&&metrics.residentLinks.length<2)
        return load(link.id);
    }
    return null;
  }
  begin(job){
    if(job.action==='load'){
      const metrics=this.metrics;
      const region=this.#regions.has(job.id);
      if(region?metrics.residentRegions.length>=3:metrics.residentLinks.length>=2)
        throw new Error('Graph terrain residency limit exceeded');
      if(!region){
        const link=this.#links.get(job.id);
        if(!link||![link.fromId,link.toId].every(id=>metrics.residentRegions.includes(id)))
          throw new Error('Both connector endpoints must be published');
      }
      this.#register(job.id);
    }
    this.#set.begin(job.id,job.action,{protectedIds:job.protectedIds});
  }
}
