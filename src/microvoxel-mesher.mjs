// Voxel V2: build *axis-aligned* 10cm cubic micro-geometry.
// This is not vertex deformation. Every emitted quad bounds contiguous
// occupied 10cm cells in the same authoritative VoxelWorld.
// Coarse worker meshes are retained except faces of refined top voxels.
const dirs=[
  ['+x',1,0],['-x',-1,0],['+z',0,1],['-z',0,-1]
];
const tileKey=(x,y,z)=>x+','+y+','+z;
const chunkKey=(x,y,z,edge)=>
  Math.floor(x/edge)+','+Math.floor(y/edge)+','+Math.floor(z/edge);
const quant=v=>Math.round(v*10)/10;

export function buildPixelMicroSurfaceMeshes(world,meshes,{
  maxFaces=100000
}={}) {
  if(!world || typeof world.microSurfaceTiles!=='function' ||
      typeof world.get!=='function' || !Array.isArray(meshes) ||
      !Number.isSafeInteger(maxFaces) || maxFaces<1 || maxFaces>150000) {
    throw new TypeError('Expected Voxel V2 world, mesh arrays and bounded face budget');
  }
  const all=world.microSurfaceTiles();
  if(!all.length) return meshes;
  const edge=world.chunkEdge;
  const lookup=new Map(all.map(tile=>[tileKey(tile.x,tile.y,tile.z),tile]));
  const byChunk=new Map();
  for(const tile of all) {
    const id=chunkKey(tile.x,tile.y,tile.z,edge);
    if(!byChunk.has(id))byChunk.set(id,[]);
    byChunk.get(id).push(tile);
  }
  let totalFaces=0;
  return meshes.map(mesh=>{
    const tiles=byChunk.get(mesh.id)??[];
    if(!tiles.length) return mesh;
    if(!(mesh.positions instanceof Float32Array) ||
        !(mesh.normals instanceof Int8Array) ||
        !(mesh.materials instanceof Uint8Array) ||
        !(mesh.indices instanceof Uint32Array) ||
        mesh.positions.length%12!==0) {
      throw new TypeError('Expected exposed-face Voxel V2 mesh');
    }
    const positions=[],normals=[],materials=[],indices=[];
    const counts={'+x':0,'-x':0,'+y':0,'-y':0,'+z':0,'-z':0};
    const origin=mesh.origin;
    function emit(name,verts,material) {
      if(++totalFaces>maxFaces) {
        throw new RangeError('Sparse microvoxel mesh face budget exceeded');
      }
      const normal=name==='+x'?[1,0,0]:name==='-x'?[-1,0,0]:
        name==='+y'?[0,1,0]:name==='-y'?[0,-1,0]:
        name==='+z'?[0,0,1]:[0,0,-1];
      const start=positions.length/3;
      for(const point of verts) {
        positions.push(quant(point[0]-origin[0]),
          quant(point[1]-origin[1]),quant(point[2]-origin[2]));
        normals.push(...normal);
        materials.push(material);
      }
      indices.push(start,start+1,start+2,start,start+2,start+3);
      counts[name]++;
    }
    function face(name,x0,x1,y0,y1,z0,z1,material) {
      const v=name==='+y'
        ? [[x0,y1,z0],[x0,y1,z1],[x1,y1,z1],[x1,y1,z0]]
        : name==='+x'
          ? [[x1,y0,z0],[x1,y1,z0],[x1,y1,z1],[x1,y0,z1]]
          : name==='-x'
            ? [[x0,y0,z0],[x0,y0,z1],[x0,y1,z1],[x0,y1,z0]]
            : name==='+z'
              ? [[x0,y0,z1],[x1,y0,z1],[x1,y1,z1],[x0,y1,z1]]
              : [[x0,y0,z0],[x0,y1,z0],[x1,y1,z0],[x1,y0,z0]];
      emit(name,v,material);
    }
    // Only strip whole-voxel TOP and visible side quads for refined cells.
    // Every unrefined voxel face, including the solid underworld, is untouched.
    for(let i=0;i<mesh.positions.length;i+=12) {
      const name=mesh.normals[i+1]===1?'+y':
        mesh.normals[i+1]===-1?'-y':
        mesh.normals[i]===1?'+x':
        mesh.normals[i]===-1?'-x':
        mesh.normals[i+2]===1?'+z':'-z';
      const xs=[0,3,6,9].map(k=>mesh.positions[i+k]+origin[0]);
      const ys=[1,4,7,10].map(k=>mesh.positions[i+k]+origin[1]);
      const zs=[2,5,8,11].map(k=>mesh.positions[i+k]+origin[2]);
      const x=Math.min(...xs),z=Math.min(...zs);
      const y=Math.min(...ys)-(name==='+y'?1:0);
      if(name!=='-y' && lookup.has(tileKey(x,y,z))) continue;
      const verts=[0,3,6,9].map(k=>[
        mesh.positions[i+k]+origin[0],
        mesh.positions[i+k+1]+origin[1],
        mesh.positions[i+k+2]+origin[2]
      ]);
      emit(name,verts,mesh.materials[i/3]);
    }
    function neighboring(tile,ix,iz) {
      let x=tile.x,z=tile.z,localX=ix,localZ=iz;
      if(ix<0){x--;localX+=10;}
      else if(ix>=10){x++;localX-=10;}
      if(iz<0){z--;localZ+=10;}
      else if(iz>=10){z++;localZ-=10;}
      const other=lookup.get(tileKey(x,tile.y,z));
      if(other) return {level:other.levels[localZ*10+localX],
        owned:true,material:world.get(x,tile.y,z)};
      const material=world.get(x,tile.y,z);
      return {level:material?10:0,owned:false,material};
    }
    for(const tile of tiles) {
      const material=world.get(tile.x,tile.y,tile.z);
      if(!material) continue;
      const used=new Uint8Array(100);
      // Greedy merging of flat microcell top quads avoids paying for
      // 100 distinct faces on each perfectly level 1m tile.
      for(let iz=0;iz<10;iz++)for(let ix=0;ix<10;ix++) {
        const at=iz*10+ix;
        if(used[at])continue;
        const h=tile.levels[at];
        let w=1,d=1;
        while(ix+w<10 && !used[at+w] && tile.levels[at+w]===h)w++;
        outer:while(iz+d<10) {
          for(let dx=0;dx<w;dx++) {
            const j=(iz+d)*10+ix+dx;
            if(used[j] || tile.levels[j]!==h)break outer;
          }
          d++;
        }
        for(let dz=0;dz<d;dz++)for(let dx=0;dx<w;dx++) {
          used[(iz+dz)*10+ix+dx]=1;
        }
        face('+y',tile.x+ix/10,tile.x+(ix+w)/10,
          tile.y,tile.y+h/10,
          tile.z+iz/10,tile.z+(iz+d)/10,material);
      }
      // Vertical quads occupy the discrete height difference between
      // adjacent 10cm columns. All faces are axis-aligned, never sloped.
      for(let iz=0;iz<10;iz++)for(let ix=0;ix<10;ix++) {
        const level=tile.levels[iz*10+ix];
        const x0=tile.x+ix/10,x1=tile.x+(ix+1)/10;
        const z0=tile.z+iz/10,z1=tile.z+(iz+1)/10;
        for(const [name,dx,dz] of dirs) {
          const neighbor=neighboring(tile,ix+dx,iz+dz);
          if(level===neighbor.level)continue;
          if(level<neighbor.level && neighbor.owned)continue;
          const lower=Math.min(level,neighbor.level);
          const higher=Math.max(level,neighbor.level);
          const side=level>neighbor.level?name:
            name==='+x'?'-x':name==='-x'?'+x':
              name==='+z'?'-z':'+z';
          face(side,x0,x1,tile.y+lower/10,tile.y+higher/10,
            z0,z1,level>neighbor.level?material:neighbor.material);
        }
      }
    }
    const result={
      ...mesh,positions:Float32Array.from(positions),
      normals:Int8Array.from(normals),materials:Uint8Array.from(materials),
      indices:Uint32Array.from(indices),faceCounts:counts,
      faceCount:positions.length/12,
      triangleCount:indices.length/3,vertexCount:positions.length/3
    };
    result.cpuBufferBytes=result.positions.byteLength+
      result.normals.byteLength+result.materials.byteLength+
      result.indices.byteLength;
    return result;
  });
}
