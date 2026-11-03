export const DIRECTIONS = ["N", "NE", "E", "SE", "S", "SW", "W", "NW"] as const;

export type Direction = (typeof DIRECTIONS)[number];

const YAW_FROM_MODEL_FACING_PLUS_Z: Record<Direction, number> = {
  N: (-3 * Math.PI) / 4,
  NE: Math.PI,
  E: (3 * Math.PI) / 4,
  SE: Math.PI / 2,
  S: Math.PI / 4,
  SW: 0,
  W: -Math.PI / 4,
  NW: -Math.PI / 2,
};

export function facingYaw(direction: Direction): number {
  return YAW_FROM_MODEL_FACING_PLUS_Z[direction];
}
