// LAVA-02 presentation only: grounded flowing basalt / crust / fracture art.
// Consumes an actual fluid face, published horizontal velocity and fixed-step
// animation time. It does not author heat, solid rocks, collisions or lava
// volume. See docs/research/lava-v2-50-source-field-study.md (50 sources).
//
// Mobile rule: integer pixel grid, three small uint hashes, no sine noise,
// iterative Voronoi, lighting raycasts, texture sampling or framebuffer passes.
// Spatial plate motifs move together at 0.1m every ~1.8s in flowing cells.
export const LAVA_CRUST_FLOW_GLSL=`
float lavaCrustHash(ivec2 pixel){
  uint h=uint(pixel.x)*1664525u^uint(pixel.y)*1013904223u;
  h^=h>>16u;
  h*=2246822519u;
  h^=h>>13u;
  return float(h&1023u)/1023.0;
}

vec3 nativeLavaCrust(vec3 world,vec2 actualFlow,int faceMode,
    float landingY,float seconds){
  bool isFall=faceMode==2||faceMode==4||faceMode==6;
  bool isSplash=faceMode==5;
  bool isLip=faceMode==3;
  float moving=step(.5,length(actualFlow));
  vec2 direction=moving>.5?normalize(actualFlow):vec2(.8,.6);
  vec2 across=vec2(-direction.y,direction.x);
  // Slow, synchronized downstream motion from the REAL solver direction.
  // Reusing the same plate domain on each 10cm face prevents one-metre seams
  // and random frame-to-frame "sparkle" jumps.
  vec2 pixels=floor(world.xz*10.0);
  pixels-=direction*floor(seconds*.55)*moving;
  vec2 plateSpace=vec2(dot(pixels,direction),dot(pixels,across));
  ivec2 plate=ivec2(floor(plateSpace/vec2(13.0,10.0)));
  float stoneId=lavaCrustHash(plate);
  float offset=lavaCrustHash(plate+ivec2(11,7));
  vec2 local=fract((plateSpace+vec2(1.2*stoneId,1.6*offset))/
    vec2(13.0,10.0));
  // Plates are stretched along flow and staggered by their neighbours.
  // Bright fissures reveal exposed melt where independent cooled plates meet.
  float seamDistance=min(min(local.x,1.0-local.x),
                         min(local.y,1.0-local.y));
  float fracture=1.0-step(.082,seamDistance);
  float smallGrain=lavaCrustHash(ivec2(floor(plateSpace/vec2(3.0,4.0))));
  // Broad dark rafting over liquid; still eddies carry *more* visible crust
  // than the newly exposed, actively moving central channel.
  float plateCover=step(mix(.22,.43,moving),stoneId);
  float plateShade=.65+.35*smallGrain;
  vec3 cooled=vec3(.085,.071,.075)*plateShade+
    vec3(.065,.026,.014)*(1.0-plateShade);
  vec3 lowMelt=vec3(.42,.075,.022);
  vec3 warmMelt=vec3(.83,.23,.027);
  vec3 exposed=vec3(1.0,.61,.15);
  vec3 melt=mix(lowMelt,warmMelt,.45+.35*smallGrain);
  vec3 color=mix(melt,cooled,plateCover*.94);
  // Dark iron-red hairline around glowing molten crack, with a rare
  // incandescent center. No full-surface random orange polka dots.
  float warmEdge=1.0-step(.20,seamDistance);
  color=mix(color,vec3(.37,.065,.023),warmEdge*.60);
  color=mix(color,vec3(.94,.30,.038),fracture*.88);
  color=mix(color,exposed,fracture*step(.77,smallGrain)*.42);
  // Flowing lava exposes fresh orange strips and can fold dark skin under.
  // These are genuine top-face pixels, not hot source painted on dry rock.
  float breakout=step(.92,smallGrain)*moving*(1.0-plateCover*.6);
  color=mix(color,warmMelt,breakout*.46);
  if(isLip){
    color=mix(color,exposed,.38);
  }
  if(isFall){
    // A real waterfall or in-flight packet is not cooled like a quiet
    // horizontal lake. Give it a hot center with sparse dragged crust.
    float fallingStripe=step(.73,smallGrain);
    color=mix(vec3(.68,.15,.021),vec3(1.0,.45,.075),
      .36+.42*fallingStripe);
    if(faceMode==4){
      float drop=clamp((world.y-landingY)/2.5,0.0,1.0);
      color=mix(color,vec3(1.0,.68,.18),.13+.15*(1.0-drop));
    }
  }else if(isSplash){
    // Only physically landed molten parcels generate a visible hot tongue.
    color=mix(warmMelt,exposed,.42+.2*smallGrain);
  }
  return color;
}
`;
