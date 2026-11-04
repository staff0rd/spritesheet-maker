import { BoxGeometry, type BufferGeometry, Group, Mesh, MeshLambertMaterial, Quaternion, Vector3 } from "three";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";
import { COLORS, RAIL_HEIGHT, RAIL_POST_SPACING, SLAB_THICKNESS } from "../crowd/plan";
import {
  type Floor,
  type GridBox,
  LEVEL_COUNT,
  levelHeight,
  pillars,
  type RailPoint,
  SLAB_OUTLINE,
  stairBoxes,
  stairRails,
} from "../phaser/crowd";
import { gridToWorld, type WorldPoint } from "./world";

const RAIL_THICKNESS = 0.04;

function block(floor: Floor, { u0, u1, v0, v1 }: GridBox, bottom: number, top: number): BufferGeometry {
  const min = gridToWorld(floor, { u: u0, v: v0 }, bottom);
  const max = gridToWorld(floor, { u: u1, v: v1 }, top);
  const geometry = new BoxGeometry(max.x - min.x, max.y - min.y, max.z - min.z);
  geometry.translate((min.x + max.x) / 2, (min.y + max.y) / 2, (min.z + max.z) / 2);
  return geometry;
}

function beam(from: WorldPoint, to: WorldPoint): BufferGeometry {
  const start = new Vector3(from.x, from.y, from.z);
  const delta = new Vector3(to.x, to.y, to.z).sub(start);
  const geometry = new BoxGeometry(RAIL_THICKNESS, RAIL_THICKNESS, delta.length() + RAIL_THICKNESS);
  geometry.applyQuaternion(new Quaternion().setFromUnitVectors(new Vector3(0, 0, 1), delta.clone().normalize()));
  geometry.translate(start.x + delta.x / 2, start.y + delta.y / 2, start.z + delta.z / 2);
  return geometry;
}

function railGeometries(floor: Floor, rail: RailPoint[]): BufferGeometry[] {
  return rail.slice(1).flatMap((to, index) => {
    const from = rail[index];
    const at = (t: number, lift: number) =>
      gridToWorld(
        floor,
        { u: from.u + (to.u - from.u) * t, v: from.v + (to.v - from.v) * t },
        from.z + (to.z - from.z) * t + lift,
      );
    const posts = Math.max(1, Math.round(Math.hypot(to.u - from.u, to.v - from.v) / RAIL_POST_SPACING));
    return [
      beam(at(0, RAIL_HEIGHT), at(1, RAIL_HEIGHT)),
      ...Array.from({ length: posts + 1 }, (_, post) => beam(at(post / posts, 0), at(post / posts, RAIL_HEIGHT))),
    ];
  });
}

function slabBox(): GridBox {
  const us = SLAB_OUTLINE.map(({ u }) => u);
  const vs = SLAB_OUTLINE.map(({ v }) => v);
  return { u0: Math.min(...us), u1: Math.max(...us), v0: Math.min(...vs), v1: Math.max(...vs) };
}

export function buildLevels(floor: Floor): Group {
  const parts = new Map<number, BufferGeometry[]>();
  const add = (color: number, ...geometries: BufferGeometry[]) =>
    parts.set(color, [...(parts.get(color) ?? []), ...geometries]);

  add(COLORS.levels[0], block(floor, { u0: 0, u1: 1, v0: 0, v1: 1 }, -SLAB_THICKNESS, 0));

  for (let level = 0; level < LEVEL_COUNT; level++) {
    const base = levelHeight(level);
    if (level > 0) add(COLORS.levels[level], block(floor, slabBox(), base - SLAB_THICKNESS, base));
    for (const box of pillars(level)) {
      add(COLORS.pillarLeft, block(floor, box, base, levelHeight(level + 1) - SLAB_THICKNESS));
    }
    if (level < LEVEL_COUNT - 1) {
      const { lower, upper } = stairBoxes(level);
      for (const step of [...lower, ...upper]) add(COLORS.stairTop, block(floor, step, step.bottom, step.top));
      const { back, inner, front } = stairRails(level);
      add(COLORS.rail, ...[back, inner, front].flatMap((rail) => railGeometries(floor, rail)));
    }
  }

  const group = new Group();
  for (const [color, geometries] of parts) {
    const merged = mergeGeometries(geometries);
    for (const geometry of geometries) geometry.dispose();
    group.add(new Mesh(merged, new MeshLambertMaterial({ color })));
  }
  return group;
}
