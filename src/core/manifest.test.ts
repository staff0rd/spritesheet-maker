import { describe, expect, it } from "vitest";
import { DEFAULT_CAPTURE_CONFIG } from "./config";
import { computeSheetLayout } from "./layout";
import { buildManifest } from "./manifest";

const layout = computeSheetLayout(DEFAULT_CAPTURE_CONFIG.frameSize, DEFAULT_CAPTURE_CONFIG.directions, 1);

describe("buildManifest", () => {
  it("describes the sheet, directions, animations and categories", () => {
    const manifest = buildManifest({
      config: DEFAULT_CAPTURE_CONFIG,
      layout,
      animations: { idle: { frames: [0] } },
      categories: { body: [{ id: "body", file: "body.png" }] },
    });

    expect(manifest).toEqual({
      version: 1,
      seed: 1,
      frameSize: { width: 64, height: 96 },
      anchor: { x: 32, y: 88 },
      sheetSize: { width: 64, height: 384 },
      directions: ["NE", "SE", "SW", "NW"],
      directionRows: { NE: 0, SE: 1, SW: 2, NW: 3 },
      animations: { idle: { frames: [0] } },
      categories: { body: { variants: [{ id: "body", file: "body.png" }] } },
    });
  });

  it("round-trips through JSON unchanged", () => {
    const manifest = buildManifest({
      config: DEFAULT_CAPTURE_CONFIG,
      layout,
      animations: { idle: { frames: [0] } },
      categories: { body: [{ id: "body", file: "body.png" }] },
    });

    expect(JSON.parse(JSON.stringify(manifest))).toEqual(manifest);
  });

  it("rejects animation frames outside the sheet columns", () => {
    expect(() =>
      buildManifest({
        config: DEFAULT_CAPTURE_CONFIG,
        layout,
        animations: { walk: { frames: [0, 1] } },
        categories: {},
      }),
    ).toThrow(/walk/);
  });
});
