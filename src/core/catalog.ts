import type { CategoryId, PartCatalog } from "./parts";

const FACING_CAMERA: readonly CategoryId[] = ["body", "shoes", "bottom", "hair", "top", "hat"];
const FACING_AWAY: readonly CategoryId[] = ["body", "shoes", "bottom", "top", "hair", "hat"];

export const PART_CATALOG: PartCatalog = {
  baseCategory: "body",
  categories: [
    {
      id: "body",
      tintGroup: "skin",
      optional: false,
      variants: [
        { id: "slim", kind: "humanoid", params: { height: 1.03, build: 0.88, shoulders: 0.94, hips: 1.1 } },
        { id: "average", kind: "humanoid", params: {} },
        { id: "broad", kind: "humanoid", params: { height: 0.97, build: 1.16, shoulders: 1.08, hips: 0.98 } },
      ],
    },
    {
      id: "hair",
      tintGroup: "hair",
      optional: true,
      variants: [
        { id: "buzz", kind: "crop", params: { coverage: 0.5, tilt: 0.3, radius: 0.142 } },
        { id: "short", kind: "crop", params: {} },
        { id: "bob", kind: "bob", params: {} },
        { id: "long", kind: "long", params: {} },
        { id: "spiky", kind: "spiky", params: {} },
        { id: "bun", kind: "bun", params: {} },
        { id: "afro", kind: "afro", params: {} },
      ],
    },
    {
      id: "top",
      tintGroup: "cloth",
      optional: false,
      variants: [
        { id: "tank", kind: "shirt", params: { sleeve: "none" } },
        { id: "tshirt", kind: "shirt", params: { sleeve: "short" } },
        { id: "longsleeve", kind: "shirt", params: { sleeve: "long" } },
        { id: "jacket", kind: "shirt", params: { sleeve: "long", hem: 0.9, thickness: 0.03, collar: true, cuffs: true } },
        { id: "hoodie", kind: "shirt", params: { sleeve: "long", hem: 0.94, thickness: 0.026, hood: true, cuffs: true } },
      ],
    },
    {
      id: "bottom",
      tintGroup: "cloth",
      optional: false,
      variants: [
        { id: "trousers", kind: "trousers", params: { belt: true } },
        { id: "shorts", kind: "trousers", params: { legLength: 0.36 } },
        { id: "capris", kind: "trousers", params: { legLength: 0.72 } },
        { id: "skirt", kind: "skirt", params: {} },
        { id: "longskirt", kind: "skirt", params: { length: 0.82, flare: 0.1 } },
      ],
    },
    {
      id: "shoes",
      tintGroup: "cloth",
      optional: false,
      variants: [
        { id: "sneakers", kind: "shoes", params: {} },
        { id: "boots", kind: "shoes", params: { shaft: 0.4 } },
      ],
    },
    {
      id: "hat",
      tintGroup: "cloth",
      optional: true,
      variants: [
        { id: "cap", kind: "baseball-cap", params: {} },
        { id: "beanie", kind: "beanie", params: {} },
        { id: "sunhat", kind: "brimmed", params: {} },
        { id: "tophat", kind: "brimmed", params: { crownHeight: 0.24, crownRadius: 0.155, brimRadius: 0.21, band: true } },
      ],
    },
  ],
  drawOrder: { NE: FACING_AWAY, SE: FACING_CAMERA, SW: FACING_CAMERA, NW: FACING_AWAY },
};
