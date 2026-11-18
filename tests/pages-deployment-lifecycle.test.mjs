import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const pipeline=readFileSync(new URL('../.github/workflows/pages.yml',import.meta.url),'utf8');
function job(name){
  const piece=pipeline.split('\n  '+name+':\n')[1];
  assert.ok(piece,'Missing Pages '+name+' job');
  return piece.split(/\n  [a-z-]+:\n/)[0];
}
test('only the independent package job uploads the GitHub Pages artifact',()=>{
  const packageJob=job('package'),deployJob=job('deploy');
  assert.match(packageJob,/needs: validate/);
  assert.match(packageJob,/actions\/upload-pages-artifact@v4/);
  assert.doesNotMatch(packageJob,/actions\/deploy-pages@v4/);
  assert.match(deployJob,/needs: package/);
  assert.match(deployJob,/actions\/deploy-pages@v4/);
  assert.doesNotMatch(deployJob,/upload-pages-artifact/);
  assert.equal((pipeline.match(/- uses: actions\/upload-pages-artifact@v4/g)??[]).length,1);
});
test('production deployment still checks permanent player URLs and recovery',()=>{
  const deployJob=job('deploy');
  assert.match(deployJob,/id: deployment/);
  assert.match(deployJob,/verify-pages-release\.sh/);
  assert.match(deployJob,/Allow completed Pages artifact/);
  assert.match(deployJob,/name: github-pages/);
});
