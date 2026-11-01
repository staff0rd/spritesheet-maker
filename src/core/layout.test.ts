import { describe, expect, it } from "vitest";
import { DIRECTIONS, facingYaw } from "./directions";
import { computeSheetLayout } from "./layout";

describe("DIRECTIONS", () => {
  it("orders directions clockwise starting at NE", () => {
    expect(DIRECTIONS).toEqual(["NE", "SE", "SW", "NW"]);
  });

  it("assigns each direction a distinct quarter-turn yaw", () => {
    const yaws = DIRECTIONS.map(facingYaw);
    expect(new Set(yaws).size).toBe(4);
    for (const [index, yaw] of yaws.entries()) {
      const next = yaws[(index + 1) % yaws.length];
      const delta = (((yaw - next) % (2 * Math.PI)) + 2 * Math.PI) % (2 * Math.PI);
      expect(delta).toBeCloseTo(Math.PI / 2);
    }
  });
});

describe("computeSheetLayout", () => {
  const frameSize = { width: 64, height: 96 };

  it("places one row per direction and one column per frame", () => {
    const layout = computeSheetLayout(frameSize, DIRECTIONS, 3);

    expect(layout.columns).toBe(3);
    expect(layout.rows).toBe(4);
    expect(layout.sheetSize).toEqual({ width: 192, height: 384 });
    expect(layout.frames).toHaveLength(12);
  });

  it("computes frame rects in row-major order", () => {
    const layout = computeSheetLayout(frameSize, DIRECTIONS, 3);

    expect(layout.frames[0]).toEqual({ index: 0, direction: "NE", frame: 0, x: 0, y: 0, width: 64, height: 96 });
    expect(layout.frames[5]).toEqual({ index: 5, direction: "SE", frame: 2, x: 128, y: 96, width: 64, height: 96 });
    expect(layout.frames[11]).toEqual({ index: 11, direction: "NW", frame: 2, x: 128, y: 288, width: 64, height: 96 });
  });

  it("follows the given direction order", () => {
    const layout = computeSheetLayout(frameSize, ["SW", "NE"], 1);

    expect(layout.frames.map((rect) => [rect.direction, rect.y])).toEqual([
      ["SW", 0],
      ["NE", 96],
    ]);
  });

  it("tiles the sheet without gaps or overlaps", () => {
    const layout = computeSheetLayout(frameSize, DIRECTIONS, 4);
    const covered = new Set(layout.frames.map((rect) => `${rect.x},${rect.y}`));

    expect(covered.size).toBe(layout.frames.length);
    for (const rect of layout.frames) {
      expect(rect.x + rect.width).toBeLessThanOrEqual(layout.sheetSize.width);
      expect(rect.y + rect.height).toBeLessThanOrEqual(layout.sheetSize.height);
    }
  });

  it.each([
    ["no directions", [], 1],
    ["duplicate directions", ["NE", "NE"], 1],
    ["zero frames", DIRECTIONS, 0],
    ["fractional frames", DIRECTIONS, 1.5],
  ] as const)("rejects %s", (_, directions, frames) => {
    expect(() => computeSheetLayout(frameSize, directions, frames)).toThrow();
  });

  it("rejects an empty frame size", () => {
    expect(() => computeSheetLayout({ width: 0, height: 96 }, DIRECTIONS, 1)).toThrow();
  });
});
