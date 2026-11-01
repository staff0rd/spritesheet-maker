import { GridHelper, type Group, Mesh, PerspectiveCamera, WebGLRenderer } from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import { PART_CATALOG } from "../core/catalog";
import type { CategoryId, PartSpec } from "../core/parts";
import { createLitScene } from "./capture";
import { applyPose, CLIPS } from "./animation";
import { buildDressedCharacter, type TintedPart } from "./character";
import type { Rig } from "./rig";
import { proceduralProvider } from "./parts/procedural";

const NONE = "";

const DEFAULT_TINTS: Record<CategoryId, string> = {
  body: "#e0ac69",
  hair: "#4a2c17",
  top: "#2e86c1",
  bottom: "#34495e",
  shoes: "#f0f0f0",
  hat: "#c0392b",
};

interface CategoryControl {
  variant: HTMLSelectElement;
  tint: HTMLInputElement;
}

function labelled(text: string, ...inputs: HTMLElement[]): HTMLLabelElement {
  const label = document.createElement("label");
  label.style.display = "flex";
  label.style.gap = "6px";
  label.style.alignItems = "center";
  const name = document.createElement("span");
  name.textContent = text;
  name.style.width = "56px";
  label.append(name, ...inputs);
  return label;
}

function disposeCharacter(character: Group): void {
  character.traverse((object) => {
    if (object instanceof Mesh) {
      object.geometry.dispose();
      for (const material of [object.material].flat()) material.dispose();
    }
  });
}

export function mountViewer(container: HTMLElement): void {
  document.body.style.margin = "0";
  document.body.style.overflow = "hidden";
  const scene = createLitScene();
  scene.add(new GridHelper(4, 16, 0x888888, 0xcccccc));

  const renderer = new WebGLRenderer({ antialias: true, alpha: true });
  renderer.setPixelRatio(window.devicePixelRatio);
  renderer.domElement.style.display = "block";
  container.append(renderer.domElement);

  const camera = new PerspectiveCamera(35, 1, 0.1, 100);
  camera.position.set(3, 2.2, 3);
  const controls = new OrbitControls(camera, renderer.domElement);
  controls.target.set(0, 0.95, 0);
  controls.update();

  const panel = document.createElement("form");
  panel.style.cssText =
    "position:fixed;top:16px;left:16px;display:flex;flex-direction:column;gap:6px;padding:12px;background:rgba(255,255,255,.9);border-radius:8px;font:13px system-ui";
  document.body.append(panel);

  const controlsByCategory = new Map<CategoryId, CategoryControl>();
  for (const category of PART_CATALOG.categories) {
    const variant = document.createElement("select");
    if (category.optional) variant.add(new Option("none", NONE));
    for (const option of category.variants) variant.add(new Option(option.id, option.id));
    const tint = document.createElement("input");
    tint.type = "color";
    tint.value = DEFAULT_TINTS[category.id];
    controlsByCategory.set(category.id, { variant, tint });
    panel.append(labelled(category.id, variant, tint));
  }

  const seed = document.createElement("input");
  seed.type = "number";
  seed.value = "1";
  seed.style.width = "64px";
  const randomise = document.createElement("button");
  randomise.type = "button";
  randomise.textContent = "Random outfit";
  const sheets = document.createElement("a");
  sheets.href = "?view=sheets";
  sheets.textContent = "View rendered sheets";
  const crowd = document.createElement("a");
  crowd.href = "/preview.html";
  crowd.textContent = "Crowd preview (from out/)";
  panel.append(labelled("seed", seed), randomise, sheets, crowd);

  const animation = document.createElement("select");
  animation.add(new Option("rest", NONE));
  for (const clip of CLIPS) animation.add(new Option(clip.name, clip.name));
  panel.append(labelled("anim", animation));

  let character: Rig | undefined;

  function selected(): { body: TintedPart; parts: TintedPart[] } {
    const picks = PART_CATALOG.categories.flatMap((category) => {
      const control = controlsByCategory.get(category.id)!;
      const variant = category.variants.find((option) => option.id === control.variant.value);
      if (!variant) return [];
      const spec: PartSpec = { ...variant, category: category.id };
      return [{ spec, tint: Number.parseInt(control.tint.value.slice(1), 16) }];
    });
    const body = picks.find((pick) => pick.spec.category === PART_CATALOG.baseCategory)!;
    return { body, parts: picks.filter((pick) => pick !== body) };
  }

  function rebuild(): void {
    if (character) {
      scene.remove(character.root);
      disposeCharacter(character.root);
    }
    const { body, parts } = selected();
    character = buildDressedCharacter(proceduralProvider, Number(seed.value) || 0, body, parts);
    scene.add(character.root);
  }

  randomise.addEventListener("click", () => {
    for (const { variant } of controlsByCategory.values()) {
      variant.selectedIndex = Math.floor(Math.random() * variant.options.length);
    }
    rebuild();
  });
  panel.addEventListener("input", rebuild);

  function resize(): void {
    const { innerWidth: width, innerHeight: height } = window;
    renderer.setSize(width, height);
    camera.aspect = width / height;
    camera.updateProjectionMatrix();
  }
  window.addEventListener("resize", resize);
  resize();
  rebuild();

  renderer.setAnimationLoop((time) => {
    const clip = CLIPS.find((candidate) => candidate.name === animation.value);
    if (character) applyPose(character, clip ? clip.poses[Math.floor((time / 1000) * clip.fps) % clip.poses.length] : {});
    controls.update();
    renderer.render(scene, camera);
  });
}
