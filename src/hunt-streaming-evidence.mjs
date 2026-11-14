// Bounded device witness for the real Play Hunt host. Counts all transitions;
// retains a short event history and numeric aggregates, never frame arrays.
const round=n=>Math.round(n*10)/10;
export class HuntStreamingEvidence {
  #events=[];
  #visited=new Set();
  #active=null;
  #count=0;
  #loads=0;
  #evictions=0;
  #maxElapsed=0;
  #maxBeginCpu=0;
  #maxWriteCpu=0;
  #maxFrame=0;
  #streamFrames=0;
  #streamHitches=0;
  #peakBytes=0;
  #peakChunks=0;
  #peakMicrotiles=0;
  #peakDefinitions=0;
  #blockedSteps=0;
  #blockedInputMetres=0;
  #metres=0;
  observe({section=null,world,storage=null}={}){
    if(section)this.#visited.add(section);
    if(world){
      this.#peakBytes=Math.max(this.#peakBytes,world.allocatedVoxelBytes);
      this.#peakChunks=Math.max(this.#peakChunks,world.chunkCount);
      this.#peakMicrotiles=Math.max(this.#peakMicrotiles,world.microSurfaceCount);
    }
    if(storage)this.#peakDefinitions=Math.max(this.#peakDefinitions,storage.definitions);
  }
  begin(job,now,cpuMs){
    if(this.#active)throw new Error('Streaming evidence already active');
    this.#active={id:job.id,action:job.action,startedAt:now,beginCpuMs:round(cpuMs),
      writes:0,operations:0,maxWriteCpuMs:0,frames:0,hitches:0,maxFrameMs:0};
    this.#maxBeginCpu=Math.max(this.#maxBeginCpu,cpuMs);
  }
  write(operations,cpuMs){
    if(!this.#active)return;
    this.#active.writes++;
    this.#active.operations+=operations;
    this.#active.maxWriteCpuMs=round(Math.max(this.#active.maxWriteCpuMs,cpuMs));
    this.#maxWriteCpu=Math.max(this.#maxWriteCpu,cpuMs);
  }
  frame(ms){
    if(!this.#active)return;
    const a=this.#active;
    a.frames++;this.#streamFrames++;
    a.maxFrameMs=round(Math.max(a.maxFrameMs,ms));
    this.#maxFrame=Math.max(this.#maxFrame,ms);
    if(ms>33.34){a.hitches++;this.#streamHitches++;}
  }
  movement(before,after,requested,allowed,stepDistance){
    this.#metres+=Math.hypot(after.x-before.x,after.z-before.z);
    const loss=Math.max(0,Math.hypot(requested.moveX??0,requested.moveZ??0)-
      Math.hypot(allowed.moveX??0,allowed.moveZ??0));
    if(loss>.001){this.#blockedSteps++;this.#blockedInputMetres+=Math.min(1,loss)*stepDistance;}
  }
  publish(now){
    if(!this.#active)return;
    const {startedAt,...event}=this.#active;
    event.elapsedMs=round(now-startedAt);
    this.#count++;
    if(event.action==='load')this.#loads++;else this.#evictions++;
    this.#maxElapsed=Math.max(this.#maxElapsed,event.elapsedMs);
    this.#events.push(event);
    if(this.#events.length>48)this.#events.shift();
    this.#active=null;
  }
  get snapshot(){
    return {schema:'wyrmforge.hunt-streaming-evidence.v1',visitedSections:[...this.#visited],
      distanceMetres:round(this.#metres),completedTransitions:this.#count,loads:this.#loads,
      evictions:this.#evictions,maxElapsedMs:round(this.#maxElapsed),
      maxBeginCpuMs:round(this.#maxBeginCpu),maxWriteCpuMs:round(this.#maxWriteCpu),
      streamingFrames:this.#streamFrames,streamingHitchesOver33Ms:this.#streamHitches,
      maxStreamingFrameMs:round(this.#maxFrame),peakVoxelPayloadBytes:this.#peakBytes,
      peakChunks:this.#peakChunks,peakMicrotiles:this.#peakMicrotiles,
      peakRetainedDefinitions:this.#peakDefinitions,blockedInputSteps:this.#blockedSteps,
      blockedInputEquivalentMetres:round(this.#blockedInputMetres),
      recentTransitions:this.#events.map(e=>({...e})),
      activeTransition:this.#active?{...this.#active}:null};
  }
}
