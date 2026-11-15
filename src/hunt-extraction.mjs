import {projectVoxel} from './camera-presets.mjs';

export class HuntExtraction {
  #region;
  #investigation;
  #storage;
  #key;
  #completed=false;
  #ground=null;
  #revision;
  #terrain;

  constructor(region,investigation,seed,revision,storage){
    this.#region=region;
    this.#investigation=investigation;
    this.#storage=storage;
    this.#key='wyrmforge.hunt-extraction.v1:'+seed+':'+revision;
    try{this.#completed=storage?.getItem(this.#key)==='complete';}catch{}
  }

  update(residentIds,terrain){
    if(!this.#region||!residentIds.includes(this.#region.id)){
      this.#ground=null;
      this.#terrain=null;
      return;
    }
    if(this.#terrain===terrain&&this.#revision===terrain.revision)return;
    this.#terrain=terrain;
    this.#revision=terrain.revision;
    const x=this.#region.offsetX+.5,z=this.#region.bounds.minZ+2.5;
    const hit=terrain.raycast({origin:[x,32,z],direction:[0,-1,0],maxDistance:42});
    this.#ground=hit?{x,y:hit.point.y,z}:null;
  }

  get ground(){return this.#ground;}
  get completed(){return this.#completed;}
  get eligible(){return this.#investigation.has('region-forgotten-ruins-opportunity');}

  nearby(actor){
    const p=this.#ground;
    return Boolean(p&&actor&&Math.hypot(actor.x-p.x,actor.z-p.z)<=4&&Math.abs(actor.y-p.y)<=2);
  }

  extract(actor){
    if(!this.nearby(actor)||!this.eligible||this.#completed)return false;
    this.#completed=true;
    try{this.#storage?.setItem(this.#key,'complete');}catch{}
    return true;
  }
}

export function paintExtractionArch(ctx,view,gate){
  const p=gate.ground;
  if(!p||view.camera!=='hunt')return;
  const foot=projectVoxel(p.x,p.y,p.z,view);
  const s=view.scale/8;
  if(foot.x<-110*s||foot.x>view.width+110*s||foot.y<-12*s||foot.y>view.height+55*s)return;
  ctx.save();
  ctx.translate(Math.round(foot.x),Math.round(foot.y));
  ctx.scale(s,s);
  // Close the sightline beyond the terminal road with mossy forest rock.
  ctx.fillStyle='#29332e';
  ctx.fillRect(-108,-34,216,32);
  for(let i=-6;i<=6;i++){
    const top=-36-(i*i*7%11);
    ctx.fillStyle=i%2?'#394439':'#454c40';
    ctx.fillRect(i*16-8,top,15,-top-3);
    ctx.fillStyle='#55604a';
    ctx.fillRect(i*16-8,top,13,3);
  }
  ctx.fillStyle='#19221e';
  ctx.fillRect(-13,-23,26,23);
  ctx.fillRect(-9,-30,18,10);
  ctx.fillStyle='#62645b';
  ctx.fillRect(-22,-28,8,28);
  ctx.fillRect(14,-28,8,28);
  ctx.fillRect(-17,-35,34,7);
  ctx.fillRect(-10,-39,20,4);
  ctx.fillStyle='#92917e';
  ctx.fillRect(-22,-28,2,26);
  ctx.fillRect(14,-28,2,26);
  ctx.fillRect(-16,-35,32,2);
  ctx.fillStyle=gate.eligible?'#e7c56c':'#30352d';
  for(const x of [-18,17]){
    ctx.fillRect(x,-22,2,10);
    ctx.fillRect(x-2,-20,6,2);
    ctx.fillRect(x-1,-14,4,2);
  }
  ctx.fillRect(-3,-34,6,2);
  ctx.fillRect(-1,-36,2,6);
  ctx.restore();
}
