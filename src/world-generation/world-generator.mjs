// World Generation V2 orchestration (Strategy -> Builder -> terrain grammar ->
// topology Specification). No voxel internals, WebGL, DOM, V1, or props.
// The public terrain adapter is the sole implementation boundary.
import { validateWorldSiteRecipe, WORLD_GENERATOR_VERSION } from './site-recipe.mjs';
import { createDefaultMapKindRegistry, siteNoise } from './map-kinds.mjs';
import { SitePlanBuilder } from './site-plan-builder.mjs';
import { specifySiteTopology } from './site-topology-specification.mjs';
import { specifyEncounterSpaces } from './encounter-space-specification.mjs';
import { gradeEscapeRoutes } from './escape-route-geometry.mjs';
import { specifyEscapeRoutes } from './escape-route-specification.mjs';
import { composeCombatFlow } from './combat-flow-geometry.mjs';
import { specifyCombatFlow } from './combat-flow-specification.mjs';
import { composeRoadSurfaces } from './road-surface-geometry.mjs';
import { specifyRoadSurfaces } from './road-surface-specification.mjs';
import { classifySurfaceStrata } from './terrain-strata.mjs';
import { composeMicroSurfaceTiles } from './micro-surface-grammar.mjs';
import { gradeNavigableRoads } from './navigable-road-grades.mjs';

export const WORLD_GENERATION_RESULT_SCHEMA='wyrmforge.generated-site.v2';
const FLOOR=-3;
const MAX_TOP=30;
const clamp=(value,min,max)=>Math.max(min,Math.min(max,value));
const smooth=(x)=>x*x*(3-2*x);
const gridIndex=(radius,x,z)=>(z+radius)*radius*2+(x+radius);

// This is coherent geographical shaping, not one noise value per voxel.
function prepareGeometry(plan,seed) {
  const {radius}=plan.recipe;
  const size=radius*2;
  const heights=new Int16Array(size*size);
  const surfaces=new Uint8Array(size*size);
  const base=(x,z)=>clamp(plan.terrain.elevation(x,z),0,MAX_TOP);
  const routeSegments=[];
  for(const route of plan.routes) {
    for(let i=1;i<route.nodes.length;i++) {
      const a=route.nodes[i-1],b=route.nodes[i];
      const dx=b.x-a.x,dz=b.z-a.z;
      const distanceSquared=dx*dx+dz*dz;
      if(distanceSquared===0) throw new RangeError('Duplicate route segment nodes');
      routeSegments.push({
        a,dx,dz,distanceSquared,width:route.width,
        from:base(a.x,a.z),to:base(b.x,b.z)
      });
    }
  }
  const clearings=plan.clearings.map(c=>({
    ...c,target:base(c.x,c.z)
  }));
  const combatSpaces=plan.combatSpaces.map(space=>({
    ...space,target:base(space.x,space.z)
  }));
  const approachSegments=plan.approaches.map(approach=>{
    const center=combatSpaces.find(space=>space.id===approach.combatSpaceId);
    const dx=center.x-approach.x,dz=center.z-approach.z;
    const distance=Math.hypot(dx,dz);
    const destination=center.target;
    // A corridor stays level across the inner combat floor, then climbs
    // gently through a bounded hillside approach. The grade is enforced
    // along the ENTIRE playable corridor, not only its end points.
    const flatRadius=center.radius-2;
    const gradeLength=Math.max(1,distance-flatRadius);
    const source=clamp(base(approach.x,approach.z),
      destination-gradeLength*0.42,destination+gradeLength*0.42);
    return {...approach,dx,dz,center,source,destination,
      gradeLength,flatRadius,distanceSquared:dx*dx+dz*dz};
  });
  for(let z=-radius;z<radius;z++)for(let x=-radius;x<radius;x++) {
    const i=gridIndex(radius,x,z);
    const natural=base(x,z);
    let shaped=natural;
    let onTrail=false;
    let strongest=0;
    for(const segment of routeSegments) {
      const dx=x-segment.a.x,dz=z-segment.a.z;
      const t=clamp((dx*segment.dx+dz*segment.dz)/segment.distanceSquared,0,1);
      const d=Math.hypot(dx-t*segment.dx,dz-t*segment.dz);
      if(d<=segment.width) onTrail=true;
      const influence=clamp((segment.width+3-d)/3,0,1);
      if(influence<=0 || influence<strongest) continue;
      strongest=influence;
      const level=segment.from+(segment.to-segment.from)*t;
      shaped=natural*(1-smooth(influence))+level*smooth(influence);
    }
    for(const clearing of clearings) {
      const d=Math.hypot(x-clearing.x,z-clearing.z);
      const influence=clamp((clearing.radius+2-d)/2,0,1);
      if(influence>0) {
        shaped=shaped*(1-smooth(influence))+clearing.target*smooth(influence);
      }
    }
    for(const segment of approachSegments) {
      const dx=x-segment.x,dz=z-segment.z;
      const t=clamp((dx*segment.dx+dz*segment.dz)/segment.distanceSquared,0,1);
      const distance=Math.hypot(dx-t*segment.dx,dz-t*segment.dz);
      const influence=clamp((segment.width+2-distance)/2,0,1);
      if(influence>0) {
        const distanceFromCenter=Math.hypot(
          x-segment.center.x,z-segment.center.z);
        const gradeProgress=clamp(
          (distanceFromCenter-segment.flatRadius)/segment.gradeLength,0,1);
        const grade=segment.destination+
          (segment.source-segment.destination)*gradeProgress;
        shaped=shaped*(1-smooth(influence))+grade*smooth(influence);
      }
    }
    // The player needs room to circle, kite and dodge. Only the interior
    // combat floor is levelled; surrounding cliffs, wetland and mountains
    // still give each kind a handcrafted geographical silhouette.
    for(const space of combatSpaces) {
      const distance=Math.hypot(x-space.x,z-space.z);
      const influence=clamp((space.radius+2-distance)/3,0,1);
      if(influence>0) {
        shaped=shaped*(1-smooth(influence))+space.target*smooth(influence);
      }
    }
    const height=clamp(Math.round(shaped),0,MAX_TOP);
    heights[i]=height;
    const stony=siteNoise(seed,x,z,10,20)>plan.terrain.exposedStone ||
      (Math.abs(natural-shaped)>4 && plan.terrain.exposedStone<0.5);
    const inCombat=plan.combatSpaces.some(space=>
      Math.hypot(x-space.x,z-space.z)<=space.radius);
    // Never paint the whole arena brown as though it were a narrow footpath.
    surfaces[i]=inCombat ? (stony ? 3 : 1) : onTrail ? 2 : stony ? 3 : 1;
  }
  // Secondary maneuvering spaces are authored terrain, not additional spawn
  // arenas. Grade their wide connections before escape-loop finalization so
  // the established east/west detours remain authoritative and walkable.
  composeCombatFlow({
    radius,heights,combatSpaces:plan.combatSpaces,
    maneuverPockets:plan.maneuverPockets,flowLinks:plan.flowLinks
  });
  gradeEscapeRoutes({radius,heights,escapeRoutes:plan.escapeRoutes});
  // Final authored road pass wins over arena flattening AND re-grade detours.
  // Its real one-voxel bed and continuous materials survive the entire site.
  const roadWork=composeRoadSurfaces({
    radius,heights,surfaces,routes:plan.routes,combatSpaces:plan.combatSpaces
  });
  const roadGrades=gradeNavigableRoads({
    radius,heights,routes:plan.routes,escapeRoutes:plan.escapeRoutes
  });
  const geology=classifySurfaceStrata({
    radius,heights,surfaces,terrain:plan.terrain
  });
  return {heights,surfaces,roadWork,geology,roadGrades};
}

// Run-length encoding is an Adapter input rather than a direct VoxelWorld
// mutation. Full 3D strata (not only a heightmap) cross signed chunk origins.
function generateRuns(radius,heights,surfaces,soilDepth) {
  const runs=[];
  const size=radius*2;
  let maxY=FLOOR;
  for(const height of heights) maxY=Math.max(maxY,height);
  let totalCells=0;
  const materialAt=(x,y,z)=>{
    const idx=gridIndex(radius,x,z);
    const top=heights[idx];
    if(y>top) return 0;
    if(y===top) return surfaces[idx];
    // Rock outcrops are a contiguous stone mass, never a thin grey cap
    // above two unsupported brown dirt bands on vertical mountain walls.
    if(surfaces[idx]===3) return 3;
    if(y>=top-soilDepth) return 2;
    return 3;
  };
  for(let y=FLOOR;y<=maxY;y++)for(let z=-radius;z<radius;z++) {
    let start=-radius;
    while(start<radius) {
      const material=materialAt(start,y,z);
      if(material===0) {start++;continue;}
      let end=start+1;
      while(end<radius && materialAt(end,y,z)===material) end++;
      runs.push({x:start,y,z,length:end-start,material});
      totalCells+=end-start;
      start=end;
    }
  }
  return {runs,totalCells};
}

function canonicalDigest(value) {
  const serialized=JSON.stringify(value);
  let hash=0x811c9dc5;
  for(let i=0;i<serialized.length;i++) {
    hash^=serialized.charCodeAt(i);
    hash=Math.imul(hash,0x01000193);
  }
  return (hash>>>0).toString(16).padStart(8,'0');
}

function boundedSiteSeed(recipe) {
  let hash=recipe.seed>>>0;
  const source=recipe.regionId+'/'+recipe.siteId+'/'+recipe.worldRevision;
  for(let i=0;i<source.length;i++) {
    hash=Math.imul(hash^source.charCodeAt(i),0x01000193)>>>0;
  }
  return hash>>>0;
}

export class WorldGeneratorV2 {
  #registry;
  #terrainAdapter;
  constructor({registry=createDefaultMapKindRegistry(),terrainAdapter}={}) {
    if(!registry || typeof registry.resolve!=='function') {
      throw new TypeError('World generator needs an injected map-kind registry');
    }
    if(typeof terrainAdapter!=='function') {
      throw new TypeError('World generator needs an injected terrain output adapter');
    }
    this.#registry=registry;
    this.#terrainAdapter=terrainAdapter;
  }
  get kinds(){return this.#registry.kinds;}

  generate(recipeInput) {
    const recipe=validateWorldSiteRecipe(recipeInput);
    const strategy=this.#registry.resolve(recipe.kind);
    const seed=boundedSiteSeed(recipe);
    const builder=new SitePlanBuilder(recipe);
    strategy.compose(builder,Object.freeze({seed,recipe}));
    const plan=builder.build();
    const {heights,surfaces,roadWork,geology,roadGrades}=prepareGeometry(plan,seed);
    const topology=specifySiteTopology({
      radius:recipe.radius,heights,
      routes:plan.routes,landmarks:plan.landmarks,
      clearings:[...plan.clearings,...plan.combatSpaces,...plan.approaches,
        ...plan.escapeRoutes.map(route=>route.nodes[0]),
        ...plan.escapeRoutes.map(route=>route.nodes.at(-1)),
        ...plan.maneuverPockets]
    });
    const escapeAudit=specifyEscapeRoutes({
      radius:recipe.radius,heights,
      escapeRoutes:plan.escapeRoutes,combatSpaces:plan.combatSpaces
    });
    const encounter=specifyEncounterSpaces({
      radius:recipe.radius,heights,
      combatSpaces:plan.combatSpaces,
      approaches:plan.approaches,
      discoveryCandidates:plan.discoveryCandidates
    });
    const combatFlow=specifyCombatFlow({
      radius:recipe.radius,heights,
      combatSpaces:plan.combatSpaces,
      maneuverPockets:plan.maneuverPockets,
      flowLinks:plan.flowLinks
    });
    const roads=specifyRoadSurfaces({
      radius:recipe.radius,heights,surfaces,
      routes:plan.routes,combatSpaces:plan.combatSpaces,roadWork
    });
    const {runs,totalCells}=generateRuns(
      recipe.radius,heights,surfaces,plan.terrain.soilDepth
    );
    const microSurface=composeMicroSurfaceTiles({
      radius:recipe.radius,seed,
      heights,surfaces,routes:plan.routes,
      gradedTopTenths:roadGrades.gradedTopTenths,
      flowLinks:plan.flowLinks,escapeRoutes:plan.escapeRoutes,
      approaches:plan.approaches,combatSpaces:plan.combatSpaces,
      rockFaceThreshold:plan.terrain.rockFaceThreshold
    });
    const definition=this.#terrainAdapter({
      siteId:recipe.siteId,seed:recipe.seed,
      chunkEdge:recipe.chunkEdge,runs,
      surfaceTiles:microSurface.tiles
    });
    const layout=Object.freeze({
      routes:plan.routes,roads,geology,
      roadGrades:Object.freeze({
        schema:roadGrades.schema,cells:roadGrades.cells,
        maximumGradeTenths:roadGrades.maximumGradeTenths,
        centers:roadGrades.centers
      }),
      microSurface:Object.freeze({
        schema:microSurface.schema,tileCount:microSurface.tileCount,
        roadTiles:microSurface.roadTiles,
        connectorTiles:microSurface.connectorTiles,
        rockTiles:microSurface.rockTiles
      }),clearings:plan.clearings,
      landmarks:plan.landmarks,features:plan.features,
      combatSpaces:plan.combatSpaces,
      approaches:plan.approaches,
      escapeRoutes:plan.escapeRoutes,escapeAudit,
      maneuverPockets:plan.maneuverPockets,
      flowLinks:plan.flowLinks,combatFlow,
      discoveryCandidates:Object.freeze(plan.discoveryCandidates.map(candidate=>{
        const surfaceY=heights[gridIndex(recipe.radius,candidate.x,candidate.z)];
        return Object.freeze({
          ...candidate,surfaceY,buriedY:surfaceY-candidate.coverDepth
        });
      })),
      encounter,
      footprint:Object.freeze({
        minX:-recipe.radius,maxX:recipe.radius-1,
        minZ:-recipe.radius,maxZ:recipe.radius-1,
        minY:FLOOR,maxY:Math.max(...heights)
      }),
      topology
    });
    const digest=canonicalDigest({
      schema:WORLD_GENERATION_RESULT_SCHEMA,
      generatorVersion:WORLD_GENERATOR_VERSION,
      recipe,layout,definition
    });
    return Object.freeze({
      schema:WORLD_GENERATION_RESULT_SCHEMA,
      generatorVersion:WORLD_GENERATOR_VERSION,
      recipe,layout,definition,
      hash:'wg2-'+digest,totalCells
    });
  }
}

