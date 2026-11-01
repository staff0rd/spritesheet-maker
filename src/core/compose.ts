import type { Direction } from "./directions";
import type { Manifest } from "./manifest";
import { slotCategory, type CategoryId, type DrawSlot, type TintGroup } from "./parts";
import type { Random } from "./random";

export const PALETTES: Readonly<Record<TintGroup, readonly string[]>> = {
  skin: ["#f6dcc7", "#eec1a2", "#e0ac69", "#c68642", "#a8704a", "#8d5524", "#6b3e26", "#4a2a1a"],
  hair: ["#1b1612", "#3b2a20", "#5a3a22", "#8a5a2b", "#b7864f", "#e3c27a", "#a8442a", "#d9d4cc", "#7a7a7a"],
  cloth: [
    "#f2f2f2",
    "#2b2b2b",
    "#c0392b",
    "#e67e22",
    "#f1c40f",
    "#27ae60",
    "#16a085",
    "#2e86c1",
    "#1f3a68",
    "#8e44ad",
    "#e384b5",
    "#7f8c8d",
    "#8b5a2b",
    "#c8b48a",
    "#556b2f",
    "#800020",
  ],
};

const DEFAULT_OPTIONAL_CHANCE = 0.5;
const OPTIONAL_CHANCE: Partial<Record<CategoryId, number>> = { hair: 0.88, hat: 0.3 };

interface PickedPart {
  variant: string;
  tint: string;
}

export interface Character {
  parts: Partial<Record<CategoryId, PickedPart>>;
}

export interface Layer {
  slot: DrawSlot;
  category: CategoryId;
  file: string;
  tint: string;
}

function pick<T>(random: Random, items: readonly T[]): T {
  if (items.length === 0) throw new Error("Cannot pick from an empty list");
  return items[Math.floor(random() * items.length)];
}

function categoriesOf(manifest: Manifest) {
  return Object.entries(manifest.categories).map(([id, category]) => ({ id: id as CategoryId, ...category! }));
}

export type VariantOverrides = Partial<Record<CategoryId, string>>;

export function pickCharacter(manifest: Manifest, random: Random, overrides: VariantOverrides = {}): Character {
  const parts: Character["parts"] = {};
  for (const category of categoriesOf(manifest)) {
    const chance = OPTIONAL_CHANCE[category.id] ?? DEFAULT_OPTIONAL_CHANCE;
    const present = !category.optional || random() < chance;
    const picked = pick(random, category.variants).id;
    const tint = pick(random, PALETTES[category.tintGroup]);
    const override = overrides[category.id];
    if (override && !category.variants.some((variant) => variant.id === override)) {
      throw new Error(`Unknown ${category.id} variant "${override}"`);
    }
    if (present || override) parts[category.id] = { variant: override ?? picked, tint };
  }
  if (!parts[manifest.baseCategory]) throw new Error(`Manifest has no "${manifest.baseCategory}" category`);
  return { parts };
}

export function layersFor(manifest: Manifest, character: Character, direction: Direction): Layer[] {
  const order = manifest.drawOrder[direction];
  if (!order) throw new Error(`Manifest has no draw order for ${direction}`);
  const body = character.parts[manifest.baseCategory];
  if (!body) throw new Error(`Character has no "${manifest.baseCategory}" part`);

  return order.flatMap((slot) => {
    const { category, front } = slotCategory(slot);
    const part = character.parts[category];
    if (!part) return [];
    const variant = manifest.categories[category]?.variants.find((option) => option.id === part.variant);
    if (!variant) throw new Error(`Unknown ${category} variant "${part.variant}"`);
    if (front) {
      const file = variant.frontFiles?.[body.variant];
      return file ? [{ slot, category, file, tint: part.tint }] : [];
    }
    const file = variant.files[category === manifest.baseCategory ? part.variant : body.variant];
    if (!file) throw new Error(`No ${category}/${part.variant} sheet for body "${body.variant}"`);
    return [{ slot, category, file, tint: part.tint }];
  });
}
