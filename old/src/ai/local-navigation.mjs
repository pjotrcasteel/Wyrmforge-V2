// AI V2: bounded, deterministic perception and local navigation.
// No voxel/world object imports: the Hunt host supplies read-only spatial
// queries and authoritative movement-preview results through a port.
// Unsampled visibility never grants fresh player knowledge.
export const AI_LOCAL_NAV_SCHEMA='wyrmforge.ai-local-navigation.v1';
export const AI_LOCAL_NAV_MAX_AGENTS=16;
export const AI_LOCAL_NAV_MAX_QUERIES_PER_STEP=3;
const SENSE_INTERVAL=12;   // about 5Hz / actor at 60Hz, staggered
const PROBE_INTERVAL=18;
const VISION_RANGE=18;
const HEARING_RANGE=12;
const SEEN_MEMORY_FRAMES=180;
const HEARD_MEMORY_FRAMES=72;
const close=(a,b)=>Math.hypot(a.x-b.x,a.z-b.z)<.65;
const valid=p=>p&&[p.x,p.y,p.z].every(Number.isFinite);
const copy=p=>({x:p.x,y:p.y,z:p.z});

export class HuntLocalNavigation{
  #agents=new Map();
  #frame=-1;
  #epoch=-1;
  #revision='';
  #queries=0;
  #totalQueries=0;
  #peakQueries=0;
  #sightings=0;
  #waypoints=0;
  get statistics(){
    return Object.freeze({schema:AI_LOCAL_NAV_SCHEMA,tracked:this.#agents.size,
      queries:this.#totalQueries,peakQueriesPerStep:this.#peakQueries,
      sightings:this.#sightings,waypoints:this.#waypoints});
  }
  clear(){
    this.#agents.clear();
    this.#frame=-1;
    this.#queries=0;
  }
  beginFrame({frame,epoch,terrainRevision,objectsRevision=0}){
    if(![frame,epoch,terrainRevision,objectsRevision].every(v=>
      Number.isSafeInteger(v)&&v>=0)){
      throw new RangeError('Expected bounded frame and spatial revisions');
    }
    if(this.#epoch!==epoch){
      this.clear();
      this.#epoch=epoch;
      this.#revision='';
    }
    const revision=terrainRevision+':'+objectsRevision;
    if(revision!==this.#revision){
      for(const agent of this.#agents.values()){
        agent.nextSense=frame;
        agent.nextProbe=frame;
        agent.waypoint=null;
      }
      this.#revision=revision;
    }
    if(this.#frame!==frame){
      this.#frame=frame;
      this.#queries=0;
    }
  }
  #record(slot){
    if(!Number.isSafeInteger(slot)||slot<0||slot>=AI_LOCAL_NAV_MAX_AGENTS){
      throw new RangeError('Invalid bounded enemy navigation slot');
    }
    let a=this.#agents.get(slot);
    if(!a){
      a={nextSense:this.#frame+slot%3, nextProbe:this.#frame,
        visible:false,seen:null,seenFrame:-1,heard:null,heardFrame:-1,
        waypoint:null,side:slot%2===0?1:-1};
      this.#agents.set(slot,a);
    }
    return a;
  }
  #spend(){
    if(this.#queries>=AI_LOCAL_NAV_MAX_QUERIES_PER_STEP)return false;
    this.#queries++;
    this.#totalQueries++;
    this.#peakQueries=Math.max(this.#peakQueries,this.#queries);
    return true;
  }
  seek(slot,enemy,player,spatial,locomotionProfile){
    if(this.#frame<0||!valid(enemy)||!valid(player)||
        !spatial||typeof spatial.visible!=='function'||
        typeof spatial.canMove!=='function'){
      throw new TypeError('Navigation requires a begun frame, actors and a spatial port');
    }
    const state=this.#record(slot);
    if(this.#frame>=state.nextSense&&this.#spend()){
      // Only the result of an actual sensor query updates exact memory.
      state.visible=spatial.visible(enemy,player,VISION_RANGE);
      state.nextSense=this.#frame+SENSE_INTERVAL+slot%3;
      if(state.visible){
        state.seen=copy(player);
        state.seenFrame=this.#frame;
        state.waypoint=null;
        this.#sightings++;
      }else if(Math.hypot(enemy.x-player.x,enemy.z-player.z)<=HEARING_RANGE){
        // Coarse audible position (the moving Wizard), not exact unseen aim.
        state.heard={x:Math.round(player.x/2)*2,y:enemy.y,
          z:Math.round(player.z/2)*2};
        state.heardFrame=this.#frame;
      }
    }
    if(state.seen&&this.#frame-state.seenFrame>SEEN_MEMORY_FRAMES){
      state.seen=null;
    }
    if(state.heard&&this.#frame-state.heardFrame>HEARD_MEMORY_FRAMES){
      state.heard=null;
    }
    const target=state.seen??state.heard;
    if(!target)return {target:null,visible:false};
    if(state.waypoint&&close(enemy,state.waypoint))state.waypoint=null;
    if(!state.visible&&!state.waypoint&&this.#frame>=state.nextProbe&&
        Math.hypot(enemy.x-target.x,enemy.z-target.z)>.8&&this.#spend()){
      const dx=target.x-enemy.x,dz=target.z-enemy.z;
      const length=Math.hypot(dx,dz);
      const fx=dx/length,fz=dz/length;
      const side=state.side;
      // Preview the next 20cm using the *same physical movement solver*.
      // The waypoint is a short-lived tactical hint, not a new collision map.
      const tangentX=-fz*side,tangentZ=fx*side;
      if(spatial.canMove(enemy,tangentX,tangentZ,locomotionProfile)){
        state.waypoint={x:enemy.x+tangentX*1.6+fx*.4,
          y:enemy.y,z:enemy.z+tangentZ*1.6+fz*.4};
        this.#waypoints++;
      }else{
        state.side=-side;
      }
      state.nextProbe=this.#frame+PROBE_INTERVAL;
    }
    return {target:state.waypoint??copy(target),visible:state.visible};
  }
}
