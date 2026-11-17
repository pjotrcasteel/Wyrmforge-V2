// Pack the exposed parent voxel of each nearby column for Hunt edge shading.
// The second slice carries the plant influence from published, live trunks.
export const HUNT_GRASS_VOLUME_RADIUS=20;
export const HUNT_GRASS_VOLUME_STRIDE=8;

export function huntGrassMaterialVolume(world,centerX,centerZ,minY,maxY,treeRegions=[]) {
  const edge=HUNT_GRASS_VOLUME_RADIUS*2;
  const startX=centerX-HUNT_GRASS_VOLUME_RADIUS;
  const startZ=centerZ-HUNT_GRASS_VOLUME_RADIUS;
  const data=new Uint8Array(edge*edge*2);
  for(let z=0;z<edge;z++)for(let x=0;x<edge;x++){
    for(let y=maxY;y>=minY;y--){
      const material=world.get(startX+x,y,startZ+z);
      if(!material)continue;
      if(material<=3&&y>=-4&&y<60)data[z*edge*2+x]=(y+4)*4+material;
      break;
    }
  }
  for(const region of treeRegions)for(const tree of region){
    if(!tree.sprite)continue;
    const radius=2.2*tree.scale;
    const minX=Math.max(0,Math.floor(tree.x-radius-startX));
    const maxX=Math.min(edge-1,Math.floor(tree.x+radius-startX));
    const minZ=Math.max(0,Math.floor(tree.z-radius-startZ));
    const maxZ=Math.min(edge-1,Math.floor(tree.z+radius-startZ));
    for(let z=minZ;z<=maxZ;z++)for(let x=minX;x<=maxX;x++){
      const column=z*edge*2+x;
      const surface=data[column];
      if(surface%4!==1||Math.abs((surface>>2)-3-tree.y)>1)continue;
      const distance=Math.hypot(startX+x+.5-tree.x,startZ+z+.5-tree.z);
      const weight=Math.min(1,Math.max(0,(1-distance/radius)*1.35));
      data[column+edge]=Math.max(data[column+edge],Math.round(weight*255));
    }
  }
  return {origin:[startX,0,startZ],size:[edge,2,edge],data};
}
