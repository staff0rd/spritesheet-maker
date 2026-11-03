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

export interface GridBox {
  u0: number;
  u1: number;
  v0: number;
  v1: number;
}

export const PILLAR_SIZE = 0.01;
const PILLAR_CLEARANCE = 0.015;

export function pillars(level: number): GridBox[] {
  if (level >= LEVEL_COUNT - 1) return [];
  const far = UPPER_SIZE - PILLAR_SIZE;
  return [
    { u: 0, v: 0 },
    { u: far, v: 0 },
    { u: 0, v: far },
    { u: far, v: far },
  ].map(({ u, v }) => ({ u0: u, u1: u + PILLAR_SIZE, v0: v, v1: v + PILLAR_SIZE }));
}

export function pillarDepth(floor: Floor, level: number, { u1, v1 }: GridBox): number {
  return depthFor(level, toScreen(floor, { u: u1, v: v1 }).y);
}

function obstacles(level: number): GridBox[] {
  const blocked = pillars(level).map(({ u0, u1, v0, v1 }) => ({
    u0: u0 - PILLAR_CLEARANCE,
    u1: u1 + PILLAR_CLEARANCE,
    v0: v0 - PILLAR_CLEARANCE,
    v1: v1 + PILLAR_CLEARANCE,
  }));
  if (level > 0) return blocked;
  return [{ u0: -Infinity, u1: STAIRWELL.width, v0: STAIRWELL.back, v1: STAIRWELL.front }, ...blocked];
}

export function onLevel(floor: Floor, level: number, point: Point): boolean {
  const { u, v } = toGrid(floor, point);
  const epsilon = 1e-9;
  if (u < -epsilon || v < -epsilon || u > 1 + epsilon || v > 1 + epsilon) return false;
  if (level > 0 && (u > UPPER_SIZE + epsilon || v > UPPER_SIZE + epsilon)) return false;
  return !obstacles(level).some((box) => u >= box.u0 && u <= box.u1 && v >= box.v0 && v <= box.v1);
}

export function pickLevel(random: Random): number {
  const upperArea = UPPER_SIZE * UPPER_SIZE;
  const ticket = random() * (1 + (LEVEL_COUNT - 1) * upperArea);
  return ticket < 1 ? 0 : Math.min(LEVEL_COUNT - 1, 1 + Math.floor((ticket - 1) / upperArea));
}

export function levelPoint(random: Random, floor: Floor, level: number): Point {
  for (;;) {
    const point =
      level > 0
        ? toScreen(floor, { u: random() * UPPER_SIZE, v: random() * UPPER_SIZE })
        : diamondPoint(random, floor.halfWidth, floor.halfHeight);
    if (onLevel(floor, level, point)) return point;
  }
}

function segmentHits(a: GridPoint, b: GridPoint, box: GridBox): boolean {
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
  return clip(a.u, b.u - a.u, box.u0, box.u1) && clip(a.v, b.v - a.v, box.v0, box.v1);
}

export function pathClear(floor: Floor, level: number, from: Point, to: Point): boolean {
  const a = toGrid(floor, from);
  const b = toGrid(floor, to);
  return !obstacles(level).some((box) => segmentHits(a, b, box));
}

export interface StairBox {
  u0: number;
  u1: number;
  v0: number;
  v1: number;
  bottom: number;
  top: number;
}

export function stairBoxes(level: number): { lower: StairBox[]; upper: StairBox[] } {
  const { width, back, turn, front } = STAIRWELL;
  const base = levelHeight(level);
  const half = FLOOR_HEIGHT / 2;
  const rise = half / (STEPS_PER_FLIGHT + 1);
  const run = (turn - back) / STEPS_PER_FLIGHT;
  const box = (u0: number, u1: number, v0: number, top: number, length: number, floor: number): StairBox => ({
    u0,
    u1,
    v0,
    v1: v0 + length,
    bottom: Math.max(floor, top - 2 * rise),
    top,
  });
  const steps = Array.from({ length: STEPS_PER_FLIGHT }, (_, index) => index);
  return {
    lower: steps.map((index) => box(0, width / 2, back + index * run, base + (index + 1) * rise, run, base)),
    upper: [
      ...[...steps]
        .reverse()
        .map((index) =>
          box(width / 2, width, turn - (index + 1) * run, base + half + (index + 1) * rise, run, base + half),
        ),
      box(0, width, turn, base + half, front - turn, base),
    ],
  };
}

export function upperFlightDepth(floor: Floor, level: number): number {
  return stairDepth(floor, level) + 2;
}

export interface RailPoint extends GridPoint {
  z: number;
}

export function stairRails(level: number): { back: RailPoint[]; inner: RailPoint[]; front: RailPoint[] } {
  const { width, back, turn, front } = STAIRWELL;
  const base = levelHeight(level);
  const landing = base + FLOOR_HEIGHT / 2;
  const corner = { u: 0, v: front, z: landing };
  return {
    inner: [
      { u: width / 2, v: turn, z: landing },
      { u: width / 2, v: back, z: base + FLOOR_HEIGHT },
    ],
    back: [{ u: 0, v: back, z: base }, { u: 0, v: turn, z: landing }, corner],
    front: [
      corner,
      { u: width, v: front, z: landing },
      { u: width, v: turn, z: landing },
      { u: width, v: back, z: base + FLOOR_HEIGHT },
    ],
  };
}

export function frontRailDepth(floor: Floor, level: number): number {
  return depthFor(level + 1, toScreen(floor, { u: STAIRWELL.width, v: STAIRWELL.front }).y);
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
    [{ u: width / 4, v: (turn + front) / 2 }, landing, level, level],
    [{ u: (3 * width) / 4, v: (turn + front) / 2 }, landing, level, level],
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

const cross = (a: Point, b: Point): number => a.x * b.y - a.y * b.x;

export function headingTurns(from: Point, to: Point): Point[][] {
  const d = { x: to.x - from.x, y: to.y - from.y };
  const size = Math.hypot(d.x, d.y);
  if (size === 0) return [[]];
  const headings = DIRECTIONS.map((direction) => SCREEN_HEADINGS[direction]);
  for (let index = 0; index < headings.length; index++) {
    const first = headings[index];
    const second = headings[(index + 1) % headings.length];
    const det = cross(first, second);
    const a = cross(d, second) / det;
    const b = cross(first, d) / det;
    if (a < -1e-9 || b < -1e-9) continue;
    const tolerance = 1e-9 * size;
    if (Math.abs(a * Math.hypot(first.x, first.y)) <= tolerance || Math.abs(b * Math.hypot(second.x, second.y)) <= tolerance) {
      return [[]];
    }
    return [
      [{ x: from.x + a * first.x, y: from.y + a * first.y }],
      [{ x: from.x + b * second.x, y: from.y + b * second.y }],
    ];
  }
  return [[]];
}

function snappedLeg(floor: Floor, level: number, from: Point, to: Point): Waypoint[] | undefined {
  for (const turn of headingTurns(from, to)) {
    const points = [from, ...turn, to];
    const clear = points.slice(1).every((point, index) => pathClear(floor, level, points[index], point));
    if (clear && turn.every((point) => onLevel(floor, level, point))) {
      return turn.map((point) => ({ ...point, z: levelHeight(level), level }));
    }
  }
  return undefined;
}

function levelLeg(floor: Floor, level: number, from: Point, to: Point): Waypoint[] | undefined {
  const direct = snappedLeg(floor, level, from, to);
  if (direct) return direct;
  const corner = toScreen(floor, { u: STAIRWELL.width + STAIR_DOOR, v: STAIRWELL.back - STAIR_DOOR });
  const toCorner = snappedLeg(floor, level, from, corner);
  const fromCorner = snappedLeg(floor, level, corner, to);
  if (!toCorner || !fromCorner) return undefined;
  return [...toCorner, { ...corner, z: levelHeight(level), level }, ...fromCorner];
}

export function walkerDepth(floor: Floor, { y, z, level }: Pick<Wanderer, "y" | "z" | "level">): number {
  const depth = depthFor(level, y);
  const base = levelHeight(level);
  if (z === base) return depth;
  if (z >= base + FLOOR_HEIGHT / 2) return Math.max(depth, upperFlightDepth(floor, level) + 1);
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
  for (let attempt = 0; attempt < 12; attempt++) {
    const route = routeTo(floor, from, fromLevel, wanderTarget(random, from, fromLevel, config), fromLevel);
    if (route) return route;
  }
  return [{ x: from.x, y: from.y, z: levelHeight(fromLevel), level: fromLevel }];
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
