import { mkdir, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { chromium } from "playwright";
import { createServer } from "vite";
import { DEFAULT_CAPTURE_CONFIG } from "../src/core/config";
import { computeSheetLayout } from "../src/core/layout";
import { buildManifest } from "../src/core/manifest";
import type { RenderSheetRequest } from "../src/scene/api";

const OUT_DIR = resolve(process.argv[2] ?? "out");
const FRAMES_PER_DIRECTION = 1;

function decodePngDataUrl(dataUrl: string): Buffer {
  const prefix = "data:image/png;base64,";
  if (!dataUrl.startsWith(prefix)) throw new Error("Scene did not return a PNG data URL");
  return Buffer.from(dataUrl.slice(prefix.length), "base64");
}

async function main(): Promise<void> {
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

    const request: RenderSheetRequest = {
      config: DEFAULT_CAPTURE_CONFIG,
      framesPerDirection: FRAMES_PER_DIRECTION,
    };
    const dataUrl = await page.evaluate((req) => window.spritesheet!.renderSheet(req), request);

    const layout = computeSheetLayout(DEFAULT_CAPTURE_CONFIG.frameSize, DEFAULT_CAPTURE_CONFIG.directions, FRAMES_PER_DIRECTION);
    const manifest = buildManifest({
      config: DEFAULT_CAPTURE_CONFIG,
      layout,
      animations: { idle: { frames: [0] } },
      categories: { body: [{ id: "body", file: "body.png" }] },
    });

    await mkdir(OUT_DIR, { recursive: true });
    await writeFile(resolve(OUT_DIR, "body.png"), decodePngDataUrl(dataUrl));
    await writeFile(resolve(OUT_DIR, "manifest.json"), `${JSON.stringify(manifest, null, 2)}\n`);
    console.log(`Wrote body.png and manifest.json to ${OUT_DIR}`);
  } finally {
    await browser.close();
    await server.close();
  }
}

await main();
