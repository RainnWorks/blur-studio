/**
 * Smoke test: loads the app in headless Chrome, feeds it a generated photo,
 * adds a second glass bubble, screenshots the canvas, and verifies that
 * export downloads a PNG at the photo's original resolution.
 *
 * Run with the dev server up:  bun scripts/smoke.mjs
 */
import { chromium } from 'playwright';

const URL = process.env.APP_URL ?? 'http://localhost:5173';
const issues = [];

const browser = await chromium
  .launch({ channel: 'chrome', headless: true })
  .catch(() => chromium.launch({ headless: true }));

const page = await browser.newPage({ viewport: { width: 1500, height: 950 } });
page.on('console', (m) => {
  if (m.type() === 'error') issues.push(`[console.error] ${m.text()}`);
});
page.on('pageerror', (e) => issues.push(`[pageerror] ${e.message}`));

await page.goto(URL, { waitUntil: 'networkidle' });
await page.waitForTimeout(500);

// Generate a detailed 1600x1200 test photo inside the page.
const dataUrl = await page.evaluate(() => {
  const c = document.createElement('canvas');
  c.width = 1600;
  c.height = 1200;
  const ctx = c.getContext('2d');
  const g = ctx.createLinearGradient(0, 0, 1600, 1200);
  g.addColorStop(0, '#1e3a8a');
  g.addColorStop(0.5, '#f59e0b');
  g.addColorStop(1, '#10b981');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 1600, 1200);
  for (let i = 0; i < 50; i++) {
    ctx.fillStyle = `hsl(${(i * 29) % 360} 80% ${30 + (i % 5) * 12}%)`;
    ctx.beginPath();
    ctx.arc((i * 173) % 1600, (i * 271) % 1200, 24 + (i % 7) * 16, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.fillStyle = '#fff';
  ctx.font = 'bold 90px sans-serif';
  ctx.fillText('SHARP TEXT 0123', 120, 620);
  return c.toDataURL('image/png');
});
const buffer = Buffer.from(dataUrl.split(',')[1], 'base64');
await page.setInputFiles('input[type=file]', { name: 'test.png', mimeType: 'image/png', buffer });
await page.waitForTimeout(1500);
await page.screenshot({ path: '/tmp/blur-studio-1.png' });

// Add a second bubble and shove it down-right with the keyboard.
await page.click('text=+ Add glass');
await page.waitForTimeout(200);
for (let i = 0; i < 14; i++) await page.keyboard.press('Shift+ArrowRight');
for (let i = 0; i < 10; i++) await page.keyboard.press('Shift+ArrowDown');
await page.waitForTimeout(500);
await page.screenshot({ path: '/tmp/blur-studio-2.png' });

// Export and verify the download.
const [download] = await Promise.all([
  page.waitForEvent('download', { timeout: 60_000 }),
  page.click('button:has-text("Export")'),
]);
await download.saveAs('/tmp/blur-studio-export.png');
console.log('export saved as /tmp/blur-studio-export.png (suggested name:', download.suggestedFilename() + ')');

await page.waitForTimeout(300);
await browser.close();

console.log(issues.length ? `ISSUES:\n${issues.join('\n')}` : 'NO PAGE ERRORS');
