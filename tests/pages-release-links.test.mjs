import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {runInNewContext} from 'node:vm';
const page=readFileSync(new URL('../404.html',import.meta.url),'utf8');
const script=/<script>([\s\S]*?)<\/script>/.exec(page)?.[1];
const sha='7df73c016753e574c19232dcc2045b3e20a321ef';
function simulate(pathname,search=''){
  let redirected=null;
  const link={href:'/Wyrmforge-V2/play-hunt.html'};
  const status={textContent:''};
  const window={location:{pathname,search,origin:'https://pjotrcasteel.github.io',
    replace:url=>{redirected=url;}}};
  const document={getElementById:id=>id==='game-link'?link:status};
  assert.ok(script);
  runInNewContext(script,{URL,window,document});
  return {redirected,link,status};
}
test('outdated SHA game link redirects to stable entry and preserves flags',()=>{
  const result=simulate('/Wyrmforge-V2/builds/'+sha+'/play-hunt.html',
    '?pointOcclusion=off&stream=cells');
  const url=new URL(result.redirected);
  assert.equal(url.pathname,'/Wyrmforge-V2/play-hunt.html');
  assert.equal(url.searchParams.get('pointOcclusion'),'off');
  assert.equal(url.searchParams.get('stream'),'cells');
  assert.equal(url.searchParams.get('requestedBuild'),'7df73c0');
  assert.equal(result.link.href,url.href);
});
test('legacy index path redirects to stable index',()=>{
  const result=simulate('/Wyrmforge-V2/builds/'+sha+'/index.html');
  assert.equal(new URL(result.redirected).pathname,'/Wyrmforge-V2/index.html');
});
test('missing module/asset and invalid SHA remain proper 404s',()=>{
  for(const suffix of ['/builds/'+sha+'/src/webgl-voxel-view.mjs',
    '/builds/'+sha+'/art/forest.png',
    '/builds/invalid/play-hunt.html',
    '/src/missing.mjs']){
    const result=simulate('/Wyrmforge-V2'+suffix);
    assert.equal(result.redirected,null,suffix);
    assert.match(result.status.textContent,/not be found/);
  }
});
test('static 404 retains an accessible manual game link',()=>{
  assert.match(page,/id="game-link" href="\/Wyrmforge-V2\/play-hunt.html"/);
  assert.match(page,/id="status" role="status"/);
});
