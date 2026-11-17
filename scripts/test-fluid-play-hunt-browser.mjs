// Automated Chromium smoke + evidence for the ACTUAL Play Hunt page.
// Uses the regular WorldGen -> Voxel -> Fireball edit -> Water V2 -> renderer path.
// Run: npm i --no-save playwright-core@1.56.1 && node scripts/test-fluid-play-hunt-browser.mjs
import {chromium} from 'playwright-core';
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
  page.on('console',message=>{
    if(message.type()==='error')report.errors.push('console: '+message.text());
  });
  await page.goto(base+'/play-hunt.html?route=forest&stop=0&fluidTest=auto',{
    waitUntil:'domcontentloaded',timeout:30000
  });
  await page.waitForFunction(()=>{
    return document.querySelector('#play-hud-details')?.textContent?.includes('Water V2:') &&
      !!window.__WyrmforgeFluidTest;
  },null,{timeout:120000});
  const before=await page.evaluate(()=>window.__WyrmforgeFluidTest.status());
  report.before=before;
  if(before.wetColumns<8||before.worldRevision<1){
    throw new Error('Real generated river did not seed in browser: '+JSON.stringify(before));
  }
  await page.screenshot({path:artifacts+'/forest-before.jpeg',type:'jpeg',quality:67});
  const edit=await page.evaluate(()=>window.__WyrmforgeFluidTest.breach());
  report.edit=edit;
  if(!edit?.removedVoxels)throw new Error('Real Fireball-style terrain edit removed no Voxel cells');
  await page.waitForFunction((initial)=>{
    const next=window.__WyrmforgeFluidTest?.status();
    return next?.steps>=initial.steps+80;
  },before,{timeout:120000});
  const after=await page.evaluate(()=>window.__WyrmforgeFluidTest.status());
  report.after=after;
  await page.screenshot({path:artifacts+'/forest-after.jpeg',type:'jpeg',quality:67});
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
  if(report.errors.length)throw new Error('Game browser console errors: '+report.errors.join('; ').slice(0,800));
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
