import type { Point } from "../core/layout";
import { CLIPS, type Pose } from "../scene/animation";
import { LEGS, type BodyShape } from "../scene/rig";
import { FLOOR_HEIGHT, type Floor, type GridPoint, LEVEL_COUNT, stairBoxes, STAIRWELL, type StairBox, toGrid } from "../phaser/crowd";

const STAIRS: StairBox[][] = Array.from({ length: LEVEL_COUNT - 1 }, (_, level) => {
  const { lower, upper } = stairBoxes(level);
  return [...lower, ...upper];
});

const TREAD_RUN = STAIRS[0][1].v0 - STAIRS[0][0].v0;
const SMOOTHING_SAMPLES = 8;

function treadTop(level: number, { u, v }: GridPoint, z: number): number {
  const box = STAIRS[level].find((step) => u >= step.u0 && u <= step.u1 && v >= step.v0 && v <= step.v1);
  if (box) return box.top;
  const base = level * FLOOR_HEIGHT;
  return z - base < FLOOR_HEIGHT / 2 ? base : base + FLOOR_HEIGHT;
}

function inStairwell({ u, v }: GridPoint): boolean {
  return u >= 0 && u <= STAIRWELL.width && v >= STAIRWELL.back - TREAD_RUN && v <= STAIRWELL.front;
}

export function groundHeight(point: GridPoint, z: number): number {
  if (z % FLOOR_HEIGHT === 0 || !inStairwell(point)) return z;
  const level = Math.min(LEVEL_COUNT - 2, Math.max(0, Math.floor(z / FLOOR_HEIGHT)));
  let total = 0;
  for (let sample = 0; sample < SMOOTHING_SAMPLES; sample++) {
    const offset = ((sample + 0.5) / SMOOTHING_SAMPLES - 0.5) * TREAD_RUN;
    total += treadTop(level, { u: point.u, v: point.v + offset }, z);
  }
  return total / SMOOTHING_SAMPLES;
}

export function headingYaw(floor: Floor, from: Point, to: Point): number | undefined {
  const start = toGrid(floor, from);
  const end = toGrid(floor, to);
  const du = end.u - start.u;
  const dv = end.v - start.v;
  if (du === 0 && dv === 0) return undefined;
  return Math.atan2(du, dv);
}

export function turnToward(current: number, target: number, maxStep: number): number {
  const delta = Math.atan2(Math.sin(target - current), Math.cos(target - current));
  return Math.abs(delta) <= maxStep ? target : current + Math.sign(delta) * maxStep;
}

interface Clip {
  fps: number;
  poses: readonly Pose[];
}

export function clip(name: string): Clip {
  const found = CLIPS.find((candidate) => candidate.name === name);
  if (!found) throw new Error(`No ${name} clip`);
  return found;
}

export function blendPose(poses: readonly Pose[], cycle: number): Pose {
  const at = (((cycle % 1) + 1) % 1) * poses.length;
  const index = Math.floor(at);
  const t = at - index;
  const from = poses[index % poses.length];
  const to = poses[(index + 1) % poses.length];
  const pose: Pose = {};
  for (const key of new Set([...Object.keys(from), ...Object.keys(to)]) as Set<keyof Pose>) {
    pose[key] = (from[key] ?? 0) * (1 - t) + (to[key] ?? 0) * t;
  }
  return pose;
}

const THIGH_SWING = Math.max(...clip("walk").poses.map((pose) => Math.abs(pose[LEGS[0].upper] ?? 0)));

export function strideLength(shape: BodyShape): number {
  return 4 * shape.hip.y * shape.height * Math.sin(THIGH_SWING);
}
