import { DIRECTIONS } from "../core/directions";
import { createRandom, hashString, type Random } from "../core/random";
import { levelHeight, levelPoint, pickLevel, type WanderConfig, type Wanderer } from "../phaser/crowd";

export const WANDER: WanderConfig = {
  floor: { halfWidth: 480, halfHeight: 240 },
  speed: 36,
  minPause: 0.8,
  maxPause: 4,
  minLeg: 80,
};

export const SLAB_THICKNESS = 12;
export const RAIL_HEIGHT = 18;
export const RAIL_POST_SPACING = 0.04;

export const COLORS = {
  levels: [0x5b6b4f, 0x6f7f8c, 0x7c6f8c],
  edges: [0x3f4a37, 0x4c5863, 0x564c63],
  stairTop: 0x9a8a72,
  stairFront: 0x7a6a56,
  stairSide: 0x62553f,
  rail: 0xc9c2b4,
  pillarLeft: 0x8a8f96,
  pillarRight: 0x666b72,
};

export interface CrowdMember<Look> {
  look: Look;
  wanderer: Wanderer;
  random: Random;
  phase: number;
}

export function planCrowd<Look>(
  seed: number,
  size: number,
  pickLook: (random: Random) => Look,
  config: WanderConfig = WANDER,
): CrowdMember<Look>[] {
  const random = createRandom(seed);
  const placement = createRandom(hashString(`floor:${seed}`));
  return Array.from({ length: size }, (_, index) => {
    const look = pickLook(random);
    const direction = DIRECTIONS[Math.floor(random() * DIRECTIONS.length)];
    const phase = random();
    const level = pickLevel(placement);
    const { x, y } = levelPoint(placement, config.floor, level);
    const wander = createRandom(hashString(`wander:${seed}:${index}`));
    const z = levelHeight(level);
    const wanderer: Wanderer = {
      x,
      y,
      z,
      level,
      target: { x, y, z, level },
      route: [],
      pause: wander() * config.maxPause,
      direction,
    };
    return { look, wanderer, random: wander, phase };
  });
}
