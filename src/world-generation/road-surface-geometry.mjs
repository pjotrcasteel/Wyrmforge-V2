// World Generation V2 - road geometry composer. This is ACTUAL integer
// terrain shaping. A 0.12-0.30 voxel intent cannot be faithfully represented
// by current Voxel V2 integer solids, so one-voxel beds are an explicit
// temporary approximation, not a claim of fractional-height rendering.
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
      processedRoutes:0,paintedCells:0,recessedCells:0,
      combatRoadCells:0,minimumPhysicalCutVoxels:0
    });
  }
  let paintedCells=0,recessedCells=0,combatRoadCells=0;
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
    // Carve a narrow inset and leave a full-height terrain shoulder.
    // No shader-only dark stripe: this changes the real voxel top Y.
    const centerWidth=Math.min(1.2,route.width*0.6);
    if(distance<=centerWidth && heights[i]>=profile.cutVoxels) {
      heights[i]-=profile.cutVoxels;
      recessedCells++;
    }
  }
  return Object.freeze({
    processedRoutes:roadRoutes.length,paintedCells,recessedCells,
    combatRoadCells,minimumPhysicalCutVoxels:1
  });
}
