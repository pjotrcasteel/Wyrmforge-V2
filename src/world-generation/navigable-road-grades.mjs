// WorldGen V2: bounded, joint 10cm walkable-corridor grading.
// Roads, kiting links, escape loops and enemy approaches share the SAME
// authoritative physical heights. Independent sculpting caused 1m cliffs
// at intersections even when each path appeared walkable alone.
// This module owns geography only. No actor/physics/Voxel imports.
import { rasterizeEscapeRoute } from './escape-route-geometry.mjs';
import { selectRoadCell } from './road-footprint.mjs';

const index=(radius,x,z)=>(z+radius)*radius*2+x+radius;
const GRADE_LIMIT_TENTHS=5; // 0.5m max physical rise between route cells

export function gradeNavigableRoads({
  radius,heights,routes=[],escapeRoutes=[],flowLinks=[],
  approaches=[],combatSpaces=[]
}) {
  if(!Number.isSafeInteger(radius) || radius<2 || radius>24 ||
      !(heights instanceof Int16Array) ||
      heights.length!==(radius*2)**2 ||
      ![routes,escapeRoutes,flowLinks,approaches,combatSpaces]
        .every(Array.isArray)) {
    throw new TypeError('Joint traversal grading requires bounded terrain and authored paths');
  }
  const before=heights.slice();
  const tracks=routes.filter(route=>route.roadProfile);
  const sampled=new Int16Array(heights.length);
  const used=new Set();
  const edges=[],edgeIds=new Set();
  const authored=[...routes,...escapeRoutes,...flowLinks];
  const hub=combatSpaces[0];
  if(hub)for(const approach of approaches) {
    authored.push({nodes:[
      {x:approach.x,z:approach.z},{x:hub.x,z:hub.z}
    ]});
  }
  for(const route of authored) {
    const path=rasterizeEscapeRoute(route.nodes);
    let previous=-1;
    for(const point of path) {
      const {x,z}=point;
      if(x<-radius || x>=radius || z<-radius || z>=radius) {
        throw new RangeError('Authored route exceeds site terrain');
      }
      const i=index(radius,x,z);
      if(!used.has(i)) {
        const selected=selectRoadCell(x,z,tracks);
        const cut=selected
          ? Math.round(selected.route.roadProfile.nominalCutFraction*10):0;
        sampled[i]=10*(before[i]+1)-cut;
        used.add(i);
      }
      if(previous>=0 && previous!==i) {
        const a=Math.min(previous,i),b=Math.max(previous,i);
        const key=a+','+b;
        if(!edgeIds.has(key)) {
          edgeIds.add(key);
          edges.push([a,b]);
        }
      }
      previous=i;
    }
  }
  // Deterministic local projection to a bounded 50cm grade. Both endpoints
  // adjust together; paths which cross at the hub cannot disagree on height.
  // The original whole-voxel terrain is the starting point, minimizing the
  // amount of work required in easy wetland sites.
  let iterations=0,changed=false;
  for(;iterations<480;iterations++) {
    changed=false;
    for(const [a,b] of edges) {
      const difference=sampled[a]-sampled[b];
      const excess=Math.abs(difference)-GRADE_LIMIT_TENTHS;
      if(excess<=0)continue;
      const sign=Math.sign(difference);
      const reduceA=Math.floor(excess/2);
      const increaseB=excess-reduceA;
      sampled[a]-=sign*reduceA;
      sampled[b]+=sign*increaseB;
      changed=true;
    }
    if(!changed)break;
  }
  if(changed)throw new Error('Authored path grades could not converge to a 50cm step');
  let maxGradeTenths=0;
  for(const [a,b] of edges) {
    maxGradeTenths=Math.max(maxGradeTenths,Math.abs(sampled[a]-sampled[b]));
  }
  if(maxGradeTenths>GRADE_LIMIT_TENTHS) {
    throw new Error('Authored movement route exceeds max physical passive hop');
  }
  const centers=[];
  for(const i of used) {
    const topTenths=sampled[i];
    const parent=Math.ceil(topTenths/10)-1;
    if(parent<0 || parent>30 ||
        topTenths-parent*10<1 || topTenths-parent*10>10) {
      throw new RangeError('Movement grade exceeds bounded voxel height range');
    }
    heights[i]=parent;
    const x=i%(radius*2)-radius;
    const z=Math.floor(i/(radius*2))-radius;
    centers.push(Object.freeze({x,z,topTenths}));
  }
  return Object.freeze({
    schema:'wyrmforge.shared-tenths-traversal-grade.v1',
    gradedTopTenths:sampled,cells:used.size,
    centers:Object.freeze(centers),
    maximumGradeTenths:maxGradeTenths,
    iterations,edgeCount:edges.length
  });
}
