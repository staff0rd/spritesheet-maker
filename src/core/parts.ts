import type { Direction } from "./directions";
import { createRandom, hashString, type Random } from "./random";

export type CategoryId = "body" | "hair" | "top" | "bottom" | "shoes" | "hat";
export type TintGroup = "skin" | "hair" | "cloth";
export type PartParams = Readonly<Record<string, number | string | boolean>>;

export interface PartSpec {
  category: CategoryId;
  id: string;
  kind: string;
  params: PartParams;
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
  drawOrder: Readonly<Record<Direction, readonly CategoryId[]>>;
}

export interface SheetJob {
  file: string;
  category: CategoryId;
  variant: string;
  bodyVariant: string;
  body: PartSpec;
  part?: PartSpec;
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

  for (const direction of directions) {
    const order = catalog.drawOrder[direction];
    if (order.length !== ids.length || !ids.every((id) => order.includes(id))) {
      throw new Error(`Draw order for ${direction} must list every category exactly once`);
    }
    if (order[0] !== catalog.baseCategory) throw new Error(`Draw order for ${direction} must start with the base category`);
  }
}

export function sheetFile(catalog: PartCatalog, category: CategoryId, variant: string, bodyVariant: string): string {
  return category === catalog.baseCategory ? `${category}/${variant}.png` : `${category}/${variant}.${bodyVariant}.png`;
}

export function planSheets(catalog: PartCatalog): SheetJob[] {
  const base = catalog.categories.find((category) => category.id === catalog.baseCategory);
  if (!base) throw new Error(`Base category "${catalog.baseCategory}" is not defined`);
  const bodies = specsOf(base);

  return catalog.categories.flatMap((category) =>
    category.id === catalog.baseCategory
      ? bodies.map((body) => ({
          file: sheetFile(catalog, body.category, body.id, body.id),
          category: body.category,
          variant: body.id,
          bodyVariant: body.id,
          body,
        }))
      : specsOf(category).flatMap((part) =>
          bodies.map((body) => ({
            file: sheetFile(catalog, part.category, part.id, body.id),
            category: part.category,
            variant: part.id,
            bodyVariant: body.id,
            body,
            part,
          })),
        ),
  );
}

export function partRandom(seed: number, spec: PartSpec): Random {
  return createRandom(hashString(`${seed}:${spec.category}:${spec.id}`));
}
