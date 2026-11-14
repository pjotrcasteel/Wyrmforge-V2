import test from 'node:test';
import assert from 'node:assert/strict';
import {placeScenicEdgeTrees} from '../src/hunt-tree-preview.mjs';
import {projectVoxel} from '../src/camera-presets.mjs';
import {containsHuntLandform} from '../src/world-generation/hunt-landform-footprint.mjs';

test('scenic roots stay outside terrain while crowns can project over its edge',()=>{
  const bounds={minX:0,maxX:19,minZ:0,maxZ:19};
  const region={bounds,landform:Array.from({length:20},()=>[{start:0,end:20}])};
  const layout={regions:[region],links:[]};
  const terrain={raycast:()=>({point:{y:5}})};
  const trees=placeScenicEdgeTrees(region,layout,terrain);
  const view={width:402,height:604,scale:16,camera:'hunt'};
  const edge=projectVoxel(10,5,20,view).y;
  assert.ok(trees.every(tree=>!containsHuntLandform(region,tree.x,tree.z)));
  assert.ok(trees.some(tree=>{
    if(tree.z<=20||tree.x<2||tree.x>17)return false;
    const root=projectVoxel(tree.x,tree.y,tree.z,view).y;
    return root>edge&&root-tree.sprite.ay*tree.scale*view.scale/32<edge;
  }));
});
