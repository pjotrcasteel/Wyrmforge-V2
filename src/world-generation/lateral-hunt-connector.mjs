// H08-02B: physical east/west connections of native authored Wet Forest sites.
// This is a spatial composition operation, never a second terrain generator.
// The two sites remain immutable. Only their planned 8m seam is materialized.
const clamp=(v,lo,hi)=>Math.max(lo,Math.min(hi,v));

function edgeProfile(site,x,microX) {
  const tiles=new Map(site.definition.surfaceTiles.map(t=>[t.x+','+t.y+','+t.z,t]));
  const profile=new Map();
  for(const run of site.definition.runs) {
    if(x<run.x||x>=run.x+run.length)continue;
    if(profile.has(run.z)&&profile.get(run.z).y>=run.y)continue;
    const tile=tiles.get(x+','+run.y+','+run.z);
    const height=tile?Math.max(...Array.from({length:10},(_,i)=>tile.levels[i*10+microX])):10;
    profile.set(run.z,{y:run.y,top:run.y*10+height,material:run.material});
  }
  if(profile.size!==site.layout.footprint.maxZ-site.layout.footprint.minZ+1)
    throw new Error('Incomplete authored lateral edge');
  return profile;
}

export function composeLateralHuntConnector(layout,linkId,{westSite,eastSite,terrainAdapter}={}) {
  const link=layout?.links.find(l=>l.id===linkId);
  if(!link||!['east','west'].includes(link.fromPort.direction)||typeof terrainAdapter!=='function')
    throw new Error('Expected an authored lateral graph link');
  const from=layout.regions.find(r=>r.id===link.fromId);
  const to=layout.regions.find(r=>r.id===link.toId);
  const [west,east]=from.offsetX<to.offsetX?[from,to]:[to,from];
  if(!westSite||!eastSite||westSite.recipe.regionId!==west.id||eastSite.recipe.regionId!==east.id||
      westSite.recipe.kind!==west.biome||eastSite.recipe.kind!==east.biome||
      westSite.recipe.seed!==eastSite.recipe.seed||westSite.recipe.corruption!==eastSite.recipe.corruption||
      westSite.recipe.worldRevision!==eastSite.recipe.worldRevision||westSite.recipe.chunkEdge!==eastSite.recipe.chunkEdge)
    throw new Error('Authored lateral source identity mismatch');
  const {minX,maxX,minZ,maxZ}=link.bounds;
  if(maxX-minX!==7||west.bounds.maxX!==minX-1||east.bounds.minX!==maxX+1||
      west.offsetZ!==east.offsetZ)throw new Error('Invalid lateral seam envelope');
  const a=edgeProfile(westSite,westSite.layout.footprint.maxX,9);
  const b=edgeProfile(eastSite,eastSite.layout.footprint.minX,0);
  const floor=Math.min(westSite.layout.footprint.minY,eastSite.layout.footprint.minY);
  const columns=new Map(),surfaceTiles=[],runs=[];
  let maxY=floor,maximumRouteGradeTenths=0;
  const phase=(westSite.recipe.seed%97)*.19;
  for(let z=minZ;z<=maxZ;z++) {
    const localZ=z-west.offsetZ;
    const w=a.get(localZ),e=b.get(localZ);
    if(!w||!e)throw new Error('Missing source lateral boundary');
    let previous=w.top;
    for(let x=minX;x<=maxX;x++){
      const t=(x-minX+1)/9;
      const delta=e.top-w.top;
      const steps=Math.max(1,Math.ceil(Math.abs(delta)/4));
      const grade=w.top+Math.round(delta*Math.round(t*steps)/steps);
      const shoulder=clamp((Math.abs(localZ)-2)/3,0,1);
      const u=clamp(t+Math.sin(Math.PI*t)*.22*Math.sin(localZ*.19+phase),0,1);
      const eased=u*u*(3-2*u);
      const broad=10*Math.round((w.y+1)*(1-eased)+(e.y+1)*eased);
      const top=shoulder===0?grade:shoulder===1?broad:5*Math.round((grade*(1-shoulder)+broad*shoulder)/5);
      const y=Math.ceil(top/10)-1,level=top-y*10;
      // A woodland cut-through follows the actual adjacent material; no
      // mandatory paved road or combat arena is painted onto every branch.
      const material=t<.5?w.material:e.material;
      columns.set(x+','+z,{y,material});
      maxY=Math.max(maxY,y);
      if(level!==10)surfaceTiles.push({x,y,z,levels:Array(100).fill(level)});
      if(Math.abs(localZ)<=2)maximumRouteGradeTenths=Math.max(maximumRouteGradeTenths,Math.abs(top-previous));
      previous=top;
    }
    if(Math.abs(localZ)<=2)maximumRouteGradeTenths=Math.max(maximumRouteGradeTenths,Math.abs(e.top-previous));
  }
  if(maximumRouteGradeTenths>5)throw new Error('Lateral connection exceeds passive traversal grade');
  const materialAt=(x,y,z)=>{
    const c=columns.get(x+','+z);
    if(!c||y>c.y)return 0;
    return y===c.y?c.material:c.material!==3&&y>=c.y-2?2:3;
  };
  for(let y=floor;y<=maxY;y++)for(let z=minZ;z<=maxZ;z++){
    let x=minX;
    while(x<=maxX){
      const material=materialAt(x,y,z);
      if(!material){x++;continue;}
      let end=x+1;
      while(end<=maxX&&materialAt(end,y,z)===material)end++;
      runs.push({x,y,z,length:end-x,material});x=end;
    }
  }
  const definition=terrainAdapter({siteId:link.id,seed:westSite.recipe.seed,
    chunkEdge:westSite.recipe.chunkEdge,generatorVersion:westSite.generatorVersion,runs,surfaceTiles});
  return Object.freeze({id:link.id,westId:west.id,eastId:east.id,bounds:link.bounds,
    maximumRouteGradeTenths,routeWidthMetres:5,profile:'broad-lateral-woodland-v1',definition});
}
