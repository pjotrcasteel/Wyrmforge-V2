// Diagnostic-only overlay for the *site plan*. No chest models, enemy
// spawns, loot logic or voxel changes. It projects actual public terrain
// surface points through the current viewport/camera.
import { projectVoxel } from '../camera-presets.mjs';

function surface(world,x,z) {
  for(let y=30;y>=-3;y--) {
    if(world.get(x,y,z)!==0) return y+1;
  }
  return 0;
}

export function projectEncounterGuides(site,world,view) {
  if(!site?.layout || !world || !view ||
      !Number.isFinite(view.width) || !Number.isFinite(view.height) ||
      view.width<=0 || view.height<=0) {
    throw new TypeError('Expected generated layout, terrain and viewport');
  }
  const project=(x,z)=>{
    const y=surface(world,Math.round(x),Math.round(z));
    return projectVoxel(x+0.5,y,z+0.5,view);
  };
  const combat=site.layout.combatSpaces.map(space=>{
    const ring=[];
    for(let n=0;n<=48;n++) {
      const angle=n*Math.PI*2/48;
      ring.push(project(
        space.x+Math.cos(angle)*space.radius,
        space.z+Math.sin(angle)*space.radius
      ));
    }
    return Object.freeze({
      id:space.id,
      center:project(space.x,space.z),
      ring:Object.freeze(ring)
    });
  });
  const approaches=site.layout.approaches.map(approach=>({
    id:approach.id,centerId:approach.combatSpaceId,
    point:project(approach.x,approach.z)
  }));
  // Escape routes are versioned site-layout metadata. The viewer can consume
  // them without knowing which generator Strategy carved the actual corridor.
  const escapes=(site.layout.escapeRoutes ?? []).map(route=>{
    const path=[];
    for(let i=1;i<route.nodes.length;i++) {
      const a=route.nodes[i-1],b=route.nodes[i];
      const steps=Math.max(Math.abs(a.x-b.x),Math.abs(a.z-b.z));
      for(let j=i===1?0:1;j<=steps;j++) {
        path.push(project(
          Math.round(a.x+(b.x-a.x)*j/steps),
          Math.round(a.z+(b.z-a.z)*j/steps)
        ));
      }
    }
    return Object.freeze({
      id:route.id,side:route.side,style:route.style,
      points:Object.freeze(path)
    });
  });
  return Object.freeze({
    combat:Object.freeze(combat),
    approaches:Object.freeze(approaches),
    escapes:Object.freeze(escapes)
  });
}
