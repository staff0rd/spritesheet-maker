import type { Character } from "../core/compose";
import type { PartCatalog } from "../core/parts";
import { tintColor } from "../phaser/crowd";
import type { TintedPart } from "../scene/character";

export function outfitFor(catalog: PartCatalog, character: Character): { body: TintedPart; parts: TintedPart[] } {
  const picks = catalog.categories.flatMap((category) => {
    const part = character.parts[category.id];
    if (!part) return [];
    const variant = category.variants.find((option) => option.id === part.variant);
    if (!variant) throw new Error(`Unknown ${category.id} variant "${part.variant}"`);
    return [{ spec: { ...variant, category: category.id }, tint: tintColor(part.tint) }];
  });
  const body = picks.find((pick) => pick.spec.category === catalog.baseCategory);
  if (!body) throw new Error(`Character has no "${catalog.baseCategory}" part`);
  return { body, parts: picks.filter((pick) => pick !== body) };
}
