import fs from "node:fs";
import path from "node:path";
import { StitchToolClient, Stitch } from "@google/stitch-sdk";

const PROJECT_ID = "2788036281176461288";
const SCREENS = [
  { name: "assets-mobile-v2", id: "65ee4bab645a4dd5a209ce3e5f12a626" },
  { name: "transactions-mobile-v2", id: "f95a227b1e5c4e8bafc32306ca246ab6" },
  { name: "dashboard-mobile-v2", id: "fe6050560aa54078aa66b7714a931333" },
  { name: "planning-mobile-v2", id: "0a183ed35d2942adbf31608ab34cfa9a" },
];

function ensureDir(dir) {
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
}

function readApiKeyFromMcp() {
  const mcpPath = path.join(process.cwd(), ".cursor", "mcp.json");
  const raw = fs.readFileSync(mcpPath, "utf8");
  const parsed = JSON.parse(raw);
  const key = parsed?.mcpServers?.stitch?.headers?.["X-Goog-Api-Key"];
  if (!key) {
    throw new Error("Stitch API key not found in .cursor/mcp.json");
  }
  return key;
}

async function download(url, targetPath) {
  const res = await fetch(url);
  if (!res.ok) {
    throw new Error(`Download failed (${res.status}): ${url}`);
  }
  const data = Buffer.from(await res.arrayBuffer());
  fs.writeFileSync(targetPath, data);
}

async function main() {
  const apiKey = process.env.STITCH_API_KEY || readApiKeyFromMcp();
  const outDir = path.join(process.cwd(), "stitch-export");
  const urlsDir = path.join(outDir, "urls");
  const codeDir = path.join(outDir, "code");
  const imageDir = path.join(outDir, "images");
  ensureDir(urlsDir);
  ensureDir(codeDir);
  ensureDir(imageDir);

  const client = new StitchToolClient({ apiKey });
  const stitch = new Stitch(client);
  const project = stitch.project(PROJECT_ID);

  const exported = [];
  for (const screenInfo of SCREENS) {
    const screen = await project.getScreen(screenInfo.id);
    const htmlUrl = await screen.getHtml();
    const imageUrl = await screen.getImage();

    exported.push({
      name: screenInfo.name,
      screenId: screenInfo.id,
      htmlUrl,
      imageUrl,
    });
  }

  const urlsPath = path.join(urlsDir, "stitch-screen-urls.json");
  fs.writeFileSync(urlsPath, `${JSON.stringify(exported, null, 2)}\n`, "utf8");

  for (const item of exported) {
    await download(item.htmlUrl, path.join(codeDir, `${item.name}.html`));
    await download(item.imageUrl, path.join(imageDir, `${item.name}.png`));
  }

  console.log(`Exported ${exported.length} screens to ${outDir}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
