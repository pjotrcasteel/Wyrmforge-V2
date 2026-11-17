// Shared surface and emission palette for molten currents and cooling crust.
// Emission describes the material itself; Lighting consumes light sources.
import {lavaCrustMotifGlsl} from './fire-lava-crust-art.mjs';
import {FIRE_LAVA_TEXELS_PER_VOXEL,FIRE_LAVA_FRAMES_PER_SECOND} from './fire-lava-art.mjs';

export const FIRE_LAVA_PALETTE=Object.freeze([
  Object.freeze({key:'cooled-crust',srgb:Object.freeze([.16,.13,.17]),emission:0}),
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

vec3 fireLavaSurface(vec2 world,vec2 direction,float margin,bool falling,float drop,float seconds) {
  const float density=${FIRE_LAVA_TEXELS_PER_VOXEL}.0;
  vec2 across=vec2(-direction.y,direction.x);
  float currentFrame=floor(seconds*${FIRE_LAVA_FRAMES_PER_SECOND}.0);
  vec2 current=world-direction*currentFrame*.0625;
  vec2 skin=world-direction*floor(seconds*2.0)*.0625;
  if(falling){
    // Stretch the melt into weighted vertical ribbons down the stone wall.
    current=vec2(dot(world,across),drop-currentFrame*.1875);
    skin=vec2(dot(world,across),drop*.5-currentFrame*.0625);
  }
  ivec2 pixel=ivec2(floor(current*density));
  int column=int(mod(float(pixel.x),24.0));
  int row=int(mod(float(pixel.y),12.0));
  int motif=int((LAB_LAVA_MOTIF[row][column/8]>>uint(3*(column%8)))&7u);
  float currentBend=labNoise(floor(current*4.0)*.16+42.0);
  int band=2;
  if(motif>=3&&currentBend>.43)band=3;
  if(motif==4&&currentBend>.58)band=4;

  ivec2 platePixel=ivec2(floor(skin*density*.5));
  int plateX=int(mod(float(platePixel.x),32.0));
  int plateY=int(mod(float(platePixel.y),24.0));
  int crust=int((FIRE_LAVA_CRUST[plateY][plateX/8]>>uint(3*(plateX%8)))&7u);
  if(!falling&&crust!=2)band=crust;
  if(falling&&crust==0)band=min(band,1);

  float crustEdge=soilHash(floor(world*density)+19.0);
  float cooledWidth=.16+.24*crustEdge;
  if(margin<.07)return vec3(0.0);
  if(margin<cooledWidth)band=0;
  else if(margin<cooledWidth+.15)band=min(band,1);
  else if(margin<cooledWidth+.27)band=min(band,2);
  vec3 color=fireLavaColor(band);
  if(band==2)color*=.78+.22*floor(currentBend*4.0)/3.0;
  if(band==0){
    float ridges=soilHash(floor(skin*density*.5)+91.0);
    color*=.8+floor(ridges*3.0)*.17;
  }
  return color;
}
`;
