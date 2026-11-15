"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  humidityStyle,
  humidityToRichness,
  midiToNoteName,
  temperatureToMidi,
  windToArpInterval,
  windToIntensity,
  windStyle,
} from "@/lib/sonification";
import {
  playMysteryAudio,
  setMysteryAudioLayers,
  stopAudio,
} from "@/lib/audioEngine";
import ListenToEarthButton from "@/components/ListenToEarthButton";
import type { SoundLayer, SoundscapeLayers } from "@/lib/soundscape";
import {
  chooseRoundTarget,
  GEOGUESSR_ROUNDS,
  rememberRoundTarget,
  telemetryHint,
  type GeoGuessrRound,
  type GeoGuessrTarget,
} from "@/lib/gameData";
import type { WeatherData } from "@/types/weather";

export interface GeoGuessrResult {
  lat: number;
  lon: number;
  distanceKm: number;
  points: number;
}

export interface GeoGuessrPin {
  lat: number;
  lon: number;
}

interface AcousticGeoGuessrProps {
  onClose: () => void;
  onLoadTarget: (target: GeoGuessrTarget) => Promise<WeatherData | null>;
  onRoundChanged: (
    index: number,
    round: GeoGuessrRound,
    target: GeoGuessrTarget,
    weather: WeatherData | null,
  ) => void;
  onOpenLab: (hint: string | null) => void;
  onHintChange: (hint: string | null) => void;
  playerWeather: WeatherData | null;
  selectedWeather: WeatherData | null;
  draftPin: GeoGuessrPin | null;
  onLockIn: () => void;
  result: GeoGuessrResult | null;
  score: number;
  onRestart: () => void;
  showClimateOverlay: boolean;
  onToggleClimateOverlay: () => void;
}

export default function AcousticGeoGuessr({
  onClose,
  onLoadTarget,
  onRoundChanged,
  onOpenLab,
  onHintChange,
  playerWeather,
  selectedWeather,
  draftPin,
  onLockIn,
  result,
  score,
  onRestart,
  showClimateOverlay,
  onToggleClimateOverlay,
}: AcousticGeoGuessrProps) {
  const [firstTarget] = useState(() => chooseRoundTarget(GEOGUESSR_ROUNDS[0]));
  const [roundIndex, setRoundIndex] = useState(0);
  const [target, setTarget] = useState<GeoGuessrTarget | null>(firstTarget);
  const [telemetry, setTelemetry] = useState<WeatherData | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [secondsLeft, setSecondsLeft] = useState(30);
  const [complete, setComplete] = useState(false);
  const requestId = useRef(0);
  const cancelledRef = useRef(false);

  const loadRound = useCallback(async (nextIndex: number) => {
    const round = GEOGUESSR_ROUNDS[nextIndex];
    if (!round) {
      setComplete(true);
      return;
    }

    const request = ++requestId.current;
    const nextTarget = chooseRoundTarget(round);
    rememberRoundTarget(nextTarget);
    setRoundIndex(nextIndex);
    setTarget(nextTarget);
    setTelemetry(null);
    setLoading(true);
    setLoadError(null);
    setSecondsLeft(30);
    setComplete(false);
    onRoundChanged(nextIndex, round, nextTarget, null);

    try {
      const weather = await onLoadTarget(nextTarget);
      if (requestId.current !== request || cancelledRef.current) return;
      if (!weather) {
        setLoadError("The live signal could not be loaded. Try this round again.");
        setLoading(false);
        return;
      }
      setTelemetry(weather);
      setLoading(false);
      onRoundChanged(nextIndex, round, nextTarget, weather);
    } catch (error) {
      if (requestId.current !== request || cancelledRef.current) return;
      console.error("[AcousticGeoGuessr] target weather load failed:", error);
      setLoadError("The live signal could not be loaded. Try this round again.");
      setLoading(false);
    }
  }, [onLoadTarget, onRoundChanged]);

  useEffect(() => {
    let cancelled = false;
    cancelledRef.current = false;
    const round = GEOGUESSR_ROUNDS[0];
    const initialTarget = firstTarget;
    rememberRoundTarget(initialTarget);
    const request = ++requestId.current;
    onRoundChanged(0, round, initialTarget, null);
    void onLoadTarget(initialTarget).then(
      (weather) => {
        if (cancelled || requestId.current !== request) return;
        if (!weather) {
          setLoadError("The live signal could not be loaded. Try this round again.");
          setLoading(false);
          return;
        }
        setTelemetry(weather);
        setLoading(false);
        onRoundChanged(0, round, initialTarget, weather);
      },
      (error: unknown) => {
        if (cancelled || requestId.current !== request) return;
        console.error("[AcousticGeoGuessr] target weather load failed:", error);
        setLoadError("The live signal could not be loaded. Try this round again.");
        setLoading(false);
      },
    );
    return () => {
      cancelled = true;
      cancelledRef.current = true;
      stopAudio();
    };
  }, [firstTarget, onLoadTarget, onRoundChanged]);

  useEffect(() => {
    if (loading || secondsLeft <= 0 || result || complete) return;
    const timer = window.setTimeout(
      () => setSecondsLeft((seconds) => Math.max(0, seconds - 1)),
      1000,
    );
    return () => window.clearTimeout(timer);
  }, [complete, loading, result, secondsLeft]);

  const hint = telemetry && secondsLeft === 0 ? telemetryHint(telemetry) : null;
  const currentRound = GEOGUESSR_ROUNDS[roundIndex];

  useEffect(() => {
    onHintChange(hint && !result ? hint : null);
  }, [hint, onHintChange, result]);

  const openLab = useCallback(() => {
    if (telemetry) onOpenLab(hint);
  }, [hint, onOpenLab, telemetry]);

  if (complete) {
    return (
      <>
        <MissionPanel onClose={onClose}>
          <div className="rounded-2xl border border-emerald-300/20 bg-emerald-400/5 p-4 text-center">
            <p className="text-[9px] font-semibold uppercase tracking-[0.2em] text-emerald-300">Transmission complete</p>
            <h2 className="mt-2 text-xl font-semibold text-white">Results</h2>
            <p className="mt-2 text-sm text-slate-300">Final score</p>
            <p className="mt-1 font-mono text-3xl font-bold text-emerald-200">{score.toLocaleString()}</p>
            <button type="button" onClick={onRestart} className="mt-4 w-full rounded-xl bg-emerald-500/80 px-3 py-2 text-xs font-semibold text-white hover:bg-emerald-400">
              Play Again
            </button>
          </div>
        </MissionPanel>
        <PlayerPanel
          mysteryWeather={playerWeather}
          selectedWeather={selectedWeather}
          revealedAnswer={
            result && target && telemetry ? { target, weather: telemetry } : null
          }
        />
      </>
    );
  }

  return (
    <>
      <MissionPanel onClose={onClose}>
        <header className="flex items-start justify-between gap-2">
          <div>
            <p className="text-[9px] font-semibold uppercase tracking-[0.2em] text-emerald-300">Acoustic GeoGuessr</p>
            <h1 className="mt-1 text-lg font-semibold text-white">Mission Briefing</h1>
          </div>
          <div className="rounded-xl border border-slate-700/70 bg-slate-950/50 px-3 py-2 text-right">
            <p className="text-[8px] uppercase tracking-wider text-slate-400">Score</p>
            <p className="font-mono text-sm font-bold text-emerald-200">{score.toLocaleString()}</p>
          </div>
        </header>

        <div className="rounded-2xl border border-slate-700/70 bg-slate-950/45 p-3">
          <div className="flex items-center justify-between gap-2">
            <p className="text-[9px] font-semibold uppercase tracking-wider text-slate-400">
              Round {roundIndex + 1} of {GEOGUESSR_ROUNDS.length}
            </p>
            <span className="rounded-full bg-cyan-400/10 px-2 py-1 text-[8px] font-semibold uppercase text-cyan-200">
              {currentRound.difficulty}
            </span>
          </div>
          <h2 className="mt-1 text-sm font-semibold text-white">{currentRound.title}</h2>
          <p className="mt-1 text-[10px] leading-relaxed text-slate-300">{currentRound.objective}</p>
          <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-slate-800">
            <div className="h-full rounded-full bg-gradient-to-r from-emerald-400 to-cyan-400 transition-[width] duration-1000" style={{ width: `${((roundIndex + 1) / GEOGUESSR_ROUNDS.length) * 100}%` }} />
          </div>
        </div>

        <div aria-live="polite" aria-busy={loading} className="rounded-2xl border border-cyan-300/15 bg-cyan-400/5 p-3">
          <p className="text-[9px] font-semibold uppercase tracking-wider text-cyan-200">Mystery transmission</p>
          <p className="mt-1 text-[10px] leading-relaxed text-slate-300">
            {loading ? "Tuning the live climate signal…" : "Listen to the sound, explore the map, then click your best guess."}
          </p>
          {!result && !loading && (
            <p className={`mt-2 font-mono text-[10px] ${secondsLeft === 0 ? "text-emerald-200" : "text-slate-400"}`}>
              {secondsLeft === 0 ? "Telemetry hint unlocked in Sonification Lab" : `Lab hint unlocks in ${secondsLeft}s`}
            </p>
          )}
          {loadError && (
            <div className="mt-2">
              <p role="alert" className="text-[10px] text-rose-300">{loadError}</p>
              <button type="button" onClick={() => void loadRound(roundIndex)} className="mt-2 text-[9px] font-semibold text-cyan-200 underline underline-offset-2">
                Retry signal
              </button>
            </div>
          )}
        </div>

        {result && target && telemetry && (
          <div aria-live="polite" className="rounded-2xl border border-emerald-300/20 bg-emerald-400/5 p-3">
            <p className="text-[9px] font-semibold uppercase tracking-wider text-emerald-300">Answer revealed · {target.region}</p>
            <h3 className="mt-1 text-sm font-semibold text-white">{target.name}</h3>
            <p className="mt-1 text-[10px] leading-relaxed text-slate-300">{target.description}</p>
            <dl className="mt-2 grid grid-cols-3 gap-1.5">
              <WeatherReadout label="Temperature" value={`${telemetry.temperature.toFixed(1)}°C`} />
              <WeatherReadout label="Humidity" value={`${Math.round(telemetry.humidity)}%`} />
              <WeatherReadout label="Wind" value={`${telemetry.windSpeed.toFixed(1)} m/s`} />
            </dl>
            <section
              aria-labelledby="sound-learning-heading"
              className="mt-3 space-y-2 rounded-xl border border-cyan-300/15 bg-slate-950/35 p-2.5"
            >
              <h4
                id="sound-learning-heading"
                className="text-[9px] font-semibold uppercase tracking-wider text-cyan-200"
              >
                How the climate shaped the sound
              </h4>
              <LearningCue
                label="Temperature"
                value={`${telemetry.temperature.toFixed(1)}°C`}
                detail={temperatureLearningCue(telemetry.temperature)}
                color="text-sky-200"
              />
              <LearningCue
                label="Humidity"
                value={`${Math.round(telemetry.humidity)}%`}
                detail={humidityLearningCue(telemetry.humidity)}
                color="text-emerald-200"
              />
              <LearningCue
                label="Wind"
                value={`${telemetry.windSpeed.toFixed(1)} m/s`}
                detail={windLearningCue(telemetry.windSpeed)}
                color="text-amber-200"
              />
              <div className="rounded-lg border border-white/5 bg-white/[0.03] p-2">
                <p className="text-[8px] font-semibold uppercase tracking-wider text-slate-400">
                  Planetary pattern · {latitudeBandLabel(target.lat)}
                </p>
                <p className="mt-1 text-[9px] leading-relaxed text-slate-300">
                  {latitudeClimateCue(target.lat)}
                </p>
                <p className="mt-1 text-[9px] leading-relaxed text-cyan-100/80">
                  At this location, the measured {humidityStyle(telemetry.humidity).toLowerCase()} humidity
                  becomes {humidityCueForStyle(telemetry.humidity)}, while {windStyle(telemetry.windSpeed).toLowerCase()} wind
                  sets the sound&apos;s {windCueForStyle(telemetry.windSpeed)}.
                </p>
              </div>
              <p className="text-[9px] leading-relaxed text-slate-500">
                Latitude describes broad climate tendencies, not today&apos;s weather. Season, elevation,
                nearby oceans, terrain, and storms can change local conditions. These cues describe the
                full mix; use Solo/Mute in the player to replay individual layers.
              </p>
            </section>
            <div className="mt-2 flex items-center justify-between gap-2 text-[10px]">
              <span className="text-slate-400">Distance: <strong className="text-white">{Math.round(result.distanceKm).toLocaleString()} km</strong></span>
              <span className="font-semibold text-emerald-200">+{result.points.toLocaleString()} pts</span>
            </div>
            <button type="button" onClick={() => void loadRound(roundIndex + 1)} className="mt-3 w-full rounded-xl bg-emerald-500/80 px-3 py-2 text-xs font-semibold text-white transition-colors hover:bg-emerald-400">
              {roundIndex + 1 === GEOGUESSR_ROUNDS.length ? "Finish Game" : "Continue"}
            </button>
          </div>
        )}

        {!result && (
          <div className="rounded-2xl border border-slate-700/70 bg-slate-950/45 p-3">
            <p className="text-[9px] font-semibold uppercase tracking-wider text-slate-400">
              Your answer
            </p>
            <p className="mt-1 text-[10px] text-slate-300">
              {draftPin
                ? `Pin set at ${draftPin.lat.toFixed(2)}°, ${draftPin.lon.toFixed(2)}°.`
                : "Click the map to place your guess."}
            </p>
            <button
              type="button"
              onClick={onLockIn}
              disabled={!draftPin || loading || !telemetry}
              className="mt-2 w-full rounded-xl bg-emerald-500/80 px-3 py-2 text-xs font-semibold text-white transition-colors hover:bg-emerald-400 disabled:cursor-not-allowed disabled:opacity-40"
            >
              Lock In Answer
            </button>
          </div>
        )}

        <div className="grid grid-cols-1 gap-2">
          <button type="button" onClick={openLab} disabled={!telemetry} className="rounded-xl border border-cyan-300/25 bg-cyan-400/10 px-2 py-2.5 text-[10px] font-semibold text-cyan-100 transition-colors hover:bg-cyan-400/20 disabled:opacity-40">
            ⚗ Sonification Lab
          </button>
          <button
            type="button"
            aria-pressed={showClimateOverlay}
            onClick={onToggleClimateOverlay}
            className="flex items-center justify-between rounded-xl border border-emerald-300/20 bg-emerald-400/5 px-3 py-2 text-[10px] font-semibold text-slate-200 transition-colors hover:border-emerald-200/40 hover:bg-emerald-400/10"
          >
            <span>Climate Bands</span>
            <span className={showClimateOverlay ? "text-emerald-300" : "text-slate-400"}>
              [{showClimateOverlay ? "ON" : "OFF"}]
            </span>
          </button>
        </div>
      </MissionPanel>

      <PlayerPanel
        mysteryWeather={playerWeather}
        selectedWeather={selectedWeather}
        revealedAnswer={
          result && target && telemetry ? { target, weather: telemetry } : null
        }
      />
    </>
  );

}

function LearningCue({
  label,
  value,
  detail,
  color,
}: {
  label: string;
  value: string;
  detail: string;
  color: string;
}) {
  return (
    <p className="text-[9px] leading-relaxed text-slate-300">
      <span className={`font-semibold ${color}`}>{label} · {value}: </span>
      {detail}
    </p>
  );
}

function temperatureLearningCue(temperature: number): string {
  const rootNote = midiToNoteName(temperatureToMidi(temperature));
  const register =
    temperature < 0
      ? "a deep sub-bass root"
      : temperature >= 30
        ? "a bright high-register root"
        : "a balanced mid-range root";
  return `mapped to ${rootNote}, ${register}.`;
}

function humidityLearningCue(humidity: number): string {
  const richness = humidityToRichness(humidity);
  const harmonics =
    richness < 0.2
      ? "a sparse, dry harmonic layer"
      : richness < 0.6
        ? "a fuller fifth-and-octave layer"
        : "lush upper harmonics and 9th chords";
  return `sets harmonic richness, adding ${harmonics}.`;
}

function windLearningCue(windSpeed: number): string {
  const intensity = windToIntensity(windSpeed);
  const motion =
    intensity < 0.2
      ? "slow, spacious pulses"
      : intensity < 0.65
        ? "steady rhythmic plucks"
        : "rapid arpeggio pulses and brighter filtered noise";
  return `drives ${motion}; plucks repeat about every ${windToArpInterval(windSpeed).toFixed(2)} s.`;
}

function latitudeBandLabel(latitude: number): string {
  const absoluteLatitude = Math.abs(latitude);
  if (absoluteLatitude < 10) return "Equatorial";
  if (absoluteLatitude < 23.5) return "Tropical trade-wind belt";
  if (absoluteLatitude < 35) return "Subtropical";
  if (absoluteLatitude < 60) return "Mid-latitude";
  return "Polar";
}

function latitudeClimateCue(latitude: number): string {
  const absoluteLatitude = Math.abs(latitude);
  if (absoluteLatitude < 10) {
    return "Strong sunlight keeps long-term average temperatures warm. Near the shifting equatorial rain belt (ITCZ), warm air rises and often brings clouds and rain; surface winds can be light near convergence, though storms create local gusts.";
  }
  if (absoluteLatitude < 23.5) {
    return "Tropical trade winds generally flow toward the equatorial low-pressure belt. Warmth is common, while rainfall and humidity vary with ocean, land, and seasonal rain belts.";
  }
  if (absoluteLatitude < 35) {
    return "Sinking air in the subtropical circulation helps create many of the world’s dry zones. Deserts are common, but coasts, monsoons, and mountains can make local conditions much wetter or windier.";
  }
  if (absoluteLatitude < 60) {
    return "Changing sunlight brings stronger seasonal temperature swings. The prevailing westerlies and passing fronts often make wind and moisture variable from day to day.";
  }
  return "Low-angle sunlight contributes to cold long-term averages, and cold air holds little water vapor. Local winds still depend on pressure patterns, coastlines, and terrain; ice-sheet outflows can strengthen them.";
}

function humidityCueForStyle(humidity: number): string {
  const richness = humidityToRichness(humidity);
  if (richness < 0.2) return "a sparse, dry harmonic layer";
  if (richness < 0.6) return "a fuller fifth-and-octave layer";
  return "lush upper harmonics and 9th chords";
}

function windCueForStyle(windSpeed: number): string {
  const intensity = windToIntensity(windSpeed);
  if (intensity < 0.2) return "slow, spacious pulses";
  if (intensity < 0.65) return "steady rhythmic plucks";
  return "rapid arpeggio pulses and brighter filtered noise";
}

function MissionPanel({
  onClose,
  children,
}: {
  onClose: () => void;
  children: React.ReactNode;
}) {
  return (
    <aside className="pointer-events-none absolute inset-y-0 left-0 z-10 w-[min(24rem,88vw)]">
      <section className="pointer-events-auto flex h-full w-full flex-col gap-3 overflow-y-auto border-r border-slate-700/70 bg-slate-900/85 p-4 pt-5 shadow-2xl backdrop-blur-md">
        {children}
        <button type="button" onClick={onClose} className="mt-auto rounded-xl border border-slate-600/70 bg-slate-800/80 px-3 py-2 text-xs font-medium text-slate-200 transition-colors hover:bg-slate-700">
          Exit Game Mode
        </button>
      </section>
    </aside>
  );
}

function PlayerPanel({
  mysteryWeather,
  selectedWeather,
  revealedAnswer,
}: {
  mysteryWeather?: WeatherData | null;
  selectedWeather: WeatherData | null;
  revealedAnswer: { target: GeoGuessrTarget; weather: WeatherData } | null;
}) {
  const [playing, setPlaying] = useState(false);
  const [starting, setStarting] = useState(false);
  const [layers, setLayers] = useState<SoundscapeLayers>({
    muted: { temperature: false, humidity: false, wind: false },
    solo: null,
  });
  const mounted = useRef(true);
  const playingRef = useRef(false);
  const activeWeather = mysteryWeather;
  const panelRef = useRef<HTMLDivElement>(null);
  const dragRef = useRef<{
    pointerId: number;
    startX: number;
    startY: number;
    offsetX: number;
    offsetY: number;
    left: number;
    top: number;
    width: number;
    height: number;
  } | null>(null);
  const [offset, setOffset] = useState({ x: 0, y: 0 });

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      stopAudio();
    };
  }, []);

  useEffect(() => {
    playingRef.current = playing;
  }, [playing]);

  useEffect(() => {
    setMysteryAudioLayers(layers);
  }, [layers]);

  useEffect(() => {
    if (!mysteryWeather) return;
    if (playingRef.current) {
      void playMysteryAudio(mysteryWeather, () => {
        if (!mounted.current) return;
        playingRef.current = false;
        setPlaying(false);
        setStarting(false);
      }).catch((error: unknown) => {
        console.error("[AcousticGeoGuessr] could not update mystery audio:", error);
        if (mounted.current) setPlaying(false);
      });
    }
  }, [mysteryWeather]);

  async function toggle() {
    if (playing) {
      stopAudio();
      playingRef.current = false;
      setPlaying(false);
      return;
    }
    if (!activeWeather) return;
    setStarting(true);
    playingRef.current = true;
    setPlaying(true);
    try {
      await playMysteryAudio(activeWeather, () => {
        if (!mounted.current) return;
        playingRef.current = false;
        setPlaying(false);
        setStarting(false);
      });
    } catch (error) {
      console.error("[AcousticGeoGuessr] mystery audio failed:", error);
      playingRef.current = false;
      if (mounted.current) setPlaying(false);
    } finally {
      if (mounted.current) setStarting(false);
    }
  }

  function toggleMute(layer: SoundLayer) {
    setLayers((current) => ({
      ...current,
      muted: { ...current.muted, [layer]: !current.muted[layer] },
    }));
  }

  function toggleSolo(layer: SoundLayer) {
    setLayers((current) => ({
      ...current,
      solo: current.solo === layer ? null : layer,
    }));
  }

  function handlePanelPointerDown(event: React.PointerEvent<HTMLDivElement>) {
    if ((event.target as HTMLElement).closest("button")) return;
    const bounds = panelRef.current?.getBoundingClientRect();
    if (!bounds) return;
    dragRef.current = {
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      offsetX: offset.x,
      offsetY: offset.y,
      left: bounds.left,
      top: bounds.top,
      width: bounds.width,
      height: bounds.height,
    };
    event.currentTarget.setPointerCapture(event.pointerId);
  }

  function handlePanelPointerMove(event: React.PointerEvent<HTMLDivElement>) {
    const drag = dragRef.current;
    if (!drag || drag.pointerId !== event.pointerId) return;
    const maxX = Math.max(0, window.innerWidth - drag.left - drag.width);
    const minX = Math.min(0, -drag.left);
    const maxY = Math.max(0, window.innerHeight - drag.top - drag.height);
    const minY = Math.min(0, -drag.top);
    setOffset({
      x: Math.min(maxX, Math.max(minX, drag.offsetX + event.clientX - drag.startX)),
      y: Math.min(maxY, Math.max(minY, drag.offsetY + event.clientY - drag.startY)),
    });
  }

  function handlePanelPointerUp(event: React.PointerEvent<HTMLDivElement>) {
    if (dragRef.current?.pointerId !== event.pointerId) return;
    dragRef.current = null;
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
  }

  return (
    <div
      ref={panelRef}
      onPointerDown={handlePanelPointerDown}
      onPointerMove={handlePanelPointerMove}
      onPointerUp={handlePanelPointerUp}
      onPointerCancel={handlePanelPointerUp}
      className="pointer-events-auto absolute top-4 right-4 z-40 w-[min(21rem,calc(100vw-2rem))] cursor-grab touch-none active:cursor-grabbing"
      style={{ transform: `translate(${offset.x}px, ${offset.y}px)` }}
    >
      <section className="pointer-events-auto rounded-2xl border border-slate-700/80 bg-slate-900/90 p-3 shadow-2xl backdrop-blur-lg">
        <div className="mb-3 rounded-xl border border-slate-700/60 bg-slate-950/50 p-2.5">
          <p className="text-[8px] font-semibold uppercase tracking-[0.18em] text-slate-400">
            Selected location
          </p>
          <p className="mt-1 truncate text-sm font-semibold text-white">
            {selectedWeather?.location ?? "Click the map to select a place"}
          </p>
          {selectedWeather && (
            <>
              <dl className="mt-2 grid grid-cols-3 gap-1.5">
                <WeatherReadout label="Temperature" value={`${selectedWeather.temperature.toFixed(1)}°C`} />
                <WeatherReadout label="Humidity" value={`${Math.round(selectedWeather.humidity)}%`} />
                <WeatherReadout label="Wind" value={`${selectedWeather.windSpeed.toFixed(1)} m/s`} />
              </dl>
              <div className="mt-2">
                <ListenToEarthButton
                  temperature={selectedWeather.temperature}
                  humidity={selectedWeather.humidity}
                  windSpeed={selectedWeather.windSpeed}
                  unit={selectedWeather.unit}
                  onPlaybackChange={() => undefined}
                />
              </div>
            </>
          )}
        </div>
        {revealedAnswer && (
          <div className="mb-3 rounded-xl border border-emerald-300/20 bg-emerald-400/5 p-2.5">
            <p className="text-[8px] font-semibold uppercase tracking-[0.18em] text-emerald-300">
              Answer revealed · {revealedAnswer.target.region}
            </p>
            <p className="mt-1 truncate text-sm font-semibold text-white">
              {revealedAnswer.target.name}
            </p>
            <dl className="mt-2 grid grid-cols-3 gap-1.5">
              <WeatherReadout label="Temperature" value={`${revealedAnswer.weather.temperature.toFixed(1)}°C`} />
              <WeatherReadout label="Humidity" value={`${Math.round(revealedAnswer.weather.humidity)}%`} />
              <WeatherReadout label="Wind" value={`${revealedAnswer.weather.windSpeed.toFixed(1)} m/s`} />
            </dl>
          </div>
        )}
        <div className="flex items-center justify-between gap-2">
          <div>
            <p className="text-[9px] font-semibold uppercase tracking-wider text-emerald-300">Mystery audio</p>
            <p className="mt-0.5 text-[10px] text-slate-300">Hidden origin · looping climate signal</p>
          </div>
          <button type="button" onClick={() => void toggle()} disabled={!activeWeather || starting} aria-pressed={playing} className={`rounded-full px-3 py-2 text-[10px] font-semibold text-white disabled:opacity-40 ${playing ? "bg-rose-500/80 hover:bg-rose-400" : "bg-emerald-500/80 hover:bg-emerald-400"}`}>
            {starting ? "Starting…" : playing ? "Pause" : "Play"}
          </button>
        </div>
        <div className="mt-3 border-t border-slate-700/70 pt-3">
          <div className="mb-2 flex items-center justify-between">
            <p className="text-[9px] font-semibold uppercase tracking-wider text-slate-300">Sound layer isolation</p>
            {(layers.solo !== null || Object.values(layers.muted).some(Boolean)) && (
              <button
                type="button"
                onClick={() => setLayers({ muted: { temperature: false, humidity: false, wind: false }, solo: null })}
                className="text-[9px] font-medium text-cyan-200 hover:text-white"
              >
                Reset
              </button>
            )}
          </div>
          <div className="grid grid-cols-3 gap-1.5">
            <LayerControl layer="temperature" label="Temperature" layers={layers} onMute={toggleMute} onSolo={toggleSolo} />
            <LayerControl layer="humidity" label="Humidity" layers={layers} onMute={toggleMute} onSolo={toggleSolo} />
            <LayerControl layer="wind" label="Wind" layers={layers} onMute={toggleMute} onSolo={toggleSolo} />
          </div>
        </div>
      </section>
    </div>
  );
}

function WeatherReadout({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0 rounded-lg bg-slate-800/70 px-1.5 py-1.5">
      <dt className="truncate text-[7px] font-medium uppercase tracking-wide text-slate-400">
        {label}
      </dt>
      <dd className="mt-0.5 truncate font-mono text-[10px] font-semibold tabular-nums text-slate-100">
        {value}
      </dd>
    </div>
  );
}

function LayerControl({
  layer,
  label,
  layers,
  onMute,
  onSolo,
}: {
  layer: SoundLayer;
  label: string;
  layers: SoundscapeLayers;
  onMute: (layer: SoundLayer) => void;
  onSolo: (layer: SoundLayer) => void;
}) {
  const isMuted = layers.muted[layer];
  const isSolo = layers.solo === layer;
  return (
    <div className={`rounded-xl border p-1.5 ${isMuted ? "border-slate-700/50 bg-slate-950/60 opacity-60" : isSolo ? "border-cyan-300/30 bg-cyan-400/10" : "border-slate-700/50 bg-slate-800/70"}`}>
      <p className="mb-1 truncate text-center text-[8px] font-semibold text-slate-200">{label}</p>
      <div className="flex gap-1">
        <button
          type="button"
          onClick={() => onSolo(layer)}
          aria-pressed={isSolo}
          aria-label={`${isSolo ? "Unsolo" : "Solo"} ${label} layer`}
          className={`flex-1 rounded-md px-1 py-1 text-[8px] font-semibold ${isSolo ? "bg-cyan-400/25 text-cyan-100" : "bg-slate-950/60 text-slate-400 hover:text-white"}`}
        >
          {isSolo ? "Soloed" : "Solo"}
        </button>
        <button
          type="button"
          onClick={() => onMute(layer)}
          aria-pressed={isMuted}
          aria-label={`${isMuted ? "Unmute" : "Mute"} ${label} layer`}
          className={`flex-1 rounded-md px-1 py-1 text-[8px] font-semibold ${isMuted ? "bg-rose-500/25 text-rose-100" : "bg-slate-950/60 text-slate-400 hover:text-white"}`}
        >
          {isMuted ? "Muted" : "Mute"}
        </button>
      </div>
    </div>
  );
}
