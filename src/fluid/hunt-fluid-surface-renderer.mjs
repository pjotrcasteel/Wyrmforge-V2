// Independent Water V2 WebGL2 presentation: real liquid top caps and exposed
// side faces at the solver's 10cm levels, depth-tested against Voxel geometry.
// Uses one small program/VAO. Never writes voxels or changes terrain textures.
import {getCameraPreset} from '../camera-presets.mjs';
import {buildFluidSurfaceMesh} from './fluid-surface-mesh.mjs';

export const FLUID_VERTEX_GLSL=`#version 300 es
precision highp float;
layout(location=0) in vec3 aPosition;
layout(location=1) in vec3 aNormal;
uniform vec2 uViewport;
uniform vec2 uPan;
uniform float uScale;
uniform float uDepthOrigin;
uniform vec3 uCameraRight;
uniform vec3 uCameraDown;
uniform vec3 uCameraDepth;
out vec3 vWorld;
out vec3 vNormal;
void main(){
  vec3 world=aPosition;
  vec2 pixel=vec2(dot(world,uCameraRight),dot(world,uCameraDown))*uScale
    +uViewport*.5+uPan;
  gl_Position=vec4(pixel.x*2.0/uViewport.x-1.0,
    1.0-pixel.y*2.0/uViewport.y,
    dot(world,uCameraDepth)-uDepthOrigin,1.0);
  vWorld=world;
  vNormal=aNormal;
}
`;

export const FLUID_FRAGMENT_GLSL=`#version 300 es
precision highp float;
in vec3 vWorld;
in vec3 vNormal;
uniform float uTime;
uniform float uLava;
out vec4 outColor;
float fluidHash(vec2 point){
  return fract(sin(dot(point,vec2(127.1,311.7)))*43758.5453);
}
void main(){
  // Pixel-art glints anchored to real world coordinates; no new texture
  // assets. Palette follows the approved water/lava artwork in Hunt.
  vec2 pixel=floor(vWorld.xz*8.0);
  float frame=floor(uTime*4.0);
  float drift=fluidHash(pixel-vec2(frame,0.0)+13.0);
  float pool=fluidHash(floor(vWorld.xz*1.4)+31.0);
  float top=step(0.5,vNormal.y);
  vec3 color;
  float opacity;
  if(uLava<0.5){
    vec3 deep=vec3(.075,.28,.32);
    vec3 shallow=vec3(.22,.49,.44);
    color=mix(deep,shallow,.28+.32*pool);
    float glint=step(.87,drift)*.22+step(.968,drift)*.16;
    color=mix(color,vec3(.53,.75,.71),glint);
    color*=mix(.70,1.0,top);
    opacity=mix(.94,.86,top);
  }else{
    float ember=fluidHash(pixel-vec2(frame,frame*.25)+79.0);
    color=mix(vec3(.29,.055,.015),vec3(.86,.29,.045),.40+.45*pool);
    color=mix(color,vec3(1.0,.66,.16),step(.84,ember)*.5);
    color*=mix(.72,1.0,top);
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
      uploadedTriangles:this.#record?.count?this.#record.count/3:0,
      surfaceStep:this.#mesh?.step??null
    });
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
    const bytes=mesh.positions.byteLength+mesh.normals.byteLength+mesh.indices.byteLength;
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
        depth:uniform('uCameraDepth'),time:uniform('uTime'),lava:uniform('uLava')
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

  render(view,{time=0,reducedMotion=false}={}){
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
