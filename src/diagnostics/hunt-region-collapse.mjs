// Seed 7 phone fixture at the authored Entry → Woodland Trail connector.
// Only the opt-in diagnostic adds stone. WorldGen still owns the underlying route.
export const REGION_COLLAPSE_ENTRY=Object.freeze({x:0,z:-10});
export const REGION_COLLAPSE_SUPPORT=Object.freeze({x:6,y:7,z:-20});

export function huntRegionCollapseScaffold(layout,save){
  const link=layout.links.find(item=>[item.fromId,item.toId].includes(layout.entryRegionId)&&
    [item.fromId,item.toId].includes('region-woodland-trail'));
  const entry=layout.regions.find(region=>region.id===layout.entryRegionId);
  const seamZ=REGION_COLLAPSE_SUPPORT.z;
  if(entry?.bounds.minZ!==seamZ||link?.bounds.maxZ!==seamZ-1)return [];
  const cells=[];
  const add=(x,y,z)=>{
    const band=z===seamZ?entry:link;
    if(!save.removedCells.has([x,y,z].join(','))){
      cells.push({owner:band.id+':cell:8:'+Math.floor(x/8)+':'+Math.floor(z/8),x,y,z,material:3});
    }
  };
  for(let x=4;x<=6;x++)for(let z=seamZ-1;z<=seamZ;z++)add(x,9,z);
  for(let y=6;y<=8;y++)add(REGION_COLLAPSE_SUPPORT.x,y,seamZ);
  return cells;
}
