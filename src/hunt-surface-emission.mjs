// Play Hunt composition: read-only channel map -> generic emissive cells.
// The host's Materials mapping decides which channels emit; Lighting does
// not know Water, lava, sprites, names or any packed visual channel format.
export const MAX_STATIC_EMISSIVE_CELLS=4096;
export function collectEmissiveSurfaceCells(surface,{heightOffset=0,energyByChannel={}}={}){
  if(!surface)return [];
  const [width,height]=surface.size??[];
  const [ox,oz]=surface.origin??[];
  if(![width,height,ox,oz,heightOffset].every(Number.isSafeInteger)||
      width<1||height<1||width*height>65536||
      !(surface.data instanceof Uint8Array)||surface.data.length!==width*height*4){
    throw new TypeError('Expected bounded published surface channel map');
  }
  const result=[];
  for(let i=0;i<width*height;i++){
    const tag=surface.data[i*4+3],energy=energyByChannel[tag]??0;
    if(!Number.isFinite(energy)||energy<=0)continue;
    if(result.length>=MAX_STATIC_EMISSIVE_CELLS)throw new RangeError('Too many emissive cells');
    result.push(Object.freeze({
      x:ox+i%width,z:oz+Math.floor(i/width),
      surfaceY:surface.data[i*4]-heightOffset,energy:Math.min(1,energy)
    }));
  }
  return result;
}
