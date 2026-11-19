import {writeTransientLights} from './lighting/transient-lighting.mjs';
import {writePointVisibility,POINT_VISIBILITY_FLOATS} from './lighting/point-light-visibility.mjs';
import {LIGHTING_ENVIRONMENT_SCHEMA} from './lighting/environment-contract.mjs';
import {SURFACE_GLSL} from './materials/surface-contract.mjs';
import {LIGHTING_CONTEXT_GLSL,BASELINE_LIGHTING_GLSL,validateLightingShader} from './lighting/baseline-lighting.mjs';
import {FIRE_TERRAIN_MATERIAL_GLSL} from './fire-terrain-material.mjs';
import {HUNT_LAVA_SURFACE_GLSL} from './hunt-lava-surface.mjs';
import {FIRE_MATERIAL_LAB_UNIFORMS_GLSL,FIRE_MATERIAL_LAB_GLSL} from './fire-material-lab-shader.mjs';
// Ground-up V2 WebGL2 baseline. Two fixed V2-native 2.5D camera presets.
import { getCameraPreset } from './camera-presets.mjs';
import { terrainMaterialGlsl } from './terrain-materials.mjs';
import { terrainColorTransferGlsl } from './terrain-color-space.mjs';
import { compileTerrainTextureManifest } from './terrain-texture-manifest.mjs';
import { TERRAIN_SURFACE_LIBRARY } from './terrain-surface-library.mjs';
import { TerrainGpuTextureCache } from './terrain-gpu-texture-cache.mjs';
export { projectVoxel } from './camera-presets.mjs';

const VERTEX_SHADER = `#version 300 es
precision highp float;
layout(location = 0) in vec3 aPosition;
layout(location = 1) in vec3 aNormal;
layout(location = 2) in float aMaterial;
uniform vec3 uOrigin;
uniform vec2 uViewport;
uniform vec2 uPan;
uniform float uScale;
uniform vec3 uCameraRight;
uniform vec3 uCameraDown;
uniform vec3 uCameraDepth;
uniform float uDepthOrigin;
out vec3 vNormal;
out vec3 vWorld;
flat out float vMaterial;

void main() {
  vec3 world = aPosition + uOrigin;
  vec2 pixel = vec2(dot(world, uCameraRight),
                    dot(world, uCameraDown)) * uScale
               + uViewport * 0.5 + uPan;
  float depth = dot(world, uCameraDepth) - uDepthOrigin;
  gl_Position = vec4(2.0 * pixel.x / uViewport.x - 1.0,
                     1.0 - 2.0 * pixel.y / uViewport.y,
                     depth, 1.0);
  vNormal = aNormal;
  vWorld = world;
  vMaterial = aMaterial;
}
`;

export function assembleVoxelFragmentShader(lightingShader=BASELINE_LIGHTING_GLSL){
  validateLightingShader(lightingShader);
  return `#version 300 es
precision highp float;
in vec3 vNormal;
in vec3 vWorld;
flat in float vMaterial;
uniform sampler2D uGrassTexture;
uniform highp sampler2DArray uTerrainAlbedo;
uniform highp sampler2DArray uTerrainNormal;
uniform highp sampler2DArray uTerrainOrm;
uniform vec4 uTerrainNormalLayers;
uniform vec4 uTerrainOrmLayers;
uniform vec4 uTerrainLayers;
uniform vec4 uTerrainSecondaryLayers;
uniform vec4 uTerrainSecondaryNormalLayers;
uniform vec4 uTerrainSecondaryOrmLayers;
uniform float uTerrainTilesPerVoxel;
uniform bool uGrassEnabled;
uniform bool uFastHuntMode;
uniform bool uHuntHeightContrast;
uniform bool uHuntGrassArt;
uniform float uHuntFadingStartZ;
uniform vec3 uHuntCorruption; // route progress, ash, volcanic
uniform bool uHuntGrassEdges;
uniform bool uHuntLavaEnabled;
uniform highp sampler2D uHuntLava;
uniform vec2 uHuntLavaOrigin;
uniform float uHuntElevationReference;
uniform float uGrassTexelsPerVoxel;
${FIRE_MATERIAL_LAB_UNIFORMS_GLSL}
out vec4 outColor;

${terrainMaterialGlsl()}
${terrainColorTransferGlsl()}
${SURFACE_GLSL}
${LIGHTING_CONTEXT_GLSL}
${lightingShader}

// Low-frequency, world-anchored soil detail. This is a first procedural dirt
// material, not a final authored texture. No additional texture uploads.
float soilHash(vec2 p) {
  return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453);
}

vec3 soilAlbedo(vec3 world, vec3 normal) {
  // Use horizontal world coordinates on tops and world-height on walls.
  vec2 uv = abs(normal.y) > 0.5 ? world.xz
    : abs(normal.x) > 0.5 ? world.zy : world.xy;
  vec2 coarseCell = floor(uv * 5.0);
  vec2 fineCell = floor(uv * 17.0);
  float coarse = soilHash(coarseCell) - 0.5;
  float fine = soilHash(fineCell) - 0.5;
  vec3 base = terrainAlbedo(2.0);
  return clamp(base * (1.0 + coarse * 0.17 + fine * 0.075), 0.0, 1.0);
}

// Subtle, deterministic grass fallback until an authored grass PNG is supplied.
// Sampling world-space coordinates keeps the pattern fixed after excavation.
vec3 grassAlbedo(vec3 world) {
  vec2 coarseCell = floor(world.xz * 7.0);
  vec2 fineCell = floor(world.xz * 23.0);
  float coarse = soilHash(coarseCell + vec2(41.0, 17.0)) - 0.5;
  float fine = soilHash(fineCell + vec2(9.0, 63.0)) - 0.5;
  vec3 base = terrainAlbedo(1.0);
  return clamp(base * (1.0 + coarse * 0.10 + fine * 0.045), 0.0, 1.0);
}

${FIRE_MATERIAL_LAB_GLSL}
${HUNT_LAVA_SURFACE_GLSL}
${FIRE_TERRAIN_MATERIAL_GLSL}


vec3 huntGrassArt(vec3 albedo,vec2 ground) {
  // Large, coherent moss beds with a shared pixel grid for the grass motifs.
  vec2 pixel=floor(ground*12.0);
  vec2 at=(pixel+.5)/12.0;
  float clearing=labNoise(at*.23)+.25*(labNoise(at*.61)-.5);
  vec3 moss=srgbToLinearColor(vec3(.27,.36,.19));
  vec3 sun=srgbToLinearColor(vec3(.47,.55,.26));
  float light=floor(clamp(clearing*5.0,0.0,4.0))*.25;
  vec3 bed=mix(albedo,mix(moss,sun,light),.64);
  vec2 chips=floor((pixel+vec2(mod(floor(pixel.y/3.0),2.0)*2.0,0.0))/vec2(4.0,3.0));
  float cluster=soilHash(chips+41.0);
  float stitch=soilHash(floor(pixel/2.0)+15.0);
  if(cluster<.29)bed*=.69+stitch*.16;
  else if(cluster>.62)bed*=1.17+stitch*.24;

  // One small rooted silhouette per eligible cluster. Quiet canopy floor
  // stays legible around the actor, with tufts concentrated in the light.
  vec2 grid=floor(pixel/vec2(15.0,13.0));
  vec2 anchor=vec2(3.0)+floor(vec2(soilHash(grid+8.0),soilHash(grid+19.0))*vec2(9.0,7.0));
  vec2 p=pixel-grid*vec2(15.0,13.0)-anchor;
  bool tuft=(p.x==0.0&&p.y>=-2.0&&p.y<=0.0)
    ||(abs(p.x)==1.0&&p.y>=-1.0&&p.y<=1.0)
    ||(p.x==-2.0&&p.y==0.0);
  if(tuft&&soilHash(grid+26.0)<.48&&clearing>.42){
    vec3 tips=srgbToLinearColor(vec3(.61,.64,.31));
    return p.y<0.0?mix(bed,tips,.66):bed*.77;
  }
  return bed;
}

vec3 huntFadingSurface(vec3 surface,int material) {
  // Anchored to the map so adjacent regions share one continuous transition.
  // Skip all extra terrain sampling in the living woodland behind it.
  float distanceNorth=uHuntFadingStartZ-vWorld.z;
  bool route=uHuntCorruption.x>=0.0;
  if(route?uHuntCorruption.x<=0.0:distanceNorth<-4.0)return surface;
  vec2 texel=(floor(vWorld.xz*12.0)+.5)/12.0;
  float pockets=labNoise(texel*.29+32.0);
  float advance=route?clamp(uHuntCorruption.x+(pockets-.5)*.24*uHuntCorruption.x*(1.0-uHuntCorruption.x),0.0,1.0):
    smoothstep(0.0,32.0,distanceNorth+(pockets-.5)*8.0);
  if(advance<=0.0)return surface;
  float grains=labNoise(texel*2.0+vWorld.y*.53);
  float ash=smoothstep(.37,.73,pockets+.24*(grains-.5));
  float value=dot(surface,vec3(.2126,.7152,.0722));
  if(route){
    float ashCover=uHuntCorruption.y*(.43+.57*ash);
    float heat=uHuntCorruption.z;
    vec3 charcoal=value*vec3(.56,.55,.59);
    if(material==1&&vNormal.y>.5){
      vec3 faded=mix(surface*vec3(.72,.81,.73),value*vec3(.98,.82,.62),ash);
      return mix(mix(surface,faded,advance*.76),charcoal,ashCover);
    }
    vec3 dust=value*vec3(.95,.86,.83);
    vec3 basalt=mix(charcoal,value*vec3(.79,.52,.39),ash*.55);
    return mix(mix(surface,dust,ashCover*.64),basalt,heat*.86);
  }
  if(material==1){
    vec3 moss=surface*vec3(.63,.74,.66);
    vec3 dry=vec3(value)*vec3(.91,.83,.72);
    return mix(surface,mix(moss,dry,ash*.83),advance*.85);
  }
  if(material==2){
    vec3 cinder=vec3(value)*vec3(1.03,.96,.91);
    return mix(surface,cinder,advance*(.30+.42*ash));
  }
  vec3 weathered=surface*vec3(.76,.79,.84);
  return mix(surface,weathered,advance*(.45+.31*ash));
}

vec3 huntRootMoss(vec3 grass,vec2 ground) {
  vec3 size=vec3(textureSize(uLabMaterials,0));
  vec2 local=ground-uLabOrigin.xz;
  if(any(lessThan(local,vec2(.5)))||any(greaterThan(local,size.xz-.5)))return grass;
  float canopy=texture(uLabMaterials,vec3(local.x/size.x,.5,local.y/size.z)).r;
  if(canopy<=.02)return grass;
  vec2 pixel=floor(ground*12.0);
  float broken=soilHash(floor(pixel/3.0)+91.0);
  float weight=smoothstep(.07,.70,canopy+(broken-.5)*.26);
  vec3 peat=srgbToLinearColor(vec3(.22,.28,.16));
  vec3 moss=srgbToLinearColor(vec3(.31,.41,.25));
  return mix(grass,mix(peat,moss,step(.32,broken)),weight*.72);
}

vec3 huntCutTerrain(vec3 albedo,int material) {
  bool top=vNormal.y>.5;
  ivec3 parent=ivec3(floor(vWorld-vNormal*.002));
  ivec2 column=parent.xz;
  ivec2 exposed=column+ivec2(round(vNormal.xz));
  if(material==1&&top){
    vec2 across=fract(vWorld.xz);
    int axis=min(across.x,1.0-across.x)<min(across.y,1.0-across.y)?0:1;
    float edge=min(across[axis],1.0-across[axis]);
    if(edge>.30)return albedo;
    column[axis]+=across[axis]<.5?-1:1;
    float cut=float(labMaterial(ivec3(column.x,2,column.y)))/255.0;
    if(cut==0.0)return albedo;
    vec2 rimPixel=floor(vWorld.xz*12.0)/12.0;
    float grain=labNoise(rimPixel*4.2+89.0);
    float rim=1.0-smoothstep(.04,.13+.13*grain,edge);
    return mix(albedo,srgbToLinearColor(vec3(.22,.16,.10)),rim*(.32+.31*grain));
  }
  int cut=labMaterial(ivec3(exposed.x,2,exposed.y))/85;
  if(cut==0)return albedo;
  int floorY=labMaterial(ivec3(exposed.x,0,exposed.y))/4-4;
  if(top?parent.y!=floorY:parent.y<=floorY||parent.y>floorY+cut)return albedo;
  if(material==1)return albedo*.62;

  // The same world-space bedding runs across the crater floor and walls.
  // Quantize the artwork before evaluating the strata, leaving voxel edges
  // out of the palette and fracture coordinates.
  vec3 pixel=(floor(vWorld*12.0+.002)+.5)/12.0;
  float depth=float(cut)/3.0;
  float weathering=labNoise(pixel.xz*.86+pixel.y*.31+19.0);
  if(material==2){
    vec3 umber=srgbToLinearColor(vec3(.31,.21,.14));
    vec3 clay=srgbToLinearColor(vec3(.49,.34,.23));
    float bands=floor(smoothstep(.18,.83,weathering)*4.0)/4.0;
    return mix(albedo,mix(umber,clay,bands),.49+depth*.17);
  }

  vec2 bedding=vec2(pixel.x+pixel.z*.44,pixel.z-pixel.x*.37);
  float buckling=labNoise(bedding*.78+38.0)-.5;
  float bed=bedding.y*1.08+pixel.y*.72+buckling*.47;
  float row=floor(bed);
  float seam=min(fract(bed),1.0-fract(bed));
  float block=bedding.x*.67+soilHash(vec2(row,17.0))*.8+buckling*.29;
  float fault=fract(block);
  float joint=1.0-smoothstep(.018,.075,min(seam,fault));
  float face=soilHash(vec2(floor(block),row));
  vec3 slate=srgbToLinearColor(mix(vec3(.35,.36,.39),vec3(.50,.50,.51),face));
  slate*=1.0-.35*joint;
  float edgeGlow=step(.08,seam)*(1.0-step(.17,seam));
  slate*=1.0+.13*edgeGlow;
  return mix(albedo,slate,.66+depth*.13);
}

vec3 huntGrassShoulder(vec3 albedo,int material) {
  ivec2 cell=ivec2(floor(vWorld.xz));
  int height=int(floor(vWorld.y-.002));
  int here=labMaterial(ivec3(cell.x,0,cell.y));
  if(here%4!=material||here/4-4!=height)return albedo;

  vec2 fraction=fract(vWorld.xz);
  float edgeWeight=0.0;
  float distanceToGrass=0.0;
  vec2 seam=vWorld.xz;
  int alongAxis=0;
  for(int axis=0;axis<2;axis++){
    for(int side=-1;side<=1;side+=2){
      float edge=side<0?fraction[axis]:1.0-fraction[axis];
      if(edge>=.40)continue;
      ivec2 adjacent=cell;
      adjacent[axis]+=side;
      int next=labMaterial(ivec3(adjacent.x,0,adjacent.y));
      if(next%4!=3-material||abs(next/4-4-height)>1)continue;
      vec2 boundary=vWorld.xz;
      boundary[axis]=float(cell[axis])+(side<0?0.0:1.0);
      float distance=material==1?edge:-edge;
      float weight=1.0-smoothstep(.10,.40,edge);
      if(weight<=edgeWeight)continue;
      edgeWeight=weight;
      distanceToGrass=distance;
      seam=boundary;
      alongAxis=1-axis;
    }
  }
  if(edgeWeight<=0.0)return albedo;

  // Both faces use the same shoulder palette and pattern at the join.
  // A few lobes reach into the dirt, with a highlight and root shadow.
  vec2 pixel=floor(vWorld.xz*12.0);
  vec2 seamPixel=floor(seam*12.0);
  float along=seamPixel[alongAxis];
  float group=floor(along/8.0);
  float phase=mod(along,8.0);
  float variation=soilHash(floor(seamPixel/8.0)+29.0);
  float extension=(variation>.32?max(0.0,3.0-abs(phase-3.0)):0.0)/12.0;
  float signedStep=floor(abs(distanceToGrass)*12.0+.0001)*sign(distanceToGrass)/12.0;
  float coverage=smoothstep(-.10,.07,signedStep+extension-.05);
  vec3 soil=srgbToLinearColor(vec3(.41,.30,.21));
  vec3 green=huntGrassArt(srgbToLinearColor(vec3(.34,.44,.21)),vWorld.xz);
  if(extension>.08&&signedStep+extension<.12){
    vec3 tip=srgbToLinearColor(vec3(.54,.61,.29));
    green=mix(green,tip,mod(group+pixel.x+pixel.y,3.0)==0.0?.24:.53);
  }
  return mix(albedo,mix(soil,huntRootMoss(green,vWorld.xz),coverage),edgeWeight);
}

// Materials-owned native forest bank appearance. The large exposed soil
// faces are geological Voxel solids, NOT cast shadows. Weathering prevents
// 2m exposed banks from reading as flat dark brown rectangles while keeping
// real sun/contact shadows and authored microvoxel faces untouched.
// All sampling is continuous in world space, across chunks and voxel seams.
vec3 huntWoodlandBankSurface(vec3 surface,int material) {
  if(!uHuntGrassArt||abs(vNormal.y)>.5||material>2||
      uHuntCorruption.z>.25)return surface;
  vec2 face=abs(vNormal.x)>.5?vWorld.zy:vWorld.xy;
  float mossBed=labNoise(face*.29+vec2(37.0,11.0));
  float roots=labNoise(face*1.45+vec2(7.0,53.0));
  float grit=soilHash(floor(face*9.0)+vec2(13.0,41.0));
  float coverage=smoothstep(.26,.74,mossBed*.73+roots*.27);
  vec3 earth=srgbToLinearColor(vec3(.50,.375,.265));
  vec3 mineral=srgbToLinearColor(vec3(.54,.54,.47));
  vec3 moss=srgbToLinearColor(vec3(.37,.48,.27));
  // A genuinely exposed multi-metre soil bank should read as weathered
  // mineral and rooted woodland, not an uninterrupted dark brown slab.
  // Its authoritative dirt ID, destructibility and Voxel collision do not
  // change. Small grass voxel edges retain more of their original earth.
  vec3 bank=mix(surface,material==2?mineral:earth,material==2?.66:.32);
  bank=mix(bank,moss,coverage*(material==2?.38:.56));
  return bank*(.95+.10*roots+.05*grit);
}

void main() {
  vec3 lava;
  if(uHuntLavaEnabled&&huntLavaSurface(lava)){
    outColor=vec4(linearToSrgbColor(lava),1.0);
    return;
  }
  if(uLabEnabled&&abs(vMaterial-5.0)<.5){
    outColor=vec4(linearToSrgbColor(labLava(vWorld.xz)),1.0);
    return;
  }
  // The scenic woodland extends up to the playable shelf in the Hunt view.
  // Hide its exposed stone skirt on both sides, including the underside.
  // The early mobile Play Hunt has no authored texture atlas, lighting,
  // normal or ORM assets. Do not shade every phone pixel with the entire
  // optional material pipeline when exploring this terrain prototype.
  // Full V2 material rendering remains the default for all other hosts.
  if (uFastHuntMode) {
    vec3 base=terrainAlbedo(vMaterial);
    if (abs(vMaterial-1.0)<0.5 && vNormal.y>0.5) {
      float grassVariation=soilHash(floor(vWorld.xz*0.43)+vec2(31.0,14.0))-0.5;
      base*=1.0+grassVariation*0.12;
    }
    float light=vNormal.y>0.5?1.0:
      vNormal.y< -0.5?0.52:vNormal.x>0.5?0.84:
      vNormal.z>0.5?0.78:0.70;
    outColor=vec4(clamp(base*sqrt(light),0.0,1.0),1.0);
    return;
  }
  vec3 albedo = terrainAlbedo(vMaterial);
  if (abs(vMaterial - 2.0) < 0.5) {
    albedo = soilAlbedo(vWorld, vNormal);
  }
  if (abs(vMaterial - 1.0) < 0.5) {
    if (vNormal.y > 0.5) {
      albedo = grassAlbedo(vWorld);
      if (uGrassEnabled) {
        // World-anchored mapping: edits and chunk boundaries cannot shift the texture.
        vec2 uv = vWorld.xz * (uGrassTexelsPerVoxel / 1024.0);
        albedo = texture(uGrassTexture, uv).rgb;
      }
    } else if (vNormal.y < 0.5) {
      // An exposed grass voxel side is soil, not a vertical grass photograph.
      // The narrow upper rim remains grass-colored and tracks each voxel top.
      vec3 soil = soilAlbedo(vWorld, vNormal);
      float topRim = smoothstep(0.79, 0.94, fract(vWorld.y));
      albedo = mix(soil, albedo, topRim);
    }
  }
  // Surface-specific albedo layers; negative layer means procedural fallback.
  int surfaceIndex = abs(vMaterial - 1.0) < 0.5
    ? (vNormal.y > 0.5 ? 0 : 1)
    : (abs(vMaterial - 2.0) < 0.5 ? 2 : 3);
  vec2 materialUv = abs(vNormal.y) > 0.5 ? vWorld.xz
    : abs(vNormal.x) > 0.5 ? vWorld.zy : vWorld.xy;
  float layer = uTerrainLayers[surfaceIndex];
  float normalLayer = uTerrainNormalLayers[surfaceIndex];
  float ormLayer = uTerrainOrmLayers[surfaceIndex];
  float variantMix = 0.0;
  vec2 uv = uLabEnabled&&uLabGrassStyle>0&&surfaceIndex==0?materialUv*.62:materialUv;
  bool huntCliff=uHuntGrassArt&&surfaceIndex==3&&abs(vNormal.y)<.5;
  // One vertical repeat over a two-voxel face. The grain crosses voxel joins.
  if(huntCliff)uv*=vec2(.55,.5);
  if (layer >= 0.0) {
    vec3 primary = texture(uTerrainAlbedo, vec3(uv * uTerrainTilesPerVoxel, layer)).rgb;
    float secondaryLayer = uTerrainSecondaryLayers[surfaceIndex];
    if (secondaryLayer >= 0.0) {
      // World-anchored 4-voxel cells: deterministic patches survive excavation
      // and remeshing. Neighboring cells blend without hard checkerboard edges.
      vec2 cell = uv / 4.0;
      vec2 grid = floor(cell);
      vec2 blend = smoothstep(vec2(0.15), vec2(0.85), fract(cell));
      vec2 h0 = vec2(dot(grid, vec2(127.1, 311.7)), dot(grid, vec2(269.5, 183.3)));
      vec2 h1 = h0 + vec2(127.1, 269.5);
      vec2 h2 = h0 + vec2(311.7, 183.3);
      vec2 h3 = h0 + vec2(438.8, 452.8);
      float threshold = surfaceIndex == 0 ? 0.25 : 0.20;
      float a = step(1.0 - threshold, fract(sin(h0.x + h0.y) * 43758.5453));
      float b = step(1.0 - threshold, fract(sin(h1.x + h1.y) * 43758.5453));
      float c = step(1.0 - threshold, fract(sin(h2.x + h2.y) * 43758.5453));
      float d = step(1.0 - threshold, fract(sin(h3.x + h3.y) * 43758.5453));
      float mixAmount = mix(mix(a, b, blend.x), mix(c, d, blend.x), blend.y);
      vec3 secondary = texture(uTerrainAlbedo,
        vec3(uv * uTerrainTilesPerVoxel, secondaryLayer)).rgb;
      // Retain broad biome variation without making separate dark checkerboard
      // patches dominate a tiny mobile Hunt viewport. All channels share it.
      float softMix = mixAmount * (surfaceIndex == 0 ? 0.46 : 0.60);
      albedo = mix(primary, secondary, softMix);
      variantMix = softMix;
    } else {
      albedo = primary;
    }
  }
  vec3 detailedNormal=vNormal;
  vec3 surfaceOrm=vec3(1.0,1.0,0.0);
  if (layer >= 0.0 && normalLayer >= 0.0) {
    vec3 tangentNormal = texture(uTerrainNormal,
      vec3(uv * uTerrainTilesPerVoxel, normalLayer)).xyz * 2.0 - 1.0;
    float secondaryNormal = uTerrainSecondaryNormalLayers[surfaceIndex];
    if (variantMix > 0.0 && secondaryNormal >= 0.0) {
      vec3 nextNormal = texture(uTerrainNormal,
        vec3(uv * uTerrainTilesPerVoxel, secondaryNormal)).xyz * 2.0 - 1.0;
      tangentNormal = normalize(mix(tangentNormal, nextNormal, variantMix));
    }
    // Explicit face bases prevent top/wall normal maps from rotating incorrectly.
    vec3 n = normalize(vNormal);
    vec3 t = abs(n.y) > 0.5 ? vec3(1.0, 0.0, 0.0)
      : abs(n.x) > 0.5 ? vec3(0.0, 0.0, 1.0) : vec3(1.0, 0.0, 0.0);
    vec3 b = normalize(cross(n, t));
    detailedNormal = normalize(t * tangentNormal.x + b * tangentNormal.y +
      n * max(0.2, tangentNormal.z));

  }
  if (layer >= 0.0 && ormLayer >= 0.0) {
    vec3 orm = texture(uTerrainOrm,
      vec3(uv * uTerrainTilesPerVoxel, ormLayer)).rgb;
    float secondaryOrm = uTerrainSecondaryOrmLayers[surfaceIndex];
    if (variantMix > 0.0 && secondaryOrm >= 0.0) {
      vec3 nextOrm = texture(uTerrainOrm,
        vec3(uv * uTerrainTilesPerVoxel, secondaryOrm)).rgb;
      orm = mix(orm, nextOrm, variantMix);
    }
    surfaceOrm=orm;
  }
  // SRGB8_ALPHA8 albedo arrays have already been decoded to linear RGB by
  // WebGL2. Procedural swatches and the legacy RGBA8 grass sampler have not.
  // Never treat the two types of albedo identically before lighting.
  vec3 linearAlbedo = layer >= 0.0 ? albedo : srgbToLinearColor(albedo);
  // Mineral stone replaces albedo completely. Skip the grass, bank, fading
  // and cut-face overlays whose result would otherwise be discarded.
  // Keep shared normal/ORM lighting and lab material overrides unchanged.
  if(uHuntGrassArt&&vMaterial==3.0){
    linearAlbedo=stoneMineralSurface(linearAlbedo,uHuntCorruption.z);
  }else{
    if(uHuntGrassArt&&surfaceIndex==0&&layer>=0.0) {
      linearAlbedo=huntGrassArt(linearAlbedo,vWorld.xz);
      if(uHuntGrassEdges)linearAlbedo=huntRootMoss(linearAlbedo,vWorld.xz);
    }
    if(uHuntGrassEdges&&vNormal.y>.5&&(vMaterial==1.0||vMaterial==2.0)) {
      linearAlbedo=huntGrassShoulder(linearAlbedo,int(vMaterial));
    }
    if(uHuntLavaEnabled)linearAlbedo=huntRiverBank(linearAlbedo);
    if(uHuntGrassArt)linearAlbedo=huntFadingSurface(linearAlbedo,int(vMaterial));
    if(uHuntGrassEdges)linearAlbedo=huntCutTerrain(linearAlbedo,int(vMaterial));
    if(uHuntGrassArt)linearAlbedo=huntWoodlandBankSurface(linearAlbedo,int(vMaterial));
    if(uHuntGrassArt)linearAlbedo=fireTerrainSurface(linearAlbedo,int(vMaterial));
  }

  if(uLabEnabled){
    linearAlbedo=labTerrainColor(linearAlbedo,materialUv);

  }
  // Materials supply linear surface values. Lighting alone evaluates their
  // response; Rendering encodes to the canvas exactly once.
  V2Surface surface=V2Surface(linearAlbedo,detailedNormal,vNormal,surfaceOrm,
    vec3(0.0),layer>=0.0&&normalLayer>=0.0,layer>=0.0&&ormLayer>=0.0);
  V2LightingContext context=V2LightingContext(vWorld,uHuntHeightContrast,
    uHuntElevationReference,uLabEnabled&&labShallowGrassBank(int(round(vMaterial))));
  outColor=vec4(linearToSrgbColor(evaluateV2Lighting(surface,context)),1.0);
}
`;
}
const FRAGMENT_SHADER=assembleVoxelFragmentShader();

// Public shader sources allow *real GLSL ES compiler validation* in CI.
// Node syntax tests alone cannot detect reserved words inside GLSL strings.
export const WEBGL_V2_VERTEX_SHADER_SOURCE = VERTEX_SHADER;
export const WEBGL_V2_FRAGMENT_SHADER_SOURCE = FRAGMENT_SHADER;

function createShader(gl, type, source) {
  const shader = gl.createShader(type);
  if (!shader) throw new Error('WebGL2 shader allocation failed');
  gl.shaderSource(shader, source);
  gl.compileShader(shader);
  if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
    const message = gl.getShaderInfoLog(shader) || 'Unknown shader error';
    gl.deleteShader(shader);
    throw new Error('WebGL2 shader compilation failed: ' + message);
  }
  return shader;
}

function createProgram(gl,fragmentSource=FRAGMENT_SHADER) {
  const vertex = createShader(gl, gl.VERTEX_SHADER, VERTEX_SHADER);
  const fragment = createShader(gl, gl.FRAGMENT_SHADER, fragmentSource);
  const program = gl.createProgram();
  if (!program) throw new Error('WebGL2 program allocation failed');
  gl.attachShader(program, vertex);
  gl.attachShader(program, fragment);
  gl.linkProgram(program);
  gl.deleteShader(vertex);
  gl.deleteShader(fragment);
  if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
    const message = gl.getProgramInfoLog(program) || 'Unknown program link error';
    gl.deleteProgram(program);
    throw new Error('WebGL2 shader program link failed: ' + message);
  }
  return program;
}

export class WebGLVoxelView {
  #gl;
  #grassImage = null;
  #labVolume = null;
  #transientPositions=new Float32Array(8);
  #transientRadiance=new Float32Array(6);
  #pointVisibilityUpload=new Float32Array(POINT_VISIBILITY_FLOATS);
  #lightingTexture=null;
  #lightingSource=null;
  #huntLavaTexture = null;
  #huntLavaSource = null;
  #labOrigin = null;
  // Authored texture slots are native 64px art, not downscaled preview assets.
  // Seven mip levels (64 -> 1) prevent 64 texels of artwork from aliasing
  // into a few screen pixels at normal Hunt camera zoom.
  #terrainManifest = compileTerrainTextureManifest(undefined,{tileSize:64,mipLevels:7});
  #terrainCache = null;
  #terrainTileImages = new Map();
  #pendingTerrainTiles = new Map();
  #terrainTileStagingBytes = 0;
  #terrainTileStagingMaxBytes = 32 * 1024 * 1024;
  #terrainTilesPerVoxel = 1;
  #grassTexture = null;
  #grassTexelsPerVoxel = 32;
  #contextLossExtension = null;
  #program = null;
  #uniforms = null;
  #gpuMeshes = new Map();
  #sourceMeshes = new Map();
  // Scene generation, independent of the terrain world's runtime epoch.
  // Async consumers must present the generation they captured before starting work.
  #sceneEpoch = 0;
  #staleUploadRejections = 0;
  #queuedUploads = new Map();
  #uploadQueuePeak = 0;
  #uploadQueueBytes = 0;
  #recoveryQueue = new Map();
  #recoveryBytes = 0;
  #sceneQueue = new Map();
  #sceneBytes = 0;
  #retiredGpuMeshes = [];
  #retiredGpuBytes = 0;
  #recovering = false;
  #lost = false;
  #losses = 0;
  #onAvailabilityChange;
  #fastHuntMode;
  #transparentBackground;
  #fragmentSource;

  constructor(canvas, {
    onAvailabilityChange = () => {},fastHuntMode=false,transparentBackground=false,
    lightingShader=BASELINE_LIGHTING_GLSL
  } = {}) {
    this.#fragmentSource=assembleVoxelFragmentShader(lightingShader);
    if(typeof fastHuntMode!=='boolean') {
      throw new TypeError('fastHuntMode must be a boolean');
    }
    this.#fastHuntMode=fastHuntMode;
    this.#transparentBackground=transparentBackground;
    this.#onAvailabilityChange = onAvailabilityChange;
    const gl = canvas.getContext('webgl2', {
      alpha: transparentBackground, antialias: false, depth: true, stencil: false, preserveDrawingBuffer: false
    });
    if (!gl) throw new Error('WebGL2 is unavailable on this device');
    this.#gl = gl;
    // WebGL extensions cannot reliably be queried while the context is lost.
    this.#contextLossExtension = gl.getExtension?.('WEBGL_lose_context') ?? null;
    this.#initialize();

    canvas.addEventListener('webglcontextlost', event => {
      event.preventDefault();
      this.#lost = true;
      this.#losses++;
      this.#program = null;
      this.#grassTexture = null;
      this.#labVolume = null;
      this.#lightingTexture=null;
      this.#lightingSource=null;
      this.#huntLavaTexture = null;
      this.#huntLavaSource = null;
      this.#terrainCache?.contextLost();
      this.#pendingTerrainTiles.clear();
      this.#gpuMeshes.clear();
      // Context loss destroys GPU handles; never replay obsolete retirement work.
      this.#retiredGpuMeshes.length = 0;
      this.#retiredGpuBytes = 0;
      this.#recoveryQueue.clear();
      this.#recoveryBytes = 0;
      this.#sceneQueue.clear();
      this.#sceneBytes = 0;
      this.#recovering = false;
      this.#onAvailabilityChange(false);
    });
    canvas.addEventListener('webglcontextrestored', () => {
      try {
        this.#lost = false;
        this.#initialize();
        // Restore incrementally: a context restoration must not synchronously
        // re-upload the entire scene on the main thread.
        this.#recoveryQueue = new Map(this.#sourceMeshes);
        this.#recoveryBytes = [...this.#recoveryQueue.values()].reduce((sum, mesh) =>
          sum + this.#meshBytes(mesh), 0);
        this.#recovering = this.#recoveryQueue.size > 0;
        this.#onAvailabilityChange(true);
      } catch (error) {
        this.#lost = true;
        this.#onAvailabilityChange(false, error);
      }
    });
  }

  // Diagnostic only: browser-supported WEBGL_lose_context; no synthetic events.
  simulateContextTransition(action) {
    if (action !== 'lose' && action !== 'restore') {
      throw new RangeError('Invalid WebGL context transition');
    }
    const extension = this.#contextLossExtension;
    if (!extension) return false;
    if (action === 'lose' && this.ready) extension.loseContext();
    else if (action === 'restore' && this.#lost) extension.restoreContext();
    else return false;
    return true;
  }

  // Optional authored albedo tiles; unchanged terrain continues using procedural fallback.
  // Keys must exist in the material manifest. Images are retained for context recovery.
  setTerrainAlbedoTile(key, image) {
    return this.setTerrainMaterialTile('albedo', key, image);
  }

  setTerrainMaterialTile(channel, key, image) {
    const asset = this.#terrainManifest.assets.find(item => item.channel === channel && item.key === key);
    if (!asset) throw new RangeError('Unknown terrain material asset');
    if (!image || image.width !== this.#terrainManifest.tileSize ||
        image.height !== this.#terrainManifest.tileSize) {
      throw new RangeError('Terrain material tiles must match manifest dimensions');
    }
    const identity = channel + ':' + key;
    const previous = this.#terrainTileImages.get(identity);
    const bytes = image.width * image.height * 4;
    const nextBytes = this.#terrainTileStagingBytes - (previous?.bytes ?? 0) + bytes;
    if (nextBytes > this.#terrainTileStagingMaxBytes) {
      throw new RangeError('Terrain decoded tile staging budget exceeded');
    }
    // Last-write-wins queue. Retained images are the source of truth for
    // context recovery; the frame loop performs GPU uploads incrementally.
    this.#terrainTileImages.set(identity, { channel, key, image, bytes });
    this.#terrainTileStagingBytes = nextBytes;
    this.#pendingTerrainTiles.set(identity, { channel, key, image });
  }

  clearTerrainAlbedoTiles() {
    this.#terrainTileImages.clear();
    this.#pendingTerrainTiles.clear();
    this.#terrainTileStagingBytes = 0;
    this.#terrainCache?.dispose();
    this.#terrainCache = null;
  }

  get terrainTileStagingStatistics() {
    return Object.freeze({ retainedTiles: this.#terrainTileImages.size,
      estimatedDecodedBytes: this.#terrainTileStagingBytes,
      pendingTiles: this.#pendingTerrainTiles.size,
      maxBytes: this.#terrainTileStagingMaxBytes });
  }

  setTerrainTextureScale(tilesPerVoxel) {
    if (!Number.isFinite(tilesPerVoxel) || tilesPerVoxel <= 0 || tilesPerVoxel > 16) {
      throw new RangeError('Invalid terrain texture scale');
    }
    this.#terrainTilesPerVoxel = tilesPerVoxel;
  }

  setGrassMaterial(image, texelsPerVoxel = 32) {
    if (!image || image.width !== 1024 || image.height !== 1024) {
      throw new RangeError("Grass texture must be exactly 1024×1024");
    }
    if (![16, 32, 64, 128].includes(texelsPerVoxel)) {
      throw new RangeError("Unsupported grass texture density");
    }
    this.#grassImage = image;
    this.#grassTexelsPerVoxel = texelsPerVoxel;
    if (this.ready) this.#uploadGrassTexture();
  }

  setGrassDensity(value) {
    if (![16, 32, 64, 128].includes(value)) throw new RangeError("Unsupported grass density");
    this.#grassTexelsPerVoxel = value;
  }

  #uploadGrassTexture() {
    const gl = this.#gl;
    if (this.#grassTexture) gl.deleteTexture(this.#grassTexture);
    this.#grassTexture = null;
    if (!this.#grassImage || this.#lost || gl.isContextLost()) return;
    const texture = gl.createTexture();
    if (!texture) throw new Error("Cannot allocate grass texture");
    gl.bindTexture(gl.TEXTURE_2D, texture);
    gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, this.#grassImage);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.REPEAT);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.REPEAT);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.bindTexture(gl.TEXTURE_2D, null);
    this.#grassTexture = texture;
  }

  get ready() { return !this.#lost && this.#program !== null; }
  get pendingUploads() {
    return this.#queuedUploads.size + this.#sceneQueue.size + this.#recoveryQueue.size +
      this.#pendingTerrainTiles.size + this.#retiredGpuMeshes.length;
  }
  get recovering() { return this.#recovering; }
  get sceneEpoch() { return this.#sceneEpoch; }

  #acceptSceneEpoch(epoch) {
    // Legacy callers may omit the guard, but asynchronous consumers must use it.
    if (epoch === undefined) return true;
    if (!Number.isSafeInteger(epoch) || epoch < 0) {
      throw new RangeError('Invalid renderer scene epoch');
    }
    if (epoch === this.#sceneEpoch) return true;
    this.#staleUploadRejections++;
    return false;
  }

  #meshBytes(mesh) {
    return mesh.positions.byteLength + mesh.normals.byteLength +
      mesh.materials.byteLength + mesh.indices.byteLength;
  }
  get uploadQueueStatistics() {
    return { pendingChunks: this.#queuedUploads.size,
      pendingBytes: this.#uploadQueueBytes + this.#sceneBytes + this.#recoveryBytes,
      sceneChunks: this.#sceneQueue.size,
      recoveryChunks: this.#recoveryQueue.size,
      pendingGpuDisposals: this.#retiredGpuMeshes.length,
      retiredGpuBytesEstimate: this.#retiredGpuBytes,
      peakChunks: this.#uploadQueuePeak,
      sceneEpoch: this.#sceneEpoch,
      staleUploadRejections: this.#staleUploadRejections,
      pendingTextureTiles: this.#pendingTerrainTiles.size };
  }

  // V2.4: stage a bounded batch; caller invalidates it on new edits/reset.
  queueReplacementMeshes(dirtyIds, meshes, { sceneEpoch } = {}) {
    if (!this.#acceptSceneEpoch(sceneEpoch)) return false;
    const ids = new Set(dirtyIds);
    if (!ids.size || ids.size > 128 || !Array.isArray(meshes)) {
      throw new RangeError('Invalid bounded GPU replacement batch');
    }
    const replacements = new Map();
    for (const mesh of meshes) {
      if (!mesh || !ids.has(mesh.id) || replacements.has(mesh.id)) {
        throw new TypeError('Invalid queued replacement mesh');
      }
      replacements.set(mesh.id, mesh);
    }
    const newIds = [...ids].filter(id => !this.#queuedUploads.has(id));
    if (this.#queuedUploads.size + newIds.length > 128) {
      throw new RangeError('GPU upload queue capacity exceeded');
    }
    let nextBytes = this.#uploadQueueBytes;
    for (const id of ids) {
      const previous = this.#queuedUploads.get(id);
      if (previous) nextBytes -= this.#meshBytes(previous);
      const mesh = replacements.get(id);
      if (mesh) nextBytes += this.#meshBytes(mesh);
    }
    if (nextBytes > 16 * 1024 * 1024) {
      throw new RangeError('GPU upload queue byte capacity exceeded');
    }
    for (const id of ids) {
      this.#queuedUploads.set(id, replacements.get(id) ?? null);
    }
    this.#uploadQueueBytes = nextBytes;
    this.#uploadQueuePeak = Math.max(this.#uploadQueuePeak, this.#queuedUploads.size);
    return true;
  }

  cancelQueuedUploads() {
    this.#queuedUploads.clear();
    this.#uploadQueueBytes = 0;
  }

  // One chunk minimum per frame; WebGL bufferData itself is not preemptible.
  flushQueuedUploads({ budgetMs = 2, now = () => performance.now() } = {}) {
    if (!Number.isFinite(budgetMs) || budgetMs <= 0) {
      throw new RangeError('Invalid GPU upload frame budget');
    }
    if (!this.ready || !this.pendingUploads) return { chunks: 0, elapsedMs: 0 };
    const start = now();
    let chunks = 0;
    while (this.pendingUploads && (chunks === 0 || now() - start < budgetMs)) {
      // Free old scene buffers before allocating any new ones on rapid resets.
      // Each WebGL delete operation is synchronous; one retired mesh is the
      // smallest bounded disposal step we can schedule.
      if (this.#retiredGpuMeshes.length) {
        const record = this.#retiredGpuMeshes.at(-1);
        this.#disposeRecord(record);
        this.#retiredGpuMeshes.pop();
        this.#retiredGpuBytes -= record.bytes;
      } else if (this.#queuedUploads.size) {
        const [id, mesh] = this.#queuedUploads.entries().next().value;
        this.#queuedUploads.delete(id);
        this.#uploadQueueBytes -= mesh ? this.#meshBytes(mesh) : 0;
        this.replaceMeshes(new Set([id]), mesh ? [mesh] : []);
      } else if (this.#sceneQueue.size) {
        const [id, mesh] = this.#sceneQueue.entries().next().value;
        this.#sceneQueue.delete(id);
        this.#sceneBytes -= this.#meshBytes(mesh);
        // A reset or edit may supersede a pending scene mesh.
        if (this.#sourceMeshes.get(id) === mesh) this.#uploadOne(mesh);
      } else if (this.#recoveryQueue.size) {
        const [id, mesh] = this.#recoveryQueue.entries().next().value;
        this.#recoveryQueue.delete(id);
        this.#recoveryBytes -= this.#meshBytes(mesh);
        // Source mesh may have changed during recovery; never resurrect it.
        if (this.#sourceMeshes.get(id) === mesh) this.#uploadOne(mesh);
      } else {
        // Surface art is optional. Never allow decoded texture work to block
        // a newly activated world or its GPU recovery geometry.
        const [identity, tile] = this.#pendingTerrainTiles.entries().next().value;
        this.#ensureTerrainCache();
        this.#terrainCache.upload(tile.channel, tile.key, tile.image);
        this.#pendingTerrainTiles.delete(identity);
      }
      chunks++;
    }
    if (!this.#recoveryQueue.size) this.#recovering = false;
    return { chunks, elapsedMs: now() - start };
  }
  get statistics() {
    let triangles = 0, gpuBytes = 0;
    for (const record of this.#gpuMeshes.values()) {
      triangles += record.triangles;
      gpuBytes += record.bytes;
    }
    return {
      renderer: 'WebGL2 exposed-face V2 baseline',
      triangles,
      drawCalls: this.#gpuMeshes.size,
      gpuBufferBytesEstimate: gpuBytes + this.#retiredGpuBytes,
      retiredGpuBytesEstimate: this.#retiredGpuBytes,
      terrainGpuTextureBytesEstimate: this.#terrainCache?.statistics.allocatedBytes ?? 0,
      terrainDecodedTileBytesEstimate: this.#terrainTileStagingBytes,
      contextLosses: this.#losses,
      ...this.uploadQueueStatistics,
      gpuTimingMs: null
    };
  }

  #initialize() {
    const gl = this.#gl;
    this.#program = createProgram(gl,this.#fragmentSource);
    this.#uniforms = {
      origin: gl.getUniformLocation(this.#program, 'uOrigin'),
      viewport: gl.getUniformLocation(this.#program, 'uViewport'),
      pan: gl.getUniformLocation(this.#program, 'uPan'),
      scale: gl.getUniformLocation(this.#program, 'uScale'),
      cameraRight: gl.getUniformLocation(this.#program, 'uCameraRight'),
      cameraDown: gl.getUniformLocation(this.#program, 'uCameraDown'),
      cameraDepth: gl.getUniformLocation(this.#program, 'uCameraDepth'),
      depthOrigin: gl.getUniformLocation(this.#program, 'uDepthOrigin'),
      grassTexture: gl.getUniformLocation(this.#program, 'uGrassTexture'),
      grassEnabled: gl.getUniformLocation(this.#program, 'uGrassEnabled'),
      fastHuntMode: gl.getUniformLocation(this.#program, 'uFastHuntMode'),
      huntHeightContrast: gl.getUniformLocation(this.#program, 'uHuntHeightContrast'),
      huntGrassArt: gl.getUniformLocation(this.#program, 'uHuntGrassArt'),
      huntFadingStartZ: gl.getUniformLocation(this.#program, 'uHuntFadingStartZ'),
      huntCorruption: gl.getUniformLocation(this.#program, 'uHuntCorruption'),
      huntGrassEdges: gl.getUniformLocation(this.#program, 'uHuntGrassEdges'),
      huntElevationReference: gl.getUniformLocation(this.#program, 'uHuntElevationReference'),
      grassDensity: gl.getUniformLocation(this.#program, 'uGrassTexelsPerVoxel'),
      terrainAlbedo: gl.getUniformLocation(this.#program, 'uTerrainAlbedo'),
      terrainNormal: gl.getUniformLocation(this.#program, 'uTerrainNormal'),
      terrainOrm: gl.getUniformLocation(this.#program, 'uTerrainOrm'),
      terrainNormalLayers: gl.getUniformLocation(this.#program, 'uTerrainNormalLayers'),
      terrainOrmLayers: gl.getUniformLocation(this.#program, 'uTerrainOrmLayers'),
      terrainLayers: gl.getUniformLocation(this.#program, 'uTerrainLayers'),
      terrainSecondaryLayers: gl.getUniformLocation(this.#program, 'uTerrainSecondaryLayers'),
      terrainSecondaryNormalLayers: gl.getUniformLocation(this.#program, 'uTerrainSecondaryNormalLayers'),
      terrainSecondaryOrmLayers: gl.getUniformLocation(this.#program, 'uTerrainSecondaryOrmLayers'),
      labMaterials: gl.getUniformLocation(this.#program,'uLabMaterials'),
      labEnabled: gl.getUniformLocation(this.#program,'uLabEnabled'),
      labBlend: gl.getUniformLocation(this.#program,'uLabBlend'),
      labGrassStyle: gl.getUniformLocation(this.#program,'uLabGrassStyle'),
      labForestStage: gl.getUniformLocation(this.#program,'uLabForestStage'),
      labTime: gl.getUniformLocation(this.#program,'uLabTime'),
      huntLava: gl.getUniformLocation(this.#program,'uHuntLava'),
      lightingField:gl.getUniformLocation(this.#program,'uLightingField'),
      lightingEnabled:gl.getUniformLocation(this.#program,'uLightingFieldEnabled'),
      lightingWarm:gl.getUniformLocation(this.#program,'uLightingWarmEnabled'),
      lightingAmbient:gl.getUniformLocation(this.#program,'uLightingAmbient'),
      lightingEmissionColor:gl.getUniformLocation(this.#program,'uLightingEmissionColor'),
      transientCount:gl.getUniformLocation(this.#program,'uTransientLightCount'),
      transientPositions:gl.getUniformLocation(this.#program,'uTransientPositions[0]'),
      transientRadiance:gl.getUniformLocation(this.#program,'uTransientRadiance[0]'),
      pointVisibilityEnabled:gl.getUniformLocation(this.#program,'uPointVisibilityEnabled'),
      pointVisibilityDistances:gl.getUniformLocation(this.#program,'uPointVisibilityDistances[0]'),
      lightingOrigin:gl.getUniformLocation(this.#program,'uLightingFieldOrigin'),
      huntLavaEnabled: gl.getUniformLocation(this.#program,'uHuntLavaEnabled'),
      huntLavaOrigin: gl.getUniformLocation(this.#program,'uHuntLavaOrigin'),
      labOrigin: gl.getUniformLocation(this.#program,'uLabOrigin'),
      terrainScale: gl.getUniformLocation(this.#program, 'uTerrainTilesPerVoxel')
    };
    this.#uploadGrassTexture();
    this.#terrainCache?.dispose();
    this.#terrainCache = null;
    // Restore textures through the existing per-frame upload drain.
    this.#pendingTerrainTiles = new Map(this.#terrainTileImages);
    gl.enable(gl.DEPTH_TEST);
    gl.depthFunc(gl.LEQUAL);
    gl.disable(gl.BLEND);
    gl.disable(gl.CULL_FACE);
  }

  #ensureTerrainCache() {
    if (this.#terrainCache) return;
    const cache = new TerrainGpuTextureCache(this.#gl, this.#terrainManifest);
    cache.initialize();
    this.#terrainCache = cache;
  }

  #disposeRecord(record) {
    if (this.#lost || this.#gl.isContextLost()) return;
    this.#gl.deleteVertexArray(record.vao);
    for (const buffer of record.buffers) this.#gl.deleteBuffer(buffer);
  }

  #discardGpuMeshes() {
    for (const record of this.#gpuMeshes.values()) this.#disposeRecord(record);
    this.#gpuMeshes.clear();
  }

  #retireGpuMeshes() {
    // Remove the old scene from rendering immediately, then release its GPU
    // handles in the ordinary frame-budgeted drain. Multiple rapid resets
    // cannot allocate new scene buffers ahead of pending retirements.
    for (const record of this.#gpuMeshes.values()) {
      this.#retiredGpuMeshes.push(record);
      this.#retiredGpuBytes += record.bytes;
    }
    this.#gpuMeshes.clear();
  }

  #uploadOne(mesh) {
    if (mesh.indices.length === 0) return;
    const gl = this.#gl;
    const vao = gl.createVertexArray();
    if (!vao) throw new Error('WebGL2 vertex array allocation failed');
    const record = {
      vao, origin: mesh.origin, count: mesh.indices.length,
      triangles: mesh.triangleCount, buffers: [], bytes: 0
    };
    try {
      gl.bindVertexArray(vao);
      const upload = (target, data) => {
        const buffer = gl.createBuffer();
        if (!buffer) throw new Error('WebGL2 buffer allocation failed');
        record.buffers.push(buffer);
        gl.bindBuffer(target, buffer);
        gl.bufferData(target, data, gl.STATIC_DRAW);
        record.bytes += data.byteLength;
      };
      upload(gl.ARRAY_BUFFER, mesh.positions);
      gl.enableVertexAttribArray(0);
      gl.vertexAttribPointer(0, 3, gl.FLOAT, false, 0, 0);
      upload(gl.ARRAY_BUFFER, mesh.normals);
      gl.enableVertexAttribArray(1);
      gl.vertexAttribPointer(1, 3, gl.BYTE, false, 0, 0);
      upload(gl.ARRAY_BUFFER, mesh.materials);
      gl.enableVertexAttribArray(2);
      gl.vertexAttribPointer(2, 1, gl.UNSIGNED_BYTE, false, 0, 0);
      upload(gl.ELEMENT_ARRAY_BUFFER, mesh.indices);
      this.#gpuMeshes.set(mesh.id, record);
    } catch (error) {
      this.#disposeRecord(record);
      throw error;
    } finally {
      gl.bindVertexArray(null);
      gl.bindBuffer(gl.ARRAY_BUFFER, null);
    }
  }

  #stageNewScene() {
    this.#recoveryQueue.clear();
    this.#recoveryBytes = 0;
    this.#recovering = false;
    this.#retireGpuMeshes();
    // Full scene initialization uses the same bounded per-frame upload drain.
    this.#sceneQueue = new Map(this.#sourceMeshes);
    this.#sceneBytes = [...this.#sceneQueue.values()].reduce((sum, mesh) =>
      sum + this.#meshBytes(mesh), 0);
  }

  // Full reset for a new scene/seed/chunk size; remove all old GPU resources.
  setMeshes(meshes) {
    if (!Array.isArray(meshes)) throw new TypeError('Expected V2 chunk meshes');
    const next = new Map();
    for (const mesh of meshes) {
      if (!mesh || typeof mesh.id !== 'string' || next.has(mesh.id)) {
        throw new TypeError('Invalid or duplicate V2 mesh ID');
      }
      next.set(mesh.id, mesh);
    }
    if (this.#sceneEpoch === Number.MAX_SAFE_INTEGER) {
      throw new RangeError('Renderer scene epoch exhausted');
    }
    // Validate before invalidating the currently queued scene. Failed scene
    // activations must not discard a valid active world's deferred uploads.
    this.cancelQueuedUploads();
    this.#sceneEpoch++;
    this.#sourceMeshes = next;
    this.#sceneQueue.clear();
    this.#sceneBytes = 0;
    if (this.ready) this.#stageNewScene();
  }

  // Replace ONLY dirty chunk meshes; an empty result deletes a removed chunk.
  replaceMeshes(dirtyIds, meshes, { sceneEpoch } = {}) {
    if (!this.#acceptSceneEpoch(sceneEpoch)) return false;
    if (!(dirtyIds instanceof Set) && !Array.isArray(dirtyIds)) {
      throw new TypeError('Expected a dirty-chunk Set or array');
    }
    if (!Array.isArray(meshes)) throw new TypeError('Expected replacement meshes');
    const ids = new Set(dirtyIds);
    if (ids.size > 128 || [...ids].some(id => typeof id !== 'string')) {
      throw new RangeError('Invalid or excessive dirty chunk IDs');
    }
    const replacements = new Map();
    for (const mesh of meshes) {
      if (!mesh || typeof mesh.id !== 'string' || !ids.has(mesh.id) ||
          replacements.has(mesh.id)) {
        throw new TypeError('Replacement mesh must match one unique dirty chunk ID');
      }
      replacements.set(mesh.id, mesh);
    }
    for (const id of ids) {
      // A direct authoritative replacement supersedes any older staged upload.
      // Otherwise the stale queue entry could overwrite this edit on a later frame.
      if (this.#queuedUploads.has(id)) {
        const queuedMesh = this.#queuedUploads.get(id);
        if (queuedMesh) this.#uploadQueueBytes -= this.#meshBytes(queuedMesh);
        this.#queuedUploads.delete(id);
      }
      const sceneMesh = this.#sceneQueue.get(id);
      if (sceneMesh) this.#sceneBytes -= this.#meshBytes(sceneMesh);
      this.#sceneQueue.delete(id);
      const recoveryMesh = this.#recoveryQueue.get(id);
      if (recoveryMesh) this.#recoveryBytes -= this.#meshBytes(recoveryMesh);
      this.#recoveryQueue.delete(id);
      const oldGpu = this.#gpuMeshes.get(id);
      if (oldGpu) this.#disposeRecord(oldGpu);
      this.#gpuMeshes.delete(id);
      this.#sourceMeshes.delete(id);
      const replacement = replacements.get(id);
      if (replacement) {
        this.#sourceMeshes.set(id, replacement);
        if (this.ready && this.#recovering) {
          // Recovery must stay frame-budgeted even when edits arrive mid-restore.
          this.#recoveryQueue.set(id, replacement);
          this.#recoveryBytes += this.#meshBytes(replacement);
        } else if (this.ready && (this.#sceneQueue.size || this.#retiredGpuMeshes.length)) {
          // An edit cannot bypass pending full-scene uploads or GPU disposal.
          this.#sceneQueue.set(id, replacement);
          this.#sceneBytes += this.#meshBytes(replacement);
        } else if (this.ready) {
          this.#uploadOne(replacement);
        }
      }
    }
    return true;
  }

  setLabMaterialVolume({origin,size,data}){
    if(!this.ready)return;
    const gl=this.#gl;
    const volume=this.#labVolume??gl.createTexture();
    if(!volume)throw new Error('Could not allocate material lab volume');
    gl.activeTexture(gl.TEXTURE4);
    gl.bindTexture(gl.TEXTURE_3D,volume);
    gl.texParameteri(gl.TEXTURE_3D,gl.TEXTURE_MIN_FILTER,gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_3D,gl.TEXTURE_MAG_FILTER,gl.LINEAR);
    const previousAlignment=gl.getParameter(gl.UNPACK_ALIGNMENT);
    gl.pixelStorei(gl.UNPACK_ALIGNMENT,1);
    try{
      gl.texImage3D(gl.TEXTURE_3D,0,gl.R8,...size,0,gl.RED,gl.UNSIGNED_BYTE,data);
    }finally{gl.pixelStorei(gl.UNPACK_ALIGNMENT,previousAlignment);}
    this.#labVolume=volume;
    this.#labOrigin=origin;
  }

  #bindLightingField(field){
    const gl=this.#gl;
    gl.uniform1i(this.#uniforms.lightingField,6);
    gl.uniform1i(this.#uniforms.lightingEnabled,field?1:0);
    gl.uniform1i(this.#uniforms.lightingWarm,field?.hasEmission?1:0);
    const emission=field?.emission??[0,0,0];
    if(emission.length!==3||!emission.every(value=>Number.isFinite(value)&&value>=0&&value<=4)){
      throw new TypeError('Invalid material emission descriptor');
    }
    gl.uniform3fv(this.#uniforms.lightingEmissionColor,emission);
    if(!field)return;
    gl.activeTexture(gl.TEXTURE0+6);
    this.#lightingTexture??=gl.createTexture();
    if(!this.#lightingTexture)throw new Error('Could not allocate local light field');
    gl.bindTexture(gl.TEXTURE_2D,this.#lightingTexture);
    if(this.#lightingSource!==field){
      if(field.schema!=='wyrmforge.local-light-field.v2'||
          field.size?.[0]!==24||field.size?.[1]!==24||
          !(field.data instanceof Float32Array)||field.data.length!==24*24*4||
          !field.data.every(Number.isFinite)||field.origin?.length!==2||
          !field.origin.every(Number.isSafeInteger))throw new TypeError('Invalid bounded light field');
      gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MIN_FILTER,gl.NEAREST);
      gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MAG_FILTER,gl.NEAREST);
      gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_S,gl.CLAMP_TO_EDGE);
      gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_T,gl.CLAMP_TO_EDGE);
      gl.texImage2D(gl.TEXTURE_2D,0,gl.RGBA32F,24,24,0,gl.RGBA,gl.FLOAT,field.data);
      this.#lightingSource=field;
    }
    gl.uniform2f(this.#uniforms.lightingOrigin,...field.origin);
  }

  #bindHuntLava(surface){
    const gl=this.#gl;
    gl.uniform1i(this.#uniforms.huntLava,5);
    gl.uniform1i(this.#uniforms.huntLavaEnabled,surface?1:0);
    if(!surface)return;
    gl.activeTexture(gl.TEXTURE0+5);
    this.#huntLavaTexture??=gl.createTexture();
    if(!this.#huntLavaTexture)throw new Error('Could not allocate Hunt lava surface');
    gl.bindTexture(gl.TEXTURE_2D,this.#huntLavaTexture);
    if(this.#huntLavaSource!==surface){
      gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MIN_FILTER,gl.NEAREST);
      gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MAG_FILTER,gl.NEAREST);
      gl.texImage2D(gl.TEXTURE_2D,0,gl.RGBA8,...surface.size,0,gl.RGBA,gl.UNSIGNED_BYTE,surface.data);
      this.#huntLavaSource=surface;
    }
    gl.uniform2f(this.#uniforms.huntLavaOrigin,...surface.origin);
  }

  render({ width, height, scale, panX, panY, camera = 'inspection', huntHeightContrast = false, huntGrassArt = false, huntFadingStartZ = -1000, huntCorruption, huntElevationReference = 4, depthOrigin = 0,
    labBlend=true,labTime=0,labGrassStyle=0,labForestStage=0,huntLava,lightingField=null,lightingEnvironment=null,transientLights=null,pointVisibility=null }) {
    if (!this.ready || width <= 0 || height <= 0) return false;
    const gl = this.#gl;
    gl.viewport(0, 0, width, height);
    if(this.#transparentBackground)gl.clearColor(0,0,0,0);
    else gl.clearColor(16 / 255, 24 / 255, 32 / 255, 1);
    gl.clearDepth(1);
    gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
    gl.useProgram(this.#program);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, this.#grassTexture);
    gl.uniform1i(this.#uniforms.grassTexture, 0);
    gl.uniform1i(this.#uniforms.grassEnabled, this.#grassTexture ? 1 : 0);
    gl.uniform1i(this.#uniforms.fastHuntMode,this.#fastHuntMode?1:0);
    gl.uniform1i(this.#uniforms.huntHeightContrast,huntHeightContrast?1:0);
    gl.uniform1i(this.#uniforms.huntGrassArt,huntGrassArt?1:0);
    gl.uniform1f(this.#uniforms.huntFadingStartZ,huntFadingStartZ);
    gl.uniform3f(this.#uniforms.huntCorruption,huntCorruption?.progress??-1,huntCorruption?.ash??0,huntCorruption?.volcanic??0);
    gl.uniform1f(this.#uniforms.huntElevationReference,huntElevationReference);
    gl.uniform1f(this.#uniforms.grassDensity, this.#grassTexelsPerVoxel);
    const keys = ['terrain/grass', 'terrain/grass-soil-side', 'terrain/dirt', 'terrain/stone'];
    const layers = keys.map(key => {
      const variant = TERRAIN_SURFACE_LIBRARY[key].variants[0];
      return this.#terrainCache?.getLayer('albedo', variant.textures.albedo) ?? -1;
    });
    gl.activeTexture(gl.TEXTURE1);
    gl.bindTexture(gl.TEXTURE_2D_ARRAY, this.#terrainCache?.getTexture('albedo') ?? null);
    gl.uniform1i(this.#uniforms.terrainAlbedo, 1);
    gl.uniform4fv?.(this.#uniforms.terrainLayers, layers);
    for (const [channel, unit, sampler, locations] of [
      ['normal', 2, this.#uniforms.terrainNormal, this.#uniforms.terrainNormalLayers],
      ['orm', 3, this.#uniforms.terrainOrm, this.#uniforms.terrainOrmLayers]
    ]) {
      gl.activeTexture(gl.TEXTURE0 + unit);
      gl.bindTexture(gl.TEXTURE_2D_ARRAY, this.#terrainCache?.getTexture(channel) ?? null);
      gl.uniform1i(sampler, unit);
      const channelLayers = keys.map(key => {
        const variant = TERRAIN_SURFACE_LIBRARY[key].variants[0];
        return this.#terrainCache?.getLayer(channel, variant.textures[channel]) ?? -1;
      });
      gl.uniform4fv?.(locations, channelLayers);
      const secondLayers = keys.map(key => {
        const variant = TERRAIN_SURFACE_LIBRARY[key].variants[1];
        return variant ? (this.#terrainCache?.getLayer(channel, variant.textures[channel]) ?? -1) : -1;
      });
      const secondaryUniform = channel === 'normal'
        ? this.#uniforms.terrainSecondaryNormalLayers : this.#uniforms.terrainSecondaryOrmLayers;
      gl.uniform4fv?.(secondaryUniform, secondLayers);
    }
    const secondaryLayers = keys.map(key => {
      const variant = TERRAIN_SURFACE_LIBRARY[key].variants[1];
      return variant ? (this.#terrainCache?.getLayer('albedo', variant.textures.albedo) ?? -1) : -1;
    });
    gl.uniform4fv?.(this.#uniforms.terrainSecondaryLayers, secondaryLayers);
    gl.uniform1f(this.#uniforms.terrainScale, this.#terrainTilesPerVoxel);
    gl.uniform1i(this.#uniforms.labMaterials,4);
    gl.uniform1i(this.#uniforms.labEnabled,this.#labVolume&&!huntGrassArt?1:0);
    gl.uniform1i(this.#uniforms.huntGrassEdges,this.#labVolume&&huntGrassArt?1:0);
    if(this.#labVolume){
      gl.activeTexture(gl.TEXTURE4);
      gl.bindTexture(gl.TEXTURE_3D,this.#labVolume);
      gl.uniform3fv(this.#uniforms.labOrigin,this.#labOrigin);
      gl.uniform1i(this.#uniforms.labBlend,labBlend?1:0);
      gl.uniform1i(this.#uniforms.labGrassStyle,labGrassStyle);
      gl.uniform1i(this.#uniforms.labForestStage,labForestStage);
    }
    gl.uniform1f(this.#uniforms.labTime,labTime);
    this.#bindHuntLava(huntLava);
    if(lightingEnvironment&&lightingEnvironment.schema!==LIGHTING_ENVIRONMENT_SCHEMA){
      throw new TypeError('Unsupported lighting environment schema');
    }
    const ambient=lightingEnvironment?.ambient??[1,1,1];
    if(ambient.length!==3||!ambient.every(n=>Number.isFinite(n)&&n>=0&&n<=2)){
      throw new TypeError('Invalid lighting environment');
    }
    gl.uniform3fv(this.#uniforms.lightingAmbient,ambient);
    const transientCount=writeTransientLights(transientLights,this.#transientPositions,this.#transientRadiance);
    gl.uniform1i(this.#uniforms.transientCount,transientCount);
    if(transientCount){
      gl.uniform4fv(this.#uniforms.transientPositions,this.#transientPositions);
      gl.uniform3fv(this.#uniforms.transientRadiance,this.#transientRadiance);
    }
    const visible=transientCount>0&&writePointVisibility(pointVisibility,transientLights,this.#pointVisibilityUpload);
    gl.uniform1i(this.#uniforms.pointVisibilityEnabled,visible?1:0);
    if(visible)gl.uniform1fv(this.#uniforms.pointVisibilityDistances,this.#pointVisibilityUpload);
    this.#bindLightingField(lightingField);
    gl.uniform2f(this.#uniforms.viewport, width, height);
    gl.uniform2f(this.#uniforms.pan, panX, panY);
    gl.uniform1f(this.#uniforms.scale, scale);
    const basis = getCameraPreset(camera);
    gl.uniform3fv(this.#uniforms.cameraRight, basis.right);
    gl.uniform3fv(this.#uniforms.cameraDown, basis.down);
    gl.uniform3fv(this.#uniforms.cameraDepth, basis.depth);
    gl.uniform1f(this.#uniforms.depthOrigin, depthOrigin);
    for (const mesh of this.#gpuMeshes.values()) {
      gl.uniform3fv(this.#uniforms.origin, mesh.origin);
      gl.bindVertexArray(mesh.vao);
      gl.drawElements(gl.TRIANGLES, mesh.count, gl.UNSIGNED_INT, 0);
    }
    gl.bindVertexArray(null);
    return true;
  }

  dispose() {
    this.cancelQueuedUploads();
    this.#recoveryQueue.clear();
    this.#recoveryBytes = 0;
    this.#sceneQueue.clear();
    this.#sceneBytes = 0;
    this.#recovering = false;
    this.#discardGpuMeshes();
    // Explicit disposal is terminal: release any delayed old-scene buffers now.
    for (const record of this.#retiredGpuMeshes) this.#disposeRecord(record);
    this.#retiredGpuMeshes.length = 0;
    this.#retiredGpuBytes = 0;
    if (this.#grassTexture && !this.#lost) this.#gl.deleteTexture(this.#grassTexture);
    this.#grassTexture = null;
    if(this.#labVolume&&!this.#lost)this.#gl.deleteTexture(this.#labVolume);
    this.#labVolume=null;
    if(this.#lightingTexture&&!this.#lost)this.#gl.deleteTexture(this.#lightingTexture);
    this.#lightingTexture=null;this.#lightingSource=null;
    if(this.#huntLavaTexture&&!this.#lost)this.#gl.deleteTexture(this.#huntLavaTexture);
    this.#huntLavaTexture=null;
    this.#huntLavaSource=null;
    this.#terrainCache?.dispose();
    this.#terrainCache = null;
    this.#terrainTileImages.clear();
    this.#pendingTerrainTiles.clear();
    this.#terrainTileStagingBytes = 0;
    if (this.#program && !this.#lost) this.#gl.deleteProgram(this.#program);
    this.#program = null;
    this.#sourceMeshes.clear();
  }
}
