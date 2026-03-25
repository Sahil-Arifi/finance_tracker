import fs from "node:fs";
import path from "node:path";
import sharp from "sharp";

const sourcePath =
  "C:/Users/sahil/.cursor/projects/c-Users-sahil-Documents-Coding/assets/c__Users_sahil_AppData_Roaming_Cursor_User_workspaceStorage_7c2d7d0c55e1e361fc06fd8f3b61b498_images_image-89776747-00c9-4e7b-8bb3-c97069720599.png";

const outDir = path.join(process.cwd(), "public", "icons");

function ensureDir(p) {
  if (!fs.existsSync(p)) fs.mkdirSync(p, { recursive: true });
}

function distSq(a, b) {
  const dr = a[0] - b[0];
  const dg = a[1] - b[1];
  const db = a[2] - b[2];
  return dr * dr + dg * dg + db * db;
}

async function extractLogoSquare({ region, threshold, bgThreshold, outSize, outPath }) {
  const img = sharp(sourcePath).ensureAlpha();
  const meta = await img.metadata();
  const width = meta.width;
  const height = meta.height;
  if (!width || !height) throw new Error("Invalid logo image dimensions");

  const { data } = await img.raw().toBuffer({ resolveWithObject: true });

  const { x0, y0, x1, y1 } = region;
  const sx = Math.min(width - 1, x0 + 8);
  const sy = Math.min(height - 1, y0 + 8);
  const bg = [
    data[(sy * width + sx) * 4 + 0],
    data[(sy * width + sx) * 4 + 1],
    data[(sy * width + sx) * 4 + 2],
  ];

  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;

  for (let y = y0; y <= y1; y++) {
    for (let x = x0; x <= x1; x++) {
      const i = (y * width + x) * 4;
      const a = data[i + 3];
      if (a <= 10) continue;
      const rgb = [data[i + 0], data[i + 1], data[i + 2]];
      if (distSq(rgb, bg) > threshold * threshold) {
        if (x < minX) minX = x;
        if (y < minY) minY = y;
        if (x > maxX) maxX = x;
        if (y > maxY) maxY = y;
      }
    }
  }

  if (!Number.isFinite(minX)) {
    throw new Error("Could not detect logo pixels in region; adjust thresholds/regions.");
  }

  const pad = 10;
  const cx0 = Math.max(0, minX - pad);
  const cy0 = Math.max(0, minY - pad);
  const cx1 = Math.min(width - 1, maxX + pad);
  const cy1 = Math.min(height - 1, maxY + pad);

  const cw = cx1 - cx0 + 1;
  const ch = cy1 - cy0 + 1;
  const side = Math.max(cw, ch);

  // Center square around detected content.
  const left = Math.floor(cx0 - (side - cw) / 2);
  const top = Math.floor(cy0 - (side - ch) / 2);
  const finalX0 = Math.max(0, left);
  const finalY0 = Math.max(0, top);

  const squareW = Math.min(side, width - finalX0);
  const squareH = Math.min(side, height - finalY0);

  let square = sharp(sourcePath).ensureAlpha().extract({ left: finalX0, top: finalY0, width: squareW, height: squareH });

  // Make background pixels transparent
  const sqMeta = await square.metadata();
  const sqW = sqMeta.width ?? squareW;
  const sqH = sqMeta.height ?? squareH;
  const sqRaw = await square.raw().toBuffer({ resolveWithObject: true });

  const out = Buffer.alloc(sqW * sqH * 4);
  for (let y = 0; y < sqH; y++) {
    for (let x = 0; x < sqW; x++) {
      const srcI = (y * sqW + x) * 4;
      const r = sqRaw.data[srcI + 0];
      const g = sqRaw.data[srcI + 1];
      const b = sqRaw.data[srcI + 2];
      const a = sqRaw.data[srcI + 3];
      const rgb = [r, g, b];
      const alphaOut = distSq(rgb, bg) <= bgThreshold * bgThreshold ? 0 : a;

      out[srcI + 0] = r;
      out[srcI + 1] = g;
      out[srcI + 2] = b;
      out[srcI + 3] = alphaOut;
    }
  }

  await sharp(out, { raw: { width: sqW, height: sqH, channels: 4 } })
    .resize(outSize, outSize, { fit: "contain", background: { r: 0, g: 0, b: 0, alpha: 0 } })
    .png()
    .toFile(outPath);
}

async function main() {
  ensureDir(outDir);

  // middle square icon region (tuned for the provided screenshot)
  const middleRegion = { x0: 175, y0: 10, x1: 375, y1: 160 };
  const threshold = 70;
  const bgThreshold = 45;

  await extractLogoSquare({
    region: middleRegion,
    threshold,
    bgThreshold,
    outSize: 32,
    outPath: path.join(outDir, "favicon-32.png"),
  });

  await extractLogoSquare({
    region: middleRegion,
    threshold,
    bgThreshold,
    outSize: 192,
    outPath: path.join(outDir, "icon-192.png"),
  });

  await extractLogoSquare({
    region: middleRegion,
    threshold,
    bgThreshold,
    outSize: 512,
    outPath: path.join(outDir, "icon-512.png"),
  });

  await extractLogoSquare({
    region: middleRegion,
    threshold,
    bgThreshold,
    outSize: 180,
    outPath: path.join(outDir, "apple-touch-icon.png"),
  });

  console.log("Generated brand icons into public/icons/");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});

