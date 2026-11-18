// Opt-in QA: exercise the *published Play Hunt* Voxel and Water V2 objects
// through the same actor policy and graph residency used by the real game.
// Fast-forwarding fixed physics steps avoids dependence on headless WebGL FPS.
// There is NO teleportation, second terrain/fluid world, or synthetic river.
// Real GPU mesh presentation is checked separately by browser screenshot
// witnesses and manually on iOS/Android.
import {analyzeCharacterReachability} from '../character-reachability.mjs';
import {DEFAULT_TRAVERSAL_PROFILE} from '../character-traversal-policy.mjs';
import {containsHuntLandform} from '../world-generation/hunt-landform-footprint.mjs';
import {actorOverlapsTerrain} from '../terrain-actor.mjs';
import {stepHuntExplorer,HUNT_FIXED_STEP,HUNT_WALK_SPEED} from '../hunt-play-runtime.mjs';

export const WATER_MOBILE_JOURNEY_SCHEMA='wyrmforge.water-mobile-journey.v1';
export const WATER_MOBILE_JOURNEY_ROUTE=Object.freeze([
  'region-entry','region-woodland-trail','region-buried-grove',
  'region-western-shelf','region-horde-crossing',
  'region-western-shelf','region-buried-grove','region-woodland-trail','region-entry'
]);
const near=(a,b)=>Math.abs(a-b)<1e-8;
const fail=message=>{throw new Error('Connected Water V2 mobile journey: '+message);};
const key=(x,y,z)=>x+','+y+','+z;

export function exercisePublishedWaterJourney({
  graph,world,port,residency,fluid,fluidSave,terrainSave,actor,craterCell,
  route=WATER_MOBILE_JOURNEY_ROUTE
}={}){
  if(!graph?.layout?.regions||!world||!port||!residency||
      !fluid||!fluidSave||!terrainSave||!actor||
      ![craterCell?.x,craterCell?.y,craterCell?.z].every(Number.isSafeInteger)){
    throw new TypeError('Expected actual Voxel/Water V2, published Hunt actor and saved Fireball cell');
  }
  const regions=graph.layout.regions,byId=new Map(regions.map(r=>[r.id,r]));
  const bounds={
    minX:Math.min(...regions.map(r=>r.bounds.minX)),
    maxX:Math.max(...regions.map(r=>r.bounds.maxX)),
    minZ:Math.min(...regions.map(r=>r.bounds.minZ)),
    maxZ:Math.max(...regions.map(r=>r.bounds.maxZ))
  };
  const original=graph.layout.entryRegionId;
  const wetLink=graph.fluidSeams?.[0]?.to.bandId??'link-region-entry-region-woodland-trail';
  const before=fluid.exportCheckpoint();
  const entryInitial=before.regions.find(r=>r.id===original);
  if(!entryInitial||!fluid.activeIds.includes(original)){
    fail('entry river must be resident before the journey');
  }
  if(world.get(craterCell.x,craterCell.y,craterCell.z)!==0||
      !terrainSave.removedCells.has(key(craterCell.x,craterCell.y,craterCell.z))){
    fail('Fireball edit must exist in both authoritative Voxel and journal before travel');
  }
  let currentActor=actor,steps=0,entryEvictions=0,linkEvictions=0;
  let entryDormant=null,revisited=false,peakRegions=0,peakLinks=0;
  const transitions=[],sections=[];
  const publish=()=>{
    // In a browser this runs without a GPU worker fence, but DOES load and
    // remove exact production Voxel residency data. The rendered frame path
    // remains the responsibility of the normal host and manual QA.
    residency.publish();
    const opened=fluid.syncResident(residency.metrics.residentIds);
    if(entryDormant&&opened&&fluid.activeIds.includes(original)&&!revisited){
      const restored=fluid.exportCheckpoint().regions.find(r=>r.id===original);
      if(JSON.stringify(restored?.state)!==JSON.stringify(entryDormant.state)){
        fail('entry river lost liquid or in-flight packets after Voxel republish');
      }
      revisited=true;
    }
    if(!fluidSave.saveFrom(fluid))fail('Water V2 checkpoint could not be persisted');
    const metrics=residency.metrics;
    peakRegions=Math.max(peakRegions,metrics.residentRegions.length);
    peakLinks=Math.max(peakLinks,metrics.residentLinks.length);
    if(metrics.residentRegions.length>3||metrics.residentLinks.length>2||
        fluid.activeIds.length>5){
      fail('physical streaming exceeded resident region/link caps');
    }
  };
  const frame=(moveX,moveZ)=>{
    const allowed=residency.constrainInput(currentActor,{moveX,moveZ});
    const next=stepHuntExplorer(world,currentActor,bounds,allowed,HUNT_FIXED_STEP);
    if(next.error||actorOverlapsTerrain(world,next)){
      fail('actor collided during physical journey: '+JSON.stringify(next));
    }
    const travelled=Math.hypot(next.x-currentActor.x,next.z-currentActor.z);
    if(travelled>HUNT_WALK_SPEED*HUNT_FIXED_STEP+.0001){
      fail('actor moved faster than native walking speed');
    }
    currentActor=next;
    steps++;
    const water=fluid.step({budget:96});
    if(water.processed+water.seamInspected>96)fail('shared Water V2 fixed-step budget exceeded');
    if(!residency.metrics.transition){
      const job=residency.next(currentActor,{movement:{moveX,moveZ}});
      if(job){
        if(job.action==='evict'){
          const snapshot=fluid.exportCheckpoint().regions.find(r=>r.id===job.id);
          if(job.id===original){
            entryDormant=snapshot;
            entryEvictions++;
          }
          if(job.id===wetLink)linkEvictions++;
          fluid.evict(job.id); // always checkpoint before Voxel destroys solids
          if(!fluidSave.saveFrom(fluid))fail('eviction did not persist Water V2 checkpoint');
        }
        transitions.push(Object.freeze({action:job.action,id:job.id}));
        residency.begin(job);
      }
    }
    if(residency.metrics.transition?.phase==='writing')residency.step(512);
    if(residency.metrics.transition?.phase==='awaiting-mesh')publish();
    if(steps>14000)fail('bounded traversal step limit exceeded');
  };
  const walk=(x,z,label)=>{
    for(let i=0;i<1200;i++){
      const dx=x-currentActor.x,dz=z-currentActor.z;
      if(Math.hypot(dx,dz)<.025&&currentActor.grounded)return;
      const scale=HUNT_WALK_SPEED*HUNT_FIXED_STEP;
      const length=Math.hypot(dx,dz);
      frame(dx/Math.max(scale,length),dz/Math.max(scale,length));
    }
    fail('physical route could not reach '+label+' from '+
      JSON.stringify({x:currentActor.x,z:currentActor.z}));
  };
  const traverseInterior=(band,x,z)=>{
    const inner={
      minX:band.bounds.minX+1,maxX:band.bounds.maxX-1,
      minZ:band.bounds.minZ+1,maxZ:band.bounds.maxZ-1,minY:-3,maxY:30
    };
    const goal={x:Math.floor(x),z:Math.floor(z)};
    const terrain={
      raycast:ray=>port.raycast(ray),
      sweepActor:(...args)=>port.sweepActor(...args),
      actorOverlaps:possible=>[-.65,.65].some(dx=>[-.65,.65].some(dz=>
        !containsHuntLandform(band,possible.x+dx,possible.z+dz)))||
        port.actorOverlaps(possible)
    };
    const audit=analyzeCharacterReachability({
      terrain,bounds:inner,
      start:{x:Math.floor(currentActor.x),z:Math.floor(currentActor.z)},
      targets:[goal],
      profile:{...DEFAULT_TRAVERSAL_PROFILE,maxNavigableDrop:.55}
    });
    const path=audit.routeTo(goal.x,goal.z);
    if(!path)fail('no native Voxel walking route inside '+band.id);
    for(const cell of path)walk(cell.x+.5,cell.z+.5,band.id);
  };
  for(let i=1;i<route.length;i++){
    const from=byId.get(route[i-1]),to=byId.get(route[i]);
    if(!from||!to)fail('unknown WorldGen region in traversal route');
    const exit=from.ports.find(p=>p.peerRegionId===to.id);
    const entrance=to.ports.find(p=>p.peerRegionId===from.id);
    if(!exit||!entrance)fail('not a real WorldGen link: '+from.id+' -> '+to.id);
    const dx=Math.sign(to.offsetX-from.offsetX);
    const dz=Math.sign(to.offsetZ-from.offsetZ);
    traverseInterior(from,exit.at.x-dx*3+.5,exit.at.z-dz*3+.5);
    walk(entrance.at.x+dx*3+.5,entrance.at.z+dz*3+.5,
      from.id+' -> '+to.id);
    if(residency.location(currentActor.x,currentActor.z)!==to.id){
      fail('actor did not physically reach '+to.id);
    }
    sections.push(to.id);
  }
  if(!entryEvictions||!linkEvictions||!revisited){
    fail('original wet region and connector were not both evicted and revisited: '+
      JSON.stringify({entryEvictions,linkEvictions,revisited}));
  }
  if(world.get(craterCell.x,craterCell.y,craterCell.z)!==0||
      !terrainSave.removedCells.has(key(craterCell.x,craterCell.y,craterCell.z))){
    fail('revisited Voxel terrain lost the saved Fireball crater');
  }
  if(!fluidSave.saveFrom(fluid))fail('final connected river checkpoint failed');
  return Object.freeze({
    schema:WATER_MOBILE_JOURNEY_SCHEMA,sections:Object.freeze(sections),
    actor:Object.freeze({x:currentActor.x,y:currentActor.y,z:currentActor.z}),
    physicalSteps:steps,entryEvictions,linkEvictions,revisited,
    transitionCount:transitions.length,peakRegions,peakLinks,
    savedBandCount:fluid.exportCheckpoint().regions.length,
    seamLinks:fluid.seamLinks,waterDepth:fluid.totalDepth,
    savedCrater:true
  });
}
