"use client";

import QRCode from "qrcode";
import dynamic from "next/dynamic";
import { useCallback, useEffect, useRef, useState } from "react";
import { MemoBootSequence } from "./components/MemoBootSequence";
import { PersistentNav } from "./components/PersistentNav";
import { readSession, updateSession } from "./lib/session-client";
import { drawSprayReveal, prepareSprayRevealBrush } from "./lib/spray-reveal-brush";

const GRID_WIDTH = 80;
const GRID_HEIGHT = 45;
const BRUSH_RADIUS = 0.105;
const ARTWORK_WIDTH = 1672;
const ARTWORK_HEIGHT = 941;
const PAINT_PIXEL_RATIO = 1.5;
const CustomizationExperience = dynamic(
  () => import("./components/CustomizationExperience").then((module) => module.CustomizationExperience),
  { ssr: false },
);
type CreatedSession = { token: string; expiresAt: number; phoneUrl: string };
type PaintPoint = { x: number; y: number; at: number };

export default function DesktopExperience() {
  const [created, setCreated] = useState<CreatedSession | null>(null);
  const [qrDataUrl, setQrDataUrl] = useState("");
  const [completed, setCompleted] = useState(false);
  const [creating, setCreating] = useState(true);
  const [artworkReady, setArtworkReady] = useState(false);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const stageRef = useRef<HTMLDivElement>(null);
  const startImageRef = useRef<HTMLImageElement | null>(null);
  const gridRef = useRef(new Uint8Array(GRID_WIDTH * GRID_HEIGHT));
  const coveredRef = useRef(0);
  const pointsRef = useRef<PaintPoint[]>([]);
  const lastPointRef = useRef<PaintPoint | null>(null);
  const lastSeqRef = useRef(-1);
  const completeRef = useRef(false);
  const createStartedRef = useRef(false);
  const finishFrameRef = useRef(0);
  const remoteTargetRef = useRef<PaintPoint | null>(null);
  const remoteVisualRef = useRef<PaintPoint | null>(null);
  const sessionToken = created?.token ?? "";

  const fillCanvas = useCallback(() => {
    const canvas = canvasRef.current;
    const stage = stageRef.current;
    if (!canvas || !stage) return;
    const rect = stage.getBoundingClientRect();
    const ratio = Math.min(window.devicePixelRatio || 1, PAINT_PIXEL_RATIO);
    canvas.width = Math.max(1, Math.round(rect.width * ratio));
    canvas.height = Math.max(1, Math.round(rect.height * ratio));
    const context = canvas.getContext("2d");
    if (!context) return;
    context.setTransform(ratio, 0, 0, ratio, 0, 0);
    context.globalCompositeOperation = "source-over";
    context.clearRect(0, 0, rect.width, rect.height);
    if (startImageRef.current?.complete) drawImageCover(context, startImageRef.current, rect.width, rect.height);
    if (completeRef.current) {
      context.clearRect(0, 0, rect.width, rect.height);
      return;
    }
    drawSprayReveal(
      context,
      rect.width,
      rect.height,
      null,
      { x: 0.988, y: 0.982, at: 1717 },
      BRUSH_RADIUS * 1.35,
    );
    drawSprayReveal(
      context,
      rect.width,
      rect.height,
      null,
      { x: 0.947, y: 0.958, at: 2424 },
      BRUSH_RADIUS * 1.05,
    );
    drawSprayReveal(
      context,
      rect.width,
      rect.height,
      null,
      { x: 0.885, y: 0.975, at: 3191 },
      BRUSH_RADIUS * 0.82,
    );
    let last: PaintPoint | null = null;
    for (const point of pointsRef.current) { drawInterpolated(context, rect.width, rect.height, last, point); last = point; }
  }, []);

  useEffect(() => {
    const image = new Image();
    image.onload = () => {
      fillCanvas();
      requestAnimationFrame(() => setArtworkReady(true));
    };
    image.onerror = () => setArtworkReady(true);
    image.src = "/artwork/hero-start.webp";
    startImageRef.current = image;
    return () => { image.onload = null; image.onerror = null; };
  }, [fillCanvas]);

  useEffect(() => {
    const timer = window.setTimeout(prepareSprayRevealBrush, 0);
    fillCanvas();
    const observer = new ResizeObserver(fillCanvas);
    if (stageRef.current) observer.observe(stageRef.current);
    return () => { window.clearTimeout(timer); cancelAnimationFrame(finishFrameRef.current); observer.disconnect(); };
  }, [fillCanvas]);

  const resetPaint = useCallback(() => {
    gridRef.current = new Uint8Array(GRID_WIDTH * GRID_HEIGHT);
    coveredRef.current = 0;
    pointsRef.current = [];
    lastPointRef.current = null;
    remoteTargetRef.current = null;
    remoteVisualRef.current = null;
    lastSeqRef.current = -1;
    completeRef.current = false;
    setCompleted(false);
    requestAnimationFrame(fillCanvas);
  }, [fillCanvas]);

  const createSession = useCallback(async () => {
    setCreating(true);
    setQrDataUrl("");
    resetPaint();
    try {
      const response = await fetch("/api/sessions", { method: "POST" });
      if (!response.ok) throw new Error("SESSION_CREATE_FAILED");
      const session = (await response.json()) as CreatedSession;
      const code = await QRCode.toDataURL(session.phoneUrl, {
        width: 280, margin: 1, color: { dark: "#1a1a1a", light: "#ffffff" },
      });
      setCreated(session);
      setQrDataUrl(code);
    } catch (sessionError) {
      console.error(sessionError);
    } finally { setCreating(false); }
  }, [resetPaint]);

  useEffect(() => {
    if (createStartedRef.current) return;
    createStartedRef.current = true;
    void createSession();
  }, [createSession]);

  const completeReveal = useCallback(() => {
    if (completeRef.current) return;
    completeRef.current = true;
    const canvas = canvasRef.current;
    const stage = stageRef.current;
    const context = canvas?.getContext("2d");
    if (!canvas || !stage || !context) {
      setCompleted(true);
      if (sessionToken) void updateSession(sessionToken, { type: "complete" }).catch(() => undefined);
      return;
    }

    const rect = stage.getBoundingClientRect();
    const ratio = Math.min(window.devicePixelRatio || 1, PAINT_PIXEL_RATIO);
    context.setTransform(ratio, 0, 0, ratio, 0, 0);
    const candidates: PaintPoint[] = [];
    for (let cellY = 0; cellY < GRID_HEIGHT; cellY += 2) {
      for (let cellX = 0; cellX < GRID_WIDTH; cellX += 2) {
        if (gridRef.current[cellY * GRID_WIDTH + cellX]) continue;
        candidates.push({
          x: (cellX + 0.35 + Math.random() * 1.3) / GRID_WIDTH,
          y: (cellY + 0.35 + Math.random() * 1.3) / GRID_HEIGHT,
          at: Date.now() + candidates.length * 17,
        });
      }
    }
    for (let index = candidates.length - 1; index > 0; index -= 1) {
      const swap = Math.floor(Math.random() * (index + 1));
      [candidates[index], candidates[swap]] = [candidates[swap], candidates[index]];
    }

    let cursor = 0;
    let last: PaintPoint | null = null;
    const finalize = () => {
      context.clearRect(0, 0, rect.width, rect.height);
      setCompleted(true);
      if (sessionToken) void updateSession(sessionToken, { type: "complete" }).catch(() => undefined);
    };
    const finishFrame = () => {
      for (let batch = 0; batch < 4 && cursor < candidates.length; batch += 1) {
        const point = candidates[cursor++];
        drawSprayReveal(context, rect.width, rect.height, last, point, BRUSH_RADIUS * 0.72);
        last = point;
      }
      if (cursor < candidates.length) finishFrameRef.current = requestAnimationFrame(finishFrame);
      else window.setTimeout(finalize, 140);
    };
    finishFrameRef.current = requestAnimationFrame(finishFrame);
  }, [sessionToken]);

  const paintPoint = useCallback((point: PaintPoint) => {
    if (completeRef.current) return;
    const canvas = canvasRef.current;
    const stage = stageRef.current;
    if (!canvas || !stage) return;
    const rect = stage.getBoundingClientRect();
    const context = canvas.getContext("2d");
    if (!context) return;
    const ratio = Math.min(window.devicePixelRatio || 1, PAINT_PIXEL_RATIO);
    context.setTransform(ratio, 0, 0, ratio, 0, 0);
    const last = lastPointRef.current;
    const continuous = last && point.at - last.at <= 260;
    drawInterpolated(context, rect.width, rect.height, continuous ? last : null, point);
    const aspect = rect.height / rect.width;
    for (const sample of interpolatedSamples(continuous ? last : null, point, aspect)) {
      coveredRef.current += markGridCoverage(gridRef.current, sample.x, sample.y, aspect);
    }
    pointsRef.current.push(point);
    if (pointsRef.current.length > 2400) pointsRef.current.shift();
    lastPointRef.current = point;
    const next = coveredRef.current / gridRef.current.length * 100;
    if (next >= 80) completeReveal();
  }, [completeReveal]);

  useEffect(() => {
    if (completed) return;
    let frame = 0;
    const animate = () => {
      const target = remoteTargetRef.current;
      const visual = remoteVisualRef.current;
      if (target && !visual) {
        const first = { ...target, at: Date.now() };
        remoteVisualRef.current = first;
        paintPoint(first);
      } else if (target && visual) {
        const distance = Math.hypot(target.x - visual.x, target.y - visual.y);
        if (distance > 0.0015) {
          const blend = distance > 0.2 ? 0.68 : 0.38;
          const next = { x: visual.x + (target.x - visual.x) * blend, y: visual.y + (target.y - visual.y) * blend, at: Date.now() };
          remoteVisualRef.current = next;
          paintPoint(next);
        }
      }
      frame = requestAnimationFrame(animate);
    };
    frame = requestAnimationFrame(animate);
    return () => cancelAnimationFrame(frame);
  }, [completed, paintPoint]);

  useEffect(() => {
    if (!created?.token || completed) return;
    let active = true;
    let timer: ReturnType<typeof setTimeout>;
    let failures = 0;
    const poll = async () => {
      try {
        const { session } = await readSession(created.token);
        if (!active) return;
        failures = 0;
        if (session.latestSeq > lastSeqRef.current && session.latestX !== null && session.latestY !== null && (session.tracking === "found" || session.tracking === "manual")) {
          lastSeqRef.current = session.latestSeq;
          const mapped = referenceToStage(session.latestX, session.latestY, stageRef.current);
          if (mapped) remoteTargetRef.current = { ...mapped, at: session.updatedAt };
        } else if (session.tracking === "lost") {
          remoteTargetRef.current = null;
          remoteVisualRef.current = null;
          lastPointRef.current = null;
        }
      } catch (pollError) {
        failures += 1;
        if (failures >= 3 && active) console.error("phone-paint:session", pollError);
      } finally { if (active) timer = setTimeout(poll, 40); }
    };
    void poll();
    return () => { active = false; clearTimeout(timer); };
  }, [created?.token, completed]);

  return (
    <main id="top" className={`experience${completed ? " is-complete" : ""}`}>
      <MemoBootSequence ready={artworkReady} />
      <PersistentNav />
      <section className="prototype-shell" id="experiment" aria-label="Phone paint reveal">
        <div className="stage-column">
          <div ref={stageRef} className="reveal-stage">
            <video
              className="hidden-artwork"
              autoPlay
              muted
              loop
              playsInline
              preload="metadata"
              poster="/media/hidden-hero-poster.webp"
              aria-hidden="true"
            >
              <source src="/media/hidden-hero.webm" type="video/webm" />
              <source src="/media/hidden-hero.mp4" type="video/mp4" />
            </video>
            <canvas ref={canvasRef} className="erase-canvas" aria-label="Phone-controlled spray-paint reveal surface" />
            <div className="completion-message"><span>80% COMPLETE</span><strong>There it is.</strong></div>
          </div>
        </div>
        <aside className="scan-sticker" aria-live="polite">
          <button
            type="button"
            onClick={() => void createSession()}
            aria-label="Refresh the phone pairing QR code"
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img className="scan-sticker-art" src="/artwork/scan-me-sticker-optimized.png" alt="" />
            <span className="scan-sticker-qr">{qrDataUrl ? (
              // This is an ephemeral client-generated data URL, not an optimizable site asset.
              // eslint-disable-next-line @next/next/no-img-element
              <img src={qrDataUrl} alt="QR code that opens the phone camera" />
            ) : <span aria-label={creating ? "Creating QR code" : "QR code unavailable"} />}</span>
          </button>
        </aside>
        {completed && <CustomizationExperience ready />}
      </section>
    </main>
  );
}

function interpolatedSamples(last: PaintPoint | null, point: PaintPoint, aspect: number) {
  if (!last) return [point];
  const distance = Math.hypot(point.x - last.x, (point.y - last.y) * aspect);
  if (distance > 0.38) return [point];
  const count = Math.max(1, Math.ceil(distance / 0.018));
  return Array.from({ length: count }, (_, index) => { const amount = (index + 1) / count; return { x: last.x + (point.x - last.x) * amount, y: last.y + (point.y - last.y) * amount, at: point.at }; });
}

function markGridCoverage(grid: Uint8Array, x: number, y: number, aspect: number) {
  const verticalRadius = BRUSH_RADIUS / aspect;
  const minX = Math.max(0, Math.floor((x - BRUSH_RADIUS) * GRID_WIDTH));
  const maxX = Math.min(GRID_WIDTH - 1, Math.ceil((x + BRUSH_RADIUS) * GRID_WIDTH));
  const minY = Math.max(0, Math.floor((y - verticalRadius) * GRID_HEIGHT));
  const maxY = Math.min(GRID_HEIGHT - 1, Math.ceil((y + verticalRadius) * GRID_HEIGHT));
  let added = 0;
  for (let cellY = minY; cellY <= maxY; cellY += 1) for (let cellX = minX; cellX <= maxX; cellX += 1) {
    const dx = (cellX + 0.5) / GRID_WIDTH - x;
    const dy = ((cellY + 0.5) / GRID_HEIGHT - y) * aspect;
    if (Math.hypot(dx, dy) > BRUSH_RADIUS) continue;
    const index = cellY * GRID_WIDTH + cellX;
    if (!grid[index]) { grid[index] = 1; added += 1; }
  }
  return added;
}

function drawInterpolated(context: CanvasRenderingContext2D, width: number, height: number, last: PaintPoint | null, point: PaintPoint) {
  for (const sample of interpolatedSamples(last, point, height / width)) drawSprayReveal(context, width, height, last, sample, BRUSH_RADIUS);
}

function drawImageCover(context: CanvasRenderingContext2D, image: HTMLImageElement, width: number, height: number) {
  const scale = Math.max(width / image.naturalWidth, height / image.naturalHeight);
  const drawnWidth = image.naturalWidth * scale;
  const drawnHeight = image.naturalHeight * scale;
  context.drawImage(image, (width - drawnWidth) / 2, (height - drawnHeight) / 2, drawnWidth, drawnHeight);
}

function referenceToStage(x: number, y: number, stage: HTMLDivElement | null) {
  if (!stage) return null;
  const rect = stage.getBoundingClientRect();
  const scale = Math.max(rect.width / ARTWORK_WIDTH, rect.height / ARTWORK_HEIGHT);
  const width = ARTWORK_WIDTH * scale;
  const height = ARTWORK_HEIGHT * scale;
  const stageX = (x * width + (rect.width - width) / 2) / rect.width;
  const stageY = (y * height + (rect.height - height) / 2) / rect.height;
  if (stageX < -0.04 || stageX > 1.04 || stageY < -0.04 || stageY > 1.04) return null;
  return { x: Math.min(1, Math.max(0, stageX)), y: Math.min(1, Math.max(0, stageY)) };
}
