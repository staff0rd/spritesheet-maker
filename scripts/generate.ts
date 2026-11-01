import { mkdir, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { chromium } from "playwright";
import { createServer } from "vite";
import { PART_CATALOG } from "../src/core/catalog";
import { DEFAULT_CAPTURE_CONFIG } from "../src/core/config";
import { computeSheetLayout } from "../src/core/layout";
import { buildManifest } from "../src/core/manifest";
import { planSheets, validateCatalog } from "../src/core/parts";
import type { RenderSheetRequest } from "../src/scene/api";

const OUT_DIR = resolve(process.argv[2] ?? "out");
const FRAMES_PER_DIRECTION = 1;

function decodePngDataUrl(dataUrl: string): Buffer {
  const prefix = "data:image/png;base64,";
  if (!dataUrl.startsWith(prefix)) throw new Error("Scene did not return a PNG data URL");
  return Buffer.from(dataUrl.slice(prefix.length), "base64");
}

async function main(): Promise<void> {
  validateCatalog(PART_CATALOG, DEFAULT_CAPTURE_CONFIG.directions);
  const jobs = planSheets(PART_CATALOG);
  const layout = computeSheetLayout(DEFAULT_CAPTURE_CONFIG.frameSize, DEFAULT_CAPTURE_CONFIG.directions, FRAMES_PER_DIRECTION);
  const manifest = buildManifest({
    config: DEFAULT_CAPTURE_CONFIG,
    layout,
    animations: { idle: { frames: [0] } },
    catalog: PART_CATALOG,
  });

  const server = await createServer({ logLevel: "error", server: { port: 0, strictPort: false } });
  await server.listen();
  const url = server.resolvedUrls?.local[0];
  if (!url) throw new Error("Vite dev server did not report a URL");

  const browser = await chromium.launch({
    headless: true,
    args: ["--use-angle=swiftshader", "--enable-unsafe-swiftshader"],
  });
  try {
    const page = await browser.newPage();
    page.on("pageerror", (error) => console.error(error));
    await page.goto(url);
    await page.waitForFunction(() => window.spritesheet !== undefined);

    for (const job of jobs) {
      const request: RenderSheetRequest = {
        config: DEFAULT_CAPTURE_CONFIG,
        framesPerDirection: FRAMES_PER_DIRECTION,
        body: job.body,
        part: job.part,
      };
      const dataUrl = await page.evaluate((req) => window.spritesheet!.renderSheet(req), request);
      const path = resolve(OUT_DIR, job.file);
      await mkdir(dirname(path), { recursive: true });
      await writeFile(path, decodePngDataUrl(dataUrl));
    }

    await writeFile(resolve(OUT_DIR, "manifest.json"), `${JSON.stringify(manifest, null, 2)}\n`);
    console.log(`Wrote ${jobs.length} sheets and manifest.json to ${OUT_DIR}`);
  } finally {
    await browser.close();
    await server.close();
  }
}

await main();
