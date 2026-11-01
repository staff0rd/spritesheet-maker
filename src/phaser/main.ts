import * as Phaser from "phaser";
import { layersFor, pickCharacter, type Layer } from "../core/compose";
import type { Direction } from "../core/directions";
import type { Manifest } from "../core/manifest";
import { createRandom, hashString } from "../core/random";
import { animationFrame, diamondPoint, frameIndex, tintColor } from "./crowd";

const CROWD_SIZE = 120;
const FLOOR = { halfWidth: 480, halfHeight: 240 };

interface Walker {
  container: Phaser.GameObjects.Container;
  sprites: Phaser.GameObjects.Sprite[];
  direction: Direction;
  phase: number;
  frame: number;
}

interface CrowdMember {
  layers: Layer[];
  direction: Direction;
  phase: number;
  x: number;
  y: number;
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
  return Array.from({ length: CROWD_SIZE }, () => {
    const character = pickCharacter(manifest, random);
    const direction = manifest.directions[Math.floor(random() * manifest.directions.length)];
    const phase = random();
    const { x, y } = diamondPoint(placement, FLOOR.halfWidth, FLOOR.halfHeight);
    return { layers: layersFor(manifest, character, direction), direction, phase, x, y };
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
    const { halfWidth, halfHeight } = FLOOR;
    floor.fillStyle(0x5b6b4f);
    floor.fillPoints([
      new Phaser.Math.Vector2(0, -halfHeight),
      new Phaser.Math.Vector2(halfWidth, 0),
      new Phaser.Math.Vector2(0, halfHeight),
      new Phaser.Math.Vector2(-halfWidth, 0),
    ]);

    this.walkers = this.crowd.map(({ layers, direction, phase, x, y }) => {
      const sprites = layers.map((layer) =>
        this.add
          .sprite(0, 0, layer.file)
          .setOrigin(anchor.x / frameSize.width, anchor.y / frameSize.height)
          .setTint(tintColor(layer.tint)),
      );
      const container = this.add.container(x, y, sprites).setDepth(y);
      return { container, sprites, direction, phase, frame: -1 };
    });

    const centre = () => this.cameras.main.centerOn(0, 0);
    centre();
    this.scale.on(Phaser.Scale.Events.RESIZE, centre);
  }

  update(time: number): void {
    const walk = this.manifest.animations.walk;
    if (!walk) return;
    const seconds = time / 1000;
    for (const walker of this.walkers) {
      const frame = frameIndex(
        this.manifest,
        walker.direction,
        animationFrame(walk.frames, walk.fps, seconds, walker.phase),
      );
      if (frame === walker.frame) continue;
      walker.frame = frame;
      for (const sprite of walker.sprites) sprite.setFrame(frame);
    }
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
  if (!manifest.animations.walk) throw new Error("Manifest has no walk animation");

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
