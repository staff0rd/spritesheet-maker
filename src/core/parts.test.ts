import { describe, expect, it } from "vitest";
import { PART_CATALOG } from "./catalog";
import { DIRECTIONS } from "./directions";
import { partRandom, planSheets, validateCatalog, type PartCatalog } from "./parts";

describe("PART_CATALOG", () => {
  it("is valid", () => {
    expect(() => validateCatalog(PART_CATALOG, DIRECTIONS)).not.toThrow();
  });

  it("offers several variants per category", () => {
    for (const category of PART_CATALOG.categories) {
      expect(category.variants.length, category.id).toBeGreaterThanOrEqual(2);
    }
  });

  it("draws hair behind the top when facing the camera and over it when facing away", () => {
    const { drawOrder } = PART_CATALOG;
    for (const direction of ["SE", "SW"] as const) {
      expect(drawOrder[direction].indexOf("hair")).toBeLessThan(drawOrder[direction].indexOf("top"));
    }
    for (const direction of ["NE", "NW"] as const) {
      expect(drawOrder[direction].indexOf("hair")).toBeGreaterThan(drawOrder[direction].indexOf("top"));
    }
  });
});

describe("validateCatalog", () => {
  const order = ["body", "hat"] as const;
  const valid: PartCatalog = {
    baseCategory: "body",
    categories: [
      { id: "body", tintGroup: "skin", optional: false, variants: [{ id: "average", kind: "humanoid", params: {} }] },
      { id: "hat", tintGroup: "cloth", optional: true, variants: [{ id: "cap", kind: "baseball-cap", params: {} }] },
    ],
    drawOrder: { NE: order, SE: order, SW: order, NW: order },
  };

  it.each<[string, PartCatalog]>([
    ["a missing base category", { ...valid, baseCategory: "top" }],
    ["an optional base category", { ...valid, categories: [{ ...valid.categories[0], optional: true }, valid.categories[1]] }],
    ["an empty category", { ...valid, categories: [valid.categories[0], { ...valid.categories[1], variants: [] }] }],
    [
      "duplicate variant ids",
      { ...valid, categories: [valid.categories[0], { ...valid.categories[1], variants: [...valid.categories[1].variants, ...valid.categories[1].variants] }] },
    ],
    ["a non kebab-case variant id", { ...valid, categories: [valid.categories[0], { ...valid.categories[1], variants: [{ id: "Top Hat", kind: "brimmed", params: {} }] }] }],
    ["a draw order missing a category", { ...valid, drawOrder: { ...valid.drawOrder, SE: ["body"] } }],
    ["a draw order not starting with the base", { ...valid, drawOrder: { ...valid.drawOrder, NW: ["hat", "body"] } }],
  ])("rejects %s", (_, catalog) => {
    expect(() => validateCatalog(catalog, DIRECTIONS)).toThrow();
  });
});

describe("planSheets", () => {
  const jobs = planSheets(PART_CATALOG);
  const bodies = PART_CATALOG.categories[0].variants.map((variant) => variant.id);

  it("renders each body once and every other variant once per body", () => {
    const expected = PART_CATALOG.categories.reduce(
      (total, category) =>
        total + category.variants.length * (category.id === "body" ? 1 : bodies.length * (category.hatted ? 2 : 1)),
      0,
    );
    expect(jobs).toHaveLength(expected);
    expect(new Set(jobs.map((job) => job.file)).size).toBe(jobs.length);
  });

  it("renders body sheets in colour and other parts over a depth-only body", () => {
    for (const job of jobs) {
      expect(job.body.category).toBe("body");
      expect(job.body.id).toBe(job.bodyVariant);
      if (job.category === "body") expect(job.part).toBeUndefined();
      else expect(job.part).toMatchObject({ category: job.category, id: job.variant });
    }
  });

  it("names files by category, variant and body", () => {
    expect(jobs.map((job) => job.file)).toContain("body/slim.png");
    expect(jobs.map((job) => job.file)).toContain("hat/tophat.broad.png");
  });

  it("renders a hatted sheet per body for every hair variant", () => {
    const hatted = jobs.filter((job) => job.part?.hatted);
    const hair = PART_CATALOG.categories.find((category) => category.id === "hair")!;

    expect(hatted.map((job) => job.file).sort()).toEqual(
      hair.variants.flatMap((variant) => bodies.map((body) => `hair/${variant.id}.${body}.hatted.png`)).sort(),
    );
  });
});

describe("partRandom", () => {
  const spec = { category: "hair", id: "spiky", kind: "spiky", params: {} } as const;
  const sample = (seed: number) => {
    const random = partRandom(seed, spec);
    return Array.from({ length: 5 }, random);
  };

  it("is deterministic for a seed and part", () => {
    expect(sample(1)).toEqual(sample(1));
  });

  it("differs between seeds and between parts", () => {
    expect(sample(1)).not.toEqual(sample(2));
    expect(Array.from({ length: 5 }, partRandom(1, { ...spec, id: "other" }))).not.toEqual(sample(1));
  });

  it("produces values in [0, 1)", () => {
    for (const value of Array.from({ length: 1000 }, partRandom(7, spec))) {
      expect(value).toBeGreaterThanOrEqual(0);
      expect(value).toBeLessThan(1);
    }
  });
});
