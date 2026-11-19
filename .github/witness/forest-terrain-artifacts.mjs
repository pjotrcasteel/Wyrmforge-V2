// Compare actual Wet Forest's brown cliff panels against contact/directional
// shadows on the SAME Voxel scene. This is an opt-in graphical regression,
// not a synthetic shadow map.
import {chromium} from 'playwright-core';
import {spawn} from 'node:child_process';
import {mkdir,writeFile} from 'node:fs/promises';
const out='forest-terrain-artifacts-evidence',port=8163,base='http://127.0.0.1:'+port;
await mkdir(out,{recursive:true});
const server=spawn('python3',['-m','http.server',String(port),'--bind','127.0.0.1'],{
  stdio:['ignore','pipe','pipe']
});
const report={schema:'wyrmforge.forest-terrain-panels.v1',shots:[],errors:[]};
let browser;
try{
  let live=false;
  for(let i=0;i<70;i++){
    try{if((await fetch(base+'/play-hunt.html')).ok){live=true;break;}}catch{}
    await new Promise(resolve=>setTimeout(resolve,100));
  }
  if(!live)throw Error('Play Hunt host unavailable');
  browser=await chromium.launch({headless:true,
    executablePath:process.env.CHROME_BIN??'/usr/bin/google-chrome',
    args:['--enable-webgl','--use-angle=swiftshader','--enable-unsafe-swiftshader',
      '--disable-gpu-sandbox','--disable-dev-shm-usage','--no-sandbox']});
  const context=await browser.newContext({
    viewport:{width:402,height:874},deviceScaleFactor:1,
    isMobile:true,hasTouch:true,reducedMotion:'reduce'});
  const page=await context.newPage();
  page.on('pageerror',e=>report.errors.push(e.message));
  await page.goto(base+'/play-hunt.html?directionalShadowTest=1&contactShadowTest=1',
    {waitUntil:'domcontentloaded',timeout:30000});
  await page.waitForFunction(()=>{
    const c=window.__WyrmforgeContactShadowTest?.status();
    const d=window.__WyrmforgeDirectionalShadowTest?.status();
    return c?.ready&&d?.ready&&c.residentProps.length>=1;
  },null,{timeout:150000});
  await page.waitForTimeout(2400);
  const witness=async(name,contact,directional)=>{
    const status=await page.evaluate(({contact,directional})=>{
      window.__WyrmforgeContactShadowTest.toggle(contact);
      window.__WyrmforgeDirectionalShadowTest.toggle(directional);
      return {contact:window.__WyrmforgeContactShadowTest.status(),
        directional:window.__WyrmforgeDirectionalShadowTest.status()};
    },{contact,directional});
    await page.waitForTimeout(800);
    const bytes=await page.screenshot({type:'png',scale:'css',timeout:60000});
    await writeFile(out+'/'+name+'.png',bytes);
    report.shots.push({name,contact,directional,bytes:bytes.length,
      visibleProps:status.contact.residentProps.filter(p=>p.visible).length,
      shadowStamps:status.directional.direction?.frameStamps,
      contactStamps:status.contact.contact?.frameStamps});
  };
  await witness('all-shadows-on',true,true);
  await witness('all-shadows-off',false,false);
  await witness('only-directional',false,true);
  await witness('only-contact',true,false);
  if(report.errors.length)throw Error('Browser errors: '+report.errors.join('; '));
  if(report.shots.length!==4)throw Error('Incomplete same-world comparison');
  console.log('FOREST_TERRAIN_SHADOW_PROOF '+JSON.stringify(report.shots));
}catch(error){
  report.failure=String(error.stack??error);
  console.error('FOREST_TERRAIN_SHADOW_FAIL '+report.failure);
  process.exitCode=1;
}finally{
  await writeFile(out+'/report.json',JSON.stringify(report,null,2));
  await browser?.close().catch(()=>{});
  server.kill('SIGTERM');
}
