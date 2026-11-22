import assert from 'node:assert/strict';
import { chromium } from 'playwright';

const browser = await chromium.launch({ headless: true, args: ['--no-sandbox'] });
const page = await browser.newPage({ viewport: { width: 390, height: 844 } });

try {
  let loaded = false;
  let lastError;
  for (let retry = 0; retry < 25 && !loaded; retry++) {
    try {
      await page.goto('http://127.0.0.1:8765/', { waitUntil: 'domcontentloaded', timeout: 5000 });
      loaded = true;
    } catch (error) {
      lastError = error;
      await new Promise(resolve => setTimeout(resolve, 400));
    }
  }
  if (!loaded) {
    throw lastError;
  }

  await page.getByTestId('tick').waitFor({ state: 'visible', timeout: 90000 });
  const tick = page.getByTestId('tick');
  const accepted = page.getByTestId('accepted');
  const hash = page.getByTestId('hash');

  assert.match(await tick.innerText(), /Tick: 0/);
  assert.match(await accepted.innerText(), /Accepted: 0/);
  assert.match(await page.getByTestId('voxels').innerText(), /Voxels: 100/);
  assert.equal(await page.locator('.voxel').count(), 100);

  const initialHash = await hash.innerText();
  assert.match(initialHash, /^[0-9A-F]{64}$/);

  await page.getByTestId('move-intent').click();
  await page.waitForFunction(() => document.querySelector('[data-testid="tick"]')?.textContent?.includes('Tick: 1'));
  assert.match(await accepted.innerText(), /Accepted: 1/);
  const afterMove = await hash.innerText();
  assert.notEqual(afterMove, initialHash);

  await page.getByTestId('next-tick').click();
  await page.waitForFunction(() => document.querySelector('[data-testid="tick"]')?.textContent?.includes('Tick: 2'));
  assert.match(await accepted.innerText(), /Accepted: 1/);
  assert.notEqual(await hash.innerText(), afterMove);

  await page.screenshot({ path: '/tmp/n00-web-e2e-proof.png', fullPage: true });
  console.log('PASS: real Blazor WASM loads C# terrain and commits input/tick snapshots on mobile viewport.');
} finally {
  await browser.close();
}
