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
      const bankTop=hit.cell.y+1,head=river.surfaceY;
      // A Fireball crater can flood only if its ACTUAL new floor connects
      // below the neighboring water head. Picking the first arbitrarily high
      // bank (3m above the river) led to fake "wet somewhere" acceptance:
      // it remained a dry, intact 1m stone wall after the shot.
      // Prefer a shallow, dry, already physical bank. No terrain edits are
      // performed here and no water is seeded or teleported.
      const rise=bankTop-head;
      if(rise<=0||rise>1.25)continue;
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
