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

// Read the dirt trail's actual width at both source edges. Do not stamp
// a fixed-width rectangle across otherwise organic authored road ends.
function roadSpan(profile,minX,maxX) {
  if(profile.get(0)?.material!==2)return {left:-2,right:2};
  let left=0,right=0;
  while(left>minX && profile.get(left-1)?.material===2)left--;
  while(right<maxX && profile.get(right+1)?.material===2)right++;
  return {left,right};
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
  const southRoad=roadSpan(southEdge,a.minX,a.maxX);
  const northRoad=roadSpan(northEdge,b.minX,b.maxX);
  const floor=Math.min(a.minY,b.minY);
  const runs=[],surfaceTiles=[],columns=new Map();
  let maximumRouteGradeTenths=0,maxY=floor;
  const clamp=(v,lo,hi)=>Math.max(lo,Math.min(hi,v));
  // Height at a continuous ground position. Use the actual authored edge
  // samples; integer x is the center of a coarse voxel, not a world edge.
  const edgeHeight=(profile,x)=>{
    const lo=clamp(Math.floor(x),a.minX,a.maxX);
    const hi=clamp(lo+1,a.minX,a.maxX);
    const fraction=clamp(x-lo,0,1);
    return profile.get(lo).topTenths*(1-fraction)+profile.get(hi).topTenths*fraction;
  };
  const heightAt=(x,z)=>{
    const t=clamp((z-start+1)/(CONNECTOR_DEPTH+1),0,1);
    const interior=Math.sin(Math.PI*t);
    const shoulder=clamp((Math.abs(x)-3)/3,0,1);
    const phase=Math.sin(x*.41+south.recipe.seed*.19)*.24+
      Math.sin(x*.93+south.recipe.seed*.07)*.09;
    const blend=clamp(t+phase*interior*shoulder,0,1);
    const n=edgeHeight(northEdge,x),s=edgeHeight(southEdge,x);
    // Coherent small variation, not random noise or altered renderer vertices.
    const wave=Math.sin(x*.73+south.recipe.seed*.19)*1.6+
      Math.sin(x*.31+z*.91)*.75;
    return n+(s-n)*blend+wave*interior*shoulder;
  };
  for(let x=a.minX;x<=a.maxX;x++){
    const s=southEdge.get(x),n=northEdge.get(x);
    let previous=n.topTenths;
    for(let z=start;z<a.minZ;z++){
      const t=(z-start+1)/(CONNECTOR_DEPTH+1);
      const interior=Math.sin(Math.PI*t);
      const topTenths=Math.round(heightAt(x,z));
      // Sample actual 10cm occupancy in coherent 20cm patches. Quantize
      // the grade *after* sampling, rather than making all 100 microcells
      // a single flat 1m terrace. Keep the central route's proven support
      // profile and limit new shoulder refinement to 3 tenths either side
      // of the existing column, so one sparse parent still represents it.
      const tops=[];
      for(let iz=0;iz<10;iz++)for(let ix=0;ix<10;ix++) {
        const px=x+(Math.floor(ix/2)*2+1)/10-.5;
        const pz=z+(Math.floor(iz/2)*2+1)/10-.5;
        const shoulder=clamp((Math.abs(x)-3)/2,0,1);
        const sampled=heightAt(px,pz);
        // The protected central path retains the validated coarse grade.
        tops.push(Math.round(clamp(topTenths+(sampled-topTenths)*shoulder,
          topTenths-3,topTenths+3)));
      }
      const y=Math.ceil(Math.max(...tops)/10)-1;
      // Voxel V2 sparse surface contract refines only the top parent;
      // do not claim a partial second parent or create unsupported floors.
      const levels=tops.map(top=>clamp(top-y*10,1,10));
      const bend=interior*Math.sin(south.recipe.seed*.47)*.45;
      // Both authored road endpoints are centered at x=0. Their rounded
      // boundary caps can be only one cell wide. Never subtract a taper
      // from that width: the previous fractional interval became empty.
      // Widen the interior gradually and always preserve the center lane.
      const left=Math.min(0,Math.floor(northRoad.left+
        (southRoad.left-northRoad.left)*t+bend-interior*1.3));
      const right=Math.max(0,Math.ceil(northRoad.right+
        (southRoad.right-northRoad.right)*t+bend+interior*1.3));
      const edgeMaterial=t<.5?n.material:s.material;
      const central=Math.abs(x)<=Math.max(Math.abs(left),Math.abs(right))+1;
      const material=x>=left && x<=right?2:
        (central && edgeMaterial===2?1:edgeMaterial);
      columns.set(x+','+z,{y,material});
      maxY=Math.max(maxY,y);
      if(levels.some(level=>level!==10))surfaceTiles.push({x,y,z,levels});
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
    profile:'micrograded-road-v4',
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
    hash:'connected-v4-'+south.hash+'-'+north.hash
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
