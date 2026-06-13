/**
 * Generates the README assets:
 *   docs/hero.png         – the editor in action (UI chrome + glass over a photo)
 *   docs/export.png       – a clean full-resolution export (the rendered result)
 *   docs/demo.gif         – a short interaction clip
 *
 * Requires the dev server running (bun run dev) and ffmpeg on PATH for the GIF.
 *
 *   bun scripts/screenshots.mjs
 */
import { chromium } from 'playwright';
import { execFileSync } from 'node:child_process';
import { mkdirSync, rmSync } from 'node:fs';

const URL = process.env.APP_URL ?? 'http://localhost:5173';
const PHOTO = process.env.PHOTO ?? '/tmp/demo-1015.jpg';
const OUT = 'docs';
mkdirSync(OUT, { recursive: true });

async function setKnob(page, id, value) {
  const input = page.locator(`input[id="${id}"]`);
  await input.click({ clickCount: 3 });
  await input.fill(String(value));
  await input.press('Enter');
  await page.waitForTimeout(120);
}

async function loadPhoto(page) {
  await page.setInputFiles('input[type=file]', PHOTO);
  await page.waitForTimeout(1200);
}

/** drag the currently-selected box so its center lands at (fx,fy) of the canvas */
async function dragSelectedTo(page, fx, fy) {
  const wrap = await page.locator('.canvas-wrap').boundingBox();
  const box = await page.locator('.glass-box.selected').boundingBox();
  const sx = box.x + box.width / 2;
  const sy = box.y + box.height / 2;
  await page.mouse.move(sx, sy);
  await page.mouse.down();
  await page.mouse.move(wrap.x + wrap.width * fx, wrap.y + wrap.height * fy, { steps: 10 });
  await page.mouse.up();
  await page.waitForTimeout(120);
}

async function stamp(page, preset, fx, fy) {
  await deselect(page);
  await page.click(`.presetbar button:text-is("${preset}")`);
  await page.waitForTimeout(200);
  await dragSelectedTo(page, fx, fy);
}

/** click an empty patch of the overlay — reliably clears selection chrome
 * (Escape is ignored while a leva input holds focus) */
async function deselect(page) {
  const wrap = await page.locator('.canvas-wrap').boundingBox();
  await page.mouse.click(wrap.x + wrap.width * 0.5, wrap.y + wrap.height * 0.08);
  await page.waitForTimeout(120);
}

// ── stills ────────────────────────────────────────────────────────────────
{
  const browser = await chromium
    .launch({ channel: 'chrome', headless: true })
    .catch(() => chromium.launch({ headless: true }));
  const page = await browser.newPage({
    viewport: { width: 1440, height: 900 },
    deviceScaleFactor: 2,
  });
  await page.goto(URL, { waitUntil: 'networkidle' });
  await loadPhoto(page);
  await page.keyboard.press('Delete'); // remove the auto-added bubble
  await page.waitForTimeout(150);

  // shrink the currently-selected box from its SE handle by (dx,dy) css px
  const shrink = async (dx, dy) => {
    const h = await page.locator('.glass-handle-se').boundingBox();
    await page.mouse.move(h.x + 4, h.y + 4);
    await page.mouse.down();
    await page.mouse.move(h.x - dx, h.y - dy, { steps: 8 });
    await page.mouse.up();
    await page.waitForTimeout(120);
  };

  // a tasteful composition: a frosted caption card, a wide clear lens, a small orb
  await stamp(page, 'Frosted', 0.26, 0.76);
  await stamp(page, 'Clear lens', 0.7, 0.36);
  await stamp(page, 'Bubble', 0.46, 0.2);
  await shrink(150, 110); // make the orb a small accent
  await deselect(page); // clean: hide selection chrome
  await page.waitForTimeout(400);

  await page.screenshot({ path: `${OUT}/hero.png` });
  console.log(`wrote ${OUT}/hero.png`);
  await browser.close();
}

// ── clean full-resolution export, on a different photo (proves "any image") ──
{
  const browser = await chromium
    .launch({ channel: 'chrome', headless: true })
    .catch(() => chromium.launch({ headless: true }));
  const page = await browser.newPage({
    viewport: { width: 1440, height: 900 },
    deviceScaleFactor: 2,
  });
  await page.goto(URL, { waitUntil: 'networkidle' });
  await page.setInputFiles('input[type=file]', process.env.PHOTO2 ?? '/tmp/demo-1043.jpg');
  await page.waitForTimeout(1200);
  await page.keyboard.press('Delete');
  await page.waitForTimeout(150);

  await stamp(page, 'Frosted', 0.3, 0.66);
  await stamp(page, 'Clear lens', 0.66, 0.4);
  await deselect(page);
  await page.waitForTimeout(300);

  const [download] = await Promise.all([
    page.waitForEvent('download', { timeout: 60_000 }),
    page.click('button:has-text("Export")'),
  ]);
  await download.saveAs(`${OUT}/export.png`);
  console.log(`wrote ${OUT}/export.png`);
  await browser.close();
}

// ── demo GIF ────────────────────────────────────────────────────────────────
{
  const tmpVid = '/tmp/blur-studio-vid';
  rmSync(tmpVid, { recursive: true, force: true });
  const browser = await chromium
    .launch({ channel: 'chrome', headless: true })
    .catch(() => chromium.launch({ headless: true }));
  const context = await browser.newContext({
    viewport: { width: 1280, height: 800 },
    recordVideo: { dir: tmpVid, size: { width: 1280, height: 800 } },
  });
  const page = await context.newPage();
  await page.goto(URL, { waitUntil: 'networkidle' });
  await loadPhoto(page);
  await page.waitForTimeout(400);

  // drag the auto bubble around (live refraction), then morph it via presets
  await dragSelectedTo(page, 0.35, 0.45);
  await dragSelectedTo(page, 0.62, 0.55);
  await page.keyboard.press('Escape');
  await page.click('.presetbar button:text-is("Clear lens")');
  await page.waitForTimeout(700);
  await dragSelectedTo(page, 0.4, 0.4);
  await page.keyboard.press('Escape');
  await page.click('.presetbar button:text-is("Heavy frost")');
  await page.waitForTimeout(700);
  await page.keyboard.press('Escape');
  await page.waitForTimeout(500);

  await page.close();
  const video = await page.video();
  const src = await video.path();
  await context.close();
  await browser.close();

  // webm -> high-quality gif via palette
  const palette = '/tmp/blur-palette.png';
  const fps = 16;
  const scale = 'scale=900:-1:flags=lanczos';
  execFileSync('ffmpeg', ['-y', '-i', src, '-vf', `fps=${fps},${scale},palettegen=stats_mode=diff`, palette]);
  execFileSync('ffmpeg', [
    '-y', '-i', src, '-i', palette,
    '-lavfi', `fps=${fps},${scale} [x]; [x][1:v] paletteuse=dither=bayer:bayer_scale=3`,
    `${OUT}/demo.gif`,
  ]);
  console.log(`wrote ${OUT}/demo.gif`);
}
