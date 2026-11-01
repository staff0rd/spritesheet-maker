import { CylinderGeometry, SphereGeometry } from "three";
import { ARMS, DEFAULT_BODY_PARAMS, LEGS, LIMB_SEGMENTS, TORSO_SEGMENTS } from "../rig";
import { definePart, type BuildContext } from "./types";
import { ballGeometry, boxGeometry, footRounding, latheMesh, limbProfile, mesh, torsoProfile } from "./geometry";

function buildHumanoid({ rig: { shape }, material, add }: BuildContext): void {
  const joint = (radius: number, name: string) => mesh(ballGeometry(radius), material, name);

  add("torso", latheMesh(torsoProfile(shape), TORSO_SEGMENTS, material, "torso", shape.torsoDepth));

  const neck = mesh(new CylinderGeometry(shape.neck.radius, shape.neck.radius * 1.1, shape.neck.height, LIMB_SEGMENTS), material, "neck");
  neck.position.y = shape.neck.y;
  const skull = mesh(new SphereGeometry(shape.skull.radius, TORSO_SEGMENTS, TORSO_SEGMENTS / 2), material, "skull");
  skull.scale.set(...shape.skull.scale);
  skull.position.y = shape.skull.y;
  const nose = mesh(new SphereGeometry(0.02, 8, 6), material, "nose");
  nose.scale.set(0.8, 1.1, 1);
  nose.position.set(0, shape.skull.y - 0.02, shape.skull.radius);
  add("head", neck);
  add("head", skull);
  add("head", nose);

  for (const arm of ARMS) {
    add(arm.upper, latheMesh(limbProfile(shape.upperArm), LIMB_SEGMENTS, material, "upperArm"));
    add(arm.lower, latheMesh(limbProfile(shape.forearm), LIMB_SEGMENTS, material, "forearm"));
    add(arm.lower, joint(Math.max(shape.upperArm.bottom, shape.forearm.top), "elbow"));
    const hand = mesh(ballGeometry(shape.handRadius), material, "hand");
    hand.scale.set(0.9, 1.2, 0.75);
    hand.position.y = -shape.forearm.length - 0.03;
    add(arm.lower, hand);
  }

  for (const leg of LEGS) {
    add(leg.upper, latheMesh(limbProfile(shape.thigh), LIMB_SEGMENTS, material, "thigh"));
    add(leg.lower, latheMesh(limbProfile(shape.shin), LIMB_SEGMENTS, material, "shin"));
    add(leg.lower, joint(Math.max(shape.thigh.bottom, shape.shin.top), "knee"));
    const { width, height, depth } = shape.foot;
    const foot = mesh(boxGeometry(width, height, depth, footRounding(shape)), material, "foot");
    foot.position.set(0, shape.foot.y, shape.foot.z);
    add(leg.lower, foot);
  }
}

export const BODY_PARTS = [
  definePart({ category: "body", kind: "humanoid", defaults: DEFAULT_BODY_PARAMS, build: buildHumanoid }),
];
