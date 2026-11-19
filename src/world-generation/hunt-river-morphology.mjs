// WorldGen-owned real-water corridor morphology. Only native Voxel runs and
// 10cm micro-occupancy are authored here; Water V2 still owns all liquid
// volume, currents, bank breaches and renderer-independent surface heights.
import {containsHuntLandform} from './hunt-landform-footprint.mjs';

export const HUNT_RIVER_MORPHOLOGY_SCHEMA='wyrmforge.hunt-river-morphology.v1';
export const MAX_RIVER_LATERAL_CELLS=256;
export const MAX_RIVER_BANK_MICRO_TILES=64;
export const MAX_RIVER_BREACHABLE_BANK_COLUMNS=12;
export const MAX_RIVER_INTERIOR_ISLETS=24;
const key=(x,z)=>x+','+z;
const DIRECTIONS=[[1,0],[-1,0],[0,1],[0,-1]];
const finiteCell=cell=>Number.isSafeInteger(cell?.x)&&Number.isSafeInteger(cell?.z);

// A real Hunt path connects authored region ports. Width must NEVER be
// gained by cutting the adjacent high walking approaches: the 1m stone ford
// protects the old centerline, and this buffer protects its neighboring dry
// shoulder from lateral river excavation.
function withinAuthoredTravelShoulder(landform,x,z){
  const ports=landform.ports;
  if(!Array.isArray(ports)||ports.length<2)return false;
  for(let a=0;a<ports.length;a++)for(let b=a+1;b<ports.length;b++){
    const start=ports[a].at,end=ports[b].at;
    const dx=end.x-start.x,dz=end.z-start.z;
    const t=Math.max(0,Math.min(1,
      ((x-start.x)*dx+(z-start.z)*dz)/(dx*dx+dz*dz||1)));
    const distance=Math.hypot(x-start.x-t*dx,z-start.z-t*dz);
    if(distance<=3.5)return true;
  }
  return false;
}

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
    // Old widening put an identical +1m strip on BOTH sides of every
    // point, then abruptly switched to the 1m seam: a rectangular blue
    // patch joined to a narrow line. Taper naturally through 1m -> 2m ->
    // uneven 2–4m woodland banks, using coarse world-anchored noise so
    // neighboring rows do not independently flicker in width.
    const endDistance=Math.min(i,part.length-1-i);
    const coarseX=Math.floor(point.x/4),coarseZ=Math.floor(point.z/4);
    const firstSide=seededHash(seed,coarseX,coarseZ)&1?1:-1;
    for(const sign of [-1,1]){
      const variation=seededHash(seed,coarseX,coarseZ,sign)%11;
      const reach=endDistance===0?0:
        endDistance===1?(sign===firstSide?1:0):
        variation<2?0:variation===10?2:1;
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
            top.topY-grade>maxCutMetres||
            withinAuthoredTravelShoulder(landform,x,z)){
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

// A single full-metre DRY Voxel surrounded by four truly wet riverbed
// columns makes a black rectangular "hole" inside a broad blue pool. Close
// only that accidental one-cell gap by excavating REAL stone and publishing
// an additional wet channel cell. Never fake water over dry Voxel, remove
// road material, erase a larger stone island, or modify a walking shoulder.
// This is a one-pass bounded topology repair, not flood fill.
export function closeHuntRiverInteriorIslets({
  band,changes,landform,columns,
  maxCells=MAX_RIVER_INTERIOR_ISLETS,maxCutMetres=3
}={}){
  if(!band?.definition?.runs||!(changes instanceof Map)||!landform||
      !(columns instanceof Map)||!Number.isSafeInteger(maxCells)||
      maxCells<0||maxCells>MAX_RIVER_INTERIOR_ISLETS||
      !Number.isSafeInteger(maxCutMetres)||maxCutMetres<1||maxCutMetres>3){
    throw new TypeError('Expected bounded native Voxel river islet inputs');
  }
  const wet=new Map((band.fluidLayout?.riverChannels?.[0]?.floor??[])
    .map(cell=>[key(cell.x,cell.z),{
      x:cell.x,z:cell.z,floorY:changes.get(key(cell.x,cell.z))?.floorY??cell.y,
      flowX:cell.flowX??0,flowZ:cell.flowZ??0
    }]));
  for(const [id,change] of changes){
    if(change.dryBank)continue;
    const [x,z]=id.split(',').map(Number);
    wet.set(id,{x,z,...change});
  }
  const candidates=new Map();
  for(const cell of wet.values())for(const [dx,dz] of DIRECTIONS){
    const x=cell.x+dx,z=cell.z+dz,id=key(x,z);
    if(wet.has(id)||candidates.has(id)||!containsHuntLandform(landform,x,z)||
        withinAuthoredTravelShoulder(landform,x,z))continue;
    const solid=columns.get(id);
    if(!solid||![1,3].includes(solid.material))continue;
    const ring=DIRECTIONS.map(([rx,rz])=>wet.get(key(x+rx,z+rz)));
    if(ring.some(neighbor=>!neighbor))continue;
    const floors=ring.map(neighbor=>neighbor.floorY);
    const minimum=Math.min(...floors),maximum=Math.max(...floors);
    const cut=solid.topY-minimum;
    if(maximum-minimum>1||cut<1||cut>maxCutMetres)continue;
    const flow=ring.find(neighbor=>neighbor.flowX||neighbor.flowZ)??ring[0];
    candidates.set(id,{x,z,floorY:minimum,flowX:flow.flowX??0,
      flowZ:flow.flowZ??0,lateral:true,interiorIslet:true});
  }
  let repaired=0;
  const ordered=[...candidates.values()].sort((a,b)=>a.z-b.z||a.x-b.x);
  for(const candidate of ordered.slice(0,maxCells)){
    changes.set(key(candidate.x,candidate.z),candidate);
    repaired++;
  }
  return repaired;
}

const tileKey=tile=>tile.x+','+tile.y+','+tile.z;

// Keep actual Water V2 head below the LOWEST adjacent dry 10cm grass
// microbank. Simply recessing every channel 1m below its OLD riverbed was
// insufficient: the original river could be HIGHER than neighboring grass.
// This is a native WorldGen/Voxel floor adjustment, never a render offset.
export function recessHuntRiverBelowGrass(band,changes,columns,fords=new Set()){
  if(!band?.definition||!(changes instanceof Map)||
      !(columns instanceof Map)||!(fords instanceof Set)){
    throw new TypeError('Expected native WorldGen wet bank floor planning');
  }
  // Microtile surfaces are published as independent physical geometry.
  // Their topmost run can be stone, grass or no longer present in the
  // original coarse run map after native WorldGen composes the graph. Lookup
  // by XY parent tile directly: inferring the rim from a coarse material
  // category silently skipped the exact raised stone shoreline in seed 7.
  const bankTiles=new Map();
  for(const tile of band.definition.surfaceTiles??[]){
    if(!Array.isArray(tile.levels)||tile.levels.length!==100)continue;
    const id=key(tile.x,tile.z);
    if(!bankTiles.has(id))bankTiles.set(id,[]);
    bankTiles.get(id).push(tile);
  }
  let lowered=0;
  for(const [id,bed] of [...changes]){
    if(bed.dryBank)continue;
    const [x,z]=id.split(',').map(Number);
    let target=bed.floorY;
    for(const [dx,dz] of DIRECTIONS){
      const bx=x+dx,bz=z+dz,bankId=key(bx,bz);
      if(changes.has(bankId))continue;
      const bank=columns.get(bankId);
      if(bank?.material===2)continue; // protected native walking roads
      const tiles=bankTiles.get(bankId)??[];
      if(!bank&&!tiles.length)continue;
      let rim=bank?.topY??Infinity;
      // A newly authored ramp can lower a dry bank edge by up to 50cm.
      if(Number.isFinite(rim))rim-=.5;
      for(const tile of tiles){
        let lowest=10;
        for(let t=0;t<10;t++){
          const ix=dx===1?0:dx===-1?9:t;
          const iz=dz===1?0:dz===-1?9:t;
          lowest=Math.min(lowest,tile.levels[iz*10+ix]);
        }
        rim=Math.min(rim,tile.y+lowest/10);
      }
      // Crossings need the existing walkable <=55cm rises. Give only the
      // explicitly mapped ford its former 50cm margin; non-ford shores
      // need 90cm for their observed sustained 70-80cm pool head. Carve
      // physical native Voxel beds, never a decorative shader offset.
      const clearance=fords.has(id)?.5:.9;
      if(Number.isFinite(rim)){
        target=Math.min(target,Math.floor(rim-clearance+1e-6));
      }
    }
    if(target<bed.floorY){
      changes.set(id,{...bed,floorY:target});
      lowered++;
    }
  }
  return lowered;
}

// Riverbank crests can be 3-5m above a recessed 40cm stream. A normal 2m
// Fireball then cannot physically connect a crater to Water V2. Make a FEW
// natural, separated dry stone shelves near the authored river instead of
// teaching Water to cross intact higher solid. WorldGen alone authors these
// native Voxel cuts; they are not part of the wet river channel.
export function prepareHuntBreachableBankTerraces({
  band,changes,landform,maxCells=MAX_RIVER_BREACHABLE_BANK_COLUMNS
}={}){
  if(!band?.definition?.runs||!(changes instanceof Map)||!landform||
      !Number.isSafeInteger(maxCells)||maxCells<0||
      maxCells>MAX_RIVER_BREACHABLE_BANK_COLUMNS){
    throw new TypeError('Expected authored dry riverbank terrace inputs');
  }
  const columns=indexRiverTerrainColumns(band.definition.runs);
  const seed=band.definition.seed??7;
  const candidates=new Map();
  for(const [id,bed] of changes){
    if(bed.dryBank)continue;
    const [x,z]=id.split(',').map(Number);
    for(const [dx,dz] of DIRECTIONS){
      const bx=x+dx,bz=z+dz,bankId=key(bx,bz);
      if(changes.has(bankId)||!containsHuntLandform(landform,bx,bz)||
          bx<=landform.bounds.minX+1||bx>=landform.bounds.maxX-1||
          bz<=landform.bounds.minZ+1||bz>=landform.bounds.maxZ-1||
          withinAuthoredTravelShoulder(landform,bx,bz))continue;
      const existing=columns.get(bankId);
      // Avoid roads and deep cliffs. Only low solid grass shelves bounded
      // to 1-3m of actual excavation become safely breachable shore banks.
      const floorY=bed.floorY+1;
      const cut=(existing?.topY??0)-floorY;
      if(existing?.material!==1||cut<1||cut>3)continue;
      const candidate={x:bx,z:bz,floorY,cut,
        rank:seededHash(seed,bx,bz)};
      const previous=candidates.get(bankId);
      if(!previous||candidate.cut<previous.cut)candidates.set(bankId,candidate);
    }
  }
  const sorted=[...candidates.values()].sort((a,b)=>
    a.rank-b.rank||a.z-b.z||a.x-b.x);
  const selected=[];
  for(const item of sorted){
    if(selected.length>=maxCells)break;
    // Breakable shoulders should not become an artificial straight trench.
    if(selected.some(old=>
      Math.abs(old.x-item.x)+Math.abs(old.z-item.z)<3))continue;
    selected.push(item);
  }
  return Object.freeze(selected.map(({x,z,floorY})=>
    Object.freeze({x,z,floorY,dryBank:true})));
}

// True, sparse 10cm micro-occupancy on EXISTING DRY grass. The inland
// grass remains full-height; only the first 40cm at the shore is stepped.
// We neither add decorative water nor rewrite the water-column solver floor.
export function composeHuntRiverBankTiles({
  band,part,changes,columns,fords=new Set(),
  maxTiles=MAX_RIVER_BANK_MICRO_TILES
}={}){
  if(!band?.definition?.runs||!Array.isArray(part)||
      !(changes instanceof Map)||!(columns instanceof Map)||
      !(fords instanceof Set)||
      !Number.isSafeInteger(maxTiles)||maxTiles<0||maxTiles>MAX_RIVER_BANK_MICRO_TILES){
    throw new TypeError('Expected bounded real Voxel shoreline surface');
  }
  const candidates=new Map();
  for(const [id,bed] of changes){
    if(bed.dryBank)continue;
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
  const fordApproach=point=>DIRECTIONS.some(([dx,dz])=>
    point.sides.has(key(dx,dz))&&fords.has(key(point.x+dx,point.z+dz)));
  const ranked=[...candidates.values()].sort((a,b)=>{
    // Travel approaches to recessed physical fords need real 10cm ramps
    // before optional scenic bank detailing consumes the 64-tile budget.
    const fordFirst=Number(fordApproach(b))-Number(fordApproach(a));
    if(fordFirst)return fordFirst;
    const score=point=>Math.min(...part.map(p=>
      (p.x-point.x)**2+(p.z-point.z)**2));
    return score(a)-score(b)||a.z-b.z||a.x-b.x;
  });
  const seed=band.definition.seed??7;
  for(const item of ranked.slice(0,maxTiles)){
    const {x,z,bank,sides}=item,y=bank.topVoxelY;
    const steppingApproach=fordApproach(item);
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
      const shallowCut=distance<=1?4+noise:distance<=3?3:
        distance<=5?1:0;
      // A dry bank center was previously a 0.9–1.0m vertical climb from
      // the newly recessed true ford, making the Hunt route impassable.
      // A *native* 10cm micro-voxel 50cm bank approach is traversable by
      // the existing 55cm automatic hop, and eases into full-height grass.
      // Keep the river-facing edge at least 10cm above 40cm-deep water.
      const cut=steppingApproach
        ?Math.max(shallowCut,distance<=7?5:distance<=8?3:1)
        :shallowCut;
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
