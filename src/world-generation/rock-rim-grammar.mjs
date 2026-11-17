// WorldGen owns natural contour intent. The result is physical 10cm occupancy,
// consumed unchanged by Voxel collision, persistence and the cuboid mesher.
function hash(seed,x,z) {
  let v=(seed^Math.imul(x,0x9e3779b1)^Math.imul(z,0x85ebca6b))>>>0;
  v^=v>>>16;v=Math.imul(v,0x7feb352d);v^=v>>>15;
  v=Math.imul(v,0x846ca68b);
  return ((v^(v>>>16))>>>0)/0x100000000;
}
function field(seed,x,z,pitch) {
  const px=x/pitch,pz=z/pitch,ix=Math.floor(px),iz=Math.floor(pz);
  const smooth=t=>t*t*(3-2*t),tx=smooth(px-ix),tz=smooth(pz-iz);
  const a=hash(seed,ix,iz)*(1-tx)+hash(seed,ix+1,iz)*tx;
  const b=hash(seed,ix,iz+1)*(1-tx)+hash(seed,ix+1,iz+1)*tx;
  return a*(1-tz)+b*tz;
}

export function rockRimCut(seed,x,z,ix,iz,lowerEdges) {
  const px=x+(ix+0.5)/10,pz=z+(iz+0.5)/10;
  // Metre-scale fields create broad worn shoulders and narrower broken lips.
  // Unlike per-tile noise, a formation keeps its character across seams.
  const width=2.5+field(seed^0x6c8e9cf5,px,pz,3.5)*3;
  const depth=4+Math.floor(field(seed^0x2f539acd,px,pz,4.5)*5);
  const chip=field(seed^0x47d1a93b,px,pz,0.6);
  let strongest=0,second=0;
  for(const [dx,dz] of lowerEdges) {
    const ax=dx===1?9-ix:dx===-1?ix:0;
    const az=dz===1?9-iz:dz===-1?iz:0;
    const distance=dx&&dz?Math.hypot(ax,az):ax+az;
    const cut=Math.max(0,(1-distance/width)*depth);
    if(cut>strongest){second=strongest;strongest=cut;}
    else second=Math.max(second,cut);
  }
  // Adjacent exposed edges meet in a deeper rounded corner. Subtle chips
  // modulate a continuous rim instead of scattering miniature rock piles.
  return Math.min(8,Math.max(0,Math.round(strongest+second*0.25-(chip>0.6?1:0))));
}
