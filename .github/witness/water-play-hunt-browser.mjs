// Automated Chromium smoke + evidence for the ACTUAL Play Hunt page.
// Uses the regular WorldGen -> Voxel -> Fireball edit -> Water V2 -> renderer path.
// Run: npm i --no-save playwright-core@1.56.1 && node .github/witness/water-play-hunt-browser.mjs
import {chromium} from 'playwright-core';
import {PNG} from 'pngjs';
import {spawn} from 'node:child_process';
import {mkdir,writeFile} from 'node:fs/promises';
import {resolve} from 'node:path';

const port=8117;
const base='http://127.0.0.1:'+port;
const artifacts=resolve('fluid-browser-evidence');
await mkdir(artifacts,{recursive:true});
const server=spawn('python3',['-m','http.server',String(port),'--bind','127.0.0.1'],{
  stdio:['ignore','pipe','pipe']
});
let serverErrors='';
server.stderr.on('data',chunk=>{serverErrors+=String(chunk);});
let browser;
const report={schema:'wyrmforge.fluid-browser-evidence.v1',scenario:'real Play Hunt riverbank',errors:[]};
let page;
try{
  let ready=false;
  for(let i=0;i<50;i++){
    try{const r=await fetch(base+'/play-hunt.html');if(r.ok){ready=true;break;}}catch{}
    await new Promise(res=>setTimeout(res,100));
  }
  if(!ready)throw new Error('Local Play Hunt server unavailable: '+serverErrors);
  const executablePath=process.env.CHROME_BIN || '/usr/bin/chromium';
  browser=await chromium.launch({
    headless:true,executablePath,args:[
      '--enable-webgl','--use-angle=swiftshader','--enable-unsafe-swiftshader',
      '--disable-gpu-sandbox','--disable-dev-shm-usage','--no-sandbox'
    ]
  });
  const context=await browser.newContext({
    viewport:{width:402,height:874},deviceScaleFactor:1.5,
    isMobile:true,hasTouch:true,reducedMotion:'reduce'
  });
  page=await context.newPage();
  page.on('pageerror',error=>report.errors.push('page: '+error.message));
  page.on('response',response=>{
    if(response.status()>=400 && !new URL(response.url()).pathname.endsWith('/favicon.ico')){
      report.errors.push('resource HTTP '+response.status()+': '+response.url());
    }
  });
  page.on('console',message=>{
    // Chrome emits a URL-less console error when an optional favicon is 404.
    // HTTP responses above retain exact URLs, so other 404s still fail CI.
    if(message.type()==='error'&&!message.text().includes('404 (File not found)')){
      report.errors.push('console: '+message.text());
    }
  });
  await page.goto(base+'/play-hunt.html?route=forest&stop=0&fluidTest=auto',{
    waitUntil:'domcontentloaded',timeout:30000
  });
  try{
    await page.waitForFunction(()=>{
      return document.querySelector('#play-hud-details')?.textContent?.includes('Water V2:') &&
        !!window.__WyrmforgeFluidTest;
    },null,{timeout:30000});
  }catch(error){
    const diagnostics=await page.evaluate(()=>({
      readyState:document.readyState,
      hud:document.querySelector('#play-hud-details')?.textContent?.slice(0,500)??null,
      summary:document.querySelector('#site-summary')?.textContent?.slice(0,400)??null,
      debugText:document.body?.innerText?.slice(-1500)??null,
      canvasSize:document.querySelector('#site-view')?.width??null,
      hookReady:Boolean(window.__WyrmforgeFluidTest)
    }));
    report.startup={diagnostics,errors:[...report.errors]};
    console.error('FLUID_BROWSER_STARTUP_DIAGNOSTICS '+JSON.stringify(report.startup));
    await page.screenshot({path:artifacts+'/startup-failure.jpeg',type:'jpeg',quality:65});
    throw error;
  }
  const before=await page.evaluate(()=>window.__WyrmforgeFluidTest.status());
  report.before=before;
  if(before.wetColumns<8||before.worldRevision<1){
    throw new Error('Real generated river did not seed in browser: '+JSON.stringify(before));
  }
  await page.screenshot({path:artifacts+'/forest-before.jpeg',type:'jpeg',quality:67});
  // User's native iPhone report includes 18 real Fireballs and a fragmented
  // shoreline. Exercise three distinct craters automatically, not merely one
  // synthetic unit-test basin, to catch stale flow/rendering and GPU leaks.
  const edits=[],observations=[];
  for(let shot=0;shot<3;shot++){
    await page.waitForFunction(()=>!window.__WyrmforgeFluidTest?.status().busy,
      null,{timeout:120000});
    const atRest=await page.evaluate(()=>window.__WyrmforgeFluidTest.status());
    const edit=await page.evaluate(()=>window.__WyrmforgeFluidTest.breach());
    if(!edit?.removedVoxels){
      throw new Error('Real Fireball-style bank edit '+(shot+1)+' removed no solid voxels');
    }
    edits.push(edit);
    await page.waitForFunction(initial=>{
      const state=window.__WyrmforgeFluidTest?.status();
      return Boolean(state&&state.steps>=initial.steps+65&&!state.busy);
    },atRest,{timeout:120000});
    const state=await page.evaluate(()=>window.__WyrmforgeFluidTest.status());
    if(state.fluidMeshBytes>2*1024*1024){
      throw new Error('Fluid GPU mesh exceeded the independent 2MiB budget');
    }
    if(state.breachCount!==shot+1){
      throw new Error('Repeatable witness failed to count independent craters');
    }
    observations.push(state);
    await page.screenshot({
      path:artifacts+'/forest-impact-'+(shot+1)+'.jpeg',type:'jpeg',quality:67
    });
  }
  const edit=edits[0],after=observations.at(-1);
  report.edit=edit;
  report.edits=edits;
  report.observations=observations;
  report.after=after;
  console.log('FLUID_BROWSER_MEASUREMENTS '+JSON.stringify({before,edits,observations,after}));
  await page.screenshot({path:artifacts+'/forest-after.jpeg',type:'jpeg',quality:67});
  // Actual appearance gate: compare the *same game frame* with only the
  // waterfall ribbons enabled/disabled. Count changed pixels specifically
  // inside their projected bounds, not in unrelated water or moving HUD.
  await page.evaluate(()=>window.__WyrmforgeFluidTest.hold(true));
  await page.waitForTimeout(180);
  const rects=await page.evaluate(()=>window.__WyrmforgeFluidTest.ribbonRects());
  if(rects.length<1)throw new Error('No projected falling ribbon intersects the Hunt camera');
  const beforeRibbon=PNG.sync.read(await page.screenshot({type:'png',scale:'css'}));
  await page.evaluate(()=>window.__WyrmforgeFluidTest.ribbons(false));
  await page.waitForTimeout(180);
  const noRibbon=PNG.sync.read(await page.screenshot({type:'png',scale:'css'}));
  await page.evaluate(()=>window.__WyrmforgeFluidTest.ribbons(true));
  if(beforeRibbon.width!==noRibbon.width||beforeRibbon.height!==noRibbon.height){
    throw new Error('Screenshot sizes changed while toggling only the waterfall');
  }
  const width=beforeRibbon.width,height=beforeRibbon.height;
  const marked=new Uint8Array(width*height);
  for(const {left,right,top,bottom} of rects){
    for(let y=Math.max(0,Math.floor(top));y<Math.min(height,Math.ceil(bottom));y++){
      for(let x=Math.max(0,Math.floor(left));x<Math.min(width,Math.ceil(right));x++){
        marked[y*width+x]=1;
      }
    }
  }
  let maskedPixels=0,changedPixels=0,colorDelta=0;
  for(let i=0;i<marked.length;i++){
    if(!marked[i])continue;
    maskedPixels++;
    const offset=i*4;
    const diff=Math.abs(beforeRibbon.data[offset]-noRibbon.data[offset])+
      Math.abs(beforeRibbon.data[offset+1]-noRibbon.data[offset+1])+
      Math.abs(beforeRibbon.data[offset+2]-noRibbon.data[offset+2]);
    if(diff>=36){
      changedPixels++;
      colorDelta+=diff;
    }
  }
  report.visual={projectedRibbonBounds:rects.length,maskedPixels,changedPixels,colorDelta};
  console.log('FLUID_BROWSER_VISIBLE_FALL '+JSON.stringify(report.visual));
  if(maskedPixels<30||changedPixels<25){
    throw new Error('Fall geometry exists but is not visibly rendered in Hunt screenshot: '+
      JSON.stringify(report.visual));
  }
  // Landing acceptance must be independent of the waterfall visibility gate:
  // only lower-pool impact pixels change, while the falling ribbons,
  // authored water, fixed camera and frozen solver remain untouched.
  const landingRects=await page.evaluate(()=>window.__WyrmforgeFluidTest.landingRects());
  if(landingRects.length<1)throw new Error('No real wet waterfall landing is projected on Hunt camera');
  const landingOn=PNG.sync.read(await page.screenshot({
    path:artifacts+'/landing-on.png',type:'png',scale:'css'
  }));
  await page.evaluate(()=>window.__WyrmforgeFluidTest.landing(false));
  await page.waitForTimeout(180);
  const landingOff=PNG.sync.read(await page.screenshot({
    path:artifacts+'/landing-off.png',type:'png',scale:'css'
  }));
  await page.evaluate(()=>{
    window.__WyrmforgeFluidTest.landing(true);
    window.__WyrmforgeFluidTest.hold(false);
  });
  if(landingOn.width!==landingOff.width||landingOn.height!==landingOff.height){
    throw new Error('Landing comparison screenshot sizes changed');
  }
  const landingMask=new Uint8Array(landingOn.width*landingOn.height);
  for(const {left,right,top,bottom} of landingRects){
    for(let y=Math.max(0,Math.floor(top));y<Math.min(landingOn.height,Math.ceil(bottom));y++){
      for(let x=Math.max(0,Math.floor(left));x<Math.min(landingOn.width,Math.ceil(right));x++){
        landingMask[y*landingOn.width+x]=1;
      }
    }
  }
  let landingPixels=0,landingChanged=0,landingDelta=0;
  for(let i=0;i<landingMask.length;i++){
    if(!landingMask[i])continue;
    landingPixels++;
    const offset=i*4;
    const diff=Math.abs(landingOn.data[offset]-landingOff.data[offset])+
      Math.abs(landingOn.data[offset+1]-landingOff.data[offset+1])+
      Math.abs(landingOn.data[offset+2]-landingOff.data[offset+2]);
    if(diff>=24){
      landingChanged++;
      landingDelta+=diff;
    }
  }
  report.landingVisual={
    projectedLandingBounds:landingRects.length,maskedPixels:landingPixels,
    changedPixels:landingChanged,colorDelta:landingDelta
  };
  console.log('FLUID_BROWSER_LANDING '+JSON.stringify(report.landingVisual));
  if(after.landingSplashFaces<16||landingPixels<12||landingChanged<8){
    throw new Error('The real lower-pool impact is not visibly rendered: '+
      JSON.stringify(report.landingVisual));
  }
  const image=await (await import('node:fs/promises')).readFile(artifacts+'/forest-after.jpeg');
  // An inline, compressed copy allows the assistant to actually inspect
  // the browser output from CI logs, instead of claiming visual verification.
  if(process.env.FLUID_BROWSER_INLINE_SNAPSHOT==='1'){
    console.log('FLUID_BROWSER_IMAGE_BASE64_START');
    console.log(image.toString('base64'));
    console.log('FLUID_BROWSER_IMAGE_BASE64_END');
  }
  if(after.steps<=before.steps)throw new Error('Fluid solver did not tick in the game');
  if(!after.liveFluidTexture)throw new Error('In-game fluid presentation was not bound');
  if(after.wetBeyondChannel<=before.wetBeyondChannel){
    throw new Error('Breach did not wet any new cells beyond the WorldGen river: '+JSON.stringify({before,after}));
  }
  if(after.raisedSurfaceFaces<1)throw new Error('Actual liquid surface mesh did not render in browser');
  // At least one of the real Fireball breaches must connect an upper,
  // flowing column to an actually wet lower pool. Static cliff faces are
  // never counted as Water V2 waterfalls.
  const fallingFrames=observations.filter(item=>item.waterfallFaces>0);
  if(!fallingFrames.length)throw new Error(
    'No physically connected wet-to-wet waterfall after three real bank breaches: '+
    JSON.stringify(observations.map(item=>({
      step:item.steps,waterfallFaces:item.waterfallFaces,
      wetBeyondChannel:item.wetBeyondChannel
    })))
  );
  if(after.refinedShoreColumns<1){
    throw new Error('The 10cm bank micro-contours did not reach the real game');
  }
  if(after.fluidMeshBytes<=0){
    throw new Error('The actual water mesh did not allocate any geometry');
  }
  if(report.errors.length)throw new Error('Game browser errors: '+report.errors.join('; ').slice(0,800));
  console.log('FLUID_BROWSER_PASS '+JSON.stringify({before,edit,after}));
}catch(error){
  report.failed=String(error.stack||error);
  console.error('FLUID_BROWSER_FAIL '+report.failed);
  process.exitCode=1;
}finally{
  await writeFile(artifacts+'/report.json',JSON.stringify(report,null,2));
  await browser?.close();
  server.kill('SIGTERM');
}
