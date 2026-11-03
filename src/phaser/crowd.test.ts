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
  LEVEL_CHANGE_CHANCE,
  LEVEL_COUNT,
  levelHeight,
  levelPoint,
  MAX_CROWD,
  MIN_CROWD,
  facingFor,
  flightRoute,
  frameIndex,
  onLevel,
  pathClear,
  pickLevel,
  PILLAR_SIZE,
  pillars,
  routeTo,
  sheetColumns,
  slabDepth,
  STAIRWELL,
  stairBoxes,
  stairDepth,
  stairRails,
  frontRailDepth,
  stepWander,
  tintColor,
  toGrid,
  toScreen,
  UPPER_SIZE,
  upperFlightDepth,
  walkerDepth,
  wanderRoute,
  wanderTarget,
  type WanderConfig,
  type Wanderer,
  type Waypoint,
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
  const { lower: up, upper } = stairBoxes(1);
  const boxes = [...up, ...upper];
  const landing = upper.at(-1)!;
  const back = upper.slice(0, -1);

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
    for (const step of back) expect(step.bottom).toBeGreaterThanOrEqual(landing.top);
  });

  it("sorts the upper flight and landing between people on the lower flight and people on the landing or upper flight", () => {
    const [, top, , foot, exit] = flightRoute(config.floor, 0, true);
    const lowerWalker = walkerDepth(config.floor, { y: top.y, z: top.z - 1, level: 0 });
    const landingWalker = walkerDepth(config.floor, { y: top.y, z: top.z, level: 0 });
    const upperWalker = walkerDepth(config.floor, { y: (foot.y + exit.y) / 2, z: 90, level: 1 });
    expect(upperFlightDepth(config.floor, 0)).toBeGreaterThan(lowerWalker);
    expect(upperFlightDepth(config.floor, 0)).toBeLessThan(landingWalker);
    expect(upperFlightDepth(config.floor, 0)).toBeLessThan(upperWalker);
    expect(upperFlightDepth(config.floor, 0)).toBeLessThan(slabDepth(1));
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
        return Array.from({ length: 50 }, () => wanderTarget(random, { x: 0, y: -40 }, level, config));
      };
      const targets = sequence(9);
      expect(sequence(9)).toEqual(targets);
      for (const target of targets) {
        expect(onLevel(config.floor, level, target)).toBe(true);
        expect(Math.hypot(target.x, target.y + 40)).toBeGreaterThanOrEqual(config.minLeg);
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

describe("flightRoute", () => {
  const facings = (route: Waypoint[]) =>
    route.slice(1).map((point, index) => facingFor(point.x - route[index].x, point.y - route[index].y));

  it("climbs half a floor to the landing then returns up to the next level", () => {
    const route = flightRoute(config.floor, 1, true);
    const [entry, , , , exit] = route;
    expect(route.map(({ z }) => z)).toEqual([120, 180, 180, 180, 240]);
    expect(route.map(({ level }) => level)).toEqual([1, 1, 1, 2, 2]);
    expect(onLevel(config.floor, 1, entry)).toBe(true);
    expect(onLevel(config.floor, 2, exit)).toBe(true);
    expect(facings(route)).toEqual(["SW", "SE", "SE", "NE"]);
  });

  it("walks the same points back down, dropping a level on reaching the landing", () => {
    const up = flightRoute(config.floor, 0, true);
    const down = flightRoute(config.floor, 0, false);
    expect(down.map(({ x, y, z }) => ({ x, y, z }))).toEqual([...up].reverse().map(({ x, y, z }) => ({ x, y, z })));
    expect(down.map(({ level }) => level)).toEqual([1, 0, 0, 0, 0]);
    expect(facings(down)).toEqual(["SW", "NW", "NW", "NE"]);
  });

  it("keeps every stair point inside the stairwell", () => {
    for (const point of flightRoute(config.floor, 0, true).slice(1, -1)) {
      const { u, v } = toGrid(config.floor, point);
      expect(u).toBeGreaterThan(0);
      expect(u).toBeLessThan(STAIRWELL.width);
      expect(v).toBeGreaterThanOrEqual(STAIRWELL.back);
      expect(v).toBeLessThanOrEqual(STAIRWELL.front);
    }
  });
});

describe("pillars", () => {
  it("holds each upper slab up at its four corners from the level below", () => {
    expect(pillars(0)).toHaveLength(4);
    expect(pillars(1)).toEqual(pillars(0));
    expect(pillars(LEVEL_COUNT - 1)).toEqual([]);
    for (const { u0, u1, v0, v1 } of pillars(0)) {
      expect(u1 - u0).toBeCloseTo(PILLAR_SIZE);
      expect(v1 - v0).toBeCloseTo(PILLAR_SIZE);
      expect(u0).toBeGreaterThanOrEqual(0);
      expect(v1).toBeLessThanOrEqual(UPPER_SIZE + 1e-9);
    }
  });

  it("keeps people out of the pillars on the levels they stand on", () => {
    for (const level of [0, 1]) {
      const [, east] = pillars(level);
      const inside = toScreen(config.floor, { u: (east.u0 + east.u1) / 2, v: (east.v0 + east.v1) / 2 });
      expect(onLevel(config.floor, level, inside)).toBe(false);
      const west = toScreen(config.floor, { u: 0.3, v: 0.005 });
      const east2 = toScreen(config.floor, { u: 0.6, v: 0.005 });
      expect(pathClear(config.floor, level, west, east2)).toBe(false);
    }
    const centre = toScreen(config.floor, { u: UPPER_SIZE - PILLAR_SIZE / 2, v: UPPER_SIZE - PILLAR_SIZE / 2 });
    expect(onLevel(config.floor, 2, centre)).toBe(true);
  });
});

describe("stairRail", () => {
  it("runs up the outer edge of both flights and around the landing", () => {
    const { back, front } = stairRails(1);
    expect(back[0]).toEqual({ u: 0, v: STAIRWELL.back, z: 120 });
    expect(back.at(-1)).toEqual(front[0]);
    expect(front.at(-1)).toEqual({ u: STAIRWELL.width, v: STAIRWELL.back, z: 240 });
    expect([...back.slice(1), ...front.slice(0, -1)].every(({ z }) => z === 180)).toBe(true);
  });

  it("draws the landing's front rail over people on that level's stairs but under the next slab's walkers", () => {
    const foot = toScreen(config.floor, { u: 0.1, v: 0.66 });
    expect(frontRailDepth(config.floor, 0)).toBeGreaterThan(walkerDepth(config.floor, { y: foot.y, z: 60, level: 0 }));
    expect(frontRailDepth(config.floor, 0)).toBeGreaterThan(walkerDepth(config.floor, { y: foot.y, z: 70, level: 1 }));
    expect(frontRailDepth(config.floor, 0)).toBeLessThan(depthFor(2, -500));
  });
});

describe("routeTo", () => {
  const ground = toScreen(config.floor, { u: 0.8, v: 0.3 });
  const top = toScreen(config.floor, { u: 0.4, v: 0.2 });

  it("ends on the target on the same level without stairs", () => {
    expect(routeTo(config.floor, ground, 0, { x: 10, y: 20 }, 0)).toEqual([{ x: 10, y: 20, z: 0, level: 0 }]);
  });

  it("climbs from level 0 to level 2 through both flights", () => {
    const route = routeTo(config.floor, ground, 0, top, 2);
    expect(route).toEqual([
      ...flightRoute(config.floor, 0, true),
      ...flightRoute(config.floor, 1, true),
      { ...top, z: 240, level: 2 },
    ]);
  });

  it("descends from level 2 to level 0 through both flights", () => {
    const route = routeTo(config.floor, top, 2, ground, 0);
    expect(route).toEqual([
      ...flightRoute(config.floor, 1, false),
      ...flightRoute(config.floor, 0, false),
      { ...ground, z: 0, level: 0 },
    ]);
  });

  it("climbs one level up and down", () => {
    expect(routeTo(config.floor, ground, 0, top, 1)?.at(-1)).toEqual({ ...top, z: 120, level: 1 });
    expect(routeTo(config.floor, top, 1, ground, 0)?.at(-1)).toEqual({ ...ground, z: 0, level: 0 });
  });

  it("steps around the stairwell's corner on the ground", () => {
    const front = toScreen(config.floor, { u: 0.8, v: 0.6 });
    const corner = { ...toScreen(config.floor, { u: STAIRWELL.width + 0.01, v: 0.49 }), z: 0, level: 0 };
    const [first, second] = routeTo(config.floor, front, 0, top, 1) ?? [];
    expect(first.x).toBeCloseTo(corner.x);
    expect(first.y).toBeCloseTo(corner.y);
    expect(second).toEqual(flightRoute(config.floor, 0, true)[0]);
    expect(routeTo(config.floor, top, 1, front, 0)?.at(-2)).toEqual(first);
  });

  it("gives up when a ground leg would cross the stairwell", () => {
    const south = toScreen(config.floor, { u: 0.05, v: 0.9 });
    expect(routeTo(config.floor, south, 0, top, 1)).toBeUndefined();
    expect(routeTo(config.floor, top, 1, south, 0)).toBeUndefined();
  });
});

describe("wanderRoute", () => {
  it("sends people to every level and ends on the destination level's walkable area", () => {
    const random = createRandom(4);
    const from = toScreen(config.floor, { u: 0.7, v: 0.7 });
    const routes = Array.from({ length: 2000 }, () => wanderRoute(random, from, 0, config));
    const ends = routes.map((route) => route[route.length - 1]);
    expect(new Set(ends.map(({ level }) => level))).toEqual(new Set([0, 1, 2]));
    const changes = ends.filter(({ level }) => level !== 0).length / ends.length;
    expect(changes).toBeGreaterThan(LEVEL_CHANGE_CHANCE / 2);
    expect(changes).toBeLessThan(LEVEL_CHANGE_CHANCE * 1.5);
    for (const end of ends) {
      expect(onLevel(config.floor, end.level, end)).toBe(true);
      expect(end.z).toBe(levelHeight(end.level));
    }
  });
});

describe("walkerDepth", () => {
  it("sorts flat walkers by level band and y", () => {
    expect(walkerDepth(config.floor, { y: 30, z: 120, level: 1 })).toBe(depthFor(1, 30));
  });

  it("draws walkers on the stairs above that band's stairs", () => {
    const foot = toScreen(config.floor, { u: 0.03, v: 0.5 });
    expect(walkerDepth(config.floor, { y: foot.y, z: 5, level: 0 })).toBeGreaterThan(stairDepth(config.floor, 0));
    expect(walkerDepth(config.floor, { y: foot.y, z: 110, level: 1 })).toBeGreaterThan(stairDepth(config.floor, 1));
    expect(walkerDepth(config.floor, { y: foot.y, z: 110, level: 1 })).toBeLessThan(slabDepth(2));
  });
});

describe("stepWander", () => {
  const target = { x: 100, y: 50, z: 0, level: 0 };
  const walking: Wanderer = { x: 0, y: 0, z: 0, level: 0, target, route: [], pause: 0, direction: "NW" };

  it("keeps people on a level's walkable area or inside the stairwell", () => {
    const random = createRandom(2);
    const levels = new Set<number>();
    let next: Wanderer = { ...walking, y: 60, pause: 0.1 };
    for (let index = 0; index < 20_000; index++) {
      next = stepWander(next, 0.1, random, config);
      levels.add(next.level);
      expect(next.z).toBeGreaterThanOrEqual(levelHeight(next.level) - FLOOR_HEIGHT);
      expect(next.z).toBeLessThanOrEqual(levelHeight(next.level) + FLOOR_HEIGHT);
      if (next.z === levelHeight(next.level)) {
        expect(onLevel(config.floor, next.level, next)).toBe(true);
      } else {
        const { u, v } = toGrid(config.floor, next);
        expect(u).toBeLessThanOrEqual(STAIRWELL.width);
        expect(v).toBeGreaterThanOrEqual(STAIRWELL.back - 0.01 - 1e-9);
        expect(v).toBeLessThanOrEqual(STAIRWELL.front);
      }
    }
    expect(levels).toEqual(new Set([0, 1, 2]));
  });

  it("raises the walker along a flight and faces the climb", () => {
    const [entry, landing] = flightRoute(config.floor, 0, true);
    const climbing: Wanderer = { ...walking, ...entry, target: landing, route: [] };
    const seconds = Math.hypot(landing.x - entry.x, landing.y - entry.y) / config.speed / 2;
    const next = stepWander(climbing, seconds, createRandom(1), config);
    expect(next.z).toBeCloseTo(FLOOR_HEIGHT / 4);
    expect(next.x).toBeCloseTo((entry.x + landing.x) / 2);
    expect(next.direction).toBe("SW");
  });

  it("moves on to the next waypoint without pausing and takes its level", () => {
    const [, , , foot, exit] = flightRoute(config.floor, 0, true);
    const turning: Wanderer = { ...walking, ...foot, level: 0, target: foot, route: [exit] };
    const next = stepWander(turning, 0.1, createRandom(1), config);
    expect(next).toMatchObject({ level: 1, target: exit, route: [], pause: 0 });
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
    const paused: Wanderer = { ...walking, y: 60, pause: 2 };
    expect(stepWander(paused, 0.5, createRandom(1), config)).toEqual({ ...paused, pause: 1.5 });

    const resumed = stepWander(paused, 2, createRandom(1), config);
    expect(resumed.pause).toBe(0);
    const [target, ...route] = wanderRoute(createRandom(1), paused, 0, config);
    expect(resumed).toMatchObject({ target, route });
    expect(resumed.direction).toBe(facingFor(resumed.target.x, resumed.target.y - 60));
    expect(resumed).toMatchObject({ x: 0, y: 60 });
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
