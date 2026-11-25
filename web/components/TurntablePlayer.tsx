"use client";

import { useEffect, useRef, useState } from "react";
import styles from "./TurntablePlayer.module.css";

export type TurntablePose = {
  angle: number;
  label?: string;
  time_s: number;
};

export type TurntableMedia = {
  alt?: string;
  mp4: string;
  webm?: string;
  poster?: string;
  poses?: TurntablePose[];
  duration_s?: number;
};

/**
 * The signature Lady Luxe product experience: a 360° turntable film.
 *
 * Hover contract (matches the storefront marquee engine):
 *   - mouseenter  → play
 *   - mouseleave  → pause, never reset (currentTime is preserved, so the
 *     shopper resumes exactly where they left off)
 * Pose chips snap the film to the exact quarter-turn stops recorded in the
 * pipeline's manifest.json.
 */
export default function TurntablePlayer({
  mp4,
  webm,
  poster,
  poses = [],
  alt = "360° turntable",
}: TurntableMedia) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [activePose, setActivePose] = useState<number | null>(null);
  const [portrait, setPortrait] = useState(false);

  // vertical films (the ensembles' owner footage) get a taller, narrower
  // stage so nothing is cropped — the head stays in frame. The metadata
  // may already be loaded before hydration (the browser starts pulling
  // it during HTML parse), so check on mount as well as on the event.
  useEffect(() => {
    const v = videoRef.current;
    if (!v) return;
    const check = () => {
      if (v.videoHeight > v.videoWidth) setPortrait(true);
    };
    check();
    v.addEventListener("loadedmetadata", check);
    return () => v.removeEventListener("loadedmetadata", check);
  }, []);

  const play = () => {
    videoRef.current?.play().catch(() => {});
    setActivePose(null);
  };

  const pause = () => {
    // Pause only — never reset currentTime.
    videoRef.current?.pause();
  };

  const snapToPose = (pose: TurntablePose) => {
    const video = videoRef.current;
    if (!video) return;
    video.currentTime = pose.time_s;
    video.pause();
    setActivePose(pose.angle);
  };

  return (
    <figure className={styles.wrap} data-ll-turntable>
      <div className={`${styles.stage}${portrait ? ` ${styles.stagePortrait}` : ""}`}>
        <video
          ref={videoRef}
          className={styles.film}
          muted
          loop
          playsInline
          preload="metadata"
          poster={poster}
          onMouseEnter={play}
          onMouseLeave={pause}
        >
          <source src={mp4} type="video/mp4" />
          {webm ? <source src={webm} type="video/webm" /> : null}
        </video>
        <span className={styles.hint}>hover to turn · click a pose to hold</span>
      </div>

      {poses.length > 0 && (
        <div className={styles.poses} role="group" aria-label="360° pose stops">
          {poses.map((pose) => (
            <button
              key={pose.angle}
              type="button"
              className={
                activePose === pose.angle ? styles.poseActive : styles.pose
              }
              onClick={() => snapToPose(pose)}
              title={pose.label ? `${pose.label} — ${pose.time_s.toFixed(1)}s` : undefined}
            >
              {pose.angle}°
            </button>
          ))}
          <button
            type="button"
            className={activePose === null ? styles.poseActive : styles.pose}
            onClick={play}
          >
            spin ↺
          </button>
        </div>
      )}

      <figcaption className={styles.caption}>{alt}</figcaption>
    </figure>
  );
}
