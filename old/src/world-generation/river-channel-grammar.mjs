// WorldGen owns continuous beds and banks. Materials consumes their ordered
// channel descriptors. The recipe explicitly chooses the river's contents.
import {protectedTerrainCells} from './protected-terrain.mjs';
import {siteNoise} from './map-kinds.mjs';

const NEIGHBORS=[[0,-1],[1,0],[0,1],[-1,0]];
const key=(x,z)=>x+','+z;
const at=(r,x,z)=>(z+r)*r*2+x+r;

// A bounded Dijkstra search joins the two bankside endpoints through legal
// cells. Its preferred contour meanders smoothly with the seeded terrain.
function traceChannel(cells,source,sink,radius,seed,side) {
  const costs=new Map([[key(source.x,source.z),0]]);
  const parents=new Map();
  const pending=new Set(costs.keys());
  const goal=key(sink.x,sink.z);
  while(pending.size){
    let current;
    let best=Infinity;
    for(const id of pending)if(costs.get(id)<best){current=id;best=costs.get(id);}
    pending.delete(current);
    if(current===goal)break;
    const point=cells.get(current);
    for(const [dx,dz] of NEIGHBORS){
      const id=key(point.x+dx,point.z+dz);
      const next=cells.get(id);
      if(!next)continue;
      const preferred=side*(radius*.60+3.3*Math.sin(next.z*.24+seed*.03));
      const uphill=Math.max(0,next.y-point.y);
      const cost=best+1+Math.abs(next.x-preferred)*.9+uphill*.4;
      if(cost>=(costs.get(id)??Infinity))continue;
      costs.set(id,cost);
      parents.set(id,current);
      pending.add(id);
    }
  }
  if(!costs.has(goal))return [];
  const path=[];
  for(let id=goal;id;id=parents.get(id))path.push(cells.get(id));
  return path.reverse();
}

function chooseCourse(plan,heights,protectedCells,side) {
  const {radius,seed}=plan.recipe;
  const cells=new Map();
  for(let z=-radius+1;z<radius-1;z++)for(let x=-radius+1;x<radius-1;x++){
    if(x*side<5||protectedCells.has(key(x,z)))continue;
    cells.set(key(x,z),{x,z,y:heights[at(radius,x,z)]});
  }
  if(cells.size<20)return [];
  const remaining=new Set(cells.keys());
  let longest=[];
  while(remaining.size){
    const group=[cells.get(remaining.values().next().value)];
    remaining.delete(key(group[0].x,group[0].z));
    for(let i=0;i<group.length;i++)for(const [dx,dz] of NEIGHBORS){
      const id=key(group[i].x+dx,group[i].z+dz);
      if(remaining.delete(id))group.push(cells.get(id));
    }
    const span=points=>Math.max(...points.map(p=>p.z))-Math.min(...points.map(p=>p.z));
    if(!longest.length||span(group)>span(longest))longest=group;
  }
  const sorted=longest.sort((a,b)=>a.z-b.z||
    Math.abs(a.x-side*radius*.60)-Math.abs(b.x-side*radius*.60));
  const north=sorted[0];
  const southZ=sorted.at(-1).z;
  const south=sorted.find(point=>point.z===southZ);
  const source=north.y>=south.y?north:south;
  const sink=source===north?south:north;
  return traceChannel(cells,source,sink,radius,seed,side);
}

export function composeRiverChannels({plan,heights,surfaces}) {
  if(!plan.recipe.river)return null;
  const {radius,seed,river}=plan.recipe;
  const protectedCells=protectedTerrainCells(plan,radius);
  const courses=[-1,1].map(side=>chooseCourse(plan,heights,protectedCells,side));
  courses.sort((a,b)=>b.length-a.length);
  const course=courses[0];
  if(course.length<12)throw new Error('River recipe has no continuous safe channel');
  const original=heights.slice();
  const bed=new Map();
  let grade=30;
  const nodes=course.map((point,index)=>{
    grade=Math.min(grade,point.y-1);
    // Quantized shelves create pools joined by downhill steps. The channel
    // never adds terrain above the original hillside.
    const next=course[Math.min(index+2,course.length-1)];
    const previous=course[Math.max(0,index-2)];
    return {...point,y:Math.max(0,grade),flowX:next.x-previous.x,flowZ:next.z-previous.z};
  });
  for(const [index,node] of nodes.entries()){
    const pool=Math.sin(index/(nodes.length-1)*Math.PI*3)**6;
    const width=1.7+1.2*siteNoise(seed,node.x,node.z,7,114)+1.3*pool;
    for(let dz=-4;dz<=4;dz++)for(let dx=-4;dx<=4;dx++){
      const x=node.x+dx,z=node.z+dz;
      if(x<-radius||x>=radius||z<-radius||z>=radius||
        protectedCells.has(key(x,z))||Math.hypot(dx,dz)>width)continue;
      const id=key(x,z);
      const distance=dx*dx+dz*dz;
      const old=bed.get(id);
      if(old&&old.distance<=distance)continue;
      bed.set(id,{x,z,y:node.y,flowX:node.flowX,flowZ:node.flowZ,distance});
    }
  }
  // A shallow side shelf keeps pools broad and links them to their center
  // course. Centerline grades remain the downstream authority.
  const floor=[...bed.values()].map(cell=>{
    const i=at(radius,cell.x,cell.z);
    heights[i]=Math.min(original[i]-1,cell.y);
    heights[i]=Math.max(0,heights[i]);
    surfaces[i]=3;
    return Object.freeze({x:cell.x,z:cell.z,y:heights[i]+1,flowX:cell.flowX,flowZ:cell.flowZ});
  });
  return Object.freeze({
    kind:river,
    nodes:Object.freeze(nodes.map(({x,y,z})=>Object.freeze({x,y:y+1,z}))),
    floor:Object.freeze(floor),
    from:Object.freeze({x:nodes[0].x,z:nodes[0].z}),
    to:Object.freeze({x:nodes.at(-1).x,z:nodes.at(-1).z})
  });
}
