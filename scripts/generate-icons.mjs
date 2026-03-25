import fs from "node:fs";
import path from "node:path";
import sharp from "sharp";

const root = process.cwd();
const svgPath = path.join(root, "public", "icons", "icon.svg");
const outDir = path.join(root, "public", "icons");

function ensureDir(p) {
  if (!fs.existsSync(p)) fs.mkdirSync(p, { recursive: true });
}

async function renderSvgToPng({ size }) {
  const svg = fs.readFileSync(svgPath);
  ensureDir(outDir);

  const outPath = path.join(outDir, `icon-${size}.png`);
  await sharp(svg)
    .resize(size, size, {
      fit: "contain",
      background: { r: 13, g: 17, b: 23, alpha: 1 }, // #0d1117
    })
    .png()
    .toFile(outPath);

  return outPath;
}

async function main() {
  const sizes = [512];
  for (const size of sizes) {
    const outPath = await renderSvgToPng({ size });
    console.log(`Generated ${outPath}`);
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});

