"use client";

import { useEffect, useRef } from "react";
import * as THREE from "three";
import { scrollProgressOf, usePrefersReducedMotion } from "./hooks";

export const RELEASE_COUNT = 9;
/** The release the pointer snaps back to. Zero-indexed, chronological. */
export const ROLLBACK_INDEX = 5;

const SPACING = 0.82;
const PLANE_W = 2.9;
const PLANE_H = 1.8;

/** append → hold at head → rollback. Shared with the copy overlay so the words
 *  and the geometry are never out of step. */
export const STACK_CUTS = [0.52, 0.72] as const;

const clamp01 = (v: number) => (v < 0 ? 0 : v > 1 ? 1 : v);

/**
 * Beat two: the append-only release log, and what rollback actually costs.
 *
 * Phase 1 — each publish appends a plane at the front of the stack. Nothing
 *           already in the stack is touched; the *group* slides back so the
 *           newest release is always the one nearest the camera.
 * Phase 2 — the pointer (a bright outline + rail marker) rests on the head.
 * Phase 3 — rollback. The pointer snaps to an older plane and that plane lights.
 *           The stack does not move. No plane is removed, rebuilt or reordered.
 *           This is the entire point: nothing moves except the pointer.
 */
export default function ReleaseStackCanvas({
  sectionRef,
  centered = false,
}: {
  sectionRef: React.RefObject<HTMLElement | null>;
  /** Reduced-motion layout stacks copy *below* the canvas, so nothing needs to
   *  be kept clear on the left and the stack sits in the middle. */
  centered?: boolean;
}) {
  const mountRef = useRef<HTMLDivElement | null>(null);
  const reduced = usePrefersReducedMotion();

  useEffect(() => {
    const mount = mountRef.current;
    const section = sectionRef.current;
    if (!mount) return;

    let renderer: THREE.WebGLRenderer;
    try {
      renderer = new THREE.WebGLRenderer({ alpha: true, antialias: true, powerPreference: "low-power" });
    } catch {
      return;
    }

    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    renderer.setClearColor(0x000000, 0);
    mount.appendChild(renderer.domElement);
    renderer.domElement.style.width = "100%";
    renderer.domElement.style.height = "100%";
    renderer.domElement.style.display = "block";

    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(46, 1, 0.1, 100);
    camera.position.set(0, 0, 8);

    // pivot = where the *newest* release sits on screen. It never moves.
    // stack = the log itself, which slides backwards along its own local Z as
    // releases are appended. Separating them matters: if the slide happened in
    // world space the rotated stack would drift sideways across the copy.
    const pivot = new THREE.Group();
    pivot.rotation.set(0.26, -0.62, 0);
    scene.add(pivot);

    const group = new THREE.Group();
    pivot.add(group);

    // One geometry, reused. Nine releases, nine materials — the material is the
    // only per-release state, because "which one is live" is the only thing the
    // rollback changes.
    const planeGeo = new THREE.PlaneGeometry(PLANE_W, PLANE_H);
    const edgeGeo = new THREE.EdgesGeometry(planeGeo);

    const faces: THREE.Mesh[] = [];
    const faceMats: THREE.MeshBasicMaterial[] = [];
    const rims: THREE.LineSegments[] = [];
    const rimMats: THREE.LineBasicMaterial[] = [];

    for (let i = 0; i < RELEASE_COUNT; i++) {
      const faceMat = new THREE.MeshBasicMaterial({
        color: 0x2e2e39,
        transparent: true,
        opacity: 0,
        depthWrite: false,
        side: THREE.DoubleSide,
      });
      const mesh = new THREE.Mesh(planeGeo, faceMat);
      mesh.position.z = i * SPACING;

      const rimMat = new THREE.LineBasicMaterial({ color: 0x454553, transparent: true, opacity: 0 });
      const rim = new THREE.LineSegments(edgeGeo, rimMat);
      rim.position.z = mesh.position.z;

      group.add(mesh, rim);
      faces.push(mesh);
      faceMats.push(faceMat);
      rims.push(rim);
      rimMats.push(rimMat);
    }

    // The pointer: sites.live_release_id, drawn. A bracket that snaps.
    const markerGeo = new THREE.EdgesGeometry(new THREE.PlaneGeometry(PLANE_W + 0.42, PLANE_H + 0.42));
    const markerMat = new THREE.LineBasicMaterial({
      color: 0x8b7cff,
      transparent: true,
      opacity: 0,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    });
    const marker = new THREE.LineSegments(markerGeo, markerMat);
    group.add(marker);

    // A rail running the length of the stack — the pointer travels along it.
    const railGeo = new THREE.BufferGeometry().setFromPoints([
      new THREE.Vector3(-PLANE_W / 2 - 0.42, -PLANE_H / 2 - 0.42, 0),
      new THREE.Vector3(-PLANE_W / 2 - 0.42, -PLANE_H / 2 - 0.42, (RELEASE_COUNT - 1) * SPACING),
    ]);
    const railMat = new THREE.LineBasicMaterial({ color: 0x212129, transparent: true, opacity: 0.9 });
    const rail = new THREE.Line(railGeo, railMat);
    group.add(rail);

    const resize = () => {
      const w = mount.clientWidth || 1;
      const h = mount.clientHeight || 1;
      renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
      renderer.setSize(w, h, false);
      camera.aspect = w / h;
      // Keyed to the `lg:` breakpoint, not to the canvas aspect: below lg the
      // canvas is a short full-width band (aspect > 2) that must still centre
      // its stack, so aspect alone would misread the layout.
      const wide = !centered && window.innerWidth >= 1024;
      pivot.position.x = centered ? -0.6 : wide ? 2.7 : 0.9;
      // Wide layouts park a written ledger in the bottom-right corner, so the
      // stack sits above it rather than through it.
      pivot.position.y = wide ? 0.85 : 0;
      camera.position.z = wide ? 9 : camera.aspect > 1 ? 11 : 13.5;
      camera.updateProjectionMatrix();
    };
    resize();

    let markerZ = (RELEASE_COUNT - 1) * SPACING;
    let groupZ = 0;

    const writeFrame = (p: number, instant: boolean) => {
      // Phase 1: releases append. countF grows; positions never change.
      const appendT = clamp01(p / STACK_CUTS[0]);
      const countF = 1 + appendT * (RELEASE_COUNT - 1);
      const head = Math.min(RELEASE_COUNT - 1, Math.floor(countF - 1e-4));
      const pointerIndex = p >= STACK_CUTS[1] ? ROLLBACK_INDEX : head;

      for (let i = 0; i < RELEASE_COUNT; i++) {
        // Fade-in of a newly appended plane; older planes hold whatever they had.
        const born = clamp01(countF - i);
        const isLive = i === pointerIndex;
        const targetFace = born * (isLive ? 0.34 : 0.06);
        const targetRim = born * (isLive ? 1 : 0.26);
        faceMats[i].opacity += (targetFace - faceMats[i].opacity) * (instant ? 1 : 0.18);
        rimMats[i].opacity += (targetRim - rimMats[i].opacity) * (instant ? 1 : 0.18);
        faceMats[i].color.setHex(isLive ? 0x6d5cff : 0x2e2e39);
        rimMats[i].color.setHex(isLive ? 0x8b7cff : 0x454553);
        faces[i].visible = born > 0.001;
        rims[i].visible = born > 0.001;
      }

      // The group slides so the newest release is always at the camera plane.
      // In phase 3 `head` is already pinned at the end, so this stops moving —
      // which is the whole argument: the rollback shifts nothing.
      const targetGroupZ = -(countF - 1) * SPACING;
      groupZ += (targetGroupZ - groupZ) * (instant ? 1 : 0.14);
      group.position.z = groupZ;

      const targetMarkerZ = pointerIndex * SPACING;
      // Fast lerp: the pointer *snaps*, it does not glide.
      markerZ += (targetMarkerZ - markerZ) * (instant ? 1 : 0.32);
      marker.position.z = markerZ;
      markerMat.opacity = 0.55 + 0.35 * Math.abs(Math.sin(performance.now() / 900));
      railMat.opacity = 0.35 + 0.5 * clamp01(appendT);
    };

    let raf = 0;
    let visible = true;

    const loop = () => {
      raf = requestAnimationFrame(loop);
      const p = section ? scrollProgressOf(section) : 0;
      writeFrame(p, false);
      renderer.render(scene, camera);
    };

    const start = () => {
      if (!raf && visible) raf = requestAnimationFrame(loop);
    };
    const stop = () => {
      if (raf) cancelAnimationFrame(raf);
      raf = 0;
    };

    if (reduced) {
      // Static end state: full stack, pointer already parked on the old release.
      markerMat.opacity = 0.85;
      writeFrame(1, true);
      markerMat.opacity = 0.85;
      renderer.render(scene, camera);
    }

    let io: IntersectionObserver | null = null;
    if (!reduced && typeof IntersectionObserver !== "undefined") {
      io = new IntersectionObserver(
        (entries) => {
          visible = entries.some((e) => e.isIntersecting);
          if (visible) start();
          else stop();
        },
        { threshold: 0 },
      );
      io.observe(mount);
    } else if (!reduced) {
      start();
    }

    const onResize = () => {
      resize();
      if (reduced) {
        writeFrame(1, true);
        markerMat.opacity = 0.85;
        renderer.render(scene, camera);
      }
    };
    window.addEventListener("resize", onResize);

    const onLost = (e: Event) => {
      e.preventDefault();
      stop();
    };
    renderer.domElement.addEventListener("webglcontextlost", onLost);

    return () => {
      stop();
      io?.disconnect();
      window.removeEventListener("resize", onResize);
      renderer.domElement.removeEventListener("webglcontextlost", onLost);
      planeGeo.dispose();
      edgeGeo.dispose();
      markerGeo.dispose();
      railGeo.dispose();
      markerMat.dispose();
      railMat.dispose();
      for (const m of faceMats) m.dispose();
      for (const m of rimMats) m.dispose();
      renderer.dispose();
      renderer.forceContextLoss();
      if (renderer.domElement.parentNode === mount) mount.removeChild(renderer.domElement);
    };
  }, [sectionRef, reduced, centered]);

  return <div ref={mountRef} aria-hidden className="absolute inset-0" />;
}
