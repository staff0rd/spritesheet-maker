import { describe, expect, it } from "vitest";
import { facingYaw } from "../core/directions";
import { WANDER } from "../crowd/plan";
import { FLOOR_HEIGHT, flightRoute, stairBoxes, toGrid, toScreen } from "../phaser/crowd";
import { bodyShape, DEFAULT_BODY_PARAMS } from "../scene/rig";
import { blendPose, clip, groundHeight, headingYaw, strideLength, turnToward } from "./walker";

const { floor } = WANDER;

describe("groundHeight", () => {
  it("keeps flat-floor heights", () => {
    expect(groundHeight({ u: 0.8, v: 0.8 }, 0)).toBe(0);
    expect(groundHeight({ u: 0.3, v: 0.3 }, FLOOR_HEIGHT)).toBe(FLOOR_HEIGHT);
  });

  it("stands on the centre of every tread of both flights", () => {
    for (const level of [0, 1]) {
      const { lower, upper } = stairBoxes(level);
      for (const step of [...lower, ...upper.slice(0, -1)]) {
        const centre = { u: (step.u0 + step.u1) / 2, v: (step.v0 + step.v1) / 2 };
        expect(groundHeight(centre, step.top - 1)).toBeCloseTo(step.top);
      }
    }
  });

  it("rises smoothly along a climbing route without leaving the steps", () => {
    const route = flightRoute(floor, 0, true);
    const { lower, upper } = stairBoxes(0);
    let previous = 0;
    for (const [from, to] of route.slice(1).map((point, index) => [route[index], point] as const)) {
      for (let t = 0; t <= 1; t += 0.01) {
        const point = { x: from.x + (to.x - from.x) * t, y: from.y + (to.y - from.y) * t };
        const z = from.z + (to.z - from.z) * t;
        const height = groundHeight(toGrid(floor, point), z);
        expect(height).toBeGreaterThanOrEqual(previous - 1e-9);
        expect(height - previous).toBeLessThan(lower[0].top / 2);
        const grid = toGrid(floor, point);
        const under = [...lower, ...upper].find(
          (step) => grid.u > step.u0 && grid.u < step.u1 && grid.v > step.v0 && grid.v < step.v1,
        );
        if (under) expect(Math.abs(height - under.top)).toBeLessThanOrEqual(lower[0].top / 2 + 1e-9);
        previous = height;
      }
    }
    expect(previous).toBe(FLOOR_HEIGHT);
  });
});

describe("headingYaw", () => {
  it("matches the sprite facing yaw for screen headings", () => {
    const origin = toScreen(floor, { u: 0.5, v: 0.5 });
    expect(headingYaw(floor, origin, { x: origin.x, y: origin.y + 10 })).toBeCloseTo(facingYaw("S"));
    expect(headingYaw(floor, origin, { x: origin.x + 10, y: origin.y })).toBeCloseTo(facingYaw("E"));
    expect(headingYaw(floor, origin, origin)).toBeUndefined();
  });
});

describe("turnToward", () => {
  it("turns the short way round and stops on the target", () => {
    expect(turnToward(3, -3, 0.1)).toBeCloseTo(3.1);
    expect(turnToward(0, 0.05, 0.1)).toBe(0.05);
  });
});

describe("blendPose", () => {
  const { poses } = clip("walk");

  it("hits each clip pose on its frame and blends between them", () => {
    expect(blendPose(poses, 1)).toEqual(expect.objectContaining(poses[0]));
    const half = blendPose(poses, 0.5 / poses.length);
    for (const key of Object.keys(poses[1]) as (keyof (typeof poses)[number])[]) {
      expect(half[key]).toBeCloseTo(((poses[0][key] ?? 0) + (poses[1][key] ?? 0)) / 2);
    }
  });

  it("wraps cycles past one", () => {
    expect(blendPose(poses, 2.25)).toEqual(blendPose(poses, 0.25));
  });
});

describe("strideLength", () => {
  it("scales with body height", () => {
    const stride = strideLength(bodyShape(DEFAULT_BODY_PARAMS));
    expect(stride).toBeGreaterThan(1);
    expect(strideLength(bodyShape({ ...DEFAULT_BODY_PARAMS, height: 1.2 }))).toBeCloseTo(stride * 1.2);
  });
});
