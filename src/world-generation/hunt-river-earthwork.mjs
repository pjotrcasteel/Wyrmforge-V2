// WorldGen-owned, immutable **physical** riverbed preparation.
// Turns an already-grounded region -> link -> region proposal into native
// Voxel terrain runs. This does not mutate a live Voxel world or create water.
// A host must still publish these exact definitions before opening Fluid V2.
import {HUNT_RIVER_CORRIDOR_PLAN_SCHEMA} from './hunt-river-corridor-plan.mjs';

export const HUNT_RIVER_EARTHWORK_SCHEMA='wyrmforge.hunt-river-earthwork.v1';
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

function carveRuns(runs,changes,heights){
  const result=[];
  for(const run of runs){
    let start=-1,material=0;
    const flush=end=>{
      if(start>=0)result.push({...run,x:start,length:end-start,material});
      start=-1;
      material=0;
    };
    // This also avoids a voxel allocation per native terrain cell.
    for(let x=run.x;x<=run.x+run.length;x++){
      const change=changes.get(key(x,run.z));
      const original=x<run.x+run.length?run.material:0;
      const next=change&&original?
        run.y>=change.floorY?0:
        run.y===change.floorY-1?3:original:original;
      if(next!==material){
        flush(x);
        if(next){start=x;material=next;}
      }
    }
  }
  // Some cells need a real supporting stone fill before the new riverbed
  // can reach the shared upper face. Never create a floating single surface.
  for(const [id,change] of changes){
    const original=heights.get(id);
    const [x,z]=id.split(',').map(Number);
    for(let y=original;y<change.floorY;y++){
      result.push({x,y,z,length:1,material:3});
    }
    // The final bed face is always true Voxel stone, not a shader stamp.
    if(original<=change.floorY-1){
      // A filled bed's highest stone was already emitted by the loop above.
      continue;
    }
  }
  return result;
}

function channelForBand(band,part,grade){
  const existing=band.fluidLayout?.riverChannels?.[0];
  const cells=new Map(existing?.floor?.map(cell=>[key(cell.x,cell.z),cell])??[]);
  for(const [i,point]of part.entries()){
    const next=part[Math.min(part.length-1,i+1)];
    const prev=part[Math.max(0,i-1)];
    cells.set(key(point.x,point.z),Object.freeze({
      x:point.x,z:point.z,y:grade,
      flowX:next.x-prev.x,flowZ:next.z-prev.z
    }));
  }
  const nodes=part.map(({x,z})=>Object.freeze({x,z,y:grade}));
  const channel=Object.freeze({
    kind:'water',
    nodes:Object.freeze(nodes),
    floor:Object.freeze([...cells.values()]),
    from:Object.freeze({x:nodes[0].x,z:nodes[0].z}),
    to:Object.freeze({x:nodes.at(-1).x,z:nodes.at(-1).z})
  });
  return Object.freeze({
    footprint:band.fluidLayout?.footprint??Object.freeze({
      ...band.bounds,minY:Math.min(-4,grade-5),maxY:Math.max(grade+12,20)
    }),
    riverChannels:Object.freeze([channel]),
    corridorEarthwork:HUNT_RIVER_EARTHWORK_SCHEMA
  });
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
  const grade=Math.min(proposal.sourceFloorY,proposal.targetFloorY);
  if(!Number.isSafeInteger(grade))throw new TypeError('Invalid authored river grade');
  const ids=[link.fromId,link.id,link.toId];
  const bands=ids.map(id=>graph.materialize(id));
  const covered=new Set(),edits=[];
  for(const band of bands){
    const points=proposal.points.filter(p=>p.bandId===band.id);
    if(!points.length)throw new Error('Water corridor does not touch all three physical bands');
    const changes=new Map();
    for(const point of points){
      const id=key(point.x,point.z);
      if(covered.has(id))throw new Error('Overlapping WorldGen channel bands');
      covered.add(id);
      changes.set(id,{floorY:grade});
    }
    const heights=topFaces(band.definition.runs,changes);
    let maxCut=0,maxFill=0;
    for(const [id] of changes){
      const top=heights.get(id);
      if(!Number.isSafeInteger(top)){
        throw new Error('WorldGen water corridor cell has no physical supporting Voxel terrain: '+id);
      }
      maxCut=Math.max(maxCut,top-grade);
      maxFill=Math.max(maxFill,grade-top);
      if(top-grade>maxCutMetres||grade-top>maxFillMetres){
        throw new RangeError('WorldGen water corridor unsafe earthwork at '+id+
          ' (original '+top+', grade '+grade+')');
      }
    }
    const raw=carveRuns(band.definition.runs,changes,heights);
    const surfaceTiles=(band.definition.surfaceTiles??[])
      .filter(tile=>!changes.has(key(tile.x,tile.z)));
    const definition=terrainAdapter({
      siteId:band.definition.siteId,seed:band.definition.seed,
      chunkEdge:band.definition.chunkEdge,
      generatorVersion:band.definition.generatorVersion,
      runs:raw,surfaceTiles
    });
    edits.push(Object.freeze({
      ...band,definition,fluidLayout:channelForBand(band,points,grade),
      earthwork:Object.freeze({cellCount:points.length,maxCutMetres:maxCut,
        maxFillMetres:maxFill,bedFloorY:grade})
    }));
  }
  if(covered.size!==proposal.points.length)throw new Error('Incomplete physical water corridor');
  return Object.freeze({
    schema:HUNT_RIVER_EARTHWORK_SCHEMA,
    linkId:link.id,kind:'water',status:'native-voxel-definitions-prepared',
    bedFloorY:grade,points:proposal.points,
    bands:Object.freeze(edits)
  });
}
