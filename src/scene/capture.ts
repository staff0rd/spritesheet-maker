import { DirectionalLight, HemisphereLight, Mesh, Scene, WebGLRenderer } from "three";
import { facingYaw } from "../core/directions";
import { computeSheetLayout, type Size } from "../core/layout";
import type { RenderSheetRequest } from "./api";
import { createIsometricCamera } from "./camera";
import { buildCharacter } from "./character";
import { proceduralProvider } from "./parts/procedural";

let sharedRenderer: WebGLRenderer | undefined;

function rendererFor(frameSize: Size): WebGLRenderer {
  sharedRenderer ??= new WebGLRenderer({ alpha: true, antialias: true, preserveDrawingBuffer: true });
  sharedRenderer.setPixelRatio(1);
  sharedRenderer.setSize(frameSize.width, frameSize.height, false);
  sharedRenderer.setClearColor(0x000000, 0);
  return sharedRenderer;
}

export function createLitScene(): Scene {
  const scene = new Scene();
  scene.add(new HemisphereLight(0xffffff, 0x606060, 1.6));
  const key = new DirectionalLight(0xffffff, 1.8);
  key.position.set(-2, 4, 3);
  scene.add(key);
  return scene;
}

function dispose(scene: Scene): void {
  scene.traverse((object) => {
    if (object instanceof Mesh) {
      object.geometry.dispose();
      for (const material of [object.material].flat()) material.dispose();
    }
  });
}

export function renderSheet({ config, framesPerDirection, body, part }: RenderSheetRequest): string {
  const layout = computeSheetLayout(config.frameSize, config.directions, framesPerDirection);
  const renderer = rendererFor(config.frameSize);
  const scene = createLitScene();
  const camera = createIsometricCamera(config);
  const character = buildCharacter(proceduralProvider, { seed: config.seed, body, part });
  scene.add(character);

  const sheet = document.createElement("canvas");
  sheet.width = layout.sheetSize.width;
  sheet.height = layout.sheetSize.height;
  const context = sheet.getContext("2d");
  if (!context) throw new Error("2D canvas context unavailable");

  for (const rect of layout.frames) {
    character.rotation.y = facingYaw(rect.direction);
    renderer.render(scene, camera);
    context.drawImage(renderer.domElement, rect.x, rect.y, rect.width, rect.height);
  }

  dispose(scene);
  return sheet.toDataURL("image/png");
}
