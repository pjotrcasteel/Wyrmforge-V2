import { writeFileSync } from 'node:fs';
import { VERSION } from '../src/build-info.mjs';

const sha = process.env.GITHUB_SHA;
if (!sha || !/^[a-f0-9]{40}$/i.test(sha)) {
  throw new Error('A full 40-character GITHUB_SHA is required for deployment.');
}

writeFileSync(
  new URL('../src/build-info.mjs', import.meta.url),
  `// Generated at deployment. Do not copy this commit identifier into source.
export const VERSION = ${JSON.stringify(VERSION)};
export const COMMIT = ${JSON.stringify(sha)};
`
);
