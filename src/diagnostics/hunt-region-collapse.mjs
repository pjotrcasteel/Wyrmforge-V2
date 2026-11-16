// Seed 7 phone fixture at the authored Entry → Woodland Trail connector.
// Only the opt-in diagnostic adds the shelf. WorldGen still owns the underlying route.
export const REGION_COLLAPSE_ENTRY=Object.freeze({x:0,z:-10});
export const REGION_COLLAPSE_SUPPORT=Object.freeze({x:6,y:7,z:-20});

export function huntRegionCollapseScaffold(layout,save,{mixed=false,large=false,layers=1,longSpan=false,shaped=false,split=false}={}){
  const link=layout.links.find(item=>[item.fromId,item.toId].includes(layout.entryRegionId)&&
    [item.fromId,item.toId].includes('region-woodland-trail'));
  const entry=layout.regions.find(region=>region.id===layout.entryRegionId);
  const trail=layout.regions.find(region=>region.id==='region-woodland-trail');
  const seamZ=REGION_COLLAPSE_SUPPORT.z;
  if(entry?.bounds.minZ!==seamZ||link?.bounds.maxZ!==seamZ-1)return [];
  const cells=[];
  const add=(x,y,z,material=3)=>{
    const band=z===seamZ?entry:z>=link.bounds.minZ?link:trail;
    if(!band||z<band.bounds.minZ||z>band.bounds.maxZ)return;
    if(!save.removedCells.has([x,y,z].join(','))){
      const shape=shaped&&(x===4||(split&&x===8))&&y===8+layers&&z===seamZ-1?
        {levels:Array.from({length:100},(_,index)=>1+index%10)}:{};
      cells.push({owner:band.id+':cell:8:'+Math.floor(x/8)+':'+Math.floor(z/8),x,y,z,material,...shape});
    }
  };
  const maxX=large?11:6;
  const minZ=seamZ-(longSpan?12:large?8:1);
  for(let x=4;x<=maxX;x++){
    if(split&&x===7)continue;
    for(let z=minZ;z<=seamZ;z++){
      for(let y=9;y<9+layers;y++)add(x,y,z,mixed?1+(x-4)%3:3);
    }
  }
  for(let y=6;y<=8;y++){
    add(REGION_COLLAPSE_SUPPORT.x,y,seamZ);
    if(split)add(8,y,seamZ);
  }
  return cells;
}
