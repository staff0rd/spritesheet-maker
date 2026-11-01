import { describe, expect, it } from "vitest";
import { PART_CATALOG } from "../core/catalog";
import { DEFAULT_CAPTURE_CONFIG } from "../core/config";
import { computeSheetLayout } from "../core/layout";
import { buildManifest } from "../core/manifest";
import { createRandom } from "../core/random";
import { animationFrame, diamondPoint, frameIndex, sheetColumns, tintColor } from "./crowd";

const manifest = buildManifest({
  config: DEFAULT_CAPTURE_CONFIG,
  layout: computeSheetLayout(DEFAULT_CAPTURE_CONFIG.frameSize, DEFAULT_CAPTURE_CONFIG.directions, 12),
  animations: { walk: { frames: [6, 7, 8, 9, 10, 11], fps: 8 } },
  catalog: PART_CATALOG,
});

describe("frameIndex", () => {
  it("offsets the animation frame by the direction's row", () => {
    const columns = sheetColumns(manifest);
    expect(columns).toBe(12);
    for (const direction of manifest.directions) {
      expect(frameIndex(manifest, direction, 7)).toBe(manifest.directionRows[direction] * columns + 7);
    }
  });
});

describe("animationFrame", () => {
  const frames = [6, 7, 8, 9];

  it("advances one frame per 1/fps seconds and loops", () => {
    expect([0, 0.1, 0.25, 0.5, 0.75, 1].map((seconds) => animationFrame(frames, 4, seconds, 0))).toEqual([
      6, 6, 7, 8, 9, 6,
    ]);
  });

  it("offsets the cycle by phase", () => {
    expect(animationFrame(frames, 4, 0, 0.5)).toBe(8);
    expect(animationFrame(frames, 4, 0.5, 0.5)).toBe(6);
  });
});

describe("tintColor", () => {
  it("parses #rrggbb to a number", () => {
    expect(tintColor("#c0392b")).toBe(0xc0392b);
  });

  it("rejects other formats", () => {
    expect(() => tintColor("red")).toThrow();
  });
});

describe("diamondPoint", () => {
  it("stays inside the diamond", () => {
    const random = createRandom(3);
    for (let index = 0; index < 500; index++) {
      const { x, y } = diamondPoint(random, 400, 200);
      expect(Math.abs(x) / 400 + Math.abs(y) / 200).toBeLessThanOrEqual(1 + 1e-9);
    }
  });

  it("reaches the corners", () => {
    const corner = (u: number, v: number) => {
      const values = [u, v];
      return diamondPoint(() => values.shift()!, 400, 200);
    };
    expect(corner(1, 0)).toEqual({ x: 400, y: 0 });
    expect(corner(0, 0)).toEqual({ x: 0, y: -200 });
    expect(corner(1, 1)).toEqual({ x: 0, y: 200 });
  });
});
