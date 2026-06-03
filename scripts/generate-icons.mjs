import sharp from "sharp";
import { writeFileSync } from "fs";
import { join } from "path";

const OUT = join(import.meta.dirname, "..", "public", "icons");

// Spore-burst / hyphal-network motif: glow #84f5b8 on #0e1410 base
// Radial mycelium tendrils emanating from a central spore
function makeSvg(size, inset = 0) {
  const pad = inset;
  const s = size - pad * 2;
  const cx = size / 2;
  const cy = size / 2;
  const r = s * 0.38;
  const coreR = s * 0.08;
  const dotR = s * 0.025;

  // Generate tendril paths radiating outward
  const tendrils = [];
  const angles = [0, 40, 80, 120, 160, 200, 240, 280, 320];
  for (const deg of angles) {
    const rad = (deg * Math.PI) / 180;
    const rad2 = ((deg + 15) * Math.PI) / 180;
    const x1 = cx + Math.cos(rad) * coreR * 1.5;
    const y1 = cy + Math.sin(rad) * coreR * 1.5;
    const x2 = cx + Math.cos(rad2) * r * 0.6;
    const y2 = cy + Math.sin(rad2) * r * 0.6;
    const x3 = cx + Math.cos(rad) * r;
    const y3 = cy + Math.sin(rad) * r;
    tendrils.push(`<path d="M${x1},${y1} Q${x2},${y2} ${x3},${y3}" stroke="#84f5b8" stroke-width="${s * 0.018}" fill="none" opacity="0.85" stroke-linecap="round"/>`);
    // Terminal spore dot
    tendrils.push(`<circle cx="${x3}" cy="${y3}" r="${dotR}" fill="#84f5b8" opacity="0.7"/>`);
  }

  // Secondary shorter tendrils
  const angles2 = [20, 60, 100, 140, 180, 220, 260, 300, 340];
  for (const deg of angles2) {
    const rad = (deg * Math.PI) / 180;
    const rad2 = ((deg - 12) * Math.PI) / 180;
    const x1 = cx + Math.cos(rad) * coreR * 1.2;
    const y1 = cy + Math.sin(rad) * coreR * 1.2;
    const x2 = cx + Math.cos(rad2) * r * 0.4;
    const y2 = cy + Math.sin(rad2) * r * 0.4;
    const x3 = cx + Math.cos(rad) * r * 0.65;
    const y3 = cy + Math.sin(rad) * r * 0.65;
    tendrils.push(`<path d="M${x1},${y1} Q${x2},${y2} ${x3},${y3}" stroke="#84f5b8" stroke-width="${s * 0.014}" fill="none" opacity="0.5" stroke-linecap="round"/>`);
    tendrils.push(`<circle cx="${x3}" cy="${y3}" r="${dotR * 0.7}" fill="#84f5b8" opacity="0.45"/>`);
  }

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}">
  <rect width="${size}" height="${size}" fill="#0e1410" rx="${size * 0.18}"/>
  <!-- Core spore -->
  <circle cx="${cx}" cy="${cy}" r="${coreR}" fill="#84f5b8" opacity="0.9"/>
  <circle cx="${cx}" cy="${cy}" r="${coreR * 0.5}" fill="#0e1410" opacity="0.3"/>
  <!-- Glow halo -->
  <circle cx="${cx}" cy="${cy}" r="${coreR * 2.5}" fill="none" stroke="#84f5b8" stroke-width="${s * 0.006}" opacity="0.2"/>
  <!-- Tendrils -->
  ${tendrils.join("\n  ")}
</svg>`;
}

// Standard icons: full bleed
const svg512 = makeSvg(512);
const svg192 = makeSvg(192);

// Maskable: motif inset in safe zone (10% padding each side = 20% total)
const svgMask = makeSvg(512, 51); // ~10% inset

// Apple touch icon
const svg180 = makeSvg(180);

writeFileSync(join(OUT, "icon-512.svg"), svg512);

async function generate() {
  await sharp(Buffer.from(svg512)).png().toFile(join(OUT, "icon-512.png"));
  await sharp(Buffer.from(svg192)).png().toFile(join(OUT, "icon-192.png"));
  await sharp(Buffer.from(svgMask)).png().toFile(join(OUT, "maskable-512.png"));
  await sharp(Buffer.from(svg180)).png().toFile(join(OUT, "apple-touch-icon.png"));
  console.log("Icons generated in public/icons/");
}

generate().catch((e) => {
  console.error(e);
  process.exit(1);
});
