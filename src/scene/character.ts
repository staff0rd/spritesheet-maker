import { Color, type Material, Mesh, MeshBasicMaterial, MeshLambertMaterial } from "three";
import { frontSlot, partRandom, type PartSpec } from "../core/parts";
import type { PartLayer, PartProvider } from "./parts/types";
import { bodyShape, createRig, DEFAULT_BODY_PARAMS, type Rig } from "./rig";
import { resolveParams } from "./parts/types";

const BASE_GREY = 0xd4d4d4;
const DETAIL_GREY = 0x8a8a8a;

export interface CharacterRequest {
  seed: number;
  body: PartSpec;
  part?: PartSpec;
  front?: boolean;
}

type Paint = "none" | "all" | PartLayer;

function depthOnly(material: Material): MeshBasicMaterial {
  return new MeshBasicMaterial({ colorWrite: false, side: material.side });
}

function addLayer(provider: PartProvider, rig: Rig, spec: PartSpec, seed: number, paint: Paint, tint = 0xffffff): void {
  const colour = new Color(tint);
  const material = new MeshLambertMaterial({ color: new Color(BASE_GREY).multiply(colour), flatShading: true });
  const detail = new MeshLambertMaterial({ color: new Color(DETAIL_GREY).multiply(colour), flatShading: true });
  provider.build(spec, {
    rig,
    random: partRandom(seed, spec),
    material,
    detail,
    add(joint, object, layer = "main") {
      if (layer === "front" && !spec.front) throw new Error(`${spec.category}/${spec.id} adds a front layer but is not marked front`);
      const painted = paint === "all" || paint === layer;
      if (!painted && paint === "main") return;
      object.traverse((child) => {
        child.renderOrder = painted ? 0 : -1;
        child.userData.layer = layer === "front" ? frontSlot(spec.category) : spec.category;
        if (!painted && child instanceof Mesh) child.material = depthOnly(child.material as Material);
      });
      rig.joints[joint].add(object);
    },
  });
}

function rigFor(body: PartSpec): Rig {
  return createRig(bodyShape(resolveParams(DEFAULT_BODY_PARAMS, body.params, `${body.category}/${body.id}`)));
}

export function buildCharacter(provider: PartProvider, { seed, body, part, front = false }: CharacterRequest): Rig {
  if (front && !part?.front) throw new Error("A front sheet needs a part with a front layer");
  const rig = rigFor(body);
  addLayer(provider, rig, body, seed, part ? "none" : "all");
  if (part) addLayer(provider, rig, part, seed, front ? "front" : "main");
  return rig;
}

export interface TintedPart {
  spec: PartSpec;
  tint: number;
}

export function buildDressedCharacter(provider: PartProvider, seed: number, body: TintedPart, parts: readonly TintedPart[]): Rig {
  const rig = rigFor(body.spec);
  for (const { spec, tint } of [body, ...parts]) addLayer(provider, rig, spec, seed, "all", tint);
  return rig;
}
