import { Box3, Mesh } from "three";
import { describe, expect, it } from "vitest";
import { PART_CATALOG } from "../core/catalog";
import { planSheets } from "../core/parts";
import { applyPose, CLIPS, sheetFrames } from "./animation";
import { buildCharacter } from "./character";
import { proceduralProvider } from "./parts/procedural";
import { LEGS, type Rig } from "./rig";

const bodies = planSheets(PART_CATALOG).filter((job) => !job.part);

function lowestFootY(rig: Rig): number {
  rig.root.updateMatrixWorld(true);
  const feet: number[] = [];
  rig.root.traverse((object) => {
    if (object instanceof Mesh && object.name === "foot") feet.push(new Box3().setFromObject(object).min.y);
  });
  return Math.min(...feet);
}

describe("sheetFrames", () => {
  it("lays clips out consecutively and records their frame indices", () => {
    const { poses, animations } = sheetFrames(CLIPS);

    expect(animations.idle.frames).toEqual([0, 1, 2, 3, 4, 5]);
    expect(animations.walk.frames).toEqual([6, 7, 8, 9, 10, 11]);
    expect(poses).toHaveLength(12);
  });

  it("rejects duplicate and empty clips", () => {
    expect(() => sheetFrames([...CLIPS, CLIPS[0]])).toThrow(/Duplicate/);
    expect(() => sheetFrames([{ name: "empty", fps: 1, poses: [] }])).toThrow(/no poses/);
  });

  it("has a 4-6 frame walk cycle that moves the limbs", () => {
    const walk = CLIPS.find((clip) => clip.name === "walk")!;
    expect(walk.poses.length).toBeGreaterThanOrEqual(4);
    expect(walk.poses.length).toBeLessThanOrEqual(6);
    expect(new Set(walk.poses.map((pose) => pose.legLeft)).size).toBeGreaterThan(2);
  });
});

describe("applyPose walk", () => {
  const rig = buildCharacter(proceduralProvider, { seed: 1, body: bodies[0].body });
  const walk = CLIPS.find((clip) => clip.name === "walk")!;
  const frames = walk.poses.map((pose) => {
    applyPose(rig, pose);
    rig.root.updateMatrixWorld(true);
    return LEGS.map((leg) => {
      const box = new Box3().setFromObject(rig.joints[leg.foot]);
      return {
        z: (box.min.z + box.max.z) / 2,
        grounded: box.min.y < 0.01,
        thigh: pose[leg.upper]!,
        knee: pose[leg.lower]!,
      };
    });
  });
  const transitions = frames.flatMap((pair, frame) =>
    pair.map((leg, side) => ({ from: leg, to: frames[(frame + 1) % frames.length][side] })),
  );

  it("holds each planted foot still as the body moves at a steady pace", () => {
    const travel = frames[0][0].z - frames[1][0].z;
    expect(travel).toBeGreaterThan(0.1);
    for (const { from, to } of transitions.filter(({ from, to }) => from.grounded && to.grounded)) {
      expect(from.z - to.z).toBeCloseTo(travel, 1);
    }
  });

  it("only straightens an airborne leg's knee while its thigh carries forward", () => {
    const airborne = transitions.filter(({ from }) => !from.grounded);
    expect(airborne.length).toBeGreaterThan(0);
    for (const { from, to } of airborne) {
      if (from.knee - to.knee > 0.1) expect(from.thigh - to.thigh).toBeGreaterThan(0.1);
    }
  });
});

describe("applyPose", () => {
  it.each(bodies.map((job) => [job.variant, job] as const))("keeps the %s body's feet on the ground", (_, job) => {
    const rig = buildCharacter(proceduralProvider, { seed: 1, body: job.body });
    const rest = lowestFootY(rig);
    for (const pose of sheetFrames(CLIPS).poses) {
      applyPose(rig, pose);
      expect(lowestFootY(rig)).toBeCloseTo(rest, 1);
    }
  });

  it("breathes the upper body during idle while the legs stay put", () => {
    const rig = buildCharacter(proceduralProvider, { seed: 1, body: bodies[0].body });
    const idle = CLIPS.find((clip) => clip.name === "idle")!;
    const heights = idle.poses.map((pose) => {
      applyPose(rig, pose);
      expect(rig.joints.legLeft.rotation.x).toBe(0);
      return [rig.joints.torso.position.y, rig.joints.head.position.y, rig.joints.armLeft.position.y - rig.shape.shoulder.y];
    });
    expect(new Set(heights.map(([torso]) => torso)).size).toBeGreaterThan(2);
    for (const [torso, head, arm] of heights) {
      expect(head).toBe(torso);
      expect(arm).toBeCloseTo(torso);
    }
  });

  it("resets joints the pose leaves unset", () => {
    const rig = buildCharacter(proceduralProvider, { seed: 1, body: bodies[0].body });
    applyPose(rig, CLIPS[1].poses[1]);
    applyPose(rig, {});
    expect(Object.values(rig.joints).every((joint) => joint.rotation.x === 0)).toBe(true);
    expect(rig.root.position.y).toBe(0);
    expect(rig.joints.torso.position.y).toBe(0);
    expect(rig.joints.armLeft.position.y).toBe(rig.shape.shoulder.y);
  });
});
