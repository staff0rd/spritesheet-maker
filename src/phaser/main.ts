import * as Phaser from "phaser";
import { layersFor, pickCharacter, type Character } from "../core/compose";
import type { Direction } from "../core/directions";
import type { Manifest } from "../core/manifest";
import type { Random } from "../core/random";
import type { Point } from "../core/layout";
import { element, mountCrowdControls, showError } from "../crowd/controls";
import { COLORS, planCrowd, RAIL_HEIGHT, RAIL_POST_SPACING, SLAB_THICKNESS, WANDER, type CrowdMember } from "../crowd/plan";
import {
  animationFrame,
  FLOOR_HEIGHT,
  frameIndex,
  LEVEL_COUNT,
  levelHeight,
  MAX_CROWD,
  SLAB_OUTLINE,
  slabDepth,
  stairBoxes,
  stairDepth,
  stairRails,
  frontRailDepth,
  stepWander,
  tintColor,
  toScreen,
  walkerDepth,
  type GridPoint,
  type RailPoint,
  type StairBox,
  pillarDepth,
  pillars,
  upperFlightDepth,
  type Wanderer,
} from "./crowd";

const MAX_STEP_SECONDS = 0.1;

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

function fill(graphics: Phaser.GameObjects.Graphics, color: number, points: Point[]): void {
  graphics.fillStyle(color);
  graphics.fillPoints(
    points.map(({ x, y }) => new Phaser.Math.Vector2(x, y)),
    true,
  );
}

function place(container: Phaser.GameObjects.Container, wanderer: Wanderer): void {
  container.setPosition(wanderer.x, wanderer.y - wanderer.z).setDepth(walkerDepth(WANDER.floor, wanderer));
}

interface CrowdData {
  crowd: CrowdMember<Character>[];
}

class CrowdScene extends Phaser.Scene {
  private walkers: Walker[] = [];
  private crowd: CrowdMember<Character>[] = [];

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
    const files = new Set(
      this.crowd.flatMap(({ look, wanderer }) =>
        layersFor(this.manifest, look, wanderer.direction).map((layer) => layer.file),
      ),
    );
    for (const file of files) {
      if (this.textures.exists(file)) continue;
      this.load.spritesheet(file, new URL(file, this.manifestUrl).href, { frameWidth: width, frameHeight: height });
    }
  }

  create(): void {
    const { manifest } = this;
    const { anchor, frameSize } = manifest;
    this.drawLevels();

    this.walkers = this.crowd.map(({ look: character, wanderer, random, phase }) => {
      const sprites = new Map(
        layersFor(manifest, character, wanderer.direction).map((layer) => [
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
      this.drawPillars(level, at);
    }
  }

  private drawStairs(level: number, at: (point: GridPoint, z: number) => Point): void {
    const lowerFlight = this.add.graphics().setDepth(stairDepth(WANDER.floor, level));
    const upperFlight = this.add.graphics().setDepth(upperFlightDepth(WANDER.floor, level));
    const { back, inner, front } = stairRails(level);
    const { lower, upper } = stairBoxes(level);
    this.drawRail(lowerFlight, back, at);
    this.drawSteps(lowerFlight, lower, at);
    this.drawSteps(upperFlight, upper, at);
    this.drawRail(upperFlight, inner, at);
    this.drawRail(this.add.graphics().setDepth(frontRailDepth(WANDER.floor, level)), front, at);
  }

  private drawPillars(level: number, at: (point: GridPoint, z: number) => Point): void {
    const bottom = levelHeight(level);
    const top = levelHeight(level + 1) - SLAB_THICKNESS;
    for (const box of pillars(level)) {
      const { u0, u1, v0, v1 } = box;
      const pillar = this.add.graphics().setDepth(pillarDepth(WANDER.floor, level, box));
      fill(pillar, COLORS.pillarLeft, [
        at({ u: u0, v: v1 }, top),
        at({ u: u1, v: v1 }, top),
        at({ u: u1, v: v1 }, bottom),
        at({ u: u0, v: v1 }, bottom),
      ]);
      fill(pillar, COLORS.pillarRight, [
        at({ u: u1, v: v0 }, top),
        at({ u: u1, v: v1 }, top),
        at({ u: u1, v: v1 }, bottom),
        at({ u: u1, v: v0 }, bottom),
      ]);
    }
  }

  private drawSteps(
    stairs: Phaser.GameObjects.Graphics,
    boxes: StairBox[],
    at: (point: GridPoint, z: number) => Point,
  ): void {
    for (const { u0, u1, v0, v1, bottom, top } of boxes) {
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

  private drawRail(
    graphics: Phaser.GameObjects.Graphics,
    rail: RailPoint[],
    at: (point: GridPoint, z: number) => Point,
  ): void {
    graphics.lineStyle(2, COLORS.rail);
    rail.slice(1).forEach((to, index) => {
      const from = rail[index];
      const steps = Math.max(1, Math.round(Math.hypot(to.u - from.u, to.v - from.v) / RAIL_POST_SPACING));
      const top = (t: number): Point =>
        at({ u: from.u + (to.u - from.u) * t, v: from.v + (to.v - from.v) * t }, from.z + (to.z - from.z) * t + RAIL_HEIGHT);
      graphics.lineBetween(top(0).x, top(0).y, top(1).x, top(1).y);
      for (let post = 0; post <= steps; post++) {
        const t = post / steps;
        const foot = at({ u: from.u + (to.u - from.u) * t, v: from.v + (to.v - from.v) * t }, from.z + (to.z - from.z) * t);
        graphics.lineBetween(foot.x, foot.y, top(t).x, top(t).y);
      }
    });
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

async function start(): Promise<void> {
  const params = new URLSearchParams(location.search);
  const manifestUrl = new URL(params.get("manifest") ?? "/out/manifest.json", location.href);
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

  mountCrowdControls({
    max: MAX_CROWD,
    fps: () => game.loop.actualFps,
    spawn: (seed, size) => {
      const data: CrowdData = { crowd: planCrowd(seed, size, (random) => pickCharacter(manifest, random)) };
      if (game.scene.getScene("crowd")) scene.scene.restart(data);
      else game.scene.add("crowd", scene, true, data);
    },
  });
}

start().catch(showError);
