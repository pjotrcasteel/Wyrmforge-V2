// Shared surface and emission palette for molten currents and cooling crust.
// Emission describes the material itself; Lighting consumes light sources.
import {lavaCrustMotifGlsl} from './fire-lava-crust-art.mjs';
import {FIRE_LAVA_TEXELS_PER_VOXEL,FIRE_LAVA_FRAMES_PER_SECOND} from './fire-lava-art.mjs';

export const FIRE_LAVA_PALETTE=Object.freeze([
  Object.freeze({key:'cooled-crust',srgb:Object.freeze([.23,.18,.20]),emission:0}),
  Object.freeze({key:'iron-red-edge',srgb:Object.freeze([.39,.10,.07]),emission:.08}),
  Object.freeze({key:'molten-red',srgb:Object.freeze([.87,.20,.035]),emission:.65}),
  Object.freeze({key:'hot-current',srgb:Object.freeze([1,.47,.065]),emission:1}),
  Object.freeze({key:'exposed-core',srgb:Object.freeze([1,.81,.35]),emission:1.15})
]);

export const FIRE_LAVA_MATERIAL_GLSL=`
${lavaCrustMotifGlsl()}
const vec3 FIRE_LAVA_COLORS[5]=vec3[5](${FIRE_LAVA_PALETTE.map(band=>'vec3('+band.srgb.join(',')+')').join(',')});
const float FIRE_LAVA_EMISSION[5]=float[5](${FIRE_LAVA_PALETTE.map(band=>band.emission.toFixed(2)).join(',')});

struct FireLavaMaterial {
  vec3 albedo;
  vec3 emission;
};

FireLavaMaterial fireLavaMaterial(int band) {
  band=clamp(band,0,4);
  vec3 albedo=srgbToLinearColor(FIRE_LAVA_COLORS[band]);
  return FireLavaMaterial(albedo,albedo*FIRE_LAVA_EMISSION[band]);
}

vec3 fireLavaColor(int band) {
  FireLavaMaterial material=fireLavaMaterial(band);
  return material.albedo*.38+material.emission;
}

int fireLavaCrustBand(ivec2 pixel) {
  ivec2 tile=ivec2(floor(vec2(pixel)/vec2(32,24)));
  int x=int(mod(float(pixel.x),32.0));
  int y=int(mod(float(pixel.y),24.0));
  if((tile.x&1)!=0)x=31-x;
  if((tile.y&1)!=0)y=23-y;
  return int((FIRE_LAVA_CRUST[y][x/8]>>uint(3*(x%8)))&7u);
}

vec3 fireLavaSurface(vec2 world,vec2 direction,float margin,bool falling,float drop,float seconds) {
  const float density=${FIRE_LAVA_TEXELS_PER_VOXEL}.0;
  vec2 across=vec2(-direction.y,direction.x);
  float currentFrame=floor(seconds*${FIRE_LAVA_FRAMES_PER_SECOND}.0);
  vec2 current=world-direction*currentFrame*.0625;
  vec2 skin=world-direction*floor(seconds*2.0)*.0625;
  if(falling){
    current=vec2(dot(world,across),drop-currentFrame*.1875);
    skin=vec2(dot(world,across),drop*.5-currentFrame*.0625);
  }
  ivec2 pixel=ivec2(floor(current*density));
  vec2 art=(vec2(pixel)+.5)/density;
  int column=int(mod(float(pixel.x),24.0));
  int row=int(mod(float(pixel.y),12.0));
  int motif=int((LAB_LAVA_MOTIF[row][column/8]>>uint(3*(column%8)))&7u);
  // Quantized red and amber folds give the moving melt an internal texture.
  float folds=labNoise(art*vec2(.8,.43)+42.0);
  folds+=.20*(labNoise(art*2.2+9.0)-.5);
  float heat=min(4.0,floor(clamp(folds,0.0,1.0)*5.0))/4.0;
  vec3 molten=mix(fireLavaColor(1),fireLavaColor(2),.32+.68*heat);
  if(motif>=2&&folds>.38)molten=mix(molten,fireLavaColor(3),.50);
  if(motif==3&&folds>.53)molten=fireLavaColor(3);
  if(motif==4&&folds>.55)molten=fireLavaColor(4);

  vec2 erosion=vec2(labNoise(skin*.6+3.0),labNoise(skin*.6+23.0))-.5;
  vec2 plateUv=skin*density*.5+erosion*.8;
  ivec2 platePixel=ivec2(floor(plateUv));
  int crust=fireLavaCrustBand(platePixel);
  vec3 color=molten;
  if(!falling&&crust==0){
    float facet=floor(labNoise(floor(skin*density)*.22+91.0)*5.0)/4.0;
    vec3 stone=mix(FIRE_LAVA_COLORS[0],vec3(.34,.27,.25),facet);
    color=srgbToLinearColor(stone)*.68;
    // A one-art-pixel heated lip separates each plate from the current.
    vec2 local=fract(plateUv);
    float edge=1.0;
    if(fireLavaCrustBand(platePixel+ivec2(-1,0))!=0)edge=min(edge,local.x);
    if(fireLavaCrustBand(platePixel+ivec2(1,0))!=0)edge=min(edge,1.0-local.x);
    if(fireLavaCrustBand(platePixel+ivec2(0,-1))!=0)edge=min(edge,local.y);
    if(fireLavaCrustBand(platePixel+ivec2(0,1))!=0)edge=min(edge,1.0-local.y);
    if(edge<.27)color=mix(color,fireLavaColor(1),.78);
  }
  if(!falling&&crust==1)color=mix(fireLavaColor(1),fireLavaColor(2),.22+.25*heat);
  if(!falling&&crust==3){
    color=fireLavaColor(2);
    if(mod(float(pixel.x+pixel.y),3.0)<1.0)color=fireLavaColor(3);
  }
  if(falling&&crust==0)color=mix(fireLavaColor(1),fireLavaColor(2),.25);

  float crustEdge=soilHash(floor(world*density)+19.0);
  float cooledWidth=.16+.24*crustEdge;
  if(margin<.07)return vec3(0.0);
  if(margin<cooledWidth){
    float facet=labNoise(floor(world*density)*.3+77.0);
    color=srgbToLinearColor(mix(FIRE_LAVA_COLORS[0],vec3(.31,.25,.24),facet))*.62;
  }else if(margin<cooledWidth+.15){
    color=mix(fireLavaColor(1),fireLavaColor(2),.25);
  }else if(margin<cooledWidth+.27){
    color=mix(color,fireLavaColor(2),.55);
  }
  return color;
}
`;
