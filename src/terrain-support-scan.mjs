// Read-only V2 structural support scan. Unknown residency is distinct from air.
const candidateOrigins=new WeakMap();
const FACES=[[1,0,0],[-1,0,0],[0,1,0],[0,-1,0],[0,0,1],[0,0,-1]];
const key=(x,y,z)=>x+','+y+','+z;
const order=(a,b)=>a.x-b.x||a.y-b.y||a.z-b.z;
const bounded=(value,limit)=>Number.isSafeInteger(value)&&value>0&&value<=limit;

export function isCurrentTerrainSupportCandidate(world,candidate){
  const origin=candidateOrigins.get(candidate);
  return origin?.world===world&&origin.revision===world.revision;
}

export function scanTerrainSupport(world,removed,{
  cohesive,anchors,isKnown,foundationY=null,maxReads=2048,maxCells=128,maxExtent=12
}){
  if(!Array.isArray(removed)||removed.length>256||!bounded(maxReads,8192)||
      !bounded(maxCells,256)||!bounded(maxExtent,32))throw new RangeError('Invalid support scan limits');
  if(foundationY!==null&&!Number.isSafeInteger(foundationY))throw new TypeError('Invalid foundation level');
  if(typeof isKnown!=='function'||!(cohesive instanceof Set)||!(anchors instanceof Set)||
      cohesive.size>255||anchors.size>255||cohesive.has(0)||anchors.has(0)||[...cohesive].some(id=>anchors.has(id))){
    throw new TypeError('Support scan requires explicit residency and distinct material classes');
  }
  const worldRevision=world.revision;
  const reads=new Map(),visited=new Set(),anchored=new Set(),candidates=[];
  let unknown=false,oversized=0;
  const limit=Symbol('support read budget');

  function sample(x,y,z){
    const id=key(x,y,z);
    if(!reads.has(id)){
      if(reads.size===maxReads)throw limit;
      reads.set(id,isKnown(x,y,z)?world.get(x,y,z):null);
    }
    return reads.get(id);
  }

  const isAnchor=(material,y)=>anchors.has(material)||(y===foundationY&&cohesive.has(material));

  function groundedColumn(x,y,z){
    // Most authored ground has a direct path to bedrock. Probe that path
    // before exploring laterally through a wide, connected terrain mass.
    for(let depth=1;depth<=16;depth++){
      const belowY=y-depth;
      const material=sample(x,belowY,z);
      if(isAnchor(material,belowY)||anchored.has(key(x,belowY,z)))return true;
      if(!cohesive.has(material))break;
    }
    return false;
  }

  function scan(x,y,z){
    const id=key(x,y,z);
    const material=sample(x,y,z);
    if(material===null)unknown=true;
    if(!cohesive.has(material)||visited.has(id))return;
    const queue=[{x,y,z,material}];
    const min={x,y,z},max={x,y,z};
    visited.add(id);
    let incomplete=false;
    for(let i=0;i<queue.length;i++){
      const cell=queue[i];
      if(isAnchor(cell.material,cell.y)||groundedColumn(cell.x,cell.y,cell.z)){
        for(const item of queue)anchored.add(key(item.x,item.y,item.z));
        return;
      }
      for(const [dx,dy,dz] of FACES){
        const nx=cell.x+dx,ny=cell.y+dy,nz=cell.z+dz;
        const neighbor=sample(nx,ny,nz);
        const neighborId=key(nx,ny,nz);
        if(neighbor===null)incomplete=true;
        if(isAnchor(neighbor,ny)||anchored.has(neighborId)){
          // Every discovered cell is connected to this anchor through the
          // queue. Keep that proof so nearby seeds avoid flooding solid ground.
          for(const item of queue)anchored.add(key(item.x,item.y,item.z));
          return;
        }
        if(!cohesive.has(neighbor)||visited.has(neighborId))continue;
        visited.add(neighborId);
        queue.push({x:nx,y:ny,z:nz,material:neighbor});
        min.x=Math.min(min.x,nx);min.y=Math.min(min.y,ny);min.z=Math.min(min.z,nz);
        max.x=Math.max(max.x,nx);max.y=Math.max(max.y,ny);max.z=Math.max(max.z,nz);
      }
    }
    if(incomplete){unknown=true;return;}
    if(queue.length>maxCells||Math.max(max.x-min.x,max.y-min.y,max.z-min.z)>=maxExtent){
      oversized++;
      return;
    }
    candidates.push({cells:queue.sort(order),bounds:{min,max}});
  }

  const seeds=removed.map(cell=>{
    if(![cell?.x,cell?.y,cell?.z].every(n=>Number.isSafeInteger(n)&&Math.abs(n)<=1_000_000)){
      throw new TypeError('Support scan requires integer removed cells');
    }
    return cell;
  }).sort(order);
  try{
    for(const {x,y,z} of seeds){
      const material=sample(x,y,z);
      if(material===null)unknown=true;
      if(material!==0)continue;
      for(const [dx,dy,dz] of FACES)scan(x+dx,y+dy,z+dz);
    }
  }catch(error){
    if(error!==limit)throw error;
    return {worldRevision,status:'budget-exhausted',reads:reads.size,oversized,candidates:[]};
  }
  if(world.revision!==worldRevision){
    return {worldRevision,status:'stale',reads:reads.size,oversized,candidates:[]};
  }
  candidates.sort((a,b)=>order(a.cells[0],b.cells[0]));
  for(const candidate of candidates){
    for(const cell of candidate.cells)Object.freeze(cell);
    Object.freeze(candidate.cells);
    Object.freeze(candidate.bounds.min);
    Object.freeze(candidate.bounds.max);
    Object.freeze(candidate.bounds);
    Object.freeze(candidate);
    candidateOrigins.set(candidate,{world,revision:worldRevision});
  }
  return {worldRevision,status:unknown?'partial-coverage':'complete',reads:reads.size,oversized,candidates};
}
