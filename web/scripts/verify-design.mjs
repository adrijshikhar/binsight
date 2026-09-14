import { chromium } from 'playwright'
import fs from 'node:fs'
import path from 'node:path'

const OUT_DIR = '/tmp/binsight-design-verification'
if (!fs.existsSync(OUT_DIR)) {
  fs.mkdirSync(OUT_DIR, { recursive: true })
}

async function runVerification() {
  console.log('=== Binsight Coss UI Design & Behavior Verification ===')
  const baseUrl = process.env.BINSIGHT_URL || 'http://127.0.0.1:8080'
  console.log(`Target server: ${baseUrl}`)

  // Derive active file ID dynamically from /api/files
  let activeFileId = 1
  try {
    const res = await fetch(`${baseUrl}/api/files`)
    if (res.ok) {
      const files = await res.json()
      if (Array.isArray(files) && files.length > 0) {
        activeFileId = files[0].id
        console.log(`Discovered active file: id=${activeFileId} (${files[0].path})`)
      }
    }
  } catch (err) {
    console.warn(`Could not fetch /api/files directly: ${err.message}. Using default file ID: ${activeFileId}`)
  }

  const executablePath = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'
  const browser = await chromium.launch({
    headless: true,
    executablePath: fs.existsSync(executablePath) ? executablePath : undefined,
  })

  try {
    const context = await browser.newContext({
      viewport: { width: 1440, height: 900 },
    })
    const page = await context.newPage()

    // Use domcontentloaded + explicit readiness selector, avoiding networkidle with SSE
    const targetUrl = `${baseUrl}/?file=${activeFileId}&tab=events`
    console.log(`Navigating to ${targetUrl}...`)
    await page.goto(targetUrl, { waitUntil: 'domcontentloaded' })
    await page.waitForSelector('[role="tablist"]', { timeout: 10000 })
    console.log('PASS: App shell and tabs mounted.')

    // 1. Verify CSS Theme tokens loaded
    const themeTokens = await page.evaluate(() => {
      const rootStyle = window.getComputedStyle(document.documentElement)
      return {
        bg: rootStyle.getPropertyValue('--bg').trim(),
        panel: rootStyle.getPropertyValue('--panel').trim(),
        primary: rootStyle.getPropertyValue('--primary').trim(),
        border: rootStyle.getPropertyValue('--border').trim(),
      }
    })
    console.log('Computed theme tokens:', themeTokens)

    // 2. Nonempty virtual rows and control density check on Events tab
    await page.waitForSelector('table', { timeout: 10000 })
    const rows = page.locator('tr[data-index]')
    const rowCount = await rows.count()
    console.log(`Virtual event rows found: ${rowCount}`)
    if (rowCount > 0) {
      const firstBox = await rows.first().boundingBox()
      if (firstBox) {
        console.log(`First row height: ${firstBox.height}px`)
        if (Math.round(firstBox.height) !== 32) {
          throw new Error(`Expected 32px event row height, got ${firstBox.height}px`)
        }
      }
    }

    // Measure FilterBar dense controls
    const searchControl = await page.locator('[data-slot="input-control"]').first().boundingBox()
    if (searchControl) {
      console.log(`Search input control height: ${searchControl.height}px`)
      if (Math.round(searchControl.height) !== 28) {
        throw new Error(`Expected 28px search input control height, got ${searchControl.height}px`)
      }
    }

    const goBtn = await page.locator('button[aria-label="Go to position"]').first().boundingBox()
    if (goBtn) {
      console.log(`Go button height: ${goBtn.height}px`)
      if (Math.round(goBtn.height) !== 28) {
        throw new Error(`Expected 28px Go button height, got ${goBtn.height}px`)
      }
    }

    const segmented = await page.locator('[aria-label="View mode"]').first().boundingBox()
    if (segmented) {
      console.log(`Segmented control height: ${segmented.height}px`)
      if (Math.round(segmented.height) !== 28) {
        throw new Error(`Expected 28px segmented control height, got ${segmented.height}px`)
      }
    }

    await page.screenshot({ path: path.join(OUT_DIR, '01-events-table.png') })
    console.log('Captured 01-events-table.png')

    // 3. Test Drawer / Inspector on event click
    if (rowCount > 0) {
      console.log('Clicking first event row to open inspector drawer...')
      await rows.first().click()
      await page.waitForSelector('[aria-label="Event inspector"]', { timeout: 5000 })
      console.log('PASS: Event inspector drawer mounted on row click.')
      await page.screenshot({ path: path.join(OUT_DIR, '02-event-inspector.png') })
      console.log('Captured 02-event-inspector.png')
    }

    // 4. Test Navigation to Overview tab
    const overviewTab = page.locator('[role="tab"]:has-text("Overview")').first()
    if (await overviewTab.count() > 0) {
      console.log('Clicking Overview tab...')
      await overviewTab.click()
      await page.waitForSelector('#tabpanel-overview', { timeout: 5000 })
      await page.waitForTimeout(500)
      await page.screenshot({ path: path.join(OUT_DIR, '03-overview-tab.png') })
      console.log('Captured 03-overview-tab.png')
    }

    // 5. Test Settings Dialog
    const settingsBtn = page.locator('button[aria-label="Settings"]').first()
    if (await settingsBtn.count() > 0) {
      console.log('Opening Settings dialog...')
      await settingsBtn.click()
      await page.getByRole('dialog', { name: 'Settings' }).waitFor({ timeout: 5000 })
      console.log('PASS: Settings dialog opened.')
      await page.screenshot({ path: path.join(OUT_DIR, '04-settings-dialog.png') })
      console.log('Captured 04-settings-dialog.png')

      // Close dialog via Cancel button
      const cancelBtn = page.locator('button:has-text("Cancel")').first()
      if (await cancelBtn.count() > 0) {
        await cancelBtn.click()
        await page.waitForTimeout(300)
      }
    }

    console.log('=== Design & behavior verification complete! ===')
  } finally {
    await browser.close()
  }
}

runVerification().catch((err) => {
  console.error('Verification failed:', err)
  process.exit(1)
})
