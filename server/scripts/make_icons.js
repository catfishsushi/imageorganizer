'use strict';
const sharp = require('sharp');
const path = require('path');
const fs = require('fs');

const outDir = path.join(__dirname, '..', 'public', 'icons');
fs.mkdirSync(outDir, { recursive: true });

function svgFor(size) {
  const s = size;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${s}" height="${s}">
    <rect width="100%" height="100%" fill="#101012"/>
    <rect x="${s*0.18}" y="${s*0.26}" width="${s*0.64}" height="${s*0.48}" rx="${s*0.06}"
          fill="#1a1a1f" stroke="#4f8cff" stroke-width="${s*0.04}"/>
    <circle cx="${s*0.35}" cy="${s*0.42}" r="${s*0.06}" fill="#f2f2f4"/>
    <polygon points="${s*0.22},${s*0.7} ${s*0.46},${s*0.46} ${s*0.62},${s*0.6} ${s*0.78},${s*0.46} ${s*0.78},${s*0.7}"
             fill="#4f8cff"/>
  </svg>`;
}

(async () => {
  for (const size of [192, 512]) {
    const svg = Buffer.from(svgFor(size), 'utf8');
    const out = path.join(outDir, `icon-${size}.png`);
    await sharp(svg).png().toFile(out);
    console.log(`wrote ${out}`);
  }
})().catch((e) => { console.error(e); process.exit(1); });
