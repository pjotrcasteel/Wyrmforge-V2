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
  return Object.freeze({
    combat:Object.freeze(combat),
    approaches:Object.freeze(approaches)
  });
}
