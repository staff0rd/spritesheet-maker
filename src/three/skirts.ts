import { type BufferAttribute, BufferGeometry, type Matrix4, type Mesh, type Sphere } from "three";
import { fitSkirts } from "../scene/parts/skirtFit";
import type { JointName, Rig } from "../scene/rig";

const SKIRT_FRAMES_PER_CYCLE = 24;

interface SkirtFrame {
  position: BufferAttribute;
  sphere: Sphere;
}

export interface SkirtTemplate {
  joint: JointName;
  rest: BufferGeometry;
  transform: Matrix4;
  fit: unknown;
  frames: Map<string, SkirtFrame>;
}

export interface TintedSkirt {
  template: SkirtTemplate;
  colour: BufferAttribute;
  frames: Map<string, BufferGeometry>;
}

export interface FittedSkirt {
  mesh: Mesh;
  skirt: TintedSkirt;
}

export function skirtFrame(cycle: number): number {
  return Math.floor((((cycle % 1) + 1) % 1) * SKIRT_FRAMES_PER_CYCLE) % SKIRT_FRAMES_PER_CYCLE;
}

export function withAttributes(base: BufferGeometry, overrides: Record<string, BufferAttribute>): BufferGeometry {
  const geometry = new BufferGeometry();
  geometry.setIndex(base.index);
  for (const [name, attribute] of Object.entries({ ...base.attributes, ...overrides })) {
    geometry.setAttribute(name, attribute as BufferAttribute);
  }
  return geometry;
}

function frameGeometry({ template, colour, frames }: TintedSkirt, key: string): BufferGeometry {
  let geometry = frames.get(key);
  if (!geometry) {
    const { position, sphere } = template.frames.get(key)!;
    geometry = withAttributes(template.rest, { position, color: colour });
    geometry.boundingSphere = sphere;
    frames.set(key, geometry);
  }
  return geometry;
}

export function sharedSkirtFitter(rig: Rig, skirts: readonly FittedSkirt[]): (key: string) => void {
  if (skirts.length === 0) return () => {};
  let current = "";
  return (key) => {
    if (key === current) return;
    current = key;
    if (!skirts.every(({ skirt }) => skirt.template.frames.has(key))) {
      for (const { mesh, skirt } of skirts) {
        const position = (skirt.template.rest.getAttribute("position") as BufferAttribute).clone();
        mesh.geometry = withAttributes(skirt.template.rest, { position, color: skirt.colour });
      }
      fitSkirts(rig);
      for (const { mesh, skirt } of skirts) {
        if (skirt.template.frames.has(key)) continue;
        const position = mesh.geometry.getAttribute("position") as BufferAttribute;
        skirt.template.frames.set(key, { position, sphere: mesh.geometry.boundingSphere!.clone() });
      }
    }
    for (const { mesh, skirt } of skirts) mesh.geometry = frameGeometry(skirt, key);
  };
}
