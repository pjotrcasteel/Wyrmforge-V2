// Actual seeded Play Hunt normal-texture integration. No synthetic shader
// plane: captured terrain, camera, Water and tree rendering all stay real.
// This is a software-Chromium screenshot gate, not physical-device approval.
import {chromium} from 'playwright-core';
import {PNG} from 'pngjs';
import {spawn} from 'node:child_process';
import {mkdir,writeFile} from 'node:fs/promises';

const folder='terrain-normal-evidence',port=8169;
const base='http://127.0.0.1:'+port;
const server=spawn('python3',['-m','http.server',String(port),'--bind','127.0.0.1'],{
  stdio:['ignore','pipe','pipe']
});
const result={schema:'wyrmforge.l10-08-normal-map.v1',viewport:[402,874],
  softwareBrowser:true,physicalIphoneAccepted:false,checks:[],errors:[]};
await mkdir(folder,{recursive:true});
let browser;
try{
  let live=false;
  for(let i=0;i<70;i++){
    try{if((await fetch(base+'/play-hunt.html')).ok){live=true;break;}}catch{}
    await new Promise(resolve=>setTimeout(resolve,100));
  }
  if(!live)throw new Error('Play Hunt host unavailable');
  browser=await chromium.launch({
    headless:true,executablePath:process.env.CHROME_BIN??'/usr/bin/google-chrome',
    args:['--enable-webgl','--use-angle=swiftshader','--enable-unsafe-swiftshader',
      '--disable-gpu-sandbox','--disable-dev-shm-usage','--no-sandbox']
  });
  const context=await browser.newContext({viewport:{width:402,height:874},
    isMobile:true,hasTouch:true,deviceScaleFactor:1,reducedMotion:'reduce'});
  const page=await context.newPage();
  page.on('pageerror',e=>result.errors.push(e.message));
  page.on('response',response=>{
    if(response.status()>=400&&!response.url().endsWith('favicon.ico')){
      result.errors.push('HTTP '+response.status()+' '+response.url());
    }
  });
  await page.goto(base+'/play-hunt.html?terrainNormalTest=1',
    {waitUntil:'domcontentloaded',timeout:30000});
  // GPU texture residency is not proof of gameplay: an early screenshot
  // once showed only "Loading 11% of terrain". Require an actual Voxel mesh,
  // the play actor and a settled WorldGen render (independent of Water).
  await page.waitForFunction(()=>{
    const st=window.__WyrmforgeTerrainNormalTest?.status();
    return st?.ready===true&&st.activeLayers===4&&
      st.uploadedTiles>=6&&st.pendingTiles===0&&
      st.worldReady&&st.renderedTriangles>0;
  },null,{timeout:150000});
  await page.waitForTimeout(900);
  const diagnostics=await page.evaluate(()=>
    window.__WyrmforgeTerrainNormalTest.status());
  result.diagnostics=diagnostics;
  if(!diagnostics.worldReady||diagnostics.renderedTriangles<1){
    throw new Error('No visible seeded Voxel WorldGen terrain was rendered');
  }
  for(const [name,enabled] of [['off',false],['on',true]]){
    await page.evaluate(enabled=>{
      window.__WyrmforgeTerrainNormalTest.setEnabled(enabled);
    },enabled);
    await page.waitForFunction(expected=>
      window.__WyrmforgeTerrainNormalTest.status().enabled===expected,
      enabled,{timeout:15000});
    await page.waitForTimeout(330);
    const image=await page.screenshot({type:'png',scale:'css',timeout:60000});
    const dimensions=PNG.sync.read(image);
    if(dimensions.width!==402||dimensions.height!==874) {
      throw new Error('Unexpected captured dimensions');
    }
    await writeFile(folder+'/wet-forest-seed7-normals-'+name+'.png',image);
    result.checks.push({name,enabled,imageBytes:image.length,
      uploadedNormalTiles:diagnostics.uploadedTiles,
      physicalWorldTriangles:diagnostics.renderedTriangles});
  }
  const off=PNG.sync.read(await import('node:fs/promises').then(x=>
    x.readFile(folder+'/wet-forest-seed7-normals-off.png')));
  const on=PNG.sync.read(await import('node:fs/promises').then(x=>
    x.readFile(folder+'/wet-forest-seed7-normals-on.png')));
  let changed=0;
  for(let i=0;i<off.data.length;i+=4){
    const delta=Math.abs(off.data[i]-on.data[i])+
      Math.abs(off.data[i+1]-on.data[i+1])+
      Math.abs(off.data[i+2]-on.data[i+2]);
    if(delta>=18)changed++;
  }
  result.changedPixels=changed;
  if(changed<500)throw new Error(
    'Real normal-texture toggle has no visible effect in Hunt ('+changed+' changed pixels)');
  if(result.errors.length)throw new Error('Browser errors '+result.errors.join('; '));
  console.log('HUNT_NORMAL_MAP_ON_OFF '+JSON.stringify({
    uploaded:diagnostics.uploadedTiles,active:diagnostics.activeLayers,
    worldTriangles:diagnostics.renderedTriangles,
    changedPixels:changed,files:result.checks.map(x=>x.name)
  }));
}catch(error){
  result.failure=String(error.stack??error);
  console.error('HUNT_NORMAL_MAP_FAIL '+result.failure);
  process.exitCode=1;
}finally{
  await writeFile(folder+'/report.json',JSON.stringify(result,null,2));
  await browser?.close().catch(()=>{});
  server.kill('SIGTERM');
}
