#!/usr/bin/env node

import { readFileSync, writeFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const scriptDir = dirname(fileURLToPath(import.meta.url))
const [, , servicePkgPath, templatePkgPath] = process.argv

if (!servicePkgPath || !templatePkgPath) {
  console.error(
    'Usage: node detect-drift.js <service-package.json> <template-package.json>'
  )
  process.exit(2)
}

const config = JSON.parse(
  readFileSync(resolve(scriptDir, '..', 'drift-config.json'), 'utf8')
)
const servicePkg = JSON.parse(
  readFileSync(resolve(servicePkgPath), 'utf8')
)
const templatePkg = JSON.parse(
  readFileSync(resolve(templatePkgPath), 'utf8')
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
  if (ignoredFields.has(key)) continue

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
function compareDeps (templateDeps, serviceDeps, ignored) {
  const mismatched = []
  const missing = []

  for (const [pkg, tVer] of Object.entries(templateDeps || {})) {
    if (ignored.has(pkg)) continue

    const sVer = (serviceDeps || {})[pkg]

    if (sVer === undefined) {
      missing.push({ name: pkg, templateVersion: tVer })
    } else if (sVer !== tVer) {
      mismatched.push({ name: pkg, serviceVersion: sVer, templateVersion: tVer })
    }
  }

  return { mismatched, missing }
}

const depsDrift = compareDeps(
  templatePkg.dependencies, servicePkg.dependencies, ignoredDeps
)
const devDepsDrift = compareDeps(
  templatePkg.devDependencies, servicePkg.devDependencies, ignoredDevDeps
)
const overridesDrift = compareDeps(
  templatePkg.overrides, servicePkg.overrides, new Set()
)

// Determine whether any drift exists
const hasDrift =
  topLevelDiffs.length > 0 ||
  depsDrift.mismatched.length > 0 ||
  depsDrift.missing.length > 0 ||
  devDepsDrift.mismatched.length > 0 ||
  devDepsDrift.missing.length > 0 ||
  overridesDrift.mismatched.length > 0 ||
  overridesDrift.missing.length > 0

if (!hasDrift) {
  console.log('No drift detected between service and template package.json.')
  process.exit(0)
}

// Build Markdown report
function formatVal (val) {
  if (val === '_(not set)_') return val
  if (typeof val === 'object' && val !== null) {
    return '`' + JSON.stringify(val) + '`'
  }
  return '`' + String(val) + '`'
}

const lines = [
  '# CDP Template Drift Report\n',
  `**Template**: \`${config.templateRepo}\` (\`${config.templateBranch}\`)`,
  `**Detected on**: ${new Date().toLocaleDateString('en-GB', { day: '2-digit', month: '2-digit', year: 'numeric' })}\n`,
  '---\n'
]

// Top-level differences
if (topLevelDiffs.length > 0) {
  lines.push('## Top-Level Field Differences\n')
  lines.push('| Field | Service | Template |')
  lines.push('|-------|---------|----------|')
  for (const d of topLevelDiffs) {
    lines.push(
      `| \`${d.field}\` | ${formatVal(d.service)} | ${formatVal(d.template)} |`
    )
  }
  lines.push('')
}

// Dependency section helper
function addDepsSection (title, drift) {
  if (drift.mismatched.length === 0 && drift.missing.length === 0) return

  lines.push(`## ${title}\n`)

  if (drift.mismatched.length > 0) {
    lines.push('### Version Mismatches\n')
    lines.push('| Package | Service | Template |')
    lines.push('|---------|---------|----------|')
    for (const d of drift.mismatched) {
      lines.push(
        `| \`${d.name}\` | \`${d.serviceVersion}\` | \`${d.templateVersion}\` |`
      )
    }
    lines.push('')
  }

  if (drift.missing.length > 0) {
    lines.push('### Missing from Service\n')
    lines.push('| Package | Template Version |')
    lines.push('|---------|------------------|')
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
