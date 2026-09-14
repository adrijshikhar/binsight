import { describe, it, expect } from 'vitest'
import { readdirSync, readFileSync, statSync } from 'node:fs'
import path from 'node:path'

function walkFiles(dir: string): string[] {
  const files: string[] = []
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const fullPath = path.join(dir, entry.name)
    if (entry.isDirectory()) {
      files.push(...walkFiles(fullPath))
    } else if (/\.(ts|tsx|css)$/.test(entry.name)) {
      files.push(fullPath)
    }
  }
  return files
}

describe('Mantine and Radix elimination migration test', () => {
  const srcDir = path.resolve(__dirname, '..')
  const pkgPath = path.resolve(__dirname, '../../package.json')

  it('rejects @mantine and @radix-ui runtime imports and mantine css selectors in src', () => {
    const allFiles = walkFiles(srcDir).filter(
      (f) => !f.endsWith('migration.test.ts'),
    )

    const mantineImportRegex = /from\s+['"]@mantine\//
    const radixImportRegex = /from\s+['"]@?radix-ui/
    const mantineSelectorRegex = /\.mantine-[a-zA-Z0-9_-]+/

    const violations: { file: string; match: string }[] = []

    for (const file of allFiles) {
      const content = readFileSync(file, 'utf-8')
      const relPath = path.relative(srcDir, file)

      if (mantineImportRegex.test(content)) {
        violations.push({ file: relPath, match: 'import from @mantine' })
      }
      if (radixImportRegex.test(content)) {
        violations.push({ file: relPath, match: 'import from radix' })
      }
      if (mantineSelectorRegex.test(content)) {
        violations.push({ file: relPath, match: 'mantine CSS selector' })
      }
    }

    expect(violations).toEqual([])
  })

  it('ensures package.json has no @mantine or @radix-ui dependencies', () => {
    const pkg = JSON.parse(readFileSync(pkgPath, 'utf-8'))
    const deps = Object.keys(pkg.dependencies || {})
    const devDeps = Object.keys(pkg.devDependencies || {})
    const allDeps = [...deps, ...devDeps]

    const mantineDeps = allDeps.filter((d) => d.startsWith('@mantine/'))
    const radixDeps = allDeps.filter((d) => d.includes('radix-ui'))

    expect(mantineDeps).toEqual([])
    expect(radixDeps).toEqual([])
  })
})
