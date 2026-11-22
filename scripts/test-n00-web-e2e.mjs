import assert from 'node:assert/strict';
import { chromium } from 'playwright';

const browser = await chromium.launch({ headless: true, args: ['--no-sandbox'] });
const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
const errors = [];
page.on('pageerror', error => errors.push('pageerror: ' + error.message));
page.on('console', message => {
  if (message.type() === 'error') {
    errors.push('console: ' + message.text());
  }
});
page.on('requestfailed', request => errors.push('requestfailed: ' + request.url() + ' ' + request.failure()?.errorText));

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
} catch (error) {
  console.error('Blazor browser failure:', error);
  console.error('Browser diagnostics:', errors.join(' | '));
  console.error('Rendered tick:', await page.getByTestId('tick').allTextContents().catch(() => []));
  console.error('Rendered accepted:', await page.getByTestId('accepted').allTextContents().catch(() => []));
  console.error('Visible HTML:', (await page.locator('body').innerHTML().catch(() => ''))?.slice(0, 5000));
  await page.screenshot({ path: '/tmp/n00-web-e2e-proof.png', fullPage: true }).catch(() => {});
  throw error;
} finally {
  await browser.close();
}
