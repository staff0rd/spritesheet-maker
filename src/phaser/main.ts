import * as Phaser from "phaser";
import { layersFor, pickCharacter, type Character, type Layer } from "../core/compose";
import type { Direction } from "../core/directions";
import type { Manifest } from "../core/manifest";
import { createRandom, hashString, type Random } from "../core/random";
import {
  animationFrame,
  diamondPoint,
  frameIndex,
  stepWander,
  tintColor,
  type WanderConfig,
  type Wanderer,
} from "./crowd";

const CROWD_SIZE = 120;
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

function planCrowd(manifest: Manifest, seed: number): CrowdMember[] {
  const random = createRandom(seed);
  const placement = createRandom(hashString(`floor:${seed}`));
  const { halfWidth, halfHeight } = WANDER.floor;
  return Array.from({ length: CROWD_SIZE }, (_, index) => {
    const character = pickCharacter(manifest, random);
    const direction = manifest.directions[Math.floor(random() * manifest.directions.length)];
    const phase = random();
    const { x, y } = diamondPoint(placement, halfWidth, halfHeight);
    const wander = createRandom(hashString(`wander:${seed}:${index}`));
    const wanderer: Wanderer = { x, y, target: { x, y }, pause: wander() * WANDER.maxPause, direction };
    return { character, layers: layersFor(manifest, character, direction), wanderer, random: wander, phase };
  });
}

class CrowdScene extends Phaser.Scene {
  private walkers: Walker[] = [];

  constructor(
    private readonly manifest: Manifest,
    private readonly manifestUrl: URL,
    private readonly crowd: CrowdMember[],
  ) {
    super("crowd");
  }

  preload(): void {
    const { width, height } = this.manifest.frameSize;
    const files = new Set(this.crowd.flatMap(({ layers }) => layers.map((layer) => layer.file)));
    for (const file of files) {
      this.load.spritesheet(file, new URL(file, this.manifestUrl).href, { frameWidth: width, frameHeight: height });
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
            .sprite(0, 0, layer.file)
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

async function start(): Promise<void> {
  const params = new URLSearchParams(location.search);
  const manifestUrl = new URL(params.get("manifest") ?? "/out/manifest.json", location.href);
  const seed = Number(params.get("seed") ?? 1) || 0;
  params.set("seed", String(seed));
  history.replaceState(null, "", `?${params}`);

  const response = await fetch(manifestUrl);
  if (!response.ok) throw new Error(`Could not load ${manifestUrl} (${response.status}). Run npm run generate first.`);
  const manifest = (await response.json()) as Manifest;
  for (const name of ["walk", "idle"]) {
    if (!manifest.animations[name]) throw new Error(`Manifest has no ${name} animation`);
  }

  const crowd = planCrowd(manifest, seed);
  new Phaser.Game({
    type: Phaser.AUTO,
    parent: element("game"),
    backgroundColor: "#2a2d33",
    pixelArt: true,
    scale: { mode: Phaser.Scale.RESIZE },
    scene: new CrowdScene(manifest, manifestUrl, crowd),
  });
  status.textContent = `seed ${seed} · ${crowd.length} characters`;
}

start().catch((error: unknown) => {
  status.textContent = error instanceof Error ? error.message : String(error);
  status.style.color = "#f66";
});
