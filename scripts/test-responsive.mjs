import { chromium } from 'playwright';
import fs from 'fs';
import path from 'path';

const outDir = path.resolve(process.cwd(), 'screenshots/responsive');
if (!fs.existsSync(outDir)) {
  fs.mkdirSync(outDir, { recursive: true });
}

const viewports = [
  { name: 'mobile-iphone-se', width: 375, height: 667 },
  { name: 'mobile-iphone-14', width: 390, height: 844 },
  { name: 'mobile-pixel-7', width: 412, height: 915 },
  { name: 'tablet-ipad', width: 768, height: 1024 },
  { name: 'desktop-laptop', width: 1280, height: 800 },
];

async function testResponsive() {
  const browser = await chromium.launch({ headless: true });
  const baseUrl = 'http://localhost:4321';

  for (const vp of viewports) {
    const context = await browser.newContext({
      viewport: { width: vp.width, height: vp.height },
      colorScheme: 'dark',
    });
    const page = await context.newPage();

    console.log(`\n=== Testing ${vp.name} (${vp.width}x${vp.height}) ===`);
    await page.goto(baseUrl, { waitUntil: 'networkidle' });
    await page.waitForTimeout(1000);

    const overflowReport = await page.evaluate((vpWidth) => {
      const docScrollWidth = document.documentElement.scrollWidth;
      const bodyScrollWidth = document.body.scrollWidth;
      const hasOverflow = docScrollWidth > vpWidth || bodyScrollWidth > vpWidth;

      const culprits = [];
      document.querySelectorAll('*').forEach((el) => {
        const rect = el.getBoundingClientRect();
        // Check if element extends beyond viewport width
        if (rect.right > vpWidth + 1 || rect.left < -1) {
          culprits.push({
            tag: el.tagName.toLowerCase(),
            id: el.id || undefined,
            className: (el.className && typeof el.className === 'string') ? el.className.split(' ').slice(0, 4).join(' ') : undefined,
            text: el.innerText ? el.innerText.slice(0, 40).replace(/\n/g, ' ') : undefined,
            left: Math.round(rect.left),
            right: Math.round(rect.right),
            width: Math.round(rect.width),
          });
        }
      });

      return {
        vpWidth,
        docScrollWidth,
        bodyScrollWidth,
        hasOverflow,
        culprits: culprits.slice(0, 15), // top 15 culprits
      };
    }, vp.width);

    console.log(`ScrollWidth: doc=${overflowReport.docScrollWidth}, body=${overflowReport.bodyScrollWidth} (Viewport: ${vp.width})`);
    if (overflowReport.hasOverflow) {
      console.log(`❌ OVERFLOW DETECTED (${overflowReport.docScrollWidth - vp.width}px overflow)`);
      console.log('Top overflowing elements:');
      overflowReport.culprits.forEach((c, idx) => {
        console.log(`  ${idx + 1}. <${c.tag}> class="${c.className}" left=${c.left} right=${c.right} w=${c.width} text="${c.text}"`);
      });
    } else {
      console.log(`✅ No horizontal overflow`);
    }

    const shotPath = path.join(outDir, `${vp.name}-full.png`);
    await page.screenshot({ path: shotPath, fullPage: true });
    console.log(`Screenshot saved: ${shotPath}`);

    // Also take a viewport-only shot of the hero/header
    const topShotPath = path.join(outDir, `${vp.name}-top.png`);
    await page.screenshot({ path: topShotPath, fullPage: false });
    console.log(`Top screenshot saved: ${topShotPath}`);

    await context.close();
  }

  await browser.close();
}

testResponsive().catch((err) => {
  console.error('Test failed:', err);
  process.exit(1);
});
