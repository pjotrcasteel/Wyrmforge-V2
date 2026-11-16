const SCHEMA='wyrmforge.hunt-collapse-evidence.v1';
const MAX_RECENT=8;
const round=value=>Math.round(value*10)/10;

// Capture activation through the first rendered static landing. Storage is
// scoped to this tab and build by the host and is independent of terrain saves.
export class HuntCollapseEvidence {
  #storage;
  #key;
  #active=null;
  #recent=[];
  #restored=0;

  constructor(storage,key){
    this.#storage=storage;
    this.#key=key;
    try{
      const raw=storage?.getItem(key);
      if(!raw||raw.length>16000)return;
      const entry=JSON.parse(raw);
      if(entry?.schema===SCHEMA&&Array.isArray(entry.recent)&&entry.recent.length<=MAX_RECENT&&
          entry.recent.every(sample=>Number.isFinite(sample?.settlementVisibleMs))){
        this.#recent=entry.recent;
        this.#restored=this.#recent.length;
      }
    }catch{}
  }

  get tracking(){return this.#active!==null;}

  begin({sequence,at,activationCpuMs,ownerCount,world,supportScan}){
    this.#active={sequence,at,activationCpuMs:round(activationCpuMs),ownerCount,
      fallVisibleMs:null,physicsSteps:0,actorBlockedSteps:0,maxPhysicsStepCpuMs:0,
      frames:0,hitchesOver33Ms:0,maxFrameMs:0,peakChunks:0,peakVoxelPayloadBytes:0,
      interrupted:false};
    if(supportScan)this.#active.supportScan={...supportScan};
    this.observe(world);
  }

  observe(world){
    const a=this.#active;
    if(!a)return;
    a.peakChunks=Math.max(a.peakChunks,world.chunkCount);
    a.peakVoxelPayloadBytes=Math.max(a.peakVoxelPayloadBytes,world.allocatedVoxelBytes);
  }

  frame(intervalMs){
    const a=this.#active;
    if(!a||intervalMs<=0)return;
    a.frames++;
    if(intervalMs>33.34)a.hitchesOver33Ms++;
    a.maxFrameMs=Math.max(a.maxFrameMs,intervalMs);
  }

  step(cpuMs,actorBlocked){
    const a=this.#active;
    if(!a)return;
    a.physicsSteps++;
    if(actorBlocked)a.actorBlockedSteps++;
    a.maxPhysicsStepCpuMs=Math.max(a.maxPhysicsStepCpuMs,cpuMs);
  }

  interrupt(){
    if(this.#active)this.#active.interrupted=true;
  }

  presented(now,landed,saveStatus,clusters){
    const a=this.#active;
    if(!a)return;
    if(!landed){
      a.fallVisibleMs??=round(now-a.at);
      return;
    }
    const {at,maxFrameMs,maxPhysicsStepCpuMs,...sample}=a;
    this.#recent.push({...sample,maxFrameMs:round(maxFrameMs),
      maxPhysicsStepCpuMs:round(maxPhysicsStepCpuMs),
      settlementVisibleMs:round(now-at),landedVoxels:landed.length,saveStatus,
      ...(Array.isArray(clusters)?{clusters:clusters.map(cluster=>({...cluster}))}:{})});
    if(this.#recent.length>MAX_RECENT)this.#recent.shift();
    this.#active=null;
    try{
      this.#storage?.setItem(this.#key,JSON.stringify({schema:SCHEMA,recent:this.#recent}));
    }catch{}
  }

  get snapshot(){
    return {schema:SCHEMA,restoredSamples:this.#restored,tracking:this.tracking,
      recent:this.#recent.map(({supportScan,clusters,...sample})=>({
        ...sample,...(supportScan?{supportScan:{...supportScan}}:{}),
        ...(Array.isArray(clusters)?{clusters:clusters.map(cluster=>({...cluster}))}:{})
      }))};
  }
}
