// LAVA-02: physically fed molten lava with slow, world-continuous crust.
// Thin dark plates, iron-red fracture margins and bright new breakouts are
// rooted in field imagery (see the 50-source annotated geology review).
// This is Materials-owned presentation, not collidable solidification.
// Keep mobile work bounded: two constant 32x24 pixel-mask reads, one uint
// hash, no per-fragment sin/cos/noise, rays, lookups or dynamic buffers.
import {lavaCrustMotifGlsl} from '../fire-lava-crust-art.mjs';

export const LAVA_CRUST_FLOW_GLSL=`
${lavaCrustMotifGlsl()}

float lavaCrustHash(ivec2 pixel){
  uint h=uint(pixel.x)*1664525u^uint(pixel.y)*1013904223u;
  h^=h>>16u;
  h*=2246822519u;
  h^=h>>13u;
  return float(h&1023u)/1023.0;
}

int lavaCrustBand(ivec2 pixel){
  // Original 4m x 3m hand-authored ropy/plate motif. Mirror neighboring
  // tiles so the artwork does not reset at every metre or expose a grid.
  ivec2 tile=ivec2(floor(vec2(pixel)/vec2(32.0,24.0)));
  int x=int(mod(float(pixel.x),32.0));
  int y=int(mod(float(pixel.y),24.0));
  if((tile.x&1)!=0)x=31-x;
  if((tile.y&1)!=0)y=23-y;
  return int((FIRE_LAVA_CRUST[y][x/8]>>uint(3*(x%8)))&7u);
}

vec3 nativeLavaCrust(vec3 world,vec2 actualFlow,vec2 channelFlow,
    int faceMode,float landingY,float seconds){
  bool fall=faceMode==2||faceMode==4||faceMode==6;
  bool splash=faceMode==5;
  bool lip=faceMode==3;
  // One stable direction from the real connected channel drives ALL
  // adjacent pixels. Never reorient plates per 1m solver column: doing so
  // gave the iPhone a checkerboard of orange square edges.
  vec2 axis=length(channelFlow)>.5?normalize(channelFlow):vec2(0.0,1.0);
  float current=step(.5,length(actualFlow));
  // Around 5 pixels/metre: large ~6m crust features rather than repeated
  // 1m emoji-like orange islands. The whole river scrolls slowly together.
  vec2 pixels=floor(world.xz*5.0)-axis*floor(seconds*.42);
  ivec2 p=ivec2(floor(pixels));
  int outer=lavaCrustBand(p);
  int inner=lavaCrustBand(p+ivec2(11,8));
  float pigment=lavaCrustHash(ivec2(floor(vec2(p)/vec2(14.0,17.0))));
  bool plate=outer==0||inner==0||
    (outer==2&&inner==2&&pigment<.64);
  bool fracture=outer==1||(inner==1&&outer==2);
  bool exposed=outer==3||(inner==3&&outer==2);
  // Most of the surface is a dark rafts/iron-red melt, NOT a uniformly
  // incandescent orange sheet. Thin fractures expose hot moving interior.
  vec3 blackBasalt=mix(vec3(.095,.079,.081),vec3(.19,.13,.114),pigment);
  vec3 redMelt=mix(vec3(.28,.052,.022),vec3(.67,.15,.026),
      .28+.40*pigment+.08*current);
  vec3 color=plate?blackBasalt:redMelt;
  if(fracture)color=mix(color,vec3(.89,.24,.034),.72);
  if(exposed)color=mix(color,vec3(1.0,.58,.11),.88);
  if(outer==2&&inner==2&&pigment>.94){
    color=mix(color,vec3(.92,.28,.04),.36);
  }
  if(lip){
    color=mix(color,vec3(1.0,.45,.08),.30);
  }
  if(fall){
    // Only real falling faces/in-flight units glow through a torn crust.
    // Dark flecks still ride on a hot falling sheet. The previous uniform
    // orange vertical wall looked like a rectangular 1m material slab.
    vec3 melt=mix(vec3(.72,.13,.025),vec3(1.0,.47,.072),
      .36+.34*pigment);
    color=mix(color,melt,.52);
    if(faceMode==4){
      float drop=clamp((world.y-landingY)/2.5,0.0,1.0);
      color=mix(color,vec3(1.0,.64,.13),.08+.12*(1.0-drop));
    }
  }else if(splash){
    color=mix(vec3(.83,.20,.026),vec3(1.0,.63,.13),.42+.22*pigment);
  }
  return color;
}
`;
