// On-demand physical Hunt region geometry, not an eager whole-expedition
// VoxelWorld. World coordinates are stable across 32m cells and every
// declared cardinal crossing uses a physically level 6m-wide port.
// The integration root injects the public Voxel V2 terrain adapter.
// Full streaming lifecycle/actor traversal across regions is a later gate.
import { siteNoise } from './map-kinds.mjs';
import {
  HUNT_EXPEDITION_PLAN_SCHEMA,HUNT_REGION_EDGE
} from './hunt-expedition-plan.mjs';

export const HUNT_EXPEDITION_REGION_SCHEMA='wyrmforge.hunt-expedition-region.v1';
export const HUNT_EXPEDITION_GEOMETRY_VERSION='worldgen-expedition-v0.2';
// The original -3m bottom forced a whole second negative-Y chunk layer for
// every 16m chunk even though this early walking slice has no caves. Keep
// seven metres of real destructible strata under the 6m routes instead.
const FLOOR=0,PORT_Y=6,HALF=HUNT_REGION_EDGE/2;
const clamp=(n,a,b)=>Math.max(a,Math.min(b,n));
const smooth=v=>v*v*(3-2*v);
function fnv32(source) {
  let hash=0x811c9dc5;
  for(let i=0;i<source.length;i++) {
    hash=Math.imul(hash^source.charCodeAt(i),0x01000193);
  }
  return hash>>>0;
}
function segmentDistance(x,z,a,b) {
  const dx=b.x-a.x,dz=b.z-a.z;
  const length=dx*dx+dz*dz;
  if(length===0)return Math.hypot(x-a.x,z-a.z);
  const t=clamp(((x-a.x)*dx+(z-a.z)*dz)/length,0,1);
  return Math.hypot(x-a.x-dx*t,z-a.z-dz*t);
}
function regionPorts(plan,region) {
  const {x,z}=region.origin;
  const additional=[];
  if(region.id===plan.entryRegionId)additional.push(Object.freeze({
    id:'world-map-entry',direction:'south',
    at:Object.freeze({x,z:z+HALF-1}),widthMetres:7,
    peerRegionId:null
  }));
  if(region.id===plan.exitRegionId)additional.push(Object.freeze({
    id:'world-map-extraction',direction:'north',
    at:Object.freeze({x,z:z-HALF}),widthMetres:7,
    peerRegionId:null
  }));
  return Object.freeze([...region.ports,...additional]);
}

// Stage/role affects *interior* landscape only. At region edges all
// providers sample the SAME world-space geography with no local offset:
// no seed-specific tile seams, cliffs or duplicated XY cells.
function naturalHeight(plan,region,x,z,seed) {
  const {bounds,origin}=region;
  const fromEdge=Math.min(
    x-bounds.minX,bounds.maxX-x,z-bounds.minZ,bounds.maxZ-z
  );
  const interior=smooth(clamp((fromEdge-2)/8,0,1));
  const global=2*(siteNoise(seed,x,z,20,11)-0.5);
  const highlands=['forest-highland','mountain-pass','scorched-approach',
    'mini-boss-arena','wyrm-lair'].includes(plan.recipe.kind);
  const rocky=['scorched-approach','mini-boss-arena','wyrm-lair']
    .includes(plan.recipe.kind);
  const amplitude=rocky?5:highlands?3.5:2;
  const ridges=(siteNoise(seed,x,z,15,12)-0.5)*amplitude;
  const spur=(siteNoise(seed,x,z,9,13)-0.5)*1.6;
  const side=region.role==='flank'?1.2:
    region.role==='investigation'?0.6:0;
  const away=Math.min(1,Math.hypot(x-origin.x,z-origin.z)/12);
  return clamp(Math.round(PORT_Y+global+
    interior*(ridges+spur+side*away)),2,18);
}
function cellHeight(plan,region,x,z,ports,seed) {
  const nature=naturalHeight(plan,region,x,z,seed);
  const {origin}=region;
  const centralRadius=region.role==='horde'?9:
    ['investigation','discovery','extraction'].includes(region.role)?7:6;
  const distance=Math.hypot(x-origin.x,z-origin.z);
  let level=smooth(clamp((centralRadius+2-distance)/2,0,1));
  for(const port of ports) {
    const d=segmentDistance(x,z,origin,port.at);
    const corridor=smooth(clamp((6-d)/2,0,1));
    level=Math.max(level,corridor);
  }
  // A small bridge from natural perimeter to passable expedition lanes.
  // Full-width 1m voxel tops remain genuine solid materials.
  return Math.round(nature*(1-level)+PORT_Y*level);
}
// Surface intent is computed ONCE per X/Z column. The old meshing adapter
// repeatedly sampled seeded noise for each of 7-10 interior voxel layers.
// Forest soil paths are now visible on the actual physical travel corridors;
// this is geological/material intent, not an instantiated World Object.
function topMaterial(plan,region,x,z,ports,seed) {
  const kind=plan.recipe.kind;
  if(['mountain-pass','scorched-approach','mini-boss-arena',
    'wyrm-lair'].includes(kind))return 3;
  let trail=Infinity;
  for(const port of ports) {
    trail=Math.min(trail,segmentDistance(x,z,region.origin,port.at));
  }
  const drift=(siteNoise(seed,x,z,9,22)-0.5)*0.8;
  if(trail<1.25+drift)return 2;
  // A few naturally clustered exposed stones off the actual corridors.
  // Avoid isolated per-voxel salt-and-pepper grass squares.
  if(trail>4.5 && siteNoise(seed,x,z,15,21)>
    (kind==='forest-highland'?0.89:0.967))return 3;
  return 1;
}
function belowSurface(material,y,top) {
  if(y===top)return material;
  if(material===3)return 3;
  return y>=top-2?2:3;
}

export function generateHuntExpeditionRegion(plan,regionId,{terrainAdapter}={}) {
  if(!plan || plan.schema!==HUNT_EXPEDITION_PLAN_SCHEMA ||
      typeof terrainAdapter!=='function' || typeof regionId!=='string') {
    throw new TypeError('Expected a Hunt expedition, region ID and injected terrain adapter');
  }
  const region=plan.regions.find(item=>item.id===regionId);
  if(!region)throw new RangeError('Unknown Hunt expedition region '+regionId);
  const {recipe}=plan;
  const seed=(recipe.seed^fnv32(
    recipe.journeyId+'/'+recipe.huntId+'/'+recipe.worldRevision
  ))>>>0;
  const ports=regionPorts(plan,region);
  const {minX,maxX,minZ,maxZ}=region.bounds;
  const side=HUNT_REGION_EDGE;
  const heights=new Int16Array(side*side);
  let minY=Infinity,maxY=-Infinity;
  for(let z=minZ;z<=maxZ;z++)for(let x=minX;x<=maxX;x++) {
    const height=cellHeight(plan,region,x,z,ports,seed);
    heights[(z-minZ)*side+x-minX]=height;
    minY=Math.min(minY,height);
    maxY=Math.max(maxY,height);
  }
  const at=(x,z)=>heights[(z-minZ)*side+x-minX];
  const surfaces=new Uint8Array(side*side);
  for(let z=minZ;z<=maxZ;z++)for(let x=minX;x<=maxX;x++) {
    surfaces[(z-minZ)*side+x-minX]=topMaterial(
      plan,region,x,z,ports,seed);
  }
  const materialAt=(x,z,y)=>belowSurface(
    surfaces[(z-minZ)*side+x-minX],y,at(x,z));
  const audits=[];
  for(const port of ports) {
    const {x,z}=port.at;
    const dx=Math.sign(x-region.origin.x),
      dz=Math.sign(z-region.origin.z);
    const steps=Math.max(Math.abs(x-region.origin.x),
      Math.abs(z-region.origin.z));
    for(let i=0;i<=steps;i++) {
      const px=region.origin.x+i*dx,pz=region.origin.z+i*dz;
      if(at(px,pz)!==PORT_Y) {
        throw new Error('Physical route-to-port grade must be level: '+port.id);
      }
    }
    const lateral=dx ? 'z':'x';
    for(let offset=-3;offset<=3;offset++) {
      const point={x,z};point[lateral]+=offset;
      if(point.x<minX||point.x>maxX||
          point.z<minZ||point.z>maxZ || at(point.x,point.z)!==PORT_Y) {
        throw new Error('Seven-metre-wide terrain seam is not physically level: '+port.id);
      }
    }
    audits.push(Object.freeze({id:port.id,
      at:port.at,heightMetres:PORT_Y,passageWidthMetres:7,ready:true}));
  }
  // Canonical world-coordinate X-directed solid runs. Only ONE region's
  // definition is allocated at a time, keeping Voxel V2's original
  // bounded loader and per-frame cell budget unchanged.
  const runs=[];
  for(let y=FLOOR;y<=maxY;y++)for(let z=minZ;z<=maxZ;z++) {
    let x=minX;
    while(x<=maxX) {
      const top=at(x,z);
      if(y>top) {x++;continue;}
      const material=materialAt(x,z,y);
      let end=x+1;
      while(end<=maxX && y<=at(end,z) &&
          materialAt(end,z,y)===material)end++;
      runs.push({x,y,z,length:end-x,material});
      x=end;
    }
  }
  const definition=terrainAdapter({
    siteId:recipe.huntId+'-'+regionId,
    seed:recipe.seed,chunkEdge:recipe.chunkEdge,
    generatorVersion:HUNT_EXPEDITION_GEOMETRY_VERSION,
    runs
  });
  const layout=Object.freeze({
    schema:HUNT_EXPEDITION_REGION_SCHEMA,
    id:region.id,role:region.role,
    footprint:Object.freeze({...region.bounds,minY:FLOOR,maxY}),
    center:Object.freeze({...region.origin,surfaceY:at(
      region.origin.x,region.origin.z)+1}),
    ports:Object.freeze(audits),opportunities:region.opportunities,
    // Explicit stage limitations: prettier terrain alone is not a forest.
    sceneContent:'terrain-and-paths-only',
    hasLiveEnemies:false,hasInvestigations:false,
    physicalRoutePortsReady:audits.every(item=>item.ready)
  });
  return Object.freeze({
    schema:HUNT_EXPEDITION_REGION_SCHEMA,planHash:plan.hash,
    regionId,layout,definition,
    // Canonical ordering and world-space coordinates make regenerated
    // region definitions identical regardless of request order.
    hash:'hunt-region-'+fnv32(JSON.stringify([
      plan.hash,regionId,definition.runs,layout
    ])).toString(16).padStart(8,'0')
  });
}
