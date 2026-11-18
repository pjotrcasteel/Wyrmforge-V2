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
  for(const cell of channel.floor){
    if((fluid.sample(cell.x,cell.z)?.depth??0)<1)continue;
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
      if(!hit?.cell||Math.abs(hit.cell.y+1-cell.y)>3)continue;
      return Object.freeze({
        hit,shore:Object.freeze({x,z}),
        river:Object.freeze({x:cell.x,z:cell.z,y:cell.y}),
        regionId
      });
    }
  }
  throw new Error('No dry physical bank touches a wet authored Water V2 river');
}
