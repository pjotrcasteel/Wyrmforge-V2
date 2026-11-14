// WorldGen spatial composition only. A region and each seam have independent
// deterministic definitions. Never create a giant combined voxel payload.
// The host can request a region or link by stable ID in any traversal order.
import {composeAuthoredHuntLayout} from './authored-hunt-layout.mjs';
import {composeNorthSouthHuntConnector} from './connected-hunt-start.mjs';
import {composeLateralHuntConnector} from './lateral-hunt-connector.mjs';

export class AuthoredHuntTerrainGraph {
  #entry;
  #generateSite;
  #createRecipe;
  #adapter;
  #layout;
  constructor(plan,entry,{generateSite,createRecipe,terrainAdapter}={}) {
    if(![generateSite,createRecipe,terrainAdapter].every(f=>typeof f==='function'))
      throw new TypeError('Expected native WorldGen graph composition contracts');
    this.#entry=entry;
    this.#generateSite=generateSite;
    this.#createRecipe=createRecipe;
    this.#adapter=terrainAdapter;
    this.#layout=composeAuthoredHuntLayout(plan,entry);
  }
  get layout(){return this.#layout;}
  #region(id){
    const region=this.#layout.regions.find(r=>r.id===id);
    if(!region)throw new RangeError('Unknown authored graph region');
    return region;
  }
  #source(id){
    const region=this.#region(id);
    if(region.id===this.#layout.entryRegionId)return this.#entry;
    return this.#generateSite(this.#createRecipe({...this.#entry.recipe,
      regionId:region.id,siteId:'preview-'+region.id,
      lateralPorts:region.ports.map(p=>p.direction).filter(d=>d==='east'||d==='west')}));
  }
  region(id){
    const region=this.#region(id),site=this.#source(id);
    const translate=items=>items.map(item=>({...item,x:item.x+region.offsetX,z:item.z+region.offsetZ}));
    const definition=this.#adapter({siteId:region.id,seed:site.recipe.seed,
      chunkEdge:site.recipe.chunkEdge,generatorVersion:site.generatorVersion,
      runs:translate(site.definition.runs),surfaceTiles:translate(site.definition.surfaceTiles)});
    return Object.freeze({id,kind:'region',role:region.role,bounds:region.bounds,
      sourceHash:site.hash,definition});
  }
  link(id){
    const link=this.#layout.links.find(l=>l.id===id);
    if(!link)throw new RangeError('Unknown authored graph link');
    const from=this.#region(link.fromId),to=this.#region(link.toId);
    const a=this.#source(from.id),b=this.#source(to.id);
    const lateral=['east','west'].includes(link.fromPort.direction);
    const seam=lateral?
      composeLateralHuntConnector(this.#layout,id,{
        westSite:from.offsetX<to.offsetX?a:b,eastSite:from.offsetX<to.offsetX?b:a,
        terrainAdapter:this.#adapter}):
      composeNorthSouthHuntConnector(this.#layout,id,{
        southSite:from.offsetZ>to.offsetZ?a:b,northSite:from.offsetZ>to.offsetZ?b:a,
        terrainAdapter:this.#adapter});
    return Object.freeze({...seam,kind:'link',fromId:link.fromId,toId:link.toId});
  }
  initialTerrain(ids){
    if(!Array.isArray(ids)||ids.length!==3||new Set(ids).size!==3)
      throw new Error('Expected the two initial regions and their link');
    const regions=ids.filter(id=>this.#layout.regions.some(r=>r.id===id));
    const link=this.#layout.links.find(l=>ids.includes(l.id));
    if(regions.length!==2||!regions.includes(this.#layout.entryRegionId)||
        !link||![link.fromId,link.toId].every(id=>regions.includes(id)))
      throw new Error('Invalid initial graph neighborhood');
    const bands=ids.map(id=>this.materialize(id));
    return this.#adapter({siteId:'authored-graph-start',seed:this.#entry.recipe.seed,
      chunkEdge:this.#entry.recipe.chunkEdge,generatorVersion:this.#entry.generatorVersion,
      runs:bands.flatMap(b=>b.definition.runs),
      surfaceTiles:bands.flatMap(b=>b.definition.surfaceTiles??[])});
  }
  materialize(id){
    if(this.#layout.regions.some(r=>r.id===id))return this.region(id);
    return this.link(id);
  }
}
