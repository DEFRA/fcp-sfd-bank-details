#!/usr/bin/env node

import { readFileSync, writeFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const scriptDir = dirname(fileURLToPath(import.meta.url))
const repoRoot = resolve(scriptDir, '..', '..')

const config = JSON.parse(
  readFileSync(resolve(scriptDir, '..', 'drift-config.json'), 'utf8')
)
const servicePkg = JSON.parse(
  readFileSync(resolve(repoRoot, 'package.json'), 'utf8')
)
const templatePkg = JSON.parse(
  readFileSync(resolve(repoRoot, 'cdp-template', 'package.json'), 'utf8')
)

const ignoredFields = new Set([
  ...(config.ignoredTopLevelFields || []),
  'dependencies',
  'devDependencies',
  'overrides'
])
const ignoredDeps = new Set(config.ignoredDependencies || [])
const ignoredDevDeps = new Set(config.ignoredDevDependencies || [])

// Compare top-level fields
const topLevelDiffs = []

for (const key of Object.keys(templatePkg)) {
  if (ignoredFields.has(key)) {
    continue
  }

  const tVal = JSON.stringify(templatePkg[key])
  const sVal = JSON.stringify(servicePkg[key])

  if (tVal !== sVal) {
    topLevelDiffs.push({
      field: key,
      service: key in servicePkg ? servicePkg[key] : '_(not set)_',
      template: templatePkg[key]
    })
  }
}

// Compare dependency-like objects (dependencies, devDependencies, overrides)
// Only flags packages that exist in the template — service-only packages are
// intentional additions and are NOT considered drift.
function compareDeps(templateDeps, serviceDeps, ignored) {
  const mismatched = []
  const missing = []

  for (const [pkg, tVer] of Object.entries(templateDeps || {})) {
    const sVer = serviceDeps?.[pkg]

    if (ignored.has(pkg) || sVer === tVer) {
      continue
    }

    if (sVer === undefined) {
      missing.push({ name: pkg, templateVersion: tVer })
    } else {
      mismatched.push({
        name: pkg,
        serviceVersion: sVer,
        templateVersion: tVer
      })
    }
  }

  return { mismatched, missing }
}

function hasEntries(drift) {
  return drift.mismatched.length > 0 || drift.missing.length > 0
}

const depsDrift = compareDeps(
  templatePkg.dependencies,
  servicePkg.dependencies,
  ignoredDeps
)
const devDepsDrift = compareDeps(
  templatePkg.devDependencies,
  servicePkg.devDependencies,
  ignoredDevDeps
)
const overridesDrift = compareDeps(
  templatePkg.overrides,
  servicePkg.overrides,
  new Set()
)

// Determine whether any drift exists
const hasDrift =
  topLevelDiffs.length > 0 ||
  [depsDrift, devDepsDrift, overridesDrift].some(hasEntries)

if (!hasDrift) {
  console.log('No drift detected between service and template package.json.')
  process.exit(0)
}

// Build Markdown report
function formatVal(val) {
  if (val === '_(not set)_') {
    return val
  }
  if (typeof val === 'object' && val !== null) {
    return `\`${JSON.stringify(val)}\``
  }
  return `\`${val}\``
}

const lines = [
  '# CDP Template Drift Report\n',
  `**Template**: \`${config.templateRepo}\` (\`${config.templateBranch}\`)`,
  `**Detected on**: ${new Date().toLocaleDateString('en-GB', { day: '2-digit', month: '2-digit', year: 'numeric' })}\n`,
  '---\n'
]

// Top-level differences
if (topLevelDiffs.length > 0) {
  lines.push(
    '## Top-Level Field Differences\n',
    '| Field | Service | Template |',
    '|-------|---------|----------|'
  )
  for (const d of topLevelDiffs) {
    lines.push(
      `| \`${d.field}\` | ${formatVal(d.service)} | ${formatVal(d.template)} |`
    )
  }
  lines.push('')
}

// Dependency section helper
function addDepsSection(title, drift) {
  if (!hasEntries(drift)) {
    return
  }

  lines.push(`## ${title}\n`)

  if (drift.mismatched.length > 0) {
    lines.push(
      '### Version Mismatches\n',
      '| Package | Service | Template |',
      '|---------|---------|----------|'
    )
    for (const d of drift.mismatched) {
      lines.push(
        `| \`${d.name}\` | \`${d.serviceVersion}\` | \`${d.templateVersion}\` |`
      )
    }
    lines.push('')
  }

  if (drift.missing.length > 0) {
    lines.push(
      '### Missing from Service\n',
      '| Package | Template Version |',
      '|---------|------------------|'
    )
    for (const d of drift.missing) {
      lines.push(`| \`${d.name}\` | \`${d.templateVersion}\` |`)
    }
    lines.push('')
  }
}

addDepsSection('`dependencies`', depsDrift)
addDepsSection('`devDependencies`', devDepsDrift)
addDepsSection('`overrides`', overridesDrift)

const report = lines.join('\n')
writeFileSync('cdp-template-drift-report.md', report)
console.log('Drift detected. Report written to cdp-template-drift-report.md.')
process.exit(1)
