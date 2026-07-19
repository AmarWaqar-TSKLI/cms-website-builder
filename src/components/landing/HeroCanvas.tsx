"use client";

import { useEffect, useRef } from "react";
import * as THREE from "three";
import { scrollProgressOf, usePrefersReducedMotion } from "./hooks";

/* ------------------------------------------------------------------ layout */

// A page description is a tree. So is this. Five levels, widening downward.
const LEVELS = [1, 3, 6, 12, 20] as const;
const NODE_COUNT = LEVELS.reduce((a, b) => a + b, 0);

type Layout = {
  tree: Float32Array;
  scatter: Float32Array;
  colors: Float32Array;
  parents: Int32Array; // -1 for the root
};

/** Deterministic PRNG so the "chaos" state is identical on server-adjacent
 *  reloads and across hot reloads — a random hero that reshuffles every save
 *  reads as noise, not as a fixed structure being discovered. */
function makeRandom(seed: number) {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

function buildLayout(): Layout {
  const tree = new Float32Array(NODE_COUNT * 3);
  const scatter = new Float32Array(NODE_COUNT * 3);
  const colors = new Float32Array(NODE_COUNT * 3);
  const parents = new Int32Array(NODE_COUNT);
  const rand = makeRandom(0x6d5cff);

  const flux = new THREE.Color(0x8b7cff);
  const deep = new THREE.Color(0x4b3fd6);
  const tmp = new THREE.Color();

  let index = 0;
  let levelStart = 0;
  let prevStart = 0;
  let prevCount = 0;

  for (let level = 0; level < LEVELS.length; level++) {
    const count = LEVELS[level];
    levelStart = index;
    const width = 1.6 + level * 2.05;

    for (let j = 0; j < count; j++) {
      const i = index++;
      const x = count === 1 ? 0 : (j / (count - 1) - 0.5) * width;
      const y = 2.9 - level * 1.42;
      const z = (rand() - 0.5) * 0.85;

      tree[i * 3] = x;
      tree[i * 3 + 1] = y;
      tree[i * 3 + 2] = z;

      // Scatter: uniform-ish points in a sphere. No structure at all.
      const theta = rand() * Math.PI * 2;
      const phi = Math.acos(2 * rand() - 1);
      const r = 3.4 + rand() * 3.1;
      scatter[i * 3] = r * Math.sin(phi) * Math.cos(theta);
      scatter[i * 3 + 1] = r * Math.sin(phi) * Math.sin(theta) * 0.75;
      scatter[i * 3 + 2] = r * Math.cos(phi);

      tmp.copy(flux).lerp(deep, level / (LEVELS.length - 1));
      colors[i * 3] = tmp.r;
      colors[i * 3 + 1] = tmp.g;
      colors[i * 3 + 2] = tmp.b;

      parents[i] =
        level === 0 ? -1 : prevStart + Math.min(prevCount - 1, Math.floor((j * prevCount) / count));
    }

    prevStart = levelStart;
    prevCount = count;
  }

  return { tree, scatter, colors, parents };
}

/* ------------------------------------------------------------------ sprite */

function makeGlowTexture(): THREE.Texture {
  const size = 64;
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext("2d");
  if (ctx) {
    const g = ctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
    g.addColorStop(0, "rgba(255,255,255,1)");
    g.addColorStop(0.22, "rgba(200,192,255,0.75)");
    g.addColorStop(0.55, "rgba(109,92,255,0.22)");
    g.addColorStop(1, "rgba(109,92,255,0)");
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, size, size);
  }
  const tex = new THREE.CanvasTexture(canvas);
  tex.needsUpdate = true;
  return tex;
}

const easeInOut = (t: number) => (t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2);

/* ------------------------------------------------------------------- scene */

/**
 * Hero beat: a scattered constellation of glowing nodes that *resolves* into an
 * ordered tree as you scroll the first screen. The claim it makes visually is
 * the claim the whole architecture rests on — a page is not a document, it is a
 * tree of components.
 *
 * `sectionRef` is the tall scroll container; this canvas reads its own progress
 * from it inside the frame loop so scrolling never re-renders React.
 */
export default function HeroCanvas({
  sectionRef,
}: {
  sectionRef: React.RefObject<HTMLElement | null>;
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
      return; // No WebGL — the copy underneath stands on its own.
    }

    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    renderer.setClearColor(0x000000, 0);
    mount.appendChild(renderer.domElement);
    renderer.domElement.style.width = "100%";
    renderer.domElement.style.height = "100%";
    renderer.domElement.style.display = "block";

    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(52, 1, 0.1, 100);
    camera.position.set(0, 0, 10.5);

    const group = new THREE.Group();
    scene.add(group);

    const { tree, scatter, colors, parents } = buildLayout();
    const live = new Float32Array(tree.length);
    live.set(scatter);

    const pointGeo = new THREE.BufferGeometry();
    pointGeo.setAttribute("position", new THREE.BufferAttribute(live, 3));
    pointGeo.setAttribute("color", new THREE.BufferAttribute(colors, 3));

    const sprite = makeGlowTexture();
    const pointMat = new THREE.PointsMaterial({
      size: 0.42,
      map: sprite,
      vertexColors: true,
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      sizeAttenuation: true,
    });
    const points = new THREE.Points(pointGeo, pointMat);
    group.add(points);

    // Edges: parent → child. Same edges in both states, so the chaos is the
    // *same graph* badly drawn — scrolling doesn't add structure, it reveals it.
    const edgeCount = NODE_COUNT - 1;
    const edgePos = new Float32Array(edgeCount * 6);
    const edgeGeo = new THREE.BufferGeometry();
    edgeGeo.setAttribute("position", new THREE.BufferAttribute(edgePos, 3));
    const edgeMat = new THREE.LineBasicMaterial({
      color: 0x6d5cff,
      transparent: true,
      opacity: 0.16,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    });
    const lines = new THREE.LineSegments(edgeGeo, edgeMat);
    group.add(lines);

    const resize = () => {
      const w = mount.clientWidth || 1;
      const h = mount.clientHeight || 1;
      renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
      renderer.setSize(w, h, false);
      camera.aspect = w / h;
      // Narrow viewports: pull back so the widest tree level still fits.
      camera.position.z = camera.aspect < 0.85 ? 15.5 : camera.aspect < 1.25 ? 12.5 : 10.5;
      camera.updateProjectionMatrix();
    };
    resize();

    const writeFrame = (t: number, wobble: number) => {
      const chaos = 1 - t;
      for (let i = 0; i < NODE_COUNT; i++) {
        const o = i * 3;
        const drift = chaos * 0.28;
        live[o] = scatter[o] + (tree[o] - scatter[o]) * t + Math.sin(wobble + i * 1.7) * drift;
        live[o + 1] =
          scatter[o + 1] + (tree[o + 1] - scatter[o + 1]) * t + Math.cos(wobble * 0.8 + i) * drift;
        live[o + 2] = scatter[o + 2] + (tree[o + 2] - scatter[o + 2]) * t;
      }
      for (let i = 1; i < NODE_COUNT; i++) {
        const p = parents[i] * 3;
        const c = i * 3;
        const e = (i - 1) * 6;
        edgePos[e] = live[p];
        edgePos[e + 1] = live[p + 1];
        edgePos[e + 2] = live[p + 2];
        edgePos[e + 3] = live[c];
        edgePos[e + 4] = live[c + 1];
        edgePos[e + 5] = live[c + 2];
      }
      pointGeo.attributes.position.needsUpdate = true;
      edgeGeo.attributes.position.needsUpdate = true;
      edgeMat.opacity = 0.13 + t * 0.34;
      pointMat.size = 0.44 - t * 0.09;
    };

    let raf = 0;
    let visible = true;
    let spin = 0;
    let last = performance.now();
    let smoothed = 0;

    const loop = () => {
      raf = requestAnimationFrame(loop);
      const now = performance.now();
      const dt = Math.min(0.05, (now - last) / 1000);
      last = now;

      const target = section ? easeInOut(Math.min(1, scrollProgressOf(section) * 1.35)) : 0;
      smoothed += (target - smoothed) * Math.min(1, dt * 6);

      spin += dt * 0.16 * (1 - smoothed);
      group.rotation.y = spin * (1 - smoothed * smoothed);
      group.rotation.x = -0.16 * (1 - smoothed);
      group.position.y = -0.35 * smoothed;

      writeFrame(smoothed, now / 1400);
      renderer.render(scene, camera);
    };

    const start = () => {
      if (!raf && visible) {
        last = performance.now();
        raf = requestAnimationFrame(loop);
      }
    };
    const stop = () => {
      if (raf) cancelAnimationFrame(raf);
      raf = 0;
    };

    // Reduced motion: render the resolved tree once and never open a loop.
    if (reduced) {
      group.rotation.set(0, 0, 0);
      group.position.y = -0.35;
      writeFrame(1, 0);
      renderer.render(scene, camera);
    }

    // Off-screen canvases must not burn frames.
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
      if (reduced) renderer.render(scene, camera);
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
      pointGeo.dispose();
      edgeGeo.dispose();
      pointMat.dispose();
      edgeMat.dispose();
      sprite.dispose();
      renderer.dispose();
      renderer.forceContextLoss();
      if (renderer.domElement.parentNode === mount) mount.removeChild(renderer.domElement);
    };
  }, [sectionRef, reduced]);

  return <div ref={mountRef} aria-hidden className="absolute inset-0" />;
}
