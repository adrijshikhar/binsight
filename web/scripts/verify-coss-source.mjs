import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { createHash } from 'node:crypto'
import postcss from 'postcss'

const root = new URL('../../', import.meta.url)
const lock = JSON.parse(await readFile(new URL('web/coss-stock-lock.json', root), 'utf8'))
for (const [path, hash] of Object.entries(lock.files)) {
  const name = path
    .split('/')
    .pop()
    .replace(/\.tsx?$/, '')
  const response = await fetch(lock.source.replace('{name}', name))
  assert.ok(response.ok, `${name}: registry HTTP ${response.status}`)
  const registry = await response.json()
  const file = registry.files.find((file) => file.path.endsWith('/' + path.split('/').pop()))
  assert.ok(file, `${name}: registry source missing`)
  const source = file.content
    .replaceAll('@/registry/default/lib/', '@/lib/')
    .replaceAll('@/registry/default/ui/', '@/components/ui/')
  assert.equal(await readFile(new URL(path, root), 'utf8'), source, `${name}: local source differs from upstream`)
  assert.equal(createHash('sha256').update(source).digest('hex'), hash, `${name}: upstream changed since checkpoint`)
}
const colors = await fetch(lock.source.replace('{name}', 'colors-neutral'))
assert.ok(colors.ok)
const palette = (await colors.json()).cssVars
assert.deepEqual(palette, lock.colors)
const css = postcss.parse(await readFile(new URL('web/src/styles/ui.css', root), 'utf8'))
for (const theme of ['light', 'dark']) {
  const actual = {}
  css.walkRules(`:root[data-theme='${theme}']`, (rule) => {
    rule.walkDecls((declaration) => {
      if (declaration.prop.startsWith('--')) actual[declaration.prop.slice(2)] = declaration.value
    })
  })
  assert.deepEqual(actual, palette[theme], `${theme}: application CSS palette differs from upstream`)
}
console.log(`PASS: ${Object.keys(lock.files).length} source files and neutral palette match live upstream Coss.`)
