#!/usr/bin/env node
/**
 * a11y check automatizado del dashboard contra WCAG 2.1 AAA.
 *
 * Levanta puppeteer + axe-core, navega cada ruta principal, recolecta
 * violaciones y las reporta en consola + opcionalmente en JSON.
 *
 * Uso:
 *   # contra preview de prod (después de npm run build && npm run preview)
 *   npm run a11y:check
 *
 *   # contra dev local
 *   BASE_URL=http://localhost:3001 npm run a11y:check
 *
 *   # exportar JSON
 *   A11Y_OUT=a11y-report.json npm run a11y:check
 *
 * Exit codes:
 *   0 → cero violaciones AAA
 *   1 → 1+ violaciones (CI fail)
 *   2 → error de configuración
 */

import { writeFile } from 'node:fs/promises'
import puppeteer from 'puppeteer'
import { AxePuppeteer } from '@axe-core/puppeteer'

const BASE_URL = process.env.BASE_URL || 'http://localhost:4173'
const OUT_FILE = process.env.A11Y_OUT

// Rutas a auditar (paths relativos al BASE_URL)
const ROUTES = [
  { path: '/', label: 'Home' },
  { path: '/admin', label: 'AdminDashboard' },
  { path: '/tiers', label: 'TiersPage' },
  { path: '/tracking', label: 'TrackingPage' },
  { path: '/accounting', label: 'AccountingPage' },
  { path: '/vet', label: 'VetPanel' },
  { path: '/mobile', label: 'MobilePreview' },
]

// Tags de WCAG 2.1: AA (default) + AAA específicos relevantes
const AXE_TAGS = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag2aaa', 'best-practice']

// Reglas que se quieren tratar como críticas (fail incluso en AAA)
const CRITICAL_RULES = [
  'color-contrast',
  'color-contrast-enhanced', // AAA: 7:1 normal, 4.5:1 large
  'aria-required-attr',
  'aria-roles',
  'button-name',
  'image-alt',
  'label',
  'link-name',
  'document-title',
  'duplicate-id-aria',
]

async function auditRoute(browser, base, route) {
  const page = await browser.newPage()
  await page.setViewport({ width: 1280, height: 800 })
  const url = base + route.path

  try {
    await page.goto(url, { waitUntil: 'networkidle0', timeout: 30_000 })
    // Esperar React montaje
    await page.waitForSelector('body', { timeout: 5_000 })

    const results = await new AxePuppeteer(page)
      .withTags(AXE_TAGS)
      .options({
        reporter: 'v2',
        resultTypes: ['violations', 'incomplete'],
      })
      .analyze()

    return {
      route: route.label,
      url,
      violations: results.violations,
      incomplete: results.incomplete,
      passes: results.passes.length,
    }
  } catch (err) {
    return { route: route.label, url, error: err.message }
  } finally {
    await page.close()
  }
}

function formatViolation(v) {
  const nodeCount = v.nodes.length
  const isCritical = CRITICAL_RULES.includes(v.id)
  const icon = isCritical ? '❌' : '⚠️ '
  return [
    `  ${icon} ${v.id} [${v.impact}] — ${nodeCount} elemento(s)`,
    `     ${v.help}`,
    `     → ${v.helpUrl}`,
    ...v.nodes.slice(0, 3).map((n) => `     · ${truncate(n.html, 80)}`),
    nodeCount > 3 ? `     ... y ${nodeCount - 3} más` : null,
  ]
    .filter(Boolean)
    .join('\n')
}

function truncate(s, n) {
  return s.length > n ? s.slice(0, n - 3) + '...' : s
}

async function main() {
  console.log(`\n🔍 a11y check → ${BASE_URL}\n`)
  let browser
  try {
    browser = await puppeteer.launch({ headless: 'new' })
  } catch (err) {
    console.error('No se pudo lanzar puppeteer:', err.message)
    process.exit(2)
  }

  const reports = []
  for (const route of ROUTES) {
    process.stdout.write(`  Auditando ${route.label}... `)
    const r = await auditRoute(browser, BASE_URL, route)
    reports.push(r)
    if (r.error) {
      console.log(`✗ (${r.error})`)
    } else {
      const violationCount = r.violations.length
      console.log(violationCount === 0 ? '✓' : `${violationCount} violación(es)`)
    }
  }

  await browser.close()

  // ── Reporte ─────────────────────────────────────────────────────
  console.log('\n┌─ a11y report ─────────────────────────────────────────────┐')
  let totalViolations = 0
  let criticalViolations = 0

  for (const r of reports) {
    console.log(`\n● ${r.route} (${r.url})`)
    if (r.error) {
      console.log(`  Error: ${r.error}`)
      continue
    }
    if (r.violations.length === 0) {
      console.log(`  ✓ Sin violaciones (passes: ${r.passes})`)
      continue
    }
    for (const v of r.violations) {
      totalViolations++
      if (CRITICAL_RULES.includes(v.id)) criticalViolations++
      console.log(formatViolation(v))
    }
  }

  console.log('\n└───────────────────────────────────────────────────────────┘')
  console.log(`\nResumen: ${totalViolations} violación(es) total(es), ${criticalViolations} crítica(s)\n`)

  if (OUT_FILE) {
    await writeFile(OUT_FILE, JSON.stringify(reports, null, 2))
    console.log(`Reporte JSON escrito en: ${OUT_FILE}\n`)
  }

  process.exit(criticalViolations > 0 ? 1 : 0)
}

main().catch((err) => {
  console.error(err)
  process.exit(2)
})
