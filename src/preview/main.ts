import { layersFor, pickCharacter, type Layer } from "../core/compose";
import type { Direction } from "../core/directions";
import type { Manifest } from "../core/manifest";
import { createRandom } from "../core/random";

const COLUMNS = 12;
const ROWS = 10;
const GAP = 4;

function element<T extends HTMLElement>(id: string): T {
  const found = document.getElementById(id);
  if (!found) throw new Error(`Missing #${id}`);
  return found as T;
}

const seedInput = element<HTMLInputElement>("seed");
const reseedButton = element<HTMLButtonElement>("reseed");
const directionSelect = element<HTMLSelectElement>("direction");
const scaleSelect = element<HTMLSelectElement>("scale");
const animationSelect = element<HTMLSelectElement>("animation");
const hairSelect = element<HTMLSelectElement>("hair");
const status = element<HTMLSpanElement>("status");
const fpsLabel = element<HTMLSpanElement>("fps");
const canvas = element<HTMLCanvasElement>("crowd");

function loadImage(url: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error(`Failed to load ${url}`));
    image.src = url;
  });
}

function createSheetLoader(baseUrl: URL): (file: string) => Promise<HTMLImageElement> {
  const cache = new Map<string, Promise<HTMLImageElement>>();
  return (file) => {
    let image = cache.get(file);
    if (!image) {
      image = loadImage(new URL(file, baseUrl).href);
      cache.set(file, image);
    }
    return image;
  };
}

function drawTinted(
  target: CanvasRenderingContext2D,
  scratch: CanvasRenderingContext2D,
  sheet: HTMLImageElement,
  source: { x: number; y: number; width: number; height: number },
  tint: string,
  x: number,
  y: number,
): void {
  const { width, height } = source;
  scratch.globalCompositeOperation = "source-over";
  scratch.clearRect(0, 0, width, height);
  scratch.drawImage(sheet, source.x, source.y, width, height, 0, 0, width, height);
  scratch.globalCompositeOperation = "multiply";
  scratch.fillStyle = tint;
  scratch.fillRect(0, 0, width, height);
  scratch.globalCompositeOperation = "destination-in";
  scratch.drawImage(sheet, source.x, source.y, width, height, 0, 0, width, height);
  target.drawImage(scratch.canvas, 0, 0, width, height, x, y, width, height);
}

interface Walker {
  strip: HTMLCanvasElement;
  phase: number;
}

let animationHandle = 0;

async function render(manifest: Manifest, loadSheet: (file: string) => Promise<HTMLImageElement>): Promise<void> {
  cancelAnimationFrame(animationHandle);
  const seed = Number(seedInput.value) || 0;
  const scale = Number(scaleSelect.value);
  const fixedDirection = directionSelect.value as Direction | "";
  const { width, height } = manifest.frameSize;
  const rowWidth = manifest.sheetSize.width;
  const random = createRandom(seed);

  const crowd = Array.from({ length: COLUMNS * ROWS }, () => {
    const character = pickCharacter(manifest, random, { hair: hairSelect.value || undefined });
    const direction = fixedDirection || manifest.directions[Math.floor(random() * manifest.directions.length)];
    const phase = random();
    return { direction, phase, layers: layersFor(manifest, character, direction) };
  });

  const sheets = new Map<string, HTMLImageElement>();
  const files = [...new Set(crowd.flatMap(({ layers }) => layers.map((layer: Layer) => layer.file)))];
  await Promise.all(files.map(async (file) => sheets.set(file, await loadSheet(file))));

  const scratchCanvas = document.createElement("canvas");
  scratchCanvas.width = rowWidth;
  scratchCanvas.height = height;
  const scratch = scratchCanvas.getContext("2d")!;

  const walkers: Walker[] = crowd.map(({ direction, phase, layers }) => {
    const strip = document.createElement("canvas");
    strip.width = rowWidth;
    strip.height = height;
    const stripContext = strip.getContext("2d")!;
    const source = { x: 0, y: manifest.directionRows[direction] * height, width: rowWidth, height };
    for (const layer of layers) drawTinted(stripContext, scratch, sheets.get(layer.file)!, source, layer.tint, 0, 0);
    return { strip, phase };
  });

  const cellWidth = width + GAP;
  const cellHeight = height + GAP;
  canvas.width = COLUMNS * cellWidth * scale;
  canvas.height = ROWS * cellHeight * scale;
  const context = canvas.getContext("2d")!;
  context.imageSmoothingEnabled = false;
  context.setTransform(scale, 0, 0, scale, 0, 0);

  const animation = manifest.animations[animationSelect.value] ?? Object.values(manifest.animations)[0];
  if (!animation) throw new Error("Manifest has no animations");
  let lastTick = -1;
  let windowStart = performance.now();
  let loops = 0;
  let draws = 0;
  let drawTime = 0;
  const draw = (time: number) => {
    loops++;
    if (time - windowStart >= 500) {
      const seconds = (time - windowStart) / 1000;
      const drawMs = draws ? (drawTime / draws).toFixed(2) : "–";
      fpsLabel.textContent = `${Math.round(loops / seconds)} fps · ${(draws / seconds).toFixed(1)} frame changes/s @ ${animation.fps} fps · ${drawMs} ms/draw`;
      windowStart = time;
      loops = draws = drawTime = 0;
    }
    const tick = Math.floor((time / 1000) * animation.fps);
    if (tick !== lastTick) {
      lastTick = tick;
      const drawStart = performance.now();
      context.clearRect(0, 0, canvas.width, canvas.height);
      walkers.forEach(({ strip, phase }, index) => {
        const frames = animation.frames;
        const frame = frames[(tick + Math.floor(phase * frames.length)) % frames.length];
        const x = (index % COLUMNS) * cellWidth;
        const y = Math.floor(index / COLUMNS) * cellHeight;
        context.drawImage(strip, frame * width, 0, width, height, x, y, width, height);
      });
      draws++;
      drawTime += performance.now() - drawStart;
    }
    animationHandle = requestAnimationFrame(draw);
  };
  animationHandle = requestAnimationFrame(draw);

  status.textContent = `${crowd.length} characters · ${files.length} sheets`;
  const params = new URLSearchParams(location.search);
  params.set("seed", String(seed));
  params.set("animation", animationSelect.value);
  if (hairSelect.value) params.set("hair", hairSelect.value);
  else params.delete("hair");
  history.replaceState(null, "", `?${params}`);
}

async function start(): Promise<void> {
  const params = new URLSearchParams(location.search);
  const manifestUrl = new URL(params.get("manifest") ?? "/out/manifest.json", location.href);
  if (params.has("seed")) seedInput.value = params.get("seed")!;

  const response = await fetch(manifestUrl);
  if (!response.ok) throw new Error(`Could not load ${manifestUrl} (${response.status}). Run npm run generate first.`);
  const manifest = (await response.json()) as Manifest;
  const loadSheet = createSheetLoader(manifestUrl);
  for (const direction of manifest.directions) directionSelect.add(new Option(direction, direction));
  for (const name of Object.keys(manifest.animations)) animationSelect.add(new Option(name, name));
  animationSelect.value = params.get("animation") ?? ("walk" in manifest.animations ? "walk" : animationSelect.value);
  for (const { id } of manifest.categories.hair?.variants ?? []) hairSelect.add(new Option(id, id));
  hairSelect.value = params.get("hair") ?? "";

  const rerender = () => render(manifest, loadSheet).catch(showError);
  reseedButton.addEventListener("click", () => {
    seedInput.value = String(Math.floor(Math.random() * 1_000_000));
    rerender();
  });
  for (const control of [seedInput, directionSelect, scaleSelect, animationSelect, hairSelect]) control.addEventListener("change", rerender);
  await render(manifest, loadSheet);
}

function showError(error: unknown): void {
  status.textContent = error instanceof Error ? error.message : String(error);
  status.style.color = "#b00";
}

start().catch(showError);
