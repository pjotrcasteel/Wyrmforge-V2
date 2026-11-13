import test from 'node:test';
import assert from 'node:assert/strict';
import { VoxelWorld } from '../src/voxel-world.mjs';
import { buildExposedFaceMeshes } from '../src/exposed-face-mesher.mjs';
import { buildPixelMicroSurfaceMeshes } from '../src/microvoxel-mesher.mjs';
import { createWorldSiteRecipe } from '../src/world-generation/site-recipe.mjs';
import { generateWorldSite } from '../src/world-generation/index.mjs';
import {
  selectRoadCell,roadMicroCut,microCellCenter
} from '../src/world-generation/road-footprint.mjs';

const same=(a,b)=>Math.abs(a-b)<1e-6;
const cols=height=>Array(100).fill(height);
function quads(meshes) {
  return meshes.flatMap(mesh=>{
    const faces=[];
    for(let i=0;i<mesh.positions.length;i+=12) {
      const points=[];
      for(let k=0;k<12;k+=3) {
        points.push([
          mesh.origin[0]+mesh.positions[i+k],
          mesh.origin[1]+mesh.positions[i+k+1],
          mesh.origin[2]+mesh.positions[i+k+2]
        ]);
      }
      faces.push({
        points,material:mesh.materials[i/3],
        normal:[mesh.normals[i],mesh.normals[i+1],mesh.normals[i+2]]
      });
    }
    return faces;
  });
}
const wallAt=(face,axis,plane)=>face.points.every(p=>same(p[axis],plane)) &&
  new Set(face.points.map(p=>p[1])).size>=2;

test('a lowered dirt road next to full-height grass has one correctly aligned 10cm wall',()=>{
  const world=new VoxelWorld();
  world.set(0,0,0,2);
  world.set(1,0,0,1);
  world.setMicroSurfaceTile(0,0,0,cols(9));
  const faces=quads(buildPixelMicroSurfaceMeshes(world,buildExposedFaceMeshes(world)));
  const walls=faces.filter(face=>wallAt(face,0,1));
  const crossing=walls.filter(face=>
    face.points.some(p=>same(p[1],0.9)) &&
    face.points.some(p=>same(p[1],1)));
  assert.equal(crossing.length,10,
    'the 10 fine grass-side wall sections meet the exact road boundary at x=1');
  assert.ok(crossing.every(face=>
    face.material===1 && face.normal[0]===-1),
    'the exposed grass edge must face the road, with grass-side material');
  assert.equal(faces.filter(face=>
    wallAt(face,0,0.9) && face.points.some(p=>same(p[1],1))).length,0,
    'no step walls may be shifted 10cm inside the road');
  assert.equal(world.materialAtPoint(0.95,0.95,0.5),0);
  assert.equal(world.materialAtPoint(1.05,0.95,0.5),1);
});

test('a refined road exposed on positive X and Z drops its legacy 1m side walls',()=>{
  const world=new VoxelWorld();
  world.set(0,0,0,2);
  world.setMicroSurfaceTile(0,0,0,cols(8));
  const original=buildExposedFaceMeshes(world);
  assert.equal(original[0].faceCount,6);
  const faces=quads(buildPixelMicroSurfaceMeshes(world,original));
  for(const face of faces) {
    const top=Math.max(...face.points.map(p=>p[1]));
    assert.ok(top<=0.8+1e-6,
      'legacy coarse +X, +Z, -X, -Z, or +Y full-height face leaked through');
  }
  assert.ok(faces.some(face=>wallAt(face,0,1)));
  assert.ok(faces.some(face=>wallAt(face,2,1)));
  assert.ok(faces.some(face=>wallAt(face,0,0)));
  assert.ok(faces.some(face=>wallAt(face,2,0)));
});

test('negative X and Z road-to-grass boundaries are equally exact',()=>{
  const world=new VoxelWorld();
  world.set(0,0,0,2);
  world.set(-1,0,0,1);
  world.set(0,0,-1,1);
  world.setMicroSurfaceTile(0,0,0,cols(7));
  const faces=quads(buildPixelMicroSurfaceMeshes(world,buildExposedFaceMeshes(world)));
  for(const [axis,plane,normalAxis,normal] of [
    [0,0,0,1],[2,0,2,1]
  ]) {
    const crossing=faces.filter(face=>wallAt(face,axis,plane) &&
      face.points.some(p=>same(p[1],0.7)) &&
      face.points.some(p=>same(p[1],1)));
    assert.equal(crossing.length,10);
    assert.ok(crossing.every(face=>face.normal[normalAxis]===normal));
  }
});

test('every generated 10cm road step belongs to the exact material-painted cell',()=>{
  for(const kind of ['wet-forest','forest-highland','mountain-pass']) {
    for(const seed of [7,19,101,267]) {
      const generated=generateWorldSite(createWorldSiteRecipe({
        regionId:'road-material-seam',siteId:'material-'+kind,
        encounterId:'seam-check',kind,seed,chunkEdge:16
      }));
      const {routes}=generated.layout;
      const {runs,surfaceTiles}=generated.definition;
      let authoredRoadTiles=0;
      for(const tile of surfaceTiles) {
        const selected=selectRoadCell(tile.x,tile.z,routes);
        if(!selected) {
          assert.equal(kind,'mountain-pass',
            'soft terrain must never have detached micro cuts beneath grass');
          continue;
        }
        authoredRoadTiles++;
        const top=runs.find(run=>run.y===tile.y && run.z===tile.z &&
          run.x<=tile.x && run.x+run.length>tile.x);
        assert.ok(top,'micro step must belong to a real physical top voxel');
        assert.equal(top.material,selected.route.roadProfile.material,
          'painted road material and 10cm occupancy must share one cell selector');
        const transition=[[1,0],[-1,0],[0,1],[0,-1]].some(([dx,dz])=>{
          const nx=tile.x+dx,nz=tile.z+dz;
          const lower=runs.some(run=>run.x<=nx && run.x+run.length>nx &&
            run.z===nz && run.y===tile.y-1 && run.material!==0);
          const lowerTop=runs.some(run=>run.x<=nx && run.x+run.length>nx &&
            run.z===nz && run.y===tile.y && run.material!==0);
          return lower && !lowerTop && selectRoadCell(nx,nz,routes);
        });
        for(let z=0;z<10;z++)for(let x=0;x<10;x++) {
          const cut=roadMicroCut(microCellCenter(tile.x,x),microCellCenter(tile.z,z),selected);
          assert.equal(tile.levels[z*10+x],10-Math.max(cut,transition?5:0),
            'road cells must match authored material and physical half-metre landing');
        }
      }
      assert.ok(authoredRoadTiles>=20);
      assert.ok(generated.layout.roads.ready);
      assert.ok(generated.layout.combatFlow.ready);
      assert.ok(generated.layout.escapeAudit.ready);
    }
  }
});

test('adjacent refined tile and full tile share the exact topological boundary after removal',()=>{
  const world=new VoxelWorld();
  world.set(0,0,0,2);
  world.set(1,0,0,1);
  world.setMicroSurfaceTile(0,0,0,cols(9));
  const withRoad=quads(buildPixelMicroSurfaceMeshes(world,buildExposedFaceMeshes(world)));
  assert.ok(withRoad.some(face=>wallAt(face,0,1) &&
    face.points.some(p=>same(p[1],0.9))));
  world.set(0,0,0,0);
  const after=quads(buildPixelMicroSurfaceMeshes(world,buildExposedFaceMeshes(world)));
  assert.equal(world.microSurfaceCount,0);
  assert.ok(after.some(face=>wallAt(face,0,1) &&
    face.points.some(p=>same(p[1],1)) &&
    face.points.some(p=>same(p[1],0))),
    'deleting the road voxel restores the exact exposed 1m neighbor wall');
});
