import { BoxGeometry, CylinderGeometry, IcosahedronGeometry } from "three";
import { ARMS, DEFAULT_BODY_PARAMS, LEGS, LIMB_SEGMENTS, TORSO_SEGMENTS } from "../rig";
import { definePart, type BuildContext } from "./types";
import { latheMesh, mesh, segmentProfile } from "./geometry";

function buildHumanoid({ rig: { shape }, material, add }: BuildContext): void {
  add("torso", latheMesh(shape.torso, TORSO_SEGMENTS, material, "torso", shape.torsoDepth));

  const neck = mesh(new CylinderGeometry(shape.neck.radius, shape.neck.radius * 1.1, shape.neck.height, LIMB_SEGMENTS), material, "neck");
  neck.position.y = shape.neck.y;
  const skull = mesh(new IcosahedronGeometry(shape.skull.radius, 1), material, "skull");
  skull.scale.set(...shape.skull.scale);
  skull.position.y = shape.skull.y;
  const nose = mesh(new BoxGeometry(0.03, 0.04, 0.04), material, "nose");
  nose.position.set(0, shape.skull.y - 0.02, shape.skull.radius);
  add("head", neck);
  add("head", skull);
  add("head", nose);

  for (const arm of ARMS) {
    add(arm.upper, latheMesh(segmentProfile(shape.upperArm), LIMB_SEGMENTS, material, "upperArm"));
    add(arm.lower, latheMesh(segmentProfile(shape.forearm), LIMB_SEGMENTS, material, "forearm"));
    const hand = mesh(new IcosahedronGeometry(shape.handRadius, 0), material, "hand");
    hand.position.y = -shape.forearm.length - 0.03;
    add(arm.lower, hand);
  }

  for (const leg of LEGS) {
    add(leg.upper, latheMesh(segmentProfile(shape.thigh), LIMB_SEGMENTS, material, "thigh"));
    add(leg.lower, latheMesh(segmentProfile(shape.shin), LIMB_SEGMENTS, material, "shin"));
    const foot = mesh(new BoxGeometry(shape.foot.width, shape.foot.height, shape.foot.depth), material, "foot");
    foot.position.set(0, shape.foot.y, shape.foot.z);
    add(leg.lower, foot);
  }
}

export const BODY_PARTS = [
  definePart({ category: "body", kind: "humanoid", defaults: DEFAULT_BODY_PARAMS, build: buildHumanoid }),
];
