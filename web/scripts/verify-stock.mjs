import assert from 'node:assert/strict'
import { mkdir } from 'node:fs/promises'
import { chromium, webkit } from 'playwright'

const url = process.env.BINSIGHT_URL || 'http://localhost:5174'
const engine = process.env.BROWSER === 'webkit' ? webkit : chromium
const browser = await engine.launch(engine === chromium ? { channel: 'chrome' } : {})
const out = '/tmp/binsight-stock-verification'
await mkdir(out, { recursive: true })
try {
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 } })
  await context.route('**/api/settings', (route) => {
    if (['POST', 'PUT', 'PATCH', 'DELETE'].includes(route.request().method())) {
      return route.abort()
    }
    return route.continue()
  })
  const response = await context.request.get(`${url}/api/files`)
  assert.ok(response.ok(), 'files API must succeed')
  const files = await response.json()
  assert.ok(files.length, 'real sample files required')
  const page = await context.newPage()
  const errors = []
  page.on('pageerror', (error) => errors.push(error.message))
  await page.goto(`${url}/?file=${files[0].id}&tab=events`, { waitUntil: 'domcontentloaded' })
  for (const theme of ['dark', 'light']) {
    await page.evaluate((theme) => localStorage.setItem('binsight-theme', theme), theme)
    await page.reload({ waitUntil: 'domcontentloaded' })
    await page.locator('tr[data-index]').first().waitFor()
    let backgrounds = []
    for (const osTheme of ['light', 'dark']) {
      await page.emulateMedia({ colorScheme: osTheme })
      backgrounds.push(
        await page
          .locator('[data-slot="combobox-chips"]')
          .first()
          .evaluate((e) => getComputedStyle(e).backgroundColor),
      )
    }
    assert.equal(backgrounds[0], backgrounds[1], `${theme} must not follow OS when explicitly selected`)
    const foundation = await page.evaluate(() => {
      const css = (q) => getComputedStyle(document.querySelector(q))
      const row = document.querySelector('tr[data-index]')
      return {
        font: css('body').fontFamily,
        collapse: css('table').borderCollapse,
        rowHeight: row.getBoundingClientRect().height,
        cellPadding: parseFloat(css('tr[data-index] td').paddingTop),
        buttonPadding: parseFloat(css('[aria-label="Go to position"]').paddingLeft),
        badgePadding: parseFloat(css('[data-kind]').paddingLeft),
      }
    })
    assert.doesNotMatch(foundation.font, /Times/)
    const palette = await page.evaluate(() => {
      const css = getComputedStyle(document.documentElement)
      return Object.fromEntries(['background', 'primary', 'data-insert', 'data-query', 'success', 'surface-2'].map(
        (name) => {
          const value = css.getPropertyValue(`--${name}`).trim()
          return [name, /^#[\da-f]{3}$/i.test(value) ? '#' + [...value.slice(1)].map((c) => c + c).join('') : value]
        },
      ))
    })
    assert.equal(palette.background, theme === 'dark' ? '#141516' : '#ffffff')
    assert.equal(palette.primary, theme === 'dark' ? '#0075de' : '#0062bd')
    assert.equal(palette['data-insert'], theme === 'dark' ? '#34d399' : '#047857')
    assert.equal(palette['data-query'], theme === 'dark' ? '#c4b5fd' : '#6d28d9')
    assert.equal(palette.success, palette['surface-2'], 'operational success must remain neutral')
    assert.equal(foundation.collapse, 'collapse')
    assert.equal(foundation.cellPadding, 6, 'compact event rows must use scoped vertical padding')
    assert.equal(foundation.rowHeight, 32, 'event and group rows must remain 32px')
    assert.ok(foundation.buttonPadding > 0, 'stock button padding must survive the cascade')
    assert.ok(foundation.badgePadding > 0, 'stock badge padding must survive the cascade')
    for (const width of [1440, 1024]) {
      await page.setViewportSize({ width, height: 900 })
      for (const label of ['Search event summary', 'Jump to byte position', 'Go to position']) {
        const control = page.getByLabel(label, { exact: true })
        const bounds = await control.boundingBox()
        assert.ok(
          bounds && bounds.x >= 0 && bounds.x + bounds.width <= width + 1,
          `${label} must fit at ${width}px: ${JSON.stringify(bounds)}`,
        )
      }
      await page.screenshot({ path: `${out}/${engine.name()}-${theme}-${width}.png` })
    }
    await page.setViewportSize({ width: 1440, height: 900 })
    for (const name of ['Overview', 'Transactions', 'Tables', 'Anomalies', 'Schema/DDL']) {
      await page.getByRole('tab', { name, exact: true }).click()
      await page.getByRole('tabpanel').waitFor()
      await page.screenshot({
        path: `${out}/${engine.name()}-${theme}-${name.replace('/', '-')}.png`,
        animations: 'disabled',
      })
    }
    await page.getByRole('button', { name: 'Settings', exact: true }).click()
    const dialog = page.getByRole('dialog')
    await dialog.getByRole('tab', { name: 'Display', exact: true }).click()
    const number = dialog.getByRole('textbox', { name: 'page size', exact: true })
    await number.waitFor()
    assert.ok(Number(await number.inputValue()) > 0)
    await page.screenshot({ path: `${out}/${engine.name()}-${theme}-settings.png`, animations: 'disabled' })
    await page.keyboard.press('Escape')
    await dialog.waitFor({ state: 'hidden' })
    await page.getByRole('tab', { name: 'Events', exact: true }).click()
    await page.locator('tr[data-index]').first().waitFor()
  }
  const type = page.getByRole('combobox', { name: 'Type', exact: true })
  await type.fill('QUERY')
  await page.getByRole('option', { name: 'QUERY', exact: true }).click()
  await page.getByRole('tab', { name: 'Events', exact: true }).click()
  await page.waitForURL((u) => u.searchParams.get('type') === 'QUERY')
  assert.ok(new URL(page.url()).searchParams.get('type')?.includes('QUERY'))
  await page.getByRole('button', { name: 'Remove QUERY filter', exact: true }).click()
  assert.equal(new URL(page.url()).searchParams.has('type'), false)
  await page.locator('tr[data-index]').first().click()
  await page.getByRole('complementary', { name: 'Event inspector' }).waitFor()
  await page.screenshot({ path: `${out}/${engine.name()}-inspector.png`, animations: 'disabled' })
  await page.getByRole('button', { name: 'Close drawer', exact: true }).click()
  await page.getByRole('complementary', { name: 'Event inspector' }).waitFor({ state: 'hidden' })
  assert.deepEqual(errors, [], 'no application runtime errors')
  console.log(
    `PASS ${engine.name()}: stock foundation, both themes/OS preferences, desktop widths, filter removal and inspector. Screenshots: ${out}`,
  )
} finally {
  await browser.close()
}
