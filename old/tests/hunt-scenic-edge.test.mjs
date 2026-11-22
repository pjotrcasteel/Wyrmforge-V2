import test from 'node:test';
import assert from 'node:assert/strict';
import {ScenicForest,projectTreeSprite} from '../src/hunt-scenic-forest.mjs';
import {HuntTreePreview,createForestBackdrop} from '../src/hunt-tree-preview.mjs';
import {projectVoxel} from '../src/camera-presets.mjs';
import {containsHuntLandform} from '../src/world-generation/hunt-landform-footprint.mjs';
import {createWorldSiteRecipe} from '../src/world-generation/site-recipe.mjs';
import {generateWorldSite,generateAuthoredHuntTerrainGraph} from '../src/world-generation/index.mjs';

const view={width:402,height:604,scale:16,camera:'hunt',panX:0,panY:0};
const rectangle=(minX,maxX,minZ,maxZ)=>({bounds:{minX,maxX,minZ,maxZ},
  landform:Array.from({length:maxZ-minZ+1},()=>[{start:minX,end:maxX+1}])});

test('closed entry rim has whole crowns overlapping it, including the former empty central strip',()=>{
  const region=rectangle(-20,19,-20,19);
  const layout={regions:[region],links:[]};
  const camera={...view,panY:-200};
  const trees=new ScenicForest(layout).trees(camera);
  const edge=projectVoxel(0,5,20,camera).y;
  assert.ok(trees.every(tree=>!containsHuntLandform(region,tree.x,tree.z)));
  assert.ok(trees.some(tree=>Math.abs(tree.x)<4&&tree.z>=20&&
    projectTreeSprite(tree,camera)?.y<edge),'entry no longer has a crown-clipped hole');
});

test('culling retains every visible crown with roots outside the viewport on all four sides',()=>{
  const forest=new ScenicForest({regions:[],links:[]});
  const observed=new Set();
  for(const scale of [8.8,16,56])for(const panX of [-81,0,93]){
    const camera={...view,scale,panX,panY:57};
    // Independently enumerate a much larger view, then project its trees into
    // the original view. No visible sprite may be lost by the small query.
    const wide={...camera,width:camera.width+1200,height:camera.height+1200};
    const expected=forest.trees(wide).filter(tree=>projectTreeSprite(tree,camera));
    const actual=forest.trees(camera).filter(tree=>projectTreeSprite(tree,camera));
    assert.deepEqual(actual.map(t=>t.id).sort(),expected.map(t=>t.id).sort());
    for(const side of ['left','right','bottom']){
      if(actual.some(tree=>{
        const p=projectVoxel(tree.x,tree.y,tree.z,camera);
        return side==='left'?p.x<0:side==='right'?p.x>camera.width:p.y>camera.height;
      }))observed.add(side);
    }
  }
  assert.deepEqual([...observed].sort(),['bottom','left','right']);
});

test('scenery is stable when panning, zooming, leaving and revisiting, with a bounded view cache',()=>{
  const forest=new ScenicForest({regions:[],links:[]});
  const first=forest.trees(view);
  assert.equal(forest.trees(view),first);
  const shifted=forest.trees({...view,panX:-90,panY:24});
  for(const tree of shifted){
    const old=first.find(other=>other.id===tree.id);
    if(old)assert.deepEqual(tree,old);
  }
  forest.trees({...view,panX:1e6,panY:-1e6});
  assert.deepEqual(forest.trees(view),first);
  for(const [width,height] of [[402,604],[430,750],[1000,700],[700,1000]]){
    assert.ok(forest.trees({...view,width,height,scale:8.8}).length<1800);
  }
  assert.deepEqual(forest.trees({...view,camera:'inspection'}),[]);
});

test('all regional and connector footprints stay clear for seeds 7, 8 and 19',()=>{
  for(const seed of [7,8,19]){
    const site=generateWorldSite(createWorldSiteRecipe({regionId:'starter-region',
      siteId:'preview-wet-forest',encounterId:'preview-001',kind:'wet-forest',seed,chunkEdge:32}));
    const graph=generateAuthoredHuntTerrainGraph(site);
    const forest=new ScenicForest(graph.layout);
    const bands=[...graph.layout.regions,...graph.layout.links];
    for(const band of bands){
      const x=(band.bounds.minX+band.bounds.maxX)/2;
      const z=(band.bounds.minZ+band.bounds.maxZ)/2;
      const center=projectVoxel(x,5,z,view);
      const trees=forest.trees({...view,panX:view.width/2-center.x,panY:view.height/2-center.y});
      assert.ok(trees.length>0);
      assert.ok(trees.every(tree=>bands.every(b=>!containsHuntLandform(b,tree.x,tree.z))),band.id);
    }
  }
});

test('every scenic tree is painted whole above terrain with original sprite alpha',()=>{
  const layout={regions:[rectangle(-4,3,-4,3)],links:[]};
  const image={complete:true,naturalWidth:752};
  const preview=new HuntTreePreview({layout},image);
  const calls=[];
  const ctx={save(){},restore(){},drawImage(...args){calls.push(args);},
    set globalAlpha(value){assert.equal(value,1);}};
  preview.paint(ctx,view,{x:0,y:5,z:0},()=>calls.push('actor'));
  const visible=new ScenicForest(layout).trees(view).filter(tree=>projectTreeSprite(tree,view));
  assert.equal(calls.filter(call=>call!=='actor').length,visible.length);
  for(const call of calls.filter(call=>call!=='actor')){
    const [,sx,sy,sw,sh]=call;
    assert.ok(visible.some(({sprite:s})=>s.x===sx&&s.y===sy&&s.w===sw&&s.h===sh));
  }
  assert.ok(calls.indexOf('actor')>0&&calls.indexOf('actor')<calls.length-1);
  const floor=[];
  createForestBackdrop()({save(){},restore(){},fillRect(...args){floor.push(args);}},view);
  assert.deepEqual(floor,[[0,0,402,604]]);
});
