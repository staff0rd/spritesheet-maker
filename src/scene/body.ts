import {
  BoxGeometry,
  CylinderGeometry,
  type BufferGeometry,
  Group,
  IcosahedronGeometry,
  type Material,
  Mesh,
  MeshLambertMaterial,
} from "three";

export interface BodyParams {
  height: number;
  build: number;
}

const DEFAULT_BODY_PARAMS: BodyParams = { height: 1, build: 1 };

const SKIN_GREY = 0xc8c8c8;

function mesh(geometry: BufferGeometry, material: Material, name: string): Mesh {
  const result = new Mesh(geometry, material);
  result.name = name;
  return result;
}

function hangingCylinder(radiusTop: number, radiusBottom: number, length: number): CylinderGeometry {
  const geometry = new CylinderGeometry(radiusTop, radiusBottom, length, 6);
  geometry.translate(0, -length / 2, 0);
  return geometry;
}

function buildLeg(side: 1 | -1, build: number, material: Material): Group {
  const leg = new Group();
  leg.name = side === 1 ? "leg.left" : "leg.right";
  leg.position.set(0.1 * side * build, 0.92, 0);

  const thigh = mesh(hangingCylinder(0.085 * build, 0.065 * build, 0.46), material, "thigh");
  const knee = new Group();
  knee.name = "knee";
  knee.position.y = -0.46;
  const shin = mesh(hangingCylinder(0.06 * build, 0.045 * build, 0.42), material, "shin");
  const foot = mesh(new BoxGeometry(0.1 * build, 0.06, 0.22), material, "foot");
  foot.position.set(0, -0.42 - 0.01, 0.05);

  knee.add(shin, foot);
  leg.add(thigh, knee);
  return leg;
}

function buildArm(side: 1 | -1, build: number, material: Material): Group {
  const arm = new Group();
  arm.name = side === 1 ? "arm.left" : "arm.right";
  arm.position.set(0.23 * side * build, 1.44, 0);
  arm.rotation.z = 0.08 * side;

  const upper = mesh(hangingCylinder(0.055 * build, 0.045 * build, 0.3), material, "upperArm");
  const elbow = new Group();
  elbow.name = "elbow";
  elbow.position.y = -0.3;
  const forearm = mesh(hangingCylinder(0.045 * build, 0.035 * build, 0.27), material, "forearm");
  const hand = mesh(new IcosahedronGeometry(0.045, 0), material, "hand");
  hand.position.y = -0.3;

  elbow.add(forearm, hand);
  arm.add(upper, elbow);
  return arm;
}

export function buildBody(params: BodyParams = DEFAULT_BODY_PARAMS): Group {
  const { height, build } = params;
  const material = new MeshLambertMaterial({ color: SKIN_GREY, flatShading: true });

  const torso = new Group();
  torso.name = "torso";
  const pelvis = mesh(new BoxGeometry(0.34 * build, 0.18, 0.2 * build), material, "pelvis");
  pelvis.position.y = 0.96;
  const chest = mesh(new CylinderGeometry(0.2 * build, 0.16 * build, 0.5, 8), material, "chest");
  chest.scale.z = 0.6;
  chest.position.y = 1.27;
  torso.add(pelvis, chest);

  const head = new Group();
  head.name = "head";
  const neck = mesh(new CylinderGeometry(0.05 * build, 0.055 * build, 0.1, 6), material, "neck");
  neck.position.y = 1.56;
  const skull = mesh(new IcosahedronGeometry(0.12, 1), material, "skull");
  skull.scale.set(0.9, 1.05, 1);
  skull.position.y = 1.7;
  const nose = mesh(new BoxGeometry(0.03, 0.04, 0.04), material, "nose");
  nose.position.set(0, 1.68, 0.12);
  head.add(neck, skull, nose);

  const arms = new Group();
  arms.name = "arms";
  arms.add(buildArm(1, build, material), buildArm(-1, build, material));

  const legs = new Group();
  legs.name = "legs";
  legs.add(buildLeg(1, build, material), buildLeg(-1, build, material));

  const body = new Group();
  body.name = "body";
  body.add(head, torso, arms, legs);
  body.scale.setScalar(height);
  return body;
}
