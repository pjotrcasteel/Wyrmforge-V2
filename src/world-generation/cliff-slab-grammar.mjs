// WorldGen authors genuine side-face recesses in the full 3D terrain runs.
// Floors, routes, fluid channels and the top microvoxel occupancy stay intact.
import {protectedTerrainCells} from './protected-terrain.mjs';
import {siteNoise} from './map-kinds.mjs';

export function composeCliffSlabRecesses({plan,heights,surfaces,riverChannel,volcanicTerrain}) {
  const cuts=new Set();
  if(!['mini-boss-arena','wyrm-lair'].includes(plan.recipe.kind))return cuts;
  const {radius,seed}=plan.recipe;
  const at=(x,z)=>(z+radius)*radius*2+x+radius;
  const inside=(x,z)=>x>=-radius&&x<radius&&z>=-radius&&z<radius;
  const protectedCells=protectedTerrainCells(plan,radius);
  for(const channel of [riverChannel,...(volcanicTerrain?.physicalFissures??[])]) {
    for(const cell of channel?.floor??[]) {
      for(let dz=-2;dz<=2;dz++)for(let dx=-2;dx<=2;dx++)
        protectedCells.add((cell.x+dx)+','+(cell.z+dz));
    }
  }
  for(let z=-radius+1;z<radius-1;z++)for(let x=-radius+1;x<radius-1;x++) {
    if(protectedCells.has(x+','+z)||surfaces[at(x,z)]!==3)continue;
    const top=heights[at(x,z)];
    for(const [dx,dz] of [[1,0],[-1,0],[0,1],[0,-1]]) {
      const foot=heights[at(x+dx,z+dz)];
      if(top-foot<4)continue;
      // Broad 4–9m slab runs share a bedding plane. Only selected bands
      // retreat, leaving massive intact panels and supported overhanging lips.
      const tangent=dx?z:x;
      const joint=siteNoise(seed,tangent,0,7,118);
      if(joint<.3)continue;
      const bed=foot+2+Math.floor(siteNoise(seed,tangent,0,9,119)*2);
      const depth=joint>.68?2:1;
      for(let inset=0;inset<depth;inset++) {
        const cx=x-dx*inset,cz=z-dz*inset;
        if(!inside(cx,cz)||protectedCells.has(cx+','+cz)||
            surfaces[at(cx,cz)]!==3||heights[at(cx,cz)]<top-1)break;
        for(let y=bed;y<Math.min(top-1,bed+2);y++)cuts.add(cx+','+y+','+cz);
      }
    }
  }
  return cuts;
}
