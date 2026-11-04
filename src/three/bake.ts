import { type BufferAttribute, type BufferGeometry, Float32BufferAttribute, type Group, Matrix4, Mesh, MeshLambertMaterial, type Object3D } from "three";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";
import type { Rig } from "../scene/rig";

export const RIG_MATERIAL = new MeshLambertMaterial({ vertexColors: true });

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

function ownMeshes(joint: Group, joints: Set<Object3D>): Mesh[] {
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

function hasMesh(object: Object3D): boolean {
  let found = false;
  object.traverse((child) => {
    found ||= child instanceof Mesh;
  });
  return found;
}

function disposeMesh(mesh: Mesh): void {
  mesh.geometry.dispose();
  for (const material of [mesh.material].flat()) material.dispose();
}

export function bakeRig(rig: Rig): void {
  const joints = new Set<Object3D>(Object.values(rig.joints));
  rig.root.updateMatrixWorld(true);
  for (const joint of Object.values(rig.joints)) {
    const toJoint = new Matrix4().copy(joint.matrixWorld).invert();
    const meshes = ownMeshes(joint, joints);
    const merged: BufferGeometry[] = [];
    for (const mesh of meshes) {
      if (mesh.userData.skirtFit) {
        mesh.geometry.setAttribute("color", vertexColours(mesh, mesh.geometry.attributes.position.count));
        for (const material of [mesh.material].flat()) material.dispose();
        mesh.material = RIG_MATERIAL;
        continue;
      }
      merged.push(colouredGeometry(mesh, toJoint.clone().multiply(mesh.matrixWorld)));
      mesh.removeFromParent();
      disposeMesh(mesh);
    }
    for (const child of [...joint.children]) {
      if (!joints.has(child) && !hasMesh(child)) child.removeFromParent();
    }
    if (merged.length === 0) continue;
    const geometry = mergeGeometries(merged);
    for (const part of merged) part.dispose();
    joint.add(new Mesh(geometry, RIG_MATERIAL));
  }
}

export function disposeBakedRigs(root: Object3D): void {
  root.traverse((object) => {
    if (object instanceof Mesh) object.geometry.dispose();
  });
}
