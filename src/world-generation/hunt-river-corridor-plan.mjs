// WorldGen-owned, bounded route PROPOSAL across a real authored river/link.
// This is not a fluidLayout: a later WorldGen/Voxel pass must physically
// carve/verify every planned bed cell before Water V2 may transfer anything.
import {containsHuntLandform} from './hunt-landform-footprint.mjs';

export const HUNT_RIVER_CORRIDOR_PLAN_SCHEMA='wyrmforge.hunt-river-corridor-plan.v1';
const STEPS=[[0,-1],[1,0],[0,1],[-1,0]];
const key=({x,z})=>x+','+z;
const distanceToRect=(p,b)=>Math.max(b.minX-p.x,0,p.x-b.maxX)+
  Math.max(b.minZ-p.z,0,p.z-b.maxZ);

function orderedApproaches(cells,link,reach){
  return cells
    .filter(p=>distanceToRect(p,link.bounds)<=reach)
    .sort((a,b)=>distanceToRect(a,link.bounds)-distanceToRect(b,link.bounds)||
      a.z-b.z||a.x-b.x).slice(0,8);
}

function search(from,to,bands,maxLength){
  const [a,link,b]=bands;
  const bandAt=(x,z)=>containsHuntLandform(link,x,z)?link.id:
    containsHuntLandform(a,x,z)?a.id:
    containsHuntLandform(b,x,z)?b.id:null;
  const seen=new Map([[key(from),null]]);
  const points=[{x:from.x,z:from.z}];
  const target=key(to);
  for(let i=0;i<points.length&&points.length<=4096;i++){
    const p=points[i],id=key(p);
    if(id===target){
      const path=[];
      for(let cell=id;cell!==null;cell=seen.get(cell)){
        const [x,z]=cell.split(',').map(Number);
        path.push(Object.freeze({x,z,bandId:bandAt(x,z)}));
      }
      path.reverse();
      if(path.length>maxLength||!path.some(cell=>cell.bandId===link.id))return null;
      return Object.freeze(path);
    }
    for(const [dx,dz]of STEPS){
      const x=p.x+dx,z=p.z+dz,next=key({x,z});
      if(seen.has(next)||!bandAt(x,z))continue;
      seen.set(next,id);
      points.push({x,z});
    }
  }
  return null;
}

export function planHuntRiverCorridor(graph,linkId,{
  maxEndpointReach=9,maxLength=80
}={}){
  if(!graph?.layout?.links||typeof graph.region!=='function'||
      !Number.isSafeInteger(maxEndpointReach)||maxEndpointReach<1||
      maxEndpointReach>16||!Number.isSafeInteger(maxLength)||
      maxLength<10||maxLength>128){
    throw new TypeError('Expected a bounded authored WorldGen water-corridor query');
  }
  const link=graph.layout.links.find(item=>item.id===linkId);
  if(!link)throw new RangeError('Unknown authored Hunt link');
  const from=graph.layout.regions.find(item=>item.id===link.fromId);
  const to=graph.layout.regions.find(item=>item.id===link.toId);
  const a=graph.region(from.id).fluidLayout?.riverChannels?.[0];
  const b=graph.region(to.id).fluidLayout?.riverChannels?.[0];
  if(a?.kind!=='water'||b?.kind!=='water')return null;
  const starts=orderedApproaches(a.floor,link,maxEndpointReach);
  const ends=orderedApproaches(b.floor,link,maxEndpointReach);
  if(!starts.length||!ends.length)return null;
  const pairs=[];
  for(const s of starts)for(const e of ends){
    pairs.push({s,e,cost:Math.abs(s.x-e.x)+Math.abs(s.z-e.z)});
  }
  pairs.sort((x,y)=>x.cost-y.cost||
    x.s.z-y.s.z||x.s.x-y.s.x||x.e.z-y.e.z||x.e.x-y.e.x);
  for(const {s,e}of pairs.slice(0,20)){
    const path=search(s,e,[from,link,to],maxLength);
    if(!path)continue;
    return Object.freeze({
      schema:HUNT_RIVER_CORRIDOR_PLAN_SCHEMA,linkId:link.id,
      kind:'water',status:'proposed-unapplied',
      fromRegionId:from.id,toRegionId:to.id,
      upstream: s.y>=e.y?from.id:to.id,
      sourceFloorY:s.y,targetFloorY:e.y,
      points:path
    });
  }
  // No fictional water connection: caller may keep independently rendered
  // rivers, but cannot claim a cross-region physical route exists.
  return null;
}
