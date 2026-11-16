import {TerrainClusterHandoff} from './terrain-cluster-handoff.mjs';

export const TERRAIN_CLUSTER_FIXED_STEP=1/60;
const GRAVITY=22;
const TERMINAL_SPEED=22;
const MAX_DROP=64;
const EPSILON=1e-7;
const columnKey=(x,z)=>x+','+z;

// Each index entry refers to a live state, so a lower body's new position
// is visible when an upper body is advanced later in the same tick.
function indexColumns(states){
  const columns=new Map();
  for(const state of states)for(const cell of state.body.cells){
    const key=columnKey(cell.x,cell.z);
    if(!columns.has(key))columns.set(key,[]);
    columns.get(key).push({state,y:cell.y});
  }
  return columns;
}

export class TerrainClusterPhysics {
  #world;
  #handoff;
  #isKnown;
  #states=new Map();

  constructor(world,handoff,{isKnown}){
    if(!(handoff instanceof TerrainClusterHandoff)||!handoff.isBoundTo(world)||typeof isKnown!=='function'){
      throw new TypeError('Cluster physics requires its bound terrain handoff and coverage query');
    }
    this.#world=world;
    this.#handoff=handoff;
    this.#isKnown=isKnown;
  }

  get bodies(){return [...this.#states.values()].map(state=>Object.freeze({...state}));}

  step(ticks=1){
    if(!Number.isSafeInteger(ticks)||ticks<1||ticks>4)throw new RangeError('Cluster tick budget exceeded');
    for(const body of this.#handoff.bodies){
      if(!this.#states.has(body.id))this.#states.set(body.id,{body,offsetY:0,vy:0,phase:'falling',contact:null});
    }
    const states=[...this.#states.values()];
    const columns=indexColumns(states);
    for(let tick=0;tick<ticks;tick++){
      states.sort((a,b)=>a.body.bounds.min.y+a.offsetY-b.body.bounds.min.y-b.offsetY||a.body.id-b.body.id);
      for(const state of states)this.#advance(state,columns);
    }
    return this.bodies;
  }

  #advance(state,columns){
    const vy=Math.max(-TERMINAL_SPEED,state.vy-GRAVITY*TERRAIN_CLUSTER_FIXED_STEP);
    const desired=state.offsetY+vy*TERRAIN_CLUSTER_FIXED_STEP;
    let next=Math.max(-MAX_DROP,desired),contact=null;
    for(const cell of state.body.cells){
      const bottom=cell.y+state.offsetY;
      const target=cell.y+next;
      // Check every touched voxel. Partial surfaces are conservatively
      // treated as occupying their parent cell in this first solver.
      for(let y=Math.floor(bottom+1-EPSILON);y>=Math.floor(target+EPSILON);y--){
        if(!this.#isKnown(cell.x,y,cell.z)){
          this.#stop(state,'waiting-coverage');
          return;
        }
        if(!this.#world.get(cell.x,y,cell.z))continue;
        if(y+1>bottom+EPSILON){
          this.#stop(state,'occupied');
          return;
        }
        if(y+1>=cell.y+next-EPSILON){
          next=Math.min(state.offsetY,Math.max(next,y+1-cell.y));
          contact='terrain';
        }
        break;
      }
      for(const other of columns.get(columnKey(cell.x,cell.z))){
        if(other.state===state)continue;
        const floor=other.y+other.state.offsetY;
        const top=floor+1;
        if(top>bottom+EPSILON&&floor<bottom+1-EPSILON){
          this.#stop(state,'occupied');
          return;
        }
        if(top<=bottom+EPSILON&&top>=cell.y+next-EPSILON){
          next=Math.min(state.offsetY,Math.max(next,top-cell.y));
          contact='cluster';
        }
      }
    }
    state.offsetY=next;
    if(contact)this.#stop(state,'resting',contact);
    else if(next<=-MAX_DROP)this.#stop(state,'drop-limit');
    else Object.assign(state,{vy,phase:'falling',contact:null});
  }

  #stop(state,phase,contact=null){
    Object.assign(state,{phase,contact,vy:0});
  }
}
