import { ConeGeometry, CylinderGeometry, type Material, type Mesh, Quaternion, SphereGeometry, Vector3 } from "three";
import type { RenderStyle } from "../../core/style";
import type { BodyShape } from "../rig";
import { ballGeometry, boxGeometry, latheMesh, mesh } from "./geometry";
import { definePart, type BuildContext } from "./types";

const HAIR_RADIUS = 0.15;
const HAT_RADIUS = 0.165;
const FACE_GAP = 0.75 * Math.PI;

const HEAD_SIDES: Record<RenderStyle, { dome: number; rings: number; crown: number; brim: number; spike: number }> = {
  blocky: { dome: 10, rings: 6, crown: 10, brim: 12, spike: 4 },
  smooth: { dome: 24, rings: 12, crown: 24, brim: 24, spike: 8 },
};

interface DomeOptions {
  radius: number;
  coverage: number;
  tilt: number;
  name: string;
  stretch?: number;
}

function dome(shape: BodyShape, style: RenderStyle, material: Material, { radius, coverage, tilt, name, stretch = 1 }: DomeOptions): Mesh {
  const sides = HEAD_SIDES[style];
  const geometry = new SphereGeometry(radius, sides.dome, sides.rings, 0, Math.PI * 2, 0, coverage * Math.PI);
  geometry.rotateX(-tilt);
  const result = mesh(geometry, material, name);
  const [x, y, z] = shape.skull.scale;
  result.scale.set(x, y * stretch, z);
  result.position.y = shape.skull.y;
  return result;
}

function sideBand(shape: BodyShape, style: RenderStyle, material: Material, from: number, to: number, radius: number): Mesh {
  const sides = HEAD_SIDES[style];
  const geometry = new SphereGeometry(
    radius,
    sides.dome,
    sides.rings,
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

function buildCrop({ rig: { shape }, style, material, add }: BuildContext, params: CropParams): void {
  add("head", dome(shape, style, material, { ...params, name: "hair" }));
}

type BobParams = { length: number };

function buildBob({ rig: { shape }, style, material, add }: BuildContext, params: BobParams): void {
  add("head", dome(shape, style, material, { radius: HAIR_RADIUS, coverage: 0.52, tilt: 0.25, name: "hair" }));
  add("head", sideBand(shape, style, material, 0.25, 0.25 + params.length, HAIR_RADIUS * 1.03));
}

type LongParams = { length: number };

function buildLong(context: BuildContext, params: LongParams): void {
  const { rig: { shape }, style, material, add } = context;
  buildBob(context, { length: 0.62 });
  const top = shape.skull.y - 0.02;
  const back = mesh(boxGeometry(style, 0.22, params.length, 0.05, 0.02), material, "hairBack");
  back.position.set(0, top - params.length / 2, -HAIR_RADIUS - 0.012);
  back.rotation.x = -0.12;
  add("head", back);
}

type SpikyParams = { spikes: number; spikeLength: number };

function buildSpiky({ rig: { shape }, style, material, random, add }: BuildContext, params: SpikyParams): void {
  add("head", dome(shape, style, material, { radius: HAIR_RADIUS, coverage: 0.5, tilt: 0.3, name: "hair" }));
  const [sx, sy, sz] = shape.skull.scale;
  const up = new Vector3(0, 1, 0);
  for (let index = 0; index < params.spikes; index++) {
    const theta = random() * 0.42 * Math.PI;
    const phi = random() * Math.PI * 2;
    const length = params.spikeLength * (0.7 + random() * 0.6);
    const direction = new Vector3(Math.sin(theta) * Math.cos(phi), Math.cos(theta), Math.sin(theta) * Math.sin(phi));
    const geometry = new ConeGeometry(0.032, length, HEAD_SIDES[style].spike);
    geometry.translate(0, length / 2, 0);
    const spike = mesh(geometry, material, "spike");
    spike.quaternion.copy(new Quaternion().setFromUnitVectors(up, direction));
    spike.position.set(direction.x * 0.13 * sx, shape.skull.y + direction.y * 0.13 * sy, direction.z * 0.13 * sz);
    add("head", spike);
  }
}

type BunParams = { size: number };

function buildBun({ rig: { shape }, style, material, add }: BuildContext, params: BunParams): void {
  add("head", dome(shape, style, material, { radius: HAIR_RADIUS, coverage: 0.55, tilt: 0.35, name: "hair" }));
  const bun = mesh(ballGeometry(style, params.size, 1), material, "bun");
  bun.position.set(0, shape.skull.y + 0.1, -0.12);
  add("head", bun);
}

type AfroParams = { size: number };

function buildAfro({ rig: { shape }, style, material, add }: BuildContext, params: AfroParams): void {
  const afro = mesh(ballGeometry(style, params.size, 1), material, "afro");
  afro.position.set(0, shape.skull.y + 0.07, -0.05);
  add("head", afro);
}

function buildBaseballCap({ rig: { shape }, style, material, detail, add }: BuildContext): void {
  add("head", dome(shape, style, material, { radius: HAT_RADIUS, coverage: 0.5, tilt: 0.12, name: "crown" }));
  const brim = mesh(boxGeometry(style, 0.2, 0.014, 0.13, 0.006), detail, "brim");
  brim.position.set(0, shape.skull.y + 0.03, HAT_RADIUS + 0.04);
  brim.rotation.x = 0.12;
  add("head", brim);
}

function buildBeanie({ rig: { shape }, style, material, detail, add }: BuildContext): void {
  add("head", dome(shape, style, material, { radius: HAT_RADIUS + 0.003, coverage: 0.55, tilt: 0.2, name: "crown", stretch: 1.12 }));
  add("head", dome(shape, style, detail, { radius: HAT_RADIUS + 0.012, coverage: 0.56, tilt: 0.2, name: "band", stretch: 1.05 }));
  const pompom = mesh(ballGeometry(style, 0.04, 0), detail, "pompom");
  pompom.position.set(0, shape.skull.y + HAT_RADIUS * shape.skull.scale[1] * 1.12 + 0.02, -0.02);
  add("head", pompom);
}

type BrimmedParams = { crownHeight: number; crownRadius: number; brimRadius: number; band: boolean };

function buildBrimmed({ rig: { shape }, style, material, detail, add }: BuildContext, params: BrimmedParams): void {
  const sides = HEAD_SIDES[style];
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
      sides.crown,
      material,
      "crown",
    ),
  );
  const brim = mesh(new CylinderGeometry(params.brimRadius, params.brimRadius, 0.012, sides.brim), material, "brim");
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
        sides.crown,
        detail,
        "band",
      ),
    );
  }
}

export const HEADWEAR_PARTS = [
  definePart({ category: "hair", kind: "crop", defaults: { coverage: 0.56, tilt: 0.35, radius: HAIR_RADIUS }, build: buildCrop }),
  definePart({ category: "hair", kind: "bob", defaults: { length: 0.5 }, build: buildBob }),
  definePart({ category: "hair", kind: "long", defaults: { length: 0.34 }, build: buildLong }),
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
