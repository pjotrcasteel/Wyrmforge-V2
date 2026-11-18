// WorldGen supplies physical 10cm occupancy through the cliff's full height.
// Taper is monotone, with broad holds and irregular setbacks. No mesh bending.
import {siteNoise} from './map-kinds.mjs';
import {protectedTerrainCells} from './protected-terrain.mjs';

export function composeCliffTaperTiles({plan,heights,surfaces,tiles,riverChannel}) {
  const {radius,seed}=plan.recipe;
  const budget=plan.recipe.river?1024:384;
  const result=new Map(tiles.map(t=>[t.x+','+t.y+','+t.z,{...t,levels:[...t.levels]}]));
  const protectedCells=protectedTerrainCells(plan,radius);
  for(const cell of riverChannel?.floor??[])protectedCells.add(cell.x+','+cell.z);
  const at=(x,z)=>(z+radius)*radius*2+x+radius;
  const candidates=[];
  for(let z=-radius+1;z<radius-1;z++)for(let x=-radius+1;x<radius-1;x++) {
    if(surfaces[at(x,z)]!==3||protectedCells.has(x+','+z))continue;
    const top=heights[at(x,z)],edges=[];
    for(const [dx,dz] of [[1,0],[-1,0],[0,1],[0,-1]]) {
      const foot=heights[at(x+dx,z+dz)];
      if(top-foot>=2)edges.push({dx,dz,foot});
    }
    if(edges.length)candidates.push({x,z,top,edges,foot:Math.min(...edges.map(e=>e.foot))});
  }
  candidates.sort((a,b)=>(a.x*a.x+a.z*a.z)-(b.x*b.x+b.z*b.z)||a.z-b.z||a.x-b.x);
  let stackedTiles=0;
  for(const {x,z,top,foot,edges} of candidates) {
    const required=top-foot;
    const existing=tiles.some(t=>t.x===x&&t.z===z&&t.y===top)?1:0;
    if(result.size+required-existing>budget)continue; // Keep complete vertical profiles.
    for(let y=foot+1;y<=top;y++) {
      const key=x+','+y+','+z;
      const levels=result.get(key)?.levels??Array(100).fill(10);
      const profiles=edges.map(({dx,dz,foot:edgeFoot})=>{
        const values=[];
        const maxInset=edges.some(e=>e.dx===-dx&&e.dz===-dz)?4:8;
        for(let lateral=0;lateral<10;lateral++) {
          const tangent=(dx?z:x)+(lateral+.5)/10;
          const rate=.8+siteNoise(seed,tangent,0,4.7,131)*1.3;
          const profile=Array(10).fill(0);
          for(let my=0;my<10;my++) {
            const rise=y+(my+.5)/10-(edgeFoot+2);
            const hold=siteNoise(seed,tangent,rise,3.3,132);
            const inset=y<=edgeFoot+1?0:Math.min(maxInset,Math.max(0,Math.floor((rise+.3)*rate+hold*1.3)));
            for(let distance=inset;distance<10;distance++)profile[distance]=my+1;
          }
          values.push(profile);
        }
        return {dx,dz,values};
      });
      for(let iz=0;iz<10;iz++)for(let ix=0;ix<10;ix++) {
        let height=10;
        for(const {dx,dz,values} of profiles) {
          const distance=dx===1?9-ix:dx===-1?ix:dz===1?9-iz:iz;
          height=Math.min(height,values[dx?iz:ix][distance]);
        }
        levels[iz*10+ix]=Math.min(levels[iz*10+ix],height);
      }
      if(levels.every(level=>level===10)&&!result.has(key))continue;
      result.set(key,{x,y,z,levels});stackedTiles++;
    }
  }
  return {tiles:[...result.values()].sort((a,b)=>a.y-b.y||a.z-b.z||a.x-b.x),stackedTiles};
}
