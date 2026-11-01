import type { BufferAttribute, Mesh } from "three";
import { LEGS, type Rig } from "../rig";

const CLEARANCE = 0.015;
const SAMPLES_PER_SEGMENT = 16;
const ARC_SAMPLES = 9;

interface SkirtRow {
  y: number;
  vertices: number[];
  front: [number, number][];
  back: [number, number][];
}

interface SkirtFit {
  rest: Float32Array;
  rows: SkirtRow[];
}

interface LegSlice {
  x: number;
  y: number;
  z: number;
  radius: number;
  depth: number;
}

function outline(points: [number, number][]): [number, number][] {
  return [...points].sort(([a], [b]) => a - b);
}

export function makeFittedSkirt(skirt: Mesh): void {
  const position = skirt.geometry.getAttribute("position") as BufferAttribute;
  const rest = Float32Array.from(position.array as Float32Array);
  const byY = new Map<number, number[]>();
  for (let index = 0; index < position.count; index++) {
    const y = rest[index * 3 + 1];
    byY.set(y, [...(byY.get(y) ?? []), index]);
  }
  const rows = [...byY.entries()]
    .map(([y, vertices]) => ({
      y,
      vertices,
      front: outline(vertices.filter((v) => rest[v * 3 + 2] >= -1e-9).map((v) => [rest[v * 3], rest[v * 3 + 2]])),
      back: outline(vertices.filter((v) => rest[v * 3 + 2] <= 1e-9).map((v) => [rest[v * 3], -rest[v * 3 + 2]])),
    }))
    .sort((a, b) => a.y - b.y);
  const fit: SkirtFit = { rest, rows };
  skirt.userData.skirtFit = fit;
}

function legSlices(rig: Rig, upper: (typeof LEGS)[number]["upper"], lower: (typeof LEGS)[number]["lower"]): LegSlice[] {
  const { shape, joints } = rig;
  const hip = joints[upper].position;
  const thighAngle = joints[upper].rotation.x;
  const shinAngle = thighAngle + joints[lower].rotation.x;
  const lift = joints.torso.position.y;
  const slices: LegSlice[] = [];
  const segments = [
    { segment: shape.thigh, angle: thighAngle, startY: hip.y, startZ: 0 },
    {
      segment: shape.shin,
      angle: shinAngle,
      startY: hip.y - shape.thigh.length * Math.cos(thighAngle),
      startZ: -shape.thigh.length * Math.sin(thighAngle),
    },
  ];
  for (const { segment, angle, startY, startZ } of segments) {
    for (let step = 0; step <= SAMPLES_PER_SEGMENT; step++) {
      const t = step / SAMPLES_PER_SEGMENT;
      const radius = segment.top + (segment.bottom - segment.top) * t;
      slices.push({
        x: hip.x,
        y: startY - t * segment.length * Math.cos(angle) - lift,
        z: startZ - t * segment.length * Math.sin(angle),
        radius,
        depth: radius / Math.cos(angle),
      });
    }
  }
  return slices;
}

function outlineDepth(outline: [number, number][], x: number): number {
  for (let index = 1; index < outline.length; index++) {
    const [x0, z0] = outline[index - 1];
    const [x1, z1] = outline[index];
    if (x >= x0 && x <= x1) return x1 === x0 ? Math.max(z0, z1) : z0 + ((z1 - z0) * (x - x0)) / (x1 - x0);
  }
  return 0;
}

function stretch(outline: [number, number][], slices: LegSlice[], direction: 1 | -1): number {
  let scale = 1;
  for (const slice of slices) {
    for (let step = 0; step <= ARC_SAMPLES; step++) {
      const angle = (Math.PI * step) / ARC_SAMPLES;
      const x = slice.x + slice.radius * Math.cos(angle);
      const reach = direction * slice.z + (slice.depth + CLEARANCE) * Math.sin(angle);
      const standingReach = (slice.radius + CLEARANCE) * Math.sin(angle);
      const available = Math.max(outlineDepth(outline, x), standingReach);
      if (available > 1e-3 && reach > 0) scale = Math.max(scale, reach / available);
    }
  }
  return scale;
}

function fitSkirt(skirt: Mesh, fit: SkirtFit, slices: LegSlice[]): void {
  const position = skirt.geometry.getAttribute("position") as BufferAttribute;
  const { rows, rest } = fit;
  const hemY = rows[0].y;
  rows.forEach((row, index) => {
    const below = index > 0 ? rows[index - 1].y : hemY;
    const above = index < rows.length - 1 ? rows[index + 1].y : row.y;
    const nearby = slices.filter((slice) => slice.y >= below && slice.y <= above);
    const front = stretch(row.front, nearby, 1);
    const back = stretch(row.back, nearby, -1);
    for (const vertex of row.vertices) {
      const z = rest[vertex * 3 + 2];
      position.setZ(vertex, z * (z > 0 ? front : back));
    }
  });
  position.needsUpdate = true;
  skirt.geometry.computeBoundingSphere();
}

export function fitSkirts(rig: Rig): void {
  const skirts: Mesh[] = [];
  rig.joints.torso.traverse((object) => {
    if (object.userData.skirtFit) skirts.push(object as Mesh);
  });
  if (skirts.length === 0) return;
  const slices = LEGS.flatMap((leg) => legSlices(rig, leg.upper, leg.lower));
  for (const skirt of skirts) fitSkirt(skirt, skirt.userData.skirtFit as SkirtFit, slices);
}
