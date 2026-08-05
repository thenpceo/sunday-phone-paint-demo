"use client";

import { useCallback, useEffect, useRef } from "react";

const RATTLE_SOURCE = "/audio/spray-can-rattle.m4a";
const SPRAY_SOURCE = "/audio/spray-paint-loop.wav";

export function usePhonePaintAudio() {
  const rattleAudioRef = useRef<HTMLAudioElement | null>(null);
  const sprayAudioRef = useRef<HTMLAudioElement | null>(null);
  const rattleStartedRef = useRef(false);
  const rattleFinishedRef = useRef(false);
  const sprayRequestedRef = useRef(false);

  const playSpray = useCallback(async () => {
    const spray = sprayAudioRef.current;
    if (!spray || !rattleFinishedRef.current || !sprayRequestedRef.current || !spray.paused) return;
    try {
      await spray.play();
    } catch {
      // Safari can require a page gesture. The listeners below retry without
      // touching the active camera video element.
    }
  }, []);

  const playRattle = useCallback(async () => {
    const rattle = rattleAudioRef.current;
    if (!rattle || rattleStartedRef.current || rattleFinishedRef.current) return;
    rattleStartedRef.current = true;
    try {
      await rattle.play();
    } catch {
      rattleStartedRef.current = false;
    }
  }, []);

  useEffect(() => {
    const rattle = new Audio(RATTLE_SOURCE);
    const spray = new Audio(SPRAY_SOURCE);
    rattle.preload = "auto";
    rattle.volume = 0.9;
    spray.preload = "auto";
    spray.loop = true;
    spray.volume = 0.72;
    rattleAudioRef.current = rattle;
    sprayAudioRef.current = spray;

    const handleRattleEnded = () => {
      rattleFinishedRef.current = true;
      if (sprayRequestedRef.current) void playSpray();
    };
    const unlockAudio = () => {
      if (!sprayRequestedRef.current) return;
      if (!rattleFinishedRef.current) void playRattle();
      else void playSpray();
    };

    rattle.addEventListener("ended", handleRattleEnded);
    document.addEventListener("pointerdown", unlockAudio, { passive: true });
    document.addEventListener("touchstart", unlockAudio, { passive: true });
    document.addEventListener("keydown", unlockAudio);

    return () => {
      rattle.removeEventListener("ended", handleRattleEnded);
      document.removeEventListener("pointerdown", unlockAudio);
      document.removeEventListener("touchstart", unlockAudio);
      document.removeEventListener("keydown", unlockAudio);
      rattle.pause();
      spray.pause();
      rattle.removeAttribute("src");
      spray.removeAttribute("src");
      rattleAudioRef.current = null;
      sprayAudioRef.current = null;
      rattleStartedRef.current = false;
      rattleFinishedRef.current = false;
      sprayRequestedRef.current = false;
    };
  }, [playRattle, playSpray]);

  const startSprayLoop = useCallback(() => {
    if (sprayRequestedRef.current) return;
    sprayRequestedRef.current = true;
    if (rattleFinishedRef.current) void playSpray();
    else void playRattle();
  }, [playRattle, playSpray]);

  const stopSprayLoop = useCallback(() => {
    sprayRequestedRef.current = false;
    const spray = sprayAudioRef.current;
    if (!spray) return;
    spray.pause();
    spray.currentTime = 0;
  }, []);

  const stopAllAudio = useCallback(() => {
    sprayRequestedRef.current = false;
    const rattle = rattleAudioRef.current;
    const spray = sprayAudioRef.current;
    rattle?.pause();
    spray?.pause();
    if (rattle) rattle.currentTime = 0;
    if (spray) spray.currentTime = 0;
  }, []);

  return { startSprayLoop, stopSprayLoop, stopAllAudio };
}
