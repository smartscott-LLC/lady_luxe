"use client";

import { useEffect, useRef } from "react";
import * as THREE from "three";

/**
 * The Lady Luxe dress form — a couture tailor's mannequin, parametric.
 * Bust / waist / hip (inches) drive the lathe profile; height sets the
 * torso length. Gold-leaf stand, slow pirouette, midnight stage.
 * Presentation, never a fit prediction — the page says as much.
 */

export interface FormMeasurements {
  bust: number;
  waist: number;
  hip: number;
  height: number;
}

type Stage = {
  renderer: THREE.WebGLRenderer;
  scene: THREE.Scene;
  camera: THREE.PerspectiveCamera;
  group: THREE.Group;
  formHolder: THREE.Object3D;
  raf: number;
  disposed: boolean;
};

// circumference (inches) → lathe radius (scene units = inches)
const radius = (circumference: number) => circumference / (2 * Math.PI);

function buildFormGeometry(m: FormMeasurements): THREE.BufferGeometry {
  const torso = m.height * 0.44; // shoulder line to the hem, inches
  const rBust = radius(m.bust);
  const rWaist = radius(m.waist);
  const rHip = radius(m.hip);
  const rShoulder = Math.max(2.2, rBust * 0.92 + 0.9);

  // the tailor's profile, top → hem: neck stump, shoulder, bust, underbust,
  // waist, high hip, hip, thigh taper, hem
  const pts: THREE.Vector2[] = [
    new THREE.Vector2(1.35, torso),
    new THREE.Vector2(1.5, torso * 0.94),
    new THREE.Vector2(rShoulder, torso * 0.9),
    new THREE.Vector2(rBust, torso * 0.66),
    new THREE.Vector2(rBust * 0.84, torso * 0.5),
    new THREE.Vector2(rWaist, torso * 0.38),
    new THREE.Vector2((rWaist + rHip) / 2, torso * 0.28),
    new THREE.Vector2(rHip, torso * 0.18),
    new THREE.Vector2(rHip * 0.86, torso * 0.09),
    new THREE.Vector2(rHip * 0.7, 0),
  ];
  const curve = new THREE.CatmullRomCurve3(
    pts.map((p) => new THREE.Vector3(p.x, p.y, 0)),
  );
  const samples = curve.getPoints(72).map((p) => new THREE.Vector2(Math.max(0.2, p.x), p.y));
  return new THREE.LatheGeometry(samples, 96);
}

export default function DressFormViewer({
  m,
  className,
}: {
  m: FormMeasurements;
  className?: string;
}) {
  const hostRef = useRef<HTMLDivElement>(null);
  const stageRef = useRef<Stage | null>(null);
  const formRef = useRef<THREE.Mesh | null>(null);
  const mRef = useRef(m);
  mRef.current = m;

  // one-time: renderer, stage, lights, stand, loop
  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;

    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.setSize(host.clientWidth, host.clientHeight);
    host.appendChild(renderer.domElement);

    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(30, 3 / 4, 0.1, 400);
    camera.position.set(14, 30, 46);
    camera.lookAt(0, 26, 0);

    scene.add(new THREE.AmbientLight(0x8a6a3a, 0.55));
    const key = new THREE.DirectionalLight(0xffe3b0, 1.6);
    key.position.set(18, 42, 30);
    scene.add(key);
    const rim = new THREE.DirectionalLight(0xd4af37, 1.1);
    rim.position.set(-24, 30, -18);
    scene.add(rim);
    const fill = new THREE.DirectionalLight(0x660428, 0.5);
    fill.position.set(-10, 12, 26);
    scene.add(fill);

    const group = new THREE.Group();
    scene.add(group);

    // the stand: mahogany pole, gold collar and finial, weighted base
    const poleMat = new THREE.MeshStandardMaterial({
      color: 0x2a1015,
      roughness: 0.35,
      metalness: 0.5,
    });
    const goldMat = new THREE.MeshStandardMaterial({
      color: 0xd4af37,
      roughness: 0.25,
      metalness: 0.85,
    });
    const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.9, 0.9, 26, 32), poleMat);
    pole.position.set(0, -14, 0);
    group.add(pole);
    const collar = new THREE.Mesh(new THREE.CylinderGeometry(1.25, 1.25, 1.1, 32), goldMat);
    collar.position.set(0, -2.2, 0);
    group.add(collar);
    const base = new THREE.Mesh(new THREE.CylinderGeometry(9, 10, 1.6, 48), poleMat);
    base.position.set(0, -27.2, 0);
    group.add(base);
    const baseRing = new THREE.Mesh(new THREE.TorusGeometry(9, 0.28, 12, 64), goldMat);
    baseRing.rotation.x = Math.PI / 2;
    baseRing.position.set(0, -26.4, 0);
    group.add(baseRing);

    // the form itself lives in its own holder so measurement changes
    // swap geometry without touching the stand
    const formHolder = new THREE.Group();
    group.add(formHolder);

    const stage: Stage = { renderer, scene, camera, group, formHolder, raf: 0, disposed: false };
    stageRef.current = stage;

    const onResize = () => {
      if (!host.clientWidth || !host.clientHeight) return;
      renderer.setSize(host.clientWidth, host.clientHeight);
      camera.aspect = host.clientWidth / host.clientHeight;
      camera.updateProjectionMatrix();
    };
    const ro = new ResizeObserver(onResize);
    ro.observe(host);

    const tick = () => {
      if (stage.disposed) return;
      stage.raf = requestAnimationFrame(tick);
      group.rotation.y += 0.0038;
      renderer.render(scene, camera);
    };
    tick();

    return () => {
      stage.disposed = true;
      cancelAnimationFrame(stage.raf);
      ro.disconnect();
      renderer.dispose();
      host.removeChild(renderer.domElement);
      stageRef.current = null;
    };
  }, []);

  // measurement changes: rebuild the form geometry in place
  useEffect(() => {
    const stage = stageRef.current;
    if (!stage) return;
    const old = formRef.current;
    const geo = buildFormGeometry(m);
    const mat =
      formRef.current?.material ??
      new THREE.MeshStandardMaterial({
        color: 0xe4d6b0,
        roughness: 0.6,
        metalness: 0.12,
      });
    const mesh = new THREE.Mesh(geo, mat);
    stage.formHolder.add(mesh);
    formRef.current = mesh;
    if (old) {
      stage.formHolder.remove(old);
      old.geometry.dispose();
    }
  }, [m.bust, m.waist, m.hip, m.height]);

  return <div ref={hostRef} className={className} aria-label="Your private mannequin" />;
}
