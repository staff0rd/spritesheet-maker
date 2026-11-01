import { type Group, type Material, MeshBasicMaterial, MeshLambertMaterial } from "three";
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

function addLayer(provider: PartProvider, rig: Rig, spec: PartSpec, seed: number, depthOnly: boolean): void {
  const [material, detail]: Material[] = depthOnly
    ? [new MeshBasicMaterial({ colorWrite: false })]
    : [
        new MeshLambertMaterial({ color: BASE_GREY, flatShading: true }),
        new MeshLambertMaterial({ color: DETAIL_GREY, flatShading: true }),
      ];
  provider.build(spec, {
    rig,
    random: partRandom(seed, spec),
    material,
    detail: detail ?? material,
    add(joint, object) {
      object.traverse((child) => {
        child.renderOrder = depthOnly ? -1 : 0;
        child.userData.layer = spec.category;
      });
      rig.joints[joint].add(object);
    },
  });
}

export function buildCharacter(provider: PartProvider, { seed, body, part }: CharacterRequest): Group {
  const rig = createRig(bodyShape(resolveParams(DEFAULT_BODY_PARAMS, body.params, `${body.category}/${body.id}`)));
  addLayer(provider, rig, body, seed, part !== undefined);
  if (part) addLayer(provider, rig, part, seed, false);
  return rig.root;
}
