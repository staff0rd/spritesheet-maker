import { BoxGeometry, IcosahedronGeometry } from "three";
import { ARMS, LEGS, LIMB_SEGMENTS, TORSO_SEGMENTS } from "../rig";
import { enclosingShell, latheMesh, mesh, radiusAt, segmentShell } from "./geometry";
import { makeFittedSkirt } from "./skirtFit";
import { definePart, type BuildContext } from "./types";

const CLOTH_MARGIN = 0.018;
const SKIRT_DEPTH = 0.75;
const SKIRT_ROWS = 12;
const SKIRT_SECTOR = (2 * Math.PI) / TORSO_SEGMENTS;
const SKIRT_EDGE_SLOPE = (1 - Math.cos(SKIRT_SECTOR)) / (Math.sin(SKIRT_SECTOR) * SKIRT_DEPTH);

type ShirtParams = {
  sleeve: string;
  hem: number;
  thickness: number;
  collar: boolean;
  cuffs: boolean;
  hood: boolean;
};

function buildShirt({ rig: { shape }, material, detail, add }: BuildContext, params: ShirtParams): void {
  const margin = params.thickness;
  add("torso", latheMesh(enclosingShell(shape.torso, params.hem, Infinity, margin), TORSO_SEGMENTS, material, "shirt", shape.torsoDepth));

  if (params.sleeve !== "none") {
    const long = params.sleeve === "long";
    for (const arm of ARMS) {
      add(arm.upper, latheMesh(segmentShell(shape.upperArm, 0, long ? 1 : 0.5, margin), LIMB_SEGMENTS, material, "sleeve"));
      if (long) {
        add(arm.lower, latheMesh(segmentShell(shape.forearm, 0, 0.95, margin), LIMB_SEGMENTS, material, "sleeve"));
        if (params.cuffs) {
          add(arm.lower, latheMesh(segmentShell(shape.forearm, 0.82, 0.96, margin * 1.6), LIMB_SEGMENTS, detail, "cuff"));
        }
      }
    }
  }

  if (params.collar) {
    const radius = shape.neck.radius + margin + 0.014;
    const collar = latheMesh(
      [
        [radius, shape.neck.y - 0.04],
        [radius * 1.15, shape.neck.y + 0.06],
      ],
      LIMB_SEGMENTS,
      detail,
      "collar",
    );
    add("torso", collar);
  }

  if (params.hood) {
    const hood = mesh(new IcosahedronGeometry(0.1, 0), detail, "hood");
    hood.scale.set(1.3, 0.75, 0.7);
    hood.position.set(0, 1.5, -radiusAt(shape.torso, 1.5) * shape.torsoDepth - 0.02);
    add("torso", hood);
  }
}

type TrouserParams = {
  legLength: number;
  belt: boolean;
};

function buildTrousers({ rig: { shape }, material, detail, add }: BuildContext, params: TrouserParams): void {
  add("torso", latheMesh(enclosingShell(shape.torso, -Infinity, shape.waistY, CLOTH_MARGIN), TORSO_SEGMENTS, material, "pelvis", shape.torsoDepth));
  if (params.belt) {
    add("torso", latheMesh(enclosingShell(shape.torso, shape.waistY - 0.045, shape.waistY, CLOTH_MARGIN * 1.8), TORSO_SEGMENTS, detail, "belt", shape.torsoDepth));
  }

  const covered = params.legLength * (shape.thigh.length + shape.shin.length);
  const thighFraction = Math.min(1, covered / shape.thigh.length);
  const shinFraction = Math.max(0, (covered - shape.thigh.length) / shape.shin.length);
  for (const leg of LEGS) {
    add(leg.upper, latheMesh(segmentShell(shape.thigh, 0, thighFraction, CLOTH_MARGIN), LIMB_SEGMENTS, material, "trouserLeg"));
    if (shinFraction > 0) {
      add(leg.lower, latheMesh(segmentShell(shape.shin, 0, shinFraction, CLOTH_MARGIN), LIMB_SEGMENTS, material, "trouserLeg"));
    }
  }
}

type SkirtParams = {
  length: number;
  flare: number;
};

function buildSkirt({ rig: { shape }, material, detail, add }: BuildContext, params: SkirtParams): void {
  const hemY = shape.hip.y - params.length * (shape.thigh.length + shape.shin.length);
  const hipRadius = Math.max(radiusAt(shape.torso, 0.95), shape.hip.x + shape.thigh.top * Math.hypot(1, SKIRT_EDGE_SLOPE)) + CLOTH_MARGIN;
  const hemRadius = 0.2 * shape.build + params.flare;
  const panel = Array.from({ length: SKIRT_ROWS }, (_, row): [number, number] => {
    const t = row / SKIRT_ROWS;
    return [hemRadius + (hipRadius - hemRadius) * t, hemY + (0.95 - hemY) * t];
  });
  const skirt = latheMesh(
    [
      ...panel,
      [hipRadius, 0.95],
      [radiusAt(shape.torso, shape.waistY) + CLOTH_MARGIN, shape.waistY],
      [0, shape.waistY + CLOTH_MARGIN],
    ],
    TORSO_SEGMENTS,
    material,
    "skirt",
    SKIRT_DEPTH,
  );
  makeFittedSkirt(skirt);
  add("torso", skirt);
  add("torso", latheMesh(enclosingShell(shape.torso, shape.waistY - 0.04, shape.waistY, CLOTH_MARGIN * 2.4), TORSO_SEGMENTS, detail, "waistband", SKIRT_DEPTH));
}

type ShoeParams = {
  shaft: number;
};

function buildShoes({ rig: { shape }, material, detail, add }: BuildContext, params: ShoeParams): void {
  const { foot } = shape;
  for (const leg of LEGS) {
    const upper = mesh(new BoxGeometry(foot.width + 2 * CLOTH_MARGIN, foot.height + 2 * CLOTH_MARGIN, foot.depth + 2 * CLOTH_MARGIN), material, "shoe");
    upper.position.set(0, foot.y, foot.z);
    add(leg.lower, upper);

    const soleHeight = 0.026;
    const sole = mesh(new BoxGeometry(foot.width + 3 * CLOTH_MARGIN, soleHeight, foot.depth + 3.5 * CLOTH_MARGIN), detail, "sole");
    sole.position.set(0, foot.y - foot.height / 2 + soleHeight / 2 - 0.012, foot.z);
    add(leg.lower, sole);

    if (params.shaft > 0) {
      add(leg.lower, latheMesh(segmentShell(shape.shin, 1 - params.shaft, 1, CLOTH_MARGIN * 1.4), LIMB_SEGMENTS, material, "shaft"));
    }
  }
}

export const CLOTHING_PARTS = [
  definePart({
    category: "top",
    kind: "shirt",
    defaults: { sleeve: "short", hem: 0.98, thickness: CLOTH_MARGIN, collar: false, cuffs: false, hood: false },
    build: buildShirt,
  }),
  definePart({ category: "bottom", kind: "trousers", defaults: { legLength: 0.97, belt: false }, build: buildTrousers }),
  definePart({ category: "bottom", kind: "skirt", defaults: { length: 0.45, flare: 0.06 }, build: buildSkirt }),
  definePart({ category: "shoes", kind: "shoes", defaults: { shaft: 0 }, build: buildShoes }),
];
