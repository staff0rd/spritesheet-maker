import type { Direction } from "./directions";

export interface Size {
  width: number;
  height: number;
}

export interface Point {
  x: number;
  y: number;
}

interface FrameRect extends Point, Size {
  index: number;
  direction: Direction;
  frame: number;
}

export interface SheetLayout {
  frameSize: Size;
  columns: number;
  rows: number;
  sheetSize: Size;
  frames: FrameRect[];
}

export function computeSheetLayout(
  frameSize: Size,
  directions: readonly Direction[],
  framesPerDirection: number,
): SheetLayout {
  if (directions.length === 0) throw new Error("At least one direction is required");
  if (new Set(directions).size !== directions.length) throw new Error("Directions must be unique");
  if (!Number.isInteger(framesPerDirection) || framesPerDirection < 1) {
    throw new Error("framesPerDirection must be a positive integer");
  }
  if (frameSize.width < 1 || frameSize.height < 1) throw new Error("Frame size must be positive");

  const columns = framesPerDirection;
  const rows = directions.length;
  const frames = directions.flatMap((direction, row) =>
    Array.from({ length: columns }, (_, frame) => ({
      index: row * columns + frame,
      direction,
      frame,
      x: frame * frameSize.width,
      y: row * frameSize.height,
      width: frameSize.width,
      height: frameSize.height,
    })),
  );

  return {
    frameSize: { ...frameSize },
    columns,
    rows,
    sheetSize: { width: columns * frameSize.width, height: rows * frameSize.height },
    frames,
  };
}
