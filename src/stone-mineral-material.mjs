// Materials owns pixel-art mineral color and grain, never cliff geometry.
// No panel outlines, glowing cracks, dynamic lighting or texture uploads.
export const STONE_MINERAL_MATERIAL_GLSL=`
vec3 stoneMineralSurface(vec3 surface,float heat) {
  bool top=abs(vNormal.y)>.5;
  vec2 uv=top?vWorld.xz:abs(vNormal.x)>.5?vWorld.zy:vWorld.xy;
  vec2 pixel=floor(uv*16.0);
  vec2 point=(pixel+.5)/16.0;
  float field=labNoise(vWorld.xz*.21+vec2(13,47));
  float warp=labNoise(point*.36+vec2(31,7));
  float chips=labNoise(point*vec2(1.25,.95)+warp*1.4);
  float grain=soilHash(pixel+71.0);
  float cluster=soilHash(floor(pixel/vec2(3,2))+29.0);
  // Several scales of clustered minerals. Broad quiet regions separate the
  // textured rock patches, rather than outlining every voxel as a stone tile.
  float shade=floor(clamp(chips*.68+cluster*.32,0.0,.999)*5.0)/4.0;
  vec3 dark=mix(vec3(.25,.29,.32),vec3(.205,.195,.225),heat);
  vec3 mid=mix(vec3(.40,.445,.45),vec3(.345,.32,.335),heat);
  vec3 pale=mix(vec3(.56,.56,.49),vec3(.49,.435,.37),heat);
  vec3 color=mix(dark,mid,.35+shade*.65);
  float cool=warp*.6+field*.4;
  if(field>.59&&cool>.48)color=mix(color,mix(vec3(.35,.43,.47),vec3(.30,.32,.385),heat),.28);
  float weather=chips*.6+field*.4;
  if(field<.43&&weather>.57)color=mix(color,mix(vec3(.43,.365,.255),vec3(.45,.275,.17),heat),.30);
  // Pale mineral inclusions and dark pores occur in small broken clusters.
  // Pixel-scale accents stay subordinate to the larger mineral patches.
  if(chips>.52&&cluster>.76){
    color=mix(color,pale,.30);
    if(grain>.70)color=mix(color,pale,.24);
  }else if(chips<.43&&cluster<.22)color*=.83;
  color*=.96+.08*grain;
  if(!top)color*=.97;
  return srgbToLinearColor(color);
}
`;
