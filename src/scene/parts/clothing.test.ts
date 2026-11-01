import { type LatheGeometry, Mesh, type Object3D } from "three";
import { describe, expect, it } from "vitest";
import { PART_CATALOG } from "../../core/catalog";
import { planSheets } from "../../core/parts";
import { buildCharacter } from "../character";
import type { Profile } from "../rig";
import { proceduralProvider } from "./procedural";

const SHELLS = ["shirt", "sleeve", "cuff", "pelvis", "belt", "trouserLeg", "shaft", "waistband"];
const BODY_LATHES = ["torso", "upperArm", "forearm", "thigh", "shin"];

const clothingJobs = planSheets(PART_CATALOG).filter((job) => job.part && ["top", "bottom", "shoes"].includes(job.part.category));

function meshes(root: Object3D): Mesh[] {
  const found: Mesh[] = [];
  root.traverse((object) => {
    if (object instanceof Mesh) found.push(object);
  });
  return found;
}

function profileOf(mesh: Mesh): Profile {
  return (mesh.geometry as LatheGeometry).parameters.points.map(({ x, y }) => [x, y] as const);
}

function outerRadius(shell: Profile, y: number): number | undefined {
  let radius: number | undefined;
  for (let index = 1; index < shell.length; index++) {
    const [r0, y0] = shell[index - 1];
    const [r1, y1] = shell[index];
    if (y < Math.min(y0, y1) || y > Math.max(y0, y1)) continue;
    const at = y1 === y0 ? Math.max(r0, r1) : r0 + ((r1 - r0) * (y - y0)) / (y1 - y0);
    radius = Math.max(radius ?? 0, at);
  }
  return radius;
}

function covers(shell: Profile, [radius, y]: readonly [number, number]): boolean {
  return (outerRadius(shell, y) ?? 0) > radius;
}

function encloses(shell: Profile, point: readonly [number, number]): boolean {
  const ys = shell.map(([, y]) => y);
  if (point[1] < Math.min(...ys)) return shell[0][0] > 0;
  if (point[1] > Math.max(...ys)) return shell[shell.length - 1][0] > 0;
  return covers(shell, point);
}

function sphereProfile(radius: number, steps = 32): [number, number][] {
  return Array.from({ length: steps + 1 }, (_, step) => {
    const angle = -Math.PI / 2 + (Math.PI * step) / steps;
    return [radius * Math.cos(angle), radius * Math.sin(angle)];
  });
}

describe("clothing shells", () => {
  it.each(clothingJobs.map((job) => [`${job.bodyVariant}/${job.variant}`, job] as const))("enclose the %s body", (_, job) => {
    const rig = buildCharacter(proceduralProvider, { seed: 1, body: job.body, part: job.part });
    const found = meshes(rig.root);
    const shells = found.filter((mesh) => SHELLS.includes(mesh.name));
    for (const shell of shells) {
      const body = found.find((mesh) => mesh.parent === shell.parent && BODY_LATHES.includes(mesh.name))!;
      expect((shell.geometry as LatheGeometry).parameters.segments).toBe((body.geometry as LatheGeometry).parameters.segments);
      const exposed = profileOf(body).filter((point) => !encloses(profileOf(shell), point));
      expect(exposed, `${shell.name} on ${shell.parent?.name}`).toEqual([]);
    }
  });
});

describe("skirts", () => {
  const skirtJobs = clothingJobs.filter((job) => job.part?.kind === "skirt");

  it.each(skirtJobs.map((job) => [`${job.bodyVariant}/${job.variant}`, job] as const))("cover the %s hips up to the waist", (_, job) => {
    const rig = buildCharacter(proceduralProvider, { seed: 1, body: job.body, part: job.part });
    const found = meshes(rig.root);
    const named = (name: string) => profileOf(found.find((mesh) => mesh.name === name)!);
    const [skirt, waistband] = [named("skirt"), named("waistband")];
    const hips = named("torso").filter(([, y]) => y <= rig.shape.waistY);
    expect(hips.filter((point) => !covers(skirt, point) && !covers(waistband, point))).toEqual([]);
  });
});

describe("joint spheres", () => {
  const covering = [
    { variant: "longsleeve", joint: "elbow", upper: "upperArm", lower: "forearm" },
    { variant: "trousers", joint: "knee", upper: "thigh", lower: "shin" },
  ];

  it.each(covering)("are enclosed by $variant at the $joint", ({ variant, joint, upper, lower }) => {
    const job = clothingJobs.find((candidate) => candidate.variant === variant)!;
    const rig = buildCharacter(proceduralProvider, { seed: 1, body: job.body, part: job.part });
    const found = meshes(rig.root);
    const sphere = found.find((mesh) => mesh.name === joint)!;
    const shellOn = (name: string) => {
      const body = found.find((mesh) => mesh.name === name)!;
      return profileOf(found.find((mesh) => mesh.parent === body.parent && SHELLS.includes(mesh.name))!);
    };
    const length = rig.joints[sphere.parent!.name as keyof typeof rig.joints].position.y;
    const upperShell = shellOn(upper).map(([radius, y]) => [radius, y - length] as const);
    const lowerShell = shellOn(lower);
    const radius = (sphere.geometry as unknown as { parameters: { radius: number } }).parameters.radius;
    const exposed = sphereProfile(radius).filter((point) => !covers(upperShell, point) && !covers(lowerShell, point));
    expect(exposed).toEqual([]);
  });
});
