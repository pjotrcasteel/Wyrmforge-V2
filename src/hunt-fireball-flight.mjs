// Shared world-space presentation trajectory; no terrain or rendering authority.
export function huntFireballPosition(cast,now){
  const t=Math.min(1,Math.max(0,(now-cast.startedAt)/cast.duration));
  const point=['x','y','z'].map(axis=>cast.from[axis]+(cast.point[axis]-cast.from[axis])*t);
  point[1]+=Math.sin(t*Math.PI)*.75;
  return point;
}
