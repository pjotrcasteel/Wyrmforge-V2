// WorldGen V2: compose road entry/exit aprons BEFORE shared physical grading.
// Terrain recipes own road paths; this pure grammar joins nearby endpoints
// to the edge of the finite map and includes short, painted shoulders.
// No Voxel, actor, renderer or terrain edits are performed here.
import { rasterizeEscapeRoute } from './escape-route-geometry.mjs';
import { selectRoadCell } from './road-footprint.mjs';

export const ROAD_BOUNDARY_APRON_SCHEMA='wyrmforge.road-boundary-apron.v1';

const inside=(radius,x,z)=>x>=-radius && x<radius && z>=-radius && z<radius;
const key=point=>point.x+','+point.z;

function boundaryCandidate(radius,endpoint,neighbor,width) {
  const outward={x:Math.sign(endpoint.x-neighbor.x),
    z:Math.sign(endpoint.z-neighbor.z)};
  const candidates=[
    {axis:'x',edge:-radius,sign:-1},
    {axis:'x',edge:radius-1,sign:1},
    {axis:'z',edge:-radius,sign:-1},
    {axis:'z',edge:radius-1,sign:1}
  ].filter(candidate=>{
    const distance=Math.abs(endpoint[candidate.axis]-candidate.edge);
    return outward[candidate.axis]===candidate.sign &&
      distance<=Math.ceil(width)+1;
  }).sort((a,b)=>
    Math.abs(endpoint[a.axis]-a.edge)-Math.abs(endpoint[b.axis]-b.edge) ||
    a.axis.localeCompare(b.axis));
  return candidates[0]??null;
}


/*
 * Finish the boundary apron in the nearby natural terrain, not only in the
 * painted track. The prior apron physically graded the road itself but left
 * the very next grass columns at their independently rounded 1m elevations:
 * that exposed a jagged brown wall at the finite site's entrance.
 *
 * Two grass columns on either side of the road, for only the first few
 * entrance/exit cells, participate in the SAME height-constraint graph.
 * No material is repainted, no cliff elsewhere is altered and no rendering
 * or Voxel system is imported. Links are cardinal physical neighbors.
 */
function composeGrassShoulderLinks({radius,route,routes,candidate,points}) {
  const sideAxis=candidate.axis==='z'?'x':'z';
  const maxDepth=Math.ceil(route.width)+2;
  const links=[],seen=new Set(),grassCells=new Map();
  const add=(a,b)=>{
    const id=[key(a),key(b)].sort().join('|');
    if(id===key(a)+'|'+key(a) || seen.has(id))return;
    seen.add(id);
    links.push(Object.freeze({
      nodes:Object.freeze([Object.freeze({...a}),Object.freeze({...b})])
    }));
  };
  for(const point of points) {
    if(Math.abs(point[candidate.axis]-candidate.edge)>maxDepth ||
        selectRoadCell(point.x,point.z,routes)?.route!==route)continue;
    for(const sign of [-1,1]) {
      let previous=point,grassColumns=0;
      for(let offset=1;offset<=Math.ceil(route.width)+3;offset++) {
        const next={x:point.x,z:point.z};
        next[sideAxis]+=offset*sign;
        if(!inside(radius,next.x,next.z))break;
        const selected=selectRoadCell(next.x,next.z,routes);
        if(selected?.route===route) {
          if(grassColumns)break;
          previous=next;
          continue;
        }
        // Never run the taper into a separate authored road.
        if(selected)break;
        add(previous,next);
        grassCells.set(key(next),next);
        previous=next;
        if(++grassColumns===2)break;
      }
    }
  }
  // Neighboring grass columns are one connected physical surface, rather
  // than independently solved strips that create fresh longitudinal teeth.
  for(const p of grassCells.values())for(const [dx,dz] of [[1,0],[0,1]]) {
    const neighbor=grassCells.get((p.x+dx)+','+(p.z+dz));
    if(neighbor)add(p,neighbor);
  }
  return Object.freeze(links);
}

export function composeRoadBoundaryAprons({radius,routes}) {
  if(!Number.isSafeInteger(radius)||radius<2||radius>24 ||
      !Array.isArray(routes)) {
    throw new TypeError('Boundary aprons require bounded site and authored roads');
  }
  const aprons=[];
  for(const route of routes) {
    if(!route.roadProfile)continue;
    const full=rasterizeEscapeRoute(route.nodes);
    for(const end of ['entry','exit']) {
      const endpoint=end==='entry'?route.nodes[0]:route.nodes.at(-1);
      const neighbor=end==='entry'?route.nodes[1]:route.nodes.at(-2);
      const candidate=boundaryCandidate(radius,endpoint,neighbor,route.width);
      if(!candidate)continue;
      const boundary={
        x:candidate.axis==='x'?candidate.edge:endpoint.x,
        z:candidate.axis==='z'?candidate.edge:endpoint.z
      };
      if(endpoint.x===boundary.x && endpoint.z===boundary.z)continue;
      const extension=rasterizeEscapeRoute([endpoint,boundary]);
      // Honor only painted cells of this very road. Never grade a grass
      // strip just to connect a fictitious segment outside the map.
      if(!extension.every(p=>inside(radius,p.x,p.z) &&
          selectRoadCell(p.x,p.z,routes)?.route===route))continue;
      const inward=end==='entry'?full:full.slice().reverse();
      const sample=[...inward.slice(0,Math.ceil(route.width)+3),...extension];
      const unique=[...new Map(sample.map(p=>[key(p),p])).values()];
      const links=[],seen=new Set();
      const sideAxis=candidate.axis==='z'?'x':'z';
      for(const p of unique) {
        for(let offset=-Math.ceil(route.width);offset<=Math.ceil(route.width);
          offset++) {
          if(!offset)continue;
          const side={x:p.x,z:p.z};
          side[sideAxis]+=offset;
          if(!inside(radius,side.x,side.z) ||
              selectRoadCell(side.x,side.z,routes)?.route!==route)continue;
          const pair=[p,side],id=[key(p),key(side)].sort().join('|');
          if(seen.has(id))continue;
          seen.add(id);
          links.push(Object.freeze({
            nodes:Object.freeze(pair.map(node=>Object.freeze({...node})))
          }));
        }
      }
      const grassShoulders=composeGrassShoulderLinks({
        radius,route,routes,candidate,points:unique
      });
      aprons.push(Object.freeze({
        schema:ROAD_BOUNDARY_APRON_SCHEMA,
        routeId:route.id,end,
        boundary:Object.freeze(boundary),
        spine:Object.freeze({
          nodes:Object.freeze([Object.freeze({...endpoint}),
            Object.freeze({...boundary})])
        }),
        shoulders:Object.freeze(links),
        grassShoulders
      }));
    }
  }
  return Object.freeze(aprons);
}
