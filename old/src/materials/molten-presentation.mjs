// Materials owns molten surface/display colours and relative emission.
// Fluid simulation supplies wet surfaces; Lighting consumes emission values.
export const MOLTEN_PRESENTATION=Object.freeze({
  dark:Object.freeze([.29,.055,.015]),hot:Object.freeze([.86,.29,.045]),
  core:Object.freeze([1,.66,.16]),emission:Object.freeze([1,.31,.055])
});
export const MOLTEN_DISPLAY_GLSL=Object.entries(MOLTEN_PRESENTATION)
  .filter(([name])=>name!=='emission')
  .map(([name,color])=>`const vec3 MOLTEN_${name.toUpperCase()}=vec3(${color.join(',')});`).join('\n');
