import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  createHuntExpeditionRecipe,composeHuntExpeditionPlan,
  generateWorldExpeditionRegion
} from '../src/world-generation/index.mjs';
import { V2ExternalTerrainLoader } from '../src/external-terrain-loader.mjs';
import {
  HUNT_FIXED_STEP,HuntPlayPerformance,HuntFollowCamera,spawnHuntExplorer,
  stepHuntExplorer,findHuntRegionCrossing
} from '../src/hunt-play-runtime.mjs';
import { actorOverlapsTerrain } from '../src/terrain-actor.mjs';

function fixture(seed=7) {
  const plan=composeHuntExpeditionPlan(createHuntExpeditionRecipe({
    kind:'wet-forest',seed,chunkEdge:16,scope:'standard',
    huntId:'play-hunt-wet-forest',journeyId:'fire-tier-one'
  }));
  const region=plan.regions.find(r=>r.id===plan.entryRegionId);
  const result=generateWorldExpeditionRegion(plan,region.id);
  const loader=new V2ExternalTerrainLoader(result.definition);
  while(!loader.progress.done)loader.loadStep(4096);
  return {plan,region,loader,world:loader.terrain.world};
}

test('H08-01 Play Hunt uses authoritative physical Voxel V2 actor and generated ground',()=>{
  const {region,loader,world}=fixture();
  try {
    const first=spawnHuntExplorer(world,region);
    assert.equal(first.grounded,true);
    assert.ok(!actorOverlapsTerrain(world,first));
    let actor=first;
    for(let i=0;i<90;i++) {
      actor=stepHuntExplorer(world,actor,region.bounds,{moveZ:-1},HUNT_FIXED_STEP);
      assert.ok(!actor.error,'moving Wizard cannot cross an occupied voxel');
      assert.ok(!actorOverlapsTerrain(world,actor));
      assert.ok(actor.x>=region.bounds.minX+.65);
      assert.ok(actor.z>=region.bounds.minZ+.65);
    }
    assert.ok(first.z-actor.z>1,'Wizard must move on real physical terrain');
    assert.ok(actor.y>0 && actor.y<25);
    const again=spawnHuntExplorer(world,region);
    assert.deepEqual(first,again,'a reset respawns deterministically on the same Voxel floor');
  } finally {loader.unload();}
});

test('H08-01 physical player cannot wander into unloaded neighboring regions',()=>{
  const {region,loader,world}=fixture(19);
  try {
    let actor=spawnHuntExplorer(world,region);
    for(let i=0;i<1200;i++)actor=stepHuntExplorer(
      world,actor,region.bounds,{moveZ:-1},HUNT_FIXED_STEP
    );
    assert.ok(actor.z>=region.bounds.minZ+0.65,
      'one-region preview must stop at its physical streaming boundary');
  } finally {loader.unload();}
});

test('Hunt region crossing uses only authored portal geography',()=>{
  const {plan,region,loader,world}=fixture();
  try {
    const port=region.ports.find(p=>p.direction==='north');
    assert.ok(port);
    const actor=spawnHuntExplorer(world,region);
    assert.equal(findHuntRegionCrossing(plan,region.id,actor),null);
    const atPort={...actor,x:port.at.x+0.5,z:port.at.z+0.5};
    const crossing=findHuntRegionCrossing(plan,region.id,atPort);
    assert.equal(crossing?.fromRegionId,region.id);
    assert.equal(crossing?.toRegionId,port.peerRegionId);
    assert.ok(crossing.entryPort);
    const offPort={...atPort,x:atPort.x+6};
    assert.equal(findHuntRegionCrossing(plan,region.id,offPort),null);
  } finally {loader.unload();}
});

test('Hunt frame sampler reports bounded p50/p95/p99 without fake hardware metrics',()=>{
  const stats=new HuntPlayPerformance(30);
  for(const ms of [16,17,16,18,19,50,16,20,16,17]) {
    stats.recordFrame(ms);
  }
  const metrics=stats.snapshot;
  assert.equal(metrics.frames,10);
  assert.equal(metrics.sampleCount,10);
  assert.equal(metrics.p50Ms,17);
  assert.equal(metrics.p95Ms,50);
  assert.equal(metrics.p99Ms,50);
  assert.equal(metrics.hitchesOver33ms,1);
  assert.equal(metrics.source,'request-animation-frame-local');
  for(let i=0;i<60;i++)stats.recordFrame(16.5);
  assert.equal(stats.snapshot.sampleCount,30);
  assert.equal(stats.snapshot.frames,70);
  assert.throws(()=>stats.recordFrame(Number.NaN),RangeError);
});

test('H08-01 Play Hunt is its own route with mobile input and follow camera',()=>{
  const html=readFileSync(new URL('../play-hunt.html',import.meta.url),'utf8');
  const host=readFileSync(new URL('../external-terrain-lab.mjs',import.meta.url),'utf8');
  assert.match(html,/<body data-play-hunt="true">/);
  assert.match(html,/id="play-joystick"/);
  assert.match(html,/id="play-respawn"/);
  assert.match(html,/id="play-hud"/);
  assert.doesNotMatch(html,/id="expedition-mode"[^>]*checked/);
  assert.match(html,/id="view-camera"/);
  assert.match(html,/value="hunt" selected/);
  assert.doesNotMatch(html,/value="inspection" selected/);
  assert.match(html,/id="play-camera-toggle"/);
  assert.match(host,/spawnHuntExplorer\(active\.world,region,\{/);
  assert.match(host,/stepHuntExplorer\(active\.world,playActor,/);
  assert.match(host,/playJoystick\.addEventListener\('pointerdown'/);
  assert.match(host,/document\.addEventListener\('keydown'/);
  assert.match(host,/canvas\.height\*\.51-followed\.y/);
  assert.match(host,/playFrameStats\.recordFrame/);
  assert.match(host,/playFrameAt=null/);
  assert.doesNotMatch(host,/new VoxelWorld\(/);
});


test('H08-01 iOS Safari downward joystick drag cannot scroll the game page',()=>{
  const html=readFileSync(new URL('../play-hunt.html',import.meta.url),'utf8');
  const lab=readFileSync(new URL('../external-terrain-lab.html',import.meta.url),'utf8');
  const host=readFileSync(new URL('../external-terrain-lab.mjs',import.meta.url),'utf8');
  // Fixed viewport and both scroll-chain + touch-action suppression are
  // restricted to Play Hunt; external terrain inspector stays unchanged.
  assert.match(html,/html\{overflow:hidden;overscroll-behavior:none\}/);
  assert.match(html,/body\[data-play-hunt\]\{[\s\S]*?position:fixed;inset:0/);
  assert.match(html,/body\[data-play-hunt\] #preview-stage\{[\s\S]*?touch-action:none/);
  assert.match(html,/#play-joystick\{[\s\S]*?touch-action:none/);
  assert.doesNotMatch(lab,/body\[data-play-hunt\]\{[\s\S]*?position:fixed/);
  // iOS rubber-banding can ignore CSS alone. The document-level listener
  // must be non-passive or preventDefault would silently do nothing.
  assert.match(host,/if\(playMode\) \{[\s\S]*?document\.addEventListener\('touchmove',event=>\{/);
  assert.match(host,/event\.cancelable && \(playPointer\.id!==null \|\|/);
  assert.match(host,/playStage\.contains\(event\.target\)/);
  assert.match(host,/\},\{passive:false\}\);/);
});

test('H08-01 mobile visual/performance fix changes only the playable route',()=>{
  const html=readFileSync(new URL('../play-hunt.html',import.meta.url),'utf8');
  const host=readFileSync(new URL('../external-terrain-lab.mjs',import.meta.url),'utf8');
  const renderer=readFileSync(new URL('../src/webgl-voxel-view.mjs',import.meta.url),'utf8');
  assert.match(host,/const pixelRatio=playMode\s*\?\s*Math\.min\(1,Math\.sqrt\(700000\/cssPixels\)\)/);
  assert.match(host,/fastHuntMode:false/);
  assert.match(renderer,/uniform bool uFastHuntMode/);
  assert.match(renderer,/if \(uFastHuntMode\) \{/);
  assert.match(host,/const fit=!playMode && inspected/);
  assert.match(host,/playCpuStats\.recordFrame/);
  assert.match(host,/const playCpuBegin=playMode\?performance\.now\(\):0/);
  assert.match(html,/id="play-report"/);
  assert.match(host,/playReport\.addEventListener\('click'/);
  assert.match(host,/wyrmforge\.hunt-play-report\.v1/);
  assert.match(host,/source:'request-animation-frame-local'|frameIntervals:playFrameStats\.snapshot/);
  assert.match(host,/gpuQueue:renderer\?\.uploadQueueStatistics/);
});


test('H08-01 camera ignores micro-step bob and automatic airborne hops',()=>{
  const follow=new HuntFollowCamera();
  const actor=Object.freeze({x:0,y:4,z:0,grounded:true});
  follow.reset(actor);
  follow.update(actor,0);
  for(let i=1;i<=120;i++) {
    const a={x:i/30,y:4+(i%2)*.1,z:0,grounded:true};
    const target=follow.update(a,i*1000/60);
    assert.equal(target.y,4,'10cm ground variations must not shake the world');
  }
  for(let i=121;i<=160;i++){
    const a={x:4,y:4+Math.sin((i-120)*Math.PI/40)*.9,z:0,grounded:false};
    assert.equal(follow.update(a,i*1000/60).y,4,
      'ballistic actor hops must not lift the camera');
  }
  assert.equal(actor.y,4);
});

test('H08-01 real elevation changes ease smoothly and respawn snaps cleanly',()=>{
  const follow=new HuntFollowCamera();
  follow.update({x:0,y:4,z:0,grounded:true},0);
  let previous=4;
  for(let i=1;i<=180;i++){
    const target=follow.update({x:3,y:6,z:2,grounded:true},i*1000/60);
    assert.ok(target.y>=previous && target.y-previous<=2/60+1e-8);
    previous=target.y;
  }
  assert.ok(previous>5.60 && previous<=5.65);
  const resumed=follow.update({x:3,y:6,z:2,grounded:true},60000);
  assert.ok(resumed.y-previous<=.1+1e-8,'returning from a background tab cannot snap the view');
  follow.reset({x:-4,y:2,z:8,grounded:true});
  assert.deepEqual(follow.update({x:-4,y:2,z:8,grounded:true},61000),
    {x:-4,y:2,z:8});
});

test('Play Hunt renders a separate smoothed follow target, not the raw actor height',()=>{
  const host=readFileSync(new URL('../external-terrain-lab.mjs',import.meta.url),'utf8');
  assert.ok(host.includes('playFollowCamera.update(playActor,now)'));
  assert.ok(host.includes('projectVoxel(followTarget.x,followTarget.y+0.85,followTarget.z'));
  assert.ok(!host.includes('projectVoxel(playActor.x,playActor.y+0.85,playActor.z'));
  assert.ok(host.includes('playFollowCamera.reset(playActor)'));
  assert.ok(host.includes('projectActorDiagnostic(playActor,view)'));
});
