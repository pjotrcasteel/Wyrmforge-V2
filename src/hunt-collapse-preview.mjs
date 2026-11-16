import {TerrainClusterHandoff} from './terrain-cluster-handoff.mjs';
import {TerrainClusterPhysics} from './terrain-cluster-physics.mjs';
import {scanTerrainSupport} from './terrain-support-scan.mjs';
import {projectVoxel} from './camera-presets.mjs';

const OWNER='region-entry:cell:8:0:1';
const SUPPORT={id:'hunt-collapse-preview-support',type:'carve-sphere',x:5,y:6,z:10,radius:1.1};
const SUPPORT_KEY='5,6,10';
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
  #isKnown;
  #phase;

  constructor(world,port,residency,save){
    this.#world=world;
    this.#port=port;
    this.#residency=residency;
    this.#save=save;
    this.#phase=save.removedCells.has(SUPPORT_KEY)?'settled':'ready';
    this.#handoff=new TerrainClusterHandoff(world);
    this.#isKnown=(x,y,z)=>residency.publishedAt(x+.5,z+.5);
    this.#physics=new TerrainClusterPhysics(world,this.#handoff,{isKnown:this.#isKnown});
  }

  get phase(){return this.#phase;}
  get holdsFixture(){return this.#phase==='falling'||this.#phase==='actor-blocked';}
  get collision(){return this.#physics;}
  get protectedIds(){return this.holdsFixture?[OWNER]:[];}

  release(){
    if(this.#phase!=='ready'||!this.#residency.publishedAt(5.5,10.5))return [];
    const edit=this.#port.apply(SUPPORT,{captureRemovedCells:true});
    const dirty=this.acceptImpact(edit);
    if(!this.holdsFixture)this.#save.commit(edit.removedCells);
    return [...new Set([...edit.dirtyChunks,...dirty])];
  }

  acceptImpact(edit){
    if(this.#phase!=='ready'||!edit.removedCells?.includes(SUPPORT_KEY))return [];
    const removed=edit.removedCells.map(key=>{
      const [x,y,z]=key.split(',').map(Number);
      return {x,y,z};
    });
    const scan=scanTerrainSupport(this.#world,removed,{
      isKnown:this.#isKnown,cohesive:new Set([3]),anchors:new Set([4])
    });
    const candidates=scan.candidates.filter(candidate=>
      candidate.cells.some(isShelf)&&candidate.cells.every(isScaffold));
    if(scan.status!=='complete'||candidates.length!==1){
      this.#phase='blocked';
      return [];
    }
    const detached=this.#handoff.detach(candidates[0]);
    if(detached.status!=='detached'){
      this.#phase='blocked';
      return [];
    }
    this.#removed=[...edit.removedCells,...detached.body.cells.map(cellKey)];
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
    const additions=result.cells.map(cell=>({...cell,owner:OWNER}));
    this.#residency.trackAddedCells(OWNER,additions);
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
    for(const {x,y,z} of this.renderCells){
      if(z===11)face([[x,y,z+1],[x+1,y,z+1],[x+1,y+1,z+1],[x,y+1,z+1]],'#787468');
      face([[x,y+1,z],[x+1,y+1,z],[x+1,y+1,z+1],[x,y+1,z+1]],'#b7ae99');
    }
  }
}
