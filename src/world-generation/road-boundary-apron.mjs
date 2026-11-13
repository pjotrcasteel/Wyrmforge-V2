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
      aprons.push(Object.freeze({
        schema:ROAD_BOUNDARY_APRON_SCHEMA,
        routeId:route.id,end,
        boundary:Object.freeze(boundary),
        spine:Object.freeze({
          nodes:Object.freeze([Object.freeze({...endpoint}),
            Object.freeze({...boundary})])
        }),
        shoulders:Object.freeze(links)
      }));
    }
  }
  return Object.freeze(aprons);
}
