// Lighting owns one fixed sun direction and pure caster projection.
// No imports from Voxel, World Objects, Water or Rendering.
export const HUNT_SUN_CAST=Object.freeze({x:-.56,z:.58});
export const CANOPY_COLS=7;
export const CANOPY_ROWS=8;
export function projectCanopyReceivers(tree,mask,sun=HUNT_SUN_CAST){
  if(!tree?.sprite||!Array.isArray(mask)||!Number.isFinite(tree.scale))return [];
  const {sprite,scale}=tree,result=[];
  for(const cell of mask){
    if(!Number.isInteger(cell.col)||!Number.isInteger(cell.row)||
      cell.col<0||cell.col>=CANOPY_COLS||cell.row<0||cell.row>=CANOPY_ROWS||
      !Number.isFinite(cell.coverage)||cell.coverage<=0)continue;
    const px=(cell.col+.5)*sprite.w/CANOPY_COLS;
    const py=(cell.row+.5)*sprite.h/CANOPY_ROWS;
    const height=Math.max(0,(sprite.ay-py)*scale/32);
    if(height<1.55)continue; // L10-05 owns the root footprint.
    result.push({x:tree.x+(px-sprite.ax)*scale/32+height*sun.x,
      z:tree.z+height*sun.z,height,
      width:Math.max(.18,sprite.w*scale/32/CANOPY_COLS*.88),
      depth:Math.max(.18,sprite.h*scale/32/CANOPY_ROWS*Math.abs(sun.z)*1.14),
      alpha:Math.min(.42,(.17+.24*Math.min(1,cell.coverage))*(height<2.1?.55:1))});
  }
  return result.slice(0,CANOPY_COLS*CANOPY_ROWS);
}
