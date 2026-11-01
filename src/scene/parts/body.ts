import { BoxGeometry, type BufferGeometry, CylinderGeometry, IcosahedronGeometry, SphereGeometry } from "three";
import { RoundedBoxGeometry } from "three/examples/jsm/geometries/RoundedBoxGeometry.js";
import { ARMS, DEFAULT_BODY_PARAMS, LEGS, type Segment, STYLE_SEGMENTS } from "../rig";
import { definePart, type BuildContext } from "./types";
import { capsuleProfile, latheMesh, mesh, roundedProfile, segmentProfile } from "./geometry";

function buildHumanoid({ rig: { shape }, style, material, add }: BuildContext): void {
  const smooth = style === "smooth";
  const segments = STYLE_SEGMENTS[style];
  const limbProfile = (segment: Segment) => (smooth ? capsuleProfile(segment) : segmentProfile(segment));
  const ball = (radius: number, detail: number): BufferGeometry =>
    smooth ? new SphereGeometry(radius, segments.limb, segments.limb / 2 + 2) : new IcosahedronGeometry(radius, detail);
  const joint = (radius: number, name: string) => mesh(new SphereGeometry(radius, segments.limb, segments.limb / 2 + 2), material, name);

  add("torso", latheMesh(smooth ? roundedProfile(shape.torso) : shape.torso, segments.torso, material, "torso", shape.torsoDepth));

  const neck = mesh(new CylinderGeometry(shape.neck.radius, shape.neck.radius * 1.1, shape.neck.height, segments.limb), material, "neck");
  neck.position.y = shape.neck.y;
  const skull = mesh(smooth ? new SphereGeometry(shape.skull.radius, segments.torso, segments.torso / 2) : new IcosahedronGeometry(shape.skull.radius, 1), material, "skull");
  skull.scale.set(...shape.skull.scale);
  skull.position.y = shape.skull.y;
  const nose = mesh(smooth ? new SphereGeometry(0.02, 8, 6) : new BoxGeometry(0.03, 0.04, 0.04), material, "nose");
  if (smooth) nose.scale.set(0.8, 1.1, 1);
  nose.position.set(0, shape.skull.y - 0.02, shape.skull.radius);
  add("head", neck);
  add("head", skull);
  add("head", nose);

  for (const arm of ARMS) {
    add(arm.upper, latheMesh(limbProfile(shape.upperArm), segments.limb, material, "upperArm"));
    add(arm.lower, latheMesh(limbProfile(shape.forearm), segments.limb, material, "forearm"));
    if (smooth) add(arm.lower, joint(Math.max(shape.upperArm.bottom, shape.forearm.top), "elbow"));
    const hand = mesh(ball(shape.handRadius, 0), material, "hand");
    if (smooth) hand.scale.set(0.9, 1.2, 0.75);
    hand.position.y = -shape.forearm.length - 0.03;
    add(arm.lower, hand);
  }

  for (const leg of LEGS) {
    add(leg.upper, latheMesh(limbProfile(shape.thigh), segments.limb, material, "thigh"));
    add(leg.lower, latheMesh(limbProfile(shape.shin), segments.limb, material, "shin"));
    if (smooth) add(leg.lower, joint(Math.max(shape.thigh.bottom, shape.shin.top), "knee"));
    const { width, height, depth } = shape.foot;
    const foot = mesh(
      smooth ? new RoundedBoxGeometry(width, height, depth, 3, Math.min(width, height) * 0.45) : new BoxGeometry(width, height, depth),
      material,
      "foot",
    );
    foot.position.set(0, shape.foot.y, shape.foot.z);
    add(leg.lower, foot);
  }
}

export const BODY_PARTS = [
  definePart({ category: "body", kind: "humanoid", defaults: DEFAULT_BODY_PARAMS, build: buildHumanoid }),
];
