import { fitSkirts } from "./parts/skirtFit";
import { ARMS, bodyShape, LEGS, type JointName, type Rig } from "./rig";

export type Pose = Partial<Record<JointName | "lift", number>>;

const UPPER_BODY = ["torso", "head", "armLeft", "armRight"] as const;

interface Clip {
  name: string;
  fps: number;
  poses: Pose[];
}

const WALK_FRAMES = 6;
const WALK_STRIDE = 1.05;
const WALK_FOOT_REACH = WALK_STRIDE / 4;
const WALK_STANCE_SHARE = 0.5;
const WALK_STANCE_REACH = 0.918;
const WALK_FOOT_LIFT = 0.3;
const WALK_SWING_SNAP = 0.3;
const WALK_ARM = 0.35;
const WALK_ELBOW = -0.3;
const IDLE_FRAMES = 6;
const IDLE_LIFT = 0.028;
const IDLE_ARM = 0.06;

const WALK_FOOT_PITCH = [-0.15, 0, 0, 0.25, 0.15, -0.05];

const STANDARD_SHAPE = bodyShape({ height: 1, build: 1, shoulders: 1, hips: 1 });
const THIGH_LENGTH = STANDARD_SHAPE.thigh.length;
const SHIN_LENGTH = STANDARD_SHAPE.hip.y - STANDARD_SHAPE.thigh.length;

function soleBelowAnkle(foot: Rig["shape"]["foot"], pitch: number): number {
  return Math.max(...[foot.z - foot.depth / 2, foot.z + foot.depth / 2].map((edge) => edge * Math.sin(pitch)));
}

function hipToSole(shape: Rig["shape"], thigh: number, shin: number, pitch: number): number {
  const shinLength = shape.hip.y - shape.thigh.length;
  return shape.thigh.length * Math.cos(thigh) + shinLength * Math.cos(shin) + soleBelowAnkle(shape.foot, pitch);
}

function cyclic(keys: readonly number[], cycle: number): number {
  const position = cycle * keys.length;
  const index = Math.floor(position);
  const blend = position - index;
  return keys[index % keys.length] * (1 - blend) + keys[(index + 1) % keys.length] * blend;
}

interface FootTarget {
  forward: number;
  lift: number;
  pitch: number;
  planted: boolean;
}

function footTarget(legCycle: number): FootTarget {
  const cycle = legCycle - Math.floor(legCycle);
  return { ...footPath(cycle), pitch: cyclic(WALK_FOOT_PITCH, cycle) };
}

function footPath(cycle: number): Omit<FootTarget, "pitch"> {
  if (cycle <= WALK_STANCE_SHARE) {
    const stance = cycle / WALK_STANCE_SHARE;
    return { forward: WALK_FOOT_REACH * (1 - 2 * stance), lift: 0, planted: true };
  }
  const swing = (cycle - WALK_STANCE_SHARE) / (1 - WALK_STANCE_SHARE);
  const across = -Math.cos(Math.PI * swing);
  return {
    forward: WALK_FOOT_REACH * Math.sign(across) * Math.abs(across) ** WALK_SWING_SNAP,
    lift: WALK_FOOT_LIFT * Math.sin(Math.PI * swing) * (1 - swing) ** 2,
    planted: false,
  };
}

function lawOfCosines(a: number, b: number, opposite: number): number {
  return Math.acos(Math.min(1, Math.max(-1, (a * a + b * b - opposite * opposite) / (2 * a * b))));
}

function ankleAngles(forward: number, drop: number): { thigh: number; knee: number } {
  const span = Math.min(Math.hypot(forward, drop), THIGH_LENGTH + SHIN_LENGTH);
  const thigh = -(Math.atan2(forward, drop) + lawOfCosines(THIGH_LENGTH, span, SHIN_LENGTH));
  return { thigh, knee: Math.PI - lawOfCosines(THIGH_LENGTH, SHIN_LENGTH, span) };
}

function walkPose(cycle: number): Pose {
  const feet = [cycle, cycle + 0.5].map(footTarget);
  const hipHeight = Math.min(
    ...feet.filter((foot) => foot.planted).map((foot) => Math.sqrt(WALK_STANCE_REACH ** 2 - foot.forward ** 2)),
  );
  const pose: Pose = {};
  for (const [index, foot] of feet.entries()) {
    const ankleDrop = hipHeight - foot.lift - soleBelowAnkle(STANDARD_SHAPE.foot, foot.pitch);
    const { thigh, knee } = ankleAngles(foot.forward, ankleDrop);
    pose[LEGS[index].upper] = thigh;
    pose[LEGS[index].lower] = knee;
    pose[LEGS[index].foot] = foot.pitch - thigh - knee;
    pose[ARMS[index].upper] = (WALK_ARM * foot.forward) / WALK_FOOT_REACH;
    pose[ARMS[index].lower] = WALK_ELBOW;
  }
  return pose;
}

function idlePose(phase: number): Pose {
  const breath = (1 - Math.cos(phase)) / 2;
  const pose: Pose = { lift: IDLE_LIFT * breath };
  for (const [index, side] of [1, -1].entries()) {
    const arm = ARMS[index];
    pose[arm.upper] = IDLE_ARM * Math.sin(phase) * side + IDLE_ARM * breath;
    pose[arm.lower] = -0.12 - IDLE_ARM * breath;
  }
  return pose;
}

export const CLIPS: readonly Clip[] = [
  {
    name: "idle",
    fps: 3,
    poses: Array.from({ length: IDLE_FRAMES }, (_, frame) => idlePose((frame / IDLE_FRAMES) * 2 * Math.PI)),
  },
  {
    name: "walk",
    fps: 8,
    poses: Array.from({ length: WALK_FRAMES }, (_, frame) => walkPose(frame / WALK_FRAMES)),
  },
];

export function sheetFrames(clips: readonly Clip[]): {
  poses: Pose[];
  animations: Record<string, { frames: number[]; fps: number }>;
} {
  const poses: Pose[] = [];
  const animations: Record<string, { frames: number[]; fps: number }> = {};
  for (const clip of clips) {
    if (clip.poses.length === 0) throw new Error(`Clip "${clip.name}" has no poses`);
    if (clip.name in animations) throw new Error(`Duplicate clip "${clip.name}"`);
    animations[clip.name] = { frames: clip.poses.map((_, index) => poses.length + index), fps: clip.fps };
    poses.push(...clip.poses);
  }
  return { poses, animations };
}

function legReach(rig: Rig, leg: (typeof LEGS)[number]): number {
  const thigh = rig.joints[leg.upper].rotation.x;
  const shin = thigh + rig.joints[leg.lower].rotation.x;
  return hipToSole(rig.shape, thigh, shin, shin + rig.joints[leg.foot].rotation.x);
}

export function applyPose(rig: Rig, pose: Pose): void {
  for (const [name, group] of Object.entries(rig.joints) as [JointName, Rig["joints"][JointName]][]) {
    group.rotation.x = pose[name] ?? 0;
  }
  const lift = pose.lift ?? 0;
  for (const name of UPPER_BODY) rig.joints[name].position.y = lift;
  rig.joints.armLeft.position.y += rig.shape.shoulder.y;
  rig.joints.armRight.position.y += rig.shape.shoulder.y;
  const reach = Math.max(...LEGS.map((leg) => legReach(rig, leg)));
  rig.root.position.y = (reach - rig.shape.hip.y) * rig.shape.height;
  fitSkirts(rig);
}
