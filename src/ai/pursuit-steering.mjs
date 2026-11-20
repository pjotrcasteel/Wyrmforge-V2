// AI V2: deterministic, bounded local pursuit intent.
// Collision, support, terrain edits and character movement remain authoritative
// in Voxel/Physics; this engine consumes only the actual previous move result.
export const PURSUIT_STEERING_SCHEMA='wyrmforge.ai-pursuit.v1';
export const PURSUIT_STEERING_MAX_AGENTS=16;
export const PURSUIT_DETOUR_SECONDS=1.25;
const BLOCKED_SECONDS=.12;

const finitePoint=point=>point&&
  [point.x,point.y,point.z].every(Number.isFinite);
const normalize=(x,z)=>{
  const length=Math.hypot(x,z);
  return length>1e-8?[x/length,z/length]:[0,0];
};

export class HuntPursuitSteering{
  #agents=new Map();
  #detours=0;
  get statistics(){
    return Object.freeze({schema:PURSUIT_STEERING_SCHEMA,tracked:this.#agents.size,
      detours:this.#detours});
  }
  clear(){this.#agents.clear();}
  #state(id,revision){
    if(!Number.isSafeInteger(id)||id<0||id>=PURSUIT_STEERING_MAX_AGENTS||
      !Number.isSafeInteger(revision)||revision<0){
      throw new RangeError('Expected bounded enemy slot and terrain revision');
    }
    let state=this.#agents.get(id);
    if(!state||state.revision!==revision){
      state={revision,blockedFor:0,detourFor:0,attempts:0,side:id%2===0?1:-1};
      this.#agents.set(id,state);
    }
    return state;
  }
  direction(id,enemy,target,revision,dt){
    if(!finitePoint(enemy)||!finitePoint(target)||
      !Number.isFinite(dt)||dt<=0||dt>1/20){
      throw new RangeError('Expected valid physical actor positions and fixed step');
    }
    const state=this.#state(id,revision);
    const dx=target.x-enemy.x,dz=target.z-enemy.z;
    const [forwardX,forwardZ]=normalize(dx,dz);
    if(state.detourFor<=0||Math.hypot(dx,dz)<.65){
      state.detourFor=0;
      return {moveX:forwardX,moveZ:forwardZ,detouring:false};
    }
    state.detourFor=Math.max(0,state.detourFor-dt);
    // The tangent is intentionally dominant: it clears the side of a
    // 1-2 metre tree/rock without pressing continuously against its collider.
    // Never bypass the Voxel/World Objects collision authority.
    const [moveX,moveZ]=normalize(forwardX*.2-forwardZ*.98*state.side,
      forwardZ*.2+forwardX*.98*state.side);
    return {moveX,moveZ,detouring:true};
  }
  observe(id,before,after,revision,dt,speed){
    if(!finitePoint(before)||!finitePoint(after)||
      !Number.isFinite(dt)||dt<=0||dt>1/20||
      !Number.isFinite(speed)||speed<=0||speed>6){
      throw new RangeError('Expected physically validated movement outcome');
    }
    const state=this.#state(id,revision);
    const displacement=Math.hypot(after.x-before.x,after.z-before.z);
    const blocked=Boolean(after.wallContact)&&displacement<speed*dt*.35;
    if(!blocked){
      state.blockedFor=0;
      return;
    }
    state.blockedFor+=dt;
    if(state.blockedFor<BLOCKED_SECONDS||state.detourFor>0)return;
    state.detourFor=PURSUIT_DETOUR_SECONDS;
    // Alternate the chosen side after a failed detour, so repeated
    // collisions don't produce endless deterministic left/right oscillation.
    state.side=state.attempts%2===0?(id%2===0?1:-1):(id%2===0?-1:1);
    state.attempts++;
    state.blockedFor=0;
    this.#detours++;
  }
}
