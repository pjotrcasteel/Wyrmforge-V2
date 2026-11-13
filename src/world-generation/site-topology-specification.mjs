// Specification pattern: prove the generated site remains navigable before
// any Voxel V2 world is activated. This is a local height/route audit, not AI.
export const SITE_TOPOLOGY_SCHEMA='wyrmforge.world-site-topology.v1';

function index(radius,x,z) {
  const size=radius*2;
  return (z+radius)*size+(x+radius);
}
function checkPoint(point,radius) {
  return point && Number.isSafeInteger(point.x) &&
    Number.isSafeInteger(point.z) &&
    point.x>=-radius && point.x<radius &&
    point.z>=-radius && point.z<radius;
}

export function specifySiteTopology({radius,heights,routes,landmarks,clearings}) {
  if(!Number.isSafeInteger(radius) || radius<2 || radius>24 ||
      !(heights instanceof Int16Array) ||
      heights.length!==(radius*2)**2 ||
      !Array.isArray(routes) || !Array.isArray(landmarks) ||
      !Array.isArray(clearings)) {
    throw new TypeError('Invalid bounded World Generation V2 surface');
  }
  const route=routes.find(item=>item.id==='entry-to-exit');
  if(!route || route.nodes.length<2) {
    throw new RangeError('Generated site lacks its required entry-to-exit route');
  }
  const entry=route.nodes[0],exit=route.nodes.at(-1);
  const required=[entry,exit,...landmarks,...clearings];
  if(!required.every(point=>checkPoint(point,radius))) {
    throw new RangeError('Required site point is outside the map');
  }
  const seen=new Uint8Array(heights.length);
  const queue=new Int32Array(heights.length);
  const first=index(radius,entry.x,entry.z);
  seen[first]=1;
  let head=0,tail=1;
  queue[0]=first;
  const size=radius*2;
  while(head<tail) {
    const at=queue[head++];
    const x=at%size,z=Math.floor(at/size),elevation=heights[at];
    for(const [dx,dz] of [[1,0],[-1,0],[0,1],[0,-1]]) {
      const nx=x+dx,nz=z+dz;
      if(nx<0 || nx>=size || nz<0 || nz>=size) continue;
      const next=nz*size+nx;
      if(seen[next] || Math.abs(heights[next]-elevation)>1) continue;
      seen[next]=1;
      queue[tail++]=next;
    }
  }
  const unreachable=required
    .filter(point=>!seen[index(radius,point.x,point.z)])
    .map(point=>point.id ?? (point.x+','+point.z));
  if(unreachable.length) {
    throw new Error('Generated site is not navigable: '+unreachable.join(', '));
  }
  return Object.freeze({
    schema:SITE_TOPOLOGY_SCHEMA,reachable:true,
    entry:Object.freeze({...entry}),exit:Object.freeze({...exit}),
    requiredPoints:required.length,walkableFromEntry:tail,
    totalSurfaceCells:heights.length,
    maximumTraversableStep:1
  });
}
