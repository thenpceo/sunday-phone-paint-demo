"use client";

import { useEffect, useRef, useState } from "react";
import * as THREE from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { EffectComposer } from "three/examples/jsm/postprocessing/EffectComposer.js";
import { FilmPass } from "three/examples/jsm/postprocessing/FilmPass.js";
import { OutputPass } from "three/examples/jsm/postprocessing/OutputPass.js";
import { RenderPass } from "three/examples/jsm/postprocessing/RenderPass.js";
import { UnrealBloomPass } from "three/examples/jsm/postprocessing/UnrealBloomPass.js";

const ITEMS = [
  { name: "Terrace Hat", short: "Terrace Hat", path: "/models/blue-striped-bucket-hat.glb" },
  { name: "Study Buddy", short: "Study Buddy", path: "/models/bronze-curved-helmet.glb" },
  { name: "Headset", short: "Headset", path: "/models/emerald-arc-headset.glb" },
  { name: "Bucket Hat", short: "Bucket Hat", path: "/models/neon-orange-lampshade.glb", favorite: true },
] as const;

type Props = { ready: boolean };

export function CustomizationExperience({ ready }: Props) {
  const [open, setOpen] = useState(false);
  const [selected, setSelected] = useState(0);
  const [loaded, setLoaded] = useState(0);
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    if (!open || !canvasRef.current) return;
    const canvas = canvasRef.current;
    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(34, 1, 0.1, 100);
    camera.position.set(0, 1.15, 8.2);
    camera.lookAt(0, -0.15, 0);

    const renderer = new THREE.WebGLRenderer({ canvas, alpha: true, antialias: true, powerPreference: "high-performance" });
    const renderRatio = Math.min(window.devicePixelRatio || 1, window.innerWidth < 760 ? 1 : 1.35);
    renderer.setPixelRatio(renderRatio);
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.05;

    const composer = new EffectComposer(renderer);
    composer.addPass(new RenderPass(scene, camera));
    composer.addPass(new UnrealBloomPass(new THREE.Vector2(1, 1), 0.1, 0.2, 0.9));
    composer.addPass(new FilmPass(0.08, false));
    composer.addPass(new OutputPass());

    scene.add(new THREE.HemisphereLight(0xffffff, 0xd9d7cf, 3.2));
    const key = new THREE.DirectionalLight(0xffffff, 5.4);
    key.position.set(-4, 7, 6);
    scene.add(key);
    const rim = new THREE.DirectionalLight(0xffe817, 3.1);
    rim.position.set(5, 1, -3);
    scene.add(rim);

    const ring = new THREE.Group();
    scene.add(ring);
    const pivots: THREE.Group[] = [];
    const loader = new GLTFLoader();
    let disposed = false;
    let animationFrame = 0;
    let targetRotation = 0;
    let currentRotation = 0;
    let wheelAmount = 0;
    let lastStepAt = 0;
    const openedAt = performance.now();
    const step = (Math.PI * 2) / ITEMS.length;

    const resize = () => {
      const width = canvas.clientWidth;
      const height = canvas.clientHeight;
      if (!width || !height) return;
      renderer.setSize(width, height, false);
      composer.setSize(width, height);
      camera.aspect = width / height;
      camera.position.z = camera.aspect < 0.75 ? 10.6 : 8.2;
      camera.updateProjectionMatrix();
    };

    ITEMS.forEach((item, index) => {
      loader.load(item.path, (gltf) => {
        if (disposed) return;
        const model = gltf.scene;
        model.traverse((child) => {
          if (!(child instanceof THREE.Mesh)) return;
          child.castShadow = false;
          child.receiveShadow = false;
          const materials = Array.isArray(child.material) ? child.material : [child.material];
          materials.forEach((material) => { material.needsUpdate = true; });
        });
        const sourceBounds = new THREE.Box3().setFromObject(model);
        const sourceSize = sourceBounds.getSize(new THREE.Vector3());
        const scale = 2.1 / Math.max(sourceSize.x, sourceSize.y, sourceSize.z, 0.001);
        model.scale.setScalar(scale);
        const scaledBounds = new THREE.Box3().setFromObject(model);
        const center = scaledBounds.getCenter(new THREE.Vector3());
        model.position.sub(center);

        const pivot = new THREE.Group();
        pivot.userData.angle = Math.PI + index * step;
        pivot.userData.delay = index * 105;
        pivot.userData.idlePhase = index * 0.7;
        pivot.position.set(0, -4.4, 1.2);
        pivot.scale.setScalar(0.04);
        pivot.add(model);
        pivots[index] = pivot;
        ring.add(pivot);
        setLoaded((value) => value + 1);
      }, undefined, (error) => console.error(`customizer:model:${item.short}`, error));
    });

    const selectNext = (direction: number) => {
      const now = performance.now();
      if (now - lastStepAt < 330) return;
      lastStepAt = now;
      targetRotation -= direction * step;
      setSelected((value) => (value + direction + ITEMS.length) % ITEMS.length);
    };

    const onWheel = (event: WheelEvent) => {
      event.preventDefault();
      window.scrollTo(0, 0);
      wheelAmount += event.deltaY;
      if (Math.abs(wheelAmount) < 38) return;
      selectNext(wheelAmount > 0 ? 1 : -1);
      wheelAmount = 0;
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "ArrowRight" || event.key === "ArrowDown") selectNext(1);
      if (event.key === "ArrowLeft" || event.key === "ArrowUp") selectNext(-1);
      if (event.key === "Escape") setOpen(false);
    };

    let lastRenderAt = performance.now();
    let lastFrameAt = 0;
    const render = (now: number) => {
      if (now - lastFrameAt < 20) {
        animationFrame = requestAnimationFrame(render);
        return;
      }
      lastFrameAt = now;
      const delta = Math.min((now - lastRenderAt) / 1000, 0.04);
      lastRenderAt = now;
      currentRotation = THREE.MathUtils.damp(currentRotation, targetRotation, 5.2, delta);
      pivots.forEach((pivot) => {
        if (!pivot) return;
        const raw = THREE.MathUtils.clamp((now - openedAt - 460 - pivot.userData.delay) / 980, 0, 1);
        const eased = 1 - Math.pow(1 - raw, 4);
        const angle = (pivot.userData.angle as number) + currentRotation;
        const targetX = Math.sin(angle) * 3.25;
        const verticalProgress = (Math.cos(angle) + 1) / 2;
        const targetY = 0.55 - Math.pow(verticalProgress, 1.65) * 4.45;
        const targetZ = 1.1 - Math.cos(angle) * 1.7;
        pivot.position.set(targetX * eased, -4.4 + (targetY + 4.4) * eased, 1.2 + (targetZ - 1.2) * eased);
        pivot.scale.setScalar(0.04 + eased * 0.96);
        pivot.rotation.y = Math.sin(now * 0.00055 + pivot.userData.idlePhase) * 0.16;
      });
      composer.render(delta);
      animationFrame = requestAnimationFrame(render);
    };

    resize();
    window.addEventListener("resize", resize);
    window.addEventListener("wheel", onWheel, { passive: false });
    window.addEventListener("keydown", onKeyDown);
    animationFrame = requestAnimationFrame(render);
    return () => {
      disposed = true;
      cancelAnimationFrame(animationFrame);
      window.removeEventListener("resize", resize);
      window.removeEventListener("wheel", onWheel);
      window.removeEventListener("keydown", onKeyDown);
      scene.traverse((object) => {
        if (!(object instanceof THREE.Mesh)) return;
        object.geometry.dispose();
        const materials = Array.isArray(object.material) ? object.material : [object.material];
        materials.forEach((material) => {
          for (const value of Object.values(material)) if (value instanceof THREE.Texture) value.dispose();
          material.dispose();
        });
      });
      composer.dispose();
      renderer.dispose();
    };
  }, [open]);

  return (
    <section className={`customization-gateway${ready ? " is-ready" : ""}${open ? " is-open" : ""}`} aria-hidden={!ready}>
      <button className="customize-entry" type="button" onClick={(event) => { event.currentTarget.blur(); setOpen(true); }} tabIndex={ready && !open ? 0 : -1}>
        <span>Customize your Memo</span>
      </button>
      <div className="customize-panel" aria-hidden={!open}>
        <canvas ref={canvasRef} className="customize-canvas" />
        <div className="customize-copy" aria-live="polite">
          <span>CUSTOMIZE YOUR MEMO / {String(selected + 1).padStart(2, "0")}</span>
          <div className="customize-heading" key={ITEMS[selected].name}>
            <h2>{ITEMS[selected].name}</h2>
            {"favorite" in ITEMS[selected] && ITEMS[selected].favorite ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img className="favorite-title-sticker" src="/artwork/sunday-favorite.webp" alt="Sunday favorite" />
            ) : null}
          </div>
        </div>
        <span className="customize-load-state">{loaded < ITEMS.length ? `LOADING OBJECTS ${loaded}/${ITEMS.length}` : "SCROLL TO EXPLORE"}</span>
        <button className="customize-close" type="button" onClick={() => setOpen(false)}>CLOSE</button>
      </div>
    </section>
  );
}
