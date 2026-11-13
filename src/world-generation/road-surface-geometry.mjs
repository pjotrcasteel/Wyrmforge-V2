import { rasterizeEscapeRoute } from './escape-route-geometry.mjs';

// World Generation V2: route material and walkable centerline geometry.
// No one-block excavations. Presentation of 0.1-voxel road beds is delegated
// through a replaceable public mesh-presentation adapter.
const index=(radius,x,z)=>(z+radius)*2*radius+x+radius;
const clamp=(n,a,b)=>Math.max(a,Math.min(b,n));

function distanceToSegment(x,z,a,b) {
  const dx=b.x-a.x,dz=b.z-a.z;
  const squared=dx*dx+dz*dz;
  if(squared===0) throw new RangeError('Road segment has zero length');
  const t=clamp(((x-a.x)*dx+(z-a.z)*dz)/squared,0,1);
  return Math.hypot(x-(a.x+t*dx),z-(a.z+t*dz));
}

export function composeRoadSurfaces({
  radius,heights,surfaces,routes=[],combatSpaces=[]
}) {
  if(!Number.isSafeInteger(radius) || radius<2 || radius>24 ||
      !(heights instanceof Int16Array) ||
      !(surfaces instanceof Uint8Array) ||
      heights.length!==(radius*2)**2 ||
      surfaces.length!==heights.length ||
      !Array.isArray(routes) || !Array.isArray(combatSpaces)) {
    throw new TypeError('Road composer needs real bounded site heights and surfaces');
  }
  const roadRoutes=routes.filter(route=>route.roadProfile);
  if(!roadRoutes.length) {
    return Object.freeze({
      processedRoutes:0,paintedCells:0,profiledCells:0,
      combatRoadCells:0,physicalCutVoxels:0
    });
  }
  // Some original road spurs were never required to be walkable. Grade
  // their actual cardinal centerlines before laying down the bed. This
  // repairs occasional pre-existing two-voxel steps at a site edge without
  // changing the authored entry/exit anchors or flattening all landmarks.
  for(const route of roadRoutes) {
    const path=rasterizeEscapeRoute(route.nodes);
    const targets=path.map(point=>heights[index(radius,point.x,point.z)]);
    if(Math.abs(targets.at(-1)-targets[0])>path.length-1) {
      throw new Error('Road cannot meet entry and exit elevations: '+route.id);
    }
    for(let pass=0;pass<2;pass++) {
      for(let i=1;i<targets.length-1;i++) {
        targets[i]=clamp(targets[i],targets[i-1]-1,targets[i-1]+1);
      }
      for(let i=targets.length-2;i>0;i--) {
        targets[i]=clamp(targets[i],targets[i+1]-1,targets[i+1]+1);
      }
    }
    for(let i=0;i<path.length;i++) {
      const point=path[i];
      heights[index(radius,point.x,point.z)]=targets[i];
    }
  }
  let paintedCells=0,profiledCells=0,combatRoadCells=0;
  for(let z=-radius;z<radius;z++)for(let x=-radius;x<radius;x++) {
    // Road priority follows the authored route order: the continuous entry-
    // to-exit spine wins over narrower landmark spurs at intersections.
    let selected=null;
    for(const route of roadRoutes) {
      let closest=Infinity;
      for(let i=1;i<route.nodes.length;i++) {
        closest=Math.min(closest,
          distanceToSegment(x,z,route.nodes[i-1],route.nodes[i]));
      }
      if(closest<=route.width+0.01) {
        selected={route,distance:closest};
        break;
      }
    }
    if(!selected) continue;
    const i=index(radius,x,z);
    const {route,distance}=selected;
    const profile=route.roadProfile;
    surfaces[i]=profile.material;
    paintedCells++;
    if(combatSpaces.some(space=>
      Math.hypot(x-space.x,z-space.z)<=space.radius)) combatRoadCells++;
    // Quantized 10 cm visual cut lives in the independent surface adapter.
    // The authoritative integer height remains unchanged at road centers.
    if(distance<=Math.min(1.2,route.width*0.6)) profiledCells++;
  }
  return Object.freeze({
    processedRoutes:roadRoutes.length,paintedCells,profiledCells,
    combatRoadCells,physicalCutVoxels:0
  });
}
