// Diagnostic-only selection of a REAL published Voxel bank adjacent to a
// genuinely wet authored WorldGen river. This module never writes terrain,
// seeds liquid, bypasses spell collision or substitutes a render surface.
const key=(x,z)=>x+','+z;
const DELTAS=Object.freeze([[1,0],[-1,0],[0,1],[0,-1]]);

export function findConnectedRiverBankTarget(graph,terrain,fluid,{
  regionId='region-entry'
}={}){
  if(typeof graph?.region!=='function'||
      typeof terrain?.raycast!=='function'||
      typeof fluid?.sample!=='function'){
    throw new TypeError('Expected authoritative WorldGen, Voxel and Water V2 ports');
  }
  const band=graph.region(regionId);
  const channel=band.fluidLayout?.riverChannels?.find(item=>item.kind==='water');
  if(!channel?.floor?.length){
    throw new Error('No physically authored water channel in '+regionId);
  }
  const authored=new Set(channel.floor.map(cell=>key(cell.x,cell.z)));
  let chosen=null;
  let mismatchedFloors=0,highBanks=0,eligible=0;
  for(const cell of channel.floor){
    const river=fluid.sample(cell.x,cell.z);
    if(!river?.depth||!Number.isFinite(river.surfaceY))continue;
    for(const [dx,dz] of DELTAS){
      const x=cell.x+dx,z=cell.z+dz;
      if(authored.has(key(x,z))||(fluid.sample(x,z)?.depth??0)>0||
          x<band.bounds.minX||x>band.bounds.maxX||
          z<band.bounds.minZ||z>band.bounds.maxZ){
        continue;
      }
      const hit=terrain.raycast({
        origin:[x+.5,30,z+.5],direction:[0,-1,0],maxDistance:80
      });
      if(!hit?.cell)continue;
      // Raycasts sample the actual 10cm micro-surface. Water V2 currently
      // holds one full-metre column per footprint cell, and MUST use the
      // authoritative Voxel top-of-solid floor. On tapered microtiles the
      // raycast can hit BELOW a partly occupied upper metre; a two-metre
      // crater at that hit Y leaves the upper coarse solid intact, so no
      // physical connection to the river is made. This was the iPhone/
      // browser failure: ray hit was low, water floor remained 5-6m high.
      const bank=fluid.sample(x,z);
      if(!bank||bank.floorY!==hit.cell.y+1){
        mismatchedFloors++;
        continue;
      }
      // Use the authored stone grade + at most 40cm of initial head. A
      // transient river pool must never make a high uncut bank eligible.
      const settledHead=cell.y+Math.min(.4,river.depth/10);
      const rise=bank.floorY-settledHead;
      if(rise<=0||rise>1.95){
        highBanks++;
        continue;
      }
      eligible++;
      if(!chosen||rise<chosen.rise){
        chosen={hit,shore:{x,z},river:{x:cell.x,z:cell.z,y:cell.y},rise};
      }
    }
  }
  if(!chosen){
    throw new Error('No physical 2m Fireball breach candidate: '+JSON.stringify({
      mismatchedFloors,highBanks,eligible,riverCells:channel.floor.length
    }));
  }
  return Object.freeze({
    hit:chosen.hit,shore:Object.freeze(chosen.shore),
    river:Object.freeze(chosen.river),regionId
  });
}
