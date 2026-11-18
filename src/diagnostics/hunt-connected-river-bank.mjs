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
      // Temporary upstream head can exceed the river's sustainable
      // physical water level while the initial seed redistributes. Selecting
      // a high bank from that transient head produced false breach targets:
      // the 2m Fireball left solid stone above the settled river surface.
      // A 2m genuine crater must reach the authored stone bed + up to 40cm
      // of resident water, never the temporary high-water mark.
      const bankTop=hit.cell.y+1;
      const settledHead=cell.y+Math.min(.4,river.depth/10);
      const rise=bankTop-settledHead;
      if(rise<=0||rise>1.95)continue;
      if(!chosen||rise<chosen.rise){
        chosen={hit,shore:{x,z},river:{x:cell.x,z:cell.z,y:cell.y},rise};
      }
    }
  }
  if(!chosen){
    throw new Error('No physically breachable low riverbank: Fireball depth cannot open the higher dry banks');
  }
  return Object.freeze({
    hit:chosen.hit,shore:Object.freeze(chosen.shore),
    river:Object.freeze(chosen.river),regionId
  });
}
