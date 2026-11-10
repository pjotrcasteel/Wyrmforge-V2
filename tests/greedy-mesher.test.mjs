import test from 'node:test';
import assert from 'node:assert/strict';
import { VoxelWorld, createScene } from '../src/voxel-world.mjs';
import { buildExposedFaceMeshes } from '../src/exposed-face-mesher.mjs';
import { buildGreedyFaceMeshes } from '../src/greedy-mesher.mjs';

// Expand each quad into exact unit surface patches. These keys include face normal,
// plane, integer cell footprint and material; matching counts alone is insufficient.
function surfaces(meshes) {
  const result = [];
  for (const mesh of meshes) {
    for (let q = 0; q < mesh.faceCount; q++) {
      const p = [];
      for (let corner = 0; corner < 4; corner++) {
        const vertex = (q*4 + corner)*3;
        p.push([0,1,2].map(i => mesh.positions[vertex+i] + mesh.origin[i]));
      }
      const normal = [...mesh.normals.subarray(q*12, q*12+3)];
      const axis = normal.findIndex(n => n !== 0);
      const tangent = [0,1,2].filter(i => i !== axis);
      const [u,v] = tangent;
      const minU = Math.min(...p.map(point => point[u]));
      const maxU = Math.max(...p.map(point => point[u]));
      const minV = Math.min(...p.map(point => point[v]));
      const maxV = Math.max(...p.map(point => point[v]));
      const plane = p[0][axis];
      const material = mesh.materials[q*4];
      assert.ok(material > 0);
      assert.ok(p.every(point => point[axis] === plane));
      assert.ok(mesh.materials.subarray(q*4,q*4+4).every(m => m === material));
      for (let j = minV; j < maxV; j++) {
        for (let i = minU; i < maxU; i++) {
          result.push(`${normal.join(',')}|${plane}|${i}|${j}|${material}`);
        }
      }
      const i0 = q*6;
      assert.deepEqual([...mesh.indices.subarray(i0,i0+6)],
        [q*4,q*4+1,q*4+2,q*4,q*4+2,q*4+3]);

      // Every rectangle preserves the same outward winding as exposed faces.
      const a = p[0], b = p[1], c = p[2];
      const ab = b.map((n,i) => n-a[i]);
      const ac = c.map((n,i) => n-a[i]);
      const cross = [ab[1]*ac[2]-ab[2]*ac[1],
        ab[2]*ac[0]-ab[0]*ac[2],
        ab[0]*ac[1]-ab[1]*ac[0]];
      assert.ok(cross.reduce((n,x,i) => n+x*normal[i],0) > 0);
    }
  }
  const unique = new Set(result);
  assert.equal(unique.size,result.length,'No surface patch may be generated twice');
  return result.sort();
}

function compare(world, { chunkIds = null } = {}) {
  const config = chunkIds === null ? {} : { chunkIds };
  const exposed = buildExposedFaceMeshes(world,config);
  const greedy = buildGreedyFaceMeshes(world,config);
  assert.deepEqual(surfaces(greedy),surfaces(exposed));
  assert.deepEqual(greedy.map(mesh=>mesh.id),exposed.map(mesh=>mesh.id));
  for (let m=0;m<greedy.length;m++) {
    const a=greedy[m],b=exposed[m];
    assert.equal(a.revision,b.revision);
    assert.deepEqual(a.neighborRevisions,b.neighborRevisions);
    assert.deepEqual(a.origin,b.origin);
    assert.ok(a.faceCount<=b.faceCount);
    assert.equal(a.unitFaceCount,b.faceCount);
    for(const [name,count] of Object.entries(b.faceCounts)) {
      assert.equal(a.unitFaceCounts[name],count);
    }
    assert.equal(a.triangleCount,a.faceCount*2);
    assert.equal(a.cpuBufferBytes,a.positions.byteLength+a.normals.byteLength+
      a.materials.byteLength+a.indices.byteLength);
  }
  return { exposed,greedy };
}

test('single voxel retains six outward unit faces and materials', () => {
  const world=new VoxelWorld();
  world.set(0,0,0,7);
  const {greedy}=compare(world);
  assert.equal(greedy[0].faceCount,6);
  assert.equal(greedy[0].unitFaceCount,6);
});

test('contiguous planar surfaces merge while preserving exposed materials', () => {
  const world=new VoxelWorld();
  for(let x=0;x<8;x++) for(let z=0;z<8;z++) world.set(x,0,z,x<4?1:2);
  const {greedy,exposed}=compare(world);
  assert.ok(greedy[0].triangleCount<exposed[0].triangleCount/4);
  assert.equal(greedy[0].faceCounts['+y'],2,'two top materials must not merge');
});

test('all four V2 terrains match exactly at both chunk sizes', () => {
  for(const edge of [16,32]){
    for(const scene of ['flat','hill','cliff','arch']) {
      const world=createScene(scene,7,{chunkEdge:edge});
      compare(world);
    }
  }
});

test('signed seam edits and real interior cavities keep exactly the same visible faces', () => {
  for(const edge of [16,32]){
    const world=new VoxelWorld({chunkEdge:edge});
    for(let x=-2;x<=edge+1;x++){
      for(let y=-2;y<=2;y++){
        for(let z=-2;z<=2;z++){
          world.set(x,y,z,3);
        }
      }
    }
    for(const x of [-1,0,edge-1,edge]){
      world.set(x,0,0,0);
      world.set(x,1,0,0);
    }
    compare(world);
    const scoped=compare(world,{chunkIds:new Set(['-1,0,0','0,0,0','1,0,0'])});
    assert.ok(scoped.greedy.length>0);
  }
});

test('fragmented mixed-material cells match and do not claim savings where none exist', () => {
  for(const edge of [16,32]){
    const world=new VoxelWorld({chunkEdge:edge});
    for(let x=-8;x<8;x++){
      for(let z=-8;z<8;z++){
        for(let y=-2;y<=2;y++){
          if(((x*17+z*31+y*7)&3)===0) world.set(x,y,z,(Math.abs(x+y+z)%3)+1);
        }
      }
    }
    compare(world);
  }
});

test('a scoped build reads only copied local chunks and immediate neighbors', () => {
  const world=createScene('arch',7,{chunkEdge:32});
  const proxy={
    chunkEdge:world.chunkEdge,
    chunkSnapshot:(x,y,z)=>world.chunkSnapshot(x,y,z),
    snapshots:()=>{throw new Error('global snapshot forbidden');}
  };
  const greedy=buildGreedyFaceMeshes(proxy,{chunkIds:['0,0,0']});
  assert.equal(greedy.length,1);
  assert.deepEqual(surfaces(greedy),
    surfaces(buildExposedFaceMeshes(world,{chunkIds:['0,0,0']})));
});

test('invalid budgets and scoped IDs fail before geometry is committed', () => {
  const world=new VoxelWorld();
  world.set(0,0,0,1);
  for(const limit of [0,-1,1.2,150001,Infinity]){
    assert.throws(()=>buildGreedyFaceMeshes(world,{maxQuadsPerChunk:limit}),RangeError);
  }
  assert.throws(()=>buildGreedyFaceMeshes(world,{maxQuadsPerChunk:5}),RangeError);
  for(const id of ['bad','1,0','01,0,0','9007199254740992,0,0']){
    assert.throws(()=>buildGreedyFaceMeshes(world,{chunkIds:[id]}),TypeError);
  }
  assert.deepEqual(buildGreedyFaceMeshes(world,{chunkIds:['2,0,0']}),[]);
});
