// V2 clean-room dependency audit: only repository-local relative ESM imports.
// Check source, test and runtime entrypoints; external asset references must be
// repo-relative and must not escape the repository or reference V1 directories.
import { readdirSync, readFileSync, realpathSync, statSync, existsSync } from 'node:fs';
import { dirname, extname, isAbsolute, relative, resolve, sep } from 'node:path';
import { pathToFileURL } from 'node:url';

const CODE_EXTENSIONS=new Set(['.mjs','.js']);
const SCAN_DIRS=['src','tests','scripts'];
const ENTRY_FILES=['main.mjs'];
// Match import/export declarations at the beginning of a source line; do not
// interpret fixture strings or regex literals as executable imports.
const IMPORT_PATTERN=/^\s*(?:import\s+(?:[^'"\r\n]*?\s+from\s*)?|export\s+[^'"\r\n]*?\s+from\s*)['"]([^'"\r\n]+)['"]/gm;
const ASSET_PATTERN=/(?:\b(?:src|href)\s*=\s*|\bnew\s+URL\s*\(\s*)['"]([^'"]+)['"]/g;
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
    if(specifier.startsWith('#')) return; // Local same-page fragment.
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
      const runtime=from===resolve(base,'main.mjs') ||
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
    if(extname(file)==='.html') {
      for(const match of source.matchAll(ASSET_PATTERN)) checkPath(file,match[1],'asset');
    }
  }
  function walk(dir) {
    if(!existsSync(dir)) return;
    for(const entry of readdirSync(dir,{withFileTypes:true})) {
      const path=resolve(dir,entry.name);
      if(entry.isSymbolicLink()) {issues.push(path+': symlink not allowed');continue;}
      if(entry.isDirectory()) walk(path);
      else if(entry.isFile() && CODE_EXTENSIONS.has(extname(path))) scan(path);
    }
  }
  for(const dir of SCAN_DIRS) walk(resolve(base,dir));
  for(const name of ENTRY_FILES) if(existsSync(resolve(base,name))) scan(resolve(base,name));
  // Audit every shipped standalone HTML entry, not just the main lab page.
  for(const name of readdirSync(base)) {
    if(name.endsWith('.html') && statSync(resolve(base,name)).isFile()) {
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
