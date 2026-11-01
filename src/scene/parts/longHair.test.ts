import { type Mesh, Vector3 } from "three";
import { describe, expect, it } from "vitest";
import { PART_CATALOG } from "../../core/catalog";
import { planSheets } from "../../core/parts";
import { applyPose, CLIPS, sheetFrames } from "../animation";
import { buildCharacter } from "../character";
import type { Rig } from "../rig";
import { radiusAt } from "./geometry";
import { proceduralProvider } from "./procedural";

const longJobs = planSheets(PART_CATALOG).filter((job) => job.part?.id === "long" && job.category === "hair");
const curtainCases = longJobs.filter((job) => !job.front).map((job) => [job.bodyVariant, job] as const);
const lockCases = longJobs.filter((job) => job.front).map((job) => [job.bodyVariant, job] as const);

const thickestTop = Math.max(
  ...PART_CATALOG.categories
    .find((category) => category.id === "top")!
    .variants.map((variant) => (typeof variant.params.thickness === "number" ? variant.params.thickness : 0)),
);

function buildLongHair(job: (typeof longJobs)[number]) {
  const rig = buildCharacter(proceduralProvider, { seed: 1, body: job.body, part: job.part, front: job.front });
  const layer = job.front ? "hair.front" : "hair";
  const hair: Mesh[] = [];
  rig.root.traverse((object) => {
    if ((object as Mesh).isMesh && object.userData.layer === layer) hair.push(object as Mesh);
  });
  return { rig, hair };
}

function lowestPoint(hair: Mesh[]): number {
  return Math.min(
    ...hair.map((mesh) => {
      mesh.geometry.computeBoundingBox();
      return mesh.geometry.boundingBox!.min.y;
    }),
  );
}

function torsoSpacePoints(rig: Rig, hair: Mesh[]): Vector3[][] {
  return sheetFrames(CLIPS).poses.map((pose) => {
    applyPose(rig, pose);
    rig.root.updateMatrixWorld(true);
    const toTorso = rig.joints.torso.matrixWorld.clone().invert();
    return hair.flatMap((mesh) => {
      const position = mesh.geometry.getAttribute("position");
      return Array.from({ length: position.count }, (_, index) =>
        new Vector3().fromBufferAttribute(position, index).applyMatrix4(mesh.matrixWorld).applyMatrix4(toTorso),
      );
    });
  });
}

function expectOutsideClothedTorso(rig: Rig, hair: Mesh[]): void {
  const { torso, torsoDepth } = rig.shape;
  const torsoTop = Math.max(...torso.map(([, y]) => y));
  for (const points of torsoSpacePoints(rig, hair)) {
    for (const point of points) {
      if (point.y > torsoTop) continue;
      const radius = radiusAt(torso, point.y) + thickestTop;
      expect((point.x / radius) ** 2 + (point.z / (radius * torsoDepth)) ** 2).toBeGreaterThan(1);
    }
  }
}

describe("long hair", () => {
  it.each(curtainCases)("hangs below the shoulders on %s", (_, job) => {
    const { rig, hair } = buildLongHair(job);
    expect(lowestPoint(hair)).toBeLessThan(rig.shape.shoulder.y);
  });

  it.each(curtainCases)("stays outside the clothed torso on %s in every frame", (_, job) => {
    const { rig, hair } = buildLongHair(job);
    expectOutsideClothedTorso(rig, hair);
  });
});

describe("long hair front locks", () => {
  it.each(lockCases)("drape below the shoulders on both sides on %s", (_, job) => {
    const { rig, hair } = buildLongHair(job);
    expect(hair).toHaveLength(2);
    expect(lowestPoint(hair)).toBeLessThan(rig.shape.shoulder.y);
    const sides = hair.map((mesh) => {
      mesh.geometry.computeBoundingBox();
      return Math.sign(mesh.geometry.boundingBox!.getCenter(new Vector3()).x);
    });
    expect(sides.sort()).toEqual([-1, 1]);
  });

  it.each(lockCases)("lie in front of the clothed torso on %s in every frame", (_, job) => {
    const { rig, hair } = buildLongHair(job);
    expectOutsideClothedTorso(rig, hair);
    const torsoTop = Math.max(...rig.shape.torso.map(([, y]) => y));
    for (const points of torsoSpacePoints(rig, hair)) {
      for (const point of points.filter((candidate) => candidate.y <= torsoTop)) expect(point.z).toBeGreaterThan(0);
    }
  });

  it.each(lockCases)("stay inside the upper arms on %s", (_, job) => {
    const { rig, hair } = buildLongHair(job);
    const armInner = rig.shape.shoulder.x - rig.shape.upperArm.top;
    for (const mesh of hair) {
      mesh.geometry.computeBoundingBox();
      const { min, max } = mesh.geometry.boundingBox!;
      expect(Math.max(Math.abs(min.x), Math.abs(max.x))).toBeLessThan(armInner);
    }
  });
});
