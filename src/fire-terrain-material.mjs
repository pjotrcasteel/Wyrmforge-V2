// Materials owns volcanic surface appearance. WorldGen/Physics retain the
// existing terrain columns, material IDs, routes and destructible strata.
import {fireRockMotifGlsl} from './fire-rock-art.mjs';

export const FIRE_BASALT_PALETTE=Object.freeze([
  Object.freeze([.16,.14,.155]),
  Object.freeze([.21,.19,.20]),
  Object.freeze([.26,.235,.25]),
  Object.freeze([.32,.285,.28])
]);

export const FIRE_TERRAIN_MATERIAL_GLSL=`
${fireRockMotifGlsl()}
const vec3 FIRE_BASALT_COLORS[4]=vec3[4](${FIRE_BASALT_PALETTE.map(color=>'vec3('+color.join(',')+')').join(',')});

vec3 fireTerrainSurface(vec3 surface,int material) {
  float heat=uHuntCorruption.z;
  if(heat<=0.0)return surface;
  bool top=vNormal.y>.5;
  vec2 uv=abs(vNormal.y)>.5?vWorld.xz:abs(vNormal.x)>.5?vWorld.zy:vWorld.xy;
  if(!top)uv*=vec2(.65,.38);
  vec2 pixel=floor(uv*8.0);
  vec2 point=(pixel+.5)/8.0;
  vec2 tile=floor(pixel/32.0);
  ivec2 at=ivec2(mod(pixel,32.0));
  float orientation=soilHash(tile+22.0);
  if(orientation>.5)at=at.yx;
  if(soilHash(tile+57.0)>.5)at.x=31-at.x;
  int band=int((FIRE_ROCK_MOTIF[at.y][at.x/8]>>uint(3*(at.x%8)))&7u);
  float pockets=labNoise(point*.23+vec2(7,41));
  float fragments=soilHash(floor(pixel/vec2(3,2))+71.0);
  float volcanic=clamp(heat+(pockets-.5)*heat*(1.0-heat),0.0,1.0);
  vec3 color;
  if(material>=3){
    // Quiet mineral fields carry the floor. Short fractures stay subordinate
    // to the actual cliff silhouette and the larger terrain forms.
    float mineral=floor(clamp(pockets,0.0,.999)*5.0)/4.0;
    color=mix(FIRE_BASALT_COLORS[1],FIRE_BASALT_COLORS[3],.3+.45*mineral);
    color*=.94+.10*fragments;
    if(pockets>.54&&band==0)color=mix(color,FIRE_BASALT_COLORS[0],.55);
    if(pockets>.54&&band==3)color*=1.035;
    if(!top){
      float layers=labNoise(vec2(point.x*.22,point.y*.85)+51.0);
      color*=.86+.14*floor(layers*4.0)/3.0;
    }
    if(pockets>.68&&fragments>.86)color=mix(color,vec3(.30,.22,.18),.22);
  }else if(material==2||!top){
    float ash=floor(clamp(pockets+.18*(fragments-.5),0.0,.999)*4.0)/3.0;
    color=mix(vec3(.20,.17,.17),vec3(.38,.34,.31),ash);
    if(fragments<.18)color*=.72;
    if(band==0&&fragments>.55)color*=.78;
  }else{
    // Charred turf and ash retain the physical grass/dirt/stone sequence.
    float ash=smoothstep(.28,.72,pockets+.20*(fragments-.5));
    color=mix(vec3(.14,.13,.15),vec3(.36,.33,.31),ash);
    if(fragments>.74)color*=1.13;
    else if(fragments<.22)color*=.78;
  }
  return mix(surface,srgbToLinearColor(color),volcanic);
}
`;
