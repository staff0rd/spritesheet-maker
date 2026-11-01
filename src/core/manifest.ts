import type { CaptureConfig } from "./config";
import type { Direction } from "./directions";
import type { Point, SheetLayout, Size } from "./layout";
import { sheetFile, type CategoryId, type PartCatalog, type TintGroup } from "./parts";

interface ManifestVariant {
  id: string;
  files: Record<string, string>;
}

interface ManifestCategory {
  tintGroup: TintGroup;
  optional: boolean;
  variants: ManifestVariant[];
}

interface ManifestAnimation {
  frames: number[];
}

export interface Manifest {
  version: 1;
  seed: number;
  frameSize: Size;
  anchor: Point;
  sheetSize: Size;
  directions: Direction[];
  directionRows: Record<string, number>;
  animations: Record<string, ManifestAnimation>;
  baseCategory: CategoryId;
  categories: Partial<Record<CategoryId, ManifestCategory>>;
  drawOrder: Partial<Record<Direction, CategoryId[]>>;
}

interface ManifestInput {
  config: CaptureConfig;
  layout: SheetLayout;
  animations: Record<string, ManifestAnimation>;
  catalog: PartCatalog;
}

export function buildManifest({ config, layout, animations, catalog }: ManifestInput): Manifest {
  for (const [name, animation] of Object.entries(animations)) {
    for (const frame of animation.frames) {
      if (!Number.isInteger(frame) || frame < 0 || frame >= layout.columns) {
        throw new Error(`Animation "${name}" references frame ${frame} outside 0..${layout.columns - 1}`);
      }
    }
  }

  const base = catalog.categories.find((category) => category.id === catalog.baseCategory);
  if (!base) throw new Error(`Base category "${catalog.baseCategory}" is not defined`);
  const bodyIds = base.variants.map((variant) => variant.id);

  return {
    version: 1,
    seed: config.seed,
    frameSize: { ...layout.frameSize },
    anchor: { ...config.anchor },
    sheetSize: { ...layout.sheetSize },
    directions: [...config.directions],
    directionRows: Object.fromEntries(config.directions.map((direction, row) => [direction, row])),
    animations: Object.fromEntries(
      Object.entries(animations).map(([name, { frames }]) => [name, { frames: [...frames] }]),
    ),
    baseCategory: catalog.baseCategory,
    categories: Object.fromEntries(
      catalog.categories.map((category) => [
        category.id,
        {
          tintGroup: category.tintGroup,
          optional: category.optional,
          variants: category.variants.map((variant) => ({
            id: variant.id,
            files: Object.fromEntries(
              (category.id === catalog.baseCategory ? [variant.id] : bodyIds).map((bodyId) => [
                bodyId,
                sheetFile(catalog, category.id, variant.id, bodyId),
              ]),
            ),
          })),
        },
      ]),
    ),
    drawOrder: Object.fromEntries(
      config.directions.map((direction) => [direction, [...catalog.drawOrder[direction]]]),
    ),
  };
}
