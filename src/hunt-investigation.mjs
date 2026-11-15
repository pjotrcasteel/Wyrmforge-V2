const CONTENT=Object.freeze({
  'investigation-location':{
    action:'Inspect ruins',
    result:'Fresh ash lies inside the old walls. Someone passed through recently.'
  },
  'optional-discovery':{
    action:'Search cache',
    result:'You found a sealed cache with a scorched trail marker inside.'
  }
});

export class HuntInvestigation {
  #sites;
  #found=new Set();
  #storage;
  #key;
  #markers=[];
  #terrain=null;
  #revision;
  #regionKey;

  constructor(regions,seed,worldRevision,storage){
    this.#sites=regions.flatMap(region=>region.opportunities
      .filter(site=>Object.hasOwn(CONTENT,site.kind))
      .map(site=>({...site,regionId:region.id,...CONTENT[site.kind]})));
    this.#storage=storage;
    this.#key='wyrmforge.hunt-findings.v1:'+seed+':'+worldRevision;
    try{
      const saved=JSON.parse(storage?.getItem(this.#key)??'[]');
      if(Array.isArray(saved)){
        for(const site of this.#sites)if(saved.includes(site.id))this.#found.add(site.id);
      }
    }catch{}
  }

  update(regionIds,terrain){
    const key=regionIds.join(',');
    if(terrain===this.#terrain&&terrain.revision===this.#revision&&key===this.#regionKey)return;
    this.#terrain=terrain;
    this.#revision=terrain.revision;
    this.#regionKey=key;
    this.#markers=this.#sites.filter(site=>regionIds.includes(site.regionId)).flatMap(site=>{
      const {x,z}=site.at;
      const hit=terrain.raycast({origin:[x,32,z],direction:[0,-1,0],maxDistance:42});
      return hit&&hit.point.y>=0?[{...site,x,y:hit.point.y,z}]:[];
    });
  }

  get markers(){return this.#markers;}
  get findings(){return [...this.#found].sort();}
  has(id){return this.#found.has(id);}

  nearby(actor){
    return this.#markers.find(site=>!this.has(site.id)&&
      Math.hypot(actor.x-site.x,actor.z-site.z)<=2.2&&Math.abs(actor.y-site.y)<=1);
  }

  interact(actor){
    const site=this.nearby(actor);
    if(!site)return null;
    this.#found.add(site.id);
    try{this.#storage?.setItem(this.#key,JSON.stringify(this.findings));}catch{}
    return site.result;
  }
}
