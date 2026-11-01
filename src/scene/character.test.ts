import { type Material, Mesh, type Object3D } from "three";
import { describe, expect, it } from "vitest";
import { PART_CATALOG } from "../core/catalog";
import { planSheets, type PartSpec } from "../core/parts";
import { buildCharacter } from "./character";
import { proceduralProvider } from "./parts/procedural";

function meshes(root: Object3D): Mesh[] {
  const found: Mesh[] = [];
  root.updateMatrixWorld(true);
  root.traverse((object) => {
    if (object instanceof Mesh) found.push(object);
  });
  return found;
}

function snapshot(root: Object3D): number[] {
  return meshes(root).flatMap((mesh) => [
    ...mesh.matrixWorld.elements,
    ...(mesh.geometry.getAttribute("position").array as Float32Array),
  ]);
}

function layerMaterials(root: Object3D, layer: string): Material[] {
  return meshes(root)
    .filter((mesh) => mesh.userData.layer === layer)
    .flatMap((mesh) => [mesh.material].flat());
}

const jobs = planSheets(PART_CATALOG);
const body = jobs[0].body;
const spiky: PartSpec = { category: "hair", id: "spiky", kind: "spiky", params: {} };

describe("proceduralProvider", () => {
  it("supports every catalog variant", () => {
    for (const category of PART_CATALOG.categories) {
      for (const variant of category.variants) {
        expect(proceduralProvider.canBuild({ ...variant, category: category.id }), `${category.id}/${variant.id}`).toBe(true);
      }
    }
  });

  it("rejects unknown params", () => {
    expect(() => buildCharacter(proceduralProvider, { seed: 1, body, part: { ...spiky, params: { colour: 3 } } })).toThrow(/colour/);
  });
});

describe("buildCharacter", () => {
  it.each(jobs.map((job) => [job.file, job] as const))("builds %s", (_, job) => {
    const character = buildCharacter(proceduralProvider, { seed: 1, body: job.body, part: job.part }).root;
    expect(meshes(character).filter((mesh) => mesh.userData.layer === job.category).length).toBeGreaterThan(0);
  });

  it("draws the body in colour when rendering the body layer", () => {
    const character = buildCharacter(proceduralProvider, { seed: 1, body }).root;
    expect(layerMaterials(character, "body").every((material) => material.colorWrite)).toBe(true);
  });

  it("draws the body depth-only, before the part, when rendering another layer", () => {
    const character = buildCharacter(proceduralProvider, { seed: 1, body, part: spiky }).root;
    const bodyMeshes = meshes(character).filter((mesh) => mesh.userData.layer === "body");

    expect(layerMaterials(character, "body").every((material) => !material.colorWrite && material.depthWrite)).toBe(true);
    expect(bodyMeshes.every((mesh) => mesh.renderOrder < 0)).toBe(true);
    expect(layerMaterials(character, "hair").every((material) => material.colorWrite)).toBe(true);
  });

  it("leaves the front layer out of the main sheet", () => {
    const long = jobs.find((job) => job.part?.id === "long")!.part!;
    const character = buildCharacter(proceduralProvider, { seed: 1, body, part: long }).root;

    expect(meshes(character).some((mesh) => mesh.userData.layer === "hair.front")).toBe(false);
    expect(layerMaterials(character, "hair").every((material) => material.colorWrite)).toBe(true);
  });

  it("paints only the front layer in a front sheet, over a depth-only body and main layer", () => {
    const long = jobs.find((job) => job.part?.id === "long")!.part!;
    const character = buildCharacter(proceduralProvider, { seed: 1, body, part: long, front: true }).root;
    const hidden = meshes(character).filter((mesh) => mesh.userData.layer !== "hair.front");

    expect(layerMaterials(character, "hair.front").length).toBeGreaterThan(0);
    expect(layerMaterials(character, "hair.front").every((material) => material.colorWrite)).toBe(true);
    expect(hidden.flatMap((mesh) => [mesh.material].flat()).every((material) => !material.colorWrite && material.depthWrite)).toBe(true);
    expect(hidden.every((mesh) => mesh.renderOrder < 0)).toBe(true);
  });

  it("rejects a front sheet for a part without a front layer", () => {
    expect(() => buildCharacter(proceduralProvider, { seed: 1, body, part: spiky, front: true })).toThrow(/front/);
  });

  it("only emits a front layer from variants marked front", () => {
    for (const job of jobs.filter((candidate) => candidate.part && !candidate.part.front)) {
      expect(() => buildCharacter(proceduralProvider, { seed: 1, body: job.body, part: job.part }), job.file).not.toThrow();
    }
    const unmarked = { ...jobs.find((job) => job.part?.id === "long")!.part!, front: false };
    expect(() => buildCharacter(proceduralProvider, { seed: 1, body, part: unmarked })).toThrow(/front/);
  });

  it("is deterministic for a fixed seed", () => {
    for (const job of jobs) {
      const build = () => snapshot(buildCharacter(proceduralProvider, { seed: 1, body: job.body, part: job.part }).root);
      expect(build(), job.file).toEqual(build());
    }
  });

  it("varies seeded parts with the seed", () => {
    const build = (seed: number) => snapshot(buildCharacter(proceduralProvider, { seed, body, part: spiky }).root);
    expect(build(1)).not.toEqual(build(2));
  });
});
