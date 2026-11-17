// Materials owns original pixel-art rock faces. The existing terrain owns
// silhouette and physical shelves. This material does not displace geometry.
export const CLIFF_STONE_MATERIAL_GLSL=`
vec3 cliffStoneSurface(vec3 surface,vec2 uv) {
  vec2 pixel=floor(uv*10.0);
  vec2 point=(pixel+.5)/10.0;
  // Long irregular slabs, with diagonal bedding and broken projecting edges.
  // World anchoring keeps the art continuous over parent voxels and chunks.
  float bend=(labNoise(point*vec2(.21,.17)+91.0)-.5)*.58;
  float axis=point.x/1.85+bend+point.y*.075;
  float cell=floor(axis);
  float nearest=100.0,second=100.0,panel=0.0,signedDistance=0.0;
  for(int k=-1;k<=1;k++){
    float id=cell+float(k);
    float center=id+.17+.66*soilHash(vec2(id,73.0));
    float delta=axis-center;
    float distance=abs(delta);
    if(distance<nearest){second=nearest;nearest=distance;panel=id;signedDistance=delta;}
    else second=min(second,distance);
  }
  float gap=second-nearest;
  float height=2.7+2.5*soilHash(vec2(panel,39.0));
  float bed=point.y/height+soilHash(vec2(panel,52.0));
  bed+=signedDistance*(.14+.12*soilHash(vec2(panel,7.0)));
  bed+=(labNoise(point*.6+panel)-.5)*.07;
  float slab=floor(bed),line=fract(bed);
  float mineral=soilHash(vec2(panel,slab+17.0));
  float heat=uHuntCorruption.z;
  vec3 shadow=mix(vec3(.19,.22,.23),vec3(.18,.16,.185),heat);
  vec3 mid=mix(vec3(.40,.435,.43),vec3(.36,.325,.35),heat);
  vec3 light=mix(vec3(.58,.59,.54),vec3(.51,.46,.45),heat);
  float planes=labNoise(vec2(point.x*.8+panel,point.y*.5)+slab*11.0);
  float facet=floor(clamp(planes*.75+mineral*.25,0.0,.999)*5.0)/4.0;
  vec3 rock=mix(mid,light,.12+facet*.55);
  // Wide shadow facets, small chipped highlights and narrow deep splits.
  // These shapes describe exposed rock volume at the Hunt pixel scale.
  if(signedDistance>.18)rock=mix(rock,shadow,.30);
  if(signedDistance<-.14&&planes>.40)rock=mix(rock,light,.28);
  float crack=labNoise(vec2(panel*.63,point.y*.24)+28.0);
  if(gap<.055&&crack>.25)rock=shadow*.72;
  else if(gap<.14&&crack>.32)rock=mix(rock,shadow,.48);
  else if(gap<.20&&signedDistance<0.0&&crack>.32)rock=mix(rock,light,.50);
  // Broken bedding planes expose broad dark lower facets and chipped lips.
  float broken=soilHash(vec2(panel,slab+103.0));
  if(broken>.24){
    if(line<.035)rock=shadow*.74;
    else if(line<.12)rock=mix(rock,shadow,.62);
    else if(line>.94)rock=mix(rock,light,.65);
  }
  float grain=soilHash(pixel+64.0);
  rock*=.94+.12*grain;
  if(grain>.89&&planes>.48)rock=mix(rock,light,.18);
  return srgbToLinearColor(rock);
}
`;
