import { Color, type Material, MeshBasicMaterial, MeshLambertMaterial } from "three";
import { partRandom, type PartSpec } from "../core/parts";
import type { PartProvider } from "./parts/types";
import { bodyShape, createRig, DEFAULT_BODY_PARAMS, type Rig } from "./rig";
import { resolveParams } from "./parts/types";

const BASE_GREY = 0xd4d4d4;
const DETAIL_GREY = 0x8a8a8a;

export interface CharacterRequest {
  seed: number;
  body: PartSpec;
  part?: PartSpec;
}

type LayerMode = { depthOnly: true } | { depthOnly: false; tint?: number };

function addLayer(provider: PartProvider, rig: Rig, spec: PartSpec, seed: number, mode: LayerMode): void {
  const tint = new Color(mode.depthOnly ? 0xffffff : (mode.tint ?? 0xffffff));
  const [material, detail]: Material[] = mode.depthOnly
    ? [new MeshBasicMaterial({ colorWrite: false })]
    : [
        new MeshLambertMaterial({ color: new Color(BASE_GREY).multiply(tint), flatShading: true }),
        new MeshLambertMaterial({ color: new Color(DETAIL_GREY).multiply(tint), flatShading: true }),
      ];
  provider.build(spec, {
    rig,
    random: partRandom(seed, spec),
    material,
    detail: detail ?? material,
    hatted: spec.hatted ?? false,
    add(joint, object) {
      object.traverse((child) => {
        child.renderOrder = mode.depthOnly ? -1 : 0;
        child.userData.layer = spec.category;
      });
      rig.joints[joint].add(object);
    },
  });
}

function rigFor(body: PartSpec): Rig {
  return createRig(bodyShape(resolveParams(DEFAULT_BODY_PARAMS, body.params, `${body.category}/${body.id}`)));
}

export function buildCharacter(provider: PartProvider, { seed, body, part }: CharacterRequest): Rig {
  const rig = rigFor(body);
  addLayer(provider, rig, body, seed, part ? { depthOnly: true } : { depthOnly: false });
  if (part) addLayer(provider, rig, part, seed, { depthOnly: false });
  return rig;
}

export interface TintedPart {
  spec: PartSpec;
  tint: number;
}

export function buildDressedCharacter(provider: PartProvider, seed: number, body: TintedPart, parts: readonly TintedPart[]): Rig {
  const rig = rigFor(body.spec);
  for (const { spec, tint } of [body, ...parts]) addLayer(provider, rig, spec, seed, { depthOnly: false, tint });
  return rig;
}
