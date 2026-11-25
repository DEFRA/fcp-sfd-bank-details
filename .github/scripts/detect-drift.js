#!/usr/bin/env node

import { readFileSync, writeFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { isDeepStrictEqual } from 'node:util'
import { fileURLToPath } from 'node:url'
import semver from 'semver'

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
const topLevelAheadDiffs = []

for (const key of Object.keys(templatePkg)) {
  if (ignoredFields.has(key)) {
    continue
  }

  if (key === 'engines' && typeof servicePkg.engines?.node === 'string' && typeof templatePkg.engines?.node === 'string') {
    const classification = classifyVersion(servicePkg.engines.node, templatePkg.engines.node)
    const serviceOtherEngines = { ...servicePkg.engines }
    const templateOtherEngines = { ...templatePkg.engines }
    delete serviceOtherEngines.node
    delete templateOtherEngines.node

    if (classification === 'behind' || classification === 'mismatch') {
      topLevelDiffs.push({
        field: key,
        service: servicePkg[key],
        template: templatePkg[key],
        classification
      })
    } else if (classification === 'ahead') {
      topLevelAheadDiffs.push({
        field: key,
        service: servicePkg[key],
        template: templatePkg[key],
        majorAhead: isMajorVersionAhead(servicePkg.engines.node, templatePkg.engines.node)
      })
    }

    if (JSON.stringify(serviceOtherEngines) !== JSON.stringify(templateOtherEngines)) {
      topLevelDiffs.push({
        field: 'engines (other fields)',
        service: serviceOtherEngines,
        template: templateOtherEngines
      })
    }

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

/**
 * Classifies two dependency version ranges by their minimum semantic versions.
 * @param {string} serviceVersion
 * @param {string} templateVersion
 * @returns {'equal' | 'ahead' | 'behind' | 'mismatch'}
 */
function classifyVersion (serviceVersion, templateVersion) {
  if (serviceVersion === templateVersion) {
    return 'equal'
  }

  const serviceMin = getMinimumVersion(serviceVersion)
  const templateMin = getMinimumVersion(templateVersion)

  if (!serviceMin || !templateMin) {
    return 'mismatch'
  }

  const comparison = semver.compare(serviceMin, templateMin)
  return comparison === 0 ? 'equal' : comparison > 0 ? 'ahead' : 'behind'
}

/**
 * Returns the minimum version for a valid semver range.
 * @param {string} version
 * @returns {import('semver').SemVer | null}
 */
function getMinimumVersion (version) {
  if (!semver.validRange(version)) {
    return null
  }

  return semver.minVersion(version)
}

/**
 * Returns whether the service minimum is in a later major version.
 * @param {string} serviceVersion
 * @param {string} templateVersion
 * @returns {boolean}
 */
function isMajorVersionAhead (serviceVersion, templateVersion) {
  const serviceMin = getMinimumVersion(serviceVersion)
  const templateMin = getMinimumVersion(templateVersion)

  return Boolean(serviceMin && templateMin && semver.major(serviceMin) > semver.major(templateMin))
}

// Compare dependency-like objects (dependencies, devDependencies, overrides)
// Only flags packages that exist in the template — service-only packages are
// intentional additions and are NOT considered drift.
function compareDeps (templateDeps, serviceDeps, ignored) {
  const behind = []
  const ahead = []
  const missing = []

  for (const [pkg, tVer] of Object.entries(templateDeps || {})) {
    const sVer = serviceDeps?.[pkg]

    if (ignored.has(pkg) || sVer === tVer) {
      continue
    }

    if (sVer === undefined) {
      missing.push({ name: pkg, templateVersion: tVer })
      continue
    }

    if (typeof sVer === 'string' && typeof tVer === 'string') {
      const classification = classifyVersion(sVer, tVer)

      if (classification === 'behind' || classification === 'mismatch') {
        behind.push({
          name: pkg,
          serviceVersion: sVer,
          templateVersion: tVer,
          classification
        })
      } else if (classification === 'ahead') {
        ahead.push({
          name: pkg,
          serviceVersion: sVer,
          templateVersion: tVer,
          majorAhead: isMajorVersionAhead(sVer, tVer)
        })
      }

      continue
    }

    if (!isDeepStrictEqual(sVer, tVer)) {
      behind.push({
        name: pkg,
        serviceVersion: sVer,
        templateVersion: tVer,
        classification: 'mismatch'
      })
    }
  }

  return { behind, ahead, missing }
}

function hasEntries (drift) {
  return drift.behind.length > 0
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
function formatVal (val) {
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
  '---\n',
  'This report only treats dependencies as drift when the template is ahead of the service or the versions cannot be compared automatically. Service-ahead and missing dependencies are informational; they do not need to be changed or added just to match the template.\n'
]

// Top-level differences
if (topLevelDiffs.length > 0) {
  lines.push(
    '## Top-Level Field Differences\n',
    '| Field | Service | Template | Reason |',
    '|-------|---------|----------|--------|'
  )
  for (const d of topLevelDiffs) {
    const reason = d.classification === 'mismatch'
      ? 'Unable to compare automatically'
      : d.classification === 'behind'
        ? 'Template is ahead'
        : 'Different from template'
    lines.push(
      `| \`${d.field}\` | ${formatVal(d.service)} | ${formatVal(d.template)} | ${reason} |`
    )
  }
  lines.push('')
}

// Dependency section helper
function addDepsSection (title, drift) {
  if (drift.behind.length === 0 && drift.ahead.length === 0 && drift.missing.length === 0) {
    return
  }

  lines.push(`## ${title}\n`)

  const comparableBehind = drift.behind.filter(d => d.classification === 'behind')
  const uncomparable = drift.behind.filter(d => d.classification === 'mismatch')

  if (comparableBehind.length > 0) {
    lines.push(
      '### Template is ahead (consider upgrading)\n',
      '| Package | Service | Template |',
      '|---------|---------|----------|'
    )
    for (const d of comparableBehind) {
      lines.push(
        `| \`${d.name}\` | \`${d.serviceVersion}\` | \`${d.templateVersion}\` |`
      )
    }
    lines.push('')
  }

  if (uncomparable.length > 0) {
    lines.push(
      '### Unable to compare automatically\n',
      'Review these versions manually; the script cannot determine which is newer.',
      '| Package | Service | Template |',
      '|---------|---------|----------|'
    )
    for (const d of uncomparable) {
      lines.push(
        `| \`${d.name}\` | ${formatVal(d.serviceVersion)} | ${formatVal(d.templateVersion)} |`
      )
    }
    lines.push('')
  }

  if (drift.ahead.length > 0) {
    lines.push(
      '<details>',
      `<summary>${title} — service ahead of template (no action needed)</summary>\n`,
      '| Package | Service | Template |',
      '|---------|---------|----------|'
    )
    for (const d of drift.ahead) {
      const marker = d.majorAhead ? ' ⚠️ major version ahead' : ''
      lines.push(
        `| \`${d.name}\`${marker} | \`${d.serviceVersion}\` | \`${d.templateVersion}\` |`
      )
    }
    lines.push('</details>\n')
  }

  if (drift.missing.length > 0) {
    lines.push(
      '<details>',
      `<summary>${title} — missing from service</summary>\n`,
      'These packages are in the template but not used by this service. They do not need to be added unless the service needs that functionality.\n',
      '| Package | Template Version |',
      '|---------|------------------|'
    )
    for (const d of drift.missing) {
      lines.push(`| \`${d.name}\` | \`${d.templateVersion}\` |`)
    }
    lines.push('</details>\n')
  }
}

addDepsSection('`dependencies`', depsDrift)
addDepsSection('`devDependencies`', devDepsDrift)
addDepsSection('`overrides`', overridesDrift)

if (topLevelAheadDiffs.length > 0) {
  lines.push(
    '<details>',
    '<summary>Top-level fields — service ahead of template (no action needed)</summary>\n',
    '| Field | Service | Template |',
    '|-------|---------|----------|'
  )
  for (const d of topLevelAheadDiffs) {
    const marker = d.majorAhead ? ' ⚠️ major version ahead' : ''
    lines.push(
      `| \`${d.field}\`${marker} | ${formatVal(d.service)} | ${formatVal(d.template)} |`
    )
  }
  lines.push('</details>\n')
}

const report = lines.join('\n')
writeFileSync('cdp-template-drift-report.md', report)
console.log('Drift detected. Report written to cdp-template-drift-report.md.')
process.exit(1)
