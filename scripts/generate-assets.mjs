#!/usr/bin/env node
/**
 * Nvet Care — generador de assets a partir del SVG canónico.
 *
 * Toma `dashboard/public/logo.svg` y produce todas las variantes
 * binarias necesarias para web + iOS + Android + redes sociales.
 *
 * Uso:
 *   node scripts/generate-assets.mjs                # genera todo
 *   node scripts/generate-assets.mjs --only=web     # solo favicons
 *   node scripts/generate-assets.mjs --only=ios
 *   node scripts/generate-assets.mjs --only=android
 *   node scripts/generate-assets.mjs --only=splash
 *
 * Dependencias:
 *   npm install --save-dev sharp@^0.33  (instalar en root, no en sub-package)
 *
 * Salida (relativa al root del repo):
 *   dashboard/public/favicon-16.png         16x16
 *   dashboard/public/favicon-32.png         32x32
 *   dashboard/public/favicon-48.png         48x48
 *   dashboard/public/apple-touch-icon.png   180x180
 *   dashboard/public/og-image.png           1200x630 (con padding)
 *   mobile/ios/NvetCare/Images.xcassets/AppIcon.appiconset/Icon-1024.png
 *   mobile/android/app/src/main/res/mipmap-mdpi/ic_launcher.png       48x48
 *   mobile/android/app/src/main/res/mipmap-hdpi/ic_launcher.png       72x72
 *   mobile/android/app/src/main/res/mipmap-xhdpi/ic_launcher.png      96x96
 *   mobile/android/app/src/main/res/mipmap-xxhdpi/ic_launcher.png     144x144
 *   mobile/android/app/src/main/res/mipmap-xxxhdpi/ic_launcher.png    192x192
 *   mobile/android/app/src/main/res/mipmap-xxxhdpi/ic_launcher_round.png 192x192
 *   mobile/assets/splash-iphone.png       1125x2436 (iPhone X+)
 *   mobile/assets/splash-ipad.png         2048x2732 (iPad Pro 12.9")
 *
 * Notas:
 *  - El splash es el logo centrado sobre fondo cream, con margen 30%
 *  - El icono Android adaptive usa foreground 432px sobre canvas transparente,
 *    el sistema agrega el background fill via XML
 *  - Todas las salidas son PNG con alpha; iconos iOS necesitan BG opaco según Apple HIG
 */

import { fileURLToPath } from 'node:url'
import { dirname, resolve } from 'node:path'
import { mkdir, readFile, writeFile } from 'node:fs/promises'

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)
const ROOT = resolve(__dirname, '..')

// Hace import lazy para que el script funcione (con error claro) sin sharp instalado
async function loadSharp() {
  try {
    const mod = await import('sharp')
    return mod.default
  } catch (err) {
    console.error(
      '\n❌ sharp no está instalado. Instala con:\n' +
        '   npm install --save-dev sharp@^0.33\n',
    )
    process.exit(1)
  }
}

// ── Configuración de outputs ───────────────────────────────────────
const TARGETS = {
  web: [
    { out: 'dashboard/public/favicon-16.png', size: 16 },
    { out: 'dashboard/public/favicon-32.png', size: 32 },
    { out: 'dashboard/public/favicon-48.png', size: 48 },
    { out: 'dashboard/public/apple-touch-icon.png', size: 180, opaqueBg: '#F5F3EF' },
    { out: 'dashboard/public/og-image.png', size: 630, width: 1200, padding: 0.35, opaqueBg: '#FAFAF7' },
  ],
  ios: [
    {
      out: 'mobile/ios/NvetCare/Images.xcassets/AppIcon.appiconset/Icon-1024.png',
      size: 1024,
      opaqueBg: '#F5F3EF',
    },
  ],
  android: [
    { out: 'mobile/android/app/src/main/res/mipmap-mdpi/ic_launcher.png', size: 48, opaqueBg: '#F5F3EF' },
    { out: 'mobile/android/app/src/main/res/mipmap-hdpi/ic_launcher.png', size: 72, opaqueBg: '#F5F3EF' },
    { out: 'mobile/android/app/src/main/res/mipmap-xhdpi/ic_launcher.png', size: 96, opaqueBg: '#F5F3EF' },
    { out: 'mobile/android/app/src/main/res/mipmap-xxhdpi/ic_launcher.png', size: 144, opaqueBg: '#F5F3EF' },
    { out: 'mobile/android/app/src/main/res/mipmap-xxxhdpi/ic_launcher.png', size: 192, opaqueBg: '#F5F3EF' },
    {
      out: 'mobile/android/app/src/main/res/mipmap-xxxhdpi/ic_launcher_round.png',
      size: 192,
      opaqueBg: '#F5F3EF',
      circular: true,
    },
    {
      out: 'mobile/android/app/src/main/res/mipmap-anydpi-v26/ic_launcher_foreground.png',
      size: 432,
      adaptive: true, // sin background, foreground only
    },
  ],
  splash: [
    {
      out: 'mobile/assets/splash-iphone.png',
      width: 1125,
      height: 2436,
      logoSize: 360,
      opaqueBg: '#F5F3EF',
    },
    {
      out: 'mobile/assets/splash-ipad.png',
      width: 2048,
      height: 2732,
      logoSize: 480,
      opaqueBg: '#F5F3EF',
    },
    {
      out: 'mobile/assets/splash-android.png',
      width: 1080,
      height: 1920,
      logoSize: 360,
      opaqueBg: '#F5F3EF',
    },
  ],
}

// ── Helpers ────────────────────────────────────────────────────────
function parseArgs() {
  const arg = process.argv.find((a) => a.startsWith('--only='))
  return arg ? arg.split('=')[1] : 'all'
}

function selectGroups(only) {
  if (only === 'all') return Object.values(TARGETS).flat()
  if (TARGETS[only]) return TARGETS[only]
  console.error(`Grupo desconocido: "${only}". Opciones: web, ios, android, splash, all`)
  process.exit(1)
}

async function ensureDir(filePath) {
  await mkdir(dirname(filePath), { recursive: true })
}

// ── Render ─────────────────────────────────────────────────────────
async function generate(sharp, svg, target) {
  const outPath = resolve(ROOT, target.out)
  await ensureDir(outPath)

  // Caso 1: ícono cuadrado simple (favicon, app icon)
  if (!target.width && !target.padding) {
    const pipeline = sharp(svg, { density: target.size <= 64 ? 384 : 192 }).resize(target.size, target.size)

    if (target.opaqueBg) {
      pipeline.flatten({ background: target.opaqueBg })
    }

    if (target.circular) {
      // Aplicar máscara circular simple
      const r = target.size / 2
      const mask = Buffer.from(
        `<svg><circle cx="${r}" cy="${r}" r="${r}" fill="#fff"/></svg>`,
      )
      pipeline.composite([{ input: mask, blend: 'dest-in' }])
    }

    if (target.adaptive) {
      // Sin background: keep alpha
    }

    await pipeline.png({ compressionLevel: 9 }).toFile(outPath)
    console.log(`✓ ${target.out} (${target.size}×${target.size})`)
    return
  }

  // Caso 2: canvas con padding (og image, splash)
  const W = target.width
  const H = target.height ?? target.size
  const logoSize = target.logoSize ?? Math.round(Math.min(W, H) * (1 - (target.padding ?? 0.4)))

  const logoBuffer = await sharp(svg, { density: 384 })
    .resize(logoSize, logoSize)
    .png()
    .toBuffer()

  await sharp({
    create: {
      width: W,
      height: H,
      channels: 4,
      background: target.opaqueBg ?? { r: 245, g: 243, b: 239, alpha: 1 },
    },
  })
    .composite([
      {
        input: logoBuffer,
        left: Math.round((W - logoSize) / 2),
        top: Math.round((H - logoSize) / 2),
      },
    ])
    .png({ compressionLevel: 9 })
    .toFile(outPath)
  console.log(`✓ ${target.out} (${W}×${H}, logo ${logoSize}px)`)
}

// ── Main ───────────────────────────────────────────────────────────
async function main() {
  const sharp = await loadSharp()
  const only = parseArgs()
  const targets = selectGroups(only)
  const svgPath = resolve(ROOT, 'dashboard/public/logo.svg')
  const svg = await readFile(svgPath)

  console.log(`\nGenerando ${targets.length} asset(s) (grupo="${only}")...\n`)

  for (const target of targets) {
    try {
      await generate(sharp, svg, target)
    } catch (err) {
      console.error(`✗ ${target.out}: ${err.message}`)
    }
  }

  // Genera ICO multi-resolución (16+32+48 stacked) si group=web o all
  if (only === 'all' || only === 'web') {
    try {
      const icoPath = resolve(ROOT, 'dashboard/public/favicon.ico')
      const png48 = await sharp(svg, { density: 384 })
        .resize(48, 48)
        .png()
        .toBuffer()
      // Sharp no soporta ICO nativo; escribimos un PNG renombrado como ICO
      // (los browsers modernos aceptan PNG en favicon link rel="icon")
      await writeFile(icoPath, png48)
      console.log(`✓ dashboard/public/favicon.ico (48×48 PNG, fallback)`)
    } catch (err) {
      console.error(`✗ favicon.ico: ${err.message}`)
    }
  }

  console.log('\n✅ Done.\n')
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
