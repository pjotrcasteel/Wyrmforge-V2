// Geological strata composer: rock faces are a continuous bedrock mass.
// Site Strategies declare soil thickness and steep-slope treatment; the
// world generator never inspects the name of a biome to decide material IDs.
export function classifySurfaceStrata({
  radius,heights,surfaces,terrain
}) {
  if(!Number.isSafeInteger(radius) || radius<2 || radius>24 ||
      !(heights instanceof Int16Array) ||
      !(surfaces instanceof Uint8Array) ||
      heights.length!==(radius*2)**2 ||
      surfaces.length!==heights.length ||
      !terrain || !Number.isSafeInteger(terrain.soilDepth) ||
      terrain.soilDepth<1 || terrain.soilDepth>3) {
    throw new TypeError('Invalid bounded geological terrain');
  }
  const threshold=terrain.rockFaceThreshold;
  let stoneOutcrops=0,convertedCliffCaps=0,grassCaps=0;
  if(threshold!==null) {
    if(!Number.isSafeInteger(threshold) || threshold<2 || threshold>6) {
      throw new RangeError('Rock face slope threshold must be bounded');
    }
    for(let z=-radius;z<radius;z++)for(let x=-radius;x<radius;x++) {
      const index=(z+radius)*radius*2+x+radius;
      // Count actual exposed stone faces, whether noise already made them
      // stone or cliff classification did. Dirt trails (material 2) are not
      // silently reclassified as rock.
      if(surfaces[index]!==1 && surfaces[index]!==3) continue;
      const elevation=heights[index];
      let exposed=false;
      for(const [dx,dz] of [[0,1],[0,-1],[1,0],[-1,0]]) {
        const nx=x+dx,nz=z+dz;
        if(nx<-radius || nx>=radius || nz<-radius || nz>=radius)continue;
        const adjacent=heights[(nz+radius)*radius*2+nx+radius];
        if(Math.abs(elevation-adjacent)>=threshold) {
          exposed=true;
          break;
        }
      }
      if(exposed) {
        if(surfaces[index]===1) {
          surfaces[index]=3;
          convertedCliffCaps++;
        }
        stoneOutcrops++;
      }
    }
  }
  for(const surface of surfaces) if(surface===1)grassCaps++;
  return Object.freeze({
    soilDepth:terrain.soilDepth,
    rockFaceThreshold:threshold,
    stoneOutcrops,convertedCliffCaps,grassCaps,
    continuousBedrockBelowStone:true
  });
}
