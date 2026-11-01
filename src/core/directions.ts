export const DIRECTIONS = ["NE", "SE", "SW", "NW"] as const;

export type Direction = (typeof DIRECTIONS)[number];

const YAW_FROM_MODEL_FACING_PLUS_Z: Record<Direction, number> = {
  NE: Math.PI,
  SE: Math.PI / 2,
  SW: 0,
  NW: -Math.PI / 2,
};

export function facingYaw(direction: Direction): number {
  return YAW_FROM_MODEL_FACING_PLUS_Z[direction];
}
