// World Generation V2: deterministic, terrain-only combat circulation.
// Compiles Builder-designed pocket/link intent into the SAME authoritative
// 3D terrain surface; no enemy logic, collision engine or renderer imports.
import { rasterizeEscapeRoute } from './escape-route-geometry.mjs';

const idx=(radius,x,z)=>(z+radius)*radius*2+x+radius;
const within=(radius,x,z)=>x>=-radius&&x<radius&&z>=-radius&&z<radius;
const clamp=(n,a,b)=>Math.max(a,Math.min(b,n));

export function composeCombatFlow({radius,heights,combatSpaces=[],maneuverPockets=[],flowLinks=[]}) {
  if(!(heights instanceof Int16Array) ||
      !Number.isSafeInteger(radius) || heights.length!==(radius*2)**2 ||
      !Array.isArray(combatSpaces) || !Array.isArray(maneuverPockets) ||
      !Array.isArray(flowLinks)) {
    throw new TypeError('Expected bounded site surface and combat-flow design');
  }
  if(!maneuverPockets.length && !flowLinks.length) {
    return Object.freeze({pockets:0,links:0,modifiedCells:0});
  }
  if(combatSpaces.length!==1 ||
      flowLinks.length!==maneuverPockets.length) {
    throw new Error('Maneuver flow needs one combat hub and one link per pocket');
  }
  const original=heights.slice();
  const edits=new Map();
  const hub=combatSpaces[0];
  const hubY=original[idx(radius,hub.x,hub.z)];
  const pocketTargets=new Map(maneuverPockets.map(pocket=>{
    const natural=original[idx(radius,pocket.x,pocket.z)];
    // Allow a readable biome terrace without creating giant impassable drops.
    const target=clamp(natural,hubY-3,hubY+3);
    return [pocket.id,target];
  }));
  function propose(x,z,elevation,strength,priority) {
    if(!within(radius,x,z) || strength<=0) return;
    const i=idx(radius,x,z);
    const value=Math.round(original[i]*(1-strength)+elevation*strength);
    const current=edits.get(i);
    if(!current || priority>current.priority) {
      edits.set(i,{height:value,priority});
    }
  }
  // Graded links use each sampled cardinal cell, not only the start/end
  // chord: otherwise a diagonal-looking route can contain invisible cliffs.
  for(const link of flowLinks) {
    const pocket=maneuverPockets.find(item=>item.id===link.pocketId);
    if(!pocket) throw new Error('Circulation link has no landing pocket');
    const target=pocketTargets.get(pocket.id);
    const path=rasterizeEscapeRoute(link.nodes);
    for(let n=0;n<path.length;n++) {
      const p=path[n];
      const t=n/Math.max(1,path.length-1);
      const elevation=Math.round(hubY+(target-hubY)*t);
      for(let dz=-link.width-1;dz<=link.width+1;dz++) {
        for(let dx=-link.width-1;dx<=link.width+1;dx++) {
          const distance=Math.hypot(dx,dz);
          if(distance>link.width+1) continue;
          const strength=distance<=link.width ? 1 :
            0.4*(link.width+1-distance);
          propose(p.x+dx,p.z+dz,elevation,strength,
            distance<=link.width?3:1);
        }
      }
    }
  }
  // Small satellite fighting spaces provide options for circling enemies.
  // Their centers are real, mostly level terrain; outside shoulders keep
  // the characteristic wet forest / foothill / mountain silhouette.
  for(const pocket of maneuverPockets) {
    const elevation=pocketTargets.get(pocket.id);
    for(let dz=-pocket.radius-1;dz<=pocket.radius+1;dz++) {
      for(let dx=-pocket.radius-1;dx<=pocket.radius+1;dx++) {
        const distance=Math.hypot(dx,dz);
        if(distance>pocket.radius+1) continue;
        const strength=distance<=pocket.radius-1 ? 1 :
          clamp((pocket.radius+1-distance)/2,0,1);
        propose(pocket.x+dx,pocket.z+dz,elevation,strength,
          distance<=pocket.radius-1?6:2);
      }
    }
  }
  // The original central arena must remain broad and fully usable;
  // links attach to it but must never carve new hills across the hub.
  for(let dz=-hub.radius+1;dz<=hub.radius-1;dz++) {
    for(let dx=-hub.radius+1;dx<=hub.radius-1;dx++) {
      if(Math.hypot(dx,dz)<=hub.radius-1) {
        propose(hub.x+dx,hub.z+dz,hubY,1,7);
      }
    }
  }
  let changed=0;
  for(const [i,edit] of edits) {
    if(heights[i]!==edit.height) {
      heights[i]=edit.height;
      changed++;
    }
  }
  return Object.freeze({
    pockets:maneuverPockets.length,links:flowLinks.length,
    modifiedCells:changed
  });
}
