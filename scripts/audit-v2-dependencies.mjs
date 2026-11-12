// V2 clean-room dependency audit: only repository-local relative ESM imports.
// Check source, test and runtime entrypoints; external asset references must be
// repo-relative and must not escape the repository or reference V1 directories.
import { readdirSync, readFileSync, realpathSync, statSync, existsSync } from 'node:fs';
import { dirname, extname, isAbsolute, relative, resolve, sep } from 'node:path';
import { pathToFileURL } from 'node:url';

const CODE_EXTENSIONS=new Set(['.mjs','.js']);
const SCAN_DIRS=['src','tests','scripts','assets','styles','css'];
const ENTRY_FILES=['main.mjs','external-terrain-lab.mjs'];
// Match import/export declarations at the beginning of a source line; do not
// interpret fixture strings or regex literals as executable imports.
const IMPORT_PATTERN=/^\s*(?:import\s+(?:[^'"\r\n]*?\s+from\s*)?|export\s+[^'"\r\n]*?\s+from\s*)['"]([^'"\r\n]+)['"]/gm;
const ASSET_PATTERN=/(?:\b(?:src|href)\s*=\s*|\bnew\s+URL\s*\(\s*)['"]([^'"]+)['"]/g;
// CSS asset references can live in standalone .css files or inline <style>.
const CSS_URL_PATTERN=/\burl\(\s*(['"]?)([^'")]+)\1\s*\)/g;
const CSS_IMPORT_PATTERN=/@import\s+(['"])([^'"]+)\1/g;
const SRCSET_PATTERN=/\bsrcset\s*=\s*(["'])(.*?)\1/g;
const DYNAMIC_IMPORT_PATTERN=/\bimport\s*\(\s*['"]([^'"]+)['"]\s*\)/g;
const FORBIDDEN=/(?:^|[\\/])(?:Wyrmforge\.Presentation|experimental|legacy|v1)(?:[\\/]|$)/i;
function within(root,file) {
  const path=relative(root,file);
  return path!=='' && path!=='..' && !path.startsWith('..'+sep) && !isAbsolute(path);
}
export function auditV2Dependencies(root) {
  const base=realpathSync(root);
  const issues=[];
  let scanned=0,dependencies=0;
  function checkPath(from,specifier,kind) {
    dependencies++;
    if(kind==='asset' && specifier.startsWith('#')) return; // Local fragment.
    if(kind==='import' && specifier.startsWith('#')) {
      issues.push(from+': non-local import '+specifier);
      return;
    }
    if(/^(?:https?:|data:|blob:|\/\/)/i.test(specifier)) {
      issues.push(from+': non-local '+kind+' '+specifier);
      return;
    }
    const pathOnly=specifier.split(/[?#]/,1)[0];
    if(!pathOnly || FORBIDDEN.test(pathOnly)) {
      issues.push(from+': forbidden '+kind+' '+specifier);return;
    }
    if(kind==='import' && pathOnly.startsWith('node:')) {
      // Development/tests may use the Node standard library. Production
      // WebGL2 modules are browser-only and must never import Node builtins.
      const runtime=ENTRY_FILES.some(name=>from===resolve(base,name)) ||
        from.startsWith(resolve(base,'src')+sep);
      if(runtime) issues.push(from+': browser runtime imports Node '+specifier);
      return;
    }
    if(kind==='import' && !pathOnly.startsWith('.')) {
      issues.push(from+': non-local import '+specifier);
      return;
    }
    if(kind==='asset' && !pathOnly.startsWith('.') && !pathOnly.startsWith('/')) {
      issues.push(from+': non-local asset '+specifier);
      return;
    }
    const candidate=resolve(dirname(from),pathOnly);
    if(candidate!==base && !within(base,candidate)) {
      issues.push(from+': escapes repository '+specifier);
      return;
    }
    if(!existsSync(candidate)) {
      issues.push(from+': unresolved '+kind+' '+specifier);
      return;
    }
    const canonical=realpathSync(candidate);
    if(canonical!==base && !within(base,canonical)) {
      issues.push(from+': symlink escapes repository '+specifier);
    }
  }
  function scan(file) {
    scanned++;
    const source=readFileSync(file,'utf8');
    for(const match of source.matchAll(IMPORT_PATTERN)) checkPath(file,match[1],'import');
    for(const match of source.matchAll(DYNAMIC_IMPORT_PATTERN)) checkPath(file,match[1],'import');
    const extension=extname(file);
    const isHtml=extension==='.html';
    const isCss=extension==='.css';
    const isRuntimeCode=CODE_EXTENSIONS.has(extension) &&
      !file.startsWith(resolve(base,'tests')+sep);
    if(isHtml || isRuntimeCode) {
      // Covers both HTML attributes and import.meta.url Worker/image/JSON assets.
      for(const match of source.matchAll(ASSET_PATTERN)) checkPath(file,match[1],'asset');
    }
    if(isHtml) {
      for(const match of source.matchAll(SRCSET_PATTERN)) {
        for(const entry of match[2].split(',')) {
          const uri=entry.trim().split(/\s+/,1)[0];
          if(uri) checkPath(file,uri,'asset');
        }
      }
    }
    if(isHtml || isCss) {
      for(const match of source.matchAll(CSS_URL_PATTERN)) checkPath(file,match[2].trim(),'asset');
      for(const match of source.matchAll(CSS_IMPORT_PATTERN)) checkPath(file,match[2].trim(),'asset');
    }
  }
  function walk(dir) {
    if(!existsSync(dir)) return;
    for(const entry of readdirSync(dir,{withFileTypes:true})) {
      const path=resolve(dir,entry.name);
      if(entry.isSymbolicLink()) {issues.push(path+': symlink not allowed');continue;}
      if(entry.isDirectory()) walk(path);
      else if(entry.isFile() &&
        (CODE_EXTENSIONS.has(extname(path)) || extname(path)==='.css')) scan(path);
    }
  }
  for(const dir of SCAN_DIRS) walk(resolve(base,dir));
  for(const name of ENTRY_FILES) if(existsSync(resolve(base,name))) scan(resolve(base,name));
  // Audit every shipped standalone HTML entry, not just the main lab page.
  for(const name of readdirSync(base)) {
    if((name.endsWith('.html') || name.endsWith('.css')) &&
        statSync(resolve(base,name)).isFile()) {
      scan(resolve(base,name));
    }
  }
  return {scanned,dependencies,issues};
}
if(process.argv[1] && pathToFileURL(resolve(process.argv[1])).href===import.meta.url) {
  const result=auditV2Dependencies(resolve(new URL('..',import.meta.url).pathname));
  process.stdout.write(JSON.stringify(result,null,2)+'\n');
  if(result.issues.length) process.exitCode=1;
}
