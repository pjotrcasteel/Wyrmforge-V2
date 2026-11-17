// Materials owns volcanic surface appearance. WorldGen/Physics retain the
// existing terrain columns, material IDs, routes and destructible strata.
import {fireRockMotifGlsl} from './fire-rock-art.mjs';

export const FIRE_BASALT_PALETTE=Object.freeze([
  Object.freeze([.070,.058,.067]),
  Object.freeze([.15,.13,.14]),
  Object.freeze([.24,.22,.23]),
  Object.freeze([.32,.28,.27])
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
  ivec2 at=ivec2(mod(pixel,32.0));
  int band=int((FIRE_ROCK_MOTIF[at.y][at.x/8]>>uint(3*(at.x%8)))&7u);
  float pockets=labNoise(point*.23+vec2(7,41));
  float fragments=soilHash(floor(pixel/vec2(3,2))+71.0);
  float volcanic=clamp(heat+(pockets-.5)*heat*(1.0-heat),0.0,1.0);
  vec3 color;
  if(material>=3){
    color=FIRE_BASALT_COLORS[band];
    color*=.86+.25*floor(pockets*4.0)/3.0;
    if(!top){
      float strata=mod(floor(vWorld.y*8.0)+floor(labNoise(point*.32)*5.0),13.0);
      if(strata<1.0)color*=.72;
      else if(strata<2.0)color*=1.08;
    }
    // Warm oxidation occupies sparse fractures; this stone remains non-emissive.
    if(band==0&&pockets>.69)color=mix(color,vec3(.24,.11,.075),.50);
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
