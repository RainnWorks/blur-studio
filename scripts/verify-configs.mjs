/**
 * Verifies per-bubble configs: two bubbles get very different settings and
 * the export is saved for visual inspection.
 * Run with the dev server up:  bun scripts/verify-configs.mjs
 */
import { chromium } from 'playwright';

const URL = process.env.APP_URL ?? 'http://localhost:5173';
const issues = [];

const browser = await chromium
  .launch({ channel: 'chrome', headless: true })
  .catch(() => chromium.launch({ headless: true }));
const page = await browser.newPage({ viewport: { width: 1500, height: 950 } });
page.on('console', (m) => m.type() === 'error' && issues.push(`[console.error] ${m.text()}`));
page.on('pageerror', (e) => issues.push(`[pageerror] ${e.message}`));
await page.goto(URL, { waitUntil: 'networkidle' });

const dataUrl = await page.evaluate(() => {
  const c = document.createElement('canvas');
  c.width = 1600;
  c.height = 1200;
  const ctx = c.getContext('2d');
  const g = ctx.createLinearGradient(0, 0, 1600, 1200);
  g.addColorStop(0, '#0f172a');
  g.addColorStop(0.55, '#e11d48');
  g.addColorStop(1, '#fbbf24');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 1600, 1200);
  ctx.strokeStyle = '#fff';
  ctx.lineWidth = 3;
  for (let x = 0; x < 1600; x += 60) {
    ctx.beginPath();
    ctx.moveTo(x, 0);
    ctx.lineTo(x, 1200);
    ctx.stroke();
  }
  ctx.fillStyle = '#fff';
  ctx.font = 'bold 80px sans-serif';
  ctx.fillText('FINE DETAIL TEST', 150, 640);
  return c.toDataURL('image/png');
});
await page.setInputFiles('input[type=file]', {
  name: 'detail.png',
  mimeType: 'image/png',
  buffer: Buffer.from(dataUrl.split(',')[1], 'base64'),
});
await page.waitForTimeout(1200);

// helper: set a leva knob by its input id (e.g. "Blur.blurRadius")
async function setKnob(id, value) {
  const input = page.locator(`input[id="${id}"]`);
  await input.click({ clickCount: 3 });
  await input.fill(String(value));
  await input.press('Enter');
  await page.waitForTimeout(120);
}

// Bubble 1 (auto-added, selected): pure refraction — no blur, thick glass
await setKnob('Blur.blurRadius', 0);
await setKnob('Refraction.thickness', 80);
await setKnob('Shape.cornerRadius', 30);

// Bubble 2: heavy blur, pill shape
await page.click('text=+ Add glass');
await page.waitForTimeout(200);
for (let i = 0; i < 16; i++) await page.keyboard.press('Shift+ArrowRight');
for (let i = 0; i < 12; i++) await page.keyboard.press('Shift+ArrowDown');
await setKnob('Blur.blurRadius', 300);
await setKnob('Shape.cornerRadius', 100);
await page.waitForTimeout(400);
await page.screenshot({ path: '/tmp/blur-configs-preview.png' });

// Re-select bubble 1 by clicking its box and confirm the panel shows ITS values
await page.locator('.glass-box').first().click({ position: { x: 10, y: 10 } });
await page.waitForTimeout(300);
const radiusShown = await page.locator('input[id="Blur.blurRadius"]').inputValue();
console.log('bubble 1 selected, panel radius shows:', radiusShown, '(expect 0)');

const [download] = await Promise.all([
  page.waitForEvent('download', { timeout: 60_000 }),
  page.click('button:has-text("Export")'),
]);
await download.saveAs('/tmp/blur-configs-export.png');
await browser.close();
console.log(issues.length ? `ISSUES:\n${issues.join('\n')}` : 'NO PAGE ERRORS');
