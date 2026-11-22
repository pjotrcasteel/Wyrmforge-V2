import { actorOverlapsTerrain, simulateTerrainActor, spawnTerrainActor } from './terrain-actor.mjs';

// Deterministic fixed-step collision checks against authoritative voxels.
// No renderer state or DOM input is involved.
export function runCollisionProbe(world, { x=-7.5, z=-5.5, steps=360 }={}) {
  if (!Number.isSafeInteger(steps) || steps<1 || steps>3600) {
    throw new RangeError('Collision probe requires 1..3600 steps');
  }
  let actor=spawnTerrainActor(world,{x,z});
  if (!actor) return {verdict:'fail',reason:'no-supported-spawn',steps:0};
  let wallContacts=0,stepUps=0,groundedSteps=0,overlaps=0;
  const start={x:actor.x,y:actor.y,z:actor.z};
  for(let i=0;i<steps;i++) {
    // Four legs traverse the same terrain in different directions.
    const phase=Math.floor(i/Math.max(1,Math.ceil(steps/4)))%4;
    const direction=[[1,0],[0,1],[-1,0],[0,-1]][phase];
    actor=simulateTerrainActor(world,actor,{
      moveX:direction[0],moveZ:direction[1],dt:1/60
    });
    if(actor.error) return {verdict:'fail',reason:actor.error,steps:i+1};
    if(actorOverlapsTerrain(world,actor)) overlaps++;
    if(actor.wallContact) wallContacts++;
    if(actor.stepUp) stepUps++;
    if(actor.grounded) groundedSteps++;
  }
  return {verdict:overlaps===0?'pass':'fail',steps,overlaps,wallContacts,
    stepUps,groundedSteps,start,end:{x:actor.x,y:actor.y,z:actor.z},
    worldRevision:world.revision};
}
