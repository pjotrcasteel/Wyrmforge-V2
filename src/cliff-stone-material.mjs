// Materials owns the jointed stone appearance. Real ribs and shelves are
// authored separately by WorldGen. Albedo never displaces terrain geometry.
export const CLIFF_STONE_MATERIAL_GLSL=`
vec3 cliffStoneSurface(vec3 surface,vec2 uv) {
  vec2 point=(floor(uv*8.0)+.5)/8.0;
  // Irregular vertical joints follow tall rock panels rather than square tiles.
  float bend=(labNoise(vec2(point.x*.09,point.y*.16)+91.0)-.5)*.44;
  float axis=point.x/2.6+bend;
  float cell=floor(axis);
  float nearest=100.0;
  float second=100.0;
  float panel=0.0;
  for(int k=-1;k<=1;k++){
    float id=cell+float(k);
    float center=id+.2+.6*soilHash(vec2(id,73.0));
    float distance=abs(axis-center);
    if(distance<nearest){second=nearest;nearest=distance;panel=id;}
    else second=min(second,distance);
  }
  float gap=second-nearest;
  float mineral=soilHash(vec2(panel,17.0));
  float tone=.91+.16*mineral;
  // Long fractures fade in and out vertically. Broad faces stay quiet.
  float exposed=labNoise(vec2(panel*.71,point.y*.19)+28.0);
  if(gap<.045&&exposed>.32)tone*=.68;
  else if(gap<.09&&exposed>.42)tone*=1.055;
  // Staggered cross joints are occasional ledge planes, not a closed grid.
  float height=2.1+2.4*soilHash(vec2(panel,39.0));
  float phase=point.y/height+soilHash(vec2(panel,52.0));
  float shelf=floor(phase);
  float line=fract(phase);
  float broken=soilHash(vec2(panel,shelf+103.0));
  if(broken>.58&&line<.045)tone*=.76;
  else if(broken>.58&&line<.08)tone*=1.04;
  float grain=soilHash(floor(point*8.0)+64.0);
  tone*=.98+.04*grain;
  return surface*tone;
}
`;
