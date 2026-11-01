import { type Mesh, Vector3 } from "three";
import { describe, expect, it } from "vitest";
import { PART_CATALOG } from "../../core/catalog";
import { planSheets } from "../../core/parts";
import { applyPose, CLIPS, sheetFrames } from "../animation";
import { buildCharacter } from "../character";
import { radiusAt } from "./geometry";
import { proceduralProvider } from "./procedural";

const longJobs = planSheets(PART_CATALOG).filter((job) => job.part?.id === "long" && job.category === "hair");

const thickestTop = Math.max(
  ...PART_CATALOG.categories
    .find((category) => category.id === "top")!
    .variants.map((variant) => (typeof variant.params.thickness === "number" ? variant.params.thickness : 0)),
);

function buildLongHair(job: (typeof longJobs)[number]) {
  const rig = buildCharacter(proceduralProvider, { seed: 1, body: job.body, part: job.part });
  const hair: Mesh[] = [];
  rig.root.traverse((object) => {
    if ((object as Mesh).isMesh && object.userData.layer === "hair") hair.push(object as Mesh);
  });
  return { rig, hair };
}

describe("long hair", () => {
  it.each(longJobs.map((job) => [job.bodyVariant, job] as const))("hangs below the shoulders on %s", (_, job) => {
    const { rig, hair } = buildLongHair(job);
    const lowest = Math.min(
      ...hair.map((mesh) => {
        mesh.geometry.computeBoundingBox();
        return mesh.geometry.boundingBox!.min.y;
      }),
    );
    expect(lowest).toBeLessThan(rig.shape.shoulder.y);
  });

  it.each(longJobs.map((job) => [job.bodyVariant, job] as const))("stays outside the clothed torso on %s in every frame", (_, job) => {
    const { rig, hair } = buildLongHair(job);
    const { torso, torsoDepth } = rig.shape;
    const torsoTop = Math.max(...torso.map(([, y]) => y));
    for (const pose of sheetFrames(CLIPS).poses) {
      applyPose(rig, pose);
      rig.root.updateMatrixWorld(true);
      const toTorso = rig.joints.torso.matrixWorld.clone().invert();
      for (const mesh of hair) {
        const position = mesh.geometry.getAttribute("position");
        for (let index = 0; index < position.count; index++) {
          const point = new Vector3().fromBufferAttribute(position, index).applyMatrix4(mesh.matrixWorld).applyMatrix4(toTorso);
          if (point.y > torsoTop) continue;
          const radius = radiusAt(torso, point.y) + thickestTop;
          expect((point.x / radius) ** 2 + (point.z / (radius * torsoDepth)) ** 2).toBeGreaterThan(1);
        }
      }
    }
  });
});
