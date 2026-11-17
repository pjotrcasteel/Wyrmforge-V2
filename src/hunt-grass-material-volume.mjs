// Pack the exposed parent voxel of each nearby column for Hunt edge shading.
// A single x/z slice is enough, and the shader checks its actual face height.
export const HUNT_GRASS_VOLUME_RADIUS=20;
export const HUNT_GRASS_VOLUME_STRIDE=8;

export function huntGrassMaterialVolume(world,centerX,centerZ,minY,maxY) {
  const edge=HUNT_GRASS_VOLUME_RADIUS*2;
  const startX=centerX-HUNT_GRASS_VOLUME_RADIUS;
  const startZ=centerZ-HUNT_GRASS_VOLUME_RADIUS;
  const data=new Uint8Array(edge*edge);
  for(let z=0;z<edge;z++)for(let x=0;x<edge;x++){
    for(let y=maxY;y>=minY;y--){
      const material=world.get(startX+x,y,startZ+z);
      if(!material)continue;
      if(material<=3&&y>=-4&&y<60)data[z*edge+x]=(y+4)*4+material;
      break;
    }
  }
  return {origin:[startX,0,startZ],size:[edge,1,edge],data};
}
