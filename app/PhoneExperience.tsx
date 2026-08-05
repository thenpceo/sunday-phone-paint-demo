"use client";

import { useEffect, useRef, useState } from "react";
import { createArtworkTracker } from "./lib/artwork-feature-tracker";
import { readSession, updateSession } from "./lib/session-client";
import { usePhonePaintAudio } from "./lib/use-phone-paint-audio";

type SessionState = "joining" | "ready" | "expired" | "invalid";
type VisionState = "idle" | "camera" | "loading" | "searching" | "found" | "error";
type Transport = "peer" | "session";
type PeerClient = import("peerjs").default;
type PeerConnection = import("peerjs").DataConnection;
const FRAME_INTERVAL = 16;
const MAX_SESSION_REQUESTS = 2;

export default function PhoneExperience() {
  const [token, setToken] = useState("");
  const [transport, setTransport] = useState<Transport>("peer");
  const [sessionState, setSessionState] = useState<SessionState>("joining");
  const [visionState, setVisionState] = useState<VisionState>("idle");
  const [completed, setCompleted] = useState(false);
  const [cameraError, setCameraError] = useState("");
  const [retryKey, setRetryKey] = useState(0);
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const peerRef = useRef<PeerClient | null>(null);
  const peerConnectionRef = useRef<PeerConnection | null>(null);
  const pairingRef = useRef<{ peer: string; token: string; legacy: string } | null>(null);
  const { startSprayLoop, stopSprayLoop, stopAllAudio } = usePhonePaintAudio();

  useEffect(() => {
    if (!pairingRef.current) {
      const params = new URLSearchParams(window.location.search);
      pairingRef.current = {
        peer: params.get("peer") ?? "",
        token: params.get("token") ?? "",
        legacy: params.get("session") ?? "",
      };
      window.history.replaceState({}, "", "/phone");
    }
    const { peer: queryPeer, token: queryToken, legacy: legacyToken } = pairingRef.current;
    if (/^sunday-paint-[a-f0-9]{32}$/.test(queryPeer) && /^[a-f0-9]{32}$/.test(queryToken)) {
      let active = true;
      let connection: PeerConnection | null = null;
      let peer: PeerClient | null = null;
      let usingFallback = false;
      let timeout: number | null = null;
      const activateFallback = () => {
        if (!active || usingFallback) return;
        if (!/^[a-f0-9]{32}$/.test(legacyToken)) {
          setSessionState("expired");
          return;
        }
        usingFallback = true;
        if (timeout !== null) window.clearTimeout(timeout);
        connection?.close();
        peer?.destroy();
        peerConnectionRef.current = null;
        peerRef.current = null;
        setSessionState("joining");
        setTransport("session");
        setToken(legacyToken);
        void updateSession(legacyToken, { type: "join" })
          .then(() => { if (active) setSessionState("ready"); })
          .catch(() => { if (active) setSessionState("expired"); });
      };
      queueMicrotask(() => { if (active) setToken(queryToken); });
      timeout = window.setTimeout(activateFallback, 4_500);
      void import("peerjs").then(({ default: Peer }) => {
        if (!active) return;
        peer = new Peer({ debug: 0 });
        peerRef.current = peer;
        peer.on("open", () => {
          if (!active || !peer) return;
          connection = peer.connect(queryPeer, {
            label: "sunday-phone-paint",
            metadata: { token: queryToken },
            serialization: "json",
            reliable: false,
          });
          peerConnectionRef.current = connection;
          connection.on("open", () => {
            if (!active || usingFallback) return;
            if (timeout !== null) window.clearTimeout(timeout);
            setSessionState("ready");
          });
          connection.on("data", (value) => {
            const packet = value as { type?: unknown };
            if (active && packet.type === "complete") setCompleted(true);
          });
          connection.on("close", () => {
            if (active && !usingFallback) activateFallback();
          });
          connection.on("error", activateFallback);
        });
        peer.on("error", activateFallback);
      }).catch(activateFallback);
      return () => {
        active = false;
        if (timeout !== null) window.clearTimeout(timeout);
        connection?.close();
        peer?.destroy();
        peerConnectionRef.current = null;
        peerRef.current = null;
      };
    }

    if (/^[a-f0-9]{32}$/.test(legacyToken)) {
      queueMicrotask(() => {
        setTransport("session");
        setToken(legacyToken);
        void updateSession(legacyToken, { type: "join" })
          .then(() => setSessionState("ready"))
          .catch(() => setSessionState("expired"));
      });
      return;
    }
    queueMicrotask(() => setSessionState("invalid"));
  }, []);

  useEffect(() => {
    if (completed) stopAllAudio();
  }, [completed, stopAllAudio]);

  useEffect(() => {
    if (transport !== "session" || !token || sessionState !== "ready" || completed) return;
    let active = true;
    const timer = window.setInterval(() => {
      void readSession(token).then(({ session }) => {
        if (active && session.completed) setCompleted(true);
      }).catch(() => undefined);
    }, 700);
    return () => { active = false; window.clearInterval(timer); };
  }, [completed, sessionState, token, transport]);

  useEffect(() => {
    if (!token || sessionState !== "ready" || completed) return;
    let active = true;
    let stream: MediaStream | null = null;
    let tracker: Awaited<ReturnType<typeof createArtworkTracker>> | null = null;
    let timer: number | null = null;
    let sequence = 0;
    let lastFoundAt = 0;
    let reportedLost = false;
    let smoothed: { x: number; y: number } | null = null;
    let sessionRequestsInFlight = 0;
    let pending:
      | { type: "cursor"; x: number; y: number; tracking: "found" }
      | { type: "tracking"; tracking: "lost" }
      | null = null;

    const flush = () => {
      if (!active || !pending) return;
      if (transport === "session" && sessionRequestsInFlight >= MAX_SESSION_REQUESTS) return;
      if (transport === "session" && pending.type === "tracking" && sessionRequestsInFlight > 0) return;
      const update = pending;
      pending = null;
      const payload = update.type === "cursor" ? { ...update, seq: sequence++ } : update;
      if (transport === "peer") {
        if (peerConnectionRef.current?.open) peerConnectionRef.current.send(payload);
        if (pending) timer = window.setTimeout(flush, FRAME_INTERVAL);
      } else {
        sessionRequestsInFlight += 1;
        void updateSession(token, payload).catch(() => undefined).finally(() => {
          sessionRequestsInFlight -= 1;
          flush();
        });
      }
    };
    const queue = (update: NonNullable<typeof pending>) => { pending = update; flush(); };
    const stop = () => {
      active = false;
      if (timer !== null) window.clearTimeout(timer);
      stopSprayLoop();
      tracker?.dispose();
      stream?.getTracks().forEach((item) => item.stop());
    };

    const run = async () => {
      try {
        setCameraError("");
        setVisionState("camera");
        if (!navigator.mediaDevices?.getUserMedia) throw new Error("Camera unavailable");
        stream = await navigator.mediaDevices.getUserMedia({
          audio: false,
          video: { facingMode: { ideal: "environment" }, width: { ideal: 1280 }, height: { ideal: 720 } },
        });
        if (!active || !videoRef.current) return stop();
        videoRef.current.srcObject = stream;
        await videoRef.current.play();
        setVisionState("loading");
        tracker = await createArtworkTracker();
        if (!active) return stop();
        setVisionState("searching");
        if (transport === "peer") peerConnectionRef.current?.send({ type: "tracking", tracking: "lost" });
        else await updateSession(token, { type: "tracking", tracking: "lost" });

        const processFrame = () => {
          if (!active || !tracker || !videoRef.current || !canvasRef.current) return;
          try {
            const result = tracker.locate(videoRef.current, canvasRef.current);
            if (result) {
              const distance = smoothed ? Math.hypot(result.x - smoothed.x, result.y - smoothed.y) : 1;
              const blend = distance > 0.32 ? 1 : 0.62;
              smoothed = smoothed
                ? { x: smoothed.x + (result.x - smoothed.x) * blend, y: smoothed.y + (result.y - smoothed.y) * blend }
                : { x: result.x, y: result.y };
              lastFoundAt = performance.now();
              reportedLost = false;
              setVisionState("found");
              queue({ type: "cursor", x: smoothed.x, y: smoothed.y, tracking: "found" });
              startSprayLoop();
            } else if (performance.now() - lastFoundAt > 550) {
              smoothed = null;
              setVisionState("searching");
              if (!reportedLost) { reportedLost = true; queue({ type: "tracking", tracking: "lost" }); }
            }
          } catch (error) {
            console.error("artwork-tracking:frame", error);
            setCameraError("Artwork recognition stopped. Tap retry to restart it.");
            setVisionState("error");
            stopSprayLoop();
            return;
          }
          if (active) timer = window.setTimeout(processFrame, FRAME_INTERVAL);
        };
        processFrame();
      } catch (error) {
        console.error("artwork-tracking:start", error);
        if (!active) return;
        setVisionState("error");
        stopSprayLoop();
        const denied = error instanceof DOMException && error.name === "NotAllowedError";
        setCameraError(denied ? "Camera access was blocked. Allow it, then tap retry." : "Camera tracking could not start. Tap retry.");
        if (transport === "peer") {
          try { peerConnectionRef.current?.send({ type: "tracking", tracking: "lost" }); } catch { /* connection is already closing */ }
        } else void updateSession(token, { type: "tracking", tracking: "lost" }).catch(() => undefined);
      }
    };
    void run();
    return stop;
  }, [completed, retryKey, sessionState, startSprayLoop, stopSprayLoop, token, transport]);

  if (sessionState === "invalid" || sessionState === "expired") {
    return <main className="phone-message-page"><span className="phone-kicker">PHONE PAINT</span><h1>{sessionState === "invalid" ? "Scan the code on your desktop." : "That session expired."}</h1><p>Return to the desktop, refresh the code, and scan again.</p></main>;
  }
  if (completed) {
    return <main className="phone-message-page phone-complete"><span className="phone-kicker">80% REVEALED</span><div className="phone-check">✓</div><h1>There it is.</h1><p>Look back at the desktop. The hidden page is ready.</p></main>;
  }

  return (
    <main className="phone-artwork-companion">
      <video ref={videoRef} className="phone-video" muted playsInline aria-hidden="true" />
      <canvas ref={canvasRef} className="process-canvas" aria-hidden="true" />
      <div className="phone-hidden-artwork" />
      <section className="artwork-tracking-hud" aria-live="polite">
        <div className={`phone-paint-prompt${visionState === "error" ? " has-error" : ""}`}>
          <strong>POINT AT YOUR SCREEN TO PAINT</strong>
          {visionState === "error" && <button type="button" onClick={() => setRetryKey((value) => value + 1)}>RETRY CAMERA</button>}
          {cameraError && <p>{cameraError}</p>}
        </div>
      </section>
    </main>
  );
}
