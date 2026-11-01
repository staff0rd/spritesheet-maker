import type { Material, Object3D } from "three";
import type { PartParams, PartSpec } from "../../core/parts";
import type { Random } from "../../core/random";
import type { JointName, Rig } from "../rig";

export interface BuildContext {
  rig: Rig;
  random: Random;
  material: Material;
  detail: Material;
  hatted: boolean;
  add(joint: JointName, object: Object3D): void;
}

export interface PartProvider {
  canBuild(spec: PartSpec): boolean;
  build(spec: PartSpec, context: BuildContext): void;
}

export interface ProceduralPart<P extends PartParams> {
  category: PartSpec["category"];
  kind: string;
  defaults: P;
  build(context: BuildContext, params: P): void;
}

export function definePart<P extends PartParams>(definition: ProceduralPart<P>): ProceduralPart<P> {
  return definition;
}

export function resolveParams<P extends PartParams>(defaults: P, params: PartParams, label: string): P {
  for (const [key, value] of Object.entries(params)) {
    if (!(key in defaults)) throw new Error(`${label}: unknown param "${key}"`);
    if (typeof value !== typeof defaults[key]) throw new Error(`${label}: param "${key}" must be a ${typeof defaults[key]}`);
  }
  return { ...defaults, ...params };
}
