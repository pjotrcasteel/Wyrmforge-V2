import test from 'node:test';
import assert from 'node:assert/strict';
import {
  gradeNavigableRoads
} from '../src/world-generation/navigable-road-grades.mjs';
import { rasterizeEscapeRoute } from '../src/world-generation/escape-route-geometry.mjs';

const radius=20,idx=(x,z)=>(z+radius)*40+x+radius;
const road={kind:'test-trail',nominalCutFraction:0.2,material:2,cutVoxels:0};
function fixture() {
  const heights=new Int16Array(40*40).fill(4);
  for(let x=-8;x<=8;x++)heights[idx(x,0)]=4+Math.floor((x+8)/2);
  for(let z=-8;z<=8;z++)heights[idx(0,z)]=5+Math.floor((z+8)/3);
  heights[idx(17,17)]=18; // deliberately dangerous cliff, not an authored path
  return heights;
}
const paths={
  routes:[{id:'main',width:2,nodes:[{x:-8,z:0},{x:0,z:0},{x:8,z:0}],
    roadProfile:road}],
  escapeRoutes:[{id:'escape',nodes:[{x:0,z:-8},{x:0,z:0},{x:0,z:8}]}],
  flowLinks:[{id:'pocket-link',nodes:[{x:0,z:0},{x:5,z:5}]}],
  approaches:[{id:'flank',x:-5,z:-6}],
  combatSpaces:[{id:'arena',x:0,z:0,radius:5}]
};
const coordinates=[...paths.routes,...paths.escapeRoutes,...paths.flowLinks,
  {nodes:[{x:-5,z:-6},{x:0,z:0}]}].map(p=>rasterizeEscapeRoute(p.nodes));

test('joint travel gradients cross on exact shared 10cm physics heights',()=>{
  const heights=fixture(),before=heights.slice();
  const report=gradeNavigableRoads({radius,heights,...paths});
  assert.equal(report.schema,'wyrmforge.shared-tenths-traversal-grade.v1');
  assert.ok(report.cells>=35);
  assert.ok(report.maximumGradeTenths<=5);
  assert.ok(report.iterations<=report.cells);
  assert.equal(heights[idx(17,17)],before[idx(17,17)],
    'world generation must retain genuine cliffs outside walking corridors');
  const sampled=new Map(report.centers.map(p=>[p.x+','+p.z,p.topTenths]));
  assert.equal(sampled.size,report.cells);
  for(const path of coordinates)for(let j=1;j<path.length;j++) {
    const a=sampled.get(path[j-1].x+','+path[j-1].z);
    const b=sampled.get(path[j].x+','+path[j].z);
    assert.ok(a!==undefined && b!==undefined);
    assert.ok(Math.abs(a-b)<=5,
      'joined road/escape/flank transitions must not exceed a real 50cm step');
  }
  for(const p of report.centers) {
    const y=heights[idx(p.x,p.z)];
    assert.ok(p.topTenths-y*10>=1 && p.topTenths-y*10<=10,
      'every quantized grade must be representable by a physical microtile');
  }
});

test('joint traversal grade is deterministic and does not change user-authored routes',()=>{
  const first=fixture(),second=fixture();
  const routes=JSON.stringify(paths);
  const a=gradeNavigableRoads({radius,heights:first,...paths});
  const b=gradeNavigableRoads({radius,heights:second,...paths});
  assert.deepEqual(first,second);
  assert.deepEqual(a.centers,b.centers);
  assert.equal(a.maximumGradeTenths,b.maximumGradeTenths);
  assert.equal(JSON.stringify(paths),routes);
});

test('optional Strategy without circulation leaves whole-voxel heights untouched',()=>{
  const heights=fixture(),before=heights.slice();
  const result=gradeNavigableRoads({radius,heights});
  assert.equal(result.cells,0);
  assert.equal(result.maximumGradeTenths,0);
  assert.deepEqual(heights,before);
});
