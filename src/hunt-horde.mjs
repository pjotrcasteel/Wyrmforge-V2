import {spawnTerrainActor,simulateTerrainActor,ACTOR_HALF_WIDTH,ACTOR_HEIGHT} from './terrain-actor.mjs';
import {containsHuntLandform} from './world-generation/hunt-landform-footprint.mjs';

const WAVE_SIZES=[4,7,10];
const WAVE_SECONDS=8;
const CONTACT_COOLDOWN=1;
const SPAWN_OFFSETS=[[0,-10],[10,0],[-10,0],[0,10],[8,-8],[-8,8],[-8,-8],[8,8],
  [4,-11],[-4,11],[11,4],[-11,-4],[4,11],[-4,-11],[-11,4],[11,-4]];

export class HuntHorde {
  #region;
  #wave=0;
  #time=0;
  #enemies=[];
  #phase='waiting';
  #contacts=0;
  #cooldown=0;
  #spawned=0;
  #peak=0;

  constructor(region){this.#region=region;}
  get enemies(){return this.#enemies;}
  get active(){return this.#phase==='active';}
  get waiting(){return this.#phase==='waiting';}
  get report(){
    return {phase:this.#phase,wave:this.#wave,contacts:this.#contacts,
      spawned:this.#spawned,peakActive:this.#peak,secondsRemaining:Math.max(0,Math.ceil(WAVE_SECONDS-this.#time))};
  }

  #within(x,z){
    return [-ACTOR_HALF_WIDTH,ACTOR_HALF_WIDTH].every(dx=>
      [-ACTOR_HALF_WIDTH,ACTOR_HALF_WIDTH].every(dz=>containsHuntLandform(this.#region,x+dx,z+dz)));
  }

  #spawn(world,actor,objects){
    const enemies=[];
    for(const [dx,dz] of SPAWN_OFFSETS){
      const x=this.#region.offsetX+dx+.5,z=this.#region.offsetZ+dz+.5;
      if(Math.hypot(x-actor.x,z-actor.z)<4||!this.#within(x,z))continue;
      const enemy=spawnTerrainActor(world,{x,z,searchTopY:30,maxSearchDistance:64});
      if(!enemy?.grounded)continue;
      const overlapsProp=objects&&[...objects.regions].some(region=>region.some(prop=>
        enemy.y<prop.y+prop.height&&enemy.y+ACTOR_HEIGHT>prop.y&&
        Math.hypot(enemy.x-prop.x,enemy.z-prop.z)<prop.radius+(prop.halfLength??0)+ACTOR_HALF_WIDTH));
      if(overlapsProp)continue;
      enemies.push(enemy);
      if(enemies.length===WAVE_SIZES[this.#wave-1])break;
    }
    this.#enemies=enemies;
    this.#spawned+=enemies.length;
    this.#peak=Math.max(this.#peak,enemies.length);
    return enemies.length;
  }

  step({world,actor,section,objects,dt}){
    if(!this.#region||this.#phase==='complete')return;
    if(section!==this.#region.id){
      if(this.#phase==='active'||this.#phase==='failed'){
        this.#phase='waiting';
        this.#wave=this.#contacts=this.#time=this.#cooldown=0;
        this.#enemies=[];
      }
      return;
    }
    if(this.#phase==='failed')return;
    if(this.#phase==='waiting'){
      if(!actor.grounded||Math.hypot(actor.x-this.#region.offsetX,actor.z-this.#region.offsetZ)>8)return;
      this.#wave=1;
      if(!this.#spawn(world,actor,objects)){
        this.#phase='failed';
        return;
      }
      this.#phase='active';
    }
    this.#time+=dt;
    this.#cooldown=Math.max(0,this.#cooldown-dt);
    const hit=this.#enemies.some(enemy=>Math.abs(enemy.y-actor.y)<1.1&&
      Math.hypot(enemy.x-actor.x,enemy.z-actor.z)<.75);
    if(hit&&this.#cooldown===0){
      this.#contacts++;
      this.#cooldown=CONTACT_COOLDOWN;
      if(this.#contacts>=3){
        this.#phase='failed';
        this.#enemies=[];
        return;
      }
    }
    if(this.#time>=WAVE_SECONDS){
      this.#time=0;
      if(this.#wave===WAVE_SIZES.length){
        this.#phase='complete';
        this.#enemies=[];
        return;
      }
      this.#wave++;
      if(!this.#spawn(world,actor,objects)){
        this.#phase='failed';
        return;
      }
    }
    const speed=1.85+(this.#wave-1)*.25;
    this.#enemies=this.#enemies.map(enemy=>{
      const dx=actor.x-enemy.x,dz=actor.z-enemy.z;
      const length=Math.max(1,Math.hypot(dx,dz));
      const moveX=dx/length,moveZ=dz/length;
      const limitHorizontal=(position,axis,distance)=>{
        const x=position.x+(axis==='x'?distance:0);
        const z=position.z+(axis==='z'?distance:0);
        if(!this.#within(x,z))return 0;
        return objects?.limitTravel(position,axis,distance)??distance;
      };
      return simulateTerrainActor(world,enemy,{moveX,moveZ,dt,moveSpeed:speed,limitHorizontal});
    }).filter(enemy=>!enemy.error);
  }
}
