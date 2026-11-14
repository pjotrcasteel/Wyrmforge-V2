// Bounding rectangles allocate streaming bands. These row spans describe the
// physical land inside them, in the same integer cells as the Voxel V2 runs.
const PORT_HALF_WIDTH=9;
const horizontal=direction=>direction==='east'||direction==='west';

function footprint(bounds,includes) {
  const rows=[];
  for(let z=bounds.minZ;z<=bounds.maxZ;z++){
    const spans=[];
    for(let x=bounds.minX;x<=bounds.maxX;){
      if(!includes(x,z)){x++;continue;}
      const start=x++;
      while(x<=bounds.maxX&&includes(x,z))x++;
      spans.push(Object.freeze({start,end:x}));
    }
    rows.push(Object.freeze(spans));
  }
  return Object.freeze(rows);
}

export function regionLandform(region,seed) {
  const {offsetX,offsetZ,bounds,ports}=region;
  const phase=(seed%97)*.19+offsetX*.17+offsetZ*.11;
  return footprint(bounds,(x,z)=>{
    const east=x-offsetX, south=z-offsetZ;
    for(const port of ports){
      const sideways=horizontal(port.direction);
      const along=sideways?x:z, across=sideways?south:east;
      const depth=Math.abs(along-(sideways?port.at.x:port.at.z));
      // Port shoulders open into the body of the landform. They meet a
      // connector at an identical cross-section on the shared face.
      if(depth<=7&&Math.abs(across)<=PORT_HALF_WIDTH+depth*.55)return true;
    }
    // Keep the original approach and terminal road landings on land.
    if(Math.abs(east)<=6&&
        ((region.role==='arrival'&&south>=15)||(region.role==='extraction'&&south<=-15)))return true;
    // On a shared face only the matching connector cross-section can be
    // occupied. Blend the shoulders into the neighboring hills inland.
    if(x===bounds.minX||x===bounds.maxX||z===bounds.minZ||z===bounds.maxZ)return false;
    const angle=Math.atan2(south+.5,east+.5);
    const relief=1+.055*Math.sin(3*angle+phase)+.045*Math.cos(5*angle-phase);
    const u=(east+.5)/18.2,v=(south+.5)/18.2;
    // A broad woodland footprint leaves room for the existing flank and
    // escape routes while breaking up the rectangular cliff silhouette.
    return u**4+v**4<=relief**4;
  });
}

export function connectorLandform(link,seed) {
  const {bounds,fromPort}=link;
  const sideways=horizontal(fromPort.direction);
  const phase=(seed%97)*.19+bounds.minX*.17+bounds.minZ*.11;
  return footprint(bounds,(x,z)=>{
    const step=sideways?x-bounds.minX:z-bounds.minZ;
    const across=sideways?z-fromPort.at.z:x-fromPort.at.x;
    const taper=step===0||step===7?0:Math.sin(Math.PI*step/7);
    return Math.abs(across-taper*Math.sin(phase))<=PORT_HALF_WIDTH-2*taper;
  });
}

export function containsHuntLandform(band,x,z) {
  return band.landform[Math.floor(z)-band.bounds.minZ]?.some(span=>
    x>=span.start&&x<span.end)??false;
}

export function clipHuntLandform(band,{runs,surfaceTiles=[]}) {
  const clipped=[];
  for(const run of runs){
    for(const span of band.landform[run.z-band.bounds.minZ]){
      const x=Math.max(span.start,run.x);
      const end=Math.min(span.end,run.x+run.length);
      if(x<end)clipped.push({...run,x,length:end-x});
    }
  }
  return {runs:clipped,surfaceTiles:surfaceTiles.filter(tile=>
    containsHuntLandform(band,tile.x,tile.z))};
}
