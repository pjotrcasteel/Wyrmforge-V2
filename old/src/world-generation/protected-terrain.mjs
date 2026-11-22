// Shared exclusion footprint for geographical cuts around authored travel and combat space.
import {rasterizeEscapeRoute} from './escape-route-geometry.mjs';

const inside=(r,x,z)=>x>=-r&&x<r&&z>=-r&&z<r;
const dist=(x,z,point)=>Math.hypot(x-point.x,z-point.z);
const gradePath=(nodes)=>rasterizeEscapeRoute(nodes);

export function protectedTerrainCells(plan,radius) {
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
  for(const space of [
    ...plan.combatSpaces,...plan.clearings,...(plan.maneuverPockets??[])
  ]) {
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

