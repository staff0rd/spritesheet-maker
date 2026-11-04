import { fitSkirts } from "./parts/skirtFit";
import { ARMS, LEGS, type JointName, type Rig } from "./rig";

export type Pose = Partial<Record<JointName | "lift", number>>;

const UPPER_BODY = ["torso", "head", "armLeft", "armRight"] as const;

interface Clip {
  name: string;
  fps: number;
  poses: Pose[];
}

const WALK_FRAMES = 6;
const WALK_THIGH = 0.45;
const WALK_KNEE = 0.75;
const WALK_ARM = 0.4;
const WALK_ELBOW = -0.3;
const IDLE_FRAMES = 6;
const IDLE_LIFT = 0.028;
const IDLE_ARM = 0.06;

function walkPose(phase: number): Pose {
  const swing = Math.sin(phase);
  const pose: Pose = {};
  for (const [index, side] of [1, -1].entries()) {
    const leg = LEGS[index];
    const arm = ARMS[index];
    pose[leg.upper] = -WALK_THIGH * swing * side;
    pose[leg.lower] = WALK_KNEE * Math.max(0, Math.cos(phase) * side);
    pose[arm.upper] = WALK_ARM * swing * side;
    pose[arm.lower] = WALK_ELBOW;
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
    poses: Array.from({ length: WALK_FRAMES }, (_, frame) => walkPose((frame / WALK_FRAMES) * 2 * Math.PI)),
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

function legReach(rig: Rig, upper: JointName, lower: JointName): number {
  const { shape, joints } = rig;
  const thigh = joints[upper].rotation.x;
  const shin = thigh + joints[lower].rotation.x;
  return shape.thigh.length * Math.cos(thigh) + (shape.hip.y - shape.thigh.length) * Math.cos(shin);
}

export function applyPose(rig: Rig, pose: Pose): void {
  poseJoints(rig, pose);
  fitSkirts(rig);
}

export function poseJoints(rig: Rig, pose: Pose): void {
  for (const [name, group] of Object.entries(rig.joints) as [JointName, Rig["joints"][JointName]][]) {
    group.rotation.x = pose[name] ?? 0;
  }
  const lift = pose.lift ?? 0;
  for (const name of UPPER_BODY) rig.joints[name].position.y = lift;
  rig.joints.armLeft.position.y += rig.shape.shoulder.y;
  rig.joints.armRight.position.y += rig.shape.shoulder.y;
  const reach = Math.max(...LEGS.map((leg) => legReach(rig, leg.upper, leg.lower)));
  rig.root.position.y = (reach - rig.shape.hip.y) * rig.shape.height;
}
