// WAT-15a focused browser acceptance: the real opt-in Play Hunt terrain,
// projectile, fluid engine and save/reload path. The larger waterfall pixel
// comparison remains independent in water-play-hunt-browser.mjs.
import {chromium} from 'playwright-core';
import {spawn} from 'node:child_process';
import {mkdir,writeFile} from 'node:fs/promises';
import {resolve} from 'node:path';

const port=8129;
const base='http://127.0.0.1:'+port;
const artifact=resolve('water-lifecycle-evidence');
await mkdir(artifact,{recursive:true});
const server=spawn('python3',['-m','http.server',String(port),'--bind','127.0.0.1'],{
  stdio:['ignore','ignore','pipe']
});
let serverError='';
server.stderr.on('data',part=>{serverError+=String(part);});
let browser;
let page;
const report={
  schema:'wyrmforge.water-streamed-lifecycle-browser.v1',
  scenario:'real Play Hunt connected-river bank Fireball -> reload',
  errors:[],screenshots:[]
};
const status=()=>page.evaluate(()=>window.__WyrmforgeStreamWaterTest?.status()??null);
async function screenshot(name){
  try{
    await page.screenshot({path:artifact+'/'+name+'.jpeg',type:'jpeg',quality:65,timeout:20000});
    report.screenshots.push(name+'.jpeg');
  }catch(error){
    // SwiftShader whole-scene screenshot stalls are independently tracked
    // under #358. Functional water acceptance never fabricates an image.
    report.errors.push('screenshot '+name+': '+error.message);
    console.warn('WAT15A_OPTIONAL_SCREENSHOT_FAILED '+name+' '+error.message);
  }
}
try{
  let available=false;
  for(let i=0;i<50;i++){
    try{
      const response=await fetch(base+'/play-hunt.html');
      if(response.ok){available=true;break;}
    }catch{}
    await new Promise(done=>setTimeout(done,100));
  }
  if(!available)throw new Error('Local Play Hunt unavailable: '+serverError);
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
  page=await context.newPage();
  page.setDefaultTimeout(120000);
  page.on('pageerror',error=>report.errors.push('page: '+error.message));
  page.on('response',response=>{
    if(response.status()>=400&&!new URL(response.url()).pathname.endsWith('/favicon.ico')){
      report.errors.push('HTTP '+response.status()+' '+response.url());
    }
  });
  await page.goto(base+'/play-hunt.html?water=1&fluidTest=auto',{
    waitUntil:'domcontentloaded',timeout:30000
  });
  await page.waitForFunction(()=>{
    const state=window.__WyrmforgeStreamWaterTest?.status();
    return Boolean(state&&!state.error&&!state.busy&&
      state.activeRegions?.length>=3&&
      state.activeRegions.some(id=>id.startsWith('link-'))&&
      state.seamLinks===2&&state.seamTransferred>0&&
      state.topFaces>0&&state.fluidMeshBytes>0);
  },null,{timeout:140000});
  report.before=await status();
  console.log('WAT15A_CONNECTED_RIVER_READY '+JSON.stringify({
    activeRegions:report.before.activeRegions,
    seamLinks:report.before.seamLinks,
    seamTransferred:report.before.seamTransferred,
    wetColumns:report.before.wetColumns,
    topFaces:report.before.topFaces
  }));
  const cast=await page.evaluate(()=>window.__WyrmforgeStreamWaterTest.castBank());
  if(!cast?.target||!cast?.shore)throw new Error('Real raycast target absent');
  report.cast=cast;
  await page.waitForFunction(before=>{
    const current=window.__WyrmforgeStreamWaterTest?.status();
    return Boolean(current&&!current.error&&!current.busy&&
      current.fireballs>before.fireballs&&
      current.terrainRemovedCells>before.terrainRemovedCells&&
      current.lastImpactRemoved>0);
  },report.before,{timeout:120000}).catch(async error=>{
    throw new Error('In-game Fireball did not carve the riverbank: '+
      JSON.stringify({cast,state:await status()})+' | '+error.message);
  });
  const editStatus=await status();
  report.advanced=await page.evaluate(()=>
    window.__WyrmforgeStreamWaterTest.advanceFluid(180));
  report.after=await status();
  if(report.after.wetOutsideAuthored<=report.before.wetOutsideAuthored){
    throw new Error('Connected river never wets newly carved ground: '+
      JSON.stringify({before:report.before,after:report.after,cast}));
  }
  report.bankVoxel=await page.evaluate(cell=>
    window.__WyrmforgeStreamWaterTest.inspectCell(cell.x,cell.y,cell.z),cast.target);
  if(report.bankVoxel.material!==0||!report.bankVoxel.savedRemoved){
    throw new Error('Voxel crater missing from native terrain save: '+
      JSON.stringify(report.bankVoxel));
  }
  console.log('WAT15A_REAL_FIREBALL_PASS '+JSON.stringify({
    removedVoxels:editStatus.lastImpactRemoved,
    newlyWetColumns:report.after.wetOutsideAuthored-
      report.before.wetOutsideAuthored,
    savedVoxel:report.bankVoxel.savedRemoved,
    activeRegions:report.after.activeRegions
  }));
  const saved=await page.evaluate(()=>window.__WyrmforgeStreamWaterTest.save());
  if(!saved.ok||saved.regionSteps.length<3){
    throw new Error('Three-band river failed its browser save checkpoint: '+JSON.stringify(saved));
  }
  report.saved=saved;
  // A full browser reload creates new Voxel + Water V2 engine instances;
  // it is NOT an in-memory reset of the test harness.
  await page.reload({waitUntil:'domcontentloaded',timeout:30000});
  await page.waitForFunction(prior=>{
    const state=window.__WyrmforgeStreamWaterTest?.status();
    return Boolean(state&&!state.error&&state.restored&&
      state.activeRegions.length>=3&&state.seamLinks===2&&
      state.topFaces>0&&prior.every(region=>
        state.regionSteps.some(next=>next.id===region.id&&next.steps>=region.steps)));
  },saved.regionSteps,{timeout:140000});
  report.reloaded=await status();
  report.reloadedBank=await page.evaluate(cell=>
    window.__WyrmforgeStreamWaterTest.inspectCell(cell.x,cell.y,cell.z),cast.target);
  if(report.reloadedBank.material!==0||!report.reloadedBank.savedRemoved){
    throw new Error('Full reload lost actual Fireball-carved Voxel: '+
      JSON.stringify({before:report.bankVoxel,after:report.reloadedBank}));
  }
  await screenshot('connected-river-after-reload');
  if(report.errors.some(error=>!error.startsWith('screenshot '))){
    throw new Error('Actual Play Hunt reported browser errors: '+
      JSON.stringify(report.errors));
  }
  console.log('WAT15A_RELOAD_PASS '+JSON.stringify({
    savedSteps:saved.regionSteps,
    reloadedSteps:report.reloaded.regionSteps,
    restored:report.reloaded.restored,
    bankSaved:report.reloadedBank.savedRemoved,
    screenshots:report.screenshots.length
  }));
  console.log('WAT15A_BROWSER_PASS');
}catch(error){
  report.failure=error.stack??String(error);
  try{report.lastStatus=await status();}catch{}
  console.error('WAT15A_BROWSER_FAIL '+report.failure);
  process.exitCode=1;
}finally{
  await writeFile(artifact+'/report.json',JSON.stringify(report,null,2));
  await page?.close().catch(()=>{});
  await browser?.close().catch(()=>{});
  server.kill('SIGTERM');
}
