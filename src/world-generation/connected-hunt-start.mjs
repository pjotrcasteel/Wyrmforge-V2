// H08-02A: first bounded playable connection between two authored WorldGen
// sites. Keep every source voxel and microtile. Only the 8m joining strip
// is new geometry, derived from the measured boundary profiles of both
// sites. This is not the old expedition heightfield and not streaming yet.
const CONNECTOR_DEPTH=8;
const SCHEMA='wyrmforge.connected-hunt-start.v1';

function northernNeighbor(plan) {
  const entry=plan.regions.find(r=>r.id===plan.entryRegionId);
  const port=entry?.ports.find(p=>p.direction==='north');
  const next=plan.regions.find(r=>r.id===port?.peerRegionId);
  if(!entry || !next || !next.ports.some(p=>
      p.direction==='south' && p.peerRegionId===entry.id)) {
    throw new Error('Connected Hunt start needs reciprocal expedition ports');
  }
  return {entry,next};
}

function boundaryProfile(site,z,microRow) {
  const {minX,maxX}=site.layout.footprint;
  const tiles=new Map(site.definition.surfaceTiles.map(t=>[t.x+','+t.y+','+t.z,t]));
  const columns=new Map();
  for(const run of site.definition.runs) {
    if(run.z!==z)continue;
    for(let x=run.x;x<run.x+run.length;x++){
      const previous=columns.get(x);
      if(previous && previous.y>=run.y)continue;
      const tile=tiles.get(x+','+run.y+','+z);
      const level=tile?Math.max(...tile.levels.slice(microRow*10,microRow*10+10)):10;
      columns.set(x,{y:run.y,topTenths:run.y*10+level,material:run.material});
    }
  }
  if(columns.size!==maxX-minX+1)throw new Error('Authored site boundary is incomplete');
  return columns;
}

function joinBoundaries(south,north,offsetZ) {
  const a=south.layout.footprint,b=north.layout.footprint;
  if(a.minX!==b.minX || a.maxX!==b.maxX) {
    throw new Error('First northbound Hunt connection requires equal site widths');
  }
  const start=a.minZ-CONNECTOR_DEPTH;
  if(b.maxZ+offsetZ!==start-1)throw new Error('Hunt connection overlaps or leaves a gap');
  const southEdge=boundaryProfile(south,a.minZ,0);
  const northEdge=boundaryProfile(north,b.maxZ,9);
  const floor=Math.min(a.minY,b.minY);
  const runs=[],surfaceTiles=[],columns=new Map();
  let maximumRouteGradeTenths=0,maxY=floor;
  for(let x=a.minX;x<=a.maxX;x++){
    const s=southEdge.get(x),n=northEdge.get(x);
    let previous=n.topTenths;
    for(let z=start;z<a.minZ;z++){
      const t=(z-start+1)/(CONNECTOR_DEPTH+1);
      const topTenths=Math.round(n.topTenths+(s.topTenths-n.topTenths)*t);
      const y=Math.ceil(topTenths/10)-1;
      const level=topTenths-y*10;
      const material=Math.abs(x)<=2 ? 2 :
        (t<.5?n.material:s.material);
      columns.set(x+','+z,{y,material});
      maxY=Math.max(maxY,y);
      if(level!==10)surfaceTiles.push({x,y,z,levels:Array(100).fill(level)});
      if(Math.abs(x)<=3)maximumRouteGradeTenths=Math.max(
        maximumRouteGradeTenths,Math.abs(topTenths-previous));
      previous=topTenths;
    }
    if(Math.abs(x)<=3)maximumRouteGradeTenths=Math.max(
      maximumRouteGradeTenths,Math.abs(s.topTenths-previous));
  }
  if(maximumRouteGradeTenths>5)throw new Error('Authored connection exceeds passive traversal grade');
  const materialAt=(x,y,z)=>{
    const column=columns.get(x+','+z);
    if(!column || y>column.y)return 0;
    if(y===column.y)return column.material;
    return column.material!==3 && y>=column.y-2?2:3;
  };
  for(let y=floor;y<=maxY;y++)for(let z=start;z<a.minZ;z++){
    let x=a.minX;
    while(x<=a.maxX){
      const material=materialAt(x,y,z);
      if(!material){x++;continue;}
      let end=x+1;
      while(end<=a.maxX && materialAt(end,y,z)===material)end++;
      runs.push({x,y,z,length:end-x,material});
      x=end;
    }
  }
  return {runs,surfaceTiles,seam:Object.freeze({
    direction:'north',minZ:start,maxZ:a.minZ-1,routeWidthMetres:7,
    maximumRouteGradeTenths,depthMetres:CONNECTOR_DEPTH
  }),maxY};
}

export function composeConnectedHuntStart(plan,south,{generateSite,createRecipe,terrainAdapter}={}) {
  if(plan?.recipe?.kind!=='wet-forest' || south?.recipe?.kind!=='wet-forest' ||
      south.schema!=='wyrmforge.generated-site.v2' ||
      typeof generateSite!=='function' || typeof createRecipe!=='function' ||
      typeof terrainAdapter!=='function') {
    throw new TypeError('Expected authored Wet Forest and expedition composition contracts');
  }
  const {entry,next}=northernNeighbor(plan);
  const north=generateSite(createRecipe({...south.recipe,
    regionId:next.id,siteId:'preview-'+next.id}));
  const a=south.layout.footprint,b=north.layout.footprint;
  const offsetZ=a.minZ-CONNECTOR_DEPTH-b.maxZ-1;
  const connector=joinBoundaries(south,north,offsetZ);
  const definition=terrainAdapter({
    siteId:'connected-wet-forest-start',seed:south.recipe.seed,
    chunkEdge:south.recipe.chunkEdge,generatorVersion:south.generatorVersion,
    runs:[...south.definition.runs,...north.definition.runs.map(run=>
      ({...run,z:run.z+offsetZ})),...connector.runs],
    surfaceTiles:[...south.definition.surfaceTiles,...north.definition.surfaceTiles.map(tile=>
      ({...tile,z:tile.z+offsetZ})),...connector.surfaceTiles]
  });
  const footprint=Object.freeze({
    minX:a.minX,maxX:a.maxX,minZ:b.minZ+offsetZ,maxZ:a.maxZ,
    minY:Math.min(a.minY,b.minY),maxY:Math.max(a.maxY,b.maxY,connector.maxY)
  });
  return Object.freeze({
    schema:SCHEMA,planHash:plan.hash,definition,footprint,
    seam:connector.seam,
    sites:Object.freeze([
      Object.freeze({id:entry.id,role:entry.role,hash:south.hash,offsetZ:0,minZ:a.minZ,maxZ:a.maxZ}),
      Object.freeze({id:next.id,role:next.role,hash:north.hash,offsetZ,minZ:b.minZ+offsetZ,maxZ:b.maxZ+offsetZ})
    ]),
    streaming:false,
    // The generated-site hashes remain intact; only the composition is new.
    hash:'connected-'+south.hash+'-'+north.hash
  });
}

export function connectedHuntLocation(connection,z) {
  return connection.sites.find(site=>z>=site.minZ && z<site.maxZ+1)?.id ??
    ((connection.seams??[connection.seam]).some(seam=>z>=seam.minZ && z<seam.maxZ+1)?'connection':'outside');
}

// First streaming increment: the next authored northbound site and its
// connector are a separate immutable definition, disjoint from the live start.
// No world allocation or simplified heightfield in the generator.
export function composeConnectedHuntContinuation(plan,entrySite,start,{generateSite,createRecipe,terrainAdapter}) {
  if(start.planHash!==plan.hash || start.sites.length!==2 ||
      start.sites[0].hash!==entrySite.hash)throw new Error('Invalid authored Hunt prefix');
  const tail=start.sites[1];
  const region=plan.regions.find(r=>r.id===tail.id);
  const next=plan.regions.find(r=>r.id===region?.ports.find(p=>p.direction==='north')?.peerRegionId);
  if(!next || !next.ports.some(p=>p.direction==='south' && p.peerRegionId===tail.id))
    throw new Error('Expected reciprocal northbound region');
  const makeSite=id=>generateSite(createRecipe({...entrySite.recipe,
    regionId:id,siteId:'preview-'+id}));
  const south=makeSite(tail.id),north=makeSite(next.id);
  if(south.hash!==tail.hash)throw new Error('Existing authored site identity changed');
  const localOffset=south.layout.footprint.minZ-CONNECTOR_DEPTH-north.layout.footprint.maxZ-1;
  const connector=joinBoundaries(south,north,localOffset);
  const offsetZ=tail.offsetZ+localOffset;
  const translate=(items,offset)=>items.map(item=>({...item,z:item.z+offset}));
  const definition=terrainAdapter({
    siteId:'connected-wet-forest-prefetch',seed:entrySite.recipe.seed,
    chunkEdge:entrySite.recipe.chunkEdge,generatorVersion:entrySite.generatorVersion,
    runs:[...translate(north.definition.runs,offsetZ),...translate(connector.runs,tail.offsetZ)],
    surfaceTiles:[...translate(north.definition.surfaceTiles,offsetZ),
      ...translate(connector.surfaceTiles,tail.offsetZ)]
  });
  const seam=Object.freeze({...connector.seam,
    minZ:connector.seam.minZ+tail.offsetZ,maxZ:connector.seam.maxZ+tail.offsetZ});
  const site=Object.freeze({id:next.id,role:next.role,hash:north.hash,offsetZ,
    minZ:north.layout.footprint.minZ+offsetZ,maxZ:north.layout.footprint.maxZ+offsetZ});
  if(seam.maxZ!==start.footprint.minZ-1 || site.maxZ!==seam.minZ-1)
    throw new Error('Authored prefetch is not contiguous');
  const footprint=Object.freeze({...start.footprint,minZ:site.minZ,
    minY:Math.min(start.footprint.minY,north.layout.footprint.minY),
    maxY:Math.max(start.footprint.maxY,north.layout.footprint.maxY,connector.maxY)});
  return Object.freeze({definition,site,seam,footprint,
    triggerZ:tail.maxZ+1-5,hash:start.hash+'-'+north.hash});
}

export function activateConnectedHuntContinuation(start,continuation) {
  return Object.freeze({...start,
    sites:Object.freeze([...start.sites,continuation.site]),
    seams:Object.freeze([start.seam,continuation.seam]),
    footprint:continuation.footprint,hash:continuation.hash,
    streaming:true,eviction:false,residentLimit:3
  });
}
