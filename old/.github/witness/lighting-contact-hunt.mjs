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
  // Browser SwiftShader can spend dozens of seconds filling initial terrain.
  // A ready actor is not enough: require resident visible props AND a completed
  // shadow frame before measuring the same scene on/off.
  await page.waitForFunction(()=>{
    const state=window.__WyrmforgeContactShadowTest.status();
    return state.residentProps.filter(prop=>prop.visible).length>=12 &&
      state.contact?.entries>=14 && state.contact.frameStamps>0 &&
      state.overlay.frames>=16;
  },null,{timeout:120000});
  result.on=await page.evaluate(()=>window.__WyrmforgeContactShadowTest.status());
  await page.screenshot({path:folder+'/game-on.png',type:'png',timeout:25000});
  // Read the Canvas2D layer's RAW RGBA bytes. Element screenshots include
  // WebGL terrain and transient HUD text behind it; those are NOT shadow pixels.
  const pixelLayer=async(name)=>{
    const data=await page.evaluate(()=>document.querySelector('#combat-guide').toDataURL('image/png'));
    const buffer=Buffer.from(data.slice(data.indexOf(',')+1),'base64');
    await writeFile(folder+'/'+name+'.png',buffer);
    return PNG.sync.read(buffer);
  };
  const on=await pixelLayer('overlay-on');
  await page.evaluate(()=>window.__WyrmforgeContactShadowTest.toggle(false));
  const previouslyRendered=result.on.overlay.frames;
  await page.waitForFunction(previous=>{
    const state=window.__WyrmforgeContactShadowTest.status();
    return state.overlay.frames>previous&&state.contact.frameStamps===0;
  },previouslyRendered,{timeout:60000});
  result.off=await page.evaluate(()=>window.__WyrmforgeContactShadowTest.status());
  const off=await pixelLayer('overlay-off');
  if(on.width!==off.width||on.height!==off.height)throw new Error('Nonmatching image sizes');
  let changed=0,difference=0;let minX=on.width,minY=on.height,maxX=0,maxY=0;
  for(let y=0;y<on.height;y++)for(let x=0;x<on.width;x++){
    const i=(y*on.width+x)*4;
    const delta=Math.abs(on.data[i]-off.data[i])+Math.abs(on.data[i+1]-off.data[i+1])+
      Math.abs(on.data[i+2]-off.data[i+2])+Math.abs(on.data[i+3]-off.data[i+3]);
    if(delta>12){changed++;difference+=delta;minX=Math.min(minX,x);minY=Math.min(minY,y);
      maxX=Math.max(maxX,x);maxY=Math.max(maxY,y);}
  }
  const roots=result.on.residentProps.filter(prop=>prop.visible&&prop.foot);
  let rootPixels=0;
  for(let y=0;y<on.height;y++)for(let x=0;x<on.width;x++){
    if(!roots.some(prop=>Math.abs(prop.foot.x-x)<35&&Math.abs(prop.foot.y-y)<27))continue;
    const i=(y*on.width+x)*4;
    const delta=Math.abs(on.data[i]-off.data[i])+Math.abs(on.data[i+1]-off.data[i+1])+
      Math.abs(on.data[i+2]-off.data[i+2])+Math.abs(on.data[i+3]-off.data[i+3]);
    if(delta>12)rootPixels++;
  }
  result.visual={changedPixels:changed,rootChangedPixels:rootPixels,totalDifference:difference,
    bounds:changed?{minX,minY,maxX,maxY}:null,overlaySize:[on.width,on.height],
    source:'raw Canvas2D pixels, not a composited screenshot'};
  console.log('CONTACT_SHADOW_WITNESS '+JSON.stringify({
    on:result.on,off:result.off,visual:result.visual,errors:result.errors
  }));
  if(result.errors.length)throw new Error('Browser errors: '+result.errors.join('; ').slice(0,700));
  if(!result.on.contact?.frameStamps)throw new Error('Play Hunt rendered ZERO contact stamps after visible props loaded');
  if(result.on.residentProps.length!==result.off.residentProps.length){
    throw new Error('Cannot compare images when prop residency changed between screenshots');
  }
  if(rootPixels<2600)throw new Error('Contact grounding is still visually too small: '+rootPixels+' changed ROOT pixels');
}catch(error){failed=String(error.stack??error);result.failed=failed;console.error('CONTACT_SHADOW_FAILURE '+failed);}
finally{
  await writeFile(folder+'/report.json',JSON.stringify(result,null,2));
  await browser?.close().catch(()=>{});
  server.kill('SIGTERM');
}
if(failed)process.exitCode=1;
