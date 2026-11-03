import { describe, expect, it } from "vitest";
import { PART_CATALOG } from "../core/catalog";
import { DEFAULT_CAPTURE_CONFIG } from "../core/config";
import { DIRECTIONS } from "../core/directions";
import { computeSheetLayout } from "../core/layout";
import { buildManifest } from "../core/manifest";
import { createRandom } from "../core/random";
import {
  animationFrame,
  crowdSize,
  DEFAULT_CROWD,
  diamondPoint,
  MAX_CROWD,
  MIN_CROWD,
  facingFor,
  headingAngle,
  frameIndex,
  sheetColumns,
  stepWander,
  tintColor,
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
  const toward = (angle: number) => facingFor(Math.cos(angle), Math.sin(angle));
  const clockwise = DIRECTIONS.map((direction) => ({ direction, angle: headingAngle(direction) }));

  it("snaps screen vectors to the nearest of 8 headings", () => {
    expect(facingFor(0, -3)).toBe("N");
    expect(facingFor(2, -1)).toBe("NE");
    expect(facingFor(5, 0)).toBe("E");
    expect(facingFor(2, 1)).toBe("SE");
    expect(facingFor(0, 3)).toBe("S");
    expect(facingFor(-2, 1)).toBe("SW");
    expect(facingFor(-5, 0)).toBe("W");
    expect(facingFor(-2, -1)).toBe("NW");
  });

  it("uses projected iso angles for the diagonals", () => {
    expect(headingAngle("NE")).toBeCloseTo(-Math.atan(0.5));
    expect(facingFor(1, -1)).toBe("NE");
    expect(facingFor(1, -2)).toBe("N");
    expect(facingFor(-1, 2)).toBe("S");
    expect(facingFor(4, -1)).toBe("NE");
    expect(facingFor(8, -1)).toBe("E");
  });

  it("switches heading midway between neighbours", () => {
    const epsilon = 1e-6;
    clockwise.forEach(({ direction, angle }, index) => {
      const next = clockwise[(index + 1) % clockwise.length];
      let nextAngle = next.angle;
      if (nextAngle < angle) nextAngle += 2 * Math.PI;
      const boundary = (angle + nextAngle) / 2;
      expect(toward(angle)).toBe(direction);
      expect(toward(boundary - epsilon)).toBe(direction);
      expect(toward(boundary + epsilon)).toBe(next.direction);
    });
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

describe("wanderTarget", () => {
  it("picks seeded points inside the floor at least a leg away", () => {
    const sequence = (seed: number) => {
      const random = createRandom(seed);
      return Array.from({ length: 50 }, () => wanderTarget(random, { x: 0, y: 0 }, config));
    };
    const targets = sequence(9);
    expect(sequence(9)).toEqual(targets);
    for (const { x, y } of targets) {
      expect(Math.abs(x) / 400 + Math.abs(y) / 200).toBeLessThanOrEqual(1 + 1e-9);
      expect(Math.hypot(x, y)).toBeGreaterThanOrEqual(config.minLeg);
    }
  });
});

describe("stepWander", () => {
  const walking: Wanderer = { x: 0, y: 0, target: { x: 100, y: 50 }, pause: 0, direction: "NW" };

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
    expect(resumed.target).toEqual(wanderTarget(createRandom(1), paused, config));
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
