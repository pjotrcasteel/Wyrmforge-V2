import {SURFACE_GLSL} from '../materials/surface-contract.mjs';
import {terrainColorTransferGlsl} from '../terrain-color-space.mjs';
import {TRANSIENT_LIGHTING_GLSL,writeTransientLights} from '../lighting/transient-lighting.mjs';
import {LIGHTING_ENVIRONMENT_SCHEMA} from '../lighting/environment-contract.mjs';
import {MOLTEN_DISPLAY_GLSL} from '../materials/molten-presentation.mjs';
import {LAVA_CRUST_FLOW_GLSL} from '../materials/lava-crust-flow.mjs';
import {
  buildLavaCrustAtlas,LAVA_CRUST_ATLAS_BYTES,LAVA_CRUST_ATLAS_SIZE
} from '../materials/lava-crust-atlas.mjs';
import {STATIC_FIELD_EMISSION_GLSL} from '../lighting/static-field-shader.mjs';
import {writePointVisibility,POINT_VISIBILITY_FLOATS} from '../lighting/point-light-visibility.mjs';
// Independent Water V2 WebGL2 presentation: real liquid top caps and exposed
// side faces at the solver's 10cm levels, depth-tested against Voxel geometry.
// Uses one small program/VAO. Never writes voxels or changes terrain textures.
import {getCameraPreset} from '../camera-presets.mjs';
import {waterRippleMotifGlsl} from '../river-water-art.mjs';
import {buildFluidSurfaceMesh} from './fluid-surface-mesh.mjs';
import {stabilizeFluidSurface} from './fluid-surface-stabilizer.mjs';

export const FLUID_VERTEX_GLSL=`#version 300 es
precision highp float;
layout(location=0) in vec3 aPosition;
layout(location=1) in vec3 aNormal;
layout(location=2) in vec2 aFlow;
layout(location=3) in float aFaceMode;
layout(location=4) in float aLandingY;
uniform vec2 uViewport;
uniform vec2 uPan;
uniform float uScale;
uniform float uDepthOrigin;
uniform vec3 uCameraRight;
uniform vec3 uCameraDown;
uniform vec3 uCameraDepth;
out vec3 vWorld;
out vec3 vNormal;
out vec2 vFlow;
flat out int vFaceMode;
out float vLandingY;
out vec3 vStaticIrradiance;
${STATIC_FIELD_EMISSION_GLSL}
void main(){
  vec3 world=aPosition;
  // Vertex-side lookups: four cells per vertex, never per foam/glint pixel.
  vStaticIrradiance=staticFieldIrradiance(world);
  vec2 pixel=vec2(dot(world,uCameraRight),dot(world,uCameraDown))*uScale
    +uViewport*.5+uPan;
  gl_Position=vec4(pixel.x*2.0/uViewport.x-1.0,
    1.0-pixel.y*2.0/uViewport.y,
    dot(world,uCameraDepth)-uDepthOrigin,1.0);
  vWorld=world;
  vNormal=aNormal;
  vFlow=aFlow;
  vFaceMode=int(aFaceMode+.5);
  vLandingY=aLandingY;
}
`;

export const FLUID_FRAGMENT_GLSL=`#version 300 es
precision highp float;
in vec3 vWorld;
in vec3 vNormal;
in vec2 vFlow;
flat in int vFaceMode;
in float vLandingY;
in vec3 vStaticIrradiance;
uniform float uTime;
uniform float uRippleFrame;
uniform float uRippleFade;
uniform float uLava;
uniform vec2 uLavaChannelFlow;
uniform float uRibbonEnabled;
uniform float uLandingEnabled;
uniform float uParcelsEnabled;
out vec4 outColor;
${waterRippleMotifGlsl()}
${MOLTEN_DISPLAY_GLSL}
${LAVA_CRUST_FLOW_GLSL}
${terrainColorTransferGlsl()}
${SURFACE_GLSL}
${TRANSIENT_LIGHTING_GLSL}
uniform vec3 uLightingAmbient;
vec3 litFluidColor(vec3 color){
  vec3 albedo=srgbToLinearColor(color);
  if(uTransientLightCount==0&&all(equal(uLightingAmbient,vec3(1.0)))&&
      (uLava>.5||length(vStaticIrradiance)<.00001))return color;
  V2Surface surface=V2Surface(albedo,vNormal,vNormal,vec3(1.0,1.0,0.0),vec3(0.0),false,false);
  vec3 spell=transientIrradiance(surface,vWorld);
  if(uLava>.5){
    // Authored molten palette is predominantly self-emissive. Let the same
    // environment shade its darker detail, without doubling its own spill.
    return linearToSrgbColor(albedo*mix(vec3(1.0),uLightingAmbient,.18)+spell*.12);
  }
  // Actual Water, foam, sidewalls and falling parcels share the terrain's
  // 24x24 occlusion-aware source, interpolated at physical vertex heights.
  return linearToSrgbColor(albedo*(uLightingAmbient+vStaticIrradiance)+spell);
}
float fluidHash(vec2 point){
  return fract(sin(dot(point,vec2(127.1,311.7)))*43758.5453);
}
void main(){
  if(vFaceMode==4&&uRibbonEnabled<.5)discard;
  if(vFaceMode==5&&uLandingEnabled<.5)discard;
  if(vFaceMode==6&&uParcelsEnabled<.5)discard;
  if(uLava>.5){
    // LAVA-02: hot channels carry floating dark crust plates with glowing
    // moving fractures. All coordinates come from real solver-wet geometry.
    // This EARLY branch skips the expensive water ripple lookup entirely,
    // rather than doing water fragment work before drawing any lava.
    vec3 molten=nativeLavaCrust(vWorld,vFlow,uLavaChannelFlow,
      vFaceMode,vLandingY,uTime);
    outColor=vec4(litFluidColor(molten),vFaceMode==5?.90:.995);
    return;
  }
  // Only WATER below this point: pixel glints on real wet geometry.
  vec2 pixel=floor(vWorld.xz*8.0);
  // This fade is shared by all water pixels. JS computes it ONCE per draw,
  // avoiding expensive per-fragment smoothstep work on weak GPUs/software GL.
  float frame=uRippleFrame;
  float rippleFade=uRippleFade;
  vec2 downstream=length(vFlow)>0.0?normalize(vFlow):vec2(0.0);
  ivec2 moving=ivec2(floor(pixel-downstream*frame));
  int col=int(mod(float(moving.x),32.0));
  int row=int(mod(float(moving.y),16.0));
  int ripple=int((HUNT_WATER_RIPPLES[row][col/8]>>uint(3*(col%8)))&7u);
  float pool=fluidHash(floor(vWorld.xz*.25)+31.0);
  float top=step(0.5,vNormal.y);
  if(vFaceMode==6){
    // These droplets are actual reserved fluid units between the upper
    // source and lower destination. Their world-space Y changes in the
    // solver snapshot, rather than being a shader-only simulated fall.
    vec2 p=floor(vWorld.xz*10.0);
    float variation=fluidHash(p+floor(vWorld.y*10.0));
    vec3 drop=uLava<.5
      ?mix(vec3(.25,.53,.54),vec3(.63,.81,.76),.35+.35*variation)
      :mix(vec3(.77,.22,.02),vec3(1.0,.65,.17),.35+.35*variation);
    outColor=vec4(litFluidColor(drop),uLava<.5?.88:.95);
    return;
  }
  if(vFaceMode==5){
    // Landing foam only exists where the physical river actually discharges
    // into a wet lower pool. Sparse cap pixels travel with the flow rather
    // than stamping a bright circle across every waterfall or still basin.
    float stamp=fluidHash(floor(vWorld.xz*10.0)+vec2(19.0,73.0));
    float pace=uLava<.5?.9:.45;
    float tumble=fract(uTime*pace+stamp*.48);
    float sparkle=smoothstep(.08,.28,tumble)*
      (1.0-smoothstep(.68,.9,tumble));
    float strong=step(.62,stamp);
    vec3 foam=uLava<.5
      ?mix(vec3(.40,.65,.64),vec3(.71,.83,.78),.35+.55*strong)
      :mix(vec3(.83,.32,.07),vec3(1.0,.74,.24),.35+.55*strong);
    outColor=vec4(litFluidColor(foam),(uLava<.5?.64:.78)*mix(.6,1.0,sparkle));
    return;
  }
  vec3 color;
  float opacity;
  {
    vec3 deep=vec3(.075,.28,.32);
    vec3 shallow=vec3(.22,.49,.44);
    color=mix(deep,shallow,.36+.24*pool);
    // Still pools do not blink; only a real moving downstream flow shifts
    // water glints. Moving glints fade out at each 8px grid transition so
    // they never teleport and look like water-surface jitter.
    float movingGlint=length(downstream)>.001?rippleFade:.65;
    if(ripple==3)color=mix(color,vec3(.29,.55,.54),.25*movingGlint);
    if(ripple==1)color=mix(color,vec3(.35,.61,.58),.48*movingGlint);
    if(ripple==2)color=mix(color,vec3(.45,.69,.64),.72*movingGlint);
    color*=mix(.87,1.0,top);
    if(vFaceMode==2) {
      // A real downstream wet column is lower. Vertical, pixel-quantized
      // light strokes follow the falling sheet, never a generic pool wall.
      vec2 across=vec2(-downstream.y,downstream.x);
      float strip=floor(dot(vWorld.xz,across)*10.0);
      float phase=fract(uTime*.7+
        fluidHash(vec2(strip,91.0))*.75+.2*vWorld.y);
      float bead=smoothstep(.03,.17,phase)*
        (1.0-smoothstep(.42,.67,phase));
      color=mix(color,vec3(.47,.68,.65),.14+.10*bead);
      float landing=1.0-smoothstep(.02,.35,vWorld.y-vLandingY);
      color=mix(color,vec3(.57,.74,.69),landing*.4);
    } else if(vFaceMode==4) {
      // True outward fall bridge, visible from the normal north-up Hunt
      // camera where a cliff-flush vertical sheet can be depth-occluded.
      // Quantize moving highlights to the Wyrmforge 10cm pixel grid.
      float fall=clamp((vWorld.y-vLandingY)/2.5,0.0,1.0);
      float acrossLane=floor(dot(vWorld.xz,
        vec2(-downstream.y,downstream.x))*5.0);
      // Continuous phase anchored to world coordinates, not a different
      // random flash for each one-metre waterfall column on every frame.
      float phase=fract(uTime*.7+
        fluidHash(vec2(acrossLane,37.0))*.6-.25*vWorld.y);
      float line=smoothstep(.08,.22,phase)*
        (1.0-smoothstep(.55,.78,phase));
      color=mix(color,vec3(.46,.67,.65),.33+.18*(1.0-fall));
      color=mix(color,vec3(.67,.79,.73),line*.10);
    } else if(vFaceMode==3) {
      // Subtle broken glint at the lip, not a bright 1m-wide foam stripe.
      vec2 local=fract(vWorld.xz);
      float distanceToEdge=abs(downstream.x)>abs(downstream.y)
        ?(downstream.x>0.0?1.0-local.x:local.x)
        :(downstream.y>0.0?1.0-local.y:local.y);
      float lip=1.0-smoothstep(.0,.16,distanceToEdge);
      color=mix(color,vec3(.55,.72,.67),lip*.30);
    }
    // Prevent the old terrain decal from showing through as hard dark
    // blocks at excavation boundaries, while keeping slight depth blending.
    opacity=mix(.975,.94,top);
  }
  outColor=vec4(litFluidColor(color),opacity);
}
`;

function shader(gl,type,source){
  const value=gl.createShader(type);
  if(!value)throw new Error('Fluid shader allocation failed');
  gl.shaderSource(value,source);
  gl.compileShader(value);
  if(!gl.getShaderParameter(value,gl.COMPILE_STATUS)){
    const error=gl.getShaderInfoLog(value)||'unknown shader error';
    gl.deleteShader(value);
    throw new Error('Fluid shader compilation failed: '+error);
  }
  return value;
}

function program(gl){
  const a=shader(gl,gl.VERTEX_SHADER,FLUID_VERTEX_GLSL);
  const b=shader(gl,gl.FRAGMENT_SHADER,FLUID_FRAGMENT_GLSL);
  const result=gl.createProgram();
  if(!result){gl.deleteShader(a);gl.deleteShader(b);throw new Error('Fluid program allocation failed');}
  gl.attachShader(result,a);
  gl.attachShader(result,b);
  gl.linkProgram(result);
  gl.deleteShader(a);
  gl.deleteShader(b);
  if(!gl.getProgramParameter(result,gl.LINK_STATUS)){
    const error=gl.getProgramInfoLog(result)||'unknown link error';
    gl.deleteProgram(result);
    throw new Error('Fluid shader link failed: '+error);
  }
  return result;
}

// Equal, non-animated GPU geometry does not need another upload. Compare
// binary typed-array contents (including real 10cm heights and flow modes).
const sameGeometry=(a,b)=>{
  if(!a||!b)return false;
  for(const name of ['positions','normals','flows','faceModes',
    'landingHeights','indices']){
    const left=a[name],right=b[name];
    if(left.byteLength!==right.byteLength)return false;
    const l=new Uint8Array(left.buffer,left.byteOffset,left.byteLength);
    const r=new Uint8Array(right.buffer,right.byteOffset,right.byteLength);
    for(let i=0;i<l.length;i++)if(l[i]!==r[i])return false;
  }
  return true;
};

// Advance the pixel-art ripple animation with a continuous brightness
// envelope. Hoisted from GLSL so it is evaluated once per WebGL draw.
export function fluidRippleTiming(time){
  if(!Number.isFinite(time))throw new TypeError('Fluid animation time must be finite');
  const cycle=time*.65;
  const phase=cycle-Math.floor(cycle);
  const smooth=(a,b,x)=>{
    const f=Math.max(0,Math.min(1,(x-a)/(b-a)));
    return f*f*(3-2*f);
  };
  return {
    frame:Math.floor(cycle),
    fade:smooth(0,.22,phase)*(1-smooth(.78,1,phase))
  };
}

const fluidStreams=mesh=>[
  mesh.positions,mesh.normals,mesh.flows,
  mesh.faceModes,mesh.landingHeights,mesh.indices
];
const fluidCapacity=bytes=>Math.ceil(Math.max(4096,bytes*1.25)/4096)*4096;

export class HuntFluidSurfaceRenderer {
  #gl;
  #program=null;
  #lightPositions=new Float32Array(8);
  #lightRadiance=new Float32Array(6);
  // The same completed 2-light, 2-height, 12-sector visibility snapshot as terrain.
  // Uniform-only: no extra Voxel raycasts or visibility providers in Water.
  #pointVisibilityUpload=new Float32Array(POINT_VISIBILITY_FLOATS);
  #pointVisibilityActive=false;
  #pointVisibilityFrames=0;
  #lightingTexture=null;
  #lavaAtlasTexture=null;
  #lightingSource=null;
  #lightingUploads=0;
  #lightingUploadMs=0;
  #uniforms=null;
  #record=null;
  #mesh=null;
  // Stable renderer-only direction: adjoining 1m cells share ONE flow axis.
  #lavaFlowAxis=new Float32Array([0,1]);
  #visualHistory=new Map();
  #meshUpdateMs=0;
  #meshUpdateCount=0;
  #gpuAllocations=0;
  #gpuDeletes=0;
  #gpuUploadMs=0;
  #gpuUploadCount=0;
  #lost=false;
  #disposed=false;
  #onLost;
  #onRestored;

  constructor(canvas){
    if(!canvas||typeof canvas.getContext!=='function')throw new TypeError('Expected WebGL2 canvas');
    const gl=canvas.getContext('webgl2');
    if(!gl)throw new Error('Fluid surface requires the existing WebGL2 renderer');
    this.#gl=gl;
    this.#onLost=()=>{this.#lost=true;this.#record=null;this.#program=null;this.#uniforms=null;
      this.#pointVisibilityActive=false;
      this.#lightingTexture=null;this.#lavaAtlasTexture=null;
      this.#lightingSource=null;};
    this.#onRestored=()=>{this.#lost=false;this.#record=null;this.#program=null;this.#uniforms=null;
      this.#pointVisibilityActive=false;
      this.#lightingTexture=null;this.#lightingSource=null;};
    canvas.addEventListener('webglcontextlost',this.#onLost);
    canvas.addEventListener('webglcontextrestored',this.#onRestored);
    this.canvas=canvas;
  }

  get stats(){
    return Object.freeze({
      wetFaces:this.#mesh?.faceCount??0,
      topFaces:this.#mesh?.topFaces??0,
      sideFaces:this.#mesh?.sideFaces??0,
      waterfallFaces:this.#mesh?.waterfallFaces??0,
      fallRibbonFaces:this.#mesh?.fallRibbonFaces??0,
      waterfallGroups:this.#mesh?.waterfallGroups??0,
      maxWaterfallWidth:this.#mesh?.maxWaterfallWidth??0,
      landingSplashFaces:this.#mesh?.landingSplashFaces??0,
      flightFaces:this.#mesh?.flightFaces??0,
      fallLipFaces:this.#mesh?.fallLipFaces??0,
      wetColumns:this.#mesh?.wetColumns??0,
      refinedShoreColumns:this.#mesh?.refinedShoreColumns??0,
      cpuMeshBytes:this.#mesh?this.#mesh.positions.byteLength+
        this.#mesh.normals.byteLength+this.#mesh.flows.byteLength+
        this.#mesh.faceModes.byteLength+this.#mesh.landingHeights.byteLength+
        this.#mesh.indices.byteLength:0,
      uploadedTriangles:this.#record?.count?this.#record.count/3:0,
      surfaceStep:this.#mesh?.step??null,
      meshUpdateMs:this.#meshUpdateMs,
      meshUpdateCount:this.#meshUpdateCount,
      gpuAllocations:this.#gpuAllocations,
      gpuDeletes:this.#gpuDeletes,
      gpuUploadMs:this.#gpuUploadMs,
      gpuUploadCount:this.#gpuUploadCount,
      gpuAllocatedBytes:this.#record?.capacities.reduce(
        (sum,bytes)=>sum+bytes,0)??0,
      lightingTextureBytes:this.#lightingTexture?24*24*4*4:0,
      lavaAtlasBytes:this.#lavaAtlasTexture?LAVA_CRUST_ATLAS_BYTES:0,
      lightingUploads:this.#lightingUploads,
      lightingUploadMs:this.#lightingUploadMs,
      pointVisibilityActive:this.#pointVisibilityActive,
      pointVisibilityFrames:this.#pointVisibilityFrames
    });
  }

  // Pixel-based browser acceptance can isolate the waterfall ribbon and
  // its lower-pool landing separately, without changing the simulation.
  // Browser visual QA only: the actual physical wet upper faces, never a
  // hand-drawn region around the lava. Keep this out of the gameplay path.
  projectedCapBounds(view){
    return [...this.#projectedModeBounds(view,0),
      ...this.#projectedModeBounds(view,3)];
  }

  projectedRibbonBounds(view){
    return this.#projectedModeBounds(view,4);
  }

  projectedLandingBounds(view){
    return this.#projectedModeBounds(view,5);
  }

  projectedParcelBounds(view){
    return this.#projectedModeBounds(view,6);
  }

  projectedFlightBounds(view){
    return this.#projectedModeBounds(view,6);
  }

  #projectedModeBounds(view,mode){
    if(!this.#mesh||!view)return [];
    const basis=getCameraPreset(view.camera);
    const bounds=[];
    for(let vertex=0;vertex<this.#mesh.vertexCount;vertex+=4){
      if(this.#mesh.faceModes[vertex]!==mode)continue;
      let left=Infinity,top=Infinity,right=-Infinity,bottom=-Infinity;
      for(let i=vertex;i<vertex+4;i++){
        const x=this.#mesh.positions[i*3];
        const y=this.#mesh.positions[i*3+1];
        const z=this.#mesh.positions[i*3+2];
        const px=(x*basis.right[0]+y*basis.right[1]+z*basis.right[2])*
          view.scale+view.width*.5+view.panX;
        const py=(x*basis.down[0]+y*basis.down[1]+z*basis.down[2])*
          view.scale+view.height*.5+view.panY;
        left=Math.min(left,px);
        right=Math.max(right,px);
        top=Math.min(top,py);
        bottom=Math.max(bottom,py);
      }
      left=Math.max(0,Math.floor(left));
      right=Math.min(view.width,Math.ceil(right));
      top=Math.max(0,Math.floor(top));
      bottom=Math.min(view.height,Math.ceil(bottom));
      if(right>left&&bottom>top)bounds.push({left,top,right,bottom});
    }
    return bounds;
  }

  #releaseBuffers(){
    if(this.#record&&!this.#lost&&!this.#gl.isContextLost()){
      this.#gl.deleteVertexArray(this.#record.vao);
      for(const buffer of this.#record.buffers){
        this.#gl.deleteBuffer(buffer);
        this.#gpuDeletes++;
      }
    }
    this.#record=null;
  }

  #releaseLightingTexture(){
    if(this.#lightingTexture&&!this.#lost&&!this.#gl.isContextLost()){
      this.#gl.deleteTexture(this.#lightingTexture);
    }
    this.#lightingTexture=null;
    this.#lightingSource=null;
  }

  clear(){
    if(this.#disposed)return;
    this.#releaseBuffers();
    this.#releaseLightingTexture();
    this.#pointVisibilityActive=false;
    this.#pointVisibilityFrames=0;
    this.#mesh=null;
    this.#lavaFlowAxis[0]=0;
    this.#lavaFlowAxis[1]=1;
    this.#visualHistory.clear();
  }

  update(surface,sampleAt){
    if(this.#disposed)throw new Error('Fluid renderer disposed');
    if(surface?.kind==='lava'&&this.#mesh?.kind!=='lava'){
      // Sample actual molten channel direction ONCE. Using a different
      // direction per 1m cap produced bright geometric checkerboard seams.
      let x=0,z=0;
      for(const cell of surface.cells){
        x+=cell.currentX??cell.flowX??0;
        z+=cell.currentZ??cell.flowZ??0;
      }
      if(x*x+z*z<.25){
        const first=surface.cells.find(cell=>cell.flowX||cell.flowZ);
        x=first?.flowX??0;
        z=first?.flowZ??1;
      }
      const length=Math.hypot(x,z)||1;
      this.#lavaFlowAxis[0]=x/length;
      this.#lavaFlowAxis[1]=z/length;
    }
    const start=performance.now();
    const presented=stabilizeFluidSurface(surface,sampleAt,this.#visualHistory);
    const mesh=buildFluidSurfaceMesh(presented.surface,{
      sampleAt:presented.sampleAt
    });
    const bytes=mesh.positions.byteLength+mesh.normals.byteLength+mesh.flows.byteLength+
      mesh.faceModes.byteLength+mesh.landingHeights.byteLength+mesh.indices.byteLength;
    if(bytes>2*1024*1024)throw new RangeError('Fluid surface GPU upload exceeds 2MiB');
    if(!sameGeometry(mesh,this.#mesh)&&this.#record&&
        !this.#lost&&!this.#gl.isContextLost()){
      this.#uploadReusableMesh(mesh);
    }
    this.#mesh=mesh;
    this.#visualHistory=presented.history;
    this.#meshUpdateMs=performance.now()-start;
    this.#meshUpdateCount++;
  }

  #uploadReusableMesh(mesh){
    const gl=this.#gl,record=this.#record;
    if(!record)return;
    const streams=fluidStreams(mesh);
    const start=performance.now();
    gl.bindVertexArray(record.vao);
    try{
      for(let i=0;i<streams.length;i++){
        const target=i===streams.length-1?gl.ELEMENT_ARRAY_BUFFER:gl.ARRAY_BUFFER;
        const data=streams[i];
        gl.bindBuffer(target,record.buffers[i]);
        if(data.byteLength>record.capacities[i]){
          // Grow only when needed, never delete/recreate the VAO or buffers
          // for a fluid snapshot. Capacity remains bounded by real mesh size.
          const capacity=fluidCapacity(data.byteLength);
          gl.bufferData(target,capacity,gl.DYNAMIC_DRAW);
          record.capacities[i]=capacity;
        }
        if(data.byteLength)gl.bufferSubData(target,0,data);
      }
      record.count=mesh.indices.length;
      this.#gpuUploadMs=performance.now()-start;
      this.#gpuUploadCount++;
    }finally{
      gl.bindVertexArray(null);
      gl.bindBuffer(gl.ARRAY_BUFFER,null);
    }
  }

  #ensureReady(){
    if(this.#lost||this.#gl.isContextLost()||!this.#mesh)return false;
    const gl=this.#gl;
    if(!this.#program){
      this.#program=program(gl);
      const uniform=name=>gl.getUniformLocation(this.#program,name);
      this.#uniforms={
        viewport:uniform('uViewport'),pan:uniform('uPan'),scale:uniform('uScale'),
        depthOrigin:uniform('uDepthOrigin'),
        right:uniform('uCameraRight'),down:uniform('uCameraDown'),
        depth:uniform('uCameraDepth'),time:uniform('uTime'),
        rippleFrame:uniform('uRippleFrame'),rippleFade:uniform('uRippleFade'),
        ambient:uniform('uLightingAmbient'),
        pointVisibilityEnabled:uniform('uPointVisibilityEnabled'),
        pointVisibilityDistances:uniform('uPointVisibilityDistances[0]'),
        lightingField:uniform('uLightingField'),
        lightingEnabled:uniform('uLightingFieldEnabled'),
        lightingWarm:uniform('uLightingWarmEnabled'),
        lightingOrigin:uniform('uLightingFieldOrigin'),
        lightingEmission:uniform('uLightingEmissionColor'),
        lightCount:uniform('uTransientLightCount'),
        lightPositions:uniform('uTransientPositions[0]'),lightRadiance:uniform('uTransientRadiance[0]'),
        lava:uniform('uLava'),lavaDirection:uniform('uLavaChannelFlow'),
        lavaAtlas:uniform('uLavaCrustAtlas'),
        ribbons:uniform('uRibbonEnabled'),landing:uniform('uLandingEnabled'),
        parcels:uniform('uParcelsEnabled')
      };
    }
    if(this.#record||!this.#mesh.indices.length)return true;
    const start=performance.now();
    const vao=gl.createVertexArray();
    if(!vao)throw new Error('Fluid VAO allocation failed');
    const buffers=[],capacities=[];
    try{
      gl.bindVertexArray(vao);
      const buffer=(target,data)=>{
        const handle=gl.createBuffer();
        if(!handle)throw new Error('Fluid GPU buffer allocation failed');
        buffers.push(handle);
        this.#gpuAllocations++;
        gl.bindBuffer(target,handle);
        const capacity=fluidCapacity(data.byteLength);
        capacities.push(capacity);
        gl.bufferData(target,capacity,gl.DYNAMIC_DRAW);
        if(data.byteLength)gl.bufferSubData(target,0,data);
      };
      buffer(gl.ARRAY_BUFFER,this.#mesh.positions);
      gl.enableVertexAttribArray(0);
      gl.vertexAttribPointer(0,3,gl.FLOAT,false,0,0);
      buffer(gl.ARRAY_BUFFER,this.#mesh.normals);
      gl.enableVertexAttribArray(1);
      gl.vertexAttribPointer(1,3,gl.BYTE,false,0,0);
      buffer(gl.ARRAY_BUFFER,this.#mesh.flows);
      gl.enableVertexAttribArray(2);
      gl.vertexAttribPointer(2,2,gl.BYTE,false,0,0);
      buffer(gl.ARRAY_BUFFER,this.#mesh.faceModes);
      gl.enableVertexAttribArray(3);
      gl.vertexAttribPointer(3,1,gl.UNSIGNED_BYTE,false,0,0);
      buffer(gl.ARRAY_BUFFER,this.#mesh.landingHeights);
      gl.enableVertexAttribArray(4);
      gl.vertexAttribPointer(4,1,gl.FLOAT,false,0,0);
      buffer(gl.ELEMENT_ARRAY_BUFFER,this.#mesh.indices);
      this.#record={vao,buffers,capacities,count:this.#mesh.indices.length};
      this.#gpuUploadMs=performance.now()-start;
      this.#gpuUploadCount++;
    }catch(error){
      for(const handle of buffers){
        gl.deleteBuffer(handle);
        this.#gpuDeletes++;
      }
      gl.deleteVertexArray(vao);
      throw error;
    }finally{
      gl.bindVertexArray(null);
      gl.bindBuffer(gl.ARRAY_BUFFER,null);
    }
    return true;
  }

  #bindLavaAtlas(){
    const gl=this.#gl;
    gl.uniform1i(this.#uniforms.lavaAtlas,6);
    if(this.#mesh.kind!=='lava')return;
    if(!this.#lavaAtlasTexture){
      const texture=gl.createTexture();
      if(!texture)throw new Error('Cannot create bounded molten-crust atlas');
      gl.activeTexture(gl.TEXTURE0+6);
      gl.bindTexture(gl.TEXTURE_2D,texture);
      gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MIN_FILTER,gl.NEAREST);
      gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MAG_FILTER,gl.NEAREST);
      gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_S,gl.REPEAT);
      gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_T,gl.REPEAT);
      // A single 256KiB upload per context, NEVER one texture per tick.
      // Pixel-art atlas generated in Materials without Voxel or Fluid edits.
      gl.texImage2D(gl.TEXTURE_2D,0,gl.RGBA,LAVA_CRUST_ATLAS_SIZE,
        LAVA_CRUST_ATLAS_SIZE,0,gl.RGBA,gl.UNSIGNED_BYTE,buildLavaCrustAtlas());
      this.#lavaAtlasTexture=texture;
    }
    gl.activeTexture(gl.TEXTURE0+6);
    gl.bindTexture(gl.TEXTURE_2D,this.#lavaAtlasTexture);
  }

  #bindLightingField(field){
    const gl=this.#gl,u=this.#uniforms;
    const active=field?.hasEmission===true;
    gl.uniform1i(u.lightingField,7);
    gl.uniform1i(u.lightingEnabled,active?1:0);
    gl.uniform1i(u.lightingWarm,active?1:0);
    if(!active)return;
    if(field.schema!=='wyrmforge.local-light-field.v2'||
        field.size?.[0]!==24||field.size?.[1]!==24||
        !(field.data instanceof Float32Array)||field.data.length!==24*24*4||
        !field.data.every(Number.isFinite)||
        field.origin?.length!==2||!field.origin.every(Number.isSafeInteger)||
        field.emission?.length!==3||!field.emission.every(n=>Number.isFinite(n)&&n>=0&&n<=4)){
      throw new TypeError('Invalid bounded fluid light-field receiver');
    }
    gl.activeTexture(gl.TEXTURE0+7);
    this.#lightingTexture??=gl.createTexture();
    if(!this.#lightingTexture)throw new Error('Could not allocate fluid lighting receiver');
    gl.bindTexture(gl.TEXTURE_2D,this.#lightingTexture);
    if(this.#lightingSource!==field){
      const start=performance.now();
      gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MIN_FILTER,gl.NEAREST);
      gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MAG_FILTER,gl.NEAREST);
      gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_S,gl.CLAMP_TO_EDGE);
      gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_T,gl.CLAMP_TO_EDGE);
      gl.texImage2D(gl.TEXTURE_2D,0,gl.RGBA32F,24,24,0,gl.RGBA,gl.FLOAT,field.data);
      this.#lightingSource=field;
      this.#lightingUploads++;
      this.#lightingUploadMs=performance.now()-start;
    }
    gl.uniform2f(u.lightingOrigin,...field.origin);
    gl.uniform3fv(u.lightingEmission,field.emission);
  }

  render(view,{time=0,reducedMotion=false,showRibbons=true,
    showLanding=true,showParcels=true,lightingEnvironment=null,transientLights=null,
    pointVisibility=null,lightingField=null}={}){
    if(this.#disposed||!this.#ensureReady()||!this.#record)return false;
    const gl=this.#gl,u=this.#uniforms,basis=getCameraPreset(view.camera);
    gl.useProgram(this.#program);
    gl.uniform2f(u.viewport,view.width,view.height);
    gl.uniform2f(u.pan,view.panX,view.panY);
    gl.uniform1f(u.scale,view.scale);
    gl.uniform1f(u.depthOrigin,view.depthOrigin??0);
    gl.uniform3fv(u.right,basis.right);
    gl.uniform3fv(u.down,basis.down);
    gl.uniform3fv(u.depth,basis.depth);
    const animatedTime=reducedMotion?0:time;
    gl.uniform1f(u.time,animatedTime);
    const ripple=fluidRippleTiming(animatedTime);
    gl.uniform1f(u.rippleFrame,ripple.frame);
    gl.uniform1f(u.rippleFade,ripple.fade);
    if(lightingEnvironment&&lightingEnvironment.schema!==LIGHTING_ENVIRONMENT_SCHEMA){
      throw new TypeError('Unsupported fluid lighting environment');
    }
    const ambient=lightingEnvironment?.ambient??[1,1,1];
    if(ambient.length!==3||!ambient.every(n=>Number.isFinite(n)&&n>=0&&n<=2))throw new TypeError('Invalid fluid ambient');
    gl.uniform3fv(u.ambient,ambient);
    const lightCount=writeTransientLights(transientLights,this.#lightPositions,this.#lightRadiance);
    gl.uniform1i(u.lightCount,lightCount);
    if(lightCount){gl.uniform4fv(u.lightPositions,this.#lightPositions);gl.uniform3fv(u.lightRadiance,this.#lightRadiance);}
    // Mirror terrain's visibility gate exactly: unfinished, stale and expired
    // fields fall back to unoccluded light until a valid bounded snapshot exists.
    const visible=lightCount>0&&writePointVisibility(
      pointVisibility,transientLights,this.#pointVisibilityUpload);
    this.#pointVisibilityActive=visible;
    if(visible)this.#pointVisibilityFrames++;
    gl.uniform1i(u.pointVisibilityEnabled,visible?1:0);
    if(visible)gl.uniform1fv(u.pointVisibilityDistances,this.#pointVisibilityUpload);
    this.#bindLightingField(lightingField);
    this.#bindLavaAtlas();
    gl.uniform1f(u.lava,this.#mesh.kind==='lava'?1:0);
    gl.uniform2fv(u.lavaDirection,this.#lavaFlowAxis);
    gl.uniform1f(u.ribbons,showRibbons?1:0);
    gl.uniform1f(u.landing,showLanding?1:0);
    gl.uniform1f(u.parcels,showParcels?1:0);
    gl.enable(gl.DEPTH_TEST);
    gl.depthFunc(gl.LEQUAL);
    gl.enable(gl.BLEND);
    gl.blendFunc(gl.SRC_ALPHA,gl.ONE_MINUS_SRC_ALPHA);
    gl.depthMask(false);
    try{
      gl.bindVertexArray(this.#record.vao);
      gl.drawElements(gl.TRIANGLES,this.#record.count,gl.UNSIGNED_INT,0);
    }finally{
      gl.bindVertexArray(null);
      gl.depthMask(true);
      gl.disable(gl.BLEND);
      gl.useProgram(null);
    }
    return true;
  }

  dispose(){
    if(this.#disposed)return;
    this.#releaseBuffers();
    this.#releaseLightingTexture();
    if(this.#lavaAtlasTexture&&!this.#lost&&!this.#gl.isContextLost()){
      this.#gl.deleteTexture(this.#lavaAtlasTexture);
    }
    this.#lavaAtlasTexture=null;
    if(this.#program&&!this.#lost)this.#gl.deleteProgram(this.#program);
    this.#program=null;
    this.#mesh=null;
    this.#visualHistory.clear();
    this.canvas.removeEventListener('webglcontextlost',this.#onLost);
    this.canvas.removeEventListener('webglcontextrestored',this.#onRestored);
    this.#disposed=true;
  }
}
