import type { PartParams } from "../../core/parts";
import { BODY_PARTS } from "./body";
import { CLOTHING_PARTS } from "./clothing";
import { HEADWEAR_PARTS } from "./headwear";
import { resolveParams, type PartProvider, type ProceduralPart } from "./types";

const DEFINITIONS: readonly ProceduralPart<PartParams>[] = [...BODY_PARTS, ...CLOTHING_PARTS, ...HEADWEAR_PARTS];

function key(category: string, kind: string): string {
  return `${category}/${kind}`;
}

function createProceduralProvider(definitions: readonly ProceduralPart<PartParams>[]): PartProvider {
  const byKey = new Map(definitions.map((definition) => [key(definition.category, definition.kind), definition]));
  if (byKey.size !== definitions.length) throw new Error("Procedural part kinds must be unique per category");

  return {
    canBuild: (spec) => byKey.has(key(spec.category, spec.kind)),
    build(spec, context) {
      const definition = byKey.get(key(spec.category, spec.kind));
      if (!definition) throw new Error(`No procedural part "${spec.kind}" for category "${spec.category}"`);
      definition.build(context, resolveParams(definition.defaults, spec.params, `${spec.category}/${spec.id}`));
    },
  };
}

export const proceduralProvider = createProceduralProvider(DEFINITIONS);
