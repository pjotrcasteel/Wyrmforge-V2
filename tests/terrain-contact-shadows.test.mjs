import test from 'node:test';
import assert from 'node:assert/strict';
import {describeContactShadow,CONTACT_SHADOW_SAMPLE_COUNT} from '../src/lighting/contact-shadows.mjs';
import {
  TerrainContactShadowCache,CONTACT_SHADOW_CACHE_LIMIT,CONTACT_SHADOW_RAY_BUDGET
} from '../src/terrain-contact-shadow-cache.mjs';
import {HuntTreePreview} from '../src/hunt-tree-preview.mjs';

const tree=(id,x=0,y=5,z=0,kind=null)=>({id,x,y,z,radius:.46,...(kind?{kind}:{}),scale:1});
function terrain({floor=()=>5,epoch=1,hidden=()=>false}={}){
  let calls=0;
  return {epoch,get calls(){return calls;},raycast({origin,direction,maxDistance}){
    calls++;
    if(hidden(origin,direction))return null;
    if(direction[1]===-1){
      const y=floor(origin[0],origin[2]);
      return Number.isFinite(y)&&origin[1]-y<=maxDistance&&origin[1]>=y?
        {point:{x:origin[0],y,z:origin[2]}}:null;
    }
    // A camera ray travels across X/Z as it descends: intersect the
    // height profile along the ray, not the column at its origin.
    const steps=160;
    for(let i=0;i<=steps;i++){
      const t=i*maxDistance/steps;
      const x=origin[0]+t*direction[0];
      const y=origin[1]+t*direction[1];
      const z=origin[2]+t*direction[2];
      const ground=floor(x,z);
      if(Number.isFinite(ground)&&y<=ground+.025){
        return {point:{x,y:ground,z}};
      }
    }
    return null;
  }};
}
test('contact attenuation is bounded and logs respect their elongated physical root footprint',()=>{
  const a=describeContactShadow(tree('tree'));
  const b=describeContactShadow({...tree('log',0,5,0,'log'),radius:.22,halfLength:.72});
  assert.equal(a.samples.length,CONTACT_SHADOW_SAMPLE_COUNT);
  assert.ok(b.radiusX>b.radiusZ*2,'logs retain a long narrow physical footprint');
  assert.ok(a.radiusX>=.8&&a.radiusZ>=.7,'root grounding must be visible at Hunt scale');
  assert.ok(a.samples.every(s=>s.alpha>0&&s.alpha<=.35));
  const screenScale=24; // 402 CSS-pixel mobile Hunt at 1.5 render scale.
  const center=a.samples[0],edge=a.samples.find(s=>s.x>a.x+.7);
  assert.ok(center.halfX*2*screenScale>10,'contact receiver must span meaningful real pixels');
  assert.ok((edge.x-a.x)*screenScale>15,'shadow reaches outside its painted trunk base');
  assert.equal(describeContactShadow({...tree('bad'),radius:-1}),null);
});
test('flat ground is sampled at authoritative contact receivers and cached without raycasts',()=>{
  const port=terrain(),cache=new TerrainContactShadowCache();
  cache.beginFrame();
  const samples=cache.stamps(tree('oak'),port);
  assert.equal(samples.length,CONTACT_SHADOW_SAMPLE_COUNT);
  assert.ok(samples.every(s=>s.y>5&&s.y<5.1));
  const used=port.calls;
  assert.deepEqual(cache.stamps(tree('oak'),port),samples);
  assert.equal(port.calls,used);
  assert.equal(cache.statistics.cacheHits,1);
});
test('cliff gaps, micro-shelves and terrain occlusion do not receive floating dark stamps',()=>{
  const port=terrain({floor:(x,z)=>x>.1?NaN:z>.1?4.4:5});
  const cache=new TerrainContactShadowCache();
  cache.beginFrame();
  const stamps=cache.stamps(tree('cliff'),port);
  assert.ok(stamps.length>0&&stamps.length<CONTACT_SHADOW_SAMPLE_COUNT);
  assert.ok(stamps.every(stamp=>stamp.x<=.1&&stamp.z<=.1));
  const obscured=terrain({hidden:(_origin,dir)=>dir[1]!==-1});
  const hiddenCache=new TerrainContactShadowCache();
  hiddenCache.beginFrame();
  assert.equal(hiddenCache.stamps(tree('hidden'),obscured).length,0);
});
test('query and retained-entry budgets are hard bounded during dense-forest churn',()=>{
  const port=terrain(),cache=new TerrainContactShadowCache();
  cache.beginFrame();
  for(let i=0;i<30;i++)cache.stamps(tree('tree-'+i,i*2),port);
  assert.ok(cache.statistics.frameRays<=CONTACT_SHADOW_RAY_BUDGET);
  for(let i=0;i<240;i++){
    cache.beginFrame();
    cache.stamps(tree('tree-'+i,i*2),port);
  }
  assert.ok(cache.statistics.entries<=CONTACT_SHADOW_CACHE_LIMIT);
  assert.ok(cache.statistics.approxBytes<CONTACT_SHADOW_CACHE_LIMIT*CONTACT_SHADOW_SAMPLE_COUNT*65);
});
test('local terrain edit invalidates only nearby cached receivers, not distant props',()=>{
  const port=terrain(),cache=new TerrainContactShadowCache();
  cache.beginFrame();cache.stamps(tree('a'),port);cache.stamps(tree('b',20),port);
  const before=port.calls;
  cache.invalidate({min:{x:-1,z:-1},max:{x:1,z:1}});
  assert.equal(cache.statistics.entries,1);
  cache.beginFrame();cache.stamps(tree('b',20),port);
  assert.equal(port.calls,before);
  cache.stamps(tree('a'),port);
  assert.ok(port.calls>before);
});
test('residency eviction, pose replacement, world epoch and disposal cannot retain stale shadows',()=>{
  const port=terrain(),cache=new TerrainContactShadowCache();
  cache.beginFrame();cache.stamps(tree('a'),port);
  cache.beginFrame();cache.stamps(tree('a',0,5.2),port);
  assert.equal(cache.statistics.entries,1);
  cache.prune(new Set());assert.equal(cache.statistics.entries,0);
  cache.beginFrame();cache.stamps(tree('a'),port);
  cache.beginFrame();cache.stamps(tree('a'),terrain({epoch:2}));
  assert.equal(cache.statistics.entries,1);
  cache.clear();assert.equal(cache.statistics.entries,0);
});
test('rendered proxy consists only of receiver stamps; off mode performs no work',()=>{
  const cache=new TerrainContactShadowCache(),port=terrain();
  const draws=[];
  const ctx={globalAlpha:1,save(){},restore(){},fillRect(...args){draws.push(args);}};
  const view={camera:'hunt',width:400,height:400,scale:16};
  cache.beginFrame();
  const stamps=cache.stamps(tree('a'),port);
  cache.paint(ctx,view,stamps);
  cache.endFrame(.12);
  assert.equal(draws.length,stamps.length);
  assert.equal(cache.statistics.frameStamps,draws.length);
  assert.ok(cache.statistics.p95CpuMs>=.12);
  cache.beginFrame();cache.endFrame(0);
  assert.equal(cache.statistics.frameRays,0);
});
test('Play Hunt preview deletes changed/evicted entries and never samples when lighting is off',()=>{
  const obj=tree('a');
  const graph={layout:{regions:[],links:[]},placement:()=>({placements:[{
    kind:'tree',id:obj.id,position:{x:obj.x,y:obj.y,z:obj.z},
    scale:1,seed:7,footprint:{radius:.46}
  }]})};
  const preview=new HuntTreePreview(graph,{complete:true,naturalWidth:1});
  const port=terrain();
  preview.update(['one'],port);
  const ctx={save(){},restore(){},drawImage(){},fillRect(){},imageSmoothingEnabled:false};
  const view={camera:'hunt',width:400,height:400,scale:16};
  preview.paint(ctx,view,{x:0,y:5,z:0},()=>{},null,0,null);
  assert.equal(port.calls,1,'only object grounding, no shadow rays');
  const initialCalls=port.calls;
  preview.update([],port);
  // No props or sprite art in the inspection view: isolated off switch does
  // not read terrain or invoke Canvas crop/tint APIs in the Node fixture.
  const inspection={...view,camera:'inspection'};
  const lighting={ambient:[.42,.42,.42],sample:()=>[.42,.42,.42]};
  preview.paint(ctx,inspection,{x:0,y:5,z:0},()=>{},null,10,lighting,false);
  assert.equal(port.calls,initialCalls);
  preview.dispose();
  assert.equal(preview.contactShadowStatistics.entries,0);
});
