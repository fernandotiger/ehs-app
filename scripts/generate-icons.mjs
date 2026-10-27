// Generates PWA icons from an inline SVG of the brand mark.
// Usage: node scripts/generate-icons.mjs
import { mkdir } from "node:fs/promises";
import sharp from "sharp";

const BRAND = "#3b5382";

function markSvg(size, { padding = 0.22, background = BRAND, rounded = true } = {}) {
  const c = size / 2;
  const r = size * (0.5 - padding) * 0.78;
  const dots = Array.from({ length: 8 }, (_, i) => {
    const a = (i / 8) * Math.PI * 2 - Math.PI / 2;
    const cx = c + Math.cos(a) * r;
    const cy = c + Math.sin(a) * r;
    const big = i % 2 === 0;
    const rx = size * (big ? 0.075 : 0.045);
    const ry = size * (big ? 0.048 : 0.045);
    return `<ellipse cx="${cx}" cy="${cy}" rx="${rx}" ry="${ry}" transform="rotate(${(i / 8) * 360} ${cx} ${cy})" fill="#fff"/>`;
  }).join("");
  const radius = rounded ? size * 0.22 : 0;
  return Buffer.from(
    `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}"><rect width="${size}" height="${size}" rx="${radius}" fill="${background}"/>${dots}</svg>`,
  );
}

await mkdir("public/icons", { recursive: true });
const jobs = [
  ["public/icons/icon-192.png", 192, {}],
  ["public/icons/icon-512.png", 512, {}],
  ["public/icons/maskable-512.png", 512, { padding: 0.3, rounded: false }],
  ["public/icons/apple-touch-icon.png", 180, { rounded: false }],
  ["src/app/icon.png", 64, {}],
];
for (const [file, size, opts] of jobs) {
  await sharp(markSvg(size, opts)).png().toFile(file);
  console.log("wrote", file);
}
