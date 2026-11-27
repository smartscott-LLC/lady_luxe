"use client";

import { Suspense, useEffect, useMemo } from "react";
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
 * Violet.glb: a Tripo-built, Mixamo-rigged avatar with named parts and
 * two Mixamo clips (the runway walk), served from the house's fitting
 * bucket. The measurement sliders drive the skeleton itself — Spine2
 * for the bust, Spine1 for the waist, Hips for the hip — presentation
 * proportions, never a fit prediction.
 */

export const BASE_AVATAR_URL =
  "https://mszrciomhatnmjsqfdij.supabase.co/storage/v1/object/public/fitting/base/violet.glb";

export interface AvatarMeasurements {
  bust: number;
  waist: number;
  hip: number;
  height: number;
}

// the authored baseline the mesh was built around
const BASELINE = { bust: 34, waist: 26, hip: 36, height: 66 };

/**
 * Applies the member's measurements to the skeleton by bone scale:
 *   bust  → Spine2 (chest)  · waist → Spine1 · hip → Hips (x/z only)
 *   height → Hips y (the whole frame rises with the member)
 * The ratios are relative to the authored baseline, clamped so the
 * silhouette stays elegant.
 */
function applyMeasurements(
  scene: THREE.Object3D,
  m: AvatarMeasurements,
) {
  const clamp = (v: number, lo = 0.78, hi = 1.3) =>
    Math.min(hi, Math.max(lo, v));
  const spine2 = scene.getObjectByName("mixamorig:Spine2");
  const spine1 = scene.getObjectByName("mixamorig:Spine1");
  const hips = scene.getObjectByName("mixamorig:Hips");
  const bustRatio = clamp(m.bust / BASELINE.bust);
  const waistRatio = clamp(m.waist / BASELINE.waist);
  const hipRatio = clamp(m.hip / BASELINE.hip);
  const heightRatio = clamp(m.height / BASELINE.height, 0.85, 1.18);
  if (spine2) spine2.scale.set(bustRatio, 1, bustRatio);
  if (spine1) spine1.scale.set(waistRatio, 1, waistRatio);
  if (hips) {
    hips.scale.set(hipRatio, heightRatio, hipRatio);
  }
}

function AvatarModel({
  modelUrl,
  m,
  animate,
}: {
  modelUrl: string;
  m: AvatarMeasurements;
  animate: boolean;
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
    // the house silhouette: the base layer dressed in midnight
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

  // measurements → the skeleton, live
  useEffect(() => {
    applyMeasurements(object, m);
  }, [object, m]);

  return <primitive object={object} />;
}

export default function FittingAvatar({
  m,
  modelUrl = BASE_AVATAR_URL,
  mode = "stand",
}: {
  m: AvatarMeasurements;
  modelUrl?: string;
  /** stand: the platform pirouette · runway: the Mixamo walk */
  mode?: "stand" | "runway";
}) {
  return (
    <Canvas
      shadows
      dpr={[1, 2]}
      camera={{ position: [0, 1.4, 3.4], fov: 34 }}
      style={{ width: "100%", height: "100%" }}
    >
      <color attach="background" args={["#1b0910"]} />
      <fog attach="fog" args={["#1b0910", 6, 14]} />
      <Suspense fallback={null}>
        <AvatarModel modelUrl={modelUrl} m={m} animate={mode === "runway"} />
        <Platform />
        <Environment resolution={256}>
          <Lightformer intensity={2.2} color="#ffe3b0" position={[3, 4, 4]} scale={[4, 6, 1]} />
          <Lightformer intensity={1.6} color="#d4af37" position={[-4, 3, -3]} scale={[5, 5, 1]} />
          <Lightformer intensity={0.9} color="#660428" position={[0, 2, 5]} scale={[6, 3, 1]} />
        </Environment>
        <OrbitControls
          target={[0, 0.95, 0]}
          enablePan={false}
          minDistance={2.2}
          maxDistance={5.5}
          maxPolarAngle={Math.PI / 1.9}
          autoRotate={mode === "stand"}
          autoRotateSpeed={0.9}
        />
      </Suspense>
    </Canvas>
  );
}

function Platform() {
  return (
    <group>
      {/* the mahogany-and-gold stand */}
      <mesh position={[0, -0.06, 0]} receiveShadow>
        <cylinderGeometry args={[1.05, 1.15, 0.12, 48]} />
        <meshStandardMaterial color="#2a1015" roughness={0.35} metalness={0.5} />
      </mesh>
      <mesh position={[0, 0.005, 0]}>
        <torusGeometry args={[1.05, 0.03, 10, 64]} />
        <meshStandardMaterial color="#d4af37" roughness={0.25} metalness={0.85} />
      </mesh>
    </group>
  );
}

/**
 * Preloads the base avatar so the first canvas paint never stalls.
 */
export function preloadBaseAvatar() {
  useGLTF.preload(BASE_AVATAR_URL);
}
