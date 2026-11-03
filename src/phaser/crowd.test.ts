import { describe, expect, it } from "vitest";
import { PART_CATALOG } from "../core/catalog";
import { DEFAULT_CAPTURE_CONFIG } from "../core/config";
import { computeSheetLayout } from "../core/layout";
import { buildManifest } from "../core/manifest";
import { createRandom } from "../core/random";
import {
  animationFrame,
  crowdSize,
  DEFAULT_CROWD,
  depthFor,
  diamondPoint,
  FLOOR_HEIGHT,
  LEVEL_COUNT,
  levelHeight,
  levelPoint,
  MAX_CROWD,
  MIN_CROWD,
  facingFor,
  frameIndex,
  onLevel,
  pathClear,
  pickLevel,
  sheetColumns,
  slabDepth,
  STAIRWELL,
  stairBoxes,
  stairDepth,
  stepWander,
  tintColor,
  toGrid,
  toScreen,
  UPPER_SIZE,
  wanderTarget,
  type WanderConfig,
  type Wanderer,
} from "./crowd";

const manifest = buildManifest({
  config: DEFAULT_CAPTURE_CONFIG,
  layout: computeSheetLayout(DEFAULT_CAPTURE_CONFIG.frameSize, DEFAULT_CAPTURE_CONFIG.directions, 12),
  animations: { walk: { frames: [6, 7, 8, 9, 10, 11], fps: 8 } },
  catalog: PART_CATALOG,
});

describe("frameIndex", () => {
  it("offsets the animation frame by the direction's row", () => {
    const columns = sheetColumns(manifest);
    expect(columns).toBe(12);
    for (const direction of manifest.directions) {
      expect(frameIndex(manifest, direction, 7)).toBe(manifest.directionRows[direction] * columns + 7);
    }
  });
});

describe("animationFrame", () => {
  const frames = [6, 7, 8, 9];

  it("advances one frame per 1/fps seconds and loops", () => {
    expect([0, 0.1, 0.25, 0.5, 0.75, 1].map((seconds) => animationFrame(frames, 4, seconds, 0))).toEqual([
      6, 6, 7, 8, 9, 6,
    ]);
  });

  it("offsets the cycle by phase", () => {
    expect(animationFrame(frames, 4, 0, 0.5)).toBe(8);
    expect(animationFrame(frames, 4, 0.5, 0.5)).toBe(6);
  });
});

describe("tintColor", () => {
  it("parses #rrggbb to a number", () => {
    expect(tintColor("#c0392b")).toBe(0xc0392b);
  });

  it("rejects other formats", () => {
    expect(() => tintColor("red")).toThrow();
  });
});

describe("diamondPoint", () => {
  it("stays inside the diamond", () => {
    const random = createRandom(3);
    for (let index = 0; index < 500; index++) {
      const { x, y } = diamondPoint(random, 400, 200);
      expect(Math.abs(x) / 400 + Math.abs(y) / 200).toBeLessThanOrEqual(1 + 1e-9);
    }
  });

  it("reaches the corners", () => {
    const corner = (u: number, v: number) => {
      const values = [u, v];
      return diamondPoint(() => values.shift()!, 400, 200);
    };
    expect(corner(1, 0)).toEqual({ x: 400, y: 0 });
    expect(corner(0, 0)).toEqual({ x: 0, y: -200 });
    expect(corner(1, 1)).toEqual({ x: 0, y: 200 });
  });
});

describe("facingFor", () => {
  it("snaps screen vectors to the nearest iso direction", () => {
    expect(facingFor(2, -1)).toBe("NE");
    expect(facingFor(2, 1)).toBe("SE");
    expect(facingFor(-2, 1)).toBe("SW");
    expect(facingFor(-2, -1)).toBe("NW");
    expect(facingFor(0.1, -5)).toBe("NE");
    expect(facingFor(-5, -0.1)).toBe("NW");
  });

  it("has no facing for a zero vector", () => {
    expect(facingFor(0, 0)).toBeUndefined();
  });
});

const config: WanderConfig = {
  floor: { halfWidth: 400, halfHeight: 200 },
  speed: 50,
  minPause: 1,
  maxPause: 3,
  minLeg: 100,
};

describe("toGrid", () => {
  it("inverts toScreen on the ground", () => {
    for (const point of [
      { u: 0, v: 0 },
      { u: 1, v: 0 },
      { u: 0.3, v: 0.8 },
    ]) {
      const back = toGrid(config.floor, toScreen(config.floor, point));
      expect(back.u).toBeCloseTo(point.u);
      expect(back.v).toBeCloseTo(point.v);
    }
  });

  it("raises screen points by their height", () => {
    expect(toScreen(config.floor, { u: 0, v: 1 }, FLOOR_HEIGHT)).toEqual({ x: -400, y: -FLOOR_HEIGHT });
  });
});

describe("levelPoint", () => {
  const inStairwell = ({ u, v }: { u: number; v: number }) =>
    u <= STAIRWELL.width && v >= STAIRWELL.back && v <= STAIRWELL.front;

  it("samples the whole diamond on the ground, around the stairwell", () => {
    const random = createRandom(4);
    const points = Array.from({ length: 2000 }, () => levelPoint(random, config.floor, 0));
    for (const point of points) {
      expect(Math.abs(point.x) / 400 + Math.abs(point.y) / 200).toBeLessThanOrEqual(1 + 1e-9);
      expect(inStairwell(toGrid(config.floor, point))).toBe(false);
      expect(onLevel(config.floor, 0, point)).toBe(true);
    }
    expect(points.some(({ y }) => y > 100)).toBe(true);
    expect(points.some(({ y }) => y < -100)).toBe(true);
  });

  it("keeps upper levels on the quarter-size square at the back", () => {
    const random = createRandom(5);
    for (const level of [1, 2]) {
      const grids = Array.from({ length: 1000 }, () => toGrid(config.floor, levelPoint(random, config.floor, level)));
      for (const { u, v } of grids) {
        expect(u).toBeGreaterThanOrEqual(-1e-9);
        expect(v).toBeGreaterThanOrEqual(-1e-9);
        expect(u).toBeLessThanOrEqual(UPPER_SIZE + 1e-9);
        expect(v).toBeLessThanOrEqual(UPPER_SIZE + 1e-9);
      }
      expect(grids.some(({ u, v }) => u > 0.45 && v > 0.45)).toBe(true);
      expect(grids.some(({ u, v }) => u < 0.05 && v < 0.05)).toBe(true);
    }
  });

  it("rejects points off a level", () => {
    const at = (u: number, v: number) => toScreen(config.floor, { u, v });
    expect(onLevel(config.floor, 0, { x: 0, y: 150 })).toBe(true);
    expect(onLevel(config.floor, 1, { x: 0, y: 150 })).toBe(false);
    expect(onLevel(config.floor, 2, { x: 0, y: -150 })).toBe(true);
    expect(onLevel(config.floor, 0, { x: 500, y: 0 })).toBe(false);
    expect(onLevel(config.floor, 0, at(0.05, 0.6))).toBe(false);
    expect(onLevel(config.floor, 0, at(0.3, 0.6))).toBe(true);
    expect(onLevel(config.floor, 1, at(0.3, 0.6))).toBe(false);
    expect(onLevel(config.floor, 1, at(0.6, 0.3))).toBe(false);
    expect(onLevel(config.floor, 1, at(0.3, 0.45))).toBe(true);
  });
});

describe("pickLevel", () => {
  it("spreads people over every level, favouring the ground", () => {
    const random = createRandom(6);
    const counts = Array.from({ length: LEVEL_COUNT }, () => 0);
    for (let index = 0; index < 4000; index++) counts[pickLevel(random)]++;
    expect(counts[0] / 4000).toBeCloseTo(2 / 3, 1);
    expect(counts[1] / 4000).toBeCloseTo(1 / 6, 1);
    expect(counts[2] / 4000).toBeCloseTo(1 / 6, 1);
  });
});

describe("pathClear", () => {
  const at = (u: number, v: number) => toScreen(config.floor, { u, v });

  it("blocks straight paths through the stairwell on the ground", () => {
    expect(pathClear(config.floor, 0, at(0.05, 0.3), at(0.05, 0.9))).toBe(false);
    expect(pathClear(config.floor, 0, at(0.02, 0.45), at(0.3, 0.65))).toBe(false);
  });

  it("allows paths beside the stairwell", () => {
    expect(pathClear(config.floor, 0, at(0.2, 0.3), at(0.2, 0.9))).toBe(true);
    expect(pathClear(config.floor, 0, at(0.05, 0.3), at(0.5, 0.2))).toBe(true);
  });
});

describe("stairBoxes", () => {
  const boxes = stairBoxes(1);
  const landing = boxes.at(-1)!;
  const steps = boxes.slice(0, -1);
  const up = steps.slice(0, steps.length / 2);
  const back = steps.slice(steps.length / 2);

  it("puts a half-floor landing at the front of the stairwell", () => {
    expect(landing).toMatchObject({ u0: 0, u1: STAIRWELL.width, v0: STAIRWELL.turn, v1: STAIRWELL.front });
    expect(landing.top).toBe(levelHeight(1) + FLOOR_HEIGHT / 2);
  });

  it("climbs the first flight from the back to the landing", () => {
    expect(up[0].v0).toBeCloseTo(STAIRWELL.back);
    expect(up.at(-1)!.v1).toBeCloseTo(STAIRWELL.turn);
    const tops = up.map(({ top }) => top);
    expect(tops).toEqual([...tops].sort((a, b) => a - b));
    expect(tops[0]).toBeGreaterThan(levelHeight(1));
    expect(tops.at(-1)!).toBeLessThan(landing.top);
    for (const step of up) expect(step.u1).toBeCloseTo(STAIRWELL.width / 2);
  });

  it("returns the other way up to the next level", () => {
    const fromLanding = [...back].reverse();
    expect(fromLanding[0].v1).toBeCloseTo(STAIRWELL.turn);
    expect(fromLanding.at(-1)!.v0).toBeCloseTo(STAIRWELL.back);
    const tops = fromLanding.map(({ top }) => top);
    expect(tops).toEqual([...tops].sort((a, b) => a - b));
    expect(tops[0]).toBeGreaterThan(landing.top);
    expect(tops.at(-1)!).toBeLessThan(levelHeight(2));
    for (const step of back) expect(step.u0).toBeCloseTo(STAIRWELL.width / 2);
  });

  it("orders boxes back to front for painting", () => {
    for (const flight of [up, back]) {
      for (let index = 1; index < flight.length; index++) expect(flight[index].v0).toBeGreaterThan(flight[index - 1].v0);
    }
  });

  it("stands in front of the upper slabs' south-west face at their west corner", () => {
    for (const box of boxes) {
      expect(box.v0).toBeGreaterThanOrEqual(UPPER_SIZE - 1e-9);
      expect(box.u0).toBeGreaterThanOrEqual(0);
      expect(box.u1).toBeLessThan(UPPER_SIZE);
    }
  });
});

describe("depthFor", () => {
  it("puts every upper level above the levels below it", () => {
    expect(depthFor(1, -200)).toBeGreaterThan(depthFor(0, 200));
    expect(slabDepth(1)).toBeGreaterThan(depthFor(0, 200));
    expect(slabDepth(1)).toBeLessThan(depthFor(1, -200));
    expect(stairDepth(config.floor, 0)).toBeLessThan(slabDepth(1));
    expect(stairDepth(config.floor, 1)).toBeGreaterThan(slabDepth(1));
  });
});

describe("wanderTarget", () => {
  it("picks seeded points on the wanderer's level at least a leg away", () => {
    for (const level of [0, 1, 2]) {
      const sequence = (seed: number) => {
        const random = createRandom(seed);
        return Array.from({ length: 50 }, () => wanderTarget(random, { x: 0, y: -10 }, level, config));
      };
      const targets = sequence(9);
      expect(sequence(9)).toEqual(targets);
      for (const target of targets) {
        expect(onLevel(config.floor, level, target)).toBe(true);
        expect(Math.hypot(target.x, target.y + 10)).toBeGreaterThanOrEqual(config.minLeg);
      }
    }
  });

  it("never heads through the stairwell on the ground", () => {
    const random = createRandom(10);
    const from = toScreen(config.floor, { u: 0.05, v: 0.3 });
    for (let index = 0; index < 200; index++) {
      expect(pathClear(config.floor, 0, from, wanderTarget(random, from, 0, config))).toBe(true);
    }
  });
});

describe("stepWander", () => {
  const walking: Wanderer = { x: 0, y: 0, level: 0, target: { x: 100, y: 50 }, pause: 0, direction: "NW" };

  it("keeps the wanderer on its level", () => {
    const upstairs: Wanderer = { ...walking, y: -100, level: 2, target: { x: 0, y: -100 }, pause: 0.1 };
    const random = createRandom(2);
    let next = upstairs;
    for (let index = 0; index < 500; index++) {
      next = stepWander(next, 0.5, random, config);
      expect(next.level).toBe(2);
      expect(onLevel(config.floor, 2, next)).toBe(true);
    }
  });


  it("moves toward the target at speed and faces the way it walks", () => {
    const next = stepWander(walking, 1, createRandom(1), config);
    expect(Math.hypot(next.x, next.y)).toBeCloseTo(50);
    expect(next.y / next.x).toBeCloseTo(0.5);
    expect(next.direction).toBe("SE");
    expect(next.pause).toBe(0);
  });

  it("stops on the target and pauses within the configured range", () => {
    const next = stepWander(walking, 10, createRandom(1), config);
    expect(next).toMatchObject({ x: 100, y: 50, direction: "SE" });
    expect(next.pause).toBeGreaterThanOrEqual(config.minPause);
    expect(next.pause).toBeLessThanOrEqual(config.maxPause);
  });

  it("counts the pause down then heads for a new target", () => {
    const paused: Wanderer = { ...walking, pause: 2 };
    expect(stepWander(paused, 0.5, createRandom(1), config)).toEqual({ ...paused, pause: 1.5 });

    const resumed = stepWander(paused, 2, createRandom(1), config);
    expect(resumed.pause).toBe(0);
    expect(resumed.target).toEqual(wanderTarget(createRandom(1), paused, 0, config));
    expect(resumed.direction).toBe(facingFor(resumed.target.x, resumed.target.y));
    expect(resumed).toMatchObject({ x: 0, y: 0 });
  });
});

describe("crowdSize", () => {
  it("defaults when missing or not a number", () => {
    expect(crowdSize(null)).toBe(DEFAULT_CROWD);
    expect(crowdSize("")).toBe(DEFAULT_CROWD);
    expect(crowdSize("lots")).toBe(DEFAULT_CROWD);
  });

  it("clamps to the supported range and rounds", () => {
    expect(crowdSize("1")).toBe(MIN_CROWD);
    expect(crowdSize("99999")).toBe(MAX_CROWD);
    expect(crowdSize("320.6")).toBe(321);
  });
});
