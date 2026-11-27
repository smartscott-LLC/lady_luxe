"use client";

import { Suspense, useEffect, useMemo, useState } from "react";
import {
  Environment,
  Lightformer,
  OrbitControls,
  useAnimations,
  useGLTF,
} from "@react-three/drei";
import { Canvas } from "@react-three/fiber";
import * as THREE from "three";
import { SkeletonUtils } from "three-stdlib";

/**
 * The Concierge's private mannequin — ported from the working club
 * avatar studio (cheeks/mini_model_maker) and rebuilt for Lady Luxe.
 *
 * The staging numbers below are the engine's own hand-tuned values,
 * adopted as the starting point; the garment auto-fit and the
 * measurement bone-scaling are the maison's additions.
 *
 * Presentation, never a fit prediction — the page says as much.
 */

export const BASE_AVATAR_URL =
  "https://mszrciomhatnmjsqfdij.supabase.co/storage/v1/object/public/fitting/base/violet.glb";

export interface AvatarMeasurements {
  bust: number;
  waist: number;
  hip: number;
  height: number;
}

// the authored baseline the sliders are relative to
const BASELINE = { bust: 34, waist: 26, hip: 36, height: 66 };

function AvatarModel({
  modelUrl,
  m,
  animate,
  onReady,
}: {
  modelUrl: string;
  m: AvatarMeasurements;
  animate: boolean;
  onReady?: (object: THREE.Object3D) => void;
}) {
  const gltf = useGLTF(modelUrl);
  const object = useMemo(() => {
    const clone = SkeletonUtils.clone(gltf.scene);
    clone.traverse((child) => {
      if (child instanceof THREE.Mesh) {
        child.castShadow = true;
        child.receiveShadow = true;
        if (child.material) {
          child.material = child.material.clone();
        }
      }
    });
    // the base layer dressed in the house's midnight
    clone.traverse((child) => {
      if (child instanceof THREE.Mesh && child.material instanceof THREE.MeshStandardMaterial) {
        const name = (child.name || "").toLowerCase();
        const parentName = ((child.parent as THREE.Object3D | null)?.name || "").toLowerCase();
        if (
          name.includes("shirt") ||
          parentName.includes("shirt") ||
          name.includes("shorts") ||
          parentName.includes("shorts") ||
          name.includes("shoe") ||
          parentName.includes("shoe")
        ) {
          child.material.color.set(0x30001a);
          child.material.roughness = 0.55;
        }
      }
    });
    return clone;
  }, [gltf.scene]);

  // the Mixamo clips bound to the clone — clip [0] is the runway walk
  const { actions, names } = useAnimations(gltf.animations, object);
  useEffect(() => {
    if (!animate || names.length === 0) return;
    const action = actions[names[0]];
    action?.reset().fadeIn(0.5).play();
    return () => {
      action?.fadeOut(0.5);
    };
  }, [actions, names, animate]);

  // measurements → the skeleton: bust → Spine2 (chest), waist → Spine1,
  // hip → Hips (x/z only) — relative to the authored baseline, clamped
  useEffect(() => {
    const clamp = (v: number, lo = 0.78, hi = 1.3) => Math.min(hi, Math.max(lo, v));
    const bustRatio = clamp(m.bust / BASELINE.bust);
    const waistRatio = clamp(m.waist / BASELINE.waist);
    const hipRatio = clamp(m.hip / BASELINE.hip);
    const spine2 = object.getObjectByName("mixamorig:Spine2");
    const spine1 = object.getObjectByName("mixamorig:Spine1");
    const hips = object.getObjectByName("mixamorig:Hips");
    if (spine2) spine2.scale.set(bustRatio, 1, bustRatio);
    if (spine1) spine1.scale.set(waistRatio, 1, waistRatio);
    if (hips) hips.scale.set(hipRatio, 1, hipRatio);
  }, [object, m]);

  useEffect(() => {
    onReady?.(object);
  }, [object, onReady]);

  return (
    // the engine's hand-tuned staging: the GLB is authored small — the
    // 3.15 wrapper normalizes it into the stage's world
    <group scale={3.15}>
      <primitive object={object} position={[0, -0.25, 0]} />
    </group>
  );
}

/**
 * A garment asset hung on the mannequin. Meshy pieces are free meshes:
 * the fit is a runtime heuristic — the piece is scaled to the avatar's
 * frame (72% of her height) and seated on the platform's center. The
 * placement manifest refines what the heuristic can't know.
 */
function GarmentModel({
  garmentUrl,
  avatar,
}: {
  garmentUrl: string;
  avatar: THREE.Object3D | null;
}) {
  const gltf = useGLTF(garmentUrl);
  const fitted = useMemo(() => {
    const clone = SkeletonUtils.clone(gltf.scene);
    clone.traverse((child) => {
      if (child instanceof THREE.Mesh) {
        child.castShadow = true;
      }
    });
    return clone;
  }, [gltf.scene]);

  useEffect(() => {
    if (!avatar) return;
    // the avatar's world frame, measured — never assumed
    avatar.updateWorldMatrix(true, true);
    const box = new THREE.Box3().setFromObject(avatar);
    const size = new THREE.Vector3();
    box.getSize(size);
    const avatarHeight = size.y || 3.4;
    const target = avatarHeight * 0.72;

    const gBox = new THREE.Box3().setFromObject(fitted);
    const gSize = new THREE.Vector3();
    gBox.getSize(gSize);
    const maxDim = Math.max(gSize.x, gSize.y, gSize.z) || 1;
    const s = target / maxDim;
    fitted.scale.setScalar(s);

    const gBox2 = new THREE.Box3().setFromObject(fitted);
    const c = new THREE.Vector3();
    gBox2.getCenter(c);
    fitted.position.x -= c.x;
    fitted.position.z -= c.z;
    fitted.position.y += box.min.y + avatarHeight * 0.04 - gBox2.min.y;
  }, [fitted, avatar]);

  return <primitive object={fitted} />;
}

export default function FittingAvatar({
  m,
  modelUrl = BASE_AVATAR_URL,
  mode = "stand",
  garmentUrl,
}: {
  m: AvatarMeasurements;
  modelUrl?: string;
  /** stand: the platform pirouette · runway: the Mixamo walk */
  mode?: "stand" | "runway";
  garmentUrl?: string | null;
}) {
  const [avatar, setAvatar] = useState<THREE.Object3D | null>(null);

  // the height wrapper: the member's frame rises with her height
  const heightRatio = Math.min(1.18, Math.max(0.85, m.height / BASELINE.height));

  return (
    <Canvas
      shadows
      dpr={[1, 1.5]}
      camera={{ position: [0, 1.6, 10], fov: 34 }}
      gl={{ antialias: true, alpha: true }}
      style={{ width: "100%", height: "100%" }}
    >
      <color attach="background" args={["#0c0409"]} />
      <Suspense fallback={null}>
        <group scale={[1, heightRatio, 1]}>
          <AvatarModel
            modelUrl={modelUrl}
            m={m}
            animate={mode === "runway"}
            onReady={setAvatar}
          />
          {garmentUrl ? (
            <Suspense fallback={null}>
              <GarmentModel garmentUrl={garmentUrl} avatar={avatar} />
            </Suspense>
          ) : null}
        </group>
        <Stage />
        <Environment resolution={256}>
          <Lightformer intensity={2} position={[0, 5, 2]} scale={[8, 8, 1]} />
          <Lightformer intensity={1.2} color="#d4af37" position={[-5, 2, 0]} rotation-y={Math.PI / 2} scale={[8, 2, 1]} />
          <Lightformer intensity={1.2} color="#660428" position={[5, 2, 0]} rotation-y={-Math.PI / 2} scale={[8, 2, 1]} />
        </Environment>
        <OrbitControls
          makeDefault
          target={[0, 1.55, 0]}
          enablePan={false}
          minDistance={6.5}
          maxDistance={13}
          minPolarAngle={Math.PI / 3.2}
          maxPolarAngle={Math.PI / 1.75}
          autoRotate={mode === "stand"}
          autoRotateSpeed={0.7}
        />
      </Suspense>
    </Canvas>
  );
}

function Stage() {
  return (
    <>
      <ambientLight intensity={0.75} />
      <directionalLight
        position={[4, 6, 5]}
        intensity={2.4}
        castShadow
        shadow-mapSize-width={1024}
        shadow-mapSize-height={1024}
      />
      <mesh rotation-x={-Math.PI / 2} position-y={-0.7} receiveShadow>
        <circleGeometry args={[3.1, 64]} />
        <meshStandardMaterial color="#111015" roughness={0.72} metalness={0.18} />
      </mesh>
      <mesh rotation-x={-Math.PI / 2} position-y={-0.692}>
        <ringGeometry args={[2.35, 2.45, 64]} />
        <meshBasicMaterial color="#d4af37" transparent opacity={0.75} />
      </mesh>
    </>
  );
}

/**
 * Preloads the base avatar so the first canvas paint never stalls.
 */
export function preloadBaseAvatar() {
  useGLTF.preload(BASE_AVATAR_URL);
}
