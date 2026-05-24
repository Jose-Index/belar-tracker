const sharp = require('sharp')
const fs = require('fs')
const path = require('path')

const publicDir = path.join(__dirname, '..', 'public')
const svgIcon = fs.readFileSync(path.join(publicDir, 'icon.svg'))
const svgApple = fs.readFileSync(path.join(publicDir, 'apple-icon.svg'))

// Tamaños para favicon multipropósito
const iconSizes = [16, 32, 48, 64, 128, 192, 512]
const appleSize = 180

async function run() {
  // PNG genéricos desde icon.svg
  for (const size of iconSizes) {
    await sharp(svgIcon, { density: 300 })
      .resize(size, size)
      .png()
      .toFile(path.join(publicDir, `icon-${size}.png`))
    console.log(`icon-${size}.png ✓`)
  }

  // favicon.ico (multi-resolución: 16, 32, 48)
  // sharp no exporta ICO nativo en v0.33+, fallback a PNG en /favicon.ico
  await sharp(svgIcon, { density: 300 })
    .resize(48, 48)
    .png()
    .toFile(path.join(publicDir, 'favicon.ico'))
  console.log('favicon.ico ✓ (PNG 48x48 con extension ico)')

  // apple-touch-icon
  await sharp(svgApple, { density: 300 })
    .resize(appleSize, appleSize)
    .png()
    .toFile(path.join(publicDir, 'apple-touch-icon.png'))
  console.log(`apple-touch-icon.png (${appleSize}x${appleSize}) ✓`)

  // Apple touch icon precomposed (algunos clientes viejos)
  await sharp(svgApple, { density: 300 })
    .resize(appleSize, appleSize)
    .png()
    .toFile(path.join(publicDir, 'apple-touch-icon-precomposed.png'))
  console.log('apple-touch-icon-precomposed.png ✓')
}

run().catch(e => { console.error(e); process.exit(1) })
