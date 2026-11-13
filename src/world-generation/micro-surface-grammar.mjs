// World Generation V2: author sparse, physical 10cm top-voxel occupancy.
// 10x10 height values encode 10x10x10 individual solid microcells. This
// produces crisp cuboid steps, never sheared triangles or displaced vertices.
// Voxel V2 only understands the resulting public initialization data.
import { selectRoadCell, roadMicroCut, microCellCenter } from './road-footprint.mjs';
import { rasterizeEscapeRoute } from './escape-route-geometry.mjs';
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
  gradedTopTenths=null,
  flowLinks=[],escapeRoutes=[],approaches=[],combatSpaces=[]
}) {
  if(!Number.isSafeInteger(radius) || radius<2 || radius>24 ||
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
  const roads=[],connectors=[],cliffs=[];
  for(let z=-radius;z<radius;z++)for(let x=-radius;x<radius;x++) {
    const i=index(radius,x,z),top=heights[i];
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
    let rockFace=false;
    if(rockFaceThreshold!==null && surfaces[i]===3) {
      for(const [dx,dz] of [[1,0],[-1,0],[0,1],[0,-1]]) {
        const nx=x+dx,nz=z+dz;
        if(nx<-radius||nx>=radius||nz<-radius||nz>=radius) continue;
        if(Math.abs(top-heights[index(radius,nx,nz)])>=rockFaceThreshold) {
          rockFace=true;break;
        }
      }
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
        // Staggered cliff lips with coarse clusters of tiny steps.
        // No smoothly tilted top quads and no gratuitous 1000-cell
        // subdivision of ordinary flat land.
        const n=noise(seed,(x*10+ix)>>2,(z*10+iz)>>2);
        cut=1+Math.floor(n*3);
      }
      const level=10-clamp(cut,0,9);
      levels.push(level);
      if(level!==10) changed=true;
    }
    if(changed) {
      const tile={x,y:top,z,levels};
      (profile ? roads : heightTransition ? connectors : cliffs).push(tile);
    }
  }
  // Keep every authored road first; reserve remaining sparse tile budget for
  // cliff edges. This is an intentionally bounded mobile-memory experiment.
  if(roads.length>MAX_GENERATED_MICRO_TILES) {
    throw new RangeError('Authored road exceeds sparse microvoxel budget');
  }
  if(roads.length+connectors.length>MAX_GENERATED_MICRO_TILES) {
    throw new RangeError('Required traversal landings exceed sparse microvoxel budget');
  }
  const remaining=MAX_GENERATED_MICRO_TILES-roads.length-connectors.length;
  // Select a deterministic scatter of cliff highlights; never depend on
  // Array or platform iteration randomness for replay reproducibility.
  cliffs.sort((a,b)=>{
    const ka=noise(seed,a.x,a.z),kb=noise(seed,b.x,b.z);
    return ka-kb || a.z-b.z || a.x-b.x;
  });
  const tiles=[...roads,...connectors,...cliffs.slice(0,remaining)];
  tiles.sort((a,b)=>a.y-b.y || a.z-b.z || a.x-b.x);
  return Object.freeze({
    schema:MICRO_SURFACE_GRAMMAR_SCHEMA,
    tileCount:tiles.length,
    roadTiles:roads.length,connectorTiles:connectors.length,
    rockTiles:Math.min(cliffs.length,remaining),
    tiles:Object.freeze(tiles)
  });
}
