import { VoxelWorld } from './voxel-world.mjs';
import { TerrainEditLedger } from './terrain-edit-ledger.mjs';
import { actorOverlapsTerrain, simulateTerrainActor, spawnTerrainActor } from './terrain-actor.mjs';

function makeFloor(edge) {
  const world=new VoxelWorld({chunkEdge:edge});
  for(let x=-4;x<=36;x++) for(let z=-3;z<=3;z++) world.set(x,0,z,1);
  return world;
}
function runCase(name,edge,spawnX,editAt,editX) {
  const world=makeFloor(edge);
  const ledger=new TerrainEditLedger(world);
  let actor=spawnTerrainActor(world,{x:spawnX,z:0.5});
  if(!actor) return {name,pass:false,reason:'no-spawn'};
  let errors=0,overlaps=0,airborne=0,wallContacts=0,edits=0,removed=0;
  let firstEditStep=null;
  for(let i=0;i<300;i++) {
    if(i>=editAt && i<editAt+12 && (i-editAt)%3===0) {
      const result=ledger.apply({
        id:name+'-'+i,type:'carve-sphere',x:editX+Math.floor((i-editAt)/3),
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
    if(!actor.grounded) airborne++;
    if(actor.wallContact) wallContacts++;
  }
  return {name,pass:errors===0 && overlaps===0 && edits===4 && removed>0,
    errors,overlaps,airborneSteps:airborne,wallContacts,edits,removedVoxels:removed,
    firstEditStep,finalX:actor.x,finalY:actor.y,chunkEdge:edge};
}
export function runDynamicCollisionSuite() {
  const cases=[
    runCase('moving-destruction',16,-2.5,24,1),
    runCase('chunk-boundary-16',16,13.5,24,16),
    runCase('chunk-boundary-32',32,29.5,24,32)
  ];
  return {schema:'voxel-v2.dynamic-collision.v1',
    verdict:cases.every(c=>c.pass)?'pass':'fail',
    passed:cases.filter(c=>c.pass).length,total:cases.length,cases};
}
