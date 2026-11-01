import type { CaptureConfig } from "./config";
import type { Direction } from "./directions";
import type { Point, SheetLayout, Size } from "./layout";

interface ManifestVariant {
  id: string;
  file: string;
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
  categories: Record<string, { variants: ManifestVariant[] }>;
}

export interface ManifestInput {
  config: CaptureConfig;
  layout: SheetLayout;
  animations: Record<string, ManifestAnimation>;
  categories: Record<string, ManifestVariant[]>;
}

export function buildManifest({ config, layout, animations, categories }: ManifestInput): Manifest {
  for (const [name, animation] of Object.entries(animations)) {
    for (const frame of animation.frames) {
      if (!Number.isInteger(frame) || frame < 0 || frame >= layout.columns) {
        throw new Error(`Animation "${name}" references frame ${frame} outside 0..${layout.columns - 1}`);
      }
    }
  }

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
    categories: Object.fromEntries(
      Object.entries(categories).map(([category, variants]) => [
        category,
        { variants: variants.map((variant) => ({ ...variant })) },
      ]),
    ),
  };
}
