import { createHash } from "node:crypto";
import { type LatheGeometry, Mesh, type MeshLambertMaterial, type Object3D } from "three";
import { describe, expect, it } from "vitest";
import { PART_CATALOG } from "../core/catalog";
import { planSheets } from "../core/parts";
import { buildCharacter } from "./character";
import { proceduralProvider } from "./parts/procedural";

const BLOCKY_GEOMETRY_HASH = "bf2f0b5f88f540e1f038424d8e21d80d5ef080f3c2241eee7adac6d40f9a3e8d";

function meshes(root: Object3D): Mesh[] {
  const found: Mesh[] = [];
  root.updateMatrixWorld(true);
  root.traverse((object) => {
    if (object instanceof Mesh) found.push(object);
  });
  return found;
}

function geometryHash(roots: Object3D[]): string {
  const hash = createHash("sha256");
  for (const mesh of roots.flatMap(meshes)) {
    hash.update(`${mesh.name}|${(mesh.material as MeshLambertMaterial).flatShading}|${mesh.matrixWorld.elements.join(",")}`);
    for (const [name, attribute] of Object.entries(mesh.geometry.attributes)) hash.update(`${name}:${Array.from(attribute.array).join(",")}`);
    hash.update(`index:${mesh.geometry.index ? Array.from(mesh.geometry.index.array).join(",") : ""}`);
  }
  return hash.digest("hex");
}

const jobs = planSheets(PART_CATALOG);
const body = jobs[0].body;

describe("render style", () => {
  it("leaves blocky geometry unchanged", () => {
    const roots = jobs.map((job) => buildCharacter(proceduralProvider, { seed: 1, body: job.body, part: job.part }).root);
    expect(geometryHash(roots)).toBe(BLOCKY_GEOMETRY_HASH);
  });

  it("defaults to blocky", () => {
    const build = (style?: "blocky") => geometryHash([buildCharacter(proceduralProvider, { seed: 1, body, style }).root]);
    expect(build()).toBe(build("blocky"));
  });

  describe("smooth body", () => {
    const blocky = meshes(buildCharacter(proceduralProvider, { seed: 1, body, style: "blocky" }).root);
    const smooth = meshes(buildCharacter(proceduralProvider, { seed: 1, body, style: "smooth" }).root);
    const named = (found: Mesh[], name: string) => found.filter((mesh) => mesh.name === name);

    it("uses smooth shading", () => {
      expect(smooth.every((mesh) => (mesh.material as MeshLambertMaterial).flatShading === false)).toBe(true);
      expect(blocky.every((mesh) => (mesh.material as MeshLambertMaterial).flatShading === true)).toBe(true);
    });

    it.each(["torso", "upperArm", "forearm", "thigh", "shin"])("gives the %s more sides and rounded ends", (name) => {
      const [before] = named(blocky, name).map((mesh) => (mesh.geometry as LatheGeometry).parameters);
      const [after] = named(smooth, name).map((mesh) => (mesh.geometry as LatheGeometry).parameters);
      expect(after.segments).toBeGreaterThan(before.segments);
      expect(after.points.length).toBeGreaterThan(before.points.length);
    });

    it.each(["skull", "hand", "foot"])("gives the %s more vertices", (name) => {
      const count = (found: Mesh[]) => named(found, name)[0].geometry.getAttribute("position").count;
      expect(count(smooth)).toBeGreaterThan(count(blocky));
    });

    it("adds joint spheres at elbows and knees", () => {
      expect(named(smooth, "elbow").map((mesh) => mesh.parent?.name).sort()).toEqual(["elbowLeft", "elbowRight"]);
      expect(named(smooth, "knee").map((mesh) => mesh.parent?.name).sort()).toEqual(["kneeLeft", "kneeRight"]);
      expect(named(blocky, "elbow").length + named(blocky, "knee").length).toBe(0);
    });
  });
});
