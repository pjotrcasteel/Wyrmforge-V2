// Wyrmforge V2 playable-Hunt integration: movement and navigation contracts.
// Uses the already-owned Voxel V2 actor physics; NO second collider, hidden
// jump, scene-geometry raycast, invented enemy AI or object engine.
import {
  spawnTerrainActor,simulateTerrainActor,recoverTerrainActor
} from './terrain-actor.mjs';
import { terrainRayFromScreen } from './terrain-raycast.mjs';

export const HUNT_EXPLORATION_SCHEMA='wyrmforge.hunt-exploration.v1';
// Gameplay tuning is separate from the default Voxel V2 actor policy.
export const HUNT_WALK_SPEED=5.2;
export const HUNT_FIXED_STEP=1/60;
const MARGIN=0.65;
const PORT_WIDTH=2.7;

export function spawnHuntExplorer(world,region,port=null) {
  if(!region?.bounds || !region?.origin) {
    throw new TypeError('Hunt explorer requires a world-coordinate region');
  }
  const direction=port?.direction??'south';
  if(!['north','south','east','west'].includes(direction)) {
    throw new RangeError('Unknown Hunt entry direction');
  }
  const location=port?.at??{
    x:region.origin.x,z:region.bounds.maxZ
  };
  const offset=2.5;
  const x=location.x+(direction==='west'?offset:
    direction==='east'?-offset:0)+0.5;
  const z=location.z+(direction==='north'?offset:
    direction==='south'?-offset:0)+0.5;
  const spawn=spawnTerrainActor(world,{x,z,searchTopY:30,maxSearchDistance:64});
  if(!spawn)throw new Error('No physical Voxel V2 floor to spawn the Wizard');
  return Object.freeze({...spawn});
}

function clipToRegion(actor,bounds) {
  return {
    ...actor,
    x:Math.max(bounds.minX+MARGIN,Math.min(bounds.maxX+1-MARGIN,actor.x)),
    z:Math.max(bounds.minZ+MARGIN,Math.min(bounds.maxZ+1-MARGIN,actor.z))
  };
}
export function stepHuntExplorer(world,actor,bounds,{moveX=0,moveZ=0,objects=null}={},
  dt=HUNT_FIXED_STEP) {
  if(!bounds || !['minX','maxX','minZ','maxZ'].every(key=>
    Number.isSafeInteger(bounds[key])) || bounds.minX>=bounds.maxX ||
    bounds.minZ>=bounds.maxZ) {
    throw new TypeError('A bounded current Hunt region is required');
  }
  // Input and actor collision remain in the actual V2 physics policy.
  const moved=simulateTerrainActor(world,actor,{moveX,moveZ,dt,moveSpeed:HUNT_WALK_SPEED,limitHorizontal:objects?.limitTravel.bind(objects)});
  if(moved.error)return Object.freeze({...moved});
  return Object.freeze(clipToRegion(moved,bounds));
}

export function recoverHuntExplorer(world,actor,checkpoint,canLand){
  if(!checkpoint||(!actor.error&&actor.y>checkpoint.y-.5)||Math.hypot(actor.x-checkpoint.x,actor.z-checkpoint.z)>8)return null;
  const accepts=candidate=>{
    if(candidate.y<checkpoint.y-.25||!canLand(candidate))return false;
    const start={...candidate,vy:0,grounded:true};
    return [[1,0],[-1,0],[0,1],[0,-1]].some(([moveX,moveZ])=>{
      let step=start;
      for(let frame=0;frame<14;frame++){
        step=simulateTerrainActor(world,step,{moveX,moveZ,dt:HUNT_FIXED_STEP,moveSpeed:HUNT_WALK_SPEED});
        if(step.error||step.y<candidate.y-.35||!canLand(step))return false;
      }
      return step.grounded&&Math.hypot(step.x-start.x,step.z-start.z)>=1;
    });
  };
  const exact=recoverTerrainActor(world,checkpoint,{horizontalRadius:0,verticalRange:0,accept:accepts});
  if(exact&&Math.hypot(exact.x-actor.x,exact.z-actor.z,exact.y-actor.y)>.25)return exact;
  return recoverTerrainActor(world,{...actor,y:checkpoint.y},{accept:candidate=>
    accepts(candidate)&&Math.hypot(candidate.x-actor.x,candidate.y-actor.y,candidate.z-actor.z)>.25});
}

export function findHuntRegionCrossing(plan,regionId,actor) {
  const region=plan?.regions?.find(candidate=>candidate.id===regionId);
  if(!region || !actor || ![actor.x,actor.z].every(Number.isFinite)) {
    throw new TypeError('Region exit needs a valid expedition and physical actor');
  }
  for(const port of region.ports) {
    const boundary=port.direction==='north'?
      actor.z-region.bounds.minZ:
      port.direction==='south'?region.bounds.maxZ+1-actor.z:
      port.direction==='west'?actor.x-region.bounds.minX:
      region.bounds.maxX+1-actor.x;
    const lateral=['north','south'].includes(port.direction)
      ? Math.abs(actor.x-(port.at.x+0.5))
      : Math.abs(actor.z-(port.at.z+0.5));
    if(boundary>1.4 || boundary<0 || lateral>PORT_WIDTH)continue;
    const next=plan.links.find(link=>
      (link.fromId===regionId && link.toId===port.peerRegionId) ||
      (link.toId===regionId && link.fromId===port.peerRegionId));
    if(!next)throw new Error('Hunt expedition port has no reciprocal link');
    const entryPort=next.fromId===regionId?next.toPort:next.fromPort;
    return Object.freeze({
      fromRegionId:regionId,toRegionId:port.peerRegionId,
      exitPortId:port.id,entryPort
    });
  }
  return null;
}

// Presentation only: the camera must not copy the actor's ballistic Y
// every frame. Small terrain steps and hops are physical actor motion, not
// whole-world motion. Keep horizontal tracking responsive, hold the last
// grounded elevation through airborne motion, and ease genuine grade changes.
export class HuntFollowCamera {
  #position=null;
  #groundY=0;
  #levelY=0;
  #lastAt=null;
  get smoothedGroundY(){return this.#position?.y??4;}
  reset(actor=null) {
    this.#position=actor?{x:actor.x,y:actor.y,z:actor.z}:null;
    this.#groundY=actor?.y??0;
    this.#levelY=this.#groundY;
    this.#lastAt=null;
  }
  update(actor,now,{level=false}={}) {
    if(![actor?.x,actor?.y,actor?.z,now].every(Number.isFinite)) {
      throw new TypeError('A finite actor position and frame timestamp are required');
    }
    if(!this.#position) this.reset(actor);
    const dt=this.#lastAt===null?0:
      Math.min(0.05,Math.max(0,(now-this.#lastAt)/1000));
    this.#lastAt=now;
    if(actor.grounded) {
      const delta=actor.y-this.#groundY;
      // A 35cm dead zone absorbs 10cm surface changes and contact noise.
      if(Math.abs(delta)>0.35) this.#groundY=actor.y-Math.sign(delta)*0.35;
    }
    const horizontal=1-Math.exp(-dt/0.055);
    this.#position.x+=(actor.x-this.#position.x)*horizontal;
    this.#position.z+=(actor.z-this.#position.z)*horizontal;
    const vertical=(this.#groundY-this.#position.y)*(1-Math.exp(-dt/0.28));
    const maxTravel=2*dt;
    this.#position.y+=Math.max(-maxTravel,Math.min(maxTravel,vertical));
    return {...this.#position,y:level?this.#levelY:this.#position.y};
  }
}

// Tap targeting: invert the *currently rendered* V2 camera, then query the
// authoritative terrain port. Commit through its existing edit ledger.
// The initial Fireball is a bounded terrain-only preview, not combat balance.
export function targetHuntFireball(port,view,x,y,objects=null) {
  if(!port || typeof port.raycast!=='function' ||
      !view || ![x,y].every(Number.isFinite))return null;
  if(x<0 || y<0 || x>view.width || y>view.height)return null;
  const ray=terrainRayFromScreen({...view,x,y});
  const hit=port.raycast(ray);
  const tree=objects?.raycastTree({...ray,maxDistance:hit?.distance??ray.maxDistance});
  if(tree)return {point:tree.point,treeId:tree.id,worldRevision:port.revision};
  if(!hit)return null;
  return {
    point:{...hit.point},
    target:{...hit.cell,radius:2.3,depth:2},
    worldRevision:hit.worldRevision
  };
}

export function isHuntCastTap(pointer,x,y,now) {
  return Boolean(pointer?.tapAllowed &&
    now-pointer.startedAt>=0 && now-pointer.startedAt<=350 &&
    Math.hypot(x-pointer.startX,y-pointer.startY)<=10);
}

export class HuntPlayPerformance {
  #samples=[];
  #hitches=0;
  #hitchesOver50=0;
  #hitchesOver100=0;
  #maxFrameMs=0;
  #frames=0;
  #maxSamples;
  constructor(maxSamples=180) {
    if(!Number.isSafeInteger(maxSamples) || maxSamples<30 ||
        maxSamples>600)throw new RangeError('Bounded frame sample capacity required');
    this.#maxSamples=maxSamples;
  }
  recordFrame(frameMs) {
    if(!Number.isFinite(frameMs) || frameMs<0)throw new RangeError('Invalid frame duration');
    this.#frames++;
    if(frameMs>33.34)this.#hitches++;
    if(frameMs>50)this.#hitchesOver50++;
    if(frameMs>100)this.#hitchesOver100++;
    this.#maxFrameMs=Math.max(this.#maxFrameMs,frameMs);
    this.#samples.push(frameMs);
    if(this.#samples.length>this.#maxSamples)this.#samples.shift();
  }
  get snapshot() {
    const sorted=[...this.#samples].sort((a,b)=>a-b);
    const quantile=q=>sorted.length?Number(
      sorted[Math.ceil((sorted.length-1)*q)].toFixed(1)):null;
    return Object.freeze({
      schema:'wyrmforge.hunt-play-performance.v1',
      frames:this.#frames,sampleCount:sorted.length,
      p50Ms:quantile(0.5),p95Ms:quantile(0.95),
      p99Ms:quantile(0.99),hitchesOver33ms:this.#hitches,
      hitchesOver50ms:this.#hitchesOver50,hitchesOver100ms:this.#hitchesOver100,
      maxFrameMs:this.#frames?Number(this.#maxFrameMs.toFixed(1)):null,
      // Local page-observed wall-clock RAF timing, NOT end-to-end
      // GPU frame time or a remotely measured phone benchmark.
      source:'request-animation-frame-local'
    });
  }
}

// Evidence for the latest renderer recovery only. Browser wait before a
// restore request is separate from the time spent uploading terrain.
export class HuntContextRecoveryEvidence {
  #latest=null;
  #restoredAt=null;

  lose(state){
    this.#latest={phase:'lost',before:state};
    this.#restoredAt=null;
  }

  restore(now){
    if(this.#latest?.phase!=='lost')return;
    this.#latest.phase='uploading';
    this.#restoredAt=now;
  }

  fail(){
    if(this.#latest)this.#latest.phase='failed';
  }

  resume(now,state){
    if(this.#latest?.phase!=='uploading')return;
    const before=this.#latest.before;
    const sameTerrain=before.terrainEpoch!==null&&before.terrainEpoch===state.terrainEpoch;
    this.#latest={...this.#latest,phase:'ready',after:state,
      sameTerrain,uploadDrainMs:Math.round(now-this.#restoredAt),
      firstMovement:null};
  }

  movement(now,before,after,input,terrainEpoch){
    if(this.#latest?.phase!=='ready'||this.#latest.firstMovement||
        terrainEpoch!==this.#latest.after.terrainEpoch||!Math.hypot(input.moveX,input.moveZ))return;
    const metres=Math.hypot(after.x-before.x,after.z-before.z);
    if(metres<.001)return;
    this.#latest.firstMovement={msSinceRestore:Math.round(now-this.#restoredAt),
      metres:Number(metres.toFixed(3))};
  }

  get snapshot(){return this.#latest&&{...this.#latest};}
}
