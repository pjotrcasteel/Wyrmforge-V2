// WorldGen authors real 10cm rock occupancy. All retreats are monotone with
// height, but their hold lengths and break strengths vary along the cliff.
import {siteNoise} from './map-kinds.mjs';
import {protectedTerrainCells} from './protected-terrain.mjs';

function retreatProfile(seed,tangent,y,foot,maximum) {
  const cuts=[];
  let start=0,cut=0,band=0;
  let span=.35+siteNoise(seed,tangent,band,1.7,141)*1.4;
  let strength=siteNoise(seed,tangent,band,1.2,142);
  let rate=strength<.38?.12:.8+strength*4;
  for(let my=0;my<10;my++) {
    const rise=Math.max(0,y+(my+.5)/10-(foot+2));
    while(start+span<rise&&band<31&&cut<maximum) {
      cut+=span*rate;start+=span;band++;
      span=.35+siteNoise(seed,tangent,band,1.7,141)*1.4;
      strength=siteNoise(seed,tangent,band,1.2,142);
      rate=strength<.38?.12:.8+strength*4;
    }
    cuts.push(Math.min(maximum,Math.floor(cut+Math.max(0,rise-start)*rate)));
  }
  return cuts;
}

export function composeCliffTaperTiles({plan,heights,surfaces,tiles,riverChannel}) {
  const {radius,seed}=plan.recipe;
  const budget=plan.recipe.river?1024:384;
  const result=new Map(tiles.map(t=>[t.x+','+t.y+','+t.z,{...t,levels:[...t.levels]}]));
  const voidCells=new Set();
  const profileCache=new Map();
  const profileCuts=(tangent,y,foot,maximum)=>{
    const key=Math.round(tangent*10000)+','+y+','+foot+','+maximum;
    if(!profileCache.has(key)) {
      if(profileCache.size>=8192)profileCache.delete(profileCache.keys().next().value);
      profileCache.set(key,retreatProfile(seed,tangent,y,foot,maximum));
    }
    return profileCache.get(key);
  };
  const protectedCells=protectedTerrainCells(plan,radius);
  for(const cell of riverChannel?.floor??[])protectedCells.add(cell.x+','+cell.z);
  const at=(x,z)=>(z+radius)*radius*2+x+radius;
  const inside=(x,z)=>x>=-radius&&x<radius&&z>=-radius&&z<radius;
  const candidates=[];
  for(let z=-radius+1;z<radius-1;z++)for(let x=-radius+1;x<radius-1;x++) {
    if(surfaces[at(x,z)]!==3||protectedCells.has(x+','+z))continue;
    const top=heights[at(x,z)],edges=[];
    for(const [dx,dz] of [[1,0],[-1,0],[0,1],[0,-1],[1,1],[1,-1],[-1,1],[-1,-1]]) {
      const foot=heights[at(x+dx,z+dz)];
      if(top-foot>=2)edges.push({dx,dz,foot});
    }
    if(edges.length)candidates.push({x,z,top,edges});
  }
  candidates.sort((a,b)=>(a.x*a.x+a.z*a.z)-(b.x*b.x+b.z*b.z)||a.z-b.z||a.x-b.x);
  let stackedTiles=0;
  for(const {x,z,top,edges} of candidates) {
    // Stage whole vertical profiles before committing them to the budget.
    const pending=new Map();
    for(const {dx,dz,foot} of edges) {
      const isolated=edges.some(e=>e.dx===-dx&&e.dz===-dz);
      const maximum=isolated?4:11+Math.floor(siteNoise(seed,x,z,6,143)*8);
      for(let inward=0;inward<(isolated?1:2);inward++) {
        const cx=x-dx*inward,cz=z-dz*inward;
        if(!inside(cx,cz)||protectedCells.has(cx+','+cz)||surfaces[at(cx,cz)]!==3)break;
        // Do not excavate a taller back wall beneath an unrefined roof.
        if(inward&&heights[at(cx,cz)]>top+1)break;
        for(let y=foot+1;y<=heights[at(cx,cz)];y++) {
          const key=cx+','+y+','+cz;
          if(voidCells.has(key))continue;
          const previous=pending.get(key)??result.get(key);
          const levels=previous?[...previous.levels]:Array(100).fill(10);
          for(let lateral=0;lateral<10;lateral++) {
            // Rates vary through the rock, not at each parent-voxel boundary.
            const px=cx+(lateral+.5)/10,pz=cz+(lateral+.5)/10;
            const tangent=dx&&dz?(-dz*px+dx*pz)/Math.SQRT2:dx?pz:px;
            const cuts=profileCuts(tangent,y,foot,maximum);
            for(let other=0;other<10;other++) {
              const ix=dx?other:lateral,iz=dx?lateral:other;
              const wx=cx+(ix+.5)/10,wz=cz+(iz+.5)/10;
              const ax=dx===1?(x+1-wx)*10:dx===-1?(wx-x)*10:0;
              const az=dz===1?(z+1-wz)*10:dz===-1?(wz-z)*10:0;
              const distance=dx&&dz?Math.hypot(ax,az):ax+az;
              let diagonalCuts=cuts;
              if(dx&&dz)diagonalCuts=profileCuts((-dz*wx+dx*wz)/Math.SQRT2,y,foot,maximum);
              let occupied=0;
              for(let my=0;my<10;my++)if(distance>=diagonalCuts[my])occupied=my+1;
              levels[iz*10+ix]=Math.min(levels[iz*10+ix],occupied);
            }
          }
          if(!previous&&levels.every(level=>level===10))continue;
          pending.set(key,{x:cx,y,z:cz,levels});
        }
      }
    }
    let size=result.size;
    for(const [key,tile] of pending) {
      const empty=tile.levels.every(h=>h===0);
      if(empty&&result.has(key))size--;
      else if(!empty&&!result.has(key))size++;
    }
    if(size>budget)continue;
    for(const [key,tile] of pending) {
      if(tile.levels.every(h=>h===0)){voidCells.add(key);result.delete(key);}
      else {result.set(key,tile);stackedTiles++;}
    }
  }
  return {tiles:[...result.values()].sort((a,b)=>a.y-b.y||a.z-b.z||a.x-b.x),stackedTiles,voidCells};
}
