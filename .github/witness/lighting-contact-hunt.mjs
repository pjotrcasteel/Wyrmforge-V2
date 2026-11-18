// Actual Play Hunt L10-05 visual witness: identical live scene, shadow on/off.
// Screenshot the transparent Canvas overlay rather than trusting unit-only stamps.
// SwiftShader gives render coverage evidence, not mobile CPU/GPU acceptance.
import {chromium} from 'playwright-core';
import {PNG} from 'pngjs';
import {spawn} from 'node:child_process';
import {mkdir,writeFile} from 'node:fs/promises';

const port=8149,base='http://127.0.0.1:'+port,folder='lighting-contact-evidence';
await mkdir(folder,{recursive:true});
const server=spawn('python3',['-m','http.server',String(port),'--bind','127.0.0.1'],{
  stdio:['ignore','pipe','pipe']
});
let browser,failed=null;
const result={schema:'wyrmforge.contact-shadow-browser.v1',device:'desktop Chromium SwiftShader',errors:[]};
try{
  let ready=false;
  for(let i=0;i<90;i++){
    try{const check=await fetch(base+'/play-hunt.html');if(check.ok){ready=true;break;}}catch{}
    await new Promise(resolve=>setTimeout(resolve,100));
  }
  if(!ready)throw new Error('Static browser server never started');
  browser=await chromium.launch({
    executablePath:process.env.CHROME_BIN??'/usr/bin/google-chrome',headless:true,
    args:['--enable-webgl','--use-angle=swiftshader','--enable-unsafe-swiftshader',
      '--disable-gpu-sandbox','--disable-dev-shm-usage','--no-sandbox']
  });
  const context=await browser.newContext({
    viewport:{width:402,height:874},deviceScaleFactor:1.5,isMobile:true,hasTouch:true,reducedMotion:'reduce'
  });
  const page=await context.newPage();
  page.on('pageerror',error=>result.errors.push(error.message));
  await page.goto(base+'/play-hunt.html?contactShadowTest=1',{
    waitUntil:'domcontentloaded',timeout:30000
  });
  try{
    await page.waitForFunction(()=>window.__WyrmforgeContactShadowTest?.status().ready,
      null,{timeout:90000});
  }catch(error){
    result.startup={hud:await page.locator('#play-hud-details').textContent(),errors:result.errors};
    throw error;
  }
  await page.waitForTimeout(600);
  result.on=await page.evaluate(()=>window.__WyrmforgeContactShadowTest.status());
  await page.screenshot({path:folder+'/game-on.png',type:'png',timeout:25000});
  const canvas=page.locator('#combat-guide');
  const on=PNG.sync.read(await canvas.screenshot({path:folder+'/overlay-on.png',timeout:25000}));
  await page.evaluate(()=>window.__WyrmforgeContactShadowTest.toggle(false));
  await page.waitForTimeout(220);
  result.off=await page.evaluate(()=>window.__WyrmforgeContactShadowTest.status());
  const off=PNG.sync.read(await canvas.screenshot({path:folder+'/overlay-off.png',timeout:25000}));
  if(on.width!==off.width||on.height!==off.height)throw new Error('Nonmatching image sizes');
  let changed=0,difference=0;let minX=on.width,minY=on.height,maxX=0,maxY=0;
  for(let y=0;y<on.height;y++)for(let x=0;x<on.width;x++){
    const i=(y*on.width+x)*4;
    const delta=Math.abs(on.data[i]-off.data[i])+Math.abs(on.data[i+1]-off.data[i+1])+
      Math.abs(on.data[i+2]-off.data[i+2])+Math.abs(on.data[i+3]-off.data[i+3]);
    if(delta>12){changed++;difference+=delta;minX=Math.min(minX,x);minY=Math.min(minY,y);
      maxX=Math.max(maxX,x);maxY=Math.max(maxY,y);}
  }
  result.visual={changedPixels:changed,totalDifference:difference,
    bounds:changed?{minX,minY,maxX,maxY}:null,overlaySize:[on.width,on.height]};
  console.log('CONTACT_SHADOW_WITNESS '+JSON.stringify({
    on:result.on,off:result.off,visual:result.visual,errors:result.errors
  }));
  if(result.errors.length)throw new Error('Browser errors: '+result.errors.join('; ').slice(0,700));
  if(!result.on.contact?.frameStamps)throw new Error('Play Hunt rendered ZERO contact stamps');
  if(changed<20)throw new Error('Contact shadow has no meaningful actual Canvas screenshot difference');
}catch(error){failed=String(error.stack??error);result.failed=failed;console.error('CONTACT_SHADOW_FAILURE '+failed);}
finally{
  await writeFile(folder+'/report.json',JSON.stringify(result,null,2));
  await browser?.close().catch(()=>{});
  server.kill('SIGTERM');
}
if(failed)process.exitCode=1;
