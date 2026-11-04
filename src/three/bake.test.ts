import { Box3, type BufferGeometry, Color, Mesh, type MeshLambertMaterial, type Object3D } from "three";
import type { JointName, Rig } from "../scene/rig";
import { describe, expect, it } from "vitest";
import { PART_CATALOG } from "../core/catalog";
import type { Character } from "../core/compose";
import { applyPose, CLIPS, poseJoints } from "../scene/animation";
import { buildDressedCharacter } from "../scene/character";
import { proceduralProvider } from "../scene/parts/procedural";
import { RIG_MATERIAL, RigFactory } from "./bake";
import { outfitFor } from "./outfit";

const SKIRTED: Character = {
  parts: {
    body: { variant: "average", tint: "#e0ac69" },
    hair: { variant: "long", tint: "#3b2a20" },
    top: { variant: "hoodie", tint: "#2e86c1" },
    bottom: { variant: "skirt", tint: "#c0392b" },
    shoes: { variant: "boots", tint: "#2b2b2b" },
    hat: { variant: "cap", tint: "#f1c40f" },
  },
};

const RED_HAT: Character = { parts: { ...SKIRTED.parts, hat: { variant: "cap", tint: "#c0392b" } } };

function build(factory: RigFactory, character: Character = SKIRTED) {
  const { body, parts } = outfitFor(PART_CATALOG, character);
  return factory.build(body, parts);
}

function meshes(root: Object3D): Mesh[] {
  const found: Mesh[] = [];
  root.traverse((object) => {
    if (object instanceof Mesh) found.push(object);
  });
  return found;
}

function geometries(root: Object3D): BufferGeometry[] {
  return meshes(root).map((mesh) => mesh.geometry);
}

function bounds(root: Object3D): Box3 {
  root.updateMatrixWorld(true);
  return new Box3().setFromObject(root, true);
}

describe("RigFactory", () => {
  it("collapses each joint to one shared-material mesh plus fitted skirts", () => {
    const { rig } = build(new RigFactory(proceduralProvider, 1));
    const found = meshes(rig.root);
    expect(found.length).toBeLessThanOrEqual(Object.keys(rig.joints).length + 1);
    expect(found.every((mesh) => mesh.material === RIG_MATERIAL)).toBe(true);
    expect(found.every((mesh) => mesh.geometry.getAttribute("color"))).toBe(true);
  });

  it("keeps the unbaked shape in every walk pose", () => {
    const walk = CLIPS.find((clip) => clip.name === "walk")!;
    const { body, parts } = outfitFor(PART_CATALOG, SKIRTED);
    const original = buildDressedCharacter(proceduralProvider, 1, body, parts);
    const baked = build(new RigFactory(proceduralProvider, 1));
    walk.poses.forEach((pose, index) => {
      applyPose(original, pose);
      poseJoints(baked.rig, pose);
      baked.fitSkirts(`walk:${index}`);
      const a = bounds(original.root);
      const b = bounds(baked.rig.root);
      for (const key of ["min", "max"] as const) {
        expect(b[key].x).toBeCloseTo(a[key].x, 5);
        expect(b[key].y).toBeCloseTo(a[key].y, 5);
        expect(b[key].z).toBeCloseTo(a[key].z, 5);
      }
    });
  });

  it("bakes the part tints into vertex colours", () => {
    const { rig } = build(new RigFactory(proceduralProvider, 1));
    const colours = new Set<string>();
    for (const geometry of geometries(rig.root)) {
      const colour = geometry.getAttribute("color");
      for (let index = 0; index < colour.count; index++) {
        colours.add([colour.getX(index), colour.getY(index), colour.getZ(index)].map((c) => c.toFixed(3)).join());
      }
    }
    expect(colours.size).toBeGreaterThanOrEqual(6);
  });

  it("shares geometry between rigs with the same parts and tints", () => {
    const factory = new RigFactory(proceduralProvider, 1);
    const first = build(factory);
    first.fitSkirts("idle:0");
    const count = factory.geometryCount;
    const second = build(factory);
    second.fitSkirts("idle:0");
    expect(factory.geometryCount).toBe(count);
    expect(geometries(second.rig.root)).toEqual(geometries(first.rig.root));
  });

  it("shares vertex buffers across tints and recolours only the joints a tint touches", () => {
    const factory = new RigFactory(proceduralProvider, 1);
    const plain = build(factory);
    const red = build(factory, RED_HAT);
    const geometry = (rig: Rig, name: JointName) =>
      (rig.joints[name].children.find((child) => child instanceof Mesh) as Mesh).geometry;
    const head = [geometry(plain.rig, "head"), geometry(red.rig, "head")];
    expect(head[0]).not.toBe(head[1]);
    expect(head[0].getAttribute("position")).toBe(head[1].getAttribute("position"));
    expect(head[0].index).toBe(head[1].index);
    expect(head[0].getAttribute("color")).not.toBe(head[1].getAttribute("color"));
    expect(geometry(red.rig, "legLeft")).toBe(geometry(plain.rig, "legLeft"));
  });

  it("matches the colours of an unbaked rig", () => {
    const { body, parts } = outfitFor(PART_CATALOG, SKIRTED);
    const original = new Set<string>();
    buildDressedCharacter(proceduralProvider, 1, body, parts).root.traverse((object) => {
      if (object instanceof Mesh) original.add((object.material as MeshLambertMaterial).color.getHexString());
    });
    const baked = new Set<string>();
    for (const geometry of geometries(build(new RigFactory(proceduralProvider, 1)).rig.root)) {
      const colour = geometry.getAttribute("color");
      for (let index = 0; index < colour.count; index++) {
        baked.add(new Color(colour.getX(index), colour.getY(index), colour.getZ(index)).getHexString());
      }
    }
    expect(baked).toEqual(original);
  });

  it("shares fitted skirt frames between rigs", () => {
    const factory = new RigFactory(proceduralProvider, 1);
    const walk = CLIPS.find((clip) => clip.name === "walk")!;
    const [a, b] = [build(factory), build(factory)];
    for (const { rig, fitSkirts } of [a, b]) {
      poseJoints(rig, walk.poses[2]);
      fitSkirts("walk:2");
    }
    const skirt = (rig: typeof a.rig) => meshes(rig.joints.torso).find((mesh) => mesh.userData.skirtFit)!.geometry;
    expect(skirt(a.rig)).toBe(skirt(b.rig));
  });

  it("disposes every shared geometry", () => {
    const factory = new RigFactory(proceduralProvider, 1);
    const { rig, fitSkirts } = build(factory);
    fitSkirts("idle:0");
    const disposed = new Set<BufferGeometry>();
    for (const geometry of geometries(rig.root)) geometry.addEventListener("dispose", () => disposed.add(geometry));
    factory.dispose();
    expect(disposed.size).toBe(geometries(rig.root).length);
    expect(factory.geometryCount).toBe(0);
  });
});
