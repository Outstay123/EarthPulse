"use client";

import { useCallback, useRef, useState } from "react";
import {
  humidityStyle,
  humidityToRichness,
  midiToFrequency,
  midiToNoteName,
  temperatureStyle,
  temperatureToMidi,
  windToArpInterval,
  windToIntensity,
  windStyle,
} from "@/lib/sonification";
import { playSoundscape } from "@/lib/soundscape";
import type { WeatherData } from "@/types/weather";

interface CompareModalProps {
  slotA: WeatherData;
  slotB: WeatherData;
  onExit: () => void;
}

type Slot = "A" | "B";

function SideColumn({
  slot,
  weather,
  onPlay,
  playing,
}: {
  slot: Slot;
  weather: WeatherData;
  onPlay: (slot: Slot) => void;
  playing: Slot | null;
}) {
  const rootNote = midiToNoteName(temperatureToMidi(weather.temperature));

  return (
    <div className="flex flex-col gap-3 rounded-2xl border border-white/10 bg-slate-900/70 p-5">
      <div className="flex items-center gap-2">
        <span
          className={`flex h-7 w-7 items-center justify-center rounded-full text-xs font-bold text-white ${
            slot === "A" ? "bg-violet-500" : "bg-sky-500"
          }`}
        >
          {slot}
        </span>
        <div>
          <p className="text-sm font-semibold leading-tight text-white">
            {weather.location}
          </p>
          <p className="text-[10px] text-slate-500">
            {weather.lat.toFixed(2)}°, {weather.lon.toFixed(2)}°
          </p>
        </div>
      </div>

      <dl className="space-y-1 text-sm">
        <div className="flex justify-between">
          <dt className="text-slate-400">Temperature</dt>
          <dd className="tabular-nums text-white">
            {weather.temperature.toFixed(1)}°C
          </dd>
        </div>
        <div className="flex justify-between">
          <dt className="text-slate-400">Humidity</dt>
          <dd className="tabular-nums text-white">
            {weather.humidity.toFixed(0)}%
          </dd>
        </div>
        <div className="flex justify-between">
          <dt className="text-slate-400">Wind</dt>
          <dd className="tabular-nums text-white">
            {weather.windSpeed.toFixed(1)} m/s
          </dd>
        </div>
      </dl>

      <div className="space-y-1 rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-xs">
        <p className="flex justify-between">
          <span className="text-slate-400">Root Note</span>
          <span className="font-mono font-semibold text-sky-300">
            {rootNote}
          </span>
        </p>
        <p className="flex justify-between">
          <span className="text-slate-400">Style</span>
          <span className="text-white">
            {temperatureStyle(weather.temperature)} ·{" "}
            {humidityStyle(weather.humidity)} · {windStyle(weather.windSpeed)}
          </span>
        </p>
      </div>

      <button
        type="button"
        onClick={() => onPlay(slot)}
        disabled={playing !== null}
        className={`mt-auto inline-flex h-10 items-center justify-center gap-2 rounded-full text-sm font-medium text-white shadow-lg transition-all disabled:cursor-not-allowed disabled:opacity-50 ${
          slot === "A"
            ? "bg-violet-500 shadow-violet-500/25 hover:bg-violet-400"
            : "bg-sky-500 shadow-sky-500/25 hover:bg-sky-400"
        }`}
      >
        {playing === slot ? (
          <>
            <span className="flex h-4 items-end gap-[3px]" aria-hidden="true">
              {[0, 1, 2, 3].map((bar) => (
                <span
                  key={bar}
                  className="eq-bar w-[3px] rounded-full bg-white"
                  style={{ animationDelay: `${bar * 0.13}s` }}
                />
              ))}
            </span>
            Playing…
          </>
        ) : (
          <>▶ Play {slot}</>
        )}
      </button>
    </div>
  );
}

export default function CompareModal({
  slotA,
  slotB,
  onExit,
}: CompareModalProps) {
  const [playing, setPlaying] = useState<Slot | null>(null);
  const playbackRequestRef = useRef(0);

  const play = useCallback(
    async (slot: Slot) => {
      const weather = slot === "A" ? slotA : slotB;
      if (playing) return;
      const request = ++playbackRequestRef.current;
      setPlaying(slot);
      try {
        const handle = await playSoundscape({
          temperature: weather.temperature,
          humidity: weather.humidity,
          windSpeed: weather.windSpeed,
        }, () => {
          if (playbackRequestRef.current === request) setPlaying(null);
        });
        await handle.done;
      } catch (err) {
        console.error("[CompareModal] playback failed:", err);
      } finally {
        if (playbackRequestRef.current === request) setPlaying(null);
      }
    },
    [slotA, slotB, playing],
  );

  // Quantified differences between the two locations.
  const semitones =
    temperatureToMidi(slotB.temperature) - temperatureToMidi(slotA.temperature);
  const freqA = midiToFrequency(temperatureToMidi(slotA.temperature));
  const freqB = midiToFrequency(temperatureToMidi(slotB.temperature));
  const tempDiff = slotB.temperature - slotA.temperature;
  const humidityRichnessA = humidityToRichness(slotA.humidity);
  const humidityRichnessB = humidityToRichness(slotB.humidity);
  const windIntensityA = windToIntensity(slotA.windSpeed);
  const windIntensityB = windToIntensity(slotB.windSpeed);
  const pitchDirection = semitones > 0 ? "higher" : semitones < 0 ? "lower" : "the same pitch";
  const temperatureDirection =
    tempDiff > 0 ? "warmer" : tempDiff < 0 ? "cooler" : "the same temperature";

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Compare locations"
      className="absolute inset-0 z-30 flex items-center justify-center bg-slate-950/60 p-4 backdrop-blur-sm"
    >
      <div className="w-full max-w-2xl overflow-hidden rounded-3xl border border-white/10 bg-slate-950/80 shadow-2xl backdrop-blur-xl">
        <div className="flex items-center justify-between bg-gradient-to-r from-violet-600/30 to-sky-500/30 px-6 py-4">
          <h2 className="text-lg font-semibold text-white">
            ⚔️ {slotA.location} vs {slotB.location}
          </h2>
          <button
            type="button"
            onClick={onExit}
            aria-label="Close compare"
            className="text-slate-400 transition-colors hover:text-white"
          >
            ✕
          </button>
        </div>

        <div className="space-y-4 px-6 py-5">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <SideColumn slot="A" weather={slotA} onPlay={play} playing={playing} />
            <SideColumn slot="B" weather={slotB} onPlay={play} playing={playing} />
          </div>

          <div className="grid gap-3 rounded-2xl border border-sky-400/20 bg-sky-500/5 p-4 sm:grid-cols-3">
            <ComparisonMeter
              label="Temperature & Pitch"
              summary={`B is ${tempDiff > 0 ? "+" : ""}${tempDiff.toFixed(1)}°C ${temperatureDirection} · ${semitones > 0 ? "+" : ""}${semitones.toFixed(1)} semitones ${pitchDirection}`}
              valueA={Math.min(1, Math.max(0, (slotA.temperature + 40) / 90))}
              valueB={Math.min(1, Math.max(0, (slotB.temperature + 40) / 90))}
              leftLabel={`A · ${slotA.temperature.toFixed(1)}°C`}
              rightLabel={`B · ${slotB.temperature.toFixed(1)}°C`}
              color="from-sky-400 via-emerald-400 to-amber-400"
              detail={`${midiToNoteName(temperatureToMidi(slotA.temperature))} (${freqA.toFixed(0)} Hz) ↔ ${midiToNoteName(temperatureToMidi(slotB.temperature))} (${freqB.toFixed(0)} Hz)`}
            />
            <ComparisonMeter
              label="Humidity & Harmonic Richness"
              summary={`${Math.abs(slotB.humidity - slotA.humidity).toFixed(0)} percentage-point humidity gap`}
              valueA={humidityRichnessA}
              valueB={humidityRichnessB}
              leftLabel={`A · ${humidityStyle(slotA.humidity)}`}
              rightLabel={`B · ${humidityStyle(slotB.humidity)}`}
              color="from-emerald-900 via-emerald-500 to-emerald-300"
              detail={`${Math.round(humidityRichnessA * 100)}% richness ↔ ${Math.round(humidityRichnessB * 100)}% richness`}
            />
            <ComparisonMeter
              label="Wind & Motion"
              summary={`${Math.abs(slotB.windSpeed - slotA.windSpeed).toFixed(1)} m/s wind-speed gap`}
              valueA={windIntensityA}
              valueB={windIntensityB}
              leftLabel={`A · ${windStyle(slotA.windSpeed)}`}
              rightLabel={`B · ${windStyle(slotB.windSpeed)}`}
              color="from-indigo-950 via-cyan-500 to-sky-300"
              detail={`${windToArpInterval(slotA.windSpeed).toFixed(2)} s pulse ↔ ${windToArpInterval(slotB.windSpeed).toFixed(2)} s pulse`}
            />
          </div>

          <div className="flex justify-center">
            <button
              type="button"
              onClick={onExit}
              className="rounded-full border border-white/10 bg-white/5 px-5 py-2 text-xs font-medium text-slate-300 transition-colors hover:bg-white/10 hover:text-white"
            >
              Exit Compare Mode
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

function ComparisonMeter({
  label,
  summary,
  valueA,
  valueB,
  leftLabel,
  rightLabel,
  color,
  detail,
}: {
  label: string;
  summary: string;
  valueA: number;
  valueB: number;
  leftLabel: string;
  rightLabel: string;
  color: string;
  detail: string;
}) {
  return (
    <section className="min-w-0 rounded-xl border border-white/5 bg-slate-950/45 p-3">
      <h3 className="text-[10px] font-semibold uppercase tracking-wide text-slate-200">{label}</h3>
      <p className="mt-1 min-h-8 text-[9px] leading-relaxed text-cyan-200">{summary}</p>
      <div
        className="mt-2 space-y-1.5"
        role="img"
        aria-label={`${label}: location A ${Math.round(valueA * 100)} percent, location B ${Math.round(valueB * 100)} percent`}
      >
        <div className="flex items-center gap-1.5">
          <span className="w-3 text-[8px] font-semibold text-cyan-200">A</span>
          <div className="h-2 flex-1 overflow-hidden rounded-full bg-slate-800">
            <div className={`h-full rounded-full bg-gradient-to-r ${color}`} style={{ width: `${valueA * 100}%` }} />
          </div>
        </div>
        <div className="flex items-center gap-1.5">
          <span className="w-3 text-[8px] font-semibold text-emerald-200">B</span>
          <div className="h-2 flex-1 overflow-hidden rounded-full bg-slate-800">
            <div className={`h-full rounded-full bg-gradient-to-r ${color}`} style={{ width: `${valueB * 100}%` }} />
          </div>
        </div>
      </div>
      <div className="mt-1 flex justify-between gap-2 text-[8px] text-slate-400">
        <span className="truncate">{leftLabel}</span>
        <span className="truncate text-right">{rightLabel}</span>
      </div>
      <p className="mt-2 text-[9px] font-mono text-slate-300">{detail}</p>
    </section>
  );
}
