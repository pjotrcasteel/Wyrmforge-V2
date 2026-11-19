// Targeted actual-Play-Hunt seed-7 Wet Forest entry screenshot at the same
// north-west rock cut reported by the owner. The one-time test-only hook is
// injected into the served module by Playwright, never shipped in production.
import {chromium} from 'playwright-core';
import {spawn} from 'node:child_process';
import {mkdir,writeFile} from 'node:fs/promises';

const folder='forest-arrival-erosion-evidence',port=8171,origin='http://127.0.0.1:'+port;
const server=spawn('python3',['-m','http.server',String(port),'--bind','127.0.0.1'],{
  stdio:['ignore','pipe','pipe']
});
await mkdir(folder,{recursive:true});
const report={schema:'wyrmforge.h08-forest-arrival-geology.v1',seed:7,
  targetActor:[-1,-4],errors:[],screens:[],note:'Software Chromium, not device GPU acceptance'};
let browser;
try {
  let up=false;
  for(let i=0;i<80;i++){
    try {if((await fetch(origin+'/play-hunt.html')).ok){up=true;break;}}catch{}
    await new Promise(resolve=>setTimeout(resolve,100));
  }
  if(!up)throw Error('Play Hunt static host unavailable');
  browser=await chromium.launch({
    headless:true,executablePath:process.env.CHROME_BIN??'/usr/bin/google-chrome',
    args:['--enable-webgl','--use-angle=swiftshader','--enable-unsafe-swiftshader',
      '--disable-gpu-sandbox','--disable-dev-shm-usage','--no-sandbox']
  });
  const context=await browser.newContext({viewport:{width:402,height:874},
    isMobile:true,hasTouch:true,deviceScaleFactor:1,reducedMotion:'reduce'});
  const page=await context.newPage();
  page.on('pageerror',e=>report.errors.push(e.message));
  await page.route('**/external-terrain-lab.mjs',async route=>{
    const source=await route.fetch();
    const original=await source.text();
    const anchor='function resetPlayActor() {';
    if(!original.includes(anchor))throw Error('WorldGen Hunt witness hook insertion anchor missing');
    const probe=`
window.__WyrmforgeEntryGeologyWitness={
  status:()=>({
    ready:Boolean(playActor&&active?.port&&renderer?.ready&&
      renderer.statistics.triangles>1000&&!pendingMesh&&!pendingEdit&&!playActor.error),
    actor:playActor?{x:playActor.x,y:playActor.y,z:playActor.z}:null,
    frame:playWoodlandPaintStats.snapshot.frames,
    triangles:renderer?.statistics.triangles??0,
    worldVersion:generatedSite?.generatorVersion??null,
    foot:playActor&&playView?projectVoxel(playActor.x,playActor.y,playActor.z,playView):null
  }),
  inspect:(x,z)=>{
    if(!playActor||!active?.port)return false;
    // Spawn through actual Voxel actor rules, not by mutating a running
    // actor state with incompatible old-position/collision metadata.
    const bounds=playConnected?.footprint??generatedSite?.layout?.footprint;
    if(!bounds)return false;
    const region={bounds,origin:{x:0,z:0}};
    const actor=spawnHuntExplorer(active.world,region,{
      direction:'south',at:{x:x-.5,z:z+2}
    });
    if(actor.error)return false;
    playActor=actor;
    playFollowCamera.reset(playActor);
    resetPlayInput();
    return true;
  },
  shadows:(enabled)=>{
    contactShadowsEnabled=Boolean(enabled);
    directionalShadowsEnabled=Boolean(enabled);
  }
};`;
    await route.fulfill({response:source,body:original+'\n'+probe});
  });
  await page.goto(origin+'/play-hunt.html?terrainNormalTest=1',
    {waitUntil:'domcontentloaded',timeout:30000});
  await page.waitForFunction(()=>window.__WyrmforgeEntryGeologyWitness?.status().ready,
    null,{timeout:150000});
  const initial=await page.evaluate(()=>window.__WyrmforgeEntryGeologyWitness.status());
  report.initial=initial;
  const moved=await page.evaluate(()=>
    window.__WyrmforgeEntryGeologyWitness.inspect(-1,-4));
  if(!moved)throw Error('Cannot locate real bedrock for northern fissure spectator anchor');
  await page.waitForFunction(()=>{
    const status=window.__WyrmforgeEntryGeologyWitness.status();
    return status.ready&&Math.abs(status.actor.x+1)<.2&&
      Math.abs(status.actor.z+4)<.2&&status.foot&&
      Math.abs(status.foot.x-201)<20;
  },null,{timeout:60000});
  const snap=async(name,enabled)=>{
    await page.evaluate(on=>window.__WyrmforgeEntryGeologyWitness.shadows(on),enabled);
    const previous=await page.evaluate(()=>
      window.__WyrmforgeEntryGeologyWitness.status().frame);
    await page.waitForFunction(old=>
      window.__WyrmforgeEntryGeologyWitness.status().frame>old,
      previous,{timeout:45000});
    const file=folder+'/'+name+'.png';
    await page.screenshot({path:file,type:'png',scale:'css',timeout:60000});
    report.screens.push({name,enabled,
      status:await page.evaluate(()=>window.__WyrmforgeEntryGeologyWitness.status())});
  };
  await snap('arrival-fissure-seed7-shadows-on',true);
  await snap('arrival-fissure-seed7-shadows-off',false);
  if(report.errors.length)throw Error('Browser errors '+report.errors.join('; '));
  if(report.screens.some(s=>s.status.triangles<1000))throw Error('Nonphysical/unloaded terrain');
  console.log('FOREST_ARRIVAL_GEOLOGY '+JSON.stringify({
    worldVersion:report.screens[0].status.worldVersion,
    physicalTriangles:report.screens[0].status.triangles,
    actor:report.screens[0].status.actor,
    errorCount:report.errors.length
  }));
} catch(error){
  report.failure=String(error.stack??error);
  console.error('FOREST_ARRIVAL_GEOLOGY_FAIL '+report.failure);
  process.exitCode=1;
} finally {
  await writeFile(folder+'/report.json',JSON.stringify(report,null,2));
  await browser?.close().catch(()=>{});
  server.kill('SIGTERM');
}
