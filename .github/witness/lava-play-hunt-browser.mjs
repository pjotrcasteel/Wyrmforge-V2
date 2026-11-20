// LAVA-01: actual mobile-sized Play Hunt / Wyrm Lair lava integration.
// Unlike the old terrain shader's authored lava texture, this requires the
// real WorldGen -> Voxel -> viscous ColumnFluidEngine -> GPU mesh and Lighting.
// Run locally: npm i --no-save playwright-core@1.56.1
// node .github/witness/lava-play-hunt-browser.mjs
import {chromium} from 'playwright-core';
import {PNG} from 'pngjs';
import {spawn} from 'node:child_process';
import {mkdir,writeFile} from 'node:fs/promises';
import {resolve} from 'node:path';

const port=8127,base='http://127.0.0.1:'+port;
const folder=resolve('lava-v2-browser-evidence');
await mkdir(folder,{recursive:true});
const server=spawn('python3',['-m','http.server',String(port),'--bind','127.0.0.1'],{
  stdio:['ignore','ignore','pipe']
});
let serverErrors='';
server.stderr.on('data',data=>{serverErrors+=String(data);});
const report={
  schema:'wyrmforge.lava-v2-play-hunt-evidence.v1',
  build:'LAVA-01',page:'play-hunt.html?route=mountain&stop=3&fluidTest=auto',
  errors:[]
};
let browser;
try{
  let serving=false;
  for(let i=0;i<60;i++){
    try{
      const r=await fetch(base+'/play-hunt.html');
      if(r.ok){serving=true;break;}
    }catch{}
    await new Promise(resolve=>setTimeout(resolve,100));
  }
  if(!serving)throw new Error('Play Hunt server did not start: '+serverErrors);
  browser=await chromium.launch({
    headless:true,executablePath:process.env.CHROME_BIN||'/usr/bin/chromium',
    args:['--enable-webgl','--use-angle=swiftshader',
      '--enable-unsafe-swiftshader','--disable-gpu-sandbox',
      '--disable-dev-shm-usage','--no-sandbox']
  });
  const context=await browser.newContext({
    viewport:{width:402,height:874},deviceScaleFactor:1.5,
    isMobile:true,hasTouch:true,reducedMotion:'reduce'
  });
  const page=await context.newPage();
  page.on('pageerror',error=>report.errors.push('page: '+error.message));
  page.on('response',response=>{
    if(response.status()>=400&&!response.url().endsWith('/favicon.ico'))
      report.errors.push('resource HTTP '+response.status()+': '+response.url());
  });
  await page.goto(base+'/'+report.page,{
    waitUntil:'domcontentloaded',timeout:30000
  });
  await page.waitForFunction(()=>{
    const hook=window.__WyrmforgeFluidTest;
    return Boolean(hook&&hook.status().kind==='lava'&&
      hook.status().wetColumns>5&&hook.status().raisedSurfaceFaces>0);
  },null,{timeout:90000});
  const initial=await page.evaluate(()=>({
    status:window.__WyrmforgeFluidTest.status(),
    lighting:window.__WyrmforgeFluidTest.lightingStatus(),
    hud:document.querySelector('#play-hud-details')?.textContent?.slice(0,600)
  }));
  report.initial=initial;
  await page.screenshot({
    path:folder+'/wyrm-lair-lava-initial.jpeg',type:'jpeg',quality:75
  });
  if(initial.status.kind!=='lava'||initial.status.wetColumns<6||
      initial.status.raisedSurfaceFaces<1||initial.status.fluidMeshBytes<64||
      initial.status.fluidMeshBytes>2*1024*1024){
    throw new Error('No bounded real molten river in Wyrm Lair: '+
      JSON.stringify(initial));
  }
  if(initial.lighting.sourceCells<1){
    throw new Error('Real lava lost molten surface emissive sources: '+
      JSON.stringify(initial.lighting));
  }
  await page.waitForFunction(initialSteps=>{
    const status=window.__WyrmforgeFluidTest?.status();
    return Boolean(status&&status.steps>=initialSteps+35&&!status.busy);
  },initial.status.steps,{timeout:120000});
  const after=await page.evaluate(()=>window.__WyrmforgeFluidTest.status());
  report.after=after;
  await page.screenshot({
    path:folder+'/wyrm-lair-lava-flow.jpeg',type:'jpeg',quality:75
  });
  // Compare actual projected native molten top faces with drawing enabled
  // versus disabled, freezing only the fluid simulation. Terrain, lighting,
  // world and camera remain unchanged, so dry rock cannot fake the signal.
  await page.evaluate(()=>window.__WyrmforgeFluidTest.hold(true));
  await page.waitForTimeout(150);
  const capRects=await page.evaluate(()=>window.__WyrmforgeFluidTest.capRects());
  const on=PNG.sync.read(await page.screenshot({
    type:'png',scale:'css',path:folder+'/lava-material-on.png'
  }));
  await page.evaluate(()=>window.__WyrmforgeFluidTest.overlay('no-draw'));
  await page.waitForTimeout(150);
  const off=PNG.sync.read(await page.screenshot({
    type:'png',scale:'css',path:folder+'/lava-material-off.png'
  }));
  await page.evaluate(()=>{
    window.__WyrmforgeFluidTest.overlay('on');
    window.__WyrmforgeFluidTest.hold(false);
  });
  if(on.width!==off.width||on.height!==off.height||
      capRects.length<10){
    throw new Error('Real physical molten top-face mask unavailable');
  }
  const mask=new Uint8Array(on.width*on.height);
  for(const {left,right,top,bottom} of capRects){
    for(let y=Math.max(0,Math.floor(top));y<Math.min(on.height,Math.ceil(bottom));y++){
      for(let x=Math.max(0,Math.floor(left));x<Math.min(on.width,Math.ceil(right));x++){
        mask[y*on.width+x]=1;
      }
    }
  }
  let changed=0,dark=0,hot=0,covered=0;
  for(let i=0;i<mask.length;i++){
    if(!mask[i])continue;
    covered++;
    const j=i*4,r=on.data[j],g=on.data[j+1],b=on.data[j+2];
    const difference=Math.abs(r-off.data[j])+
      Math.abs(g-off.data[j+1])+Math.abs(b-off.data[j+2]);
    if(difference<22)continue;
    changed++;
    if(r<105&&g<90&&b<90)dark++;
    if(r>145&&r>g*1.4&&g>b*.9)hot++;
  }
  report.visualCrust={capRects:capRects.length,covered,changed,dark,hot,
    darkRatio:changed?dark/changed:0,hotRatio:changed?hot/changed:0};
  console.log('LAVA_V2_VISIBLE_CRUST '+JSON.stringify(report.visualCrust));
  if(covered<500||changed<120||dark<35||hot<20){
    throw new Error('Native lava lacks visible cold rafts and hot fractures: '+
      JSON.stringify(report.visualCrust));
  }
  if(after.lavaAtlasBytes!==256*256*4){
    throw new Error('Molten atlas missing or unbounded: '+after.lavaAtlasBytes);
  }
  if(after.kind!=='lava'||after.steps<initial.status.steps+35||
      after.wetColumns<1||after.raisedSurfaceFaces<1||
      after.fluidGpuAllocations>initial.status.fluidGpuAllocations+2||
      after.fluidMeshBytes>2*1024*1024){
    throw new Error('Molten river did not remain a bounded actual Hunt fluid: '+
      JSON.stringify({initial:initial.status,after}));
  }
  if(report.errors.length){
    throw new Error('Actual Wyrm Lair emitted runtime errors: '+
      JSON.stringify(report.errors.slice(0,8)));
  }
  console.log('LAVA_V2_REAL_HUNT_PASS '+JSON.stringify({
    kind:after.kind,steps:after.steps,wet:after.wetColumns,
    physicalFaces:after.raisedSurfaceFaces,flowingFalls:after.waterfallFaces,
    meshBytes:after.fluidMeshBytes,gpuAllocations:after.fluidGpuAllocations,
    emittingCells:initial.lighting.sourceCells
  }));
} catch(error){
  report.failure=String(error?.stack??error);
  console.error('LAVA_V2_REAL_HUNT_FAIL '+report.failure);
  throw error;
} finally{
  await writeFile(folder+'/result.json',JSON.stringify(report,null,2));
  await browser?.close().catch(()=>{});
  server.kill('SIGTERM');
}
