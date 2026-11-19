// L10-08 acceptance aid: actual Play Hunt, not a shader-only plane or lab.
// Each image uses a real seeded route, Voxel terrain and Water V2 renderer.
// This is a visual-review matrix, NOT an iPhone/Android performance claim.
// Run: npm install --no-save playwright-core@1.56.1 pngjs@7.0.0
//      node .github/witness/lighting-mixed-scene-hunt.mjs
import {chromium} from 'playwright-core';
import {PNG} from 'pngjs';
import {spawn} from 'node:child_process';
import {mkdir,writeFile} from 'node:fs/promises';

const folder='lighting-mixed-scene-evidence';
const port=8158,base='http://127.0.0.1:'+port;
const server=spawn('python3',['-m','http.server',String(port),'--bind','127.0.0.1'],{
  stdio:['ignore','pipe','pipe']
});
const scenarios=[
  {name:'wet-forest-water',route:'forest',stop:0,kind:'water'},
  {name:'mountain-pass-water',route:'mountain',stop:0,kind:'water'},
  {name:'scorched-approach-lava',route:'mountain',stop:2,kind:'lava'}
];
const report={schema:'wyrmforge.l10-08-mixed-scenes.v1',
  description:'Real Play Hunt routes, published liquid geometry, real ambient and occlusion wiring',
  viewport:[402,874],softwareRendering:true,
  scenarios:[],errors:[],mobileDeviceAcceptance:false};
await mkdir(folder,{recursive:true});
let browser,failed=null;
try{
  let available=false;
  for(let attempt=0;attempt<60;attempt++){
    try{if((await fetch(base+'/play-hunt.html')).ok){available=true;break;}}catch{}
    await new Promise(resolve=>setTimeout(resolve,100));
  }
  if(!available)throw new Error('Actual Hunt server failed to start');
  browser=await chromium.launch({
    headless:true,executablePath:process.env.CHROME_BIN??'/usr/bin/google-chrome',
    args:['--enable-webgl','--use-angle=swiftshader','--enable-unsafe-swiftshader',
      '--disable-gpu-sandbox','--disable-dev-shm-usage','--no-sandbox']
  });
  for(const scenario of scenarios){
    const context=await browser.newContext({
      viewport:{width:402,height:874},deviceScaleFactor:1.5,
      isMobile:true,hasTouch:true,reducedMotion:'reduce'
    });
    const page=await context.newPage();
    const errors=[];
    page.on('pageerror',error=>errors.push(error.message));
    page.on('response',response=>{
      if(response.status()>=400&&
          !new URL(response.url()).pathname.endsWith('/favicon.ico')){
        errors.push('HTTP '+response.status()+' '+response.url());
      }
    });
    const url=base+'/play-hunt.html?route='+scenario.route+
      '&stop='+scenario.stop+'&fluidTest=auto';
    const record={name:scenario.name,route:scenario.route,stop:scenario.stop,
      expectedFluid:scenario.kind,url:scenario.route+' stop '+scenario.stop,
      errors};
    try{
      await page.goto(url,{waitUntil:'domcontentloaded',timeout:30000});
      await page.waitForFunction(expected=>{
        const s=window.__WyrmforgeFluidTest?.status();
        return s&&s.kind===expected&&s.raisedSurfaceFaces>0&&!s.busy;
      },scenario.kind,{timeout:120000});
      // Suspend only solver stepping; real Voxel/Water geometry remains intact.
      await page.evaluate(()=>window.__WyrmforgeFluidTest.hold(true));
      await page.waitForTimeout(1500);
      const state=await page.evaluate(()=>({
        fluid:window.__WyrmforgeFluidTest.status(),
        lighting:window.__WyrmforgeFluidTest.lightingStatus(),
        hud:document.querySelector('#play-hud-details')?.textContent?.slice(0,350)??null
      }));
      record.fluid={kind:state.fluid.kind,wetColumns:state.fluid.wetColumns,
        topFaces:state.fluid.raisedSurfaceFaces,
        fallRibbonFaces:state.fluid.fallRibbonFaces,
        waterfallFaces:state.fluid.waterfallFaces,
        landingFaces:state.fluid.landingSplashFaces,
        meshBytes:state.fluid.fluidMeshBytes,
        gpuAllocations:state.fluid.fluidGpuAllocations};
      record.lighting=state.lighting;
      record.hud=state.hud;
      const pngBytes=await page.screenshot({type:'png',scale:'css',
        timeout:60000});
      const pixels=PNG.sync.read(pngBytes);
      record.image={width:pixels.width,height:pixels.height,
        bytes:pngBytes.length};
      await writeFile(folder+'/'+scenario.name+'.png',pngBytes);
      if(errors.length)throw new Error('Browser errors: '+errors.join('; ').slice(0,600));
      if(state.fluid.kind!==scenario.kind||state.fluid.wetColumns<=0||
          state.fluid.raisedSurfaceFaces<=0){
        throw new Error('Actual '+scenario.name+' has no correct published fluid');
      }
      if(!state.lighting.enabled||!state.lighting.pointOcclusionEnabled||
          !state.lighting.fluidEmissionEnabled){
        throw new Error('Mixed-scene Lighting pipeline disabled: '+JSON.stringify(state.lighting));
      }
      if(pixels.width!==402||pixels.height!==874){
        throw new Error('Unexpected actual Play Hunt viewport '+pixels.width+'x'+pixels.height);
      }
      if(state.fluid.fluidMeshBytes>2*1024*1024){
        throw new Error('Water visual mesh exceeds 2MiB budget');
      }
      // No pixel-equality claim: independent worlds do not guarantee equal
      // simulation steps, and a still image cannot prove animation/performance.
      console.log('L10_08_MIXED_SCENE '+JSON.stringify({
        scene:record.name,kind:record.fluid.kind,faces:record.fluid.topFaces,
        fieldReady:record.lighting.fieldReady,pointFieldReady:record.lighting.pointFieldReady,
        imageBytes:pngBytes.length
      }));
    }catch(error){
      record.failure=String(error.stack??error);
      throw error;
    }finally{
      report.scenarios.push(record);
      await context.close().catch(()=>{});
    }
  }
  report.result='browser screenshot matrix passed; mobile/player acceptance pending';
}catch(error){
  failed=String(error.stack??error);
  report.failed=failed;
  console.error('L10_08_MIXED_SCENE_FAIL '+failed);
}finally{
  await writeFile(folder+'/report.json',JSON.stringify(report,null,2));
  await browser?.close().catch(()=>{});
  server.kill('SIGTERM');
}
if(failed)process.exitCode=1;
