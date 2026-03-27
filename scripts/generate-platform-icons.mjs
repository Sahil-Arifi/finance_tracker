import fs from "node:fs";
import path from "node:path";
import sharp from "sharp";

const SOURCE_IMAGE =
  "C:/Users/sahil/.cursor/projects/c-Users-sahil-Documents-Coding/assets/c__Users_sahil_AppData_Roaming_Cursor_User_workspaceStorage_7c2d7d0c55e1e361fc06fd8f3b61b498_images_image-6c627922-bb38-44b9-942a-6a3e8fa49e13.png";

const ROOT = process.cwd();

function ensureDir(dir) {
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
}

async function writePng(outPath, size) {
  ensureDir(path.dirname(outPath));
  await sharp(SOURCE_IMAGE)
    .resize(size, size, {
      fit: "cover",
      position: "center",
      withoutEnlargement: false,
    })
    .png({ compressionLevel: 9 })
    .toFile(outPath);
}

async function generateWebAndDesktopIcons() {
  const outDir = path.join(ROOT, "public", "icons");
  ensureDir(outDir);

  await writePng(path.join(outDir, "login-logo-1024.png"), 1024);
  await writePng(path.join(outDir, "login-logo-512.png"), 512);
  await writePng(path.join(outDir, "icon-512.png"), 512);
  await writePng(path.join(outDir, "icon-192.png"), 192);
  await writePng(path.join(outDir, "apple-touch-icon.png"), 180);
  await writePng(path.join(outDir, "favicon-32.png"), 32);
  await writePng(path.join(outDir, "favicon-16.png"), 16);

  const m = await import("png-to-ico");
  const pngToIco = m.default;
  const ico = await pngToIco([path.join(outDir, "favicon-16.png"), path.join(outDir, "favicon-32.png")]);
  fs.writeFileSync(path.join(outDir, "favicon.ico"), ico);
}

async function generateAndroidIcons() {
  const resDir = path.join(ROOT, "android", "app", "src", "main", "res");
  const sizes = [
    { dir: "mipmap-mdpi", px: 48 },
    { dir: "mipmap-hdpi", px: 72 },
    { dir: "mipmap-xhdpi", px: 96 },
    { dir: "mipmap-xxhdpi", px: 144 },
    { dir: "mipmap-xxxhdpi", px: 192 },
  ];

  for (const item of sizes) {
    await writePng(path.join(resDir, item.dir, "ic_launcher.png"), item.px);
    await writePng(path.join(resDir, item.dir, "ic_launcher_round.png"), item.px);
    await writePng(path.join(resDir, item.dir, "ic_launcher_foreground.png"), item.px);
  }
}

async function generateIosIcons() {
  const iconsetDir = path.join(ROOT, "ios", "App", "App", "Assets.xcassets", "AppIcon.appiconset");
  const contentsPath = path.join(iconsetDir, "Contents.json");
  if (!fs.existsSync(contentsPath)) return;

  const contents = JSON.parse(fs.readFileSync(contentsPath, "utf8"));
  const images = Array.isArray(contents.images) ? contents.images : [];
  const filenameToSize = new Map();

  for (const img of images) {
    if (!img.filename) continue;
    const raw = Number(String(img["expected-size"] || "").split(".")[0]);
    if (!Number.isFinite(raw) || raw <= 0) continue;
    const current = filenameToSize.get(img.filename) || 0;
    filenameToSize.set(img.filename, Math.max(current, raw));
  }

  for (const [filename, size] of filenameToSize.entries()) {
    await writePng(path.join(iconsetDir, filename), size);
  }
}

async function main() {
  await generateWebAndDesktopIcons();
  await generateAndroidIcons();
  await generateIosIcons();
  console.log("Generated web/desktop/mobile icon assets.");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
