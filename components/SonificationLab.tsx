"use client";

import { useEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import {
  humidityToRichness,
  midiToNoteName,
  temperatureToFrequency,
  temperatureToMidi,
  windToArpInterval,
  windToIntensity,
} from "@/lib/sonification";
import {
  createSoundscapeEnergyTap,
  startLabSoundscape,
  type LabSoundscapeInput,
  type LabSoundscapeSession,
  type SoundLayer,
  type SoundscapeEnergyTap,
} from "@/lib/soundscape";

interface SonificationLabProps {
  onClose: () => void;
  initialValues?: LabSoundscapeInput;
  gameHint?: string | null;
  gameMode?: boolean;
  onValuesChange?: (values: LabSoundscapeInput) => void;
}

const PRESETS: { label: string; values: LabSoundscapeInput }[] = [
  { label: "Kuala Lumpur", values: { temperature: 27, humidity: 84, windSpeed: 3 } },
  { label: "Antarctica", values: { temperature: -31, humidity: 45, windSpeed: 12 } },
  { label: "Sahara", values: { temperature: 42, humidity: 30, windSpeed: 4 } },
  { label: "North Atlantic Gale", values: { temperature: 9, humidity: 78, windSpeed: 15 } },
];

const DEFAULT_MUTES: Record<SoundLayer, boolean> = {
  temperature: false,
  humidity: false,
  wind: false,
};

export default function SonificationLab({
  onClose,
  initialValues = PRESETS[0].values,
  gameHint = null,
  gameMode = false,
  onValuesChange,
}: SonificationLabProps) {
  const [values, setValues] = useState<LabSoundscapeInput>(initialValues);
  const [muted, setMuted] = useState(DEFAULT_MUTES);
  const [playing, setPlaying] = useState(false);
  const [starting, setStarting] = useState(false);
  const sessionRef = useRef<LabSoundscapeSession | null>(null);
  const mountedRef = useRef(true);
  const playbackRequestRef = useRef(0);
  const latestValuesRef = useRef(values);
  const mutedRef = useRef(muted);

  const rootNote = midiToNoteName(temperatureToMidi(values.temperature));
  const frequency = temperatureToFrequency(values.temperature);
  const richness = humidityToRichness(values.humidity);
  const chordReadout =
    richness >= 0.65
      ? "9th Stack"
      : richness >= 0.25
        ? "5th + Octave"
        : "Sparse Octave";
  const windIntensity = windToIntensity(values.windSpeed);
  const arpeggioReadout =
    windIntensity >= 0.8
      ? "16th Gale"
      : windIntensity >= 0.35
        ? "Steady Plucks"
        : "Slow Swells";
  const arpInterval = windToArpInterval(values.windSpeed);
  const input = useMemo(() => values, [values]);
  const anyMuted = Object.values(muted).some(Boolean);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      sessionRef.current?.stop();
      sessionRef.current = null;
    };
  }, []);

  useEffect(() => {
    sessionRef.current?.update(input);
    latestValuesRef.current = input;
  }, [input]);

  useEffect(() => {
    sessionRef.current?.setMuted(muted);
    mutedRef.current = muted;
  }, [muted]);

  async function togglePlayback() {
    if (sessionRef.current) {
      playbackRequestRef.current++;
      sessionRef.current.stop();
      sessionRef.current = null;
      setPlaying(false);
      return;
    }

    const request = ++playbackRequestRef.current;
    setStarting(true);
    try {
      const session = await startLabSoundscape(latestValuesRef.current, () => {
        if (!mountedRef.current || playbackRequestRef.current !== request) return;
        sessionRef.current = null;
        setPlaying(false);
        setStarting(false);
      });
      if (!mountedRef.current || request !== playbackRequestRef.current || !session.isActive()) {
        session.stop();
        return;
      }
      session.update(latestValuesRef.current);
      session.setMuted(mutedRef.current);
      sessionRef.current = session;
      setPlaying(true);
    } catch (error) {
      console.error("[SonificationLab] playback failed:", error);
    } finally {
      if (mountedRef.current) setStarting(false);
    }
  }

  function updateValue(key: keyof LabSoundscapeInput, value: number) {
    const next = { ...latestValuesRef.current, [key]: value };
    latestValuesRef.current = next;
    setValues(next);
    onValuesChange?.(next);
  }

  function loadPreset(preset: LabSoundscapeInput) {
    latestValuesRef.current = preset;
    setValues(preset);
    onValuesChange?.(preset);
  }

  function toggleMute(layer: SoundLayer) {
    setMuted((current) => ({ ...current, [layer]: !current[layer] }));
  }

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="sonification-lab-title"
      className="absolute inset-0 z-30 flex items-center justify-center overflow-y-auto bg-slate-950/65 p-3 backdrop-blur-md sm:p-5"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <section className="my-auto w-full max-w-4xl overflow-hidden rounded-3xl border border-slate-700 bg-slate-900/90 shadow-2xl backdrop-blur-lg">
        <header className="flex items-start justify-between gap-4 px-5 pt-4 sm:px-6">
          <div>
            <p className="text-[10px] font-semibold uppercase tracking-[0.25em] text-cyan-300">
              Interactive Sandbox
            </p>
            <h2 id="sonification-lab-title" className="mt-1 text-xl font-bold text-white">
              Sonification Lab
            </h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close Sonification Lab"
            className="rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-sm text-slate-300 transition-colors hover:bg-white/10 hover:text-white"
          >
            ✕
          </button>
        </header>

        <div className="px-5 pt-4 sm:px-6">
          <LabVisualizer
            playing={playing}
            temperature={values.temperature}
            humidity={values.humidity}
            windSpeed={values.windSpeed}
          />
        </div>

        {gameHint && (
          <div className="mx-5 mt-3 rounded-xl border border-emerald-300/20 bg-emerald-400/5 px-3 py-2 sm:mx-6">
            <p className="text-[9px] font-semibold uppercase tracking-wider text-emerald-300">GeoGuessr telemetry hint</p>
            <p className="mt-1 text-[10px] leading-relaxed text-emerald-50/90">{gameHint}</p>
          </div>
        )}

        <div className="grid gap-3 p-5 sm:px-6 sm:pb-6 md:grid-cols-3">
          <ElementCard
            icon="🌡"
            layer="temperature"
            label="Temperature"
            value={values.temperature}
            min={-40}
            max={50}
            step={0.1}
            unit="°C"
            readout={`Root Note: ${rootNote}`}
            detail={`Controls the fundamental pitch oscillator. At ${values.temperature.toFixed(1)}°C, the base frequency sits at ${frequency.toFixed(1)} Hz (${rootNote}), creating a ${values.temperature < 0 ? "deep sub-bass" : values.temperature >= 30 ? "bright high-register" : "balanced mid-range"} foundation.`}
            muted={muted.temperature}
            onMute={() => toggleMute("temperature")}
            onChange={(value) => updateValue("temperature", value)}
            color="#38bdf8"
          />
          <ElementCard
            icon="💧"
            layer="humidity"
            label="Humidity"
            value={values.humidity}
            min={30}
            max={100}
            step={1}
            unit="%"
            readout={`Chord Density: ${chordReadout}`}
            detail={`Shapes harmonic richness and filter openness. At ${values.humidity.toFixed(0)}%, air moisture layers ${richness < 0.2 ? "a single dry voice" : richness < 0.6 ? "fifth and octave harmonics" : "lush 9th chords with warm chorus"}.`}
            muted={muted.humidity}
            onMute={() => toggleMute("humidity")}
            onChange={(value) => updateValue("humidity", value)}
            color="#34d399"
          />
          <ElementCard
            icon="💨"
            layer="wind"
            label="Wind Speed"
            value={values.windSpeed}
            min={0}
            max={15}
            step={0.1}
            unit="m/s"
            readout={`Arpeggio: ${arpeggioReadout}`}
            detail={`Drives rhythmic pulse and air texture. At ${values.windSpeed.toFixed(1)} m/s, wind velocity triggers ${windIntensity < 0.2 ? "slow ambient swells" : windIntensity < 0.65 ? "steady rhythmic plucks" : "rapid turbulent arpeggios and filtered gale noise"}.`}
            muted={muted.wind}
            onMute={() => toggleMute("wind")}
            onChange={(value) => updateValue("windSpeed", value)}
            color="#fbbf24"
          />
        </div>

        <footer className="flex flex-col gap-3 border-t border-white/10 bg-slate-950/35 px-5 py-4 sm:flex-row sm:items-center sm:justify-between sm:px-6">
          <div>
            <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-slate-400">
              Quick-Load Biomes
            </p>
            <div className="mt-2 flex flex-wrap gap-2">
              {PRESETS.map((preset, index) => (
                <button
                  key={preset.label}
                  type="button"
                  onClick={() => loadPreset(preset.values)}
                  className="rounded-full border border-cyan-400/20 bg-cyan-400/5 px-3 py-1.5 text-[10px] font-medium text-cyan-100 transition-colors hover:border-cyan-300/40 hover:bg-cyan-400/10"
                >
                  {gameMode ? `Preset ${index + 1}` : preset.label}
                </button>
              ))}
              {anyMuted && (
                <button
                  type="button"
                  onClick={() => setMuted(DEFAULT_MUTES)}
                  className="rounded-full border border-amber-300/20 px-3 py-1.5 text-[10px] font-medium text-amber-200 transition-colors hover:bg-amber-300/10"
                >
                  Reset Mutes
                </button>
              )}
            </div>
          </div>
          <div className="flex shrink-0 items-center gap-3">
            <span className="text-[10px] text-slate-400">
              {playing ? `Live · pulse every ${arpInterval.toFixed(2)} s` : "Sandbox paused"}
            </span>
            <button
              type="button"
              onClick={togglePlayback}
              disabled={starting}
              className={`rounded-full px-5 py-2.5 text-xs font-semibold text-white shadow-lg transition-colors disabled:cursor-wait disabled:opacity-60 ${
                playing
                  ? "bg-rose-500/90 shadow-rose-500/20 hover:bg-rose-400"
                  : "bg-cyan-500 shadow-cyan-500/20 hover:bg-cyan-400"
              }`}
            >
              {starting ? "Starting…" : playing ? "Ⅱ Pause Lab Sound" : "▶ Play Lab Sound"}
            </button>
          </div>
        </footer>
      </section>
    </div>
  );
}

function ElementCard({
  icon,
  layer,
  label,
  value,
  min,
  max,
  step,
  unit,
  readout,
  detail,
  muted,
  onMute,
  onChange,
  color,
}: {
  icon: string;
  layer: SoundLayer;
  label: string;
  value: number;
  min: number;
  max: number;
  step: number;
  unit: string;
  readout: string;
  detail: string;
  muted: boolean;
  onMute: () => void;
  onChange: (value: number) => void;
  color: string;
}) {
  const fill = ((value - min) / (max - min)) * 100;
  const id = `lab-${layer}-slider`;

  return (
    <article
      className={`rounded-2xl border bg-slate-950/45 p-3 transition-opacity ${
        muted ? "border-slate-700 opacity-55" : "border-white/10"
      }`}
      style={{ ["--layer-color" as string]: color }}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="flex items-center gap-1.5 text-xs font-semibold text-slate-100">
            <span aria-hidden="true">{icon}</span>
            {label}
          </p>
          <p className="mt-1 font-mono text-sm font-semibold text-white">
            {Number.isInteger(step) ? value.toFixed(0) : value.toFixed(1)}{unit}
          </p>
          <p className="mt-0.5 truncate text-[9px] font-medium text-cyan-200">{readout}</p>
        </div>
        <button
          type="button"
          aria-pressed={muted}
          aria-label={`${muted ? "Unmute" : "Mute"} ${label} layer`}
          onClick={onMute}
          className={`shrink-0 rounded-lg border px-2 py-1 text-[9px] font-semibold transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-cyan-300 ${
            muted
              ? "border-amber-300/30 bg-amber-300/10 text-amber-100"
              : "border-white/10 bg-white/5 text-slate-300 hover:bg-white/10"
          }`}
        >
          {muted ? "Unmute" : "Mute"}
        </button>
      </div>

      <label htmlFor={id} className="sr-only">{label}</label>
      <input
        id={id}
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(event) => onChange(Number(event.target.value))}
        className="lab-range mt-3 h-2 w-full cursor-pointer appearance-none rounded-full"
        style={{
          "--layer-color": color,
          background: `linear-gradient(to right, ${color} 0%, ${color} ${fill}%, #334155 ${fill}%, #334155 100%)`,
          boxShadow: muted ? "none" : `0 0 12px ${color}30`,
        } as CSSProperties}
      />
      <p className="mt-2 min-h-[3.6rem] rounded-xl border border-white/5 bg-slate-950/60 p-2 text-[9px] leading-relaxed text-slate-300">
        {muted ? (
          <span className="font-semibold text-amber-200">Layer Muted — Isolated from mix</span>
        ) : detail}
      </p>
    </article>
  );
}

function LabVisualizer({
  playing,
  temperature,
  humidity,
  windSpeed,
}: {
  playing: boolean;
  temperature: number;
  humidity: number;
  windSpeed: number;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const hostRef = useRef<HTMLDivElement>(null);
  const tapRef = useRef<SoundscapeEnergyTap | null>(null);
  const paramsRef = useRef({ temperature, humidity, windSpeed });

  useEffect(() => {
    paramsRef.current = { temperature, humidity, windSpeed };
  }, [temperature, humidity, windSpeed]);

  useEffect(() => {
    if (!playing) return;
    let cancelled = false;
    void createSoundscapeEnergyTap()
      .then((tap) => {
        if (cancelled) {
          tap.dispose();
          return;
        }
        tapRef.current = tap;
      })
      .catch((error: unknown) => {
        if (!cancelled) console.warn("[SonificationLab] analyser unavailable:", error);
      });

    return () => {
      cancelled = true;
      tapRef.current?.dispose();
      tapRef.current = null;
    };
  }, [playing]);

  useEffect(() => {
    const canvas = canvasRef.current;
    const host = hostRef.current;
    const context = canvas?.getContext("2d");
    if (!canvas || !host || !context) return;

    let frameId = 0;
    let time = 0;
    let width = 0;
    let height = 0;
    const waveform = new Uint8Array(256);
    const spectrum = new Uint8Array(128);
    const resize = () => {
      const bounds = host.getBoundingClientRect();
      const dpr = window.devicePixelRatio || 1;
      width = bounds.width;
      height = bounds.height;
      canvas.width = Math.round(width * dpr);
      canvas.height = Math.round(height * dpr);
      context.setTransform(dpr, 0, 0, dpr, 0, 0);
    };
    const observer = new ResizeObserver(resize);
    observer.observe(host);
    resize();

    const draw = () => {
      frameId = requestAnimationFrame(draw);
      const params = paramsRef.current;
      const tempColor = temperatureColor(params.temperature);
      const humidityFactor = Math.min(1, Math.max(0, (params.humidity - 30) / 70));
      const windFactor = windToIntensity(params.windSpeed);
      const tap = tapRef.current;
      if (tap) tap.readData(waveform, spectrum);
      else {
        waveform.fill(128);
        spectrum.fill(0);
      }

      time += 0.012 + windFactor * 0.055;
      context.clearRect(0, 0, width, height);
      context.fillStyle = "rgba(2, 6, 23, 0.72)";
      context.fillRect(0, 0, width, height);

      const centerY = height * 0.53;
      const amplitude = height * (0.18 + humidityFactor * 0.13);
      context.beginPath();
      for (let x = 0; x <= width; x += 2) {
        const index = Math.floor((x / width) * (waveform.length - 1));
        const live = (waveform[index] - 128) / 128;
        const harmonic =
          Math.sin(x * 0.025 + time) * 0.55 +
          Math.sin(x * (0.045 + windFactor * 0.035) - time * (1 + windFactor)) *
            (0.2 + windFactor * 0.2);
        const y = centerY + (live * 0.45 + harmonic * 0.55) * amplitude;
        if (x === 0) context.moveTo(x, y);
        else context.lineTo(x, y);
      }
      context.strokeStyle = `rgb(${tempColor.r}, ${tempColor.g}, ${tempColor.b})`;
      context.lineWidth = 1.5 + humidityFactor * 2.3;
      context.shadowColor = `rgb(${tempColor.r}, ${tempColor.g}, ${tempColor.b})`;
      context.shadowBlur = 5 + humidityFactor * 18;
      context.stroke();
      context.shadowBlur = 0;

      const count = 64;
      const gap = 2;
      const barWidth = Math.max(1, (width - gap * (count - 1)) / count);
      const maxBarHeight = height * 0.28;
      for (let i = 0; i < count; i++) {
        const bin = spectrum[Math.min(spectrum.length - 1, i * 2)] / 255;
        const barHeight = bin * maxBarHeight;
        context.fillStyle = `rgba(${tempColor.r}, ${tempColor.g}, ${tempColor.b}, ${0.22 + bin * 0.72})`;
        context.fillRect(i * (barWidth + gap), height - barHeight - 5, barWidth, barHeight);
      }
    };

    frameId = requestAnimationFrame(draw);
    return () => {
      cancelAnimationFrame(frameId);
      observer.disconnect();
    };
  }, [playing]);

  return (
    <div
      ref={hostRef}
      className="relative h-28 overflow-hidden rounded-2xl border border-cyan-300/15 bg-slate-950/70 sm:h-32"
      aria-label="Live acoustic waveform and harmonic spectrum"
      role="img"
    >
      <canvas ref={canvasRef} className="absolute inset-0 h-full w-full" />
      <div className="pointer-events-none absolute left-3 top-2 flex items-center gap-2">
        <span className={`h-1.5 w-1.5 rounded-full ${playing ? "animate-pulse bg-emerald-300" : "bg-slate-500"}`} />
        <span className="text-[9px] font-semibold uppercase tracking-[0.18em] text-slate-400">
          {playing ? "Live waveform · spectrum" : "Waveform preview · press play for live audio"}
        </span>
      </div>
    </div>
  );
}

function temperatureColor(temperature: number) {
  const stops = [
    { temperature: -40, color: [56, 189, 248] },
    { temperature: 15, color: [52, 211, 153] },
    { temperature: 50, color: [251, 146, 60] },
  ];
  const bounded = Math.min(50, Math.max(-40, temperature));
  const start = bounded <= 15 ? stops[0] : stops[1];
  const end = bounded <= 15 ? stops[1] : stops[2];
  const amount = (bounded - start.temperature) / (end.temperature - start.temperature);
  return {
    r: Math.round(start.color[0] + (end.color[0] - start.color[0]) * amount),
    g: Math.round(start.color[1] + (end.color[1] - start.color[1]) * amount),
    b: Math.round(start.color[2] + (end.color[2] - start.color[2]) * amount),
  };
}
