"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { playSoundscape, stopSoundscape } from "@/lib/soundscape";

interface ListenToEarthButtonProps {
  temperature: number;
  humidity: number;
  windSpeed: number;
  unit: "C";
  onPlaybackChange: (playing: boolean) => void;
}

export default function ListenToEarthButton({
  temperature,
  humidity,
  windSpeed,
  onPlaybackChange,
}: ListenToEarthButtonProps) {
  const [isPlaying, setIsPlaying] = useState(false);
  const [note, setNote] = useState<string | null>(null);
  const mountedRef = useRef(true);
  const playbackIdRef = useRef(0);
  const playingInputRef = useRef<string | null>(null);
  const inputKey = `${temperature}:${humidity}:${windSpeed}`;

  const startPlayback = useCallback(async () => {
    const playbackId = ++playbackIdRef.current;
    playingInputRef.current = inputKey;

    try {
      const handle = await playSoundscape(
        { temperature, humidity, windSpeed },
        () => {
          if (playbackId === playbackIdRef.current && mountedRef.current) {
            setIsPlaying(false);
          }
        },
      );
      if (playbackId !== playbackIdRef.current || !mountedRef.current) return;
      setNote(handle.rootNote);
      await handle.done;
    } catch (error) {
      if (playbackId === playbackIdRef.current) {
        console.error("[ListenToEarth] soundscape failed:", error);
      }
    } finally {
      if (playbackId === playbackIdRef.current && mountedRef.current) {
        playingInputRef.current = null;
        setIsPlaying(false);
      }
    }
  }, [inputKey, temperature, humidity, windSpeed]);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  useEffect(() => {
    onPlaybackChange(isPlaying);
  }, [isPlaying, onPlaybackChange]);

  useEffect(() => {
    if (isPlaying && playingInputRef.current !== inputKey) {
      void startPlayback();
    }
  }, [inputKey, isPlaying, startPlayback]);

  const togglePlayback = useCallback(() => {
    if (isPlaying) {
      playbackIdRef.current++;
      playingInputRef.current = null;
      stopSoundscape();
      setIsPlaying(false);
      return;
    }

    setIsPlaying(true);
    void startPlayback();
  }, [isPlaying, startPlayback]);

  return (
    <div className="flex flex-col items-center gap-2">
      <button
        type="button"
        onClick={togglePlayback}
        aria-label={isPlaying ? "Stop soundscape" : "Listen to Earth"}
        className={`group inline-flex h-11 w-full items-center justify-center gap-2 rounded-full text-sm font-medium text-white shadow-lg transition-all focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 disabled:cursor-not-allowed disabled:opacity-60 ${
          isPlaying
            ? "bg-rose-500 shadow-rose-500/25 hover:bg-rose-400 focus-visible:outline-rose-400"
            : "bg-sky-500 shadow-sky-500/25 hover:bg-sky-400 focus-visible:outline-sky-400"
        }`}
      >
        {isPlaying ? (
          <>
            <svg aria-hidden="true" viewBox="0 0 24 24" className="h-4 w-4 fill-current">
              <rect x="6" y="6" width="12" height="12" rx="2" />
            </svg>
            Stop Sound
          </>
        ) : (
          <>
            <svg
              aria-hidden="true"
              viewBox="0 0 24 24"
              className="h-4 w-4 fill-current"
            >
              <path d="M13 4.27v2.09c2.33.32 4 2.19 4 4.64 0 2.45-1.67 4.32-4 4.64v2.09c3.45-.34 6-3.12 6-6.73s-2.55-6.39-6-6.73zM4 14c0-1.1.9-2 2-2h1v-4c0-.55.45-1 1-1s1 .45 1 1v10c0 .55-.45 1-1 1s-1-.45-1-1v-4H6c-1.1 0-2-.9-2-2z" />
            </svg>
            Listen to Earth
          </>
        )}
      </button>

      {note && !isPlaying && (
        <p className="text-[10px] text-slate-500">
          root note{" "}
          <span className="font-mono text-sky-300">{note}</span>
        </p>
      )}
    </div>
  );
}
