import type { Direction } from "../core/directions";
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

export function facingFor(dx: number, dy: number): Direction | undefined {
  if (dx === 0 && dy === 0) return undefined;
  if (dx >= 0) return dy < 0 ? "NE" : "SE";
  return dy < 0 ? "NW" : "SW";
}

export interface Floor {
  halfWidth: number;
  halfHeight: number;
}

export const LEVEL_COUNT = 3;
export const FLOOR_HEIGHT = 120;
const LEVEL_DEPTH = 10_000;
const STEPS_PER_FLIGHT = 12;

export interface GridPoint {
  u: number;
  v: number;
}

export const UPPER_SIZE = 0.5;

export const STAIRWELL = { width: 0.2, back: UPPER_SIZE, turn: 0.63, front: 0.7 } as const;

export const SLAB_OUTLINE: readonly GridPoint[] = [
  { u: 0, v: 0 },
  { u: UPPER_SIZE, v: 0 },
  { u: UPPER_SIZE, v: UPPER_SIZE },
  { u: 0, v: UPPER_SIZE },
];

export function toScreen(floor: Floor, { u, v }: GridPoint, z = 0): Point {
  return { x: (u - v) * floor.halfWidth, y: (u + v - 1) * floor.halfHeight - z };
}

export function toGrid(floor: Floor, { x, y }: Point): GridPoint {
  const across = x / floor.halfWidth;
  const down = y / floor.halfHeight;
  return { u: (across + down + 1) / 2, v: (down - across + 1) / 2 };
}

export function levelHeight(level: number): number {
  return level * FLOOR_HEIGHT;
}

export function depthFor(level: number, y: number): number {
  return level * LEVEL_DEPTH + y;
}

export function slabDepth(level: number): number {
  return depthFor(level, -LEVEL_DEPTH / 2);
}

export function onLevel(floor: Floor, level: number, point: Point): boolean {
  const { u, v } = toGrid(floor, point);
  const epsilon = 1e-9;
  if (u < -epsilon || v < -epsilon || u > 1 + epsilon || v > 1 + epsilon) return false;
  if (level > 0) return u <= UPPER_SIZE + epsilon && v <= UPPER_SIZE + epsilon;
  return !(u <= STAIRWELL.width && v >= STAIRWELL.back && v <= STAIRWELL.front);
}

export function pickLevel(random: Random): number {
  const upperArea = UPPER_SIZE * UPPER_SIZE;
  const ticket = random() * (1 + (LEVEL_COUNT - 1) * upperArea);
  return ticket < 1 ? 0 : Math.min(LEVEL_COUNT - 1, 1 + Math.floor((ticket - 1) / upperArea));
}

export function levelPoint(random: Random, floor: Floor, level: number): Point {
  if (level > 0) return toScreen(floor, { u: random() * UPPER_SIZE, v: random() * UPPER_SIZE });
  for (;;) {
    const point = diamondPoint(random, floor.halfWidth, floor.halfHeight);
    if (onLevel(floor, level, point)) return point;
  }
}

export function pathClear(floor: Floor, level: number, from: Point, to: Point): boolean {
  if (level > 0) return true;
  const a = toGrid(floor, from);
  const b = toGrid(floor, to);
  let enter = 0;
  let exit = 1;
  const clip = (start: number, delta: number, min: number, max: number): boolean => {
    if (delta === 0) return start >= min && start <= max;
    const t0 = (min - start) / delta;
    const t1 = (max - start) / delta;
    enter = Math.max(enter, Math.min(t0, t1));
    exit = Math.min(exit, Math.max(t0, t1));
    return enter <= exit;
  };
  const hits =
    clip(a.u, b.u - a.u, -Infinity, STAIRWELL.width) && clip(a.v, b.v - a.v, STAIRWELL.back, STAIRWELL.front);
  return !hits;
}

export interface StairBox {
  u0: number;
  u1: number;
  v0: number;
  v1: number;
  bottom: number;
  top: number;
}

export function stairBoxes(level: number): StairBox[] {
  const { width, back, turn, front } = STAIRWELL;
  const base = levelHeight(level);
  const half = FLOOR_HEIGHT / 2;
  const rise = half / (STEPS_PER_FLIGHT + 1);
  const run = (turn - back) / STEPS_PER_FLIGHT;
  const box = (u0: number, u1: number, v0: number, top: number, length: number): StairBox => ({
    u0,
    u1,
    v0,
    v1: v0 + length,
    bottom: Math.max(base, top - 2 * rise),
    top,
  });
  const steps = Array.from({ length: STEPS_PER_FLIGHT }, (_, index) => index);
  return [
    ...steps.map((index) => box(0, width / 2, back + index * run, base + (index + 1) * rise, run)),
    ...[...steps]
      .reverse()
      .map((index) => box(width / 2, width, turn - (index + 1) * run, base + half + (index + 1) * rise, run)),
    box(0, width, turn, base + half, front - turn),
  ];
}

export function stairDepth(floor: Floor, level: number): number {
  return depthFor(level, toScreen(floor, { u: STAIRWELL.width, v: STAIRWELL.back }).y);
}

export interface Waypoint extends Point {
  z: number;
  level: number;
}

const STAIR_DOOR = 0.01;
export const LEVEL_CHANGE_CHANCE = 0.05;

export function flightRoute(floor: Floor, level: number, up: boolean): Waypoint[] {
  const { width, back, turn, front } = STAIRWELL;
  const door = back - STAIR_DOOR;
  const base = levelHeight(level);
  const landing = base + FLOOR_HEIGHT / 2;
  const points: [GridPoint, number, number, number][] = [
    [{ u: width / 4, v: door }, base, level, level],
    [{ u: width / 4, v: turn }, landing, level, level],
    [{ u: width / 2, v: (turn + front) / 2 }, landing, level, level],
    [{ u: (3 * width) / 4, v: turn }, landing, level + 1, level],
    [{ u: (3 * width) / 4, v: door }, base + FLOOR_HEIGHT, level + 1, level + 1],
  ];
  const ordered = up ? points : [...points].reverse();
  return ordered.map(([grid, z, upLevel, downLevel]) => ({
    ...toScreen(floor, grid),
    z,
    level: up ? upLevel : downLevel,
  }));
}

export function routeTo(
  floor: Floor,
  from: Point,
  fromLevel: number,
  to: Point,
  toLevel: number,
): Waypoint[] | undefined {
  const route: Waypoint[] = [];
  let at: Point = from;
  let level = fromLevel;
  while (level !== toLevel) {
    const up = toLevel > level;
    const flight = flightRoute(floor, up ? level : level - 1, up);
    const detour = levelLeg(floor, level, at, flight[0]);
    if (!detour) return undefined;
    route.push(...detour, ...flight);
    const exit = flight[flight.length - 1];
    at = exit;
    level = exit.level;
  }
  const detour = levelLeg(floor, level, at, to);
  if (!detour) return undefined;
  return [...route, ...detour, { x: to.x, y: to.y, z: levelHeight(level), level }];
}

function levelLeg(floor: Floor, level: number, from: Point, to: Point): Waypoint[] | undefined {
  if (pathClear(floor, level, from, to)) return [];
  const corner = toScreen(floor, { u: STAIRWELL.width + STAIR_DOOR, v: STAIRWELL.back - STAIR_DOOR });
  if (!pathClear(floor, level, from, corner) || !pathClear(floor, level, corner, to)) return undefined;
  return [{ ...corner, z: levelHeight(level), level }];
}

export function walkerDepth(floor: Floor, { y, z, level }: Pick<Wanderer, "y" | "z" | "level">): number {
  const depth = depthFor(level, y);
  if (z === levelHeight(level)) return depth;
  return Math.max(depth, stairDepth(floor, level) + 1);
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
  z: number;
  level: number;
  target: Waypoint;
  route: Waypoint[];
  pause: number;
  direction: Direction;
}

export function wanderTarget(random: Random, from: Point, level: number, config: WanderConfig): Point {
  const { floor, minLeg } = config;
  let fallback: Point = from;
  for (let attempt = 0; attempt < 12; attempt++) {
    const target = levelPoint(random, floor, level);
    if (!pathClear(floor, level, from, target)) continue;
    if (Math.hypot(target.x - from.x, target.y - from.y) >= minLeg) return target;
    fallback = target;
  }
  return fallback;
}

export function wanderRoute(random: Random, from: Point, fromLevel: number, config: WanderConfig): Waypoint[] {
  const { floor } = config;
  if (random() < LEVEL_CHANGE_CHANCE) {
    const level = (fromLevel + 1 + Math.floor(random() * (LEVEL_COUNT - 1))) % LEVEL_COUNT;
    for (let attempt = 0; attempt < 12; attempt++) {
      const route = routeTo(floor, from, fromLevel, levelPoint(random, floor, level), level);
      if (route) return route;
    }
  }
  const { x, y } = wanderTarget(random, from, fromLevel, config);
  return [{ x, y, z: levelHeight(fromLevel), level: fromLevel }];
}

export function stepWander(wanderer: Wanderer, seconds: number, random: Random, config: WanderConfig): Wanderer {
  if (wanderer.pause > 0) {
    const pause = wanderer.pause - seconds;
    if (pause > 0) return { ...wanderer, pause };
    const [target, ...route] = wanderRoute(random, wanderer, wanderer.level, config);
    const direction = facingFor(target.x - wanderer.x, target.y - wanderer.y) ?? wanderer.direction;
    return { ...wanderer, pause: 0, target, route, direction };
  }

  const { target } = wanderer;
  const dx = target.x - wanderer.x;
  const dy = target.y - wanderer.y;
  const distance = Math.hypot(dx, dy);
  const step = config.speed * seconds;
  const direction = facingFor(dx, dy) ?? wanderer.direction;
  if (step >= distance) {
    const arrived = { ...wanderer, x: target.x, y: target.y, z: target.z, level: target.level, direction };
    const [next, ...route] = wanderer.route;
    if (next) return { ...arrived, target: next, route };
    return { ...arrived, pause: config.minPause + random() * (config.maxPause - config.minPause) };
  }
  const t = step / distance;
  return {
    ...wanderer,
    x: wanderer.x + dx * t,
    y: wanderer.y + dy * t,
    z: wanderer.z + (target.z - wanderer.z) * t,
    direction,
  };
}
