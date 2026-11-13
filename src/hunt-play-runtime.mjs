// Wyrmforge V2 playable-Hunt integration: movement and navigation contracts.
// Uses the already-owned Voxel V2 actor physics; NO second collider, hidden
// jump, scene-geometry raycast, invented enemy AI or object engine.
import {
  spawnTerrainActor,simulateTerrainActor,
  ACTOR_MOVE_SPEED
} from './terrain-actor.mjs';

export const HUNT_EXPLORATION_SCHEMA='wyrmforge.hunt-exploration.v1';
export const HUNT_WALK_SPEED=ACTOR_MOVE_SPEED;
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
export function stepHuntExplorer(world,actor,bounds,{moveX=0,moveZ=0}={},
  dt=HUNT_FIXED_STEP) {
  if(!bounds || !['minX','maxX','minZ','maxZ'].every(key=>
    Number.isSafeInteger(bounds[key])) || bounds.minX>=bounds.maxX ||
    bounds.minZ>=bounds.maxZ) {
    throw new TypeError('A bounded current Hunt region is required');
  }
  // Input and actor collision remain in the actual V2 physics policy.
  const moved=simulateTerrainActor(world,actor,{moveX,moveZ,dt});
  if(moved.error)return Object.freeze({...moved});
  return Object.freeze(clipToRegion(moved,bounds));
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

export class HuntPlayPerformance {
  #samples=[];
  #hitches=0;
  #frames=0;
  #maxSamples;
  constructor(maxSamples=180) {
    if(!Number.isSafeInteger(maxSamples) || maxSamples<30 ||
        maxSamples>600)throw new RangeError('Bounded frame sample capacity required');
    this.#maxSamples=maxSamples;
  }
  recordFrame(frameMs) {
    if(!Number.isFinite(frameMs) || frameMs<0 ||
        frameMs>1000)throw new RangeError('Invalid frame duration');
    this.#frames++;
    if(frameMs>33.34)this.#hitches++;
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
      // Local page-observed wall-clock RAF timing, NOT end-to-end
      // GPU frame time or a remotely measured phone benchmark.
      source:'request-animation-frame-local'
    });
  }
}
