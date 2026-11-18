import test from 'node:test';
import assert from 'node:assert/strict';
import {describeSpriteLightProfile,projectSpriteLightBands,MAX_SPRITE_LIGHT_BANDS}
  from '../src/sprite-light-bands.mjs';
import {SpriteLightingCache,SPRITE_LIGHT_FRAME_PIXELS,SPRITE_LIGHT_CACHE_BYTES}
  from '../src/sprite-lighting-cache.mjs';
import {HuntTreePreview} from '../src/hunt-tree-preview.mjs';
import {LIVE_TREES} from '../src/wet-forest-tree-sprites.mjs';

const image={complete:true,naturalWidth:1024};
function factory(w,h){
  return {getContext:()=>({
    drawImage(){},
    getImageData(){return {data:new Uint8ClampedArray(w*h*4).fill(127)};},
    createImageData(){return {data:new Uint8ClampedArray(w*h*4)};},
    putImageData(){}
  })};
}
test('source and destination cutout rows remain exactly contiguous with alpha retained',()=>{
  const sprite=LIVE_TREES[4],rect=[33,41,110,159];
  const profile=describeSpriteLightProfile({id:'future.building',x:5,y:2,z:-3,scale:1,height:5},sprite);
  const bands=projectSpriteLightBands(sprite,rect,profile);
  assert.equal(bands.length,MAX_SPRITE_LIGHT_BANDS);
  assert.equal(bands.reduce((n,b)=>n+b.crop.h,0),sprite.h);
  assert.equal(bands.reduce((n,b)=>n+b.rect[3],0),rect[3]);
  assert.equal(bands[0].crop.y,sprite.y);
  assert.equal(bands.at(-1).crop.y+bands.at(-1).crop.h,sprite.y+sprite.h);
  assert.equal(bands[0].rect[1],rect[1]);
  assert.equal(bands.at(-1).rect[1]+bands.at(-1).rect[3],rect[1]+rect[3]);
  for(let i=1;i<bands.length;i++){
    assert.equal(bands[i-1].crop.y+bands[i-1].crop.h,bands[i].crop.y);
    assert.equal(bands[i-1].rect[1]+bands[i-1].rect[3],bands[i].rect[1]);
  }
  assert.ok(bands[0].position[1]>bands[1].position[1]);
  assert.ok(bands[1].position[1]>bands[2].position[1]);
  assert.ok(Object.isFrozen(bands[0])&&Object.isFrozen(bands[0].rect));
});
test('new tree or building artwork works through the same spatial profile contract',()=>{
  const sprite={x:0,y:0,w:112,h:183,ay:181};
  const tree=describeSpriteLightProfile({id:'new.tree',x:-3,y:2,z:8,scale:.8},sprite);
  const house=describeSpriteLightProfile({id:'future.house',x:-3,y:2,z:8,scale:.8,height:6},sprite);
  const t=projectSpriteLightBands(sprite,[0,0,90,130],tree);
  const b=projectSpriteLightBands(sprite,[0,0,90,130],house);
  assert.equal(t.length,3);
  assert.equal(b.length,3);
  assert.ok(b[0].position[1]>t[0].position[1]);
  assert.equal(t[1].position[0],-3);
  assert.equal(b[1].position[2],8);
  assert.equal(projectSpriteLightBands(sprite,[0,0,90,130],null),null);
});
test('three tint crops consume no more cold pixel work than one full-sprite tint',()=>{
  const cache=new SpriteLightingCache(factory),sprite=LIVE_TREES[4];
  const profile=describeSpriteLightProfile({x:0,y:2,z:0,scale:1},sprite);
  const draws=[],ctx={drawImage:(...args)=>draws.push(args)},samples=[];
  cache.beginFrame();
  assert.equal(cache.drawBanded(ctx,image,sprite,[0,0,106,160],position=>{
    samples.push(position);
    return position[1]>4?[.35,.4,.45]:[1.4,.6,.34];
  },[.42,.42,.42],profile),true);
  assert.equal(cache.statistics.bandedSprites,1);
  assert.equal(cache.statistics.bandDraws,3);
  assert.equal(samples.length,3);
  assert.equal(draws.length,3);
  assert.ok(cache.statistics.framePixels<=SPRITE_LIGHT_FRAME_PIXELS);
  assert.ok(cache.statistics.bytes<=SPRITE_LIGHT_CACHE_BYTES);
  assert.ok(draws.every(args=>args[0]!==image),'no raw atlas flash on an affordable cold tint');
  cache.beginFrame();
  cache.drawBanded(ctx,image,sprite,[0,0,106,160],()=>[.35,.4,.45],[.42,.42,.42],profile);
  assert.ok(cache.statistics.framePixels<=SPRITE_LIGHT_FRAME_PIXELS);
});
test('small cutouts fall back to a single tint without gaps or extra work',()=>{
  const cache=new SpriteLightingCache(factory),sprite=LIVE_TREES[4];
  const profile=describeSpriteLightProfile({x:2,y:4,z:0,scale:1},sprite);
  const draws=[],ctx={drawImage:(...args)=>draws.push(args)};
  cache.beginFrame();
  assert.equal(cache.drawBanded(ctx,image,sprite,[0,0,30,15],
    position=>[position[1]/10,.4,.4],[.42,.42,.42],profile),false);
  assert.equal(cache.statistics.bandedSprites,0);
  assert.equal(draws.length,1);
  assert.ok(cache.statistics.framePixels<=SPRITE_LIGHT_FRAME_PIXELS);
});
test('the actual Hunt scene samples the same tree sprite at three world heights',()=>{
  const placement={kind:'tree',id:'tree.new',seed:7,scale:1,
    position:{x:0,y:5,z:0},footprint:{radius:.46}};
  const graph={layout:{regions:[],links:[]},placement:()=>({placements:[placement]})};
  const events=[],lightingCache={
    beginFrame(){},draw(){events.push('flat');},
    drawBanded(ctx,img,sprite,rect,sample,ambient,profile){
      const bands=projectSpriteLightBands(sprite,rect,profile);
      assert.equal(bands.length,3);
      bands.forEach(b=>sample(b.position));
      events.push('bands');
    },clear(){},statistics:{bytes:0,entries:0}
  };
  const scene=new HuntTreePreview(graph,image,undefined,{
    scenery:{trees:()=>[]},lightingCache
  });
  scene.update(['one'],{raycast:()=>({point:{x:0,y:5,z:0}})});
  const observed=[];
  const light={ambient:[.42,.42,.42],sample:position=>{
    observed.push(position);return [.42,.42,.42];
  }};
  const ctx={save(){},restore(){},drawImage(){},fillRect(){},imageSmoothingEnabled:false};
  scene.paint(ctx,{camera:'hunt',width:700,height:700,scale:24},
    {x:0,y:5,z:0},()=>{},null,100,light,false,false);
  assert.deepEqual(events,['bands']);
  assert.equal(observed.length,3);
  assert.ok(observed[0][1]>observed[1][1]&&observed[1][1]>observed[2][1]);
  scene.dispose();
});
