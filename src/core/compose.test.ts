import { describe, expect, it } from "vitest";
import { PART_CATALOG } from "./catalog";
import { layersFor, PALETTES, pickCharacter, type Character } from "./compose";
import { DEFAULT_CAPTURE_CONFIG } from "./config";
import { computeSheetLayout } from "./layout";
import { buildManifest } from "./manifest";
import { createRandom, type Random } from "./random";

const manifest = buildManifest({
  config: DEFAULT_CAPTURE_CONFIG,
  layout: computeSheetLayout(DEFAULT_CAPTURE_CONFIG.frameSize, DEFAULT_CAPTURE_CONFIG.directions, 1),
  animations: { idle: { frames: [0], fps: 3 } },
  catalog: PART_CATALOG,
});

function sequence(...values: number[]): Random {
  let index = 0;
  return () => values[index++ % values.length];
}

describe("pickCharacter", () => {
  it("is deterministic for a seed", () => {
    const crowd = (seed: number) => {
      const random = createRandom(seed);
      return Array.from({ length: 20 }, () => pickCharacter(manifest, random));
    };

    expect(crowd(7)).toEqual(crowd(7));
    expect(crowd(7)).not.toEqual(crowd(8));
  });

  it("always includes required categories and only picks known variants and palette tints", () => {
    const random = createRandom(3);
    for (let index = 0; index < 200; index++) {
      const character = pickCharacter(manifest, random);
      for (const [id, category] of Object.entries(manifest.categories)) {
        const part = character.parts[id as keyof Character["parts"]];
        if (!category!.optional) expect(part).toBeDefined();
        if (!part) continue;
        expect(category!.variants.map((variant) => variant.id)).toContain(part.variant);
        expect(PALETTES[category!.tintGroup]).toContain(part.tint);
      }
    }
  });

  it("omits optional categories when the roll misses", () => {
    const character = pickCharacter(manifest, sequence(0.999));

    expect(Object.keys(character.parts).sort()).toEqual(["body", "bottom", "shoes", "top"]);
  });

  it("produces a diverse crowd", () => {
    const random = createRandom(1);
    const crowd = Array.from({ length: 100 }, () => JSON.stringify(pickCharacter(manifest, random)));

    expect(new Set(crowd).size).toBe(100);
  });
});

describe("layersFor", () => {
  const character: Character = {
    parts: {
      body: { variant: "broad", tint: "#8d5524" },
      hair: { variant: "long", tint: "#1b1612" },
      top: { variant: "hoodie", tint: "#2e86c1" },
      bottom: { variant: "skirt", tint: "#2b2b2b" },
      shoes: { variant: "boots", tint: "#8b5a2b" },
    },
  };

  it("stacks layers in the manifest draw order, skipping absent categories", () => {
    expect(layersFor(manifest, character, "SE").map((layer) => layer.category)).toEqual([
      "body",
      "shoes",
      "bottom",
      "hair",
      "top",
    ]);
    expect(layersFor(manifest, character, "NW").map((layer) => layer.category)).toEqual([
      "body",
      "shoes",
      "bottom",
      "top",
      "hair",
    ]);
  });

  it("uses the sheet fitted to the picked body and carries each tint", () => {
    expect(layersFor(manifest, character, "SW")).toEqual([
      { category: "body", file: "body/broad.png", tint: "#8d5524" },
      { category: "shoes", file: "shoes/boots.broad.png", tint: "#8b5a2b" },
      { category: "bottom", file: "bottom/skirt.broad.png", tint: "#2b2b2b" },
      { category: "hair", file: "hair/long.broad.png", tint: "#1b1612" },
      { category: "top", file: "top/hoodie.broad.png", tint: "#2e86c1" },
    ]);
  });

  it("uses the normal hair sheet when the character has no hat", () => {
    expect(layersFor(manifest, character, "SE").find((layer) => layer.category === "hair")?.file).toBe("hair/long.broad.png");
  });

  it("uses the hatted hair sheet when the character has a hat", () => {
    const hatted: Character = { parts: { ...character.parts, hat: { variant: "tophat", tint: "#2b2b2b" } } };

    expect(layersFor(manifest, hatted, "NW")).toEqual([
      { category: "body", file: "body/broad.png", tint: "#8d5524" },
      { category: "shoes", file: "shoes/boots.broad.png", tint: "#8b5a2b" },
      { category: "bottom", file: "bottom/skirt.broad.png", tint: "#2b2b2b" },
      { category: "top", file: "top/hoodie.broad.png", tint: "#2e86c1" },
      { category: "hair", file: "hair/long.broad.hatted.png", tint: "#1b1612" },
      { category: "hat", file: "hat/tophat.broad.png", tint: "#2b2b2b" },
    ]);
  });

  it("rejects variants missing from the manifest", () => {
    const unknown: Character = { parts: { ...character.parts, hat: { variant: "crown", tint: "#f1c40f" } } };

    expect(() => layersFor(manifest, unknown, "NE")).toThrow(/crown/);
  });
});
