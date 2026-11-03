import * as Phaser from "phaser";
import { layersFor, pickCharacter, type Character, type Layer } from "../core/compose";
import type { Direction } from "../core/directions";
import type { Manifest } from "../core/manifest";
import { createRandom, hashString, type Random } from "../core/random";
import type { Point } from "../core/layout";
import {
  animationFrame,
  crowdSize,
  depthFor,
  FLOOR_HEIGHT,
  frameIndex,
  LEVEL_COUNT,
  levelHeight,
  levelPoint,
  pickLevel,
  SLAB_OUTLINE,
  slabDepth,
  stairBoxes,
  stairDepth,
  stepWander,
  tintColor,
  toScreen,
  type GridPoint,
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
const SLAB_THICKNESS = 12;
const COLORS = {
  levels: [0x5b6b4f, 0x6f7f8c, 0x7c6f8c],
  edges: [0x3f4a37, 0x4c5863, 0x564c63],
  stairTop: 0x9a8a72,
  stairFront: 0x7a6a56,
  stairSide: 0x62553f,
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

function fill(graphics: Phaser.GameObjects.Graphics, color: number, points: Point[]): void {
  graphics.fillStyle(color);
  graphics.fillPoints(
    points.map(({ x, y }) => new Phaser.Math.Vector2(x, y)),
    true,
  );
}

function place(container: Phaser.GameObjects.Container, { x, y, level }: Wanderer): void {
  container.setPosition(x, y - levelHeight(level)).setDepth(depthFor(level, y));
}

function planCrowd(manifest: Manifest, seed: number, size: number): CrowdMember[] {
  const random = createRandom(seed);
  const placement = createRandom(hashString(`floor:${seed}`));
  return Array.from({ length: size }, (_, index) => {
    const character = pickCharacter(manifest, random);
    const direction = manifest.directions[Math.floor(random() * manifest.directions.length)];
    const phase = random();
    const level = pickLevel(placement);
    const { x, y } = levelPoint(placement, WANDER.floor, level);
    const wander = createRandom(hashString(`wander:${seed}:${index}`));
    const wanderer: Wanderer = { x, y, level, target: { x, y }, pause: wander() * WANDER.maxPause, direction };
    return { character, layers: layersFor(manifest, character, direction), wanderer, random: wander, phase };
  });
}

interface CrowdData {
  crowd: CrowdMember[];
}

class CrowdScene extends Phaser.Scene {
  private walkers: Walker[] = [];
  private crowd: CrowdMember[] = [];

  constructor(
    private readonly manifest: Manifest,
    private readonly manifestUrl: URL,
  ) {
    super("crowd");
  }

  init({ crowd }: CrowdData): void {
    this.crowd = crowd;
  }

  preload(): void {
    const { width, height } = this.manifest.frameSize;
    const files = new Set(this.crowd.flatMap(({ layers }) => layers.map((layer) => layer.file)));
    for (const file of files) {
      if (this.textures.exists(file)) continue;
      this.load.spritesheet(file, new URL(file, this.manifestUrl).href, { frameWidth: width, frameHeight: height });
    }
  }

  create(): void {
    const { manifest } = this;
    const { anchor, frameSize } = manifest;
    this.drawLevels();

    this.walkers = this.crowd.map(({ character, layers, wanderer, random, phase }) => {
      const sprites = new Map(
        layers.map((layer) => [
          layer.category,
          this.add
            .sprite(0, 0, layer.file)
            .setOrigin(anchor.x / frameSize.width, anchor.y / frameSize.height)
            .setTint(tintColor(layer.tint)),
        ]),
      );
      const container = this.add.container(0, 0, [...sprites.values()]);
      place(container, wanderer);
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

    const centre = () => this.cameras.main.centerOn(0, (-FLOOR_HEIGHT * (LEVEL_COUNT - 1)) / 2);
    centre();
    this.scale.on(Phaser.Scale.Events.RESIZE, centre);
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => this.scale.off(Phaser.Scale.Events.RESIZE, centre));
  }

  private drawLevels(): void {
    const { floor } = WANDER;
    const at = (point: GridPoint, z: number) => toScreen(floor, point, z);
    const east = { u: 1, v: 0 };
    const [, slabEast, slabSouth, slabWest] = SLAB_OUTLINE;
    const edges = [
      [slabWest, slabSouth],
      [slabSouth, slabEast],
    ];

    const ground = this.add.graphics().setDepth(-Infinity);
    fill(ground, COLORS.levels[0], [at({ u: 0, v: 0 }, 0), at(east, 0), at({ u: 1, v: 1 }, 0), at({ u: 0, v: 1 }, 0)]);

    for (let level = 0; level < LEVEL_COUNT; level++) {
      if (level > 0) {
        const z = levelHeight(level);
        const slab = this.add.graphics().setDepth(slabDepth(level));
        fill(
          slab,
          COLORS.levels[level],
          SLAB_OUTLINE.map((point) => at(point, z)),
        );
        for (const [from, to] of edges) {
          fill(slab, COLORS.edges[level], [
            at(from, z),
            at(to, z),
            at(to, z - SLAB_THICKNESS),
            at(from, z - SLAB_THICKNESS),
          ]);
        }
      }
      if (level < LEVEL_COUNT - 1) this.drawStairs(level, at);
    }
  }

  private drawStairs(level: number, at: (point: GridPoint, z: number) => Point): void {
    const stairs = this.add.graphics().setDepth(stairDepth(WANDER.floor, level));
    for (const { u0, u1, v0, v1, bottom, top } of stairBoxes(level)) {
      fill(stairs, COLORS.stairTop, [
        at({ u: u0, v: v0 }, top),
        at({ u: u1, v: v0 }, top),
        at({ u: u1, v: v1 }, top),
        at({ u: u0, v: v1 }, top),
      ]);
      fill(stairs, COLORS.stairFront, [
        at({ u: u0, v: v1 }, top),
        at({ u: u1, v: v1 }, top),
        at({ u: u1, v: v1 }, bottom),
        at({ u: u0, v: v1 }, bottom),
      ]);
      fill(stairs, COLORS.stairSide, [
        at({ u: u1, v: v0 }, top),
        at({ u: u1, v: v1 }, top),
        at({ u: u1, v: v1 }, bottom),
        at({ u: u1, v: v0 }, bottom),
      ]);
    }
  }

  update(_time: number, delta: number): void {
    const seconds = Math.min(delta / 1000, MAX_STEP_SECONDS);
    for (const walker of this.walkers) this.advance(walker, seconds);
  }

  private advance(walker: Walker, seconds: number): void {
    const wanderer = stepWander(walker.wanderer, seconds, walker.random, WANDER);
    walker.wanderer = wanderer;
    place(walker.container, wanderer);

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

function writeUrl(seed: number, size: number): void {
  const params = new URLSearchParams(location.search);
  params.set("seed", String(seed));
  params.set("count", String(size));
  history.replaceState(null, "", `?${params}`);
}

async function start(): Promise<void> {
  const params = new URLSearchParams(location.search);
  const manifestUrl = new URL(params.get("manifest") ?? "/out/manifest.json", location.href);
  const initial = readUrl();
  seedInput.value = String(initial.seed);
  countInput.value = String(initial.size);
  countLabel.value = countInput.value;

  const response = await fetch(manifestUrl);
  if (!response.ok) throw new Error(`Could not load ${manifestUrl} (${response.status}). Run npm run generate first.`);
  const manifest = (await response.json()) as Manifest;
  for (const name of ["walk", "idle"]) {
    if (!manifest.animations[name]) throw new Error(`Manifest has no ${name} animation`);
  }

  const game = new Phaser.Game({
    type: Phaser.AUTO,
    parent: element("game"),
    backgroundColor: "#2a2d33",
    pixelArt: true,
    scale: { mode: Phaser.Scale.RESIZE },
  });
  const scene = new CrowdScene(manifest, manifestUrl);
  await new Promise((resolve) => game.events.once(Phaser.Core.Events.READY, resolve));

  const spawn = (): void => {
    const seed = Number(seedInput.value) || 0;
    const size = crowdSize(countInput.value);
    countLabel.value = String(size);
    writeUrl(seed, size);
    const data: CrowdData = { crowd: planCrowd(manifest, seed, size) };
    if (game.scene.getScene("crowd")) scene.scene.restart(data);
    else game.scene.add("crowd", scene, true, data);
    status.textContent = `seed ${seed} · ${size} characters`;
  };

  reseedButton.addEventListener("click", () => {
    seedInput.value = String(Math.floor(Math.random() * 1_000_000));
    spawn();
  });
  seedInput.addEventListener("change", spawn);
  countInput.addEventListener("input", () => {
    countLabel.value = countInput.value;
  });
  countInput.addEventListener("change", spawn);
  element<HTMLFormElement>("controls").addEventListener("submit", (event) => event.preventDefault());
  setInterval(() => {
    fpsLabel.textContent = `${Math.round(game.loop.actualFps)} fps`;
  }, 500);

  spawn();
}

start().catch((error: unknown) => {
  status.textContent = error instanceof Error ? error.message : String(error);
  status.style.color = "#f66";
});
