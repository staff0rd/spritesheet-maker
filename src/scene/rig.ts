import { Group } from "three";

export type Profile = readonly (readonly [radius: number, y: number])[];

export interface Segment {
  length: number;
  top: number;
  bottom: number;
}

export type BodyParams = {
  height: number;
  build: number;
  shoulders: number;
  hips: number;
};

export const DEFAULT_BODY_PARAMS: BodyParams = { height: 1, build: 1, shoulders: 1, hips: 1 };

export const TORSO_SEGMENTS = 24;
export const LIMB_SEGMENTS = 16;

export interface BodyShape {
  height: number;
  build: number;
  torso: Profile;
  torsoDepth: number;
  waistY: number;
  hip: { x: number; y: number };
  thigh: Segment;
  shin: Segment;
  foot: { width: number; height: number; depth: number; y: number; z: number };
  shoulder: { x: number; y: number; splay: number };
  upperArm: Segment;
  forearm: Segment;
  handRadius: number;
  neck: { radius: number; y: number; height: number };
  skull: { radius: number; y: number; scale: readonly [number, number, number] };
}

export function bodyShape({ height, build, shoulders, hips }: BodyParams): BodyShape {
  const hipWidth = build * hips;
  const shoulderWidth = build * shoulders;
  const hipY = 0.92;
  const thigh = { length: 0.46, top: 0.085 * build, bottom: 0.065 * build };
  const shin = { length: 0.42, top: 0.06 * build, bottom: 0.045 * build };
  const footHeight = 0.06;

  return {
    height,
    build,
    torso: [
      [0, 0.86],
      [0.16 * hipWidth, 0.86],
      [0.175 * hipWidth, 0.95],
      [0.155 * build, 1.08],
      [0.19 * shoulderWidth, 1.36],
      [0.2 * shoulderWidth, 1.47],
      [0.13 * shoulderWidth, 1.55],
      [0, 1.56],
    ],
    torsoDepth: 0.6,
    waistY: 1.07,
    hip: { x: 0.1 * hipWidth, y: hipY },
    thigh,
    shin,
    foot: {
      width: 0.1 * build,
      height: footHeight,
      depth: 0.22,
      y: -(hipY - thigh.length) + footHeight / 2,
      z: 0.05,
    },
    shoulder: { x: 0.23 * shoulderWidth, y: 1.44, splay: 0.08 },
    upperArm: { length: 0.3, top: 0.055 * build, bottom: 0.045 * build },
    forearm: { length: 0.27, top: 0.045 * build, bottom: 0.035 * build },
    handRadius: 0.045,
    neck: { radius: 0.052 * build, y: 1.56, height: 0.12 },
    skull: { radius: 0.12, y: 1.7, scale: [0.9, 1.05, 1] },
  };
}

export type JointName =
  | "torso"
  | "head"
  | "armLeft"
  | "elbowLeft"
  | "armRight"
  | "elbowRight"
  | "legLeft"
  | "kneeLeft"
  | "legRight"
  | "kneeRight";

export const ARMS = [
  { upper: "armLeft", lower: "elbowLeft" },
  { upper: "armRight", lower: "elbowRight" },
] as const;

export const LEGS = [
  { upper: "legLeft", lower: "kneeLeft" },
  { upper: "legRight", lower: "kneeRight" },
] as const;

export interface Rig {
  root: Group;
  joints: Record<JointName, Group>;
  shape: BodyShape;
}

function joint(name: JointName, parent: Group): Group {
  const group = new Group();
  group.name = name;
  parent.add(group);
  return group;
}

export function createRig(shape: BodyShape): Rig {
  const root = new Group();
  root.name = "character";
  root.scale.setScalar(shape.height);

  const torso = joint("torso", root);
  const head = joint("head", root);

  const armLeft = joint("armLeft", root);
  const armRight = joint("armRight", root);
  for (const [arm, side] of [
    [armLeft, 1],
    [armRight, -1],
  ] as const) {
    arm.position.set(shape.shoulder.x * side, shape.shoulder.y, 0);
    arm.rotation.z = shape.shoulder.splay * side;
  }
  const elbowLeft = joint("elbowLeft", armLeft);
  const elbowRight = joint("elbowRight", armRight);
  elbowLeft.position.y = -shape.upperArm.length;
  elbowRight.position.y = -shape.upperArm.length;

  const legLeft = joint("legLeft", root);
  const legRight = joint("legRight", root);
  legLeft.position.set(shape.hip.x, shape.hip.y, 0);
  legRight.position.set(-shape.hip.x, shape.hip.y, 0);
  const kneeLeft = joint("kneeLeft", legLeft);
  const kneeRight = joint("kneeRight", legRight);
  kneeLeft.position.y = -shape.thigh.length;
  kneeRight.position.y = -shape.thigh.length;

  return {
    root,
    shape,
    joints: { torso, head, armLeft, elbowLeft, armRight, elbowRight, legLeft, kneeLeft, legRight, kneeRight },
  };
}
