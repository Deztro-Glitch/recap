// Skapar PNG-ikoner (hemskärm, iPhone) från public/icon.svg.
import sharp from 'sharp'

const svg = 'public/icon.svg'
const sizes = { 'icon-192.png': 192, 'icon-512.png': 512, 'apple-touch-icon.png': 180 }

for (const [file, size] of Object.entries(sizes)) {
  await sharp(svg).resize(size, size).png().toFile(`public/${file}`)
  console.log('skapade', file)
}
