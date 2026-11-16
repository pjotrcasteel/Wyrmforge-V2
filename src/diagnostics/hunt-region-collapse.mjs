// Seed 7 phone fixture at the authored Entry → Woodland Trail connector.
// Only the opt-in diagnostic adds stone. WorldGen still owns the underlying route.
export const REGION_COLLAPSE_ENTRY=Object.freeze({x:0,z:-10});
export const REGION_COLLAPSE_SUPPORT=Object.freeze({x:6,y:7,z:-20});

export function huntRegionCollapseScaffold(layout,save,{mixed=false,large=false,layers=1}={}){
  const link=layout.links.find(item=>[item.fromId,item.toId].includes(layout.entryRegionId)&&
    [item.fromId,item.toId].includes('region-woodland-trail'));
  const entry=layout.regions.find(region=>region.id===layout.entryRegionId);
  const seamZ=REGION_COLLAPSE_SUPPORT.z;
  if(entry?.bounds.minZ!==seamZ||link?.bounds.maxZ!==seamZ-1)return [];
  const cells=[];
  const add=(x,y,z,material=3)=>{
    const band=z===seamZ?entry:link;
    if(!save.removedCells.has([x,y,z].join(','))){
      cells.push({owner:band.id+':cell:8:'+Math.floor(x/8)+':'+Math.floor(z/8),x,y,z,material});
    }
  };
  const maxX=large?11:6;
  const minZ=seamZ-(large?8:1);
  for(let x=4;x<=maxX;x++){
    for(let z=minZ;z<=seamZ;z++){
      for(let y=9;y<9+layers;y++)add(x,y,z,mixed?1+(x-4)%3:3);
    }
  }
  for(let y=6;y<=8;y++)add(REGION_COLLAPSE_SUPPORT.x,y,seamZ);
  return cells;
}
