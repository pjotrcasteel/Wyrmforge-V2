// GitHub Pages uses immutable per-commit URLs for reliable mobile validation.
// The canonical root URL stays unchanged, but the build-specific directory
// avoids reusing cached HTML and ES modules from a previous release.
import { cpSync, existsSync, mkdirSync, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

const COMMIT_PATTERN = /^[0-9a-f]{40}$/i;

export function createVersionedLab(root, sha) {
  if (typeof root !== 'string' || !root.trim() ||
      typeof sha !== 'string' || !COMMIT_PATTERN.test(sha)) {
    throw new TypeError('A repository directory and 40-character commit are required');
  }

  const directory = resolve(root);
  const files = ['index.html', 'main.mjs',
    'external-terrain-lab.html', 'external-terrain-lab.mjs'];
  const sourcePath = join(directory, 'src');
  for (const file of files) {
    if (!existsSync(join(directory, file))) {
      throw new Error('Missing V2 lab entry: ' + file);
    }
  }
  if (!existsSync(sourcePath)) {
    throw new Error('Missing V2 lab source directory');
  }

  // Never upload a versioned URL with an unrelated stamp. The deploy script
  // must run after write-build-info.mjs, which stamps the main checkout.
  const stamp = readFileSync(join(sourcePath, 'build-info.mjs'), 'utf8');
  const match = /export const COMMIT = "([0-9a-f]{40})";/.exec(stamp);
  if (!match || match[1].toLowerCase() !== sha.toLowerCase()) {
    throw new Error('The source build stamp does not match the deployment commit');
  }
  const version = /export const VERSION = "([^"]+)";/.exec(stamp)?.[1];
  if (!version || !/^0\.0\.\d+$/.test(version)) {
    throw new Error('Invalid V2 lab version in stamped source');
  }

  const dest = join(directory, 'builds', sha.toLowerCase());
  mkdirSync(dest, {recursive:true});
  for (const file of files) cpSync(join(directory,file),join(dest,file));
  cpSync(sourcePath,join(dest,'src'),{recursive:true});
  if (!existsSync(join(dest,'src','build-info.mjs'))) {
    throw new Error('Versioned Pages artifact is incomplete');
  }
  return {sha:sha.toLowerCase(),version,path:dest,route:`builds/${sha.toLowerCase()}/`};
}

// The workflow runs this module as a command after stamping COMMIT.
if (process.argv[1] &&
    pathToFileURL(resolve(process.argv[1])).href === import.meta.url) {
  const result = createVersionedLab(resolve(new URL('..', import.meta.url).pathname),
    process.env.GITHUB_SHA);
  process.stdout.write(`Published V2 ${result.version} at /${result.route}\n`);
}
