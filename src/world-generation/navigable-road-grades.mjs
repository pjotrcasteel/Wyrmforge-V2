// World Generation V2: sub-voxel longitudinal road grades.
// Whole-metre rounding across a long incline can create repeated 1m cliffs,
// even when the *average* road grade is gentle. This compositor uses real
// physical tenths along only the authored centreline; the voxel engine owns
// the resulting 10cm solids, not a warped mesh.
import { rasterizeEscapeRoute } from './escape-route-geometry.mjs';

const index=(r,x,z)=>(z+r)*r*2+x+r;

export function gradeNavigableRoads({
  radius,heights,routes=[],escapeRoutes=[]
}) {
  if(!Number.isSafeInteger(radius) || radius<2 || radius>24 ||
      !(heights instanceof Int16Array) ||
      heights.length!==(radius*2)**2 ||
      !Array.isArray(routes) || !Array.isArray(escapeRoutes)) {
    throw new TypeError('Road grades require bounded authoritative terrain heights');
  }
  // Previously accepted escape loops must keep their own separately
  // authored grades. A road may intersect them but must not rewrite
  // their centerline voxels (which would invalidate enemy escape paths).
  const protectedEscapeCells=new Set();
  for(const route of escapeRoutes) {
    for(const p of rasterizeEscapeRoute(route.nodes)) {
      protectedEscapeCells.add(p.x+','+p.z);
    }
  }
  const gradedTopTenths=new Int16Array(heights.length);
  const before=heights.slice();
  let cells=0,maximumGradeTenths=0;
  const centers=[];
  // The authored primary route is the skeleton of an accessible site.
  // Later spurs may share nodes, but must not overwrite its main spine.
  for(const route of routes.filter(item=>item.roadProfile)) {
    for(let segment=1;segment<route.nodes.length;segment++) {
      const a=route.nodes[segment-1],b=route.nodes[segment];
      const path=rasterizeEscapeRoute([a,b]);
      const fromTop=before[index(radius,a.x,a.z)]+1;
      const toTop=before[index(radius,b.x,b.z)]+1;
      // A half-metre rise is the maximum passive hop; an authored route
      // must contain enough cells to support the required total climb.
      const wholeRise=Math.abs(toTop-fromTop)*10;
      if(wholeRise>(path.length-1)*5) {
        throw new Error('Authored road too steep for a 55cm passive hop: '+
          route.id+' segment '+segment);
      }
      const nominalCut=Math.round(route.roadProfile.nominalCutFraction*10);
      for(let j=0;j<path.length;j++) {
        const point=path[j],i=index(radius,point.x,point.z);
        if(gradedTopTenths[i] ||
            protectedEscapeCells.has(point.x+','+point.z))continue;
        const t=j/Math.max(1,path.length-1);
        const desired=Math.round(10*(fromTop+(toTop-fromTop)*t))-nominalCut;
        // A 10cm surface is represented by a solid parent cube and a
        // compressed 1..10 microcell occupancy height within that cube.
        const parent=Math.ceil(desired/10)-1;
        if(parent<0 || parent>30 ||
            desired-parent*10<1 || desired-parent*10>10) {
          throw new RangeError('Longitudinal road grade outside Voxel V2 range');
        }
        heights[i]=parent;
        gradedTopTenths[i]=desired;
        centers.push(Object.freeze({x:point.x,z:point.z,topTenths:desired}));
        cells++;
        if(j>0) {
          const previous=Math.round(
            10*(fromTop+(toTop-fromTop)*(j-1)/Math.max(1,path.length-1))
          )-nominalCut;
          maximumGradeTenths=Math.max(maximumGradeTenths,Math.abs(desired-previous));
        }
      }
    }
  }
  return Object.freeze({
    schema:'wyrmforge.road-tenths-grade.v1',
    gradedTopTenths,
    cells,maximumGradeTenths,centers:Object.freeze(centers)
  });
}
