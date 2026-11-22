// Coordinate contract for authored Hunt sites, not a new terrain generator.
// Preserve every logical region/link/role from the World Map expedition plan.
// Translate the existing 40m authored Wet Forest footprint into world space,
// leaving an 8m strip for each physical connector. No extra voxel authority.
import {regionLandform,connectorLandform} from './hunt-landform-footprint.mjs';

const gap=8;

export function composeAuthoredHuntLayout(plan,entrySite) {
  if(plan?.recipe?.kind!=='wet-forest'||entrySite?.recipe?.kind!=='wet-forest'||
      entrySite.recipe.seed!==plan.recipe.seed||
      entrySite.recipe.worldRevision!==plan.recipe.worldRevision||
      entrySite.recipe.chunkEdge!==plan.recipe.chunkEdge||
      entrySite.recipe.corruption!==plan.recipe.corruption)
    throw new Error('Expected matching authored Wet Forest expedition recipe');
  const source=entrySite.layout.footprint;
  const width=source.maxX-source.minX+1,depth=source.maxZ-source.minZ+1;
  const entry=plan.regions.find(r=>r.id===plan.entryRegionId);
  if(width!==40||depth!==40||!entry)throw new Error('Invalid authored site extent');
  const regions=plan.regions.map(region=>{
    const offsetX=(region.gridX-entry.gridX)*(width+gap);
    const offsetZ=(region.gridZ-entry.gridZ)*(depth+gap);
    const bounds={minX:source.minX+offsetX,maxX:source.maxX+offsetX,
      minZ:source.minZ+offsetZ,maxZ:source.maxZ+offsetZ};
    const ports=region.ports.map(port=>{
      const x=port.direction==='west'?bounds.minX:port.direction==='east'?bounds.maxX:offsetX;
      const z=port.direction==='north'?bounds.minZ:port.direction==='south'?bounds.maxZ:offsetZ;
      return Object.freeze({...port,at:Object.freeze({x,z})});
    });
    const opportunities=region.opportunities.map(item=>Object.freeze({...item,
      at:Object.freeze({x:item.at.x-region.origin.x+offsetX,
        z:item.at.z-region.origin.z+offsetZ})}));
    const band={id:region.id,role:region.role,biome:region.biome,
      offsetX,offsetZ,bounds:Object.freeze(bounds),ports:Object.freeze(ports),
      opportunities:Object.freeze(opportunities)};
    return Object.freeze({...band,landform:regionLandform(band,plan.recipe.seed)});
  });
  const byId=new Map(regions.map(r=>[r.id,r]));
  const links=plan.links.map(link=>{
    const from=byId.get(link.fromId),to=byId.get(link.toId);
    const fromPort=from.ports.find(p=>p.id===link.fromPort.id);
    const toPort=to.ports.find(p=>p.id===link.toPort.id);
    const a=from.bounds,b=to.bounds;
    const horizontal=['east','west'].includes(fromPort.direction);
    const rectangle=horizontal?{
      minX:Math.min(a.maxX,b.maxX)+1,maxX:Math.max(a.minX,b.minX)-1,
      minZ:a.minZ,maxZ:a.maxZ
    }:{
      minX:a.minX,maxX:a.maxX,
      minZ:Math.min(a.maxZ,b.maxZ)+1,maxZ:Math.max(a.minZ,b.minZ)-1
    };
    if((horizontal?rectangle.maxX-rectangle.minX:rectangle.maxZ-rectangle.minZ)!==gap-1)
      throw new Error('Noncontiguous authored Hunt connector');
    const band={...link,fromPort,toPort,bounds:Object.freeze(rectangle)};
    return Object.freeze({...band,landform:connectorLandform(band,plan.recipe.seed)});
  });
  return Object.freeze({schema:'wyrmforge.authored-hunt-layout.v1',planHash:plan.hash,
    entryRegionId:plan.entryRegionId,exitRegionId:plan.exitRegionId,
    regions:Object.freeze(regions),links:Object.freeze(links),
    // Coordinate planning alone never establishes physical path acceptance.
    physicalTraversalVerified:false});
}
