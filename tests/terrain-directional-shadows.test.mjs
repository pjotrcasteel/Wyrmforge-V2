import test from 'node:test';
import assert from 'node:assert/strict';
import {HUNT_SUN_CAST,projectCanopyReceivers,CANOPY_COLS,CANOPY_ROWS} from '../src/lighting/directional-sunlight.mjs';
import {sampleCanopyAlpha,TerrainDirectionalShadowCache,DIRECTIONAL_RAYS_PER_FRAME,
  DIRECTIONAL_MAX_ENTRIES} from '../src/terrain-directional-shadow-cache.mjs';
const tree=(id,x=0)=>({id,x,y:5,z:0,scale:1,image:{complete:true,naturalWidth:800},
  sprite:{name:'oak',x:0,y:0,w:106,h:160,ax:47,ay:159}});
const alpha=(w,h,fn)=>{
  const data=new Uint8ClampedArray(w*h*4);
  for(let y=0;y<h;y++)for(let x=0;x<w;x++)data[(y*w+x)*4+3]=fn(x,y)?255:0;
  return data;
};
const mask=()=>sampleCanopyAlpha(alpha(70,80,()=>true),70,80);
function terrain(epoch=1){
  let calls=0,ground=(x,z)=>5;
  return {epoch,get calls(){return calls;},floor:f=>{ground=f;},
    raycast({origin,direction,maxDistance}){
      calls++;
      const y=ground(origin[0],origin[2]);
      return Number.isFinite(y)&&direction[1]===-1&&origin[1]>=y&&origin[1]-y<=maxDistance
        ?{point:{x:origin[0],y,z:origin[2]}}:null;
    }};
}
test('canopy alpha sampling preserves real transparent holes, not rectangular billboards',()=>{
  const cutout=sampleCanopyAlpha(alpha(70,80,(x,y)=>!(x>23&&x<46&&y>20&&y<60)),70,80);
  assert.equal(mask().length,CANOPY_COLS*CANOPY_ROWS);
  assert.ok(cutout.length<mask().length&&cutout.length>20);
  assert.equal(cutout.some(c=>c.col===3&&c.row===3),false);
});
test('sun projects readable shadow away from L10-05 contact base',()=>{
  const projected=projectCanopyReceivers(tree('oak'),mask());
  assert.ok(projected.length>12);
  assert.ok(projected.every(c=>c.height>=1.55&&c.alpha>0&&c.alpha<=.42));
  assert.ok(projected.some(c=>c.z>HUNT_SUN_CAST.z*3));
  assert.ok(projected.some(c=>c.x<-2));
});
test('cold builds are incremental, warm entries avoid all terrain queries',()=>{
  const port=terrain(),cache=new TerrainDirectionalShadowCache(()=>mask());let stamps=[];
  for(let i=0;i<12;i++){
    cache.beginFrame();stamps=cache.stamps(tree('a'),port,()=>true);
    assert.ok(cache.statistics.frameRays<=DIRECTIONAL_RAYS_PER_FRAME);
    if(stamps.length)break;
  }
  assert.ok(stamps.length>20);
  const used=port.calls;cache.beginFrame();
  assert.deepEqual(cache.stamps(tree('a'),port),stamps);
  assert.equal(port.calls,used);
  assert.equal(cache.statistics.cacheHits,1);
});
test('empty ground, lower cliffs and unpublished columns never receive shadow stamps',()=>{
  const port=terrain(),cache=new TerrainDirectionalShadowCache(()=>mask());
  port.floor((x,z)=>x<-3?NaN:z>2?0:5);
  let stamps=[];
  for(let i=0;i<12;i++){cache.beginFrame();stamps=cache.stamps(tree('a'),port,()=>true);}
  assert.ok(stamps.length>0);
  assert.ok(stamps.every(s=>s.x>=-3&&s.z<=2));
  cache.clear();
  for(let i=0;i<12;i++){cache.beginFrame();stamps=cache.stamps(tree('a'),port,()=>false);}
  assert.equal(stamps.length,0);
});
test('local edits, eviction, falling and epoch changes discard only relevant cached work',()=>{
  const cache=new TerrainDirectionalShadowCache(()=>mask()),port=terrain();
  for(let i=0;i<12;i++){cache.beginFrame();cache.stamps(tree('a'),port);}
  assert.equal(cache.statistics.entries,1);
  cache.invalidate({min:{x:-5,z:0},max:{x:1,z:5}});
  assert.equal(cache.statistics.entries,0);
  for(let i=0;i<12;i++){cache.beginFrame();cache.stamps(tree('a'),port);}
  cache.prune(new Set());assert.equal(cache.statistics.entries,0);
  for(let i=0;i<12;i++){cache.beginFrame();cache.stamps(tree('a'),port);}
  const newer=terrain(2);
  for(let i=0;i<12;i++){cache.beginFrame();cache.stamps(tree('b'),newer);}
  assert.equal(cache.statistics.entries,1);
  cache.remove('b');assert.equal(cache.statistics.entries,0);
  cache.clear();assert.equal(cache.statistics.maskVariants,0);
});
test('dense canopy churn never exceeds bounded retention and overlay draw budgets',()=>{
  const cache=new TerrainDirectionalShadowCache(()=>mask()),port=terrain();
  for(let i=0;i<DIRECTIONAL_MAX_ENTRIES+12;i++){
    for(let n=0;n<8;n++){cache.beginFrame();cache.stamps(tree('tree'+i,i*2),port);}
  }
  assert.ok(cache.statistics.entries<=DIRECTIONAL_MAX_ENTRIES);
  assert.ok(cache.statistics.approxBytes<200000);
  const rectangles=[],ctx={save(){},restore(){},fillRect(...r){rectangles.push(r);}};
  cache.beginFrame();
  cache.paint(ctx,{width:400,height:400,scale:16,camera:'hunt'},
    [{x:0,y:5,z:0,width:1,depth:1,alpha:.3}]);
  assert.equal(rectangles.length,1);
  assert.equal(cache.statistics.frameStamps,1);
});
