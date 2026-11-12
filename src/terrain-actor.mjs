// V2.5 first actor-collision slice. The sparse VoxelWorld is the only source
// of solid collision truth; renderer meshes and JavaScript scene DOM are never
// queried. This conservative swept AABB is a measured capsule alternative,
// not yet a production player controller or a full rigid-body physics engine.
import { raycastTerrain } from './terrain-raycast.mjs';

export const ACTOR_PHYSICS_SCHEMA = 'voxel-v2.actor-physics.v1';
export const ACTOR_HALF_WIDTH = 0.28;
export const ACTOR_HEIGHT = 1.6;
export const ACTOR_STEP_HEIGHT = 1.05;
export const ACTOR_MOVE_SPEED = 4.4;
export const ACTOR_GRAVITY = 22;
export const ACTOR_MAX_FALL_SPEED = 22;
// Upward velocity is retained for external Physics V2 impulses (e.g. knockback).
// The Wyrmforge player controller deliberately has no jump action.
export const ACTOR_MAX_UPWARD_SPEED = 8;

const AXES = ['x', 'y', 'z'];
const SKIN = 1e-5;
const MAX_SWEEP_DISTANCE = 32;
const MAX_SWEEP_CELLS = 36;

function validateWorld(world) {
  if (!world || typeof world.get !== 'function' ||
      !Number.isSafeInteger(world.revision) ||
      ![16, 32].includes(world.chunkEdge)) {
    throw new TypeError('Expected authoritative V2 voxel world with a revision');
  }
}

function validatePosition(position) {
  if (!position || ![position.x, position.y, position.z].every(value =>
    Number.isFinite(value) && Math.abs(value) < 100000)) {
    throw new TypeError('Actor position requires three bounded finite coordinates');
  }
}

function box(position) {
  return {
    x: [position.x - ACTOR_HALF_WIDTH, position.x + ACTOR_HALF_WIDTH],
    y: [position.y, position.y + ACTOR_HEIGHT],
    z: [position.z - ACTOR_HALF_WIDTH, position.z + ACTOR_HALF_WIDTH]
  };
}

function voxelSpan(min,max) {
  return [Math.floor(min + SKIN), Math.floor(max - SKIN)];
}

export function actorOverlapsTerrain(world,position) {
  validateWorld(world);
  validatePosition(position);
  const bounds=box(position);
  const [x0,x1]=voxelSpan(...bounds.x);
  const [y0,y1]=voxelSpan(...bounds.y);
  const [z0,z1]=voxelSpan(...bounds.z);
  // A fixed-size actor must never require an unbounded global voxel scan.
  for (let y=y0;y<=y1;y++) {
    for (let z=z0;z<=z1;z++) {
      for (let x=x0;x<=x1;x++) {
        if (world.get(x,y,z)!==0) return true;
      }
    }
  }
  return false;
}

function occupiedAtBoundary(world,bounds,axis,cellIndex) {
  const ranges=AXES.map(name => name===axis
    ? [cellIndex,cellIndex] : voxelSpan(...bounds[name]));
  for(let y=ranges[1][0];y<=ranges[1][1];y++) {
    for(let z=ranges[2][0];z<=ranges[2][1];z++) {
      for(let x=ranges[0][0];x<=ranges[0][1];x++) {
        if (world.get(x,y,z)!==0) return true;
      }
    }
  }
  return false;
}

// Exact axis-aligned sweep over crossed *integer voxel planes*. A fast actor
// cannot tunnel through a 1-cell wall even if its end position is empty.
// Return the first contact and stop just outside it; sweeping each horizontal
// axis independently gives simple, deterministic wall sliding.
export function sweepActorAxis(world,position,axis,distance) {
  validateWorld(world);
  validatePosition(position);
  if (!AXES.includes(axis) || !Number.isFinite(distance) ||
      Math.abs(distance)>MAX_SWEEP_DISTANCE) {
    throw new RangeError('Actor sweep axis or distance is out of bounds');
  }
  if (distance===0) return { position:position[axis],collided:false };
  const bounds=box(position);
  const sign=Math.sign(distance);
  const leading = sign>0 ? bounds[axis][1] : bounds[axis][0];
  const extent=axis==='y' ? (sign>0 ? ACTOR_HEIGHT : 0) : ACTOR_HALF_WIDTH;
  const first=sign>0
    ? Math.floor(leading-SKIN)+1
    : Math.ceil(leading+SKIN)-1;
  const travel=Math.abs(distance);
  for(let i=0;i<MAX_SWEEP_CELLS;i++) {
    const plane=first+sign*i;
    const crossing=sign>0 ? plane-leading : leading-plane;
    if(crossing>travel+SKIN) break;
    const cellIndex=sign>0 ? plane : plane-1;
    if(occupiedAtBoundary(world,bounds,axis,cellIndex)) {
      const stop=sign>0 ? plane-extent-SKIN : plane+extent+SKIN;
      // Never move backward because a contact is infinitesimally ahead.
      return {position:sign>0
        ? Math.max(position[axis],stop)
        : Math.min(position[axis],stop), collided:true};
    }
  }
  return {position:position[axis]+distance,collided:false};
}

// Physical vertical head clearance over the actor's *entire footprint*.
// This is a collision query, not a pixel visibility/occlusion test.
export function actorHeadClearance(world, position, maxDistance=16) {
  if (!Number.isFinite(maxDistance) || maxDistance<=0 || maxDistance>32) {
    throw new RangeError('Head-clearance test must be within (0,32] voxels');
  }
  const sweep=sweepActorAxis(world,position,'y',maxDistance);
  return {
    blocked:sweep.collided,
    distance:Math.max(0,sweep.position-position.y)
  };
}

function groundProbe(world,position) {
  return sweepActorAxis(world,position,'y',-0.06).collided;
}

function moveHorizontal(world,position,axis,distance,canStep) {
  const initial=sweepActorAxis(world,position,axis,distance);
  if(!initial.collided || !canStep || distance===0) {
    return {position:{...position,[axis]:initial.position},
      blocked:initial.collided,stepped:false};
  }
  const risen=sweepActorAxis(world,position,'y',ACTOR_STEP_HEIGHT);
  if(risen.collided) {
    return {position:{...position,[axis]:initial.position},
      blocked:true,stepped:false};
  }
  const elevated={...position,y:risen.position};
  const forward=sweepActorAxis(world,elevated,axis,distance);
  if(forward.collided) {
    return {position:{...position,[axis]:initial.position},
      blocked:true,stepped:false};
  }
  const reached={...elevated,[axis]:forward.position};
  const landing=sweepActorAxis(world,reached,'y',-(ACTOR_STEP_HEIGHT+0.12));
  if(!landing.collided || landing.position < position.y-0.11) {
    return {position:{...position,[axis]:initial.position},
      blocked:true,stepped:false};
  }
  return {position:{...reached,y:landing.position},
    blocked:false,stepped:true};
}

export function spawnTerrainActor(world,{
  x=-7.5,z=-5.5, searchTopY=25, maxSearchDistance=60
}={}) {
  validateWorld(world);
  if (![x,z,searchTopY,maxSearchDistance].every(Number.isFinite) ||
      maxSearchDistance<=0 || maxSearchDistance>128) {
    throw new RangeError('Invalid terrain actor spawn query');
  }
  const hit=raycastTerrain(world,{
    origin:[x,searchTopY,z],direction:[0,-1,0],
    maxDistance:maxSearchDistance
  });
  if(!hit) return null;
  const originalY=hit.cell.y+1+SKIN;
  for(let step=0;step<=24;step++) {
    const actor={schema:ACTOR_PHYSICS_SCHEMA,
      x,y:originalY+step,z,vy:0,grounded:false,
      wallContact:false,ceilingContact:false,stepUp:false,
      worldRevision:world.revision};
    if(actorOverlapsTerrain(world,actor)) continue;
    // Do not spawn airborne above a blocked overhang as if it were a floor;
    // require directly supported feet at the selected clearance height.
    if(groundProbe(world,actor)) return {...actor,grounded:true};
  }
  return null;
}

// Recover an obstructed or unsupported actor using ONLY committed V2 voxels.
// A bounded, opt-in query: no automatic teleport inside a physics tick.
// Search nearest horizontal grid cells first and nearest vertical support
// heights next. If nothing is safe, return null rather than spawn inside rock.
export function recoverTerrainActor(world,position,{
  horizontalRadius=4,verticalRange=6
}={}) {
  validateWorld(world);
  validatePosition(position);
  if (!Number.isSafeInteger(horizontalRadius) || horizontalRadius<0 ||
      horizontalRadius>8 || !Number.isSafeInteger(verticalRange) ||
      verticalRange<0 || verticalRange>12) {
    throw new RangeError('Actor recovery search bounds exceeded');
  }

  function supported(x,y,z) {
    const candidate={x,y,z};
    return !actorOverlapsTerrain(world,candidate) && groundProbe(world,candidate);
  }
  function restored(x,y,z) {
    return {
      schema:ACTOR_PHYSICS_SCHEMA,x,y,z,vy:0,grounded:true,
      wallContact:false,ceilingContact:false,stepUp:false,
      worldRevision:world.revision,error:null
    };
  }
  if (supported(position.x,position.y,position.z)) {
    return restored(position.x,position.y,position.z);
  }

  const cx=Math.floor(position.x)+0.5;
  const cz=Math.floor(position.z)+0.5;
  const feet=Math.floor(position.y-SKIN);
  // Search increasing Manhattan displacement in three dimensions.
  // Prefer a nearby supported floor over jumping several voxels onto a roof.
  // Candidate tie order is stable for deterministic replay and restoration.
  for(let distance=0;distance<=horizontalRadius+verticalRange;distance++) {
    for(let radius=0;radius<=Math.min(horizontalRadius,distance);radius++) {
      const vertical=Math.abs(distance-radius);
      if(vertical>verticalRange) continue;
      const heights=vertical===0 ? [0] : [vertical,-vertical];
      for(let dx=-radius;dx<=radius;dx++) {
        for(let dz=-radius;dz<=radius;dz++) {
          if(Math.abs(dx)+Math.abs(dz)!==radius) continue;
          const x=cx+dx,z=cz+dz;
          for(const height of heights) {
            const y=feet+height+SKIN;
            if(supported(x,y,z)) return restored(x,y,z);
          }
        }
      }
    }
  }
  return null;
}

export function simulateTerrainActor(world,actor,{
  moveX=0,moveZ=0,dt=1/60
}={}) {
  validateWorld(world);
  validatePosition(actor);
  if (!Number.isFinite(dt) || dt<=0 || dt>1/20 ||
      !Number.isFinite(actor.vy) ||
      ![moveX,moveZ].every(value=>Number.isFinite(value)&&Math.abs(value)<=1)) {
    throw new RangeError('Actor inputs or fixed-step delta outside supported bounds');
  }
  if (actorOverlapsTerrain(world,actor)) {
    return {...actor,worldRevision:world.revision,
      error:'actor-overlap',grounded:false};
  }
  const length=Math.hypot(moveX,moveZ);
  const divisor=Math.max(1,length);
  const dx=moveX/divisor*ACTOR_MOVE_SPEED*dt;
  const dz=moveZ/divisor*ACTOR_MOVE_SPEED*dt;
  const initialSupport=groundProbe(world,actor);
  // Short ledge steps are automatic walking. No player jump mechanic.
  const canStep=initialSupport && actor.vy<=0;
  const xMotion=moveHorizontal(world,actor,'x',dx,canStep);
  const zMotion=moveHorizontal(world,xMotion.position,'z',dz,canStep);
  let position=zMotion.position;
  // Other V2 physics systems may supply a bounded upward impulse later.
  // It is swept against ceilings, but no game/player input initiates it.
  const vy=Math.max(-ACTOR_MAX_FALL_SPEED,
    Math.min(ACTOR_MAX_UPWARD_SPEED,actor.vy-ACTOR_GRAVITY*dt));
  // Sweep both ascending AND descending travel. The first hit on an upward
  // sweep is a ceiling; it must stop ascent, not count as grounded.
  const vertical=sweepActorAxis(world,position,'y',vy*dt);
  position={...position,y:vertical.position};
  const ceilingContact=vertical.collided && vy>0;
  const grounded=vertical.collided && vy<0;
  return {
    schema:ACTOR_PHYSICS_SCHEMA,...position,
    vy:vertical.collided ? 0 : vy,
    grounded,
    wallContact:xMotion.blocked || zMotion.blocked,
    ceilingContact,
    stepUp:xMotion.stepped || zMotion.stepped,
    worldRevision:world.revision,
    error:null
  };
}
