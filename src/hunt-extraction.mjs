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

export function extractionPortalLayer(view,gate){
  const p=gate?.ground;
  if(!p||view.camera!=='hunt')return null;
  const foot=projectVoxel(p.x,p.y,p.z,view);
  const scale=view.scale/8;
  const width=38*scale,height=37*scale;
  const x=Math.round(foot.x-width/2),y=Math.round(foot.y-height);
  if(x+width<0||x>view.width||y+height<0||y>view.height)return null;
  return {x,y,w:width,h:height,depth:foot.depth,paint(ctx){
    ctx.save();
    ctx.translate(Math.round(foot.x),Math.round(foot.y));
    ctx.scale(scale,scale);
    const ready=gate.eligible&&!gate.completed;
    // A dark opening when locked, bright bands of energy when traversal is available.
    for(const [rx,ry,color] of [
      [18,18,'#18251f'],[15,16,ready?'#34695e':'#37443b'],
      [12,14,ready?'#79c7a2':'#202d27'],[9,12,ready?'#366d70':'#17211d']
    ]){
      ctx.fillStyle=color;
      ctx.beginPath();
      ctx.ellipse(0,-18,rx,ry,0,0,Math.PI*2);
      ctx.fill();
    }
    ctx.fillStyle=ready?'#e2ffe0':'#546254';
    ctx.fillRect(-2,-34,4,2);
    ctx.fillRect(-14,-19,2,4);
    ctx.fillRect(12,-19,2,4);
    if(ready){
      ctx.fillRect(-7,-13,8,2);
      ctx.fillRect(1,-24,6,2);
      ctx.fillRect(-2,-6,4,1);
    }
    ctx.restore();
  }};
}
