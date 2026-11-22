// Navigation V2 diagnostic: actor-sized reachability, NOT World Generation.
// Consumes only the public V2 Terrain Port (raycast, actorOverlaps, sweepActor),
// plus an injected character traversal policy. Never uses a heightmap,
// rendered mesh, WebGL, enemy AI or a private VoxelWorld implementation.
import {
  DEFAULT_TRAVERSAL_PROFILE,classifyTraversalHeight
} from './character-traversal-policy.mjs';

export const ACTOR_REACHABILITY_SCHEMA='wyrmforge.actor-reachability.v1';
const SCALE=10000; // Each damaging health point outweighs any <=2500-step detour
const SKIN=0.002;

class MinQueue {
  #data=[];
  push(id,cost) {
    const a=this.#data;
    let i=a.length;
    a.push({id,cost});
    while(i>0) {
      const parent=(i-1)>>1;
      if(a[parent].cost<=cost)break;
      a[i]=a[parent];i=parent;
    }
    a[i]={id,cost};
  }
  pop() {
    const a=this.#data;
    const best=a[0],last=a.pop();
    if(a.length) {
      let i=0;
      while(2*i+1<a.length) {
        let child=2*i+1;
        if(child+1<a.length && a[child+1].cost<a[child].cost)child++;
        if(a[child].cost>=last.cost)break;
        a[i]=a[child];i=child;
      }
      a[i]=last;
    }
    return best;
  }
  get size() {return this.#data.length;}
}

function validate({terrain,bounds,start,targets,maxCells}) {
  if(!terrain || typeof terrain.raycast!=='function' ||
      typeof terrain.actorOverlaps!=='function' ||
      typeof terrain.sweepActor!=='function' ||
      !bounds || ![bounds.minX,bounds.maxX,bounds.minZ,bounds.maxZ,
        bounds.minY,bounds.maxY].every(Number.isSafeInteger) ||
      !Number.isSafeInteger(start?.x) || !Number.isSafeInteger(start?.z) ||
      !Array.isArray(targets) ||
      !Number.isSafeInteger(maxCells) || maxCells<1 || maxCells>2500) {
    throw new TypeError('Reachability needs a bounded public Terrain Port and points');
  }
  const width=bounds.maxX-bounds.minX+1;
  const depth=bounds.maxZ-bounds.minZ+1;
  if(width<1 || depth<1 || width*depth>maxCells) {
    throw new RangeError('Traversal site cell budget exceeded');
  }
  if(start.x<bounds.minX || start.x>bounds.maxX ||
      start.z<bounds.minZ || start.z>bounds.maxZ) {
    throw new RangeError('Traversal entry outside terrain bounds');
  }
  return {width,depth};
}

export function analyzeCharacterReachability({
  terrain,bounds,start,targets=[],
  profile=DEFAULT_TRAVERSAL_PROFILE,maxCells=2500
}) {
  const {width,depth}=validate({terrain,bounds,start,targets,maxCells});
  const count=width*depth;
  const at=(x,z)=>(z-bounds.minZ)*width+x-bounds.minX;
  const inside=(x,z)=>x>=bounds.minX && x<=bounds.maxX &&
    z>=bounds.minZ && z<=bounds.maxZ;
  const heights=new Float64Array(count);
  const standing=new Uint8Array(count);
  const reachCost=new Float64Array(count).fill(Infinity);
  const parents=new Int32Array(count).fill(-1);
  const modes=new Array(count).fill('blocked');
  const damage=new Uint8Array(count);
  const startingY=bounds.maxY+5;
  const rayDistance=startingY-bounds.minY+8;

  // A node exists only when the actual character volume can stand there.
  // Fractional microvoxels are measured through the public ray/overlap port.
  for(let z=bounds.minZ;z<=bounds.maxZ;z++) {
    for(let x=bounds.minX;x<=bounds.maxX;x++) {
      const i=at(x,z);
      const hit=terrain.raycast({
        origin:[x+0.5,startingY,z+0.5],
        direction:[0,-1,0],
        maxDistance:Math.min(128,rayDistance)
      });
      if(!hit) continue;
      const top=hit.point.y;
      // A broad actor sometimes straddles a 10cm shoulder. Find the first
      // clear, supported feet height, without pretending the terrain is flat.
      for(let tenth=0;tenth<=5;tenth++) {
        const y=Math.round((top+SKIN+tenth*0.1)*1000)/1000;
        const actor={x:x+0.5,y,z:z+0.5};
        if(terrain.actorOverlaps(actor)) continue;
        if(terrain.sweepActor(actor,'y',-0.06).collided) {
          standing[i]=1;heights[i]=y;break;
        }
      }
    }
  }

  const origin=at(start.x,start.z);
  if(standing[origin]) {
    reachCost[origin]=0;
    modes[origin]='entry';
    const queue=new MinQueue();
    queue.push(origin,0);
    while(queue.size) {
      const current=queue.pop();
      if(current.cost!==reachCost[current.id])continue;
      const x=bounds.minX+current.id%width;
      const z=bounds.minZ+Math.floor(current.id/width);
      for(const [dx,dz] of [[1,0],[-1,0],[0,1],[0,-1]]) {
        const nx=x+dx,nz=z+dz;
        if(!inside(nx,nz))continue;
        const next=at(nx,nz);
        if(!standing[next])continue;
        const movement=classifyTraversalHeight(
          heights[current.id],heights[next],profile
        );
        if(!movement.passable)continue;
        // A hop may first rise vertically against the ledge; check the
        // actual actor volume at and above the higher end along the crossing.
        const clearanceY=Math.max(heights[current.id],heights[next])+0.01;
        let clear=true;
        for(const fraction of [0.25,0.5,0.75]) {
          if(terrain.actorOverlaps({
            x:x+0.5+dx*fraction,y:clearanceY,z:z+0.5+dz*fraction
          })) {clear=false;break;}
        }
        if(!clear)continue;
        const cost=current.cost+1+movement.damage*SCALE;
        if(cost>=reachCost[next])continue;
        reachCost[next]=cost;
        parents[next]=current.id;
        modes[next]=movement.type;
        damage[next]=movement.damage;
        queue.push(next,cost);
      }
    }
  }
  const cells=[];
  let walkable=0,reachable=0,safe=0,atRisk=0;
  for(let i=0;i<count;i++) {
    const x=bounds.minX+i%width;
    const z=bounds.minZ+Math.floor(i/width);
    const valid=Boolean(standing[i]);
    const reached=Number.isFinite(reachCost[i]);
    const injury=reached?Math.floor(reachCost[i]/SCALE):0;
    if(valid)walkable++;
    if(reached) {reachable++;if(injury)atRisk++;else safe++;}
    cells.push(Object.freeze({
      x,z,y:valid?Math.round(heights[i]*1000)/1000:null,
      state:!valid?'blocked':!reached?'unreachable':
        injury?'damaging':'safe',
      entryCost:reached?Math.round(reachCost[i]%SCALE):null,
      accumulatedFallDamage:injury
    }));
  }
  function routeTo(x,z) {
    if(!inside(x,z))return null;
    let i=at(x,z);
    if(!Number.isFinite(reachCost[i]))return null;
    const route=[];
    while(i>=0) {
      const cell=cells[i];
      route.push(Object.freeze({
        x:cell.x,z:cell.z,y:cell.y,
        movement:modes[i],damage:damage[i]
      }));
      i=parents[i];
    }
    route.reverse();
    return Object.freeze(route);
  }
  const auditTargets=targets.map(target=>{
    const accessible=inside(target.x,target.z) &&
      Number.isFinite(reachCost[at(target.x,target.z)]);
    return Object.freeze({
      id:target.id ?? target.x+','+target.z,
      x:target.x,z:target.z,reachable:accessible,
      damage:accessible?cells[at(target.x,target.z)].accumulatedFallDamage:null
    });
  });
  return Object.freeze({
    schema:ACTOR_REACHABILITY_SCHEMA,
    worldRevision:terrain.revision,
    bounds:Object.freeze({...bounds}),
    entry:Object.freeze({...start}),
    totalCells:count,standableCells:walkable,reachableCells:reachable,
    safelyReachableCells:safe,damageRiskCells:atRisk,
    unreachableCells:walkable-reachable,
    targets:Object.freeze(auditTargets),
    cells:Object.freeze(cells),
    routeTo
  });
}
