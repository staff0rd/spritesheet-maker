import type { Direction } from "../core/directions";
import type { Point } from "../core/layout";
import type { Manifest } from "../core/manifest";
import type { Random } from "../core/random";

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
