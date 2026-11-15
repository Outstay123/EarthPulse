"use client";

import { useMemo, useState } from "react";
import {
  humidityToRichness,
  humidityStyle,
  midiToNoteName,
  temperatureStyle,
  temperatureToMidi,
  windStyle,
  windToArpInterval,
  windToCutoff,
} from "@/lib/sonification";
import { type SoundLayer, type SoundscapeLayers } from "@/lib/soundscape";
import type { WeatherData } from "@/types/weather";

export interface ExplorationPlace {
  id: string;
  title: string;
  lat: number;
  lon: number;
  note?: string;
}

export interface EicStory extends ExplorationPlace {
  note: string;
}

export const EIC_STORIES: EicStory[] = [
  {
    id: "antarctic-ice-sheet",
    title: "Antarctic Ice Sheet",
    lat: -75.25,
    lon: 0.07,
    note: "Polar Cryosphere: Extreme sub-zero temperatures drive deep sub-bass drones and fierce katabatic wind textures.",
  },
  {
    id: "amazon-moisture-engine",
    title: "Amazon Moisture Engine",
    lat: -3.11,
    lon: -60.02,
    note: "Tropical Biosphere: High heat and dense canopy humidity create lush, warm harmonic chords.",
  },
  {
    id: "sahara-thermal-basin",
    title: "Sahara Thermal Basin",
    lat: 25,
    lon: 13,
    note: "Arid Desert: Intense solar heat and dry air produce high-pitched, sparse, crystalline tones.",
  },
  {
    id: "north-atlantic-current",
    title: "North Atlantic Current",
    lat: 52,
    lon: -35,
    note: "Oceanic Dynamics: Open-ocean gale winds drive rapid rhythmic motion and textured atmospheric noise.",
  },
  {
    id: "kuala-lumpur-tropical-hub",
    title: "Kuala Lumpur Tropical Hub",
    lat: 3.14,
    lon: 101.69,
    note: "Equatorial Urban: Warm tropical baseline with rich afternoon moisture.",
  },
];

export const GLOBAL_LANDMARKS: ExplorationPlace[] = [
  { id: "eiffel-tower", title: "Eiffel Tower, Paris", lat: 48.8584, lon: 2.2945 },
  { id: "mount-fuji", title: "Mount Fuji, Tokyo", lat: 35.3606, lon: 138.7274 },
  { id: "statue-of-liberty", title: "Statue of Liberty, New York", lat: 40.6892, lon: -74.0445 },
  { id: "pyramids-of-giza", title: "Pyramids of Giza, Cairo", lat: 29.9792, lon: 31.1342 },
  { id: "sydney-opera-house", title: "Sydney Opera House, Sydney", lat: -33.8568, lon: 151.2153 },
];

interface GuideDockProps {
  weather: WeatherData;
  isLoading: boolean;
  activePlace: ExplorationPlace | null;
  layers: SoundscapeLayers;
  onSelectPlace: (place: ExplorationPlace) => void;
}

/** Collapsible story and landmark browser with a live acoustic explanation. */
export default function GuideDock({
  weather,
  isLoading,
  activePlace,
  layers,
  onSelectPlace,
}: GuideDockProps) {
  const [open, setOpen] = useState(true);
  const [storiesOpen, setStoriesOpen] = useState(true);
  const [landmarksOpen, setLandmarksOpen] = useState(false);

  const explanation = useMemo(() => {
    const rootMidi = temperatureToMidi(weather.temperature);
    const rootNote = midiToNoteName(rootMidi);
    const temperatureDescription =
      weather.temperature < 0
        ? "mapping to a deep, sub-bass root"
        : weather.temperature >= 30
          ? "mapping to a bright, high-pitched root"
          : "mapping to a mid-range tonal root";
    const richness = Math.round(humidityToRichness(weather.humidity) * 100);
    const filterHz = Math.round(250 + humidityToRichness(weather.humidity) * 4500);
    const arpInterval = windToArpInterval(weather.windSpeed);
    const windDescription =
      weather.windSpeed < 1
        ? "a gentle, spacious arpeggio with very subtle noise"
        : weather.windSpeed >= 8
          ? "rapid arpeggio pulses and a brighter, stronger noise texture"
          : "a measured arpeggio with a soft atmospheric noise texture";

    const isActive = (layer: SoundLayer) =>
      layers.solo === null
        ? !layers.muted[layer]
        : layers.solo === layer && !layers.muted[layer];
    const layerStatus = (layer: SoundLayer) =>
      isActive(layer) ? "" : ` The ${layer} layer is inactive under the current Solo/Mute settings.`;
    const temp = weather.temperature.toFixed(1);
    const humidity = weather.humidity.toFixed(0);
    const wind = weather.windSpeed.toFixed(1);

    return {
      rootNote,
      temperature: `At ${temp}°C, the temperature mapping selects ${rootNote} (${temperatureDescription}).`,
      humidity: `${humidity}% humidity maps to ${richness}% harmonic richness, shaping chord density and opening the pad filter to about ${filterHz.toLocaleString()} Hz.`,
      wind: `Wind at ${wind} m/s sets arpeggio notes about every ${arpInterval.toFixed(2)} seconds, creating ${windDescription} (noise cutoff about ${Math.round(windToCutoff(weather.windSpeed)).toLocaleString()} Hz).`,
      status: `${temperatureStyle(weather.temperature)}, ${humidityStyle(weather.humidity)} humidity, ${windStyle(weather.windSpeed)}.`,
      layerStatus,
    };
  }, [layers, weather]);

  const panelWidth = "min(24rem, 88vw)";

  return (
    <div
      className="pointer-events-none absolute inset-y-0 left-0 z-10"
      style={{ width: panelWidth }}
    >
      <section
        id="location-explorer-panel"
        aria-label="Location exploration panel"
        className={`pointer-events-auto flex h-full w-full flex-col gap-3 overflow-y-auto overscroll-contain border-r border-slate-700/70 bg-slate-900/80 p-4 pt-5 shadow-2xl backdrop-blur-md transition-transform duration-300 ease-in-out ${
          open ? "translate-x-0" : "-translate-x-full"
        }`}
      >
          <div className="flex items-start justify-between gap-2">
            <div>
              <p className="text-[9px] font-semibold uppercase tracking-[0.2em] text-cyan-300">
                Location analysis
              </p>
              <h2 className="mt-0.5 text-sm font-semibold text-white">
                Why Am I Hearing This?
              </h2>
              <p className="text-[10px] text-slate-400">{weather.location} · {explanation.status}</p>
            </div>
          </div>

          <div
            aria-live="polite"
            aria-atomic="true"
            aria-busy={isLoading}
            className="space-y-2 rounded-2xl border border-cyan-400/20 bg-cyan-500/5 p-3"
          >
            <ExplanationLine label="Temperature" text={explanation.temperature + explanation.layerStatus("temperature")} />
            <ExplanationLine label="Humidity" text={explanation.humidity + explanation.layerStatus("humidity")} />
            <ExplanationLine label="Wind" text={explanation.wind + explanation.layerStatus("wind")} />
          </div>

          <Accordion
            title="NASA EIC Planetary Stories"
            open={storiesOpen}
            onToggle={() => setStoriesOpen((value) => !value)}
            id="eic-stories"
          >
            <PlaceList
              places={EIC_STORIES}
              activePlaceId={activePlace?.id ?? null}
              isLoading={isLoading}
              onSelect={onSelectPlace}
            />
          </Accordion>

          <Accordion
            title="Famous Global Landmarks"
            open={landmarksOpen}
            onToggle={() => setLandmarksOpen((value) => !value)}
            id="global-landmarks"
          >
            <PlaceList
              places={GLOBAL_LANDMARKS}
              activePlaceId={activePlace?.id ?? null}
              isLoading={isLoading}
              onSelect={onSelectPlace}
            />
          </Accordion>

      </section>
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        aria-expanded={open}
        aria-controls="location-explorer-panel"
        aria-label={open ? "Collapse left panel" : "Expand left panel"}
        title={open ? "Collapse left panel" : "Expand left panel"}
        className={`pointer-events-auto absolute top-1/2 z-20 -translate-y-1/2 rounded-r-2xl border border-l-0 border-slate-700/70 bg-slate-900/90 px-2 py-4 text-slate-300 shadow-2xl transition-[left,right,transform,color,background-color] duration-300 hover:bg-slate-800 hover:text-white ${
          open ? "right-0 translate-x-full" : "left-0 translate-x-full"
        }`}
      >
        <span className="block text-sm" aria-hidden="true">
          {open ? "◀" : "▶"}
        </span>
      </button>
    </div>
  );
}

function ExplanationLine({ label, text }: { label: string; text: string }) {
  return (
    <p className="text-[10px] leading-relaxed text-slate-300">
      <span className="font-semibold text-cyan-200">{label}: </span>
      {text}
    </p>
  );
}

function Accordion({
  title,
  open,
  onToggle,
  id,
  children,
}: {
  title: string;
  open: boolean;
  onToggle: () => void;
  id: string;
  children: React.ReactNode;
}) {
  return (
    <section className="overflow-hidden rounded-2xl border border-slate-700/70 bg-slate-950/35">
      <h3>
        <button
          type="button"
          aria-expanded={open}
          aria-controls={`${id}-content`}
          onClick={onToggle}
          className="flex w-full items-center justify-between gap-2 px-3 py-2.5 text-left text-xs font-semibold text-slate-100 transition-colors hover:bg-white/5"
        >
          {title}
          <span
            aria-hidden="true"
            className={`text-cyan-300 transition-transform duration-300 ${open ? "rotate-180" : ""}`}
          >
            ▾
          </span>
        </button>
      </h3>
      <div
        id={`${id}-content`}
        aria-hidden={!open}
        className={`grid transition-[grid-template-rows,opacity] duration-300 ease-in-out ${
          open ? "grid-rows-[1fr] opacity-100" : "grid-rows-[0fr] opacity-0"
        }`}
      >
        <div className="min-h-0 overflow-hidden">
          <div className="max-h-56 overflow-y-auto overscroll-contain">{children}</div>
        </div>
      </div>
    </section>
  );
}

function PlaceList({
  places,
  activePlaceId,
  isLoading,
  onSelect,
}: {
  places: ExplorationPlace[];
  activePlaceId: string | null;
  isLoading: boolean;
  onSelect: (place: ExplorationPlace) => void;
}) {
  return (
    <div className="space-y-1 px-2 pb-2" aria-busy={isLoading}>
      {places.map((place) => {
        const selected = activePlaceId === place.id;
        return (
          <div key={place.id}>
            <button
              type="button"
              onClick={() => onSelect(place)}
              aria-pressed={selected}
              className={`w-full rounded-xl border px-2.5 py-2 text-left transition-colors ${
                selected
                  ? "border-cyan-300/40 bg-cyan-400/10"
                  : "border-transparent bg-slate-900/55 hover:border-cyan-400/20 hover:bg-slate-800/80"
              }`}
            >
              <span className="flex items-center justify-between gap-2">
                <span className="text-[11px] font-semibold text-slate-100">{place.title}</span>
                {selected && <span className="text-[8px] uppercase tracking-wider text-cyan-300">Active</span>}
              </span>
              <span className="mt-0.5 block font-mono text-[9px] text-slate-500">
                {place.lat.toFixed(4)}, {place.lon.toFixed(4)}
              </span>
            </button>
            {selected && place.note && (
              <p className="px-2 pt-1 text-[9px] leading-relaxed text-cyan-100/80">{place.note}</p>
            )}
          </div>
        );
      })}
    </div>
  );
}
