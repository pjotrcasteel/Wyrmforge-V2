import { VoxelWorld } from './voxel-world.mjs';
import { actorOverlapsTerrain, spawnTerrainActor, simulateTerrainActor } from './terrain-actor.mjs';

const STEP=1/60;
function floor(world,minX=-12,maxX=12) {
  for(let x=minX;x<=maxX;x++) for(let z=-5;z<=5;z++) world.set(x,0,z,1);
}
function advance(world,actor,steps,input) {
  let contacts=0,airborne=0,overlaps=0,stepUps=0;
  for(let i=0;i<steps;i++) {
    actor=simulateTerrainActor(world,actor,{...input,dt:STEP});
    if(actor.error) return {actor,contacts,airborne,overlaps,stepUps,error:actor.error};
    contacts+=Number(actor.wallContact);
    airborne+=Number(!actor.grounded);
    overlaps+=Number(actorOverlapsTerrain(world,actor));
    stepUps+=Number(actor.stepUp);
  }
  return {actor,contacts,airborne,overlaps,stepUps};
}
function fixture(name) {
  const world=new VoxelWorld({chunkEdge:32});
  floor(world);
  if(name==='wall') for(let y=1;y<=4;y++) for(let z=-2;z<=2;z++) world.set(0,y,z,3);
  if(name==='step') for(let z=-2;z<=2;z++) world.set(0,1,z,3);
  if(name==='cliff') for(let x=0;x<=12;x++) for(let z=-5;z<=5;z++) world.set(x,0,z,0);
  return world;
}
export function runCollisionFixtureSuite() {
  const cases=[];
  {
    const world=fixture('wall');
    const spawn=spawnTerrainActor(world,{x:-2.5,z:0.5});
    const r=spawn?advance(world,spawn,100,{moveX:1,moveZ:0}):null;
    const passed=!!r && !r.error && r.contacts>0 && r.overlaps===0 && r.actor.x<0;
    cases.push({name:'solid-wall',pass:passed,contacts:r?.contacts??0,
      overlaps:r?.overlaps??null,finalX:r?.actor.x??null});
  }
  {
    const world=fixture('step');
    const spawn=spawnTerrainActor(world,{x:-2.5,z:0.5});
    const r=spawn?advance(world,spawn,90,{moveX:1,moveZ:0}):null;
    cases.push({name:'one-voxel-step',pass:!!r && !r.error && r.stepUps>0 &&
      r.overlaps===0 && r.actor.x>0,stepUps:r?.stepUps??0,
      overlaps:r?.overlaps??null,finalX:r?.actor.x??null});
  }
  {
    const world=fixture('cliff');
    const spawn=spawnTerrainActor(world,{x:-2.5,z:0.5});
    const r=spawn?advance(world,spawn,90,{moveX:1,moveZ:0}):null;
    cases.push({name:'cliff-fall',pass:!!r && !r.error && r.airborne>0 &&
      r.overlaps===0 && r.actor.y<spawn.y-1,
      airborneSteps:r?.airborne??0,overlaps:r?.overlaps??null,
      verticalDrop:r&&spawn?spawn.y-r.actor.y:null});
  }
  {
    const world=fixture('flat');
    const spawn=spawnTerrainActor(world,{x:-2.5,z:0.5});
    if(spawn) for(let x=-3;x<=-2;x++) for(let z=0;z<=1;z++) world.set(x,0,z,0);
    const r=spawn?advance(world,spawn,45,{moveX:0,moveZ:0}):null;
    cases.push({name:'destroy-support',pass:!!r && !r.error && r.airborne>0 &&
      r.overlaps===0 && r.actor.y<spawn.y-0.5,
      airborneSteps:r?.airborne??0,overlaps:r?.overlaps??null,
      verticalDrop:r&&spawn?spawn.y-r.actor.y:null});
  }
  return {schema:'voxel-v2.collision-fixtures.v1',verdict:cases.every(c=>c.pass)?'pass':'fail',
    cases,passed:cases.filter(c=>c.pass).length,total:cases.length};
}
