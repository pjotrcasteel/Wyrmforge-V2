// WorldGen-owned real-water corridor morphology. Only native Voxel runs and
// 10cm micro-occupancy are authored here; Water V2 still owns all liquid
// volume, currents, bank breaches and renderer-independent surface heights.
import {containsHuntLandform} from './hunt-landform-footprint.mjs';

export const HUNT_RIVER_MORPHOLOGY_SCHEMA='wyrmforge.hunt-river-morphology.v1';
export const MAX_RIVER_LATERAL_CELLS=256;
export const MAX_RIVER_BANK_MICRO_TILES=64;
const key=(x,z)=>x+','+z;
const DIRECTIONS=[[1,0],[-1,0],[0,1],[0,-1]];
const finiteCell=cell=>Number.isSafeInteger(cell?.x)&&Number.isSafeInteger(cell?.z);

function seededHash(seed,x,z,side=0){
  let value=(seed^Math.imul(x,73856093)^Math.imul(z,19349663)^
    Math.imul(side+1,83492791))>>>0;
  value=Math.imul(value^(value>>>16),2246822507);
  value=Math.imul(value^(value>>>13),3266489909);
  return (value^(value>>>16))>>>0;
}

// Read existing authored run columns, never a second Voxel authority.
// Material 2 is reserved road; it must never become an accidental river.
export function indexRiverTerrainColumns(runs){
  if(!Array.isArray(runs))throw new TypeError('Expected published WorldGen terrain runs');
  const columns=new Map();
  for(const run of runs){
    for(let x=run.x;x<run.x+run.length;x++){
      const id=key(x,run.z);
      const existing=columns.get(id);
      if(!existing||existing.topY<run.y+1){
        columns.set(id,{x,z:run.z,topY:run.y+1,
          topVoxelY:run.y,material:run.material});
      }
    }
  }
  return columns;
}

// Two adjacent real stone/air columns on ordinary reaches, plus a third
// seeded side-lobe when safe. This makes the 1m BFS connector become a
// physical, slightly uneven 2–4m stream WITHOUT editing its protected ford,
// existing river, player road, or crossing an unowned WorldGen landform.
// Keep new lateral cells at the lower genuine water grade so the original
// shallow stone ford cannot dam the only hydraulic pathway.
export function expandHuntRiverCorridor(band,part,grade,changes,landform,{
  maxCells=MAX_RIVER_LATERAL_CELLS,maxCutMetres=12
}={}){
  if(!band?.definition?.runs||!Array.isArray(part)||part.length<1||
      !Number.isSafeInteger(grade)||!(changes instanceof Map)||!landform||
      !Number.isSafeInteger(maxCells)||maxCells<0||maxCells>MAX_RIVER_LATERAL_CELLS){
    throw new TypeError('Expected bounded authored corridor and native Voxel definitions');
  }
  const columns=indexRiverTerrainColumns(band.definition.runs);
  const seed=band.definition.seed??7;
  let created=0;
  for(let i=0;i<part.length&&created<maxCells;i++){
    const point=part[i];
    if(!finiteCell(point))throw new TypeError('Invalid WorldGen river corridor point');
    const before=part[Math.max(0,i-1)],after=part[Math.min(part.length-1,i+1)];
    const flowX=after.x-before.x,flowZ=after.z-before.z;
    if(!flowX&&!flowZ)continue;
    const sideways=Math.abs(flowZ)>=Math.abs(flowX)?[1,0]:[0,1];
    // Always seek the first physical bank cell on both sides, with a sparse
    // second outer column for natural, non-rectangular woodland width.
    for(const sign of [-1,1]){
      const reach=seededHash(seed,point.x,point.z,sign)%7===0?2:1;
      for(let distance=1;distance<=reach&&created<maxCells;distance++){
        const x=point.x+sideways[0]*sign*distance;
        const z=point.z+sideways[1]*sign*distance;
        // The two real seam descriptors still own the narrow 1m cross-band
        // connection; never paint a wider artificial water face at a seam.
        if(x<=landform.bounds.minX||x>=landform.bounds.maxX||
            z<=landform.bounds.minZ||z>=landform.bounds.maxZ||
            !containsHuntLandform(landform,x,z)){
          break;
        }
        const id=key(x,z);
        if(changes.has(id))continue;
        const top=columns.get(id);
        if(!top||top.material===2||top.topY<grade||
            top.topY-grade>maxCutMetres){
          break;
        }
        changes.set(id,{floorY:grade,lateral:true,flowX,flowZ});
        created++;
      }
    }
  }
  return Object.freeze({schema:HUNT_RIVER_MORPHOLOGY_SCHEMA,
    addedWetCells:created,columns});
}

const tileKey=tile=>tile.x+','+tile.y+','+tile.z;

// True, sparse 10cm micro-occupancy on EXISTING DRY grass. The inland
// grass remains full-height; only the first 40cm at the shore is stepped.
// We neither add decorative water nor rewrite the water-column solver floor.
export function composeHuntRiverBankTiles({
  band,part,changes,columns,maxTiles=MAX_RIVER_BANK_MICRO_TILES
}={}){
  if(!band?.definition?.runs||!Array.isArray(part)||
      !(changes instanceof Map)||!(columns instanceof Map)||
      !Number.isSafeInteger(maxTiles)||maxTiles<0||maxTiles>MAX_RIVER_BANK_MICRO_TILES){
    throw new TypeError('Expected bounded real Voxel shoreline surface');
  }
  const candidates=new Map();
  for(const [id,bed] of changes){
    const [x,z]=id.split(',').map(Number);
    for(const [dx,dz] of DIRECTIONS){
      const nx=x+dx,nz=z+dz,nid=key(nx,nz);
      if(changes.has(nid))continue;
      const bank=columns.get(nid);
      if(!bank||bank.material!==1||bank.topY<=bed.floorY)continue;
      if(!candidates.has(nid)){
        candidates.set(nid,{x:nx,z:nz,bank,sides:new Set()});
      }
      candidates.get(nid).sides.add(key(-dx,-dz));
    }
  }
  const old=(band.definition.surfaceTiles??[])
    .filter(tile=>!changes.has(key(tile.x,tile.z)));
  const existing=new Map(old.map(tile=>[tileKey(tile),tile]));
  const output=[],modified=new Set();
  const ranked=[...candidates.values()].sort((a,b)=>{
    const score=point=>Math.min(...part.map(p=>
      (p.x-point.x)**2+(p.z-point.z)**2));
    return score(a)-score(b)||a.z-b.z||a.x-b.x;
  });
  const seed=band.definition.seed??7;
  for(const item of ranked.slice(0,maxTiles)){
    const {x,z,bank,sides}=item,y=bank.topVoxelY;
    const original=existing.get(tileKey({x,y,z}));
    const prior=original?.levels??Array(100).fill(10);
    if(prior.length!==100)throw new RangeError('Invalid parent Voxel microtile');
    const levels=[];
    let changed=false;
    for(let iz=0;iz<10;iz++)for(let ix=0;ix<10;ix++){
      let distance=10;
      if(sides.has('1,0'))distance=Math.min(distance,9-ix);
      if(sides.has('-1,0'))distance=Math.min(distance,ix);
      if(sides.has('0,1'))distance=Math.min(distance,9-iz);
      if(sides.has('0,-1'))distance=Math.min(distance,iz);
      // Stable 10cm-gridded stone/dirt shoulders, not a flat 1m square
      // wall or procedural triangle. The edge varies by one 10cm step.
      const noise=seededHash(seed,x*10+ix,z*10+iz)%5===0?1:0;
      const cut=distance<=1?4+noise:distance<=3?3:
        distance<=5?1:0;
      const height=Math.min(prior[iz*10+ix],10-cut);
      if(height!==prior[iz*10+ix])changed=true;
      levels.push(height);
    }
    if(!changed)continue;
    output.push({x,y,z,levels});
    modified.add(tileKey({x,y,z}));
  }
  const untouched=old.filter(tile=>!modified.has(tileKey(tile)));
  return Object.freeze({
    schema:HUNT_RIVER_MORPHOLOGY_SCHEMA,
    tiles:Object.freeze([...untouched,...output].sort((a,b)=>
      a.y-b.y||a.z-b.z||a.x-b.x)),
    bankTiles:output.length,
    protectedTiles:untouched.length
  });
}

// Vegetation and rocks are authored BEFORE the extra river is excavated.
// The WorldGen graph must exclude placements whose real reserved footprint
// overlaps the new water or its immediate wet bank; render-only culling
// would leave invisible tree/prop colliders blocking the Hunt actor.
export function excludeHuntRiverPlacements(placement,channel,{
  bankMargin=.35
}={}){
  if(!Array.isArray(placement?.placements)||!Array.isArray(channel?.floor)||
      !Number.isFinite(bankMargin)||bankMargin<0||bankMargin>2){
    throw new TypeError('Expected authored woodland placements and a published river channel');
  }
  const cells=channel.floor;
  const overlaps=item=>{
    const {x,z}=item.position??{};
    const radius=item.footprint?.radius??0;
    if(!Number.isFinite(x)||!Number.isFinite(z)||
        !Number.isFinite(radius)||radius<0)return true;
    for(const wet of cells){
      const dx=Math.max(0,Math.abs(x-(wet.x+.5))-.5);
      const dz=Math.max(0,Math.abs(z-(wet.z+.5))-.5);
      if(dx*dx+dz*dz<(radius+bankMargin)**2)return true;
    }
    return false;
  };
  const retained=placement.placements.filter(item=>!overlaps(item));
  return Object.freeze({...placement,
    placements:Object.freeze(retained),
    excludedForRiver:placement.placements.length-retained.length
  });
}
