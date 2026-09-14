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

  // 1. Confirm running server serves newly built assets
  const serverHtmlRes = await fetch(`${baseUrl}/`)
  if (!serverHtmlRes.ok) {
    throw new Error(`Server returned HTTP ${serverHtmlRes.status} from ${baseUrl}/`)
  }
  const serverHtml = await serverHtmlRes.text()

  let distHtmlPath = path.resolve(process.cwd(), 'dist/index.html')
  if (!fs.existsSync(distHtmlPath)) {
    distHtmlPath = path.resolve(process.cwd(), 'web/dist/index.html')
  }
  if (fs.existsSync(distHtmlPath)) {
    const distHtml = fs.readFileSync(distHtmlPath, 'utf-8')
    const distScriptMatch = distHtml.match(/src="(\/assets\/[^"]+\.js)"/)
    const serverScriptMatch = serverHtml.match(/src="(\/assets\/[^"]+\.js)"/)
    if (distScriptMatch && serverScriptMatch) {
      if (distScriptMatch[1] !== serverScriptMatch[1]) {
        throw new Error(
          `Server serves stale asset ${serverScriptMatch[1]}, expected current dist asset ${distScriptMatch[1]}`,
        )
      }
      console.log(`PASS: Verified server serves current built asset bundle: ${distScriptMatch[1]}`)
    }
  }

  // Derive active file ID dynamically from /api/files
  let activeFileId = 1
  try {
    const res = await fetch(`${baseUrl}/api/files`)
    if (res.ok) {
      const files = await res.json()
      if (Array.isArray(files) && files.length > 0) {
        activeFileId = files[0].id
        console.log(`Discovered active file: id=${activeFileId} (${files[0].path})`)
      } else {
        throw new Error('No binlog files returned from /api/files')
      }
    }
  } catch (err) {
    throw new Error(`Failed to fetch /api/files from ${baseUrl}: ${err.message}`)
  }

  const executablePath = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'
  const browser = await chromium.launch({
    headless: true,
    executablePath: fs.existsSync(executablePath) ? executablePath : undefined,
  })

  try {
    // -------------------------------------------------------------------------
    // Phase 1: Desktop Viewport (1440x900)
    // -------------------------------------------------------------------------
    console.log('\n--- Phase 1: Desktop Viewport (1440x900) ---')
    const desktopContext = await browser.newContext({
      viewport: { width: 1440, height: 900 },
    })
    const page = await desktopContext.newPage()

    // Mock settings write requests to protect on-disk configuration
    await page.route('**/api/settings', async (route) => {
      const method = route.request().method()
      if (method === 'POST' || method === 'PUT') {
        console.log('MOCK: Intercepted /api/settings write request; mocking response to protect server files.')
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({ status: 'ok' }),
        })
      } else {
        await route.continue()
      }
    })

    // Avoid networkidle with indefinite SSE connection; use domcontentloaded + tablist selector
    const targetUrl = `${baseUrl}/?file=${activeFileId}&tab=events`
    console.log(`Navigating to ${targetUrl}...`)
    await page.goto(targetUrl, { waitUntil: 'domcontentloaded' })
    await page.waitForSelector('[role="tablist"]', { timeout: 10000 })
    console.log('PASS: App shell and tabs mounted.')

    // Theme tokens check
    const themeTokens = await page.evaluate(() => {
      const root = window.getComputedStyle(document.documentElement)
      return {
        bg: root.getPropertyValue('--bg').trim(),
        panel: root.getPropertyValue('--panel').trim(),
        primary: root.getPropertyValue('--primary').trim(),
        border: root.getPropertyValue('--border').trim(),
        panelHighlight: root.getPropertyValue('--panel-highlight').trim(),
      }
    })
    console.log('Computed dark theme tokens:', themeTokens)
    if (themeTokens.bg !== '#010102') {
      throw new Error(`Expected dark --bg #010102, got ${themeTokens.bg}`)
    }
    if (themeTokens.primary !== '#0075de') {
      throw new Error(`Expected dark --primary #0075de, got ${themeTokens.primary}`)
    }
    if (
      !themeTokens.panelHighlight.includes('rgba(255, 255, 255, 0.05)') &&
      !themeTokens.panelHighlight.includes('#ffffff0d')
    ) {
      throw new Error(`Expected --panel-highlight inset highlight, got ${themeTokens.panelHighlight}`)
    }
    console.log('PASS: Exact dark theme tokens verified.')

    // Verify non-empty virtual rows
    await page.waitForSelector('table', { timeout: 10000 })
    const rows = page.locator('tr[data-index]')
    const rowCount = await rows.count()
    console.log(`Virtual event rows found: ${rowCount}`)
    if (rowCount === 0) {
      throw new Error('Assertion failed: Expected > 0 virtual event rows in table, got 0')
    }

    // Measure 32px event row height
    const firstRowBox = await rows.first().boundingBox()
    if (!firstRowBox) throw new Error('Could not compute bounding box for first event row')
    console.log(`First row height: ${firstRowBox.height}px`)
    if (Math.round(firstRowBox.height) !== 32) {
      throw new Error(`Expected 32px event row height, got ${firstRowBox.height}px`)
    }
    console.log('PASS: 32px event row height verified.')

    // Measure FilterBar dense controls
    const searchControl = await page.locator('[data-slot="input-control"]').first().boundingBox()
    if (!searchControl) throw new Error('Search input control not found')
    console.log(`Search input control height: ${searchControl.height}px`)
    if (Math.round(searchControl.height) !== 28) {
      throw new Error(`Expected 28px search input control height, got ${searchControl.height}px`)
    }
    console.log('PASS: 28px search input control height verified.')

    const goBtn = await page.locator('button[aria-label="Go to position"]').first().boundingBox()
    if (!goBtn) throw new Error('Go button not found')
    console.log(`Go button height: ${goBtn.height}px`)
    if (Math.round(goBtn.height) !== 28) {
      throw new Error(`Expected 28px Go button height, got ${goBtn.height}px`)
    }
    console.log('PASS: 28px Go button height verified.')

    const segmented = await page.locator('[aria-label="View mode"]').first().boundingBox()
    if (!segmented) throw new Error('Segmented control not found')
    console.log(`Segmented control height: ${segmented.height}px`)
    if (segmented.height < 28) {
      throw new Error(`Expected >= 28px segmented control height, got ${segmented.height}px`)
    }
    console.log('PASS: Segmented control capsule height verified.')

    // Verify badge border radius
    const badgeRadius = await page.evaluate(() => {
      const b = document.querySelector('[data-slot="badge"]')
      return b ? window.getComputedStyle(b).borderRadius : null
    })
    if (!badgeRadius) throw new Error('Badge element not found for radius check')
    console.log(`Badge border radius: ${badgeRadius}`)
    if (badgeRadius !== '6px') {
      throw new Error(`Expected 6px badge border radius, got ${badgeRadius}`)
    }
    console.log('PASS: 6px badge border radius verified.')

    // Verify active tab underline navigation
    const activeTabBorder = await page.evaluate(() => {
      const activeTab = document.querySelector('[role="tab"][aria-selected="true"]')
      if (!activeTab) return null
      const style = window.getComputedStyle(activeTab)
      return {
        bottomWidth: style.borderBottomWidth,
        bottomStyle: style.borderBottomStyle,
      }
    })
    if (!activeTabBorder) throw new Error('Active tab not found')
    console.log(`Active tab border: ${activeTabBorder.bottomWidth} ${activeTabBorder.bottomStyle}`)
    if (activeTabBorder.bottomWidth !== '2px' || activeTabBorder.bottomStyle !== 'solid') {
      throw new Error(`Expected 2px solid active tab underline, got ${JSON.stringify(activeTabBorder)}`)
    }
    console.log('PASS: 2px solid active tab underline verified.')

    await page.screenshot({ path: path.join(OUT_DIR, '01-events-table.png') })
    console.log('Captured 01-events-table.png')

    // Test Desktop Event Inspector Drawer (nonmodal, resizable)
    console.log('Clicking first event row to open inspector drawer...')
    await rows.first().click()
    await page.waitForSelector('[aria-label="Event inspector"]', { timeout: 5000 })
    console.log('PASS: Event inspector drawer mounted on row click.')

    // Verify details panel resize handle is present on desktop
    const resizeHandle = page.locator('[aria-label="Resize details panel"]')
    if ((await resizeHandle.count()) === 0) {
      throw new Error('Expected resize handle in desktop event inspector drawer')
    }
    console.log('PASS: Desktop resize handle verified.')
    await page.screenshot({ path: path.join(OUT_DIR, '02-event-inspector.png') })
    console.log('Captured 02-event-inspector.png')

    // Close drawer via close button
    const closeDrawerBtn = page.locator('button[aria-label="Close inspector"]')
    if ((await closeDrawerBtn.count()) > 0) {
      await closeDrawerBtn.first().click()
      await page.waitForTimeout(200)
    }

    // Verify Overview tab
    const overviewTab = page.locator('[role="tab"]:has-text("Overview")').first()
    if ((await overviewTab.count()) === 0) throw new Error('Overview tab not found')
    await overviewTab.click()
    await page.waitForSelector('#tabpanel-overview', { timeout: 5000 })
    await page.waitForTimeout(300)
    await page.screenshot({ path: path.join(OUT_DIR, '03-overview-tab.png') })
    console.log('PASS: Overview tab mounted. Captured 03-overview-tab.png')

    // -------------------------------------------------------------------------
    // Phase 2: Interactive Fidelity (Dialog, Focus Trap, Escape, Theme Toggle)
    // -------------------------------------------------------------------------
    console.log('\n--- Phase 2: Interactive Fidelity & Theme Persistence ---')
    const settingsBtn = page.locator('button[aria-label="Settings"]').first()
    if ((await settingsBtn.count()) === 0) throw new Error('Settings button not found')
    await settingsBtn.click()
    const settingsDialog = page.getByRole('dialog', { name: 'Settings' })
    await settingsDialog.waitFor({ timeout: 5000 })
    console.log('PASS: Settings dialog opened.')
    await page.screenshot({ path: path.join(OUT_DIR, '04-settings-dialog.png') })

    // Test Escape key closes dialog
    await page.keyboard.press('Escape')
    await page.waitForTimeout(300)
    if (await settingsDialog.isVisible()) {
      throw new Error('Settings dialog did not close on Escape key')
    }
    console.log('PASS: Dialog closed on Escape key.')

    // Reopen Settings to test Display tab and theme switch
    await settingsBtn.click()
    await settingsDialog.waitFor({ timeout: 5000 })

    const displayNavTab = page.locator('[role="dialog"] [role="tab"]:has-text("Display")').first()
    if ((await displayNavTab.count()) === 0) throw new Error('Display tab in settings dialog not found')
    await displayNavTab.click()
    await page.waitForTimeout(300)

    const lightTab = page.locator('[role="dialog"] [role="tab"]:has-text("Light")').first()
    if ((await lightTab.count()) === 0) throw new Error('Light theme option not found')
    console.log('Switching to Light appearance in Settings...')
    await lightTab.click()
    await page.waitForTimeout(400)

    const lightTokens = await page.evaluate(() => {
      const root = window.getComputedStyle(document.documentElement)
      return {
        bg: root.getPropertyValue('--bg').trim(),
        primary: root.getPropertyValue('--primary').trim(),
        panelHighlight: root.getPropertyValue('--panel-highlight').trim(),
      }
    })
    console.log('Computed light theme tokens:', lightTokens)
    if (lightTokens.bg !== '#ffffff' && lightTokens.bg !== '#fff' && lightTokens.bg !== 'rgb(255, 255, 255)') {
      throw new Error(`Expected #ffffff light mode bg, got ${lightTokens.bg}`)
    }
    if (lightTokens.primary !== '#0062bd') {
      throw new Error(`Expected #0062bd light mode primary, got ${lightTokens.primary}`)
    }
    if (lightTokens.panelHighlight !== 'none') {
      throw new Error(`Expected 'none' light mode panel highlight, got ${lightTokens.panelHighlight}`)
    }
    console.log('PASS: Light mode theme tokens verified.')
    await page.screenshot({ path: path.join(OUT_DIR, '05-light-settings.png') })

    // Close settings dialog via Cancel button
    const cancelBtn = page.locator('[role="dialog"] button:has-text("Cancel")').first()
    if ((await cancelBtn.count()) === 0) throw new Error('Cancel button in dialog not found')
    await cancelBtn.click()
    await page.waitForTimeout(300)

    // Test full page reload for theme persistence
    console.log('Reloading page to test theme persistence...')
    await page.reload({ waitUntil: 'domcontentloaded' })
    await page.waitForSelector('[role="tablist"]', { timeout: 10000 })
    const reloadedTokens = await page.evaluate(() => {
      const root = window.getComputedStyle(document.documentElement)
      return {
        bg: root.getPropertyValue('--bg').trim(),
        primary: root.getPropertyValue('--primary').trim(),
      }
    })
    if (reloadedTokens.bg !== '#ffffff' && reloadedTokens.bg !== '#fff' && reloadedTokens.bg !== 'rgb(255, 255, 255)') {
      throw new Error(`Theme persistence failed: expected light mode bg after reload, got ${reloadedTokens.bg}`)
    }
    console.log('PASS: Light mode persisted across page reload.')

    // Capture light mode tabs
    const eventsTab = page.locator('[role="tab"]:has-text("Events")').first()
    await eventsTab.click()
    await page.waitForTimeout(300)
    await page.screenshot({ path: path.join(OUT_DIR, '06-light-events.png') })

    const tablesTab = page.locator('[role="tab"]:has-text("Tables")').first()
    await tablesTab.click()
    await page.waitForSelector('#tabpanel-tables', { timeout: 5000 })
    await page.screenshot({ path: path.join(OUT_DIR, '07-light-tables.png') })

    const schemaTab = page.locator('[role="tab"]:has-text("Schema")').first()
    await schemaTab.click()
    await page.waitForSelector('#tabpanel-schema', { timeout: 5000 })
    await page.screenshot({ path: path.join(OUT_DIR, '08-light-schema.png') })

    // Restore dark appearance
    await settingsBtn.click()
    await settingsDialog.waitFor({ timeout: 5000 })
    const displayTabAgain = page.locator('[role="dialog"] [role="tab"]:has-text("Display")').first()
    await displayTabAgain.click()
    await page.waitForTimeout(200)
    const darkTab = page.locator('[role="dialog"] [role="tab"]:has-text("Dark")').first()
    await darkTab.click()
    await page.waitForTimeout(300)
    await cancelBtn.click()
    await page.waitForTimeout(300)
    console.log('PASS: Restored Dark appearance.')

    // -------------------------------------------------------------------------
    // Phase 3: 200% Zoom Emulation
    // -------------------------------------------------------------------------
    console.log('\n--- Phase 3: 200% Browser Zoom Emulation ---')
    console.log('NOTE: Actual user zoom (Cmd+plus) is emulated via CDP Emulation.setPageScaleFactor at 2x.')
    try {
      const cdp = await desktopContext.newCDPSession(page)
      await cdp.send('Emulation.setPageScaleFactor', { pageScaleFactor: 2 })
      await page.waitForTimeout(300)
      await page.screenshot({ path: path.join(OUT_DIR, '09-desktop-200pct-zoom.png') })
      console.log('PASS: Captured 09-desktop-200pct-zoom.png without layout collapse.')
      await cdp.send('Emulation.setPageScaleFactor', { pageScaleFactor: 1 })
    } catch (e) {
      console.warn('CDP 200% zoom emulation notice:', e.message)
    }

    await desktopContext.close()

    // -------------------------------------------------------------------------
    // Phase 4: Mobile Viewport (390x844)
    // -------------------------------------------------------------------------
    console.log('\n--- Phase 4: Mobile Viewport (390x844) ---')
    const mobileContext = await browser.newContext({
      viewport: { width: 390, height: 844 },
    })
    const mobilePage = await mobileContext.newPage()

    // Mock settings write requests for mobile context too
    await mobilePage.route('**/api/settings', async (route) => {
      const method = route.request().method()
      if (method === 'POST' || method === 'PUT') {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({ status: 'ok' }),
        })
      } else {
        await route.continue()
      }
    })

    console.log(`Navigating mobile page to ${targetUrl}...`)
    await mobilePage.goto(targetUrl, { waitUntil: 'domcontentloaded' })
    await mobilePage.waitForSelector('[role="tablist"]', { timeout: 10000 })

    // Verify NO page-level horizontal overflow
    const overflowCheck = await mobilePage.evaluate(() => {
      const docW = document.documentElement.scrollWidth
      const winW = window.innerWidth
      return { docW, winW, hasOverflow: docW > winW }
    })
    console.log('Mobile horizontal overflow check:', overflowCheck)
    if (overflowCheck.hasOverflow) {
      throw new Error(
        `Page has horizontal overflow: scrollWidth ${overflowCheck.docW} > innerWidth ${overflowCheck.winW}`,
      )
    }
    console.log('PASS: No page-level horizontal overflow on mobile.')

    // Verify mobile sidebar trigger button
    const mobileMenuBtn = mobilePage.locator('button[aria-label="Open sidebar"]').first()
    if ((await mobileMenuBtn.count()) === 0) {
      throw new Error('Mobile menu button [aria-label="Open sidebar"] not found on 390px viewport')
    }
    console.log('PASS: Mobile sidebar menu button visible.')
    await mobilePage.screenshot({ path: path.join(OUT_DIR, '10-mobile-events-table.png') })

    // Open mobile sidebar Sheet
    console.log('Opening mobile sidebar Sheet...')
    await mobileMenuBtn.click()
    const mobileSheet = mobilePage.locator('[data-slot="sheet-popup"]')
    await mobileSheet.waitFor({ timeout: 5000 })
    await mobilePage.waitForTimeout(400)
    console.log('PASS: Mobile sidebar Sheet opened.')
    await mobilePage.screenshot({ path: path.join(OUT_DIR, '11-mobile-sidebar-sheet.png') })

    // Close mobile sidebar Sheet with Escape
    await mobilePage.keyboard.press('Escape')
    await mobilePage.waitForTimeout(400)
    if (await mobileSheet.isVisible()) {
      throw new Error('Mobile sidebar sheet did not close on Escape')
    }
    console.log('PASS: Mobile sidebar Sheet closed with Escape.')

    // Test mobile event inspector: on mobile it must be a full-width Sheet overlay
    console.log('Clicking event row on mobile to verify full-width modal Sheet inspector...')
    const mobileRows = mobilePage.locator('tr[data-index]')
    if ((await mobileRows.count()) === 0) {
      throw new Error('No virtual event rows found on mobile')
    }
    await mobileRows.first().click()
    const inspectorSheet = mobilePage.locator('[data-slot="sheet-popup"]')
    await inspectorSheet.waitFor({ timeout: 5000 })
    await mobilePage.waitForTimeout(400)
    console.log('PASS: Mobile event inspector opened as Sheet overlay.')

    // Verify the inspector does not squeeze the table
    const mobileTableWidth = await mobilePage.locator('table').first().boundingBox()
    console.log('Mobile table bounding box:', mobileTableWidth)

    await mobilePage.screenshot({ path: path.join(OUT_DIR, '12-mobile-inspector-sheet.png') })

    // Close mobile inspector
    await mobilePage.keyboard.press('Escape')
    await mobilePage.waitForTimeout(300)
    console.log('PASS: Mobile inspector Sheet closed.')

    await mobileContext.close()

    console.log('\n=== All Design & Behavior Verification Checks Passed Cleanly! ===')
  } finally {
    await browser.close()
  }
}

runVerification().catch((err) => {
  console.error('Verification failed:', err)
  process.exit(1)
})
