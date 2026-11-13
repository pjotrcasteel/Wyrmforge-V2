// World Generation: physical volcanic fissures and validated vertical
// lava-fall placement anchors. The former cut real 3D voxel columns; the
// latter are NOT rendered liquid, fake geometry, damage, or lava simulation.
// World Objects/VFX/Gameplay consume these locations in later V2 engines.
import { rasterizeEscapeRoute } from './escape-route-geometry.mjs';
import { selectRoadCell } from './road-footprint.mjs';

export const VOLCANIC_TERRAIN_SCHEMA='wyrmforge.volcanic-terrain.v1';
const inside=(r,x,z)=>x>=-r&&x<r&&z>=-r&&z<r;
const index=(r,x,z)=>(z+r)*r*2+x+r;
const dist=(x,z,point)=>Math.hypot(x-point.x,z-point.z);
const clamp=(value,min,max)=>Math.max(min,Math.min(max,value));
const gradePath=(nodes)=>rasterizeEscapeRoute(nodes);

function protectedTerrain(plan,radius) {
  const protectedCells=new Set();
  const mark=(x,z,buffer)=>{
    for(let dx=-buffer;dx<=buffer;dx++)for(let dz=-buffer;dz<=buffer;dz++) {
      if(dx*dx+dz*dz>buffer*buffer || !inside(radius,x+dx,z+dz))continue;
      protectedCells.add((x+dx)+','+(z+dz));
    }
  };
  for(const route of [...plan.routes,...plan.escapeRoutes,...plan.flowLinks]) {
    for(const point of gradePath(route.nodes))mark(point.x,point.z,
      (route.width??2)+2);
  }
  for(const space of [...plan.combatSpaces,...plan.clearings]) {
    for(let z=-radius;z<radius;z++)for(let x=-radius;x<radius;x++) {
      if(dist(x,z,space)<=space.radius+2)protectedCells.add(x+','+z);
    }
  }
  const hub=plan.combatSpaces[0];
  if(hub)for(const approach of plan.approaches) {
    for(const point of gradePath([approach,hub])) {
      mark(point.x,point.z,approach.width+2);
    }
  }
  for(const landmark of plan.landmarks)mark(landmark.x,landmark.z,
    landmark.clearance+2);
  return protectedCells;
}

function segmentDistance(x,z,a,b) {
  const dx=b.x-a.x,dz=b.z-a.z;
  const t=clamp(((x-a.x)*dx+(z-a.z)*dz)/(dx*dx+dz*dz),0,1);
  return Math.hypot(x-a.x-dx*t,z-a.z-dz*t);
}

// Pre-authored rifts run OUTSIDE navigable causeways and boss floors.
// The same topology/spawn rules must be preserved after each seed.
const FAULTS=Object.freeze([
  Object.freeze({id:'west-rift',from:{x:-13,z:-14},to:{x:-9,z:-3},width:1.65}),
  Object.freeze({id:'east-rift',from:{x:12,z:-16},to:{x:9,z:-4},width:1.6}),
  Object.freeze({id:'northwest-rift',from:{x:-14,z:-5},to:{x:-10,z:9},width:1.55}),
  Object.freeze({id:'northeast-rift',from:{x:13,z:-5},to:{x:10,z:9},width:1.55})
]);

export function composeVolcanicTerrain({plan,seed,heights,surfaces}) {
  const profile=plan.volcanicTerrain;
  if(!profile)return null;
  const {radius}=plan.recipe;
  if(!['approach','mini-boss','lair'].includes(profile.stage) ||
      !(heights instanceof Int16Array) ||
      !(surfaces instanceof Uint8Array) ||
      heights.length!==(radius*2)**2 ||
      surfaces.length!==heights.length ||
      !Number.isSafeInteger(seed)) {
    throw new TypeError('Volcanic geology needs bounded authored terrain');
  }
  const stage=profile.stage;
  const protectedCells=protectedTerrain(plan,radius);
  const before=heights.slice();
  const scale=stage==='lair'?1:stage==='mini-boss'?0.8:
    Math.max(0.45,plan.recipe.corruption);
  const numberOfFaults=stage==='lair'?4:stage==='mini-boss'?3:2;
  const fissures=[];
  let totalFissureCells=0;
  for(const fault of FAULTS.slice(0,numberOfFaults)) {
    let cells=0,deepest=0;
    for(let z=-radius;z<radius;z++)for(let x=-radius;x<radius;x++) {
      if(protectedCells.has(x+','+z) ||
          selectRoadCell(x,z,plan.routes))continue;
      // Slight seed-linked displacement gives recognizable but different
      // fault outlines without independently random pixels.
      const phase=((x+z+(seed%23))%7+7)%7;
      const wobble=(phase-3)*0.1;
      const d=segmentDistance(x,z,fault.from,fault.to);
      if(d>fault.width*scale+wobble)continue;
      const i=index(radius,x,z);
      const depth=Math.min(before[i],Math.round(3+2.5*scale));
      if(depth<2)continue;
      heights[i]=Math.max(0,before[i]-depth);
      surfaces[i]=3; // legitimate stone at the physical trench floor
      cells++;
      deepest=Math.max(deepest,depth);
    }
    if(cells>0)fissures.push(Object.freeze({
      id:fault.id,kind:'physical-stone-fissure',
      cutCells:cells,maxDepthMetres:deepest,
      from:Object.freeze({...fault.from}),to:Object.freeze({...fault.to})
    }));
    totalFissureCells+=cells;
  }

  // A lava fall needs a genuine stone wall, not a floating waterfall VFX.
  // Reserve steep wall anchors only; fluid, lighting and damage are separate.
  const targetCount=stage==='lair'?3:stage==='mini-boss'?1:
    plan.recipe.corruption>=0.75?1:0;
  const candidates=[];
  for(let z=-radius+2;z<radius-2;z++)for(let x=-radius+2;x<radius-2;x++) {
    if(protectedCells.has(x+','+z) ||
        selectRoadCell(x,z,plan.routes))continue;
    const top=heights[index(radius,x,z)];
    for(const [dx,dz,direction] of [
      [1,0,'east'],[-1,0,'west'],[0,1,'south'],[0,-1,'north']
    ]) {
      const next=heights[index(radius,x+dx,z+dz)];
      if(top-next<3)continue;
      candidates.push({x,z,top,base:next,direction,drop:top-next});
    }
  }
  candidates.sort((a,b)=>
    b.drop-a.drop || a.z-b.z || a.x-b.x ||
    a.direction.localeCompare(b.direction));
  const lavaFalls=[];
  for(const candidate of candidates) {
    if(lavaFalls.length>=targetCount)break;
    if(lavaFalls.some(anchor=>
      Math.hypot(anchor.x-candidate.x,anchor.z-candidate.z)<7))continue;
    lavaFalls.push(Object.freeze({
      id:'lava-fall-'+(lavaFalls.length+1),
      kind:'cliff-fall-anchor',x:candidate.x,z:candidate.z,
      rimY:candidate.top+1,footY:candidate.base+1,
      facing:candidate.direction,
      // A placeholder emission request, NOT actual lava or a damage volume.
      simulation:'unimplemented'
    }));
  }
  return Object.freeze({
    schema:VOLCANIC_TERRAIN_SCHEMA,stage,
    physicalFissures:Object.freeze(fissures),
    fissureCells:totalFissureCells,
    lavaFallAnchors:Object.freeze(lavaFalls),
    lavaSimulationImplemented:false
  });
}
