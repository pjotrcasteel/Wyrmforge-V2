// Specification pattern: validate the REAL generated heights under a broad
// secondary maneuvering layout. These are geography promises; runtime crowd
// navigation and enemy spawns are intentionally outside this module.
import { rasterizeEscapeRoute } from './escape-route-geometry.mjs';

export const COMBAT_FLOW_SCHEMA='wyrmforge.combat-flow-audit.v1';
const inside=(r,x,z)=>x>=-r&&x<r&&z>=-r&&z<r;
const index=(r,x,z)=>(z+r)*r*2+x+r;
const height=(r,h,x,z)=>h[index(r,x,z)];

export function specifyCombatFlow({
  radius,heights,combatSpaces=[],maneuverPockets=[],flowLinks=[]
}) {
  if(!Number.isSafeInteger(radius) || radius<8 || radius>24 ||
      !(heights instanceof Int16Array) || heights.length!==(radius*2)**2 ||
      !Array.isArray(combatSpaces) || !Array.isArray(maneuverPockets) ||
      !Array.isArray(flowLinks)) {
    throw new TypeError('Invalid generated combat-flow surface');
  }
  if(!maneuverPockets.length && !flowLinks.length) {
    return Object.freeze({
      schema:COMBAT_FLOW_SCHEMA,ready:true,
      pocketCount:0,linkCount:0,wideCells:0,pockets:Object.freeze([]),
      links:Object.freeze([])
    });
  }
  if(combatSpaces.length!==1 || maneuverPockets.length<2 ||
      maneuverPockets.length>3 || flowLinks.length!==maneuverPockets.length) {
    throw new Error('Combat circulation needs a central arena and distinct maneuver pockets');
  }
  const hub=combatSpaces[0];
  const pockets=[];
  const links=[];
  let wideCells=0;
  for(const pocket of maneuverPockets) {
    if(!inside(radius,pocket.x,pocket.z)) {
      throw new RangeError('Maneuver pocket exceeds the site');
    }
    const center=height(radius,heights,pocket.x,pocket.z);
    let count=0,walkable=0;
    for(let z=pocket.z-pocket.radius+1;z<=pocket.z+pocket.radius-1;z++) {
      for(let x=pocket.x-pocket.radius+1;x<=pocket.x+pocket.radius-1;x++) {
        if(Math.hypot(x-pocket.x,z-pocket.z)>pocket.radius-1)continue;
        if(!inside(radius,x,z)) throw new RangeError('Maneuver floor is outside terrain');
        count++;
        if(Math.abs(height(radius,heights,x,z)-center)<=1) walkable++;
      }
    }
    if(count<20 || walkable/count<0.9) {
      throw new Error('Maneuver pocket has an impassable fighting floor: '+pocket.id);
    }
    if(Math.hypot(pocket.x-hub.x,pocket.z-hub.z) <
        hub.radius+pocket.radius-1) {
      throw new Error('Maneuver pocket must be separate from the hub: '+pocket.id);
    }
    pockets.push(Object.freeze({
      id:pocket.id,kind:pocket.kind,x:pocket.x,z:pocket.z,
      radius:pocket.radius,surfaceY:center,
      walkableCells:walkable,floorCells:count,ready:true
    }));
    const link=flowLinks.find(item=>item.pocketId===pocket.id);
    if(!link || link.width<2 || link.width>3) {
      throw new Error('Maneuver pocket lacks a wide terrain circulation link: '+pocket.id);
    }
    const path=rasterizeEscapeRoute(link.nodes);
    if(path.length<10 || path.length>70 ||
        path[0].x!==hub.x || path[0].z!==hub.z ||
        path.at(-1).x!==pocket.x || path.at(-1).z!==pocket.z) {
      throw new Error('Circulation link does not connect hub to its pocket');
    }
    let maxStep=0,minimumSideNeighbors=4;
    let previous=null;
    const cells=new Set();
    for(const point of path) {
      if(!inside(radius,point.x,point.z)) {
        throw new RangeError('Circulation link exceeds the site');
      }
      const current=height(radius,heights,point.x,point.z);
      if(previous!==null) {
        const step=Math.abs(current-previous);
        maxStep=Math.max(maxStep,step);
        if(step>1) {
          throw new Error('Circulation link has an impassable rise: '+link.id);
        }
      }
      previous=current;
      let neighbors=0;
      for(const [dx,dz] of [[-1,0],[1,0],[0,-1],[0,1]]) {
        const x=point.x+dx,z=point.z+dz;
        if(!inside(radius,x,z)) continue;
        if(Math.abs(height(radius,heights,x,z)-current)<=1) {
          neighbors++;
          cells.add(x+','+z);
        }
      }
      minimumSideNeighbors=Math.min(minimumSideNeighbors,neighbors);
      if(neighbors<3) {
        throw new Error('Circulation link is too narrow for horde movement: '+link.id);
      }
      cells.add(point.x+','+point.z);
    }
    wideCells+=cells.size;
    links.push(Object.freeze({
      id:link.id,kind:link.kind,pocketId:pocket.id,
      width:link.width,length:path.length,
      minimumSideNeighbors,maxStep,wideCells:cells.size,
      ready:true
    }));
  }
  if(new Set(pockets.map(pocket=>pocket.kind)).size<2) {
    throw new Error('All maneuver spaces reuse the same combat identity');
  }
  return Object.freeze({
    schema:COMBAT_FLOW_SCHEMA,ready:true,
    pocketCount:pockets.length,linkCount:links.length,wideCells,
    pockets:Object.freeze(pockets),links:Object.freeze(links)
  });
}
