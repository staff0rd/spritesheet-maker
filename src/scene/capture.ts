import { DirectionalLight, HemisphereLight, Scene, WebGLRenderer } from "three";
import { facingYaw } from "../core/directions";
import { computeSheetLayout } from "../core/layout";
import type { RenderSheetRequest } from "./api";
import { buildBody } from "./body";
import { createIsometricCamera } from "./camera";

function createLitScene(): Scene {
  const scene = new Scene();
  scene.add(new HemisphereLight(0xffffff, 0x606060, 1.6));
  const key = new DirectionalLight(0xffffff, 1.8);
  key.position.set(-2, 4, 3);
  scene.add(key);
  return scene;
}

export function renderSheet({ config, framesPerDirection }: RenderSheetRequest): string {
  const layout = computeSheetLayout(config.frameSize, config.directions, framesPerDirection);
  const renderer = new WebGLRenderer({ alpha: true, antialias: true, preserveDrawingBuffer: true });
  renderer.setPixelRatio(1);
  renderer.setSize(config.frameSize.width, config.frameSize.height, false);
  renderer.setClearColor(0x000000, 0);

  const scene = createLitScene();
  const camera = createIsometricCamera(config);
  const body = buildBody();
  scene.add(body);

  const sheet = document.createElement("canvas");
  sheet.width = layout.sheetSize.width;
  sheet.height = layout.sheetSize.height;
  const context = sheet.getContext("2d");
  if (!context) throw new Error("2D canvas context unavailable");

  for (const rect of layout.frames) {
    body.rotation.y = facingYaw(rect.direction);
    renderer.render(scene, camera);
    context.drawImage(renderer.domElement, rect.x, rect.y, rect.width, rect.height);
  }

  renderer.dispose();
  return sheet.toDataURL("image/png");
}
