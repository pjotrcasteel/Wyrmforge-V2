// V2 terrain material contract. Stable voxel IDs, independent of rendering and art files.
// Future texture packs replace appearance, never world material IDs or terrain edits.
export const TERRAIN_MATERIALS = Object.freeze([
  Object.freeze({id:1,key:'grass',albedo:Object.freeze([0.38,0.55,0.28]),textureKey:'terrain/grass'}),
  Object.freeze({id:2,key:'dirt',albedo:Object.freeze([0.48,0.34,0.24]),textureKey:'terrain/dirt'}),
  Object.freeze({id:3,key:'stone',albedo:Object.freeze([0.42,0.47,0.53]),textureKey:'terrain/stone'})
]);

export function terrainMaterial(id) {
  return TERRAIN_MATERIALS.find(material => material.id === id) ?? null;
}

// Generate only the material lookup, not lighting. Renderers can swap this for a
// texture atlas without coupling the terrain world or meshing worker to artwork.
export function terrainMaterialGlsl() {
  const branches = TERRAIN_MATERIALS.map((material, index) => {
    const color = material.albedo.map(value => value.toFixed(2)).join(', ');
    return `  ${index === 0 ? 'if' : 'else if'} (materialId < ${(material.id + 0.5).toFixed(1)}) return vec3(${color});`;
  });
  return `vec3 terrainAlbedo(float materialId) {\n${branches.join('\n')}\n  return vec3(1.0, 0.0, 1.0);\n}`;
}
