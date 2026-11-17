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
  // A warped, mixed-scale exposure field leaves quiet intact stretches.
  // Weathering strength changes over metres rather than restarting per tile.
  const warp=(field(seed^0x7a3b91c5,px,pz,8)-0.5)*3;
  const exposure=field(seed^0x18c9e735,px+warp,pz,5.5)*0.72+
    field(seed^0x57ad03b1,px,pz-warp,2.3)*0.28;
  const t=Math.max(0,Math.min(1,(exposure-0.30)/0.65));
  const wear=t*t*(3-2*t);
  if(wear===0)return 0;
  const width=1.5+wear*3+field(seed^0x6c8e9cf5,px,pz,3.5)*1.5;
  // Deep breaks are sparse. Most exposed faces receive only a light wear.
  const depth=8*wear**1.6;
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
