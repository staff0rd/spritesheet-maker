import { DEFAULT_CAPTURE_CONFIG } from "../core/config";
import type { Point } from "../core/layout";
import { toGrid, type Floor, type GridPoint } from "../phaser/crowd";

export interface WorldPoint {
  x: number;
  y: number;
  z: number;
}

const { pixelsPerUnit, elevationDegrees } = DEFAULT_CAPTURE_CONFIG;
const elevation = (elevationDegrees * Math.PI) / 180;

export function unitsPerGrid(floor: Floor): number {
  return floor.halfWidth / (pixelsPerUnit * Math.SQRT1_2);
}

export const UNITS_PER_Z = 1 / (pixelsPerUnit * Math.cos(elevation));

export function gridToWorld(floor: Floor, { u, v }: GridPoint, z = 0): WorldPoint {
  const scale = unitsPerGrid(floor);
  return { x: (u - 0.5) * scale, y: z * UNITS_PER_Z, z: (v - 0.5) * scale };
}

export function screenToWorld(floor: Floor, point: Point, z = 0): WorldPoint {
  return gridToWorld(floor, toGrid(floor, point), z);
}
