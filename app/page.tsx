"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import AcousticGeoGuessr, {
  type GeoGuessrPin,
  type GeoGuessrResult,
} from "@/components/AcousticGeoGuessr";
import CompareModal from "@/components/CompareModal";
import GuideDock, { type ExplorationPlace } from "@/components/GuideDock";
import LocationSearch from "@/components/LocationSearch";
import SonificationLab from "@/components/SonificationLab";
import WeatherPanel from "@/components/WeatherPanel";
import WorldMap from "@/components/WorldMap";
import { stopAudio } from "@/lib/audioEngine";
import {
  playCaseCrackedChime,
  stopSoundscape,
  type LabSoundscapeInput,
  type SoundscapeLayers,
} from "@/lib/soundscape";
import {
  haversineDistanceKm,
  scoreGuess,
  type GeoGuessrRound,
  type GeoGuessrTarget,
} from "@/lib/gameData";
import type { GeoSearchResult, WeatherData } from "@/types/weather";

const INITIAL_LOCATION = {
  name: "Kuala Lumpur",
  lat: 3.139,
  lon: 101.6869,
};

/** Compare flow states: picking A, picking B, or comparing (modal open). */
type ComparePhase = "off" | "pickA" | "pickB" | "comparing";

export default function Home() {
  const [weather, setWeather] = useState<WeatherData | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [layers] = useState<SoundscapeLayers>({
    muted: { temperature: false, humidity: false, wind: false },
    solo: null,
  });
  const [activePlace, setActivePlace] = useState<ExplorationPlace | null>(null);
  const [gameMode, setGameMode] = useState(false);
  const [showClimateOverlay, setShowClimateOverlay] = useState(false);
  const [gameTarget, setGameTarget] = useState<GeoGuessrTarget | null>(null);
  const [gameTelemetry, setGameTelemetry] = useState<WeatherData | null>(null);
  const [gameSelectedWeather, setGameSelectedWeather] = useState<WeatherData | null>(null);
  const [gameSignalReady, setGameSignalReady] = useState(false);
  const [gameDraftPin, setGameDraftPin] = useState<GeoGuessrPin | null>(null);
  const [gameGuess, setGameGuess] = useState<GeoGuessrResult | null>(null);
  const [gameScore, setGameScore] = useState(0);
  const [gameSessionKey, setGameSessionKey] = useState(0);
  const [labValues, setLabValues] = useState<LabSoundscapeInput | null>(null);
  const [labGameHint, setLabGameHint] = useState<string | null>(null);

  const [comparePhase, setComparePhase] = useState<ComparePhase>("off");
  const [labOpen, setLabOpen] = useState(false);
  const [toolsMenuOpen, setToolsMenuOpen] = useState(false);
  const [slotA, setSlotA] = useState<WeatherData | null>(null);
  const [slotB, setSlotB] = useState<WeatherData | null>(null);
  const selectedLocationRequest = useRef(0);

  useEffect(() => {
    if (!toolsMenuOpen) return;

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") setToolsMenuOpen(false);
    }

    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [toolsMenuOpen]);

  const fetchWeatherFor = useCallback(
    async (lat: number, lon: number, name: string): Promise<WeatherData | null> => {
      setIsLoading(true);
      setError(null);

      try {
        const params = new URLSearchParams({
          lat: String(lat),
          lon: String(lon),
          name,
        });
        const res = await fetch(`/api/weather?${params}`);
        const json = (await res.json()) as {
          weather?: WeatherData;
          error?: string;
        };

        if (!res.ok || !json.weather) {
          setError(
            json.error ?? "Failed to fetch weather data. Please try again.",
          );
          return null;
        }

        return json.weather;
      } catch {
        setError("Could not reach the weather service. Please try again.");
        return null;
      } finally {
        setIsLoading(false);
      }
    },
    [],
  );

  useEffect(() => {
    let cancelled = false;
    const loadInitialWeather = async () => {
      await Promise.resolve();
      const snapshot = await fetchWeatherFor(
        INITIAL_LOCATION.lat,
        INITIAL_LOCATION.lon,
        INITIAL_LOCATION.name,
      );
      if (!cancelled && snapshot) setWeather(snapshot);
    };
    void loadInitialWeather();
    return () => {
      cancelled = true;
    };
  }, [fetchWeatherFor]);

  const resolveName = useCallback(async (lat: number, lon: number) => {
    try {
      const res = await fetch(`/api/reverse-geocode?lat=${lat}&lon=${lon}`);
      const json = (await res.json()) as { name?: string };
      return json.name ?? `${lat.toFixed(2)}, ${lon.toFixed(2)}`;
    } catch {
      return `${lat.toFixed(2)}, ${lon.toFixed(2)}`;
    }
  }, []);

  /** Feed one location into whichever consumer is active (dashboard or compare). */
  const pushLocation = useCallback(
    async (lat: number, lon: number, name?: string) => {
      const label = name ?? (await resolveName(lat, lon));

      if (comparePhase === "pickA" || comparePhase === "pickB") {
        const result = await fetchWeatherFor(lat, lon, label);
        if (!result) return;
        if (comparePhase === "pickA") {
          setSlotA(result);
          setComparePhase("pickB");
        } else {
          setSlotB(result);
          setComparePhase("comparing");
        }
        return;
      }

      // Normal mode: update the dashboard.
      const result = await fetchWeatherFor(lat, lon, label);
      if (result) {
        setWeather(result);
        setActivePlace(null);
      }
    },
    [comparePhase, fetchWeatherFor, resolveName],
  );

  const handleSelect = useCallback(
    (result: GeoSearchResult) =>
      pushLocation(result.lat, result.lon, result.name),
    [pushLocation],
  );

  const handleMapPick = useCallback(
    (lat: number, lon: number) => {
      if (!gameMode) {
        void pushLocation(lat, lon);
        return;
      }
      if (!gameTarget || !gameSignalReady || !gameTelemetry || gameGuess) return;
      setGameDraftPin({ lat, lon });
      setGameSelectedWeather(null);
      const requestId = ++selectedLocationRequest.current;
      void (async () => {
        const name = await resolveName(lat, lon);
        const selected = await fetchWeatherFor(lat, lon, name);
        if (selectedLocationRequest.current === requestId && selected) {
          setGameSelectedWeather(selected);
        }
      })();
    },
    [
      fetchWeatherFor,
      gameGuess,
      gameMode,
      gameSignalReady,
      gameTarget,
      gameTelemetry,
      pushLocation,
      resolveName,
    ],
  );

  const handlePlaybackChange = useCallback((playing: boolean) => {
    setIsPlaying(playing);
  }, []);

  const handlePlaceSelect = useCallback(
    async (place: ExplorationPlace) => {
      const result = await fetchWeatherFor(place.lat, place.lon, place.title);
      if (result) {
        setWeather(result);
        setActivePlace(place);
      }
    },
    [fetchWeatherFor],
  );

  const handleLoadGameTarget = useCallback(
    (target: GeoGuessrTarget) =>
      fetchWeatherFor(target.lat, target.lon, target.name),
    [fetchWeatherFor],
  );

  const handleGameRoundChanged = useCallback(
    (
      _index: number,
      _round: GeoGuessrRound,
      target: GeoGuessrTarget,
      telemetry: WeatherData | null,
    ) => {
      setGameTarget(target);
      setGameSignalReady(telemetry !== null);
      if (telemetry) setGameTelemetry(telemetry);
      if (telemetry === null) {
        setGameGuess(null);
        setGameDraftPin(null);
        setGameSelectedWeather(null);
        selectedLocationRequest.current++;
      }
    },
    [],
  );

  const handleGameLockIn = useCallback(() => {
    if (!gameDraftPin || !gameTarget || !gameSignalReady || gameGuess) return;
    const distanceKm = haversineDistanceKm(
      gameDraftPin.lat,
      gameDraftPin.lon,
      gameTarget.lat,
      gameTarget.lon,
    );
    const points = scoreGuess(distanceKm);
    setGameGuess({ ...gameDraftPin, distanceKm, points });
    setGameScore((score) => score + points);
    if (distanceKm <= 500) {
      void playCaseCrackedChime().catch((playError: unknown) => {
        console.error("[AcousticGeoGuessr] success chime failed:", playError);
      });
    }
  }, [gameDraftPin, gameGuess, gameSignalReady, gameTarget]);

  const handleGameOpenLab = useCallback(
    (hint: string | null) => {
      setLabGameHint(hint);
      setLabOpen(true);
    },
    [],
  );

  const handleGameHintChange = useCallback((hint: string | null) => {
    setLabGameHint(hint);
  }, []);

  const handleLabValuesChange = useCallback((values: LabSoundscapeInput) => {
    if (gameMode) setLabValues(values);
  }, [gameMode]);

  const handleRestartGame = useCallback(() => {
    setGameScore(0);
    setGameGuess(null);
    setGameDraftPin(null);
    setGameTarget(null);
    setGameTelemetry(null);
    setGameSelectedWeather(null);
    selectedLocationRequest.current++;
    setGameSignalReady(false);
    setGameSessionKey((key) => key + 1);
  }, []);

  const handleGameModeToggle = useCallback(() => {
    if (gameMode) {
      setGameMode(false);
      setGameGuess(null);
      setGameDraftPin(null);
      setGameTarget(null);
      setGameTelemetry(null);
      setGameSelectedWeather(null);
      selectedLocationRequest.current++;
      setGameSignalReady(false);
      setLabOpen(false);
      setLabValues(null);
      setLabGameHint(null);
      stopAudio();
      stopSoundscape();
      return;
    }
    setComparePhase("off");
    setSlotA(null);
    setSlotB(null);
    setLabOpen(false);
    setLabValues(null);
    setLabGameHint(null);
    stopAudio();
    stopSoundscape();
    setIsPlaying(false);
    setGameScore(0);
    setGameGuess(null);
    setGameDraftPin(null);
    setGameTarget(null);
    setGameTelemetry(null);
    setGameSignalReady(false);
    setLabValues({ temperature: 15, humidity: 60, windSpeed: 5 });
    setShowClimateOverlay(true);
    setGameMode(true);
  }, [gameMode]);

  function exitCompare() {
    setComparePhase("off");
    setSlotA(null);
    setSlotB(null);
  }

  const comparePins =
    comparePhase === "off"
      ? []
      : [
          ...(slotA ? [{ slot: "A" as const, lat: slotA.lat, lon: slotA.lon }] : []),
          ...(slotB ? [{ slot: "B" as const, lat: slotB.lat, lon: slotB.lon }] : []),
        ];
  const bannerText =
    comparePhase === "pickA"
      ? "Compare: click the map or search to pick Location A"
      : comparePhase === "pickB"
        ? "Compare: now pick Location B"
        : null;

  if (!weather) {
    return (
      <main
        className="flex min-h-screen items-center justify-center bg-slate-950 p-6 text-slate-100"
        style={{ zoom: 0.8 }}
      >
        <section className="w-full max-w-md rounded-3xl border border-slate-700/70 bg-slate-900/80 p-6 text-center shadow-2xl">
          <p className="text-[10px] font-semibold uppercase tracking-[0.3em] text-sky-400">
            EarthPulse
          </p>
          <h1 className="mt-2 text-xl font-semibold text-white">
            {isLoading ? "Loading live weather…" : "Live weather unavailable"}
          </h1>
          <p className="mt-3 text-sm leading-relaxed text-slate-300">
            {isLoading
              ? "Connecting to Meteomatics for current conditions."
              : error ?? "The live weather request failed. Check your connection and try again."}
          </p>
          {!isLoading && (
            <button
              type="button"
              onClick={() =>
                void fetchWeatherFor(
                  INITIAL_LOCATION.lat,
                  INITIAL_LOCATION.lon,
                  INITIAL_LOCATION.name,
                ).then((snapshot) => {
                  if (snapshot) setWeather(snapshot);
                })
              }
              className="mt-5 rounded-full border border-cyan-300/30 bg-cyan-400/10 px-5 py-2 text-sm font-semibold text-cyan-100 transition-colors hover:bg-cyan-400/20"
            >
              Retry live connection
            </button>
          )}
        </section>
      </main>
    );
  }

  return (
    <main
      className="relative overflow-hidden bg-slate-950"
      style={{ zoom: 0.8, width: "125vw", height: "125vh" }}
    >
      {/* Base layer: the map fills the entire page. */}
      <div className="absolute inset-0 bg-gradient-to-b from-slate-950 via-slate-900 to-sky-950">
        <WorldMap
          lat={weather.lat}
          lon={weather.lon}
          weather={weather}
          isPlaying={isPlaying}
          layers={layers}
          onPick={handleMapPick}
          comparePins={comparePins}
          detectivePin={gameMode ? gameGuess ?? gameDraftPin : null}
          detectiveTarget={gameMode && gameGuess ? gameTarget : null}
          hideLocationMarker={gameMode}
          showClimateOverlay={showClimateOverlay}
        />
      </div>

      <div className={`absolute top-4 z-30 ${gameMode ? "left-1/2 -translate-x-1/2" : "left-1/2 w-[min(34rem,calc(100vw-2rem))] -translate-x-1/2"}`}>
        {gameMode ? (
          <button
            type="button"
            onClick={handleGameModeToggle}
            aria-pressed="true"
            className="h-11 rounded-full border border-emerald-300/30 bg-slate-900/90 px-5 text-sm font-semibold text-emerald-100 shadow-lg backdrop-blur transition-colors hover:bg-slate-800"
          >
            ✕ Exit Game Mode
          </button>
        ) : (
          <>
            <div className="flex items-start gap-2">
              <div className="flex-1">
                <LocationSearch onSelect={handleSelect} isLoading={isLoading} />
              </div>
              <div className="relative shrink-0">
                <button
                  type="button"
                  onClick={() => setToolsMenuOpen((open) => !open)}
                  aria-expanded={toolsMenuOpen}
                  aria-controls="earthpulse-tools-menu"
                  aria-label={toolsMenuOpen ? "Close tools menu" : "Open tools menu"}
                  className="flex h-12 w-12 flex-col items-center justify-center gap-1.5 rounded-2xl border border-white/10 bg-slate-900/90 text-slate-100 shadow-lg backdrop-blur transition-colors hover:border-cyan-300/30 hover:bg-slate-800 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-cyan-300"
                >
                  <span className="h-0.5 w-5 rounded-full bg-current" />
                  <span className="h-0.5 w-5 rounded-full bg-current" />
                  <span className="h-0.5 w-5 rounded-full bg-current" />
                </button>
              </div>
            </div>

            {bannerText && (
              <p className="mt-2 rounded-2xl border border-violet-400/30 bg-violet-500/15 px-4 py-2 text-center text-xs font-medium text-violet-200 backdrop-blur">
                {bannerText}
              </p>
            )}

            {error && (
              <p
                role="alert"
                className="mt-2 rounded-2xl border border-rose-400/20 bg-rose-500/10 px-4 py-2 text-center text-xs text-rose-300 backdrop-blur"
              >
                {error}
              </p>
            )}
          </>
        )}
      </div>

      {toolsMenuOpen && (
        <div
          id="earthpulse-tools-menu"
          className="absolute inset-0 z-50 flex items-center justify-center bg-slate-950/65 p-4 backdrop-blur-md"
          onClick={(event) => {
            if (event.target === event.currentTarget) setToolsMenuOpen(false);
          }}
        >
          <section
            role="dialog"
            aria-modal="true"
            aria-labelledby="earthpulse-tools-title"
            className="w-full max-w-lg overflow-hidden rounded-3xl border border-slate-700/80 bg-slate-950/95 p-6 shadow-2xl backdrop-blur-xl"
          >
            <div className="mb-5 flex items-center justify-between">
              <div>
                <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-cyan-300">
                  EarthPulse tools
                </p>
                <h2
                  id="earthpulse-tools-title"
                  className="mt-1 text-lg font-semibold text-white"
                >
                  Choose an experience
                </h2>
              </div>
              <button
                type="button"
                onClick={() => setToolsMenuOpen(false)}
                aria-label="Close menu"
                className="rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-slate-400 transition-colors hover:bg-white/10 hover:text-white"
              >
                ✕
              </button>
            </div>
            <div className="space-y-3">
              <button
                type="button"
                onClick={() => {
                  if (comparePhase === "off") {
                    setLabOpen(false);
                    setComparePhase("pickA");
                  } else {
                    exitCompare();
                  }
                  setToolsMenuOpen(false);
                }}
                className="flex w-full items-center gap-4 rounded-2xl border border-violet-300/15 bg-violet-400/5 px-5 py-4 text-left text-base text-slate-100 transition-colors hover:bg-violet-400/10"
              >
                <span aria-hidden="true" className="w-7 text-center text-lg text-violet-300">⚔</span>
                <span>{comparePhase === "off" ? "Compare locations" : "Exit comparison"}</span>
              </button>
              <button
                type="button"
                onClick={() => {
                  setLabValues(weather);
                  setLabGameHint(null);
                  setLabOpen(true);
                  setToolsMenuOpen(false);
                }}
                aria-haspopup="dialog"
                className="flex w-full items-center gap-4 rounded-2xl border border-cyan-300/15 bg-cyan-400/5 px-5 py-4 text-left text-base text-slate-100 transition-colors hover:bg-cyan-400/10"
              >
                <span aria-hidden="true" className="w-7 text-center text-lg text-cyan-300">⚗</span>
                <span>Sonification Lab</span>
              </button>
              <button
                type="button"
                onClick={() => {
                  handleGameModeToggle();
                  setToolsMenuOpen(false);
                }}
                aria-pressed="false"
                className="flex w-full items-center gap-4 rounded-2xl border border-emerald-300/15 bg-emerald-400/5 px-5 py-4 text-left text-base text-slate-100 transition-colors hover:bg-emerald-400/10"
              >
                <span aria-hidden="true" className="w-7 text-center text-lg text-emerald-300">🎮</span>
                <span>Game Mode</span>
              </button>
            </div>
          </section>
        </div>
      )}

      {gameMode ? (
        <AcousticGeoGuessr
          key={gameSessionKey}
          onClose={handleGameModeToggle}
          onLoadTarget={handleLoadGameTarget}
          onRoundChanged={handleGameRoundChanged}
          onOpenLab={handleGameOpenLab}
          onHintChange={handleGameHintChange}
          playerWeather={gameTelemetry}
          selectedWeather={gameSelectedWeather}
          draftPin={gameDraftPin}
          onLockIn={handleGameLockIn}
          result={gameGuess}
          score={gameScore}
          onRestart={handleRestartGame}
          showClimateOverlay={showClimateOverlay}
          onToggleClimateOverlay={() => setShowClimateOverlay((show) => !show)}
        />
      ) : (
        <GuideDock
          weather={weather}
          isLoading={isLoading}
          activePlace={activePlace}
          layers={layers}
          onSelectPlace={handlePlaceSelect}
        />
      )}

      {!gameMode && (
        <WeatherPanel
          weather={weather}
          isLoading={isLoading}
          onPlaybackChange={handlePlaybackChange}
          onOpenLab={() => setLabOpen(true)}
          showClimateOverlay={showClimateOverlay}
          onToggleClimateOverlay={() => setShowClimateOverlay((show) => !show)}
        />
      )}

      {/* Compare results overlay. */}
      {comparePhase === "comparing" && slotA && slotB && (
        <CompareModal slotA={slotA} slotB={slotB} onExit={exitCompare} />
      )}
      {labOpen && (
        <SonificationLab
          initialValues={
            gameMode
              ? labValues ?? { temperature: 15, humidity: 60, windSpeed: 5 }
              : labValues ?? weather
          }
          gameHint={labGameHint}
          gameMode={gameMode}
          onValuesChange={handleLabValuesChange}
          onClose={() => {
            setLabOpen(false);
            if (!gameMode) {
              setLabGameHint(null);
              setLabValues(null);
            }
          }}
        />
      )}
    </main>
  );
}
