import { DIRECTIONS, type Direction } from "../core/directions";
import type { Point } from "../core/layout";
import type { Manifest } from "../core/manifest";
import type { Random } from "../core/random";

export const MIN_CROWD = 50;
export const MAX_CROWD = 2000;
export const DEFAULT_CROWD = 200;

export function crowdSize(value: string | null): number {
  const parsed = Math.round(Number(value));
  if (value === null || value.trim() === "" || !Number.isFinite(parsed)) return DEFAULT_CROWD;
  return Math.min(MAX_CROWD, Math.max(MIN_CROWD, parsed));
}

export function sheetColumns(manifest: Manifest): number {
  return Math.floor(manifest.sheetSize.width / manifest.frameSize.width);
}

export function frameIndex(manifest: Manifest, direction: Direction, frame: number): number {
  const row = manifest.directionRows[direction];
  if (row === undefined) throw new Error(`Manifest has no row for ${direction}`);
  return row * sheetColumns(manifest) + frame;
}

export function animationFrame(frames: readonly number[], fps: number, seconds: number, phase: number): number {
  if (frames.length === 0) throw new Error("Animation has no frames");
  const tick = Math.floor(seconds * fps) + Math.floor(phase * frames.length);
  return frames[((tick % frames.length) + frames.length) % frames.length];
}

export function tintColor(hex: string): number {
  const match = /^#([0-9a-f]{6})$/i.exec(hex);
  if (!match) throw new Error(`Invalid tint "${hex}"`);
  return parseInt(match[1], 16);
}

export function diamondPoint(random: Random, halfWidth: number, halfHeight: number): Point {
  const u = random();
  const v = random();
  return { x: (u - v) * halfWidth, y: (u + v - 1) * halfHeight };
}

const SCREEN_HEADINGS: Record<Direction, Point> = {
  N: { x: 0, y: -1 },
  NE: { x: 2, y: -1 },
  E: { x: 1, y: 0 },
  SE: { x: 2, y: 1 },
  S: { x: 0, y: 1 },
  SW: { x: -2, y: 1 },
  W: { x: -1, y: 0 },
  NW: { x: -2, y: -1 },
};

export function headingAngle(direction: Direction): number {
  const { x, y } = SCREEN_HEADINGS[direction];
  return Math.atan2(y, x);
}

function angleBetween(a: number, b: number): number {
  const diff = Math.abs(a - b) % (2 * Math.PI);
  return diff > Math.PI ? 2 * Math.PI - diff : diff;
}

export function facingFor(dx: number, dy: number): Direction | undefined {
  if (dx === 0 && dy === 0) return undefined;
  const angle = Math.atan2(dy, dx);
  let best: Direction = DIRECTIONS[0];
  for (const direction of DIRECTIONS) {
    if (angleBetween(angle, headingAngle(direction)) < angleBetween(angle, headingAngle(best))) best = direction;
  }
  return best;
}

interface Floor {
  halfWidth: number;
  halfHeight: number;
}

export interface WanderConfig {
  floor: Floor;
  speed: number;
  minPause: number;
  maxPause: number;
  minLeg: number;
}

export interface Wanderer {
  x: number;
  y: number;
  target: Point;
  pause: number;
  direction: Direction;
}

export function wanderTarget(random: Random, from: Point, config: WanderConfig): Point {
  const { floor, minLeg } = config;
  let target = diamondPoint(random, floor.halfWidth, floor.halfHeight);
  for (let attempt = 0; attempt < 8 && Math.hypot(target.x - from.x, target.y - from.y) < minLeg; attempt++) {
    target = diamondPoint(random, floor.halfWidth, floor.halfHeight);
  }
  return target;
}

export function stepWander(wanderer: Wanderer, seconds: number, random: Random, config: WanderConfig): Wanderer {
  if (wanderer.pause > 0) {
    const pause = wanderer.pause - seconds;
    if (pause > 0) return { ...wanderer, pause };
    const target = wanderTarget(random, wanderer, config);
    const direction = facingFor(target.x - wanderer.x, target.y - wanderer.y) ?? wanderer.direction;
    return { ...wanderer, pause: 0, target, direction };
  }

  const dx = wanderer.target.x - wanderer.x;
  const dy = wanderer.target.y - wanderer.y;
  const distance = Math.hypot(dx, dy);
  const step = config.speed * seconds;
  const direction = facingFor(dx, dy) ?? wanderer.direction;
  if (step >= distance) {
    const pause = config.minPause + random() * (config.maxPause - config.minPause);
    return { ...wanderer, x: wanderer.target.x, y: wanderer.target.y, pause, direction };
  }
  return { ...wanderer, x: wanderer.x + (dx / distance) * step, y: wanderer.y + (dy / distance) * step, direction };
}
