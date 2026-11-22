// World Generation V2: author sparse, physical 10cm top-voxel occupancy.
// 10x10 height values encode 10x10x10 individual solid microcells. This
// produces crisp cuboid steps, never sheared triangles or displaced vertices.
// Voxel V2 only understands the resulting public initialization data.
import { selectRoadCell, roadMicroCut, microCellCenter } from './road-footprint.mjs';
import { rasterizeEscapeRoute } from './escape-route-geometry.mjs';
import { rockRimCut } from './rock-rim-grammar.mjs';
export const MICRO_SURFACE_GRAMMAR_SCHEMA='wyrmforge.micro-surface-grammar.v1';
export const MAX_GENERATED_MICRO_TILES=384;
const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
const index=(r,x,z)=>(z+r)*r*2+x+r;

function noise(seed,x,z) {
  let v=(seed ^ Math.imul(x,0x9e3779b1) ^
    Math.imul(z,0x85ebca6b))>>>0;
  v^=v>>>16;
  v=Math.imul(v,0x7feb352d);
  v^=v>>>15;
  v=Math.imul(v,0x846ca68b);
  return ((v^(v>>>16))>>>0)/0x100000000;
}

export function composeMicroSurfaceTiles({
  radius,seed,heights,surfaces,routes,rockFaceThreshold=null,
  gradedTopTenths=null,stoneUnderTurf=null,surfaceExclusions=null,
  flowLinks=[],escapeRoutes=[],approaches=[],combatSpaces=[]
}) {
  if(!Number.isSafeInteger(radius) || radius<2 || radius>32 ||
      !Number.isSafeInteger(seed) || seed<0 || seed>0xffffffff ||
      !(heights instanceof Int16Array) ||
      !(surfaces instanceof Uint8Array) ||
      heights.length!==(radius*2)**2 ||
      surfaces.length!==heights.length || !Array.isArray(routes) ||
      (gradedTopTenths!==null &&
        (!(gradedTopTenths instanceof Int16Array) ||
          gradedTopTenths.length!==heights.length)) ||
      ![flowLinks,escapeRoutes,approaches,combatSpaces].every(Array.isArray)) {
    throw new TypeError('Expected bounded completed WorldGen heightfield');
  }
  const tracks=routes.filter(route=>route.roadProfile);
  // Authoring owns walkable circulation, not the Voxel actor implementation.
  // Include all required paths: the primary road, escape loops, maneuver
  // links and approach lanes. Road-only micro landings left pockets blocked.
  const pathCells=new Set();
  const addPath=nodes=>{
    for(const p of rasterizeEscapeRoute(nodes)) {
      pathCells.add(p.x+','+p.z);
    }
  };
  for(const route of [...tracks,...flowLinks,...escapeRoutes]) {
    addPath(route.nodes);
  }
  const hub=combatSpaces[0];
  if(hub)for(const approach of approaches) {
    addPath([{x:approach.x,z:approach.z},{x:hub.x,z:hub.z}]);
  }
  const inPath=(x,z)=>pathCells.has(x+','+z);
  const roads=[],connectors=[],cliffs=[],turfLips=[];
  for(let z=-radius;z<radius;z++)for(let x=-radius;x<radius;x++) {
    const i=index(radius,x,z),top=heights[i];
    if(surfaceExclusions?.has(i))continue;
    const authoredTop=gradedTopTenths?.[i]??0;
    const selected=selectRoadCell(x,z,tracks);
    const profile=selected?.route??null;
    // A whole 1m rise across the trail would be thigh-to-waist height on
    // a 1.6m actor. Refine the HIGHER road tile into a genuine 50cm
    // landing whenever an adjacent authored road tile is one block lower.
    // The adjacent high tile remains solid; two 50cm steps replace the
    // previous single one-metre climb, with no bent triangles.
    const heightTransition=inPath(x,z) &&
      [[1,0],[-1,0],[0,1],[0,-1]].some(([dx,dz])=>{
        const nx=x+dx,nz=z+dz;
        return nx>=-radius && nx<radius && nz>=-radius && nz<radius &&
          inPath(nx,nz) && top-heights[index(radius,nx,nz)]===1;
      });
    if(profile && surfaces[i]!==profile.roadProfile.material) {
      throw new Error('Road surface material disagrees with selected microvoxels');
    }
    // Only the high side owns a chipped rim. Refining the low side used
    // to lower entire floor tiles without breaking the elevated outline.
    const lowerEdges=[];
    if(rockFaceThreshold!==null && surfaces[i]===3) {
      for(const [dx,dz] of [[1,0],[-1,0],[0,1],[0,-1],[1,1],[1,-1],[-1,1],[-1,-1]]) {
        const nx=x+dx,nz=z+dz;
        if(nx<-radius||nx>=radius||nz<-radius||nz>=radius)continue;
        if(top>heights[index(radius,nx,nz)])lowerEdges.push([dx,dz]);
      }
    }
    const rockFace=lowerEdges.length>0&&!inPath(x,z);
    const turfLip=!profile&&!heightTransition&&!authoredTop&&!inPath(x,z)&&
      surfaces[i]===1&&stoneUnderTurf?.has(i);
    if(turfLip){
      const lower=(dx,dz)=>x+dx>=-radius&&x+dx<radius&&z+dz>=-radius&&z+dz<radius&&
        heights[index(radius,x+dx,z+dz)]<top;
      const west=lower(-1,0),east=lower(1,0),north=lower(0,-1),south=lower(0,1);
      const levels=[];
      for(let iz=0;iz<10;iz++)for(let ix=0;ix<10;ix++){
        const distance=Math.min(west?ix:10,east?9-ix:10,north?iz:10,south?9-iz:10);
        const variation=noise(seed,(x*10+ix)>>1,(z*10+iz)>>1);
        levels.push(distance<=1+Math.floor(variation*3)?1+Math.floor(variation*2):2+Math.floor(variation*2));
      }
      turfLips.push({x,y:top+1,z,levels});
      continue;
    }
    if(!profile && !rockFace && !heightTransition && !authoredTop) continue;
    const levels=[];
    let changed=false;
    for(let iz=0;iz<10;iz++)for(let ix=0;ix<10;ix++) {
      const px=microCellCenter(x,ix),pz=microCellCenter(z,iz);
      let cut=0;
      if(authoredTop) {
        // The primary road's 10cm longitudinal grade is the authoritative
        // physical top, including its 10-30cm worn-road inset.
        cut=10-(authoredTop-top*10);
        if(cut<0 || cut>9) {
          throw new Error('Microvoxel road grade disagrees with parent solid');
        }
      } else if(profile) {
        // The same selected 1m road cell owns its material AND its physical
        // ten-centimeter occupancy. Never carve beyond a painted boundary.
        cut=Math.max(roadMicroCut(px,pz,selected),
          heightTransition ? 5 : 0);
      } else if(heightTransition) {
        // A 10cm-quantized, 50cm landing on an authored walking link.
        // It replaces an impassable whole-block step with two 50cm rises.
        cut=5;
      } else if(rockFace) {
        // Coherent weathering, diagonal corner cuts and varied shoulders.
        cut=rockRimCut(seed,x,z,ix,iz,lowerEdges);

      }
      const level=10-clamp(cut,0,9);
      levels.push(level);
      if(level!==10) changed=true;
    }
    if(changed) {
      const tile={x,y:top,z,levels};
      // Shared traversal grades are mandatory geometry even when they land
      // on grass beside a boundary road. Cliffs are optional decoration and
      // can be budget-trimmed; dropping a required graded shoulder leaves
      // a full-height voxel in place and recreates the brown entrance lip.
      (profile ? roads : authoredTop || heightTransition ? connectors : cliffs)
        .push(tile);
    }
  }
  // Roads and ALL shared physical grade tiles (including grass aprons) are
  // mandatory. Only incidental cliff detail may be trimmed by the budget.
  // Keep every authored road first; reserve remaining sparse tile budget for
  // cliff edges. This is an intentionally bounded mobile-memory experiment.
  if(roads.length>MAX_GENERATED_MICRO_TILES) {
    throw new RangeError('Authored road exceeds sparse microvoxel budget');
  }
  if(roads.length+connectors.length>MAX_GENERATED_MICRO_TILES) {
    throw new RangeError('Required traversal landings exceed sparse microvoxel budget');
  }
  const remaining=MAX_GENERATED_MICRO_TILES-roads.length-connectors.length;
  // Spend optional detail in coherent 8m patches, preserving adjacent rim
  // runs rather than scattering disconnected refined tiles over every slope.
  const circulation=[...pathCells].map(key=>key.split(',').map(Number));
  const patchScores=new Map();
  const patchScore=tile=>{
    const x=(tile.x>>3)*8+4,z=(tile.z>>3)*8+4,key=x+','+z;
    if(!patchScores.has(key)) {
      const distance=circulation.length?Math.min(...circulation.map(([px,pz])=>
        (x-px)**2+(z-pz)**2)):x*x+z*z;
      patchScores.set(key,distance+noise(seed,x,z));
    }
    return patchScores.get(key);
  };
  cliffs.sort((a,b)=>patchScore(a)-patchScore(b)||a.z-b.z||a.x-b.x);
  const selectedLips=turfLips.slice(0,remaining);
  const selectedRock=cliffs.slice(0,remaining-selectedLips.length);
  const tiles=[...roads,...connectors,...selectedLips,...selectedRock];
  tiles.sort((a,b)=>a.y-b.y || a.z-b.z || a.x-b.x);
  return Object.freeze({
    schema:MICRO_SURFACE_GRAMMAR_SCHEMA,
    tileCount:tiles.length,
    roadTiles:roads.length,connectorTiles:connectors.length,
    rockTiles:selectedRock.length+selectedLips.length,
    turfLips:Object.freeze(selectedLips),
    tiles:Object.freeze(tiles)
  });
}
