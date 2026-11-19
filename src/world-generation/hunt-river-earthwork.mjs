// WorldGen-owned, immutable **physical** riverbed preparation.
// Turns an already-grounded region -> link -> region proposal into native
// Voxel terrain runs. This does not mutate a live Voxel world or create water.
// A host must still publish these exact definitions before opening Fluid V2.
import {HUNT_RIVER_CORRIDOR_PLAN_SCHEMA} from './hunt-river-corridor-plan.mjs';
import {
  expandHuntRiverCorridor,recessHuntRiverBelowGrass,
  prepareHuntBreachableBankTerraces,composeHuntRiverBankTiles,
  excludeHuntRiverPlacements
} from './hunt-river-morphology.mjs';

export const HUNT_RIVER_EARTHWORK_SCHEMA='wyrmforge.hunt-river-earthwork.v1';
export const HUNT_RIVER_RECESS_METRES=1; // additional true Voxel cut below the authored channel
const key=(x,z)=>x+','+z;

function topFaces(runs,cells){
  const heights=new Map();
  for(const run of runs){
    for(let x=run.x;x<run.x+run.length;x++){
      const id=key(x,run.z);
      if(cells.has(id))heights.set(id,Math.max(heights.get(id)??-Infinity,run.y+1));
    }
  }
  return heights;
}

function carveRuns(runs,changes,heights,maxFillMetres){
  const result=[];
  const rows=new Map();
  for(const [id,change] of changes){
    const [x,z]=id.split(',').map(Number);
    const row=rows.get(z)??[];
    row.push({x,z,floorY:change.floorY});
    rows.set(z,row);
  }
  for(const row of rows.values())row.sort((a,b)=>a.x-b.x);
  // The native run is copied byte-for-byte whenever it does not intersect
  // the proposed channel. Changed runs are split only at channel columns.
  // This is safer than expanding/recompressing the entire Voxel landscape.
  const support=new Map(),bedPresent=new Set();
  for(const run of runs){
    const hit=(rows.get(run.z)??[]).filter(cell=>
      cell.x>=run.x&&cell.x<run.x+run.length);
    if(!hit.length){
      result.push(run);
      continue;
    }
    let cursor=run.x;
    for(const cell of hit){
      const id=key(cell.x,cell.z);
      if(cursor<cell.x)result.push({...run,x:cursor,length:cell.x-cursor});
      if(run.y<cell.floorY-1){
        result.push({...run,x:cell.x,length:1});
        support.set(id,Math.max(support.get(id)??-Infinity,run.y));
      }else if(run.y===cell.floorY-1){
        result.push({...run,x:cell.x,length:1,material:3});
        bedPresent.add(id);
      }
      // Voxels at or above the channel's physical water floor are removed.
      cursor=cell.x+1;
    }
    if(cursor<run.x+run.length){
      result.push({...run,x:cursor,length:run.x+run.length-cursor});
    }
  }
  for(const [id,change] of changes){
    const original=heights.get(id);
    const anchor=support.get(id);
    if(!Number.isSafeInteger(original)||!Number.isSafeInteger(anchor)){
      throw new Error('Riverbed has no supported native stone below '+id);
    }
    const missing=Math.max(0,change.floorY-1-anchor);
    if(missing>maxFillMetres){
      throw new RangeError('Unsafe unsupported riverbed cavity at '+id+
        ' requires '+missing+'m of stone support');
    }
    const [x,z]=id.split(',').map(Number);
    for(let y=anchor+1;y<change.floorY;y++){
      if(y===change.floorY-1&&bedPresent.has(id))continue;
      result.push({x,y,z,length:1,material:3});
    }
  }
  return result;
}

// A continuously deep bank can create an impassable trench across the Hunt.
// Preserve short, genuinely shallower native Voxel fords along WorldGen's
// authored port-to-port travel corridors. These are still ordinary real
// riverbed solids and water columns; no phantom bridge, actor teleport or
// Water-engine collision exception.
function riverFordCells(region,existing){
  if(!region||!existing?.floor?.length||region.ports.length<2)return new Set();
  const portals=region.ports.map(port=>port.at);
  const distance=(point,a,b)=>{
    const dx=b.x-a.x,dz=b.z-a.z;
    const fraction=Math.max(0,Math.min(1,
      ((point.x-a.x)*dx+(point.z-a.z)*dz)/(dx*dx+dz*dz||1)));
    return Math.hypot(point.x-a.x-dx*fraction,point.z-a.z-dz*fraction);
  };
  const result=new Set();
  for(const cell of existing.floor){
    for(let a=0;a<portals.length;a++){
      for(let b=a+1;b<portals.length;b++){
        if(distance(cell,portals[a],portals[b])<=2.5){
          result.add(key(cell.x,cell.z));
        }
      }
    }
  }
  return result;
}

function channelForBand(band,part,grade,changes){
  const existing=band.fluidLayout?.riverChannels?.[0];
  const cells=new Map(existing?.floor?.map(cell=>[
    key(cell.x,cell.z),Object.freeze({...cell,
      y:changes.get(key(cell.x,cell.z))?.floorY??cell.y})
  ])??[]);
  for(const [i,point]of part.entries()){
    const next=part[Math.min(part.length-1,i+1)];
    const prev=part[Math.max(0,i-1)];
    cells.set(key(point.x,point.z),Object.freeze({
      x:point.x,z:point.z,
      y:changes.get(key(point.x,point.z))?.floorY??grade,
      flowX:next.x-prev.x,flowZ:next.z-prev.z
    }));
  }
  for(const [id,change] of changes){
    if(!change.lateral||cells.has(id))continue;
    const [x,z]=id.split(',').map(Number);
    cells.set(id,Object.freeze({
      x,z,y:change.floorY,flowX:change.flowX,flowZ:change.flowZ
    }));
  }
  const nodes=part.map(({x,z})=>Object.freeze({
    x,z,y:changes.get(key(x,z))?.floorY??grade
  }));
  const channel=Object.freeze({
    kind:'water',
    nodes:Object.freeze(nodes),
    floor:Object.freeze([...cells.values()]),
    from:Object.freeze({x:nodes[0].x,z:nodes[0].z}),
    to:Object.freeze({x:nodes.at(-1).x,z:nodes.at(-1).z})
  });
  return Object.freeze({
    footprint:band.fluidLayout?.footprint??Object.freeze({
      ...band.bounds,
      minY:Math.min(...band.definition.runs.map(run=>run.y)),
      maxY:Math.max(grade,...band.definition.runs.map(run=>run.y+1))
    }),
    riverChannels:Object.freeze([channel]),
    corridorEarthwork:HUNT_RIVER_EARTHWORK_SCHEMA
  });
}

// A recessed pocket is not enough: Water V2 cannot sustain a river that
// must climb one full metre back UP to its original outlet. The previous
// local-only cut passed the initial bank-height test, but accumulated 1.2m
// deep water after 240 fixed steps and overtopped grass again.
//
// Propagate newly lowered native stone beds only in the *authored downstream
// current direction* until every selected outflow neighbor is level/lower.
// This remains WorldGen ownership; no fluid values, new sources or shader
// offsets are fabricated. Existing genuine upstream falls stay intact.
function gradeHuntRiverDownstream(band,part,grade,changes,{reverse=false}={}){
  const prepared=channelForBand(band,part,grade,changes)
    .riverChannels[0].floor.map(cell=>({...cell}));
  const byId=new Map(prepared.map(cell=>[key(cell.x,cell.z),cell]));
  const dirs=[[0,-1],[1,0],[0,1],[-1,0]];
  const fallback=reverse?-1:1;
  const deltaX=(part.at(-1).x-part[0].x)*fallback;
  const deltaZ=(part.at(-1).z-part[0].z)*fallback;
  let lowered=0;
  // Requeue only cells whose native stone level was actually lowered.
  // A descending 1m-to-1m step cannot form a hidden dam downstream.
  const queue=[...prepared];
  for(let cursor=0;cursor<queue.length;cursor++){
    const cell=queue[cursor];
    const vx=Number.isFinite(cell.flowX)&&cell.flowX!==0
      ?cell.flowX*fallback:deltaX;
    const vz=Number.isFinite(cell.flowZ)&&cell.flowZ!==0
      ?cell.flowZ*fallback:deltaZ;
    const targets=dirs.map(([dx,dz])=>{
      const next=byId.get(key(cell.x+dx,cell.z+dz));
      const alignment=dx*vx+dz*vz;
      return next&&alignment>0?{next,alignment}:null;
    }).filter(Boolean).sort((a,b)=>b.alignment-a.alignment||
      a.next.z-b.next.z||a.next.x-b.next.x);
    if(!targets.length)continue;
    const next=targets[0].next;
    if(next.y<=cell.y)continue;
    const nkey=key(next.x,next.z);
    const original=changes.get(nkey);
    if(!original||original.dryBank)continue;
    next.y=cell.y;
    changes.set(nkey,{...original,floorY:next.y});
    queue.push(next);
    lowered++;
    if(lowered>prepared.length*16){
      throw new Error('WorldGen downstream river grading failed to converge');
    }
  }
  return lowered;
}

// Requires a real WorldGen graph and one of its validated proposals.
// Return separate changed **band definitions** for the same original graph;
// no edit is applied to a live terrain port and no snapshot is silently reset.
export function prepareHuntRiverEarthwork(graph,proposal,terrainAdapter,{
  maxCutMetres=12,maxFillMetres=4
}={}){
  if(proposal?.schema!==HUNT_RIVER_CORRIDOR_PLAN_SCHEMA||
      proposal.status!=='proposed-unapplied'||!graph?.layout?.links||
      typeof graph.materialize!=='function'||typeof terrainAdapter!=='function'||
      !Number.isSafeInteger(maxCutMetres)||maxCutMetres<1||maxCutMetres>16||
      !Number.isSafeInteger(maxFillMetres)||maxFillMetres<0||maxFillMetres>8){
    throw new TypeError('Expected a bounded unapplied native WorldGen river proposal');
  }
  const link=graph.layout.links.find(item=>item.id===proposal.linkId);
  if(!link||link.fromId!==proposal.fromRegionId||
      link.toId!==proposal.toRegionId||!Array.isArray(proposal.points)||
      proposal.points.length<3||proposal.points.length>160){
    throw new Error('WorldGen water earthwork link identity mismatch');
  }
  // The previous connector cut reached the original shallow river level,
  // but the rest of the authored channel remained flush with the grass.
  // Recess BOTH the existing river and the new path by a full physical
  // voxel. This keeps water (initially 40cm) below the real dry bank top.
  const grade=Math.min(proposal.sourceFloorY,proposal.targetFloorY)-HUNT_RIVER_RECESS_METRES;
  if(!Number.isSafeInteger(grade))throw new TypeError('Invalid authored river grade');
  const ids=[link.fromId,link.id,link.toId];
  const bands=ids.map(id=>graph.materialize(id));
  const covered=new Set(),edits=[];
  for(const band of bands){
    const points=proposal.points.filter(p=>p.bandId===band.id);
    if(!points.length)throw new Error('Water corridor does not touch all three physical bands');
    const changes=new Map();
    const region=graph.layout.regions.find(item=>item.id===band.id);
    const existingChannel=band.fluidLayout?.riverChannels?.[0];
    const fords=riverFordCells(region,{floor:[
      ...(existingChannel?.floor??[]),...points
    ]});
    // Water V2 MUST sit below the grass even at the crossing: leaving
    // an existing authored ford at its old (grass-level) floor seeded 40cm
    // of water ABOVE the adjacent 10cm microbank. Every actually wet channel
    // gets a real Voxel excavation. Safe walking/crossing is regression
    // checked separately; dry protected roads are not altered.
    for(const cell of existingChannel?.floor??[]){
      const id=key(cell.x,cell.z);
      changes.set(id,{
        floorY:cell.y-HUNT_RIVER_RECESS_METRES
      });
    }
    for(const point of points){
      const id=key(point.x,point.z);
      if(covered.has(id))throw new Error('Overlapping WorldGen channel bands');
      covered.add(id);
      // The crossing remains a true solid stone bed with water above it,
      // but can no longer keep a wet one-metre ford at grass elevation.
      // A shorter bank step is handled by the native Voxel terrain, not by
      // raising the liquid and painting a blue rectangle on the walking path.
      const desired=grade;
      changes.set(id,{floorY:Math.min(desired,
        changes.get(id)?.floorY??desired)});
    }
    // The original centerline is only 1m wide. These are additional, real
    // Voxel river columns alongside it, not renderer-only blue quads.
    const landform=region??graph.layout.links.find(item=>item.id===band.id);
    const widened=expandHuntRiverCorridor(band,points,grade,changes,landform,{
      maxCutMetres
    });
    // An old riverbed can sit ABOVE the adjacent dry bank. Recess each true
    // wet bank contact using its original physical 10cm grass shoulder.
    const lowerBankCount=recessHuntRiverBelowGrass(
      band,changes,widened.columns);
    const downstreamGradeCount=gradeHuntRiverDownstream(
      band,points,grade,changes,{
        reverse:proposal.upstream!==proposal.fromRegionId
      });
    const wetCount=changes.size;
    // These are deliberately DRY, lower native Voxel banks. The water
    // footprint and the existing shallow traversal fords do not change.
    const terraces=prepareHuntBreachableBankTerraces({
      band,changes,landform
    });
    for(const terrace of terraces){
      changes.set(key(terrace.x,terrace.z),terrace);
    }
    const heights=topFaces(band.definition.runs,changes);
    let maxCut=0,maxFill=0;
    for(const [id,change] of changes){
      const top=heights.get(id);
      if(!Number.isSafeInteger(top)){
        throw new Error('WorldGen water corridor cell has no physical supporting Voxel terrain: '+id);
      }
      const cut=top-change.floorY,fill=change.floorY-top;
      maxCut=Math.max(maxCut,cut);
      maxFill=Math.max(maxFill,fill);
      if(cut>maxCutMetres||fill>maxFillMetres){
        throw new RangeError('WorldGen water corridor unsafe earthwork at '+id+
          ' (original '+top+', grade '+grade+')');
      }
    }
    const raw=carveRuns(band.definition.runs,changes,heights,maxFillMetres);
    const shoreline=composeHuntRiverBankTiles({
      band,part:points,changes,columns:widened.columns,fords
    });
    const surfaceTiles=shoreline.tiles;
    const definition=terrainAdapter({
      siteId:band.definition.siteId,seed:band.definition.seed,
      chunkEdge:band.definition.chunkEdge,
      generatorVersion:band.definition.generatorVersion,
      runs:raw,surfaceTiles
    });
    edits.push(Object.freeze({
      ...band,definition,fluidLayout:channelForBand(band,points,grade,changes),
      earthwork:Object.freeze({cellCount:points.length,recessedCells:wetCount,
        lateralWetCells:widened.addedWetCells,
        bankTerraceColumns:Object.freeze(terraces),bankTerraceCount:terraces.length,
        bankMicroTiles:shoreline.bankTiles,
        lowerBankCount,downstreamGradeCount,
        fordCells:Object.freeze([...fords]),maxCutMetres:maxCut,
        maxFillMetres:maxFill,bedFloorY:grade})
    }));
  }
  if(covered.size!==proposal.points.length)throw new Error('Incomplete physical water corridor');
  return Object.freeze({
    schema:HUNT_RIVER_EARTHWORK_SCHEMA,
    linkId:link.id,kind:'water',status:'native-voxel-definitions-prepared',
    bedFloorY:grade,points:proposal.points,
    upstreamRegionId:proposal.upstream,
    bands:Object.freeze(edits)
  });
}

// Overlay only the three validated physical definitions on the original
// immutable WorldGen graph. The rest of Hunt geography stays unmodified.
export function composeHuntRiverEarthworkGraph(graph,earthwork,terrainAdapter){
  if(earthwork?.schema!==HUNT_RIVER_EARTHWORK_SCHEMA||
      earthwork.status!=='native-voxel-definitions-prepared'||
      !Array.isArray(earthwork.bands)||earthwork.bands.length!==3||
      typeof graph?.materialize!=='function'||typeof terrainAdapter!=='function'){
    throw new TypeError('Expected published WorldGen river earthwork definitions');
  }
  const patches=new Map();
  for(const band of earthwork.bands){
    if(patches.has(band.id))throw new Error('Duplicate native water band');
    const boundaryRole=band.id===earthwork.upstreamRegionId?'head':
      band.id===earthwork.linkId?'through':'tail';
    patches.set(band.id,Object.freeze({...band,
      fluidLayout:Object.freeze({...band.fluidLayout,boundaryRole})}));
  }
  const crossings=[];
  for(let i=1;i<earthwork.points.length;i++){
    const before=earthwork.points[i-1],after=earthwork.points[i];
    if(before.bandId===after.bandId)continue;
    crossings.push(Object.freeze({
      id:'river-'+earthwork.linkId+'-'+crossings.length,
      from:Object.freeze({bandId:before.bandId,x:before.x,z:before.z}),
      to:Object.freeze({bandId:after.bandId,x:after.x,z:after.z})
    }));
  }
  if(crossings.length!==2){
    throw new Error('Water corridor must contain exactly two physical region/link faces');
  }
  const fluidSeams=Object.freeze(crossings);
  return Object.freeze({
    layout:graph.layout,
    fluidSeams,
    placement(id){
      const original=graph.placement(id);
      const patched=patches.get(id);
      const authored=patched?.fluidLayout?.riverChannels?.[0];
      if(!authored)return original;
      // A prop must not remain floating above a physically lowered dry shelf.
      // These extra cells are used only for placement exclusion, never passed
      // to the Water V2 solver or the authored channel.
      const terraces=patched.earthwork?.bankTerraceColumns??[];
      const collision={...authored,floor:[...authored.floor,...terraces]};
      return excludeHuntRiverPlacements(original,collision);
    },
    region:id=>patches.get(id)??graph.region(id),
    link:id=>patches.get(id)??graph.link(id),
    materialize:id=>patches.get(id)??graph.materialize(id),
    initialTerrain(ids){
      // Keep the original strict initial-neighborhood audit.
      graph.initialTerrain(ids);
      const bands=ids.map(id=>patches.get(id)??graph.materialize(id));
      const definition=bands[0].definition;
      return terrainAdapter({
        siteId:'authored-graph-start',seed:definition.seed,
        chunkEdge:definition.chunkEdge,
        generatorVersion:definition.generatorVersion,
        runs:bands.flatMap(b=>b.definition.runs),
        surfaceTiles:bands.flatMap(b=>b.definition.surfaceTiles??[])
      });
    }
  });
}
