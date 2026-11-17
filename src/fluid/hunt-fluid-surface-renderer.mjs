// Independent Water V2 WebGL2 presentation: real liquid top caps and exposed
// side faces at the solver's 10cm levels, depth-tested against Voxel geometry.
// Uses one small program/VAO. Never writes voxels or changes terrain textures.
import {getCameraPreset} from '../camera-presets.mjs';
import {waterRippleMotifGlsl} from '../river-water-art.mjs';
import {buildFluidSurfaceMesh} from './fluid-surface-mesh.mjs';

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
void main(){
  vec3 world=aPosition;
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
uniform float uTime;
uniform float uLava;
uniform float uRibbonEnabled;
out vec4 outColor;
${waterRippleMotifGlsl()}
float fluidHash(vec2 point){
  return fract(sin(dot(point,vec2(127.1,311.7)))*43758.5453);
}
void main(){
  if(vFaceMode==4&&uRibbonEnabled<.5)discard;
  // Pixel-art glints anchored to real world coordinates; no new texture
  // assets. Palette follows the approved water/lava artwork in Hunt.
  vec2 pixel=floor(vWorld.xz*8.0);
  float frame=floor(uTime*4.0);
  vec2 downstream=length(vFlow)>0.0?normalize(vFlow):vec2(0.0);
  ivec2 moving=ivec2(floor(pixel-downstream*frame));
  int col=int(mod(float(moving.x),32.0));
  int row=int(mod(float(moving.y),16.0));
  int ripple=int((HUNT_WATER_RIPPLES[row][col/8]>>uint(3*(col%8)))&7u);
  float pool=fluidHash(floor(vWorld.xz*.25)+31.0);
  float top=step(0.5,vNormal.y);
  vec3 color;
  float opacity;
  if(uLava<0.5){
    vec3 deep=vec3(.075,.28,.32);
    vec3 shallow=vec3(.22,.49,.44);
    color=mix(deep,shallow,.36+.24*pool);
    if(ripple==3)color=mix(color,vec3(.29,.55,.54),.25);
    if(ripple==1)color=mix(color,vec3(.35,.61,.58),.48);
    if(ripple==2)color=mix(color,vec3(.45,.69,.64),.72);
    color*=mix(.87,1.0,top);
    if(vFaceMode==2) {
      // A real downstream wet column is lower. Vertical, pixel-quantized
      // light strokes follow the falling sheet, never a generic pool wall.
      vec2 across=vec2(-downstream.y,downstream.x);
      float strip=floor(dot(vWorld.xz,across)*10.0);
      float bead=fluidHash(vec2(strip,floor(vWorld.y*8.0+uTime*5.0)));
      color=mix(color,vec3(.47,.68,.65),.15+.18*step(.78,bead));
      float landing=1.0-smoothstep(.02,.35,vWorld.y-vLandingY);
      color=mix(color,vec3(.57,.74,.69),landing*.4);
    } else if(vFaceMode==4) {
      // True outward fall bridge, visible from the normal north-up Hunt
      // camera where a cliff-flush vertical sheet can be depth-occluded.
      // Quantize moving highlights to the Wyrmforge 10cm pixel grid.
      float fall=clamp((vWorld.y-vLandingY)/2.5,0.0,1.0);
      float line=fluidHash(vec2(
        floor(dot(vWorld.xz,vec2(-downstream.y,downstream.x))*10.0),
        floor(vWorld.y*8.0+uTime*3.0)));
      color=mix(color,vec3(.46,.67,.65),.33+.18*(1.0-fall));
      color=mix(color,vec3(.67,.79,.73),step(.78,line)*.19);
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
  }else{
    float ember=fluidHash(pixel-vec2(frame,frame*.25)+79.0);
    color=mix(vec3(.29,.055,.015),vec3(.86,.29,.045),.40+.45*pool);
    color=mix(color,vec3(1.0,.66,.16),step(.84,ember)*.5);
    color*=mix(.72,1.0,top);
    if(vFaceMode==4){
      float fall=clamp((vWorld.y-vLandingY)/2.5,0.0,1.0);
      color=mix(color,vec3(1.0,.66,.20),.16+.12*(1.0-fall));
    }
    if(vFaceMode==2){
      float streak=fluidHash(vec2(floor(vWorld.y*8.0+uTime*2.0),
        floor(dot(vWorld.xz,vec2(-downstream.y,downstream.x))*10.0)));
      color=mix(color,vec3(1.0,.63,.16),step(.68,streak)*.22);
      float landing=1.0-smoothstep(.02,.4,vWorld.y-vLandingY);
      color=mix(color,vec3(1.0,.75,.24),landing*.24);
    }
    opacity=.99;
  }
  outColor=vec4(color,opacity);
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

export class HuntFluidSurfaceRenderer {
  #gl;
  #program=null;
  #uniforms=null;
  #record=null;
  #mesh=null;
  #lost=false;
  #disposed=false;
  #onLost;
  #onRestored;

  constructor(canvas){
    if(!canvas||typeof canvas.getContext!=='function')throw new TypeError('Expected WebGL2 canvas');
    const gl=canvas.getContext('webgl2');
    if(!gl)throw new Error('Fluid surface requires the existing WebGL2 renderer');
    this.#gl=gl;
    this.#onLost=()=>{this.#lost=true;this.#record=null;this.#program=null;this.#uniforms=null;};
    this.#onRestored=()=>{this.#lost=false;this.#record=null;this.#program=null;this.#uniforms=null;};
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
      fallLipFaces:this.#mesh?.fallLipFaces??0,
      wetColumns:this.#mesh?.wetColumns??0,
      refinedShoreColumns:this.#mesh?.refinedShoreColumns??0,
      cpuMeshBytes:this.#mesh?this.#mesh.positions.byteLength+
        this.#mesh.normals.byteLength+this.#mesh.flows.byteLength+
        this.#mesh.faceModes.byteLength+this.#mesh.landingHeights.byteLength+
        this.#mesh.indices.byteLength:0,
      uploadedTriangles:this.#record?.count?this.#record.count/3:0,
      surfaceStep:this.#mesh?.step??null
    });
  }

  // Screenshot-witness projection only: these are true raster bounds of
  // faces tagged as flowing ribbons, in the existing canvas pixel space.
  // No texture reads and no camera or simulation mutation.
  projectedRibbonBounds(view){
    if(!this.#mesh||!view)return [];
    const basis=getCameraPreset(view.camera);
    const bounds=[];
    for(let vertex=0;vertex<this.#mesh.vertexCount;vertex+=4){
      if(this.#mesh.faceModes[vertex]!==4)continue;
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
      for(const buffer of this.#record.buffers)this.#gl.deleteBuffer(buffer);
    }
    this.#record=null;
  }

  clear(){
    if(this.#disposed)return;
    this.#releaseBuffers();
    this.#mesh=null;
  }

  update(surface,sampleAt){
    if(this.#disposed)throw new Error('Fluid renderer disposed');
    const mesh=buildFluidSurfaceMesh(surface,{sampleAt});
    const bytes=mesh.positions.byteLength+mesh.normals.byteLength+mesh.flows.byteLength+
      mesh.faceModes.byteLength+mesh.landingHeights.byteLength+mesh.indices.byteLength;
    if(bytes>2*1024*1024)throw new RangeError('Fluid surface GPU upload exceeds 2MiB');
    this.#releaseBuffers();
    this.#mesh=mesh;
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
        depth:uniform('uCameraDepth'),time:uniform('uTime'),lava:uniform('uLava'),
        ribbons:uniform('uRibbonEnabled')
      };
    }
    if(this.#record||!this.#mesh.indices.length)return true;
    const vao=gl.createVertexArray();
    if(!vao)throw new Error('Fluid VAO allocation failed');
    const buffers=[];
    try{
      gl.bindVertexArray(vao);
      const buffer=(type,data)=>{
        const handle=gl.createBuffer();
        if(!handle)throw new Error('Fluid GPU buffer allocation failed');
        buffers.push(handle);
        gl.bindBuffer(type,handle);
        gl.bufferData(type,data,gl.STATIC_DRAW);
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
      this.#record={vao,buffers,count:this.#mesh.indices.length};
    }catch(error){
      for(const handle of buffers)gl.deleteBuffer(handle);
      gl.deleteVertexArray(vao);
      throw error;
    }finally{
      gl.bindVertexArray(null);
      gl.bindBuffer(gl.ARRAY_BUFFER,null);
    }
    return true;
  }

  render(view,{time=0,reducedMotion=false,showRibbons=true}={}){
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
    gl.uniform1f(u.time,reducedMotion?0:time);
    gl.uniform1f(u.lava,this.#mesh.kind==='lava'?1:0);
    gl.uniform1f(u.ribbons,showRibbons?1:0);
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
    if(this.#program&&!this.#lost)this.#gl.deleteProgram(this.#program);
    this.#program=null;
    this.#mesh=null;
    this.canvas.removeEventListener('webglcontextlost',this.#onLost);
    this.canvas.removeEventListener('webglcontextrestored',this.#onRestored);
    this.#disposed=true;
  }
}
