// Compile the actual assembled WebGL2 GLSL ES 3.00 shader sources.
// Node --check and fake GL test doubles cannot detect reserved GLSL words.
import { execFileSync } from 'node:child_process';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  WEBGL_V2_VERTEX_SHADER_SOURCE,
  WEBGL_V2_FRAGMENT_SHADER_SOURCE
} from '../src/webgl-voxel-view.mjs';
import {FLUID_VERTEX_GLSL,FLUID_FRAGMENT_GLSL} from '../src/fluid/hunt-fluid-surface-renderer.mjs';

const temp=mkdtempSync(join(tmpdir(),'wyrmforge-glsl-'));
try {
  for(const [owner,stage,source] of [
    ['voxel','vert',WEBGL_V2_VERTEX_SHADER_SOURCE],
    ['voxel','frag',WEBGL_V2_FRAGMENT_SHADER_SOURCE],
    ['fluid','vert',FLUID_VERTEX_GLSL],
    ['fluid','frag',FLUID_FRAGMENT_GLSL]
  ]) {
    if(!source.startsWith('#version 300 es\n')) {
      throw new Error('Expected assembled WebGL2 GLSL ES 3.00 '+stage+' shader');
    }
    const shaderPath=join(temp,owner+'.'+stage);
    writeFileSync(shaderPath,source);
    try {
      execFileSync('glslangValidator',['-S',stage,shaderPath],{
        stdio:'pipe',encoding:'utf8'
      });
    } catch(error) {
      const details=error.stderr?.toString() || error.stdout?.toString() ||
        error.message;
      throw new Error('GLSL '+stage+' shader compilation failed:\n'+details,{
        cause:error
      });
    }
    process.stdout.write('GLSL ES 3.00 '+owner+' '+stage+' shader compiled\n');
  }
} finally {
  rmSync(temp,{recursive:true,force:true});
}
