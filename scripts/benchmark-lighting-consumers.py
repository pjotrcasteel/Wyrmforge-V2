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
a=(I*13)(0x3033,1,0x3040,0x40,0x3024,8,0x3023,8,0x3022,8,0x3021,8,0x3038);config=P();num=I();assert choose(d,a,C.byref(config),1,C.byref(num));c=ctx(d,config,None,(I*3)(0x3098,3,0x3038));s=surf(d,config,(I*5)(0x3057,402,0x3056,604,0x3038));assert current(d,s,s,c)
create=api('glCreateShader',U,U);source=api('glShaderSource',None,U,I,P,P);compile=api('glCompileShader',None,U);iv=api('glGetShaderiv',None,U,U,P);log=api('glGetShaderInfoLog',None,U,I,P,P)
def shader(kind,txt):
 sh=create(kind);b=C.c_char_p(txt.encode());source(sh,1,C.byref(b),None);compile(sh);ok=I();iv(sh,0x8B81,C.byref(ok))
 if not ok.value:
  b=C.create_string_buffer(20000);log(sh,20000,None,b);raise Exception(b.value.decode())
 return sh
vertex='#version 300 es\nprecision highp float;\nout vec3 vWorld;out vec3 vNormal;out vec2 vFlow;flat out int vFaceMode;out float vLandingY;\nuniform float uWitnessFace;\nvoid main(){vec2 p=vec2(float((gl_VertexID<<1)&2),float(gl_VertexID&2));gl_Position=vec4(p*2.-1.,0.,1.);vWorld=vec3(p.x*12.-6.,0.,p.y*12.-6.);vNormal=vec3(0,1,0);vFlow=vec2(0,1);vFaceMode=int(uWitnessFace);vLandingY=0.;}\n'
cp=api('glCreateProgram',U);attach=api('glAttachShader',None,U,U);link=api('glLinkProgram',None,U);gp=api('glGetProgramiv',None,U,U,P);use=api('glUseProgram',None,U);loc=api('glGetUniformLocation',I,U,C.c_char_p)
u1=api('glUniform1i',None,I,I);uf=api('glUniform1f',None,I,F);u3=api('glUniform3f',None,I,F,F,F);u4=api('glUniform4f',None,I,F,F,F,F)
draw=api('glDrawArrays',None,U,I,I);finish=api('glFinish',None);read=api('glReadPixels',None,I,I,I,I,U,U,P);err=api('glGetError',U);viewport=api('glViewport',None,I,I,I,I);string=api('glGetString',C.c_char_p,U)

viewport(0,0,402,604);programs=[]
for path in sys.argv[1:3]:
 p=cp();attach(p,shader(0x8B31,vertex));attach(p,shader(0x8B30,open(path).read()));link(p);ok=I();gp(p,0x8B82,C.byref(ok));assert ok.value;programs.append(p)
def setup(p,lava,face,ambient=(1,1,1),light=False):
 use(p)
 for n,v in [('uLava',lava),('uWitnessFace',face),('uTime',.4),('uRibbonEnabled',1),('uLandingEnabled',1),('uParcelsEnabled',1)]:uf(loc(p,n.encode()),v)
 u3(loc(p,b'uLightingAmbient'),*ambient);u1(loc(p,b'uTransientLightCount'),int(light))
 u4(loc(p,b'uTransientPositions[0]'),0,1,0,3);u3(loc(p,b'uTransientRadiance[0]'),3,1,.1)
def capture(p,lava,face,ambient=(1,1,1),light=False):
 setup(p,lava,face,ambient,light);draw(4,0,3);finish();buf=(C.c_ubyte*(402*604*4))();read(0,0,402,604,0x1908,0x1401,buf);assert err()==0;return bytes(buf)
results=[]
for lava in [0,1]:
 for face in [0,1,4,5]:
  old=capture(programs[0],lava,face);neutral=capture(programs[1],lava,face)
  dark=capture(programs[1],lava,face,(.42,.42,.42));lit=capture(programs[1],lava,face,(.42,.42,.42),True)
  assert old==neutral
  assert old[3::4]==dark[3::4]==lit[3::4]
  if lava:assert dark==old==lit
  else:assert dark!=old and lit!=dark
  results.append({'lava':bool(lava),'face':face,'neutralExact':True,'alphaExact':True,'darkChangedBytes':sum(a!=b for a,b in zip(old,dark)),'lightChangedBytes':sum(a!=b for a,b in zip(dark,lit))})
times=[]
for p in programs:
 setup(p,0,0,(.42,.42,.42),True);draw(4,0,3);finish();batches=[]
 for _ in range(7):
  start=time.perf_counter()
  for _ in range(12):draw(4,0,3)
  finish();batches.append((time.perf_counter()-start)*1000/12)
 times.append(statistics.median(batches))
json.dump({'renderer':string(0x1F01).decode(),'fixture':'synthetic plane, actual fluid fragment shaders; software GLES, not mobile','viewport':[402,604],'results':results,'medianDrawMs':times},open(sys.argv[3],'w'),indent=2)
print(json.dumps({'neutralAndAlphaFixtures':len(results),'medianDrawMs':times}))
