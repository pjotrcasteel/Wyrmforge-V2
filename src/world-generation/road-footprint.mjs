// Shared World Generation road-footprint policy. Both material painting and
// 10cm occupancy MUST select exactly the same whole-voxel cells and route.
// No renderer, VoxelWorld or mesh imports: map kinds remain replaceable.
const clamp=(value,min,max)=>Math.max(min,Math.min(max,value));

export function distanceToRoadSegment(x,z,a,b) {
  const dx=b.x-a.x,dz=b.z-a.z;
  const lengthSquared=dx*dx+dz*dz;
  if(lengthSquared===0) throw new RangeError('Road segment has zero length');
  const t=clamp(((x-a.x)*dx+(z-a.z)*dz)/lengthSquared,0,1);
  return Math.hypot(x-a.x-t*dx,z-a.z-t*dz);
}

// Use integer tenth coordinates before conversion. Adjacent systems must
// never produce different cuts at rounding thresholds because one computed
// (index+0.5)*0.1 while another computed (index+0.5)/10.
export function microCellCenter(voxel,index) {
  if(!Number.isSafeInteger(voxel) || !Number.isSafeInteger(index) ||
      index<0 || index>9) {
    throw new RangeError('Microcell center requires voxel and 0..9 index');
  }
  return (voxel*10+index+0.5)/10;
}

export function selectRoadCell(x,z,routes) {
  for(const route of routes) {
    if(!route.roadProfile) continue;
    let distance=Infinity;
    for(let i=1;i<route.nodes.length;i++) {
      distance=Math.min(distance,distanceToRoadSegment(
        x,z,route.nodes[i-1],route.nodes[i]
      ));
    }
    if(distance<=route.width+0.01) {
      return Object.freeze({route,distance});
    }
  }
  return null;
}

// The material boundary is voxel-aligned. Cut depth varies only WITHIN
// those already-selected cells; never dig a 10cm strip under grass.
export function roadMicroCut(x,z,selection) {
  if(!selection) return 0;
  const {route}=selection;
  let distance=Infinity;
  for(let i=1;i<route.nodes.length;i++) {
    distance=Math.min(distance,distanceToRoadSegment(
      x,z,route.nodes[i-1],route.nodes[i]
    ));
  }
  const shoulder=clamp((route.width+0.01-distance)/0.6,0,1);
  return Math.round(route.roadProfile.nominalCutFraction*10*shoulder);
}
