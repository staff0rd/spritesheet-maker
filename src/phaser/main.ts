import * as Phaser from "phaser";
import { layersFor, pickCharacter, type Character, type Layer } from "../core/compose";
import type { Direction } from "../core/directions";
import type { Manifest } from "../core/manifest";
import { createRandom, hashString, type Random } from "../core/random";
import { manifestUrl, missingManifestMessage, parseRenderStyle, RENDER_STYLES, type RenderStyle } from "../core/style";
import {
  animationFrame,
  crowdSize,
  diamondPoint,
  frameIndex,
  stepWander,
  tintColor,
  type WanderConfig,
  type Wanderer,
} from "./crowd";

const MAX_STEP_SECONDS = 0.1;
const WANDER: WanderConfig = {
  floor: { halfWidth: 480, halfHeight: 240 },
  speed: 36,
  minPause: 0.8,
  maxPause: 4,
  minLeg: 80,
};

interface Walker {
  character: Character;
  container: Phaser.GameObjects.Container;
  sprites: Map<string, Phaser.GameObjects.Sprite>;
  wanderer: Wanderer;
  random: Random;
  direction: Direction;
  animation: string;
  clock: number;
  phase: number;
  frame: number;
}

interface CrowdMember {
  character: Character;
  layers: Layer[];
  wanderer: Wanderer;
  random: Random;
  phase: number;
}

function element<T extends HTMLElement>(id: string): T {
  const found = document.getElementById(id);
  if (!found) throw new Error(`Missing #${id}`);
  return found as T;
}

const status = element<HTMLSpanElement>("status");
const fpsLabel = element<HTMLSpanElement>("fps");
const seedInput = element<HTMLInputElement>("seed");
const reseedButton = element<HTMLButtonElement>("reseed");
const countInput = element<HTMLInputElement>("count");
const countLabel = element<HTMLOutputElement>("count-label");
const styleSelect = element<HTMLSelectElement>("style");

function planCrowd(manifest: Manifest, seed: number, size: number): CrowdMember[] {
  const random = createRandom(seed);
  const placement = createRandom(hashString(`floor:${seed}`));
  const { halfWidth, halfHeight } = WANDER.floor;
  return Array.from({ length: size }, (_, index) => {
    const character = pickCharacter(manifest, random);
    const direction = manifest.directions[Math.floor(random() * manifest.directions.length)];
    const phase = random();
    const { x, y } = diamondPoint(placement, halfWidth, halfHeight);
    const wander = createRandom(hashString(`wander:${seed}:${index}`));
    const wanderer: Wanderer = { x, y, target: { x, y }, pause: wander() * WANDER.maxPause, direction };
    return { character, layers: layersFor(manifest, character, direction), wanderer, random: wander, phase };
  });
}

interface CrowdData {
  crowd: CrowdMember[];
  manifest: Manifest;
  manifestUrl: URL;
}

class CrowdScene extends Phaser.Scene {
  private walkers: Walker[] = [];
  private crowd: CrowdMember[] = [];
  private manifest!: Manifest;
  private manifestUrl!: URL;

  constructor() {
    super("crowd");
  }

  init({ crowd, manifest, manifestUrl }: CrowdData): void {
    this.crowd = crowd;
    this.manifest = manifest;
    this.manifestUrl = manifestUrl;
  }

  private textureKey(file: string): string {
    return new URL(file, this.manifestUrl).href;
  }

  preload(): void {
    const { width, height } = this.manifest.frameSize;
    const files = new Set(this.crowd.flatMap(({ layers }) => layers.map((layer) => layer.file)));
    for (const file of files) {
      const key = this.textureKey(file);
      if (this.textures.exists(key)) continue;
      this.load.spritesheet(key, key, { frameWidth: width, frameHeight: height });
    }
  }

  create(): void {
    const { manifest } = this;
    const { anchor, frameSize } = manifest;
    const floor = this.add.graphics().setDepth(-Infinity);
    const { halfWidth, halfHeight } = WANDER.floor;
    floor.fillStyle(0x5b6b4f);
    floor.fillPoints([
      new Phaser.Math.Vector2(0, -halfHeight),
      new Phaser.Math.Vector2(halfWidth, 0),
      new Phaser.Math.Vector2(0, halfHeight),
      new Phaser.Math.Vector2(-halfWidth, 0),
    ]);

    this.walkers = this.crowd.map(({ character, layers, wanderer, random, phase }) => {
      const sprites = new Map(
        layers.map((layer) => [
          layer.category,
          this.add
            .sprite(0, 0, this.textureKey(layer.file))
            .setOrigin(anchor.x / frameSize.width, anchor.y / frameSize.height)
            .setTint(tintColor(layer.tint)),
        ]),
      );
      const container = this.add.container(wanderer.x, wanderer.y, [...sprites.values()]).setDepth(wanderer.y);
      return {
        character,
        container,
        sprites,
        wanderer,
        random,
        direction: wanderer.direction,
        animation: "",
        clock: 0,
        phase,
        frame: -1,
      };
    });

    const centre = () => this.cameras.main.centerOn(0, 0);
    centre();
    this.scale.on(Phaser.Scale.Events.RESIZE, centre);
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => this.scale.off(Phaser.Scale.Events.RESIZE, centre));
  }

  update(_time: number, delta: number): void {
    const seconds = Math.min(delta / 1000, MAX_STEP_SECONDS);
    for (const walker of this.walkers) this.advance(walker, seconds);
  }

  private advance(walker: Walker, seconds: number): void {
    const wanderer = stepWander(walker.wanderer, seconds, walker.random, WANDER);
    walker.wanderer = wanderer;
    walker.container.setPosition(wanderer.x, wanderer.y).setDepth(wanderer.y);

    const name = wanderer.pause > 0 ? "idle" : "walk";
    if (name !== walker.animation) {
      walker.animation = name;
      walker.clock = 0;
    }
    walker.clock += seconds;

    if (wanderer.direction !== walker.direction) {
      walker.direction = wanderer.direction;
      for (const layer of layersFor(this.manifest, walker.character, walker.direction)) {
        const sprite = walker.sprites.get(layer.category);
        if (sprite) walker.container.bringToTop(sprite);
      }
    }

    const animation = this.manifest.animations[name];
    const frame = frameIndex(
      this.manifest,
      walker.direction,
      animationFrame(animation.frames, animation.fps, walker.clock, walker.phase),
    );
    if (frame === walker.frame) return;
    walker.frame = frame;
    for (const sprite of walker.sprites.values()) sprite.setFrame(frame);
  }
}

function readUrl(): { seed: number; size: number } {
  const params = new URLSearchParams(location.search);
  return { seed: Number(params.get("seed") ?? 1) || 0, size: crowdSize(params.get("count")) };
}

function writeUrl(seed: number, size: number, style: RenderStyle): void {
  const params = new URLSearchParams(location.search);
  params.set("style", style);
  params.set("seed", String(seed));
  params.set("count", String(size));
  history.replaceState(null, "", `?${params}`);
}

async function loadManifest(params: URLSearchParams, style: RenderStyle): Promise<{ manifest: Manifest; manifestUrl: URL }> {
  const url = manifestUrl(params, style, location.href);
  const response = await fetch(url);
  if (!response.ok) throw new Error(missingManifestMessage(url, response.status, style));
  const manifest = (await response.json()) as Manifest;
  for (const name of ["walk", "idle"]) {
    if (!manifest.animations[name]) throw new Error(`Manifest has no ${name} animation`);
  }
  return { manifest, manifestUrl: url };
}

function showError(error: unknown): void {
  status.textContent = error instanceof Error ? error.message : String(error);
  status.style.color = "#f66";
}

async function start(): Promise<void> {
  const params = new URLSearchParams(location.search);
  const initial = readUrl();
  seedInput.value = String(initial.seed);
  countInput.value = String(initial.size);
  countLabel.value = countInput.value;
  for (const option of RENDER_STYLES) styleSelect.add(new Option(option, option));
  styleSelect.value = parseRenderStyle(params.get("style"));

  const manifests = new Map<RenderStyle, Promise<{ manifest: Manifest; manifestUrl: URL }>>();
  const loadStyle = (style: RenderStyle): Promise<{ manifest: Manifest; manifestUrl: URL }> => {
    let loaded = manifests.get(style);
    if (!loaded) {
      loaded = loadManifest(params, style);
      loaded.catch(() => manifests.delete(style));
      manifests.set(style, loaded);
    }
    return loaded;
  };
  await loadStyle(parseRenderStyle(styleSelect.value));

  const game = new Phaser.Game({
    type: Phaser.AUTO,
    parent: element("game"),
    backgroundColor: "#2a2d33",
    pixelArt: true,
    scale: { mode: Phaser.Scale.RESIZE },
  });
  const scene = new CrowdScene();
  await new Promise((resolve) => game.events.once(Phaser.Core.Events.READY, resolve));

  const spawn = async (): Promise<void> => {
    const seed = Number(seedInput.value) || 0;
    const size = crowdSize(countInput.value);
    const style = parseRenderStyle(styleSelect.value);
    countLabel.value = String(size);
    writeUrl(seed, size, style);
    const { manifest, manifestUrl } = await loadStyle(style);
    const data: CrowdData = { crowd: planCrowd(manifest, seed, size), manifest, manifestUrl };
    if (game.scene.getScene("crowd")) scene.scene.restart(data);
    else game.scene.add("crowd", scene, true, data);
    status.textContent = `${style} · seed ${seed} · ${size} characters`;
    status.style.color = "";
  };
  const respawn = (): void => {
    spawn().catch(showError);
  };

  reseedButton.addEventListener("click", () => {
    seedInput.value = String(Math.floor(Math.random() * 1_000_000));
    respawn();
  });
  seedInput.addEventListener("change", respawn);
  styleSelect.addEventListener("change", respawn);
  countInput.addEventListener("input", () => {
    countLabel.value = countInput.value;
  });
  countInput.addEventListener("change", respawn);
  element<HTMLFormElement>("controls").addEventListener("submit", (event) => event.preventDefault());
  setInterval(() => {
    fpsLabel.textContent = `${Math.round(game.loop.actualFps)} fps`;
  }, 500);

  await spawn();
}

start().catch(showError);
