import { DIRECTIONS, type Direction } from "./directions";
import type { Point, Size } from "./layout";

export interface CaptureConfig {
  seed: number;
  frameSize: Size;
  anchor: Point;
  pixelsPerUnit: number;
  elevationDegrees: number;
  directions: readonly Direction[];
}

export const DEFAULT_CAPTURE_CONFIG: CaptureConfig = {
  seed: 1,
  frameSize: { width: 64, height: 96 },
  anchor: { x: 32, y: 88 },
  pixelsPerUnit: 40,
  elevationDegrees: 30,
  directions: DIRECTIONS,
};
