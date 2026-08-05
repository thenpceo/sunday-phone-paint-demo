"use client";

import { useCallback, useEffect, useRef } from "react";

const RATTLE_SOURCE = "/audio/spray-can-rattle.m4a";
const SPRAY_SOURCE = "/audio/spray-paint-loop.wav";

export function usePhonePaintAudio() {
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const rattleRequestedRef = useRef(false);
  const rattleStartedRef = useRef(false);
  const rattleFinishedRef = useRef(false);
  const sprayRequestedRef = useRef(false);

  const playSpray = useCallback(async () => {
    const audio = audioRef.current;
    if (!audio || !rattleFinishedRef.current || !sprayRequestedRef.current || !audio.paused) return;
    try {
      await audio.play();
    } catch {
      // Mobile browsers may require a page gesture. The gesture listeners
      // installed below retry the same element without replaying the rattle.
    }
  }, []);

  const playRattle = useCallback(async () => {
    const audio = audioRef.current;
    if (!audio || !rattleRequestedRef.current || rattleStartedRef.current || rattleFinishedRef.current) return;
    rattleStartedRef.current = true;
    try {
      await audio.play();
    } catch {
      rattleStartedRef.current = false;
    }
  }, []);

  useEffect(() => {
    const audio = new Audio(RATTLE_SOURCE);
    const sprayPreloader = new Audio(SPRAY_SOURCE);
    audio.preload = "auto";
    audio.volume = 0.9;
    sprayPreloader.preload = "auto";
    audioRef.current = audio;
    audio.load();
    sprayPreloader.load();

    const handleRattleEnded = () => {
      rattleFinishedRef.current = true;
      audio.loop = true;
      audio.src = SPRAY_SOURCE;
      audio.volume = 0.72;
      audio.load();
      if (sprayRequestedRef.current) void playSpray();
    };
    const unlockAudio = () => {
      if (rattleRequestedRef.current && !rattleFinishedRef.current) void playRattle();
      else if (sprayRequestedRef.current) void playSpray();
    };

    audio.addEventListener("ended", handleRattleEnded);
    document.addEventListener("pointerdown", unlockAudio, { passive: true });
    document.addEventListener("touchstart", unlockAudio, { passive: true });
    document.addEventListener("keydown", unlockAudio);
    if (rattleRequestedRef.current) queueMicrotask(() => void playRattle());

    return () => {
      audio.removeEventListener("ended", handleRattleEnded);
      document.removeEventListener("pointerdown", unlockAudio);
      document.removeEventListener("touchstart", unlockAudio);
      document.removeEventListener("keydown", unlockAudio);
      audio.pause();
      audio.removeAttribute("src");
      audio.load();
      sprayPreloader.removeAttribute("src");
      sprayPreloader.load();
      audioRef.current = null;
      rattleStartedRef.current = false;
      rattleFinishedRef.current = false;
      sprayRequestedRef.current = false;
    };
  }, [playRattle, playSpray]);

  const playLoadRattle = useCallback(() => {
    rattleRequestedRef.current = true;
    void playRattle();
  }, [playRattle]);

  const startSprayLoop = useCallback(() => {
    if (sprayRequestedRef.current) return;
    sprayRequestedRef.current = true;
    rattleRequestedRef.current = true;
    if (rattleFinishedRef.current) void playSpray();
    else void playRattle();
  }, [playRattle, playSpray]);

  const stopSprayLoop = useCallback(() => {
    sprayRequestedRef.current = false;
    const audio = audioRef.current;
    if (!audio || !rattleFinishedRef.current) return;
    audio.pause();
    audio.currentTime = 0;
  }, []);

  const stopAllAudio = useCallback(() => {
    sprayRequestedRef.current = false;
    rattleRequestedRef.current = false;
    const audio = audioRef.current;
    if (!audio) return;
    audio.pause();
    audio.currentTime = 0;
  }, []);

  return { playLoadRattle, startSprayLoop, stopSprayLoop, stopAllAudio };
}
