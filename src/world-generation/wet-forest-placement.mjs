import {containsHuntLandform} from './hunt-landform-footprint.mjs';

export const WET_FOREST_PLACEMENT_SCHEMA='wyrmforge.wet-forest-placement.v1';
const MAX_PLACEMENTS=24;
const MAX_GRADE_TENTHS=5;
const clearance=1;
const distance=(a,b)=>Math.hypot(a.x-b.x,a.z-b.z);
const key=(x,z)=>x+','+z;

function distanceToSegment(point,{a,b}){
  const dx=b.x-a.x,dz=b.z-a.z;
  const t=Math.max(0,Math.min(1,((point.x-a.x)*dx+(point.z-a.z)*dz)/(dx*dx+dz*dz)));
  return Math.hypot(point.x-a.x-t*dx,point.z-a.z-t*dz);
}

function placementSeed(recipe,regionId){
  let seed=recipe.seed;
  for(const char of regionId+'/'+recipe.worldRevision){
    seed=Math.imul(seed^char.charCodeAt(0),16777619);
  }
  return seed>>>0;
}

function surfaceColumns(definition,region){
  const columns=new Map();
  const tiles=new Map((definition.surfaceTiles??[]).map(tile=>
    [key(tile.x,tile.z)+','+tile.y,tile.levels]));
  for(const run of definition.runs){
    for(let x=run.x;x<run.x+run.length;x++){
      const id=key(x,run.z);
      if(columns.get(id)?.y>=run.y)continue;
      const levels=tiles.get(id+','+run.y);
      columns.set(id,{y:run.y,material:run.material,
        center:run.y*10+(levels?levels[55]:10),
        low:run.y*10+(levels?Math.min(...levels):10),
        high:run.y*10+(levels?Math.max(...levels):10)});
    }
  }
  return (x,z)=>columns.get(key(x-region.offsetX,z-region.offsetZ));
}

export function composeWetForestPlacement(site,region){
  const {layout,recipe}=site;
  const {offsetX,offsetZ,bounds}=region;
  const translate=p=>({...p,x:p.x+offsetX+.5,z:p.z+offsetZ+.5});
  const protectedAreas=[
    ...layout.roadGrades.centers.map(p=>({...p,radius:2})),
    ...layout.clearings,...layout.combatSpaces,...layout.maneuverPockets,
    ...layout.landmarks.map(p=>({...p,radius:p.clearance})),
    ...layout.discoveryCandidates.map(p=>({...p,radius:2}))
  ].map(translate);
  protectedAreas.push(...region.opportunities.map(p=>({...p.at,radius:3})));
  const corridors=[...layout.routes,...layout.escapeRoutes,...layout.flowLinks,
    ...layout.approaches.map(approach=>({...approach,nodes:[approach,
      layout.combatSpaces.find(space=>space.id===approach.combatSpaceId)]}))];
  const segments=corridors.flatMap(route=>route.nodes.slice(1).map((node,i)=>({
    a:translate(route.nodes[i]),b:translate(node),width:route.width
  })));
  const basin=translate(layout.features.find(p=>p.id==='wetland'));
  const surface=surfaceColumns(site.definition,region);
  const seed=placementSeed(recipe,region.id);
  let state=seed;
  const next=()=>{
    state=(Math.imul(state,1664525)+1013904223)>>>0;
    return state/4294967296;
  };
  const eligible=(point,radius,kind)=>{
    if(distance(point,basin)<basin.radius+radius+(kind==='tree'?0:1))return null;
    if(protectedAreas.some(area=>distance(point,area)<area.radius+radius+clearance))return null;
    if(segments.some(segment=>distanceToSegment(point,segment)<segment.width+radius+clearance))return null;
    const edge=radius+.5;
    const center=surface(Math.floor(point.x),Math.floor(point.z));
    if(!center||center.material===2||(kind==='tree'&&center.material!==1))return null;
    let low=Infinity,high=-Infinity;
    for(let z=Math.floor(point.z-edge);z<=Math.floor(point.z+edge);z++){
      for(let x=Math.floor(point.x-edge);x<=Math.floor(point.x+edge);x++){
        if(!containsHuntLandform(region,x,z))return null;
        const column=surface(x,z);
        if(!column)return null;
        low=Math.min(low,column.low);
        high=Math.max(high,column.high);
      }
    }
    return high-low<=MAX_GRADE_TENTHS?center.center/10:null;
  };

  const placements=[];
  // Each accepted cluster gets a deterministic local search around its anchor.
  // Sparse or steep areas can reject an entire cluster without forcing fillers.
  for(let cluster=0;cluster<36&&placements.length<=MAX_PLACEMENTS-2;cluster++){
    const kind=cluster%3===0?'boulder':'tree';
    const center={
      x:bounds.minX+Math.floor(next()*(bounds.maxX-bounds.minX+1)),
      z:bounds.minZ+Math.floor(next()*(bounds.maxZ-bounds.minZ+1))
    };
    const members=[];
    for(let attempt=0;attempt<18&&members.length<4;attempt++){
      const point={x:center.x+Math.floor(next()*9)-3.5,z:center.z+Math.floor(next()*9)-3.5};
      const scale=.8+Math.floor(next()*5)/10;
      const radius=(kind==='tree'?.65:.85)*scale;
      if([...placements,...members].some(p=>distance(p.position,point)<p.footprint.radius+radius+clearance))continue;
      const y=eligible(point,radius,kind);
      if(y===null)continue;
      members.push(Object.freeze({
        id:region.id+':'+seed.toString(16)+':'+cluster+':'+attempt,
        clusterId:region.id+':'+cluster,kind,material:kind==='tree'?'wood':'stone',
        position:Object.freeze({...point,y}),scale,seed:state,
        footprint:Object.freeze({shape:'circle',radius})
      }));
    }
    if(members.length>=2)placements.push(...members.slice(0,MAX_PLACEMENTS-placements.length));
  }
  return Object.freeze({schema:WET_FOREST_PLACEMENT_SCHEMA,regionId:region.id,
    seed,worldRevision:recipe.worldRevision,placements:Object.freeze(placements)});
}
