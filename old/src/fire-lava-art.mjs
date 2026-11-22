// An original palette-indexed pixel motif. Each digit is one whole texel.
// The renderer moves it in integer steps, with small offsets between lanes.
export const FIRE_LAVA_MOTIF=Object.freeze([
  '110001111000111001110011',
  '222211110011222111001112',
  '333222211122333222111223',
  '223333222233332222223322',
  '111223333344222111223311',
  '001112222223311110011100',
  '110001111122111001110011',
  '221111122222211111122222',
  '333222223332222223333233',
  '223333333222211233443322',
  '111222244222111122333211',
  '001111222111000111222100'
]);

export const FIRE_LAVA_TEXELS_PER_VOXEL=8;
export const FIRE_LAVA_FRAMES_PER_SECOND=8;

export function fireLavaMotifGlsl(){
  const rows=FIRE_LAVA_MOTIF.map(row=>{
    const pack=part=>[...part].reduce((bits,value,index)=>bits|(Number(value)<<(index*3)),0)>>>0;
    // Eight texels fit in one 24-bit integer without crossing a uint boundary.
    return 'uvec3('+[0,8,16].map(offset=>pack(row.slice(offset,offset+8))+'u').join(',')+')';
  });
  return `const highp uvec3 LAB_LAVA_MOTIF[${rows.length}]=uvec3[${rows.length}](${rows.join(',')});`;
}
