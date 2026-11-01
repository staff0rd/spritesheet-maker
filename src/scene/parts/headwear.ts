import {
  BoxGeometry,
  BufferGeometry,
  ConeGeometry,
  CylinderGeometry,
  DoubleSide,
  Float32BufferAttribute,
  IcosahedronGeometry,
  type Material,
  MathUtils,
  type Mesh,
  Quaternion,
  SphereGeometry,
  Vector3,
} from "three";
import type { BodyShape } from "../rig";
import { collarProfile, HOOD_RADIUS, HOOD_SCALE, hoodCentre } from "./clothing";
import { latheMesh, mesh, radiusAt } from "./geometry";
import { definePart, type BuildContext } from "./types";

const HAIR_RADIUS = 0.15;
const HAT_RADIUS = 0.165;
const FACE_GAP = 0.75 * Math.PI;

interface DomeOptions {
  radius: number;
  coverage: number;
  tilt: number;
  name: string;
  stretch?: number;
}

function dome(shape: BodyShape, material: Material, { radius, coverage, tilt, name, stretch = 1 }: DomeOptions): Mesh {
  const geometry = new SphereGeometry(radius, 10, 6, 0, Math.PI * 2, 0, coverage * Math.PI);
  geometry.rotateX(-tilt);
  const result = mesh(geometry, material, name);
  const [x, y, z] = shape.skull.scale;
  result.scale.set(x, y * stretch, z);
  result.position.y = shape.skull.y;
  return result;
}

function sideBand(shape: BodyShape, material: Material, from: number, to: number, radius: number): Mesh {
  const geometry = new SphereGeometry(
    radius,
    10,
    6,
    Math.PI / 2 + FACE_GAP / 2,
    Math.PI * 2 - FACE_GAP,
    from * Math.PI,
    (to - from) * Math.PI,
  );
  const result = mesh(geometry, material, "hairSides");
  const [x, y, z] = shape.skull.scale;
  result.scale.set(x * 1.05, y, z * 1.04);
  result.position.y = shape.skull.y;
  return result;
}

type CropParams = { coverage: number; tilt: number; radius: number };

function buildCrop({ rig: { shape }, material, add }: BuildContext, params: CropParams): void {
  add("head", dome(shape, material, { ...params, name: "hair" }));
}

type BobParams = { length: number };

function buildBob({ rig: { shape }, material, add }: BuildContext, params: BobParams): void {
  add("head", dome(shape, material, { radius: HAIR_RADIUS, coverage: 0.52, tilt: 0.25, name: "hair" }));
  add("head", sideBand(shape, material, 0.25, 0.25 + params.length, HAIR_RADIUS * 1.03));
}

type LongParams = { length: number };

const THICKEST_TOP = 0.03;
const CURTAIN_AIR = 0.012;
const CURTAIN_BULGE = 0.015;
const CURTAIN_COLUMNS = 16;
const CURTAIN_ROW_SPACING = 0.05;
const CURTAIN_ARM_GAP = 0.01;
const CURTAIN_TIP_TAPER = 0.85;
const CROWN_ANGLES = [0, 0.12, 0.24, 0.34, 0.42, 0.5].map((fraction) => fraction * Math.PI);

function backClearance(shape: BodyShape, x: number, y: number): number {
  let depth = 0;
  const torsoTop = Math.max(...shape.torso.map(([, profileY]) => profileY)) + THICKEST_TOP;
  if (y <= torsoTop) {
    const radius = radiusAt(shape.torso, y) + THICKEST_TOP;
    if (Math.abs(x) < radius) depth = shape.torsoDepth * Math.sqrt(radius ** 2 - x ** 2);
  }
  const [[lowRadius, lowY], [highRadius, highY]] = collarProfile(shape, THICKEST_TOP);
  if (y >= lowY && y <= highY) {
    const radius = MathUtils.lerp(lowRadius, highRadius, (y - lowY) / (highY - lowY));
    if (Math.abs(x) < radius) depth = Math.max(depth, Math.sqrt(radius ** 2 - x ** 2));
  }
  const [, hoodY, hoodZ] = hoodCentre(shape);
  const [hoodX, hoodHeight, hoodDepth] = HOOD_SCALE.map((scale) => scale * HOOD_RADIUS);
  const insideHood = 1 - (x / hoodX) ** 2 - ((y - hoodY) / hoodHeight) ** 2;
  if (insideHood > 0) depth = Math.max(depth, -hoodZ + hoodDepth * Math.sqrt(insideHood));
  return depth > 0 ? depth + CURTAIN_AIR : 0;
}

function curtainRow(gap: number, point: (phi: number) => Vector3): Vector3[] {
  return Array.from({ length: CURTAIN_COLUMNS + 1 }, (_, column) =>
    point(Math.PI - ((2 * column) / CURTAIN_COLUMNS - 1) * (Math.PI - gap)),
  );
}

function curtainRows(shape: BodyShape, length: number): Vector3[][] {
  const [sx, sy, sz] = shape.skull.scale;
  const head = { x: HAIR_RADIUS * sx * 1.05, y: HAIR_RADIUS * sy, z: HAIR_RADIUS * sz * 1.04 };
  const bodyWidth = Math.min(head.x, shape.shoulder.x - shape.upperArm.top - CURTAIN_ARM_GAP);
  const torsoTop = Math.max(...shape.torso.map(([, y]) => y));

  const crown = CROWN_ANGLES.map((angle) =>
    curtainRow((FACE_GAP / 2) * MathUtils.smoothstep(angle, 0.2 * Math.PI, 0.4 * Math.PI), (phi) =>
      new Vector3(
        head.x * Math.sin(angle) * Math.sin(phi),
        shape.skull.y + head.y * Math.cos(angle),
        head.z * Math.sin(angle) * Math.cos(phi),
      ),
    ),
  );

  const steps = Math.ceil(length / CURTAIN_ROW_SPACING);
  const hang = Array.from({ length: steps }, (_, step) => {
    const drop = (length * (step + 1)) / steps;
    const y = shape.skull.y - drop;
    const gap = MathUtils.lerp(FACE_GAP / 2, Math.PI / 2, MathUtils.smoothstep(drop, 0, 0.1));
    const blend = 1 - MathUtils.smoothstep(y, torsoTop, shape.skull.y - 0.06);
    const taper = step === steps - 1 ? CURTAIN_TIP_TAPER : 1;
    return curtainRow(gap, (phi) => {
      const x = MathUtils.lerp(head.x, bodyWidth, blend) * taper * Math.sin(phi);
      const clearance = backClearance(shape, x, y);
      const hugBack = -clearance - CURTAIN_BULGE * Math.max(0, -Math.cos(phi));
      const z = MathUtils.lerp(head.z * Math.cos(phi), hugBack, blend);
      return new Vector3(x, y, clearance > 0 ? Math.min(z, -clearance) : z);
    });
  });

  return [...crown, ...hang];
}

function gridGeometry(rows: Vector3[][]): BufferGeometry {
  const width = rows[0].length;
  const index: number[] = [];
  for (let row = 0; row < rows.length - 1; row++) {
    for (let column = 0; column < width - 1; column++) {
      const a = row * width + column;
      index.push(a, a + width, a + 1, a + 1, a + width, a + width + 1);
    }
  }
  const geometry = new BufferGeometry();
  geometry.setAttribute("position", new Float32BufferAttribute(rows.flat().flatMap((vertex) => vertex.toArray()), 3));
  geometry.setIndex(index);
  geometry.computeVertexNormals();
  return geometry;
}

function buildLong({ rig: { shape }, material, add }: BuildContext, params: LongParams): void {
  const doubleSided = material.clone();
  doubleSided.side = DoubleSide;
  add("head", mesh(gridGeometry(curtainRows(shape, params.length)), doubleSided, "hair"));
}

type SpikyParams = { spikes: number; spikeLength: number };

function buildSpiky({ rig: { shape }, material, random, add }: BuildContext, params: SpikyParams): void {
  add("head", dome(shape, material, { radius: HAIR_RADIUS, coverage: 0.5, tilt: 0.3, name: "hair" }));
  const [sx, sy, sz] = shape.skull.scale;
  const up = new Vector3(0, 1, 0);
  for (let index = 0; index < params.spikes; index++) {
    const theta = random() * 0.42 * Math.PI;
    const phi = random() * Math.PI * 2;
    const length = params.spikeLength * (0.7 + random() * 0.6);
    const direction = new Vector3(Math.sin(theta) * Math.cos(phi), Math.cos(theta), Math.sin(theta) * Math.sin(phi));
    const geometry = new ConeGeometry(0.032, length, 4);
    geometry.translate(0, length / 2, 0);
    const spike = mesh(geometry, material, "spike");
    spike.quaternion.copy(new Quaternion().setFromUnitVectors(up, direction));
    spike.position.set(direction.x * 0.13 * sx, shape.skull.y + direction.y * 0.13 * sy, direction.z * 0.13 * sz);
    add("head", spike);
  }
}

type BunParams = { size: number };

function buildBun({ rig: { shape }, material, add }: BuildContext, params: BunParams): void {
  add("head", dome(shape, material, { radius: HAIR_RADIUS, coverage: 0.55, tilt: 0.35, name: "hair" }));
  const bun = mesh(new IcosahedronGeometry(params.size, 1), material, "bun");
  bun.position.set(0, shape.skull.y + 0.1, -0.12);
  add("head", bun);
}

type AfroParams = { size: number };

function buildAfro({ rig: { shape }, material, add }: BuildContext, params: AfroParams): void {
  const afro = mesh(new IcosahedronGeometry(params.size, 1), material, "afro");
  afro.position.set(0, shape.skull.y + 0.07, -0.05);
  add("head", afro);
}

function buildBaseballCap({ rig: { shape }, material, detail, add }: BuildContext): void {
  add("head", dome(shape, material, { radius: HAT_RADIUS, coverage: 0.5, tilt: 0.12, name: "crown" }));
  const brim = mesh(new BoxGeometry(0.2, 0.014, 0.13), detail, "brim");
  brim.position.set(0, shape.skull.y + 0.03, HAT_RADIUS + 0.04);
  brim.rotation.x = 0.12;
  add("head", brim);
}

function buildBeanie({ rig: { shape }, material, detail, add }: BuildContext): void {
  add("head", dome(shape, material, { radius: HAT_RADIUS + 0.003, coverage: 0.55, tilt: 0.2, name: "crown", stretch: 1.12 }));
  add("head", dome(shape, detail, { radius: HAT_RADIUS + 0.012, coverage: 0.56, tilt: 0.2, name: "band", stretch: 1.05 }));
  const pompom = mesh(new IcosahedronGeometry(0.04, 0), detail, "pompom");
  pompom.position.set(0, shape.skull.y + HAT_RADIUS * shape.skull.scale[1] * 1.12 + 0.02, -0.02);
  add("head", pompom);
}

type BrimmedParams = { crownHeight: number; crownRadius: number; brimRadius: number; band: boolean };

function buildBrimmed({ rig: { shape }, material, detail, add }: BuildContext, params: BrimmedParams): void {
  const base = shape.skull.y + 0.06;
  const { crownRadius, crownHeight } = params;
  add(
    "head",
    latheMesh(
      [
        [crownRadius, base],
        [crownRadius * 0.94, base + crownHeight],
        [0, base + crownHeight],
      ],
      10,
      material,
      "crown",
    ),
  );
  const brim = mesh(new CylinderGeometry(params.brimRadius, params.brimRadius, 0.012, 12), material, "brim");
  brim.position.y = base;
  add("head", brim);
  if (params.band) {
    add(
      "head",
      latheMesh(
        [
          [crownRadius + 0.006, base],
          [crownRadius * 0.99 + 0.006, base + 0.04],
        ],
        10,
        detail,
        "band",
      ),
    );
  }
}

export const HEADWEAR_PARTS = [
  definePart({ category: "hair", kind: "crop", defaults: { coverage: 0.56, tilt: 0.35, radius: HAIR_RADIUS }, build: buildCrop }),
  definePart({ category: "hair", kind: "bob", defaults: { length: 0.5 }, build: buildBob }),
  definePart({ category: "hair", kind: "long", defaults: { length: 0.42 }, build: buildLong }),
  definePart({ category: "hair", kind: "spiky", defaults: { spikes: 11, spikeLength: 0.09 }, build: buildSpiky }),
  definePart({ category: "hair", kind: "bun", defaults: { size: 0.065 }, build: buildBun }),
  definePart({ category: "hair", kind: "afro", defaults: { size: 0.17 }, build: buildAfro }),
  definePart({ category: "hat", kind: "baseball-cap", defaults: {}, build: buildBaseballCap }),
  definePart({ category: "hat", kind: "beanie", defaults: {}, build: buildBeanie }),
  definePart({
    category: "hat",
    kind: "brimmed",
    defaults: { crownHeight: 0.13, crownRadius: 0.155, brimRadius: 0.3, band: true },
    build: buildBrimmed,
  }),
];
