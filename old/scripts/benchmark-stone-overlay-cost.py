# Optional Linux/Mesa GLES witness. Supply assembled before/after fragment
# sources; this measures software-renderer draw cost, never mobile GPU time.
import ctypes as C,os,time,statistics,json,sys
if len(sys.argv) not in [4,5] or (len(sys.argv)==5 and sys.argv[4]!='--textured'):
 raise SystemExit('Usage: python scripts/benchmark-stone-overlay-cost.py before.frag after.frag evidence.json [--textured]')
os.environ['EGL_PLATFORM']='surfaceless'
e=C.CDLL('libEGL.so.1');e.eglGetProcAddress.restype=C.c_void_p;e.eglGetProcAddress.argtypes=[C.c_char_p]
def api(n,r,*a):
 return C.CFUNCTYPE(r,*a)(e.eglGetProcAddress(n.encode()))
P=C.c_void_p;I=C.c_int;U=C.c_uint;F=C.c_float
get=api('eglGetDisplay',P,P);ini=api('eglInitialize',U,P,P,P);bind=api('eglBindAPI',U,U);choose=api('eglChooseConfig',U,P,P,P,I,P);ctx=api('eglCreateContext',P,P,P,P,P);surf=api('eglCreatePbufferSurface',P,P,P);current=api('eglMakeCurrent',U,P,P,P,P)
d=get(None);assert ini(d,None,None);assert bind(0x30A0)
a=(I*11)(0x3033,1,0x3040,0x40,0x3024,8,0x3023,8,0x3022,8,0x3038);config=P();num=I();assert choose(d,a,C.byref(config),1,C.byref(num));c=ctx(d,config,None,(I*3)(0x3098,3,0x3038));s=surf(d,config,(I*5)(0x3057,402,0x3056,604,0x3038));assert current(d,s,s,c)
create=api('glCreateShader',U,U);source=api('glShaderSource',None,U,I,P,P);compile=api('glCompileShader',None,U);iv=api('glGetShaderiv',None,U,U,P);log=api('glGetShaderInfoLog',None,U,I,P,P)
def shader(kind,txt):
 sh=create(kind);b=C.c_char_p(txt.encode());source(sh,1,C.byref(b),None);compile(sh);ok=I();iv(sh,0x8B81,C.byref(ok))
 if not ok.value:
  b=C.create_string_buffer(20000);log(sh,20000,None,b);raise Exception(b.value.decode())
 return sh
vertex='''#version 300 es
precision highp float;
out vec3 vNormal;out vec3 vWorld;flat out float vMaterial;
uniform float uWitnessMaterial;uniform vec3 uWitnessNormal;
void main(){vec2 p=vec2(float((gl_VertexID<<1)&2),float(gl_VertexID&2));gl_Position=vec4(p*2.-1.,0.,1.);vWorld=vec3(p.x*24.-12.,8.,p.y*24.-12.);vNormal=uWitnessNormal;vMaterial=uWitnessMaterial;}
'''
cp=api('glCreateProgram',U);attach=api('glAttachShader',None,U,U);link=api('glLinkProgram',None,U);gp=api('glGetProgramiv',None,U,U,P);use=api('glUseProgram',None,U);loc=api('glGetUniformLocation',I,U,C.c_char_p)
u1=api('glUniform1i',None,I,I);uf=api('glUniform1f',None,I,F);u3=api('glUniform3f',None,I,F,F,F);u4=api('glUniform4f',None,I,F,F,F,F)
draw=api('glDrawArrays',None,U,I,I);finish=api('glFinish',None);read=api('glReadPixels',None,I,I,I,I,U,U,P);err=api('glGetError',U);viewport=api('glViewport',None,I,I,I,I);string=api('glGetString',C.c_char_p,U)
viewport(0,0,402,604);programs=[]
for path in sys.argv[1:3]:
 p=cp();attach(p,shader(0x8B31,vertex));attach(p,shader(0x8B30,open(path).read()));link(p);ok=I();gp(p,0x8B82,C.byref(ok));assert ok.value;programs.append(p)
def setup(p,material,normal):
 use(p)
 for n in ['uHuntGrassArt','uHuntGrassEdges','uHuntLavaEnabled','uHuntHeightContrast']:u1(loc(p,n.encode()),1)
 for n in ['uTerrainAlbedo','uTerrainNormal','uTerrainOrm']:u1(loc(p,n.encode()),1)
 u1(loc(p,b'uLabMaterials'),2)
 for n in ['uTerrainLayers','uTerrainNormalLayers','uTerrainOrmLayers','uTerrainSecondaryLayers','uTerrainSecondaryNormalLayers','uTerrainSecondaryOrmLayers']:u4(loc(p,n.encode()),-1,-1,-1,-1)
 u3(loc(p,b'uHuntCorruption'),1,1,1);uf(loc(p,b'uWitnessMaterial'),material);u3(loc(p,b'uWitnessNormal'),*normal);uf(loc(p,b'uHuntElevationReference'),8)
if len(sys.argv)==5:
 active=api('glActiveTexture',None,U);gen=api('glGenTextures',None,I,P);texbind=api('glBindTexture',None,U,U);tex3=api('glTexImage3D',None,U,I,I,I,I,I,I,U,U,P);param=api('glTexParameteri',None,U,U,I)
 active(0x84C1);texture=U();gen(1,C.byref(texture));texbind(0x8C1A,texture);tex3(0x8C1A,0,0x8058,1,1,1,0,0x1908,0x1401,(C.c_ubyte*4)(128,192,240,255));param(0x8C1A,0x2801,0x2600);param(0x8C1A,0x2800,0x2600)
 originalSetup=setup
 def setup(p,material,normal):
  originalSetup(p,material,normal)
  for name in ['uTerrainLayers','uTerrainNormalLayers','uTerrainOrmLayers']:u4(loc(p,name.encode()),0,0,0,0)
print('renderer',string(0x1F01).decode(),flush=True)
results=[]
for material,normal in [(3,(0,1,0)),(3,(1,0,0)),(1,(0,1,0)),(4,(1,0,0))]:
 images=[];timings=[[],[]]
 for i,p in enumerate(programs):
  setup(p,material,normal)
  for _ in range(3):draw(4,0,3)
  finish();buf=(C.c_ubyte*(402*604*4))();read(0,0,402,604,0x1908,0x1401,buf);assert err()==0;images.append(bytes(buf))
 for batch in range(7):
  for i in ([0,1] if batch%2==0 else [1,0]):
   setup(programs[i],material,normal);finish();start=time.perf_counter()
   for _ in range(12):draw(4,0,3)
   finish();timings[i].append((time.perf_counter()-start)*1000/12)
 changed=sum(a!=b for a,b in zip(*images));row={'material':material,'normal':normal,'beforeMedianMs':statistics.median(timings[0]),'afterMedianMs':statistics.median(timings[1]),'changedBytes':changed,'beforeBatches':timings[0],'afterBatches':timings[1]};results.append(row);print(json.dumps(row),flush=True)
json.dump({'renderer':string(0x1F01).decode(),'viewport':[402,604],'drawsPerBatch':12,'results':results},open(sys.argv[3],'w'),indent=2)
