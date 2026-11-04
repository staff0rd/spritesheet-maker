import { Box3, Mesh, type Object3D } from "three";
import { describe, expect, it } from "vitest";
import { PART_CATALOG } from "../core/catalog";
import { applyPose, CLIPS } from "../scene/animation";
import { buildDressedCharacter } from "../scene/character";
import { proceduralProvider } from "../scene/parts/procedural";
import { bakeRig, RIG_MATERIAL } from "./bake";
import { outfitFor } from "./outfit";

const SKIRTED = {
  parts: {
    body: { variant: "average", tint: "#e0ac69" },
    hair: { variant: "long", tint: "#3b2a20" },
    top: { variant: "hoodie", tint: "#2e86c1" },
    bottom: { variant: "skirt", tint: "#c0392b" },
    shoes: { variant: "boots", tint: "#2b2b2b" },
    hat: { variant: "cap", tint: "#f1c40f" },
  },
};

function build() {
  const { body, parts } = outfitFor(PART_CATALOG, SKIRTED);
  return buildDressedCharacter(proceduralProvider, 1, body, parts);
}

function meshes(root: Object3D): Mesh[] {
  const found: Mesh[] = [];
  root.traverse((object) => {
    if (object instanceof Mesh) found.push(object);
  });
  return found;
}

function bounds(root: Object3D): Box3 {
  root.updateMatrixWorld(true);
  return new Box3().setFromObject(root, true);
}

describe("bakeRig", () => {
  it("collapses each joint to one shared-material mesh plus fitted skirts", () => {
    const rig = build();
    const before = meshes(rig.root).length;
    bakeRig(rig);
    const after = meshes(rig.root);
    expect(after.length).toBeLessThanOrEqual(Object.keys(rig.joints).length + 1);
    expect(after.length).toBeLessThan(before);
    expect(after.every((mesh) => mesh.material === RIG_MATERIAL)).toBe(true);
    expect(after.every((mesh) => mesh.geometry.getAttribute("color"))).toBe(true);
  });

  it("keeps the same shape in every walk pose", () => {
    const walk = CLIPS.find((clip) => clip.name === "walk")!;
    const original = build();
    const baked = build();
    bakeRig(baked);
    for (const pose of walk.poses) {
      applyPose(original, pose);
      applyPose(baked, pose);
      const a = bounds(original.root);
      const b = bounds(baked.root);
      for (const key of ["min", "max"] as const) {
        expect(b[key].x).toBeCloseTo(a[key].x, 5);
        expect(b[key].y).toBeCloseTo(a[key].y, 5);
        expect(b[key].z).toBeCloseTo(a[key].z, 5);
      }
    }
  });

  it("bakes the part tints into vertex colours", () => {
    const rig = build();
    bakeRig(rig);
    const colours = new Set<string>();
    for (const mesh of meshes(rig.root)) {
      const colour = mesh.geometry.getAttribute("color");
      for (let index = 0; index < colour.count; index++) {
        colours.add([colour.getX(index), colour.getY(index), colour.getZ(index)].map((c) => c.toFixed(3)).join());
      }
    }
    expect(colours.size).toBeGreaterThanOrEqual(6);
  });
});
