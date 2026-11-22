import { VoxelWorld } from './voxel-world.mjs';
import { TerrainEditLedger } from './terrain-edit-ledger.mjs';
import { actorOverlapsTerrain, simulateTerrainActor, spawnTerrainActor } from './terrain-actor.mjs';

// Upper terrain can be excavated; a separate lower shelf makes a fall and
// subsequent stable landing observable instead of accepting infinite freefall.
function makeWorld(edge) {
  const world=new VoxelWorld({chunkEdge:edge});
  for(let x=-4;x<=70;x++) for(let z=-3;z<=3;z++) {
    world.set(x,0,z,1);
    world.set(x,-4,z,3);
  }
  return world;
}
function runCase(name,edge,spawnX,editX,boundary=null) {
  const world=makeWorld(edge);
  const ledger=new TerrainEditLedger(world);
  let actor=spawnTerrainActor(world,{x:spawnX,z:0.5});
  if(!actor) return {name,pass:false,reason:'no-spawn'};
  let errors=0,overlaps=0,airborne=0,edits=0,removed=0;
  let landedAfterFall=false,seenAirborne=false,groundedTail=0;
  let crossedBoundary=false,firstEditStep=null;
  const initialY=actor.y;
  for(let i=0;i<300;i++) {
    if(i>=24 && i<36 && (i-24)%3===0) {
      const result=ledger.apply({
        id:name+'-'+i,type:'carve-sphere',x:editX+Math.floor((i-24)/3),
        y:0,z:0,radius:1.1,expectedRevision:world.revision,
        expectedEditRevision:ledger.editRevision
      });
      edits++;
      removed+=result.removedVoxels;
      if(firstEditStep===null) firstEditStep=i;
    }
    actor=simulateTerrainActor(world,actor,{moveX:1,moveZ:0,dt:1/60});
    if(actor.error) {errors++;break;}
    if(actorOverlapsTerrain(world,actor)) overlaps++;
    if(!actor.grounded) {
      airborne++;
      seenAirborne=true;
    }
    if(seenAirborne && actor.grounded && actor.y<initialY-1) landedAfterFall=true;
    if(boundary!==null && actor.x>=boundary) crossedBoundary=true;
    groundedTail=actor.grounded?groundedTail+1:0;
  }
  const pass=errors===0 && overlaps===0 && edits===4 && removed>0 &&
    seenAirborne && landedAfterFall && groundedTail>=30 &&
    (boundary===null || crossedBoundary);
  return {name,pass,errors,overlaps,airborneSteps:airborne,edits,
    removedVoxels:removed,firstEditStep,landedAfterFall,groundedTail,
    crossedBoundary:boundary===null?null:crossedBoundary,
    boundary,initialY,finalX:actor.x,finalY:actor.y,chunkEdge:edge};
}
export function runDynamicCollisionSuite() {
  const cases=[
    runCase('moving-destruction',16,-2.5,1),
    runCase('chunk-boundary-16',16,13.5,16,16),
    runCase('chunk-boundary-32',32,29.5,32,32)
  ];
  return {schema:'voxel-v2.dynamic-collision.v2',
    verdict:cases.every(c=>c.pass)?'pass':'fail',
    passed:cases.filter(c=>c.pass).length,total:cases.length,cases};
}
