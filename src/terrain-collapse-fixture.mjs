import {VoxelWorld} from './voxel-world.mjs';
import {TerrainEditLedger} from './terrain-edit-ledger.mjs';
import {TerrainClusterHandoff} from './terrain-cluster-handoff.mjs';
import {TerrainClusterPhysics} from './terrain-cluster-physics.mjs';
import {scanTerrainSupport} from './terrain-support-scan.mjs';
import {spawnTerrainActor,simulateTerrainActor} from './terrain-actor.mjs';

const SUPPORT=Object.freeze({id:'fixture-support',type:'carve-sphere',x:-3,y:3,z:-1,radius:2.1});
const LANDING_OFFSET=-5;
const SAVE_SCHEMA='wyrmforge.collapse-fixture.v1';
const known=(x,y,z)=>x>=-8&&x<=8&&z>=-5&&z<=6&&y>=-1&&y<=12;

export class TerrainCollapseFixture {
  world=new VoxelWorld({chunkEdge:16});
  #ledger=new TerrainEditLedger(this.world);
  #handoff=new TerrainClusterHandoff(this.world);
  #physics=new TerrainClusterPhysics(this.world,this.#handoff,{isKnown:known});
  #actor;
  #phase='ready';
  #settled=null;

  constructor(){
    for(let x=-7;x<=7;x++)for(let z=-4;z<=5;z++)this.world.set(x,0,z,4);
    for(let y=1;y<=5;y++)this.world.set(-3,y,-1,3);
    for(let x=-3;x<=4;x++)for(let z=-1;z<=0;z++)this.world.set(x,6,z,3);
    this.#actor=spawnTerrainActor(this.world,{x:.5,z:3.5});
  }

  get phase(){return this.#phase;}
  get actor(){return this.#actor;}
  get bodies(){return this.#physics.bodies;}
  get settled(){return this.#settled;}
  get save(){return this.#settled&&{schema:SAVE_SCHEMA,offsetY:this.#settled.offsetY};}

  removeSupport(){
    if(this.#phase!=='ready')return false;
    const edit=this.#ledger.apply(SUPPORT,{captureRemovedCells:true});
    const removed=edit.removedCells.map(key=>{
      const [x,y,z]=key.split(',').map(Number);
      return {x,y,z};
    });
    const scan=scanTerrainSupport(this.world,removed,{
      cohesive:new Set([3]),anchors:new Set([4]),isKnown:known
    });
    if(scan.status!=='complete'||scan.candidates.length!==1||
        this.#handoff.detach(scan.candidates[0]).status!=='detached'){
      this.#phase='blocked';
      return false;
    }
    this.#phase='falling';
    return true;
  }

  tick({moveX=0,moveZ=0}={}){
    this.#actor=simulateTerrainActor(this.world,this.#actor,
      {moveX,moveZ,dynamicCollision:this.#physics,limitHorizontal:(position,axis,distance)=>{
        const [min,max]=axis==='x'?[-6.5,7.5]:[-3.5,5.5];
        return Math.min(max,Math.max(min,position[axis]+distance))-position[axis];
      }});
    if(this.#phase!=='falling'&&this.#phase!=='actor-blocked')return;
    const [state]=this.#physics.step(1,{actors:[this.#actor]});
    this.#phase=state.contact==='actor'?'actor-blocked':'falling';
    if(state.phase!=='resting'||state.contact!=='terrain')return;
    const result=this.#physics.settle(state.body.id,{actors:[this.#actor]});
    if(result.status==='settled')this.#recordSettlement(result,state.offsetY);
  }

  #recordSettlement(result,offsetY){
    this.#settled=Object.freeze({cells:result.cells,offsetY});
    this.#phase='settled';
  }

  // Rebuild from the versioned fixture, then replay the exact integer landing.
  // The returned object is published only after validation succeeds.
  static restore(save){
    const fixture=new TerrainCollapseFixture();
    if(save?.schema!==SAVE_SCHEMA||save.offsetY!==LANDING_OFFSET||!fixture.removeSupport())return null;
    const [body]=fixture.#handoff.bodies;
    const result=fixture.#handoff.settle(body,save.offsetY,known);
    if(result.status!=='settled')return null;
    fixture.#recordSettlement(result,save.offsetY);
    return fixture;
  }
}
