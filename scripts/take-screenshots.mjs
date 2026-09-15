import { chromium } from 'playwright';
import fs from 'fs';
import path from 'path';

const outDir = path.resolve(process.cwd(), 'screenshots');
if (!fs.existsSync(outDir)) {
  fs.mkdirSync(outDir, { recursive: true });
}

const prefix = process.argv[2] || 'shot';
const port = process.env.PORT || '8089';
const baseUrl = `http://localhost:${port}`;

async function run() {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    viewport: { width: 1440, height: 900 },
    colorScheme: 'dark'
  });
  const page = await context.newPage();

  console.log(`Connecting to ${baseUrl}...`);
  await page.goto(baseUrl, { waitUntil: 'networkidle' });
  await page.waitForTimeout(1000);

  // 1. Overview Tab
  await page.screenshot({ path: path.join(outDir, `${prefix}-01-overview.png`), fullPage: true });
  console.log(`Saved ${prefix}-01-overview.png`);

  // 2. Events Tab
  const eventsTab = page.locator('text=Events').first();
  if (await eventsTab.isVisible()) {
    await eventsTab.click();
    await page.waitForTimeout(1000);
    await page.screenshot({ path: path.join(outDir, `${prefix}-02-events.png`), fullPage: true });
    console.log(`Saved ${prefix}-02-events.png`);

    // Click first event row if present to open drawer
    const row = page.locator('tbody tr').first();
    if (await row.isVisible()) {
      await row.click();
      await page.waitForTimeout(1000);
      await page.screenshot({ path: path.join(outDir, `${prefix}-03-event-drawer.png`), fullPage: true });
      console.log(`Saved ${prefix}-03-event-drawer.png`);
    }
  }

  // 3. Transactions Tab
  const txnsTab = page.locator('text=Transactions').first();
  if (await txnsTab.isVisible()) {
    await txnsTab.click();
    await page.waitForTimeout(1000);
    await page.screenshot({ path: path.join(outDir, `${prefix}-04-transactions.png`), fullPage: true });
    console.log(`Saved ${prefix}-04-transactions.png`);
  }

  // 4. Anomalies Tab
  const anomaliesTab = page.locator('text=Anomalies').first();
  if (await anomaliesTab.isVisible()) {
    await anomaliesTab.click();
    await page.waitForTimeout(1000);
    await page.screenshot({ path: path.join(outDir, `${prefix}-05-anomalies.png`), fullPage: true });
    console.log(`Saved ${prefix}-05-anomalies.png`);
  }

  // 5. Architecture Tab
  const archTab = page.locator('text=Architecture').first();
  if (await archTab.isVisible()) {
    await archTab.click();
    await page.waitForTimeout(1000);
    await page.screenshot({ path: path.join(outDir, `${prefix}-06-architecture.png`), fullPage: true });
    console.log(`Saved ${prefix}-06-architecture.png`);
  }

  await browser.close();
  console.log('Done taking screenshots!');
}

run().catch((err) => {
  console.error('Screenshot error:', err);
  process.exit(1);
});
