import { type BufferAttribute, type BufferGeometry, Color, Float32BufferAttribute, Matrix4, Mesh, MeshLambertMaterial, type Object3D } from "three";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";
import type { PartSpec } from "../core/parts";
import { buildLayer, rigFor, type TintedPart } from "../scene/character";
import type { PartProvider } from "../scene/parts/types";
import type { JointName, Rig } from "../scene/rig";
import { type FittedSkirt, sharedSkirtFitter, type SkirtTemplate, type TintedSkirt, withAttributes } from "./skirts";

export const RIG_MATERIAL = new MeshLambertMaterial({ vertexColors: true });

const UNTINTED = 0xffffff;

interface LayerBake {
  key: string;
  joints: Map<JointName, BufferGeometry>;
  skirts: SkirtTemplate[];
}

interface TintedLayer {
  bake: LayerBake;
  tint: number;
}

export interface CrowdRig {
  rig: Rig;
  fitSkirts: (key: string) => void;
}

function vertexColours(mesh: Mesh, count: number): Float32BufferAttribute {
  const { color } = mesh.material as MeshLambertMaterial;
  const colours = new Float32Array(count * 3);
  for (let index = 0; index < colours.length; index += 3) color.toArray(colours, index);
  return new Float32BufferAttribute(colours, 3);
}

function colouredGeometry(mesh: Mesh, toJoint: Matrix4): BufferGeometry {
  const geometry = mesh.geometry.clone().applyMatrix4(toJoint);
  for (const name of Object.keys(geometry.attributes)) {
    if (name !== "position" && name !== "normal") geometry.deleteAttribute(name);
  }
  const { count } = geometry.attributes.position;
  if (!geometry.index) geometry.setIndex(Array.from({ length: count }, (_, index) => index));
  if (toJoint.determinant() < 0) flipWinding(geometry.index!);
  geometry.setAttribute("color", vertexColours(mesh, count));
  return geometry;
}

function flipWinding(index: BufferAttribute): void {
  for (let start = 0; start < index.count; start += 3) {
    const second = index.getX(start + 1);
    index.setX(start + 1, index.getX(start + 2));
    index.setX(start + 2, second);
  }
}

function ownMeshes(joint: Object3D, joints: Set<Object3D>): Mesh[] {
  const meshes: Mesh[] = [];
  const visit = (object: Object3D) => {
    for (const child of object.children) {
      if (joints.has(child)) continue;
      if (child instanceof Mesh) meshes.push(child);
      visit(child);
    }
  };
  visit(joint);
  return meshes;
}

function disposeMaterials(mesh: Mesh): void {
  for (const material of [mesh.material].flat()) material.dispose();
}

function bakeLayer(key: string, rig: Rig): LayerBake {
  const jointSet = new Set<Object3D>(Object.values(rig.joints));
  const joints = new Map<JointName, BufferGeometry>();
  const skirts: SkirtTemplate[] = [];
  rig.root.updateMatrixWorld(true);
  for (const [name, joint] of Object.entries(rig.joints) as [JointName, Object3D][]) {
    const toJoint = joint.matrixWorld.clone().invert();
    const parts: BufferGeometry[] = [];
    for (const mesh of ownMeshes(joint, jointSet)) {
      const transform = toJoint.clone().multiply(mesh.matrixWorld);
      if (mesh.userData.skirtFit) {
        mesh.geometry.setAttribute("color", vertexColours(mesh, mesh.geometry.attributes.position.count));
        skirts.push({ joint: name, rest: mesh.geometry, transform, fit: mesh.userData.skirtFit, frames: new Map() });
      } else {
        parts.push(colouredGeometry(mesh, transform));
        mesh.geometry.dispose();
      }
      disposeMaterials(mesh);
    }
    if (parts.length === 0) continue;
    joints.set(name, mergeGeometries(parts));
    for (const part of parts) part.dispose();
  }
  return { key, joints, skirts };
}

function tinted(shades: BufferAttribute, ranges: readonly { count: number; tint: number }[]): Float32BufferAttribute {
  const colours = Float32Array.from(shades.array as Float32Array);
  const colour = new Color();
  let start = 0;
  for (const { count, tint } of ranges) {
    colour.set(tint);
    for (let vertex = start; vertex < start + count; vertex++) {
      colours[vertex * 3] *= colour.r;
      colours[vertex * 3 + 1] *= colour.g;
      colours[vertex * 3 + 2] *= colour.b;
    }
    start += count;
  }
  return new Float32BufferAttribute(colours, 3);
}

function specKey({ category, id }: PartSpec): string {
  return `${category}/${id}`;
}

export class RigFactory {
  private readonly layers = new Map<string, LayerBake>();
  private readonly untinted = new Map<string, BufferGeometry>();
  private readonly joints = new Map<string, BufferGeometry>();
  private readonly skirts = new Map<string, TintedSkirt>();

  constructor(
    private readonly provider: PartProvider,
    private readonly seed: number,
  ) {}

  get geometryCount(): number {
    return this.rendered().length;
  }

  build(body: TintedPart, parts: readonly TintedPart[]): CrowdRig {
    const layers = [body, ...parts].map(({ spec, tint }) => ({ bake: this.layer(body.spec, spec), tint }));
    const rig = rigFor(body.spec);
    for (const [name, joint] of Object.entries(rig.joints) as [JointName, Object3D][]) {
      const geometry = this.jointGeometry(name, layers);
      if (geometry) joint.add(new Mesh(geometry, RIG_MATERIAL));
    }
    const skirts: FittedSkirt[] = layers.flatMap(({ bake, tint }) =>
      bake.skirts.map((template, index) => {
        const skirt = this.tintedSkirt(`${bake.key}#${index}#${tint}`, template, tint);
        const mesh = new Mesh(withAttributes(template.rest, { color: skirt.colour }), RIG_MATERIAL);
        template.transform.decompose(mesh.position, mesh.quaternion, mesh.scale);
        mesh.userData.skirtFit = template.fit;
        rig.joints[template.joint].add(mesh);
        return { mesh, skirt };
      }),
    );
    return { rig, fitSkirts: sharedSkirtFitter(rig, skirts) };
  }

  dispose(): void {
    for (const geometry of this.rendered()) geometry.dispose();
    this.layers.clear();
    this.untinted.clear();
    this.joints.clear();
    this.skirts.clear();
  }

  private rendered(): BufferGeometry[] {
    return [...this.joints.values(), ...[...this.skirts.values()].flatMap((skirt) => [...skirt.frames.values()])];
  }

  private layer(body: PartSpec, spec: PartSpec): LayerBake {
    const key = `${specKey(body)}|${specKey(spec)}`;
    let baked = this.layers.get(key);
    if (!baked) {
      baked = bakeLayer(key, buildLayer(this.provider, this.seed, body, { spec, tint: UNTINTED }));
      this.layers.set(key, baked);
    }
    return baked;
  }

  private jointGeometry(name: JointName, layers: readonly TintedLayer[]): BufferGeometry | undefined {
    const present = layers.filter(({ bake }) => bake.joints.has(name));
    if (present.length === 0) return undefined;
    const key = `${name}:${present.map(({ bake, tint }) => `${bake.key}#${tint}`).join("+")}`;
    let geometry = this.joints.get(key);
    if (!geometry) {
      const base = this.untintedGeometry(name, present);
      const ranges = present.map(({ bake, tint }) => ({ count: bake.joints.get(name)!.attributes.position.count, tint }));
      geometry = withAttributes(base, { color: tinted(base.getAttribute("color") as BufferAttribute, ranges) });
      this.joints.set(key, geometry);
    }
    return geometry;
  }

  private untintedGeometry(name: JointName, present: readonly TintedLayer[]): BufferGeometry {
    if (present.length === 1) return present[0].bake.joints.get(name)!;
    const key = `${name}:${present.map(({ bake }) => bake.key).join("+")}`;
    let geometry = this.untinted.get(key);
    if (!geometry) {
      geometry = mergeGeometries(present.map(({ bake }) => bake.joints.get(name)!));
      this.untinted.set(key, geometry);
    }
    return geometry;
  }

  private tintedSkirt(key: string, template: SkirtTemplate, tint: number): TintedSkirt {
    let skirt = this.skirts.get(key);
    if (!skirt) {
      const shades = template.rest.getAttribute("color") as BufferAttribute;
      skirt = { template, colour: tinted(shades, [{ count: shades.count, tint }]), frames: new Map() };
      this.skirts.set(key, skirt);
    }
    return skirt;
  }
}
