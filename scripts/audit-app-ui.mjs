import { chromium } from '../web/node_modules/playwright/index.mjs';
import fs from 'fs';
import path from 'path';

const outDir = path.resolve(process.cwd(), 'screenshots/audit');
if (!fs.existsSync(outDir)) {
  fs.mkdirSync(outDir, { recursive: true });
}

async function auditApp() {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    viewport: { width: 1440, height: 900 },
    colorScheme: 'dark',
  });
  const page = await context.newPage();

  console.log('Navigating to http://localhost:8080...');
  await page.goto('http://localhost:8080', { waitUntil: 'networkidle' });
  await page.waitForTimeout(1000);

  // 1. Hover Live toggle in Events tab to capture the exact tooltip from the user's screenshot
  const eventsTab = page.locator('text=Events').first();
  if (await eventsTab.isVisible()) {
    await eventsTab.click();
    await page.waitForTimeout(600);

    // Find Live switch
    const liveSwitch = page.locator('input[type="checkbox"]').first();
    if (await liveSwitch.isVisible()) {
      const box = await liveSwitch.boundingBox();
      if (box) {
        await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
        await page.waitForTimeout(600); // wait for tooltip animation
        await page.screenshot({ path: path.join(outDir, '01-live-tooltip-hover.png') });
        console.log('Captured 01-live-tooltip-hover.png');
      }
    }
  }

  // 2. Inspect Mantine Tooltip styles in the DOM
  const tooltipInfo = await page.evaluate(() => {
    const tooltips = document.querySelectorAll('[role="tooltip"], .mantine-Tooltip-tooltip');
    return Array.from(tooltips).map(t => {
      const style = window.getComputedStyle(t);
      return {
        text: t.innerText,
        bg: style.backgroundColor,
        color: style.color,
        border: style.border,
        boxShadow: style.boxShadow,
      };
    });
  });
  console.log('Active Tooltips in DOM:', JSON.stringify(tooltipInfo, null, 2));

  // 3. Overview Tab audit
  const overviewTab = page.locator('text=Overview').first();
  if (await overviewTab.isVisible()) {
    await overviewTab.click();
    await page.waitForTimeout(500);
    await page.screenshot({ path: path.join(outDir, '02-overview-audit.png') });
  }

  // 4. Events table with open drawer
  if (await eventsTab.isVisible()) {
    await eventsTab.click();
    await page.waitForTimeout(500);
    const row = page.locator('tbody tr').first();
    if (await row.isVisible()) {
      await row.click();
      await page.waitForTimeout(600);
      await page.screenshot({ path: path.join(outDir, '03-event-drawer-audit.png') });

      // Diff tab inside drawer
      const diffTab = page.locator('.mantine-Drawer-body button:has-text("Diff")').first();
      if (await diffTab.isVisible()) {
        await diffTab.click();
        await page.waitForTimeout(500);
        await page.screenshot({ path: path.join(outDir, '04-drawer-diff-tab.png') });
      }

      // Hex tab inside drawer
      const hexTab = page.locator('.mantine-Drawer-body button:has-text("Hex")').first();
      if (await hexTab.isVisible()) {
        await hexTab.click();
        await page.waitForTimeout(500);
        await page.screenshot({ path: path.join(outDir, '05-drawer-hex-tab.png') });
      }

      // Close drawer
      const closeBtn = page.locator('.mantine-Drawer-close, button[aria-label="Close"]').first();
      if (await closeBtn.isVisible()) {
        await closeBtn.click();
        await page.waitForTimeout(400);
      }
    }
  }

  // 5. Architecture Modal audit
  const archBtn = page.locator('text=Architecture').first();
  if (await archBtn.isVisible()) {
    await archBtn.click();
    await page.waitForTimeout(600);
    await page.screenshot({ path: path.join(outDir, '06-architecture-modal.png') });
    // Close modal (Escape)
    await page.keyboard.press('Escape');
    await page.waitForTimeout(400);
  }

  // 6. Settings Modal audit
  const settingsBtn = page.locator('text=Settings').first();
  if (await settingsBtn.isVisible()) {
    await settingsBtn.click();
    await page.waitForTimeout(600);
    await page.screenshot({ path: path.join(outDir, '07-settings-modal.png') });
    const closeSettings = page.locator('button[aria-label*="Close" i]').first();
    if (await closeSettings.isVisible()) {
      await closeSettings.click();
    } else {
      await page.locator('text=mysql-5.5').first().click();
    }
    await page.waitForTimeout(500);
  }

  // 7. Theme toggle audit (if light mode is clicked)
  const themeToggle = page.locator('header button[aria-label*="theme" i], header button:has(svg)').last();
  if (await themeToggle.isVisible()) {
    await themeToggle.click();
    await page.waitForTimeout(600);
    await page.screenshot({ path: path.join(outDir, '08-theme-toggle-state.png') });
    // Toggle back to dark
    await themeToggle.click();
    await page.waitForTimeout(400);
  }

  // 8. Tables tab audit
  const tablesTab = page.locator('text=Tables').first();
  if (await tablesTab.isVisible()) {
    await tablesTab.click();
    await page.waitForTimeout(600);
    await page.screenshot({ path: path.join(outDir, 'tab-tables.png') });
  }

  // 9. Anomalies tab audit
  const anomaliesTab = page.locator('text=Anomalies').first();
  if (await anomaliesTab.isVisible()) {
    await anomaliesTab.click();
    await page.waitForTimeout(600);
    await page.screenshot({ path: path.join(outDir, 'tab-anomalies.png') });
  }

  // 10. Schema/DDL tab audit
  const schemaTab = page.locator('text=Schema/DDL').first();
  if (await schemaTab.isVisible()) {
    await schemaTab.click();
    await page.waitForTimeout(600);
    await page.screenshot({ path: path.join(outDir, 'tab-schema-ddl.png') });
  }

  await browser.close();
  console.log('App UI audit capture complete!');
}

auditApp().catch(err => {
  console.error('Audit failed:', err);
  process.exit(1);
});
