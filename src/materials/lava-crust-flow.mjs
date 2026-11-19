// LAVA-02: actual molten face -> one seamless, mobile-cost-bound atlas lookup.
// See lava-crust-atlas.mjs and the 50-source study. This is Materials-only:
// the shader cannot create wet cells, cool physical solids or edit WorldGen.
import {LAVA_CRUST_ATLAS_SIZE} from './lava-crust-atlas.mjs';

export const LAVA_CRUST_FLOW_GLSL=`
uniform sampler2D uLavaCrustAtlas;

vec3 nativeLavaCrust(vec3 world,vec2 actualFlow,vec2 channelFlow,
    int faceMode,float landingY,float seconds){
  bool falling=faceMode==2||faceMode==4||faceMode==6;
  bool landing=faceMode==5;
  bool lip=faceMode==3;
  // ONE stable aggregate direction for all neighboring true wet columns.
  // Crust drifts only 10cm per ~1.8s. Never reset its UV at a 1m cell edge.
  vec2 axis=length(channelFlow)>.5?normalize(channelFlow):vec2(0.0,1.0);
  vec2 worldPixel=floor(world.xz*10.0-axis*floor(seconds*.55));
  // GLSL mod works on negative world coordinates, unlike integer remainder.
  ivec2 pixel=ivec2(mod(worldPixel,${LAVA_CRUST_ATLAS_SIZE}.0));
  vec3 color=texelFetch(uLavaCrustAtlas,pixel,0).rgb;
  // A genuinely moving molten column shows a little more red heat while a
  // quiet lake grows a darker raft skin. No physically fake water over rock.
  float moving=step(.5,length(actualFlow));
  color=mix(color,vec3(.67,.12,.022),moving*.06);
  if(lip){
    color=mix(color,vec3(1.0,.42,.065),.30);
  }
  if(falling){
    // Falling/airborne actual lava stays hotter than its horizontal crust.
    // Keep SOME dark-raft texture: uniform orange slabs looked like opaque
    // metre-wide walls, not molten rock.
    vec3 hot=vec3(.86,.23,.035);
    color=mix(color,hot,.48);
    if(faceMode==4){
      float drop=clamp((world.y-landingY)/2.5,0.0,1.0);
      color=mix(color,vec3(1.0,.59,.105),.08+.10*(1.0-drop));
    }
  }else if(landing){
    color=mix(color,vec3(1.0,.53,.08),.64);
  }
  return color;
}
`;
