import { Vector3 } from "three";
import { describe, expect, it } from "vitest";
import { DEFAULT_CAPTURE_CONFIG } from "../core/config";
import { createIsometricCamera } from "../scene/camera";
import { FLOOR_HEIGHT, toScreen } from "../phaser/crowd";
import { WANDER } from "../crowd/plan";
import { gridToWorld, screenToWorld, unitsPerGrid, UNITS_PER_Z } from "./world";

const { floor } = WANDER;

function projectToPixels(point: { x: number; y: number; z: number }): { x: number; y: number } {
  const camera = createIsometricCamera(DEFAULT_CAPTURE_CONFIG);
  camera.updateMatrixWorld();
  const view = new Vector3(point.x, point.y, point.z).applyMatrix4(camera.matrixWorldInverse);
  const { pixelsPerUnit } = DEFAULT_CAPTURE_CONFIG;
  return { x: view.x * pixelsPerUnit, y: -view.y * pixelsPerUnit };
}

describe("gridToWorld", () => {
  it("puts the floor centre at the world origin", () => {
    expect(gridToWorld(floor, { u: 0.5, v: 0.5 })).toEqual({ x: 0, y: 0, z: 0 });
  });

  it("maps u to world X, v to world Z and z to world Y", () => {
    const scale = unitsPerGrid(floor);
    expect(gridToWorld(floor, { u: 1, v: 0.5 })).toEqual({ x: scale / 2, y: 0, z: 0 });
    expect(gridToWorld(floor, { u: 0.5, v: 1 })).toEqual({ x: 0, y: 0, z: scale / 2 });
    expect(gridToWorld(floor, { u: 0.5, v: 0.5 }, FLOOR_HEIGHT).y).toBeCloseTo(FLOOR_HEIGHT * UNITS_PER_Z);
  });

  it("projects through the sprite capture camera to the same pixels as the Phaser view", () => {
    const origin = projectToPixels(gridToWorld(floor, { u: 0.5, v: 0.5 }));
    for (const [grid, z] of [
      [{ u: 0, v: 0 }, 0],
      [{ u: 1, v: 0 }, 0],
      [{ u: 0.2, v: 0.7 }, 60],
      [{ u: 0.5, v: 0.5 }, 240],
    ] as const) {
      const pixels = projectToPixels(gridToWorld(floor, grid, z));
      const expected = toScreen(floor, grid, z);
      expect(pixels.x - origin.x).toBeCloseTo(expected.x, 6);
      expect(pixels.y - origin.y).toBeCloseTo(expected.y, 6);
    }
  });
});

describe("screenToWorld", () => {
  it("round-trips Phaser screen points through the grid", () => {
    const grid = { u: 0.3, v: 0.8 };
    const world = screenToWorld(floor, toScreen(floor, grid), 120);
    const expected = gridToWorld(floor, grid, 120);
    expect(world.x).toBeCloseTo(expected.x);
    expect(world.y).toBeCloseTo(expected.y);
    expect(world.z).toBeCloseTo(expected.z);
  });
});

