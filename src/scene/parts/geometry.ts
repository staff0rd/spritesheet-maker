import { BoxGeometry, type BufferGeometry, IcosahedronGeometry, LatheGeometry, type Material, Mesh, SphereGeometry, Vector2 } from "three";
import { RoundedBoxGeometry } from "three/examples/jsm/geometries/RoundedBoxGeometry.js";
import type { RenderStyle } from "../../core/style";
import { type BodyShape, type Profile, type Segment, STYLE_SEGMENTS } from "../rig";

export function mesh(geometry: BufferGeometry, material: Material, name: string): Mesh {
  const result = new Mesh(geometry, material);
  result.name = name;
  return result;
}

export function latheMesh(profile: Profile, segments: number, material: Material, name: string, depthScale = 1): Mesh {
  const geometry = new LatheGeometry(
    profile.map(([radius, y]) => new Vector2(radius, y)),
    segments,
  );
  geometry.scale(1, 1, depthScale);
  return mesh(geometry, material, name);
}

function segmentProfile({ length, top, bottom }: Segment): Profile {
  return [
    [0, -length],
    [bottom, -length],
    [top, 0],
    [0, 0],
  ];
}

function quarterArc(radius: number, centreY: number, from: number, to: number, steps: number): [number, number][] {
  return Array.from({ length: steps + 1 }, (_, step): [number, number] => {
    const angle = from + ((to - from) * step) / steps;
    const onAxis = Math.abs(Math.cos(angle)) < 1e-9;
    return [onAxis ? 0 : radius * Math.cos(angle), centreY + radius * Math.sin(angle)];
  });
}

function capsuleProfile({ length, top, bottom }: Segment, capSteps = 4): Profile {
  return [...quarterArc(bottom, -length, -Math.PI / 2, 0, capSteps), ...quarterArc(top, 0, 0, Math.PI / 2, capSteps)];
}

function roundedProfile(profile: Profile, iterations = 3): Profile {
  let points = profile;
  for (let iteration = 0; iteration < iterations; iteration++) {
    const cut: [number, number][] = [];
    for (let index = 0; index < points.length - 1; index++) {
      const [r0, y0] = points[index];
      const [r1, y1] = points[index + 1];
      cut.push([0.75 * r0 + 0.25 * r1, 0.75 * y0 + 0.25 * y1], [0.25 * r0 + 0.75 * r1, 0.25 * y0 + 0.75 * y1]);
    }
    points = [points[0], ...cut, points[points.length - 1]];
  }
  return points;
}

export function radiusAt(profile: Profile, y: number): number {
  const rim = profile.filter(([radius]) => radius > 0);
  if (y <= rim[0][1]) return rim[0][0];
  for (let index = 1; index < rim.length; index++) {
    const [r1, y1] = rim[index];
    if (y <= y1) {
      const [r0, y0] = rim[index - 1];
      return r0 + ((r1 - r0) * (y - y0)) / (y1 - y0);
    }
  }
  return rim[rim.length - 1][0];
}

function enclosingShell(profile: Profile, fromY: number, toY: number, margin: number): Profile {
  const ys = profile.map(([, y]) => y);
  const minY = Math.min(...ys);
  const maxY = Math.max(...ys);
  const low = Math.max(fromY, minY);
  const high = Math.min(toY, maxY);
  const inner = profile.filter(([radius, y]) => radius > 0 && y > low && y < high);
  const points: [number, number][] = [[radiusAt(profile, low), low], ...inner, [radiusAt(profile, high), high]].map(
    ([radius, y]) => [radius + margin, y],
  );
  if (fromY <= minY) points.unshift([0, minY - margin]);
  if (toY >= maxY) points.push([0, maxY + margin]);
  return points;
}

function segmentShell(segment: Segment, fromFraction: number, toFraction: number, margin: number): Profile {
  return enclosingShell(segmentProfile(segment), -toFraction * segment.length, -fromFraction * segment.length, margin);
}

export function torsoProfile(shape: BodyShape, style: RenderStyle): Profile {
  return style === "smooth" ? roundedProfile(shape.torso) : shape.torso;
}

export function limbProfile(segment: Segment, style: RenderStyle): Profile {
  return style === "smooth" ? capsuleProfile(segment) : segmentProfile(segment);
}

function offsetProfile(profile: Profile, margin: number): Profile {
  const last = profile.length - 1;
  return profile.map(([radius, y], index): [number, number] => {
    if (radius === 0) return [0, index === 0 ? y - margin : y + margin];
    const [r0, y0] = profile[Math.max(0, index - 1)];
    const [r1, y1] = profile[Math.min(last, index + 1)];
    const length = Math.hypot(r1 - r0, y1 - y0);
    return [radius + (margin * (y1 - y0)) / length, y - (margin * (r1 - r0)) / length];
  });
}

function cutProfile(profile: Profile, fromY: number, toY: number): Profile {
  const points: [number, number][] = [];
  profile.forEach(([radius, y], index) => {
    if (index > 0) {
      const [r0, y0] = profile[index - 1];
      const crossings = [fromY, toY]
        .filter((edge) => (y0 - edge) * (y - edge) < 0)
        .map((edge) => (edge - y0) / (y - y0))
        .sort((a, b) => a - b);
      for (const t of crossings) points.push([r0 + (radius - r0) * t, y0 + (y - y0) * t]);
    }
    if (y >= fromY && y <= toY) points.push([radius, y]);
  });
  return points;
}

export function torsoShell(shape: BodyShape, style: RenderStyle, fromY: number, toY: number, margin: number): Profile {
  if (style === "blocky") return enclosingShell(shape.torso, fromY, toY, margin);
  return cutProfile(offsetProfile(torsoProfile(shape, style), margin), fromY, toY);
}

export function limbShell(segment: Segment, style: RenderStyle, fromFraction: number, toFraction: number, margin: number): Profile {
  if (style === "blocky") return segmentShell(segment, fromFraction, toFraction, margin);
  const fromY = toFraction >= 1 ? -Infinity : -toFraction * segment.length;
  const toY = fromFraction <= 0 ? Infinity : -fromFraction * segment.length;
  return cutProfile(offsetProfile(limbProfile(segment, style), margin), fromY, toY);
}

export function ballGeometry(style: RenderStyle, radius: number, detail: number): BufferGeometry {
  const sides = STYLE_SEGMENTS[style].limb;
  return style === "smooth" ? new SphereGeometry(radius, sides, sides / 2 + 2) : new IcosahedronGeometry(radius, detail);
}

export function footRounding({ foot }: BodyShape): number {
  return Math.min(foot.width, foot.height) * 0.45;
}

export function boxGeometry(style: RenderStyle, width: number, height: number, depth: number, radius: number): BufferGeometry {
  return style === "smooth" ? new RoundedBoxGeometry(width, height, depth, 3, radius) : new BoxGeometry(width, height, depth);
}
