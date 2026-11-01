import { type BufferAttribute, type LatheGeometry, type Mesh, Vector3 } from "three";
import { describe, expect, it } from "vitest";
import { PART_CATALOG } from "../../core/catalog";
import { planSheets } from "../../core/parts";
import { RENDER_STYLES } from "../../core/style";
import { applyPose, CLIPS, sheetFrames } from "../animation";
import { buildCharacter } from "../character";
import type { Rig } from "../rig";
import { proceduralProvider } from "./procedural";

const SAMPLES_ALONG_LEG = 12;

const skirtJobs = planSheets(PART_CATALOG).filter((job) => job.part?.kind === "skirt");

function findMesh(rig: Rig, name: string): Mesh[] {
  const found: Mesh[] = [];
  rig.root.traverse((object) => {
    if ((object as Mesh).isMesh && object.name === name) found.push(object as Mesh);
  });
  return found;
}

function legSurface(rig: Rig): Vector3[] {
  const points: Vector3[] = [];
  for (const leg of [...findMesh(rig, "thigh"), ...findMesh(rig, "shin")]) {
    const geometry = leg.geometry as LatheGeometry;
    const position = geometry.getAttribute("position") as BufferAttribute;
    const profile = geometry.parameters.points;
    const perColumn = profile.length;
    const rim = profile.flatMap(({ x }, index) => (x > 0 ? [index] : []));
    for (let column = 0; column < position.count / perColumn; column++) {
      for (let index = 1; index < rim.length; index++) {
        const bottom = new Vector3().fromBufferAttribute(position, column * perColumn + rim[index - 1]);
        const top = new Vector3().fromBufferAttribute(position, column * perColumn + rim[index]);
        for (let step = 0; step <= SAMPLES_ALONG_LEG; step++) {
          points.push(bottom.clone().lerp(top, step / SAMPLES_ALONG_LEG).applyMatrix4(leg.matrixWorld));
        }
      }
    }
  }
  for (const knee of findMesh(rig, "knee")) {
    const position = knee.geometry.getAttribute("position") as BufferAttribute;
    for (let index = 0; index < position.count; index++) points.push(new Vector3().fromBufferAttribute(position, index).applyMatrix4(knee.matrixWorld));
  }
  return points;
}

function skirtRings(skirt: Mesh): { y: number; ring: [number, number][] }[] {
  const position = skirt.geometry.getAttribute("position") as BufferAttribute;
  const perColumn = (skirt.geometry as LatheGeometry).parameters.points.length;
  const columns = position.count / perColumn - 1;
  return Array.from({ length: perColumn }, (_, row) => ({
    y: position.getY(row),
    ring: Array.from({ length: columns }, (_, column): [number, number] => [
      position.getX(column * perColumn + row),
      position.getZ(column * perColumn + row),
    ]),
  }));
}

function insideRing(ring: [number, number][], x: number, z: number): boolean {
  const turns = ring.map(([x0, z0], index) => {
    const [x1, z1] = ring[(index + 1) % ring.length];
    return (x1 - x0) * (z - z0) - (z1 - z0) * (x - x0);
  });
  return turns.every((turn) => turn <= 1e-6) || turns.every((turn) => turn >= -1e-6);
}

function exposedLegPoints(rig: Rig): number {
  rig.root.updateMatrixWorld(true);
  const [skirt] = findMesh(rig, "skirt");
  const rings = skirtRings(skirt);
  const top = rings.findIndex(({ y }) => y >= 0.95 - 1e-6);
  const toSkirt = skirt.matrixWorld.clone().invert();
  return legSurface(rig).filter((world) => {
    const point = world.clone().applyMatrix4(toSkirt);
    if (point.y < rings[0].y || point.y > rings[top].y) return false;
    const upper = rings.findIndex(({ y }) => y >= point.y);
    const lower = Math.max(0, upper - 1);
    const t = upper === lower ? 0 : (point.y - rings[lower].y) / (rings[upper].y - rings[lower].y);
    const ring = rings[lower].ring.map(([x, z], index): [number, number] => {
      const [ux, uz] = rings[upper].ring[index];
      return [x + (ux - x) * t, z + (uz - z) * t];
    });
    return !insideRing(ring, point.x, point.z);
  }).length;
}

describe("fitSkirts", () => {
  it.each(RENDER_STYLES.flatMap((style) => skirtJobs.map((job) => [`${style} ${job.bodyVariant}/${job.variant}`, job, style] as const)))(
    "keeps the %s legs inside the skirt in every frame",
    (_, job, style) => {
      const rig = buildCharacter(proceduralProvider, { seed: 1, body: job.body, part: job.part, style });
      for (const pose of sheetFrames(CLIPS).poses) {
        applyPose(rig, pose);
        expect(exposedLegPoints(rig)).toBe(0);
      }
    },
  );

  it("leaves the skirt at its rest shape when standing still", () => {
    const job = skirtJobs[0];
    const rig = buildCharacter(proceduralProvider, { seed: 1, body: job.body, part: job.part });
    const [skirt] = findMesh(rig, "skirt");
    const rest = Array.from(skirt.geometry.getAttribute("position").array);
    applyPose(rig, CLIPS[1].poses[1]);
    applyPose(rig, {});
    expect(Array.from(skirt.geometry.getAttribute("position").array)).toEqual(rest);
  });
});
