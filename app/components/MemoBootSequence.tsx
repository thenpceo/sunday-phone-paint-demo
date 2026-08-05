"use client";

import { useEffect, useRef, useState, type CSSProperties } from "react";

type Props = { ready: boolean };
type Phase = "loading" | "exiting" | "done";

export function MemoBootSequence({ ready }: Props) {
  const [progress, setProgress] = useState(0);
  const [phase, setPhase] = useState<Phase>("loading");
  const readyRef = useRef(ready);

  useEffect(() => { readyRef.current = ready; }, [ready]);

  useEffect(() => {
    const startedAt = performance.now();
    const timer = window.setInterval(() => {
      const elapsed = performance.now() - startedAt;
      const timedProgress = Math.min(92, Math.floor(elapsed / 14));
      setProgress((current) => {
        const next = Math.max(current, timedProgress);
        if ((readyRef.current || elapsed > 4500) && elapsed > 1050) {
          const completed = Math.min(100, Math.max(next, current + 2));
          if (completed === 100) window.clearInterval(timer);
          return completed;
        }
        return next;
      });
    }, 30);
    return () => window.clearInterval(timer);
  }, []);

  useEffect(() => {
    if (progress < 100) return;
    const exitTimer = window.setTimeout(() => setPhase("exiting"), 180);
    const doneTimer = window.setTimeout(() => setPhase("done"), 820);
    return () => {
      window.clearTimeout(exitTimer);
      window.clearTimeout(doneTimer);
    };
  }, [progress]);

  if (phase === "done") return null;

  return (
    <div
      className={`memo-loader${phase === "exiting" ? " is-exiting" : ""}`}
      role="status"
      aria-live="polite"
      aria-label={`Building Memo, ${progress} percent`}
      style={{ "--memo-progress": `${progress}%` } as CSSProperties}
    >
      <div className="memo-loader-lockup">
        <span className="memo-loader-mark" aria-hidden="true">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/artwork/sunday-logo-source.png" alt="" />
        </span>
        <span className="memo-loader-label">Building Memo</span>
        <span className="memo-loader-count" aria-hidden="true">
          <span>{String(progress).padStart(3, "0")}</span>
          <span>/ 100</span>
        </span>
        <span className="memo-loader-track" aria-hidden="true"><i /></span>
      </div>
    </div>
  );
}
