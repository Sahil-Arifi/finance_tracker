import sharp from "sharp";

const sourcePath =
  "C:/Users/sahil/.cursor/projects/c-Users-sahil-Documents-Coding/assets/c__Users_sahil_AppData_Roaming_Cursor_User_workspaceStorage_7c2d7d0c55e1e361fc06fd8f3b61b498_images_image-89776747-00c9-4e7b-8bb3-c97069720599.png";

const img = sharp(sourcePath).ensureAlpha();
const meta = await img.metadata();
const { data, info } = await img.raw().toBuffer({ resolveWithObject: true });
const width = info.width ?? meta.width;
const height = info.height ?? meta.height;

// Count non-transparent pixels per column (alpha > 10)
const colCount = new Array(width).fill(0);
for (let x = 0; x < width; x++) {
  let c = 0;
  for (let y = 0; y < height; y++) {
    const idx = (y * width + x) * 4 + 3; // alpha channel
    if (data[idx] > 10) c++;
  }
  colCount[x] = c;
}

// Find contiguous x segments where there are visible pixels.
const segs = [];
let inSeg = false;
let start = 0;
for (let x = 0; x < width; x++) {
  const has = colCount[x] > 0;
  if (has && !inSeg) {
    inSeg = true;
    start = x;
  }
  if (!has && inSeg) {
    inSeg = false;
    segs.push([start, x - 1]);
  }
}
if (inSeg) segs.push([start, width - 1]);

// Merge tiny gaps (<=8px) to reduce fragmentation.
const merged = [];
for (const s of segs) {
  if (!merged.length) {
    merged.push(s);
    continue;
  }
  const prev = merged[merged.length - 1];
  if (s[0] - prev[1] <= 8) prev[1] = s[1];
  else merged.push(s);
}

function findRowBounds(x0, x1) {
  let minY = height;
  let maxY = 0;
  for (let y = 0; y < height; y++) {
    let has = false;
    for (let x = x0; x <= x1; x++) {
      const idx = (y * width + x) * 4 + 3;
      if (data[idx] > 10) {
        has = true;
        break;
      }
    }
    if (has) {
      minY = Math.min(minY, y);
      maxY = Math.max(maxY, y);
    }
  }
  if (minY > maxY) return null;
  return [minY, maxY];
}

const boxes = [];
for (const [x0, x1] of merged) {
  const rb = findRowBounds(x0, x1);
  if (!rb) continue;
  boxes.push({ x0, x1, y0: rb[0], y1: rb[1] });
}

console.log(JSON.stringify({ width, height, merged, boxes }, null, 2));

