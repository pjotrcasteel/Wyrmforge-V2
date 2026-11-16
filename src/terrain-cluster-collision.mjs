// Exact box queries shared by actor sweeps and the vertical cluster solver.
const AXES=['x','y','z'];
const EPSILON=1e-7;

export const clusterCellBounds=(cell,offsetY)=>({
  x:[cell.x,cell.x+1],y:[cell.y+offsetY,cell.y+1+offsetY],z:[cell.z,cell.z+1]
});

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
