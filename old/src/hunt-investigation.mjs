const CONTENT=Object.freeze({
  'investigation-location':{
    action:'Inspect ruins',
    revisitAction:'Read ruins clue',
    result:'Fresh ash lies inside the old walls. Someone passed through recently.'
  },
  'optional-discovery':{
    action:'Search cache',
    revisitAction:'Read cache finding',
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
      const x=site.at.x+.5,z=site.at.z+.5;
      const hit=terrain.raycast({origin:[x,32,z],direction:[0,-1,0],maxDistance:42});
      return hit&&hit.point.y>=0?[{...site,x,y:hit.point.y,z}]:[];
    });
  }

  get markers(){return this.#markers;}
  get findings(){return [...this.#found].sort();}
  has(id){return this.#found.has(id);}

  nearby(actor){
    const site=this.#markers.find(site=>
      Math.hypot(actor.x-site.x,actor.z-site.z)<=3.5&&Math.abs(actor.y-site.y)<=2);
    if(!site||!this.has(site.id))return site;
    return {...site,action:site.revisitAction};
  }

  interact(actor){
    const site=this.nearby(actor);
    if(!site)return null;
    if(!this.has(site.id)){
      this.#found.add(site.id);
      try{this.#storage?.setItem(this.#key,JSON.stringify(this.findings));}catch{}
    }
    return site.result;
  }
}
