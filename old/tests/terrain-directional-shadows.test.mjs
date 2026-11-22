import test from 'node:test';
import assert from 'node:assert/strict';
import {HUNT_SUN_CAST,projectCanopyReceivers,projectDirectionalReceivers,CANOPY_COLS,CANOPY_ROWS} from '../src/lighting/directional-sunlight.mjs';
import {describeDirectionalCaster} from '../src/lighting/shadow-caster-contract.mjs';
import {projectTreeSprite} from '../src/hunt-scenic-forest.mjs';
import {HuntTreePreview} from '../src/hunt-tree-preview.mjs';
import {VoxelWorld} from '../src/voxel-world.mjs';
import {raycastTerrain} from '../src/terrain-raycast.mjs';
import {sampleCanopyAlpha,TerrainDirectionalShadowCache,directionalShadowMayReachView,DIRECTIONAL_RAYS_PER_FRAME,
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
  let calls=0,ground=(x,z)=>5,variable=false;
  return {epoch,get calls(){return calls;},floor:f=>{ground=f;variable=true;},
    raycast({origin,direction,maxDistance}){
      calls++;
      if(!variable){
        const t=(origin[1]-5)/-direction[1];
        return Number.isFinite(t)&&t>0&&t<=maxDistance
          ?{distance:t,point:{x:origin[0]+t*direction[0],
            y:5,z:origin[2]+t*direction[2]},normal:{x:0,y:1,z:0}}:null;
      }
      // Only the custom heightfield fixture uses incremental ray sampling;
      // actual Voxel DDA tests below assert genuine vertical cliff normals.
      const steps=Math.ceil(maxDistance/.035);
      let prev=null;
      for(let i=0;i<=steps;i++){
        const t=i*maxDistance/steps;
        const x=origin[0]+direction[0]*t,y=origin[1]+direction[1]*t,
          z=origin[2]+direction[2]*t,level=ground(x,z);
        if(Number.isFinite(level)&&y<=level){
          const raised=prev!==null&&Number.isFinite(prev.level)&&level>prev.level+.25;
          const normal=raised&&Math.abs(direction[2])>=Math.abs(direction[0])
            ?{x:0,y:0,z:-Math.sign(direction[2])}
            :raised?{x:-Math.sign(direction[0]),y:0,z:0}:{x:0,y:1,z:0};
          return {distance:t,point:{x,y:level,z},normal};
        }
        prev={x,z,level};
      }
      return null;
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
  assert.ok(projected.some(c=>c.z<HUNT_SUN_CAST.z*3));
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
  assert.ok(cache.statistics.approxBytes<400000);
  const rectangles=[],ctx={save(){},restore(){},fillRect(...r){rectangles.push(r);}};
  cache.beginFrame();
  cache.paint(ctx,{width:400,height:400,scale:16,camera:'hunt'},
    [{x:0,y:5,z:0,width:1,depth:1,alpha:.3}]);
  assert.equal(rectangles.length,1);
  assert.equal(cache.statistics.frameStamps,1);
});


function physicalCliff({frontOccluder=false}={}){
  const world=new VoxelWorld({chunkEdge:16});
  // Flat physical 1m terrain, then a 4m vertical cliff in the sun ray path.
  for(let x=-10;x<=6;x++)for(let z=-8;z<=7;z++)world.set(x,4,z,3);
  for(let x=-10;x<=6;x++)for(let z=-3;z<=-2;z++)for(let y=5;y<=8;y++)world.set(x,y,z,3);
  if(frontOccluder){
    // This high ridge is between the front-facing cliff and the Hunt camera.
    // It does NOT lie between the canopy source and the cliff's sunlight ray.
    for(let x=-10;x<=6;x++)for(let y=5;y<=12;y++)world.set(x,y,2,3);
  }
  let calls=0;
  return {epoch:1,world,get calls(){return calls;},
    raycast(args){calls++;return raycastTerrain(world,args);}};
}
function completedShadow(cache,port,treeObj=tree('cliff')){
  let stamps=[];
  for(let frame=0;frame<24;frame++){
    cache.beginFrame();
    stamps=cache.stamps(treeObj,port,()=>true,'hunt');
    cache.endFrame(0);
    if(cache.statistics.entries)break;
  }
  return stamps;
}
test('real Voxel 3D DDA casts a canopy shadow onto visible vertical cliff faces',()=>{
  const port=physicalCliff();
  const cache=new TerrainDirectionalShadowCache(()=>mask());
  const stamps=completedShadow(cache,port);
  const cliff=stamps.filter(s=>s.face==='cliff');
  assert.ok(cliff.length>0,'true raised voxel wall must receive part of the cast');
  assert.ok(cliff.every(s=>s.y>5&&s.y<=9),'cliff stamps belong to the actual wall elevation');
  assert.ok(cache.statistics.frameRays<=DIRECTIONAL_RAYS_PER_FRAME);
  const frames=[];
  const ctx={save(){},restore(){},fillRect(...rect){frames.push(rect);}};
  cache.beginFrame();
  cache.paint(ctx,{width:600,height:500,scale:20,camera:'hunt'},cliff);
  assert.ok(cache.statistics.frameCliffStamps>0);
  assert.ok(frames.length<=cliff.length);
});
test('nearer solid cliffs occlude rear canopy shadows instead of drawing through terrain',()=>{
  const clear=new TerrainDirectionalShadowCache(()=>mask());
  const occluded=new TerrainDirectionalShadowCache(()=>mask());
  const visible=completedShadow(clear,physicalCliff());
  const hiddenPort=physicalCliff({frontOccluder:true});
  const blocked=completedShadow(occluded,hiddenPort);
  const visibleCliff=visible.filter(s=>s.face==='cliff').length;
  const hiddenCliff=blocked.filter(s=>s.face==='cliff').length;
  assert.ok(visibleCliff>0);
  assert.ok(hiddenCliff<visibleCliff,
    'a nearer 8m cliff must hide at least some shadow pixels on the rear wall');
  assert.ok(occluded.statistics.occlusionRejects>0,
    'camera visibility queries must reject shielded terrain receivers');
});
test('physical changes to a wall rebuild shadow geometry with no stale cliff pixels',()=>{
  const port=physicalCliff(),cache=new TerrainDirectionalShadowCache(()=>mask());
  const before=completedShadow(cache,port);
  assert.ok(before.some(s=>s.face==='cliff'));
  for(let x=-10;x<=6;x++)for(let z=-3;z<=-2;z++)for(let y=5;y<=8;y++)port.world.set(x,y,z,0);
  cache.invalidate({min:{x:-10,z:-3},max:{x:6,z:-2}});
  const after=completedShadow(cache,port);
  assert.ok(after.length>0);
  assert.equal(after.filter(s=>s.face==='cliff').length,0,
    'removed cliff casts cannot remain pinned to empty air');
});

test('real flat Voxel ground independently receives sun-lit canopy stamps',()=>{
  const world=new VoxelWorld({chunkEdge:16});
  for(let x=-14;x<=6;x++)for(let z=-12;z<=7;z++)world.set(x,4,z,3);
  const port={epoch:1,raycast:options=>raycastTerrain(world,options)};
  const cache=new TerrainDirectionalShadowCache(()=>mask());
  const stamps=completedShadow(cache,port);
  assert.ok(stamps.length>6,'ground and camera both have physical receivers');
  assert.ok(stamps.every(s=>s.face==='ground'));
  assert.ok(stamps.every(s=>Math.abs(s.y-5.045)<.01));
});


test('a crown outside the right edge still keeps its physically visible sunlight cast',()=>{
  const caster=tree('edge',11),view={camera:'hunt',width:400,height:400,scale:24};
  assert.equal(projectTreeSprite(caster,view),null,
    'the sprite itself must be entirely outside the viewport');
  assert.equal(directionalShadowMayReachView(caster,view),true,
    'its long leftward physical cast can still reach the screen');
  assert.equal(directionalShadowMayReachView(tree('far',40),view),false,
    'unrelated distant casters must not consume the ray budget');
});

test('warm casters are genuine LRU entries, not evicted as the camera pans',()=>{
  const port=terrain(),cache=new TerrainDirectionalShadowCache(()=>mask());
  const make=(id,x=0)=>tree(id,x);
  function build(caster){
    let result=[];
    for(let f=0;f<18;f++){
      cache.beginFrame();
      result=cache.stamps(caster,port);
      if(cache.statistics.entries>=1&&result.length)break;
    }
    return result;
  }
  const original=build(make('foreground'));
  assert.ok(original.length>0);
  for(let i=0;i<DIRECTIONAL_MAX_ENTRIES-1;i++)build(make('other'+i,i+50));
  const calls=port.calls;
  cache.beginFrame();
  assert.deepEqual(cache.stamps(make('foreground'),port),original);
  assert.equal(port.calls,calls);
  build(make('new-mover',100));
  cache.beginFrame();
  const later=port.calls;
  assert.deepEqual(cache.stamps(make('foreground'),port),original);
  assert.equal(port.calls,later,'recently used caster retains its shadow');
  assert.ok(cache.statistics.cacheEvictions>=1);
});

test('physical buildings and newly authored sprite variants cast without asset-type branches',()=>{
  const solid=describeDirectionalCaster({
    id:'building.future',x:0,y:5,z:0,height:5,radius:1.2
  });
  const sprite=describeDirectionalCaster({...tree('future-tree'),sprite:{
    name:'a-new-treetype',x:0,y:0,w:106,h:160,ax:47,ay:159
  }});
  assert.ok(solid.bounds&&!solid.silhouette);
  assert.ok(sprite.silhouette);
  const volume=projectDirectionalReceivers(solid,[]);
  const silhouette=projectDirectionalReceivers(sprite,mask());
  assert.equal(volume.length,16);
  assert.ok(silhouette.length>12);
  const cache=new TerrainDirectionalShadowCache(()=>mask()),port=terrain();
  for(let i=0;i<18;i++){
    cache.beginFrame();cache.stamps(solid,port);
    if(cache.statistics.entries)break;
  }
  assert.ok(cache.statistics.entries>0);
  assert.ok(cache.statistics.frameRays<=DIRECTIONAL_RAYS_PER_FRAME);
});

test('actual Hunt overlay retains a tree cast while its sprite walks out of view',()=>{
  const image={complete:true,naturalWidth:1024};
  const placement={kind:'tree',id:'tree.right-edge',seed:7,scale:1,
    position:{x:11,y:5,z:0},footprint:{radius:.46}};
  const graph={layout:{regions:[],links:[]},
    placement:()=>({placements:[placement]})};
  const directionalCache=new TerrainDirectionalShadowCache(()=>mask());
  const preview=new HuntTreePreview(graph,image,undefined,{
    directionalCache,scenery:{trees:()=>[]},
    lightingCache:{beginFrame(){},draw(){},clear(){},statistics:{bytes:0,entries:0}}
  });
  const port=terrain();
  preview.update(['one'],port);
  const treeInstance=[...preview.objects.regions].flat()[0];
  assert.ok(treeInstance?.sprite);
  const base={camera:'hunt',width:400,height:400,scale:24};
  const ctx={save(){},restore(){},fillRect(){},drawImage(){},
    imageSmoothingEnabled:false};
  const light={ambient:[.4,.4,.4],sample:()=>[.4,.4,.4]};
  const actor={x:0,y:5,z:0};
  // Establish a directional shadow while the source sprite is visible.
  const near={...base,panX:-105};
  for(let i=0;i<20;i++)preview.paint(ctx,near,actor,()=>{},null,i*16,light,false,true);
  assert.ok(preview.directionalShadowStatistics.entries>0);
  // The caster sprite is now entirely offscreen but its cast still lands
  // inside the camera. We must draw its WARM shadow, not return [].
  const edge={...base,panX:0};
  assert.equal(projectTreeSprite(treeInstance,edge),null);
  preview.paint(ctx,edge,actor,()=>{},null,500,light,false,true);
  assert.ok(preview.directionalShadowStatistics.frameStamps>0,
    'moving across the tree-crown edge cannot switch the shadow off');
  assert.equal(preview.directionalShadowStatistics.frameRays,0,
    'the stable cast must be reused without cold recasting');
  preview.dispose();
});
