// Exact box queries shared by actor sweeps and the vertical cluster solver.
import {MICRO_VOXEL_EDGE} from './microvoxel-surface.mjs';
const AXES=['x','y','z'];
const EPSILON=1e-7;
const shapes=new WeakMap();

function describeShape(levels){
  const cached=shapes.get(levels);
  if(cached)return cached;
  const edge=MICRO_VOXEL_EDGE;
  const strips=[];
  let top=0;
  for(let z=0;z<edge;z++){
    for(let x=0;x<edge;){
      const level=levels[z*edge+x];
      let end=x+1;
      while(end<edge&&levels[z*edge+end]===level)end++;
      strips.push({left:x/edge,right:end/edge,near:z/edge,far:(z+1)/edge,height:level/edge});
      top=Math.max(top,level/edge);
      x=end;
    }
  }
  const shape={strips,top};
  shapes.set(levels,shape);
  return shape;
}

export const clusterCellHeight=cell=>cell.levels?describeShape(cell.levels).top:1;

export const clusterCellBounds=(cell,offsetY)=>({
  x:[cell.x,cell.x+1],y:[cell.y+offsetY,cell.y+clusterCellHeight(cell)+offsetY],z:[cell.z,cell.z+1]
});

export function* clusterCellBoxes(cell,offsetY=0){
  if(!cell.levels){
    yield clusterCellBounds(cell,offsetY);
    return;
  }
  const bottom=cell.y+offsetY;
  for(const {left,right,near,far,height} of describeShape(cell.levels).strips){
    yield {x:[cell.x+left,cell.x+right],y:[bottom,bottom+height],z:[cell.z+near,cell.z+far]};
  }
}

const overlaps=(a,b)=>a[0]<b[1]-EPSILON&&b[0]<a[1]-EPSILON;

export function physicalBoxesOverlap(first,second){
  return AXES.every(axis=>overlaps(first[axis],second[axis]));
}

export function sweptBoxContact(moving,obstacle,axis,distance){
  if(distance===0||!AXES.every(name=>name===axis||overlaps(moving[name],obstacle[name])))return null;
  if(overlaps(moving[axis],obstacle[axis]))return 0;
  const sign=Math.sign(distance);
  const gap=sign>0?obstacle[axis][0]-moving[axis][1]:moving[axis][0]-obstacle[axis][1];
  if(gap<-EPSILON||gap>Math.abs(distance)+EPSILON)return null;
  return sign*Math.min(Math.abs(distance),Math.max(0,gap));
}
