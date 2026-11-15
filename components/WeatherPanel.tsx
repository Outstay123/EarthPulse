"use client";

import { useState } from "react";
import ListenToEarthButton from "@/components/ListenToEarthButton";
import {
  humidityStyle,
  midiToNoteName,
  temperatureStyle,
  temperatureToMidi,
  windStyle,
} from "@/lib/sonification";
import type { WeatherData } from "@/types/weather";

interface WeatherPanelProps {
  weather: WeatherData;
  isLoading: boolean;
  onPlaybackChange: (playing: boolean) => void;
  onOpenLab: () => void;
  showClimateOverlay: boolean;
  onToggleClimateOverlay: () => void;
}

/**
 * Compact sound & telemetry sidebar. Everything fits one viewport —
 * no vertical scrolling.
 */
export default function WeatherPanel({
  weather,
  isLoading,
  onPlaybackChange,
  onOpenLab,
  showClimateOverlay,
  onToggleClimateOverlay,
}: WeatherPanelProps) {
  const [open, setOpen] = useState(true);

  const rootNote = midiToNoteName(temperatureToMidi(weather.temperature));

  return (
    <>
      {/* Toggle handle, always visible at the panel edge. */}
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        aria-controls="weather-panel"
        className="absolute top-1/2 z-20 -translate-y-1/2 -translate-x-full rounded-l-2xl border border-r-0 border-white/10 bg-slate-900/90 px-2 py-4 text-slate-300 shadow-2xl transition-colors hover:bg-slate-800 hover:text-white"
        style={{ right: open ? "min(24rem, 88vw)" : 0 }}
        title={open ? "Hide panel" : "Show panel"}
      >
        <span className="block text-sm">{open ? "▶" : "◀"}</span>
      </button>

      <aside
        id="weather-panel"
        aria-label="Sound and telemetry panel"
        className={`absolute top-0 right-0 z-10 flex h-full w-[min(24rem,88vw)] flex-col gap-2 overflow-hidden border-l border-white/10 bg-slate-950/85 p-4 backdrop-blur-md transition-transform duration-300 ease-in-out ${
          open ? "translate-x-0" : "translate-x-full"
        }`}
      >
        <header className="text-center">
          <p className="text-[10px] font-semibold uppercase tracking-[0.3em] text-sky-400">
            NASA Space Apps
          </p>
          <h1 className="mt-0.5 text-xl font-bold tracking-tight text-white">
            EarthPulse
          </h1>
        </header>

        {/* Location + Listen, the sound cockpit's core. */}
        <div
          className={`space-y-2 rounded-3xl border border-white/10 bg-slate-900/80 p-3 shadow-2xl transition-opacity ${
            isLoading ? "opacity-50" : "opacity-100"
          }`}
          aria-busy={isLoading}
        >
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="text-[10px] font-medium uppercase tracking-widest text-slate-400">
                Location
              </p>
              <p className="mt-0.5 text-base font-semibold leading-tight text-white">
                {weather.location}
              </p>
              <p className="text-xs text-slate-500">
                {weather.lat.toFixed(3)}°, {weather.lon.toFixed(3)}°
              </p>
            </div>
            <span className="shrink-0 rounded-full bg-white/10 px-2.5 py-1 text-[10px] font-medium tracking-wide text-sky-200">
              LIVE · METEOMATICS
            </span>
          </div>

          <div className="flex items-end justify-center gap-2">
            <p className="text-5xl font-bold leading-none tabular-nums text-white">
              {weather.temperature.toFixed(1)}
            </p>
            <p className="pb-1 text-xl font-medium text-sky-300">
              °{weather.unit}
            </p>
          </div>

          <ListenToEarthButton
            temperature={weather.temperature}
            humidity={weather.humidity}
            windSpeed={weather.windSpeed}
            unit={weather.unit}
            onPlaybackChange={onPlaybackChange}
          />
          <button
            type="button"
            onClick={onOpenLab}
            className="inline-flex h-9 w-full items-center justify-center gap-2 rounded-full border border-cyan-300/25 bg-cyan-400/10 text-xs font-semibold text-cyan-100 transition-colors hover:border-cyan-200/50 hover:bg-cyan-400/20 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-cyan-300"
          >
            <span aria-hidden="true">⚗</span>
            Open in Sonification Lab
          </button>
          <button
            type="button"
            aria-pressed={showClimateOverlay}
            onClick={onToggleClimateOverlay}
            className="inline-flex h-8 w-full items-center justify-between rounded-full border border-emerald-300/20 bg-emerald-400/5 px-3 text-[10px] font-semibold text-slate-200 transition-colors hover:border-emerald-200/40 hover:bg-emerald-400/10 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-300"
          >
            <span>Climate Bands</span>
            <span className={showClimateOverlay ? "text-emerald-300" : "text-slate-400"}>
              [{showClimateOverlay ? "ON" : "OFF"}]
            </span>
          </button>
        </div>

        {/* Live weather metrics. */}
        <dl className="grid grid-cols-2 gap-2">
          <div className="rounded-2xl border border-white/10 bg-slate-900/60 px-3 py-2">
            <dt className="text-[10px] font-medium uppercase tracking-widest text-slate-400">
              Humidity
            </dt>
            <dd className="mt-0.5 text-xl font-semibold tabular-nums text-white">
              {weather.humidity.toFixed(0)}
              <span className="text-sm text-slate-400">%</span>
            </dd>
          </div>
          <div className="rounded-2xl border border-white/10 bg-slate-900/60 px-3 py-2">
            <dt className="text-[10px] font-medium uppercase tracking-widest text-slate-400">
              Wind Speed
            </dt>
            <dd className="mt-0.5 text-xl font-semibold tabular-nums text-white">
              {weather.windSpeed.toFixed(1)}
              <span className="text-sm text-slate-400"> m/s</span>
            </dd>
          </div>
        </dl>

        {/* Earth Signature. */}
        <div className="rounded-2xl border border-sky-400/20 bg-sky-500/5 px-3 py-2">
          <h2 className="text-[10px] font-semibold uppercase tracking-widest text-sky-300">
            Earth Signature
          </h2>
          <dl className="mt-1 space-y-0.5 text-xs">
            <div className="flex items-baseline justify-between gap-2">
              <dt className="text-slate-400">Root Note</dt>
              <dd className="font-mono font-semibold text-sky-300">
                {rootNote}
              </dd>
            </div>
            <div className="flex items-baseline justify-between gap-2">
              <dt className="text-slate-400">Temperature</dt>
              <dd className="font-medium text-white">
                {temperatureStyle(weather.temperature)}
              </dd>
            </div>
            <div className="flex items-baseline justify-between gap-2">
              <dt className="text-slate-400">Humidity</dt>
              <dd className="font-medium text-white">
                {humidityStyle(weather.humidity)}
              </dd>
            </div>
            <div className="flex items-baseline justify-between gap-2">
              <dt className="text-slate-400">Wind</dt>
              <dd className="font-medium text-white">
                {windStyle(weather.windSpeed)}
              </dd>
            </div>
          </dl>
        </div>

        <footer className="mt-auto text-center text-[10px] text-slate-600">
          Click the map to explore · drag to pan · scroll to zoom
        </footer>
      </aside>
    </>
  );
}
