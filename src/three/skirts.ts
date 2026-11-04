import type { BufferAttribute, Mesh } from "three";
import { fitSkirts } from "../scene/parts/skirtFit";
import type { Rig } from "../scene/rig";

const SKIRT_FRAMES_PER_CYCLE = 24;

export function skirtFrame(cycle: number): number {
  return Math.floor((((cycle % 1) + 1) % 1) * SKIRT_FRAMES_PER_CYCLE) % SKIRT_FRAMES_PER_CYCLE;
}

export function cachedSkirtFitter(rig: Rig): (key: string) => void {
  const skirts: Mesh[] = [];
  rig.joints.torso.traverse((object) => {
    if (object.userData.skirtFit) skirts.push(object as Mesh);
  });
  if (skirts.length === 0) return () => {};
  const fitted = new Map<string, Float32Array[]>();
  let current = "";
  return (key) => {
    if (key === current) return;
    current = key;
    const positions = skirts.map((skirt) => skirt.geometry.getAttribute("position") as BufferAttribute);
    const cached = fitted.get(key);
    if (!cached) {
      fitSkirts(rig);
      fitted.set(key, positions.map((position) => Float32Array.from(position.array as Float32Array)));
      return;
    }
    positions.forEach((position, index) => {
      (position.array as Float32Array).set(cached[index]);
      position.needsUpdate = true;
    });
  };
}
