import { describe, expect, it } from "vitest";
import { PART_CATALOG } from "../core/catalog";
import { pickCatalogCharacter } from "../core/compose";
import { createRandom } from "../core/random";
import { planCrowd } from "../crowd/plan";
import { outfitFor } from "./outfit";

describe("outfitFor", () => {
  it("turns a picked character into a tinted body and parts", () => {
    const outfit = outfitFor(PART_CATALOG, {
      parts: { body: { variant: "slim", tint: "#e0ac69" }, hat: { variant: "cap", tint: "#c0392b" } },
    });
    expect(outfit.body.spec).toMatchObject({ category: "body", id: "slim", kind: "humanoid" });
    expect(outfit.body.tint).toBe(0xe0ac69);
    expect(outfit.parts).toEqual([
      { spec: expect.objectContaining({ category: "hat", id: "cap" }), tint: 0xc0392b },
    ]);
  });

  it("rejects unknown variants", () => {
    expect(() => outfitFor(PART_CATALOG, { parts: { body: { variant: "giant", tint: "#ffffff" } } })).toThrow(
      /giant/,
    );
  });

  it("gives the same seeded crowd outfits for the same seed", () => {
    const outfits = (seed: number) =>
      planCrowd(seed, 30, (random) => outfitFor(PART_CATALOG, pickCatalogCharacter(PART_CATALOG, random))).map(
        ({ look, wanderer }) => ({ look, x: wanderer.x, y: wanderer.y, level: wanderer.level }),
      );
    expect(outfits(4)).toEqual(outfits(4));
    expect(outfits(4)).not.toEqual(outfits(5));
  });

  it("always dresses the required categories", () => {
    const random = createRandom(9);
    for (let index = 0; index < 100; index++) {
      const { parts } = outfitFor(PART_CATALOG, pickCatalogCharacter(PART_CATALOG, random));
      const categories = parts.map((part) => part.spec.category);
      for (const required of ["top", "bottom", "shoes"]) expect(categories).toContain(required);
    }
  });
});
