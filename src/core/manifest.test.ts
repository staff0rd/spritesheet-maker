import { describe, expect, it } from "vitest";
import { PART_CATALOG } from "./catalog";
import { DEFAULT_CAPTURE_CONFIG } from "./config";
import { computeSheetLayout } from "./layout";
import { buildManifest } from "./manifest";
import type { PartCatalog } from "./parts";

const layout = computeSheetLayout(DEFAULT_CAPTURE_CONFIG.frameSize, DEFAULT_CAPTURE_CONFIG.directions, 1);

const order = ["body", "top"] as const;
const catalog: PartCatalog = {
  baseCategory: "body",
  categories: [
    {
      id: "body",
      tintGroup: "skin",
      optional: false,
      variants: [
        { id: "slim", kind: "humanoid", params: {} },
        { id: "broad", kind: "humanoid", params: {} },
      ],
    },
    { id: "top", tintGroup: "cloth", optional: true, variants: [{ id: "tshirt", kind: "shirt", params: {} }] },
  ],
  drawOrder: { N: order, NE: order, E: order, SE: order, S: order, SW: order, W: order, NW: order },
};

describe("buildManifest", () => {
  it("describes the sheet, directions, animations, categories and draw order", () => {
    const manifest = buildManifest({ config: DEFAULT_CAPTURE_CONFIG, layout, animations: { idle: { frames: [0], fps: 3 } }, catalog });

    expect(manifest).toEqual({
      version: 1,
      seed: 1,
      frameSize: { width: 64, height: 96 },
      anchor: { x: 32, y: 88 },
      sheetSize: { width: 64, height: 768 },
      directions: ["N", "NE", "E", "SE", "S", "SW", "W", "NW"],
      directionRows: { N: 0, NE: 1, E: 2, SE: 3, S: 4, SW: 5, W: 6, NW: 7 },
      animations: { idle: { frames: [0], fps: 3 } },
      baseCategory: "body",
      categories: {
        body: {
          tintGroup: "skin",
          optional: false,
          variants: [
            { id: "slim", files: { slim: "body/slim.png" } },
            { id: "broad", files: { broad: "body/broad.png" } },
          ],
        },
        top: {
          tintGroup: "cloth",
          optional: true,
          variants: [{ id: "tshirt", files: { slim: "top/tshirt.slim.png", broad: "top/tshirt.broad.png" } }],
        },
      },
      drawOrder: Object.fromEntries(["N", "NE", "E", "SE", "S", "SW", "W", "NW"].map((direction) => [direction, ["body", "top"]])),
    });
  });

  it("assigns tint groups to every category in the default catalog", () => {
    const manifest = buildManifest({
      config: DEFAULT_CAPTURE_CONFIG,
      layout,
      animations: { idle: { frames: [0], fps: 3 } },
      catalog: PART_CATALOG,
    });

    expect(Object.fromEntries(Object.entries(manifest.categories).map(([id, category]) => [id, category.tintGroup]))).toEqual({
      body: "skin",
      hair: "hair",
      top: "cloth",
      bottom: "cloth",
      shoes: "cloth",
      hat: "cloth",
    });
  });

  it("is identical for the same seed and catalog", () => {
    const build = () =>
      JSON.stringify(
        buildManifest({ config: DEFAULT_CAPTURE_CONFIG, layout, animations: { idle: { frames: [0], fps: 3 } }, catalog: PART_CATALOG }),
      );

    expect(build()).toBe(build());
  });

  it("round-trips through JSON unchanged", () => {
    const manifest = buildManifest({ config: DEFAULT_CAPTURE_CONFIG, layout, animations: { idle: { frames: [0], fps: 3 } }, catalog });

    expect(JSON.parse(JSON.stringify(manifest))).toEqual(manifest);
  });

  it("rejects animation frames outside the sheet columns", () => {
    expect(() =>
      buildManifest({ config: DEFAULT_CAPTURE_CONFIG, layout, animations: { walk: { frames: [0, 1], fps: 8 } }, catalog }),
    ).toThrow(/walk/);
  });

  it("rejects animations without a positive fps", () => {
    expect(() =>
      buildManifest({ config: DEFAULT_CAPTURE_CONFIG, layout, animations: { idle: { frames: [0], fps: 0 } }, catalog }),
    ).toThrow(/fps/);
  });
});
