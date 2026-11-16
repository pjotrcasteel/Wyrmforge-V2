import {TerrainClusterHandoff} from './terrain-cluster-handoff.mjs';
import {TerrainClusterPhysics} from './terrain-cluster-physics.mjs';
import {beginTerrainSupportScan,scanTerrainSupport} from './terrain-support-scan.mjs';
import {projectVoxel} from './camera-presets.mjs';
import {targetHuntFireball} from './hunt-play-runtime.mjs';
import {V2_BEDROCK_MATERIAL} from './terrain-edit-ledger.mjs';

const STONE=new Set([3]);
const ANCHORS=new Set([V2_BEDROCK_MATERIAL]);
// Voxel storage supports material IDs 1–255. Bedrock remains the protected anchor.
const TERRAIN=new Set(Array.from({length:255},(_,index)=>index+1)
  .filter(material=>!ANCHORS.has(material)));

const OWNER='region-entry:cell:8:0:1';
const SUPPORT={id:'hunt-collapse-preview-support',type:'carve-sphere',x:5,y:6,z:10,radius:1.1};
const SUPPORT_KEY='5,6,10';
const MAX_DEFERRED_CLUSTER_CELLS=256;
const MAX_DEFERRED_SCAN_READS=4096;
const MAX_DEFERRED_CLUSTER_EXTENT=24;
const MAX_TERRAIN_ADDITIONS=256;
const SUPPORT_TIMING_BATCH=32;
const MAX_TERRAIN_DROP=12;
const FALL_COLORS={
  1:['#668f47','#435f2f'],
  2:['#95704d','#654b38'],
  3:['#b7ae99','#787468']
};
const columnKey=({x,z})=>x+','+z;
const cellKey=({x,y,z})=>x+','+y+','+z;
const isShelf=({x,y,z})=>y===8&&x>=2&&x<=5&&z>=10&&z<=11;
const isScaffold=cell=>isShelf(cell)||
  (cell.x===5&&cell.z===10&&cell.y>=5&&cell.y<=7);

// Opt-in seed 7 fixture. These cells are installed as owned additions over
// the authored flat landing and use a separate preview save.
export function huntCollapseScaffold(save){
  const cells=[];
  for(let x=2;x<=5;x++)for(let z=10;z<=11;z++)cells.push({owner:OWNER,x,y:8,z,material:3});
  for(let y=5;y<=7;y++)cells.push({owner:OWNER,x:5,y,z:10,material:3});
  return cells.filter(cell=>!save.removedCells.has(cellKey(cell)));
}

export class HuntCollapsePreview {
  #world;
  #port;
  #residency;
  #save;
  #handoff;
  #physics;
  #removed=[];
  #outcomes=new Map();
  #replay=null;
  #pendingScan=null;
  #supportReport=null;
  #now;
  #fixture;
  #guidedSupport;
  #cohesive;
  #foundationY;
  #owners=new Map();
  #isKnown;
  #phase;

  constructor(world,port,residency,save,{fixture=true,guidedSupport=fixture?SUPPORT:null,mixedTerrain=false,foundationY=null,preserveMicroSurfaces=false,now=()=>performance.now()}={}){
    this.#world=world;
    this.#now=now;
    this.#port=port;
    this.#residency=residency;
    this.#save=save;
    this.#fixture=fixture;
    this.#cohesive=mixedTerrain?TERRAIN:STONE;
    this.#foundationY=mixedTerrain?foundationY:null;
    this.#guidedSupport=guidedSupport;
    this.#phase=guidedSupport&&save.removedCells.has(cellKey(guidedSupport))?'settled':'ready';
    this.#handoff=new TerrainClusterHandoff(world,{preserveMicroSurfaces});
    this.#isKnown=(x,y,z)=>residency.publishedAt(x+.5,z+.5);
    this.#physics=new TerrainClusterPhysics(world,this.#handoff,{isKnown:this.#isKnown});
  }

  get replay(){return this.#replay;}
  get outcomes(){return [...this.#outcomes.values()];}
  get supportReport(){return this.#supportReport;}
  get checkingSupport(){return this.#pendingScan!==null;}
  get canAcceptImpact(){return this.#fixture?this.#phase==='ready':!this.holdsFixture&&!this.checkingSupport;}
  get phase(){return this.#phase;}
  get holdsFixture(){return this.#phase==='falling'||this.#phase==='actor-blocked';}
  get collision(){return this.#physics;}
  get protectedIds(){return this.holdsFixture?[...new Set(this.#owners.values())]:[];}

  supportTarget(view){
    const support=this.#guidedSupport;
    if(!support||this.#phase!=='ready'||view?.camera!=='hunt')return null;
    const {x,y,z}=support;
    if(!this.#residency.publishedAt(x+.5,z+.5))return null;
    const screen=projectVoxel(x+.5,y+.2,z+1,view);
    const cast=targetHuntFireball(this.#port,view,screen.x,screen.y);
    return cast&&cellKey(cast.target)===cellKey(support)?{screen,cast}:null;
  }

  release(){
    if(!this.#fixture||this.#phase!=='ready'||!this.#residency.publishedAt(5.5,10.5))return null;
    const edit=this.#port.apply(SUPPORT,{captureRemovedCells:true});
    const dirty=this.acceptImpact(edit);
    if(!this.holdsFixture)this.#save.commit(edit.removedCells);
    return {command:SUPPORT,edit,dirtyChunks:[...new Set([...edit.dirtyChunks,...dirty])]};
  }

  acceptImpact(edit,{defer=false,wide=defer}={}){
    if(!this.canAcceptImpact||!edit.removedCells?.length||
        (this.#fixture&&!edit.removedCells.includes(SUPPORT_KEY)))return [];
    this.#reportSupport({editRevision:edit.editRevision,removedCells:edit.removedCells.length,
      status:'checking',scanStatus:null,scannedPositions:0,oversizedComponents:0,candidates:0,slices:0,
      scanWorkMs:0,scanElapsedMs:0,maxSliceMs:0});
    if(edit.removedCells.length>256){
      this.#reportSupport({status:'impact-too-large'});
      return [];
    }
    const started=this.#now();
    const removed=edit.removedCells.map(key=>{
      const [x,y,z]=key.split(',').map(Number);
      return {x,y,z};
    });
    const options={isKnown:this.#isKnown,cohesive:this.#cohesive,anchors:ANCHORS,foundationY:this.#foundationY};
    if(defer&&this.#cohesive===TERRAIN){
      options.maxCells=MAX_DEFERRED_CLUSTER_CELLS;
      options.maxReads=MAX_DEFERRED_SCAN_READS;
      if(wide)options.maxExtent=MAX_DEFERRED_CLUSTER_EXTENT;
    }
    if(!defer){
      const scan=scanTerrainSupport(this.#world,removed,options);
      this.#recordScanSlice(scan,started,started);
      return this.#applyScan(edit,scan);
    }
    const job=beginTerrainSupportScan(this.#world,removed,options);
    this.#pendingScan={edit,job,started,wide:options.maxExtent!==undefined,previousPhase:this.#phase};
    const setupMs=this.#now()-started;
    this.#reportSupport({scanWorkMs:setupMs,scanElapsedMs:setupMs});
    this.#phase='checking-support';
    this.#outcomes.set(edit.editRevision,Object.freeze({sequence:edit.editRevision,landed:null}));
    return [];
  }

  stepSupportScan(maxOperations,{workBudgetMs}={}){
    const pending=this.#pendingScan;
    if(!pending)return [];
    const started=this.#now();
    const scan=workBudgetMs===undefined?pending.job.step(maxOperations):
      this.#stepTimedSupportScan(pending.job,maxOperations,started+workBudgetMs);
    this.#recordScanSlice(scan,started,pending.started);
    if(scan.status==='scanning')return [];
    this.#pendingScan=null;
    this.#phase=pending.previousPhase;
    this.#outcomes.delete(pending.edit.editRevision);
    const dirty=this.#applyScan(pending.edit,scan,true,pending.wide);
    if(!this.holdsFixture)this.#save.commit(pending.edit.removedCells);
    return dirty;
  }

  #stepTimedSupportScan(job,maxOperations,deadline){
    let remaining=maxOperations;
    let scan;
    do{
      const batch=Math.min(SUPPORT_TIMING_BATCH,remaining);
      scan=job.step(batch);
      remaining-=batch;
    }while(scan.status==='scanning'&&remaining>0&&this.#now()<deadline);
    return scan;
  }

  #applyScan(edit,scan,deferred=false,wide=false){
    this.#reportSupport({scannedPositions:scan.reads,oversizedComponents:scan.oversized,
      candidates:scan.candidates.length,scanStatus:scan.status,status:scan.status});
    // Each candidate was proved independently. Components touching unknown
    // cells are excluded by the scanner, even when another component is safe.
    const provenCandidateAtEdge=!this.#fixture&&scan.status==='partial-coverage'&&scan.candidates.length>0;
    if(scan.status!=='complete'&&!provenCandidateAtEdge)return this.#decline();
    const candidates=this.#fixture?scan.candidates.filter(candidate=>
      candidate.cells.some(isShelf)&&candidate.cells.every(isScaffold)):scan.candidates;
    this.#reportSupport({status:scan.oversized?'component-too-large':'no-unsupported-component'});
    if(this.#fixture&&candidates.length!==1){
      if(scan.candidates.length)this.#reportSupport({status:'fixture-mismatch'});
      return this.#decline();
    }
    for(const candidate of candidates){
      const admission=this.#fixture?{owners:new Map(candidate.cells.map(cell=>[columnKey(cell),OWNER]))}:
        this.#qualifyTerrain(candidate.cells,edit.removedCells);
      if(!admission.owners){
        this.#reportSupport({status:admission.status});
        continue;
      }
      const detached=this.#handoff.detach(candidate);
      this.#reportSupport({status:detached.status});
      if(detached.status!=='detached')continue;
      this.#owners=admission.owners;
      return this.#startFall(edit,detached,deferred,wide);
    }
    return this.#decline();
  }

  #recordScanSlice(scan,sliceStarted,scanStarted){
    const ended=this.#now();
    const sliceMs=ended-sliceStarted;
    const {slices,scanWorkMs,maxSliceMs}=this.#supportReport;
    this.#reportSupport({scannedPositions:scan.reads,slices:slices+1,
      scanWorkMs:scanWorkMs+sliceMs,scanElapsedMs:ended-scanStarted,
      maxSliceMs:Math.max(maxSliceMs,sliceMs)});
  }

  #reportSupport(update){
    this.#supportReport=Object.freeze({...this.#supportReport,...update});
  }

  #decline(){
    if(this.#fixture)this.#phase='blocked';
    return [];
  }

  #qualifyTerrain(cells,impactRemovals){
    const moving=new Set(cells.map(cellKey)),owners=new Map();
    const removals=new Set([...moving,...impactRemovals]);
    const remaining=this.#save.countAdditionsAfterRemoving(removals);
    if(remaining+cells.length>MAX_TERRAIN_ADDITIONS)return {status:'save-capacity'};
    let drop=MAX_TERRAIN_DROP+1;
    for(const {x,y,z} of cells){
      if(y < -64+MAX_TERRAIN_DROP||y>64)return {status:'outside-height-range'};
      const key=columnKey({x,z});
      if(!owners.has(key)){
        const owner=this.#residency.ownerAt(x+.5,z+.5);
        if(!owner)return {status:'missing-owner'};
        owners.set(key,owner);
      }
      for(let d=0;d<=MAX_TERRAIN_DROP;d++){
        const floor=y-d-1;
        if(moving.has(cellKey({x,y:floor,z}))||!this.#world.get(x,floor,z))continue;
        drop=Math.min(drop,d);
        break;
      }
    }
    if(drop===0)return {status:'blocked-drop'};
    if(drop>MAX_TERRAIN_DROP)return {status:'no-landing-in-range'};
    for(const {x,y,z} of cells){
      if(this.#world.microSurfaceTile(x,y-drop-1,z))return {status:'partial-landing-surface'};
    }
    return {owners};
  }

  #startFall(edit,detached,deferred,wide){
    this.#removed=[...edit.removedCells,...detached.body.cells.map(cellKey)];
    this.#replay=Object.freeze({sequence:edit.editRevision,
      removed:Object.freeze(this.#removed.slice().sort()),landed:null,...(deferred?{deferred:true}:{}),...(wide?{wide:true}:{})});
    this.#outcomes.set(this.#replay.sequence,this.#replay);
    this.#phase='falling';
    return detached.dirtyChunks;
  }

  tick(actors){
    if(!this.holdsFixture)return [];
    const [body]=this.#physics.step(1,{actors});
    this.#phase=body.contact==='actor'?'actor-blocked':'falling';
    if(body.phase!=='resting'||body.contact!=='terrain')return [];
    const result=this.#physics.settle(body.body.id,{actors});
    if(result.status!=='settled')return [];
    const grouped=new Map();
    const additions=result.cells.map(cell=>{
      const owner=this.#owners.get(columnKey(cell));
      const addition={...cell,owner};
      if(!grouped.has(owner))grouped.set(owner,[]);
      grouped.get(owner).push(addition);
      return addition;
    });
    for(const [owner,cells] of grouped)this.#residency.trackAddedCells(owner,cells);
    this.#replay=Object.freeze({...this.#replay,landed:result.cells});
    this.#outcomes.set(this.#replay.sequence,this.#replay);
    this.#phase=this.#save.commitCollapse(this.#removed,additions)?'settled':'settled-unsaved';
    return result.dirtyChunks;
  }

  get renderCells(){
    return this.#physics.bodies.flatMap(({body,offsetY})=>
      body.cells.map(cell=>({...cell,y:cell.y+offsetY})));
  }

  paint(ctx,view){
    const face=(points,color)=>{
      ctx.fillStyle=color;
      ctx.beginPath();
      for(const [index,point] of points.entries()){
        const {x,y}=projectVoxel(...point,view);
        if(index===0)ctx.moveTo(x,y);
        else ctx.lineTo(x,y);
      }
      ctx.closePath();
      ctx.fill();
    };
    const cells=this.renderCells;
    const occupied=new Set(cells.map(cell=>cellKey({...cell,y:Math.round(cell.y)})));
    for(const {x,y,z,material} of cells){
      const [top,front]=FALL_COLORS[material]??FALL_COLORS[3];
      if(!occupied.has(cellKey({x,y:Math.round(y),z:z+1})))face([[x,y,z+1],[x+1,y,z+1],[x+1,y+1,z+1],[x,y+1,z+1]],front);
      if(!occupied.has(cellKey({x,y:Math.round(y)+1,z}))){
        face([[x,y+1,z],[x+1,y+1,z],[x+1,y+1,z+1],[x,y+1,z+1]],top);
      }
    }
  }
}
