import type { Direction } from "./directions";
import { createRandom, hashString, type Random } from "./random";

export type CategoryId = "body" | "hair" | "top" | "bottom" | "shoes" | "hat";
export type TintGroup = "skin" | "hair" | "cloth";
export type PartParams = Readonly<Record<string, number | string | boolean>>;
export type FrontSlot = `${CategoryId}.front`;
export type DrawSlot = CategoryId | FrontSlot;

export interface PartSpec {
  category: CategoryId;
  id: string;
  kind: string;
  params: PartParams;
  front?: boolean;
}

interface CategoryConfig {
  id: CategoryId;
  tintGroup: TintGroup;
  optional: boolean;
  variants: readonly Omit<PartSpec, "category">[];
}

export interface PartCatalog {
  baseCategory: CategoryId;
  categories: readonly CategoryConfig[];
  drawOrder: Readonly<Record<Direction, readonly DrawSlot[]>>;
}

export interface SheetJob {
  file: string;
  category: CategoryId;
  variant: string;
  bodyVariant: string;
  front: boolean;
  body: PartSpec;
  part?: PartSpec;
}

export function frontSlot(category: CategoryId): FrontSlot {
  return `${category}.front`;
}

export function slotCategory(slot: DrawSlot): { category: CategoryId; front: boolean } {
  const front = slot.endsWith(".front");
  return { category: (front ? slot.slice(0, -".front".length) : slot) as CategoryId, front };
}

function specsOf(category: CategoryConfig): PartSpec[] {
  return category.variants.map((variant) => ({ ...variant, category: category.id }));
}

export function validateCatalog(catalog: PartCatalog, directions: readonly Direction[]): void {
  const ids = catalog.categories.map((category) => category.id);
  if (new Set(ids).size !== ids.length) throw new Error("Category ids must be unique");
  const base = catalog.categories.find((category) => category.id === catalog.baseCategory);
  if (!base) throw new Error(`Base category "${catalog.baseCategory}" is not defined`);
  if (base.optional) throw new Error("The base category cannot be optional");
  if (base.variants.some((variant) => variant.front)) throw new Error("The base category cannot have a front layer");

  for (const category of catalog.categories) {
    if (category.variants.length === 0) throw new Error(`Category "${category.id}" has no variants`);
    const variantIds = category.variants.map((variant) => variant.id);
    if (new Set(variantIds).size !== variantIds.length) {
      throw new Error(`Category "${category.id}" has duplicate variant ids`);
    }
    for (const id of variantIds) {
      if (!/^[a-z0-9-]+$/.test(id)) throw new Error(`Variant id "${id}" must be lowercase kebab-case`);
    }
  }

  const slots: DrawSlot[] = [
    ...ids,
    ...catalog.categories.filter((category) => category.variants.some((variant) => variant.front)).map((category) => frontSlot(category.id)),
  ];
  for (const direction of directions) {
    const order = catalog.drawOrder[direction];
    if (order.length !== slots.length || !slots.every((slot) => order.includes(slot))) {
      throw new Error(`Draw order for ${direction} must list every category and front layer exactly once`);
    }
    if (order[0] !== catalog.baseCategory) throw new Error(`Draw order for ${direction} must start with the base category`);
    for (const slot of order) {
      const { category, front } = slotCategory(slot);
      if (front && order.indexOf(slot) < order.indexOf(category)) {
        throw new Error(`Draw order for ${direction} must draw ${slot} after ${category}`);
      }
    }
  }
}

export function sheetFile(catalog: PartCatalog, category: CategoryId, variant: string, bodyVariant: string, front = false): string {
  if (category === catalog.baseCategory) return `${category}/${variant}.png`;
  return `${category}/${variant}${front ? ".front" : ""}.${bodyVariant}.png`;
}

export function planSheets(catalog: PartCatalog): SheetJob[] {
  const base = catalog.categories.find((category) => category.id === catalog.baseCategory);
  if (!base) throw new Error(`Base category "${catalog.baseCategory}" is not defined`);
  const bodies = specsOf(base);

  return catalog.categories.flatMap((category): SheetJob[] =>
    category.id === catalog.baseCategory
      ? bodies.map((body) => ({
          file: sheetFile(catalog, body.category, body.id, body.id),
          category: body.category,
          variant: body.id,
          bodyVariant: body.id,
          front: false,
          body,
        }))
      : specsOf(category).flatMap((part) =>
          (part.front ? [false, true] : [false]).flatMap((front) =>
            bodies.map((body) => ({
              file: sheetFile(catalog, part.category, part.id, body.id, front),
              category: part.category,
              variant: part.id,
              bodyVariant: body.id,
              front,
              body,
              part,
            })),
          ),
        ),
  );
}

export function partRandom(seed: number, spec: PartSpec): Random {
  return createRandom(hashString(`${seed}:${spec.category}:${spec.id}`));
}
