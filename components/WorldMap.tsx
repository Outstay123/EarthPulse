"use client";

import {
  geoCentroid,
  geoEquirectangular,
  geoInterpolate,
  geoPath,
  type ExtendedFeatureCollection,
} from "d3-geo";
import { select } from "d3-selection";
import { zoom, zoomIdentity, type ZoomBehavior, type ZoomTransform } from "d3-zoom";
import "d3-transition";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  createSoundscapeEnergyTap,
  type SoundscapeEnergyTap,
} from "@/lib/soundscape";
import { windToIntensity } from "@/lib/sonification";
import type { WeatherData } from "@/types/weather";
import type { SoundscapeLayers } from "@/lib/soundscape";

interface ComparePin {
  slot: "A" | "B";
  lat: number;
  lon: number;
}

interface DetectivePin {
  lat: number;
  lon: number;
}

interface Ripple {
  mapX: number;
  mapY: number;
  radius: number;
  speed: number;
  bornAt: number;
  lifetime: number;
  color: { r: number; g: number; b: number };
  lineWidth: number;
  shadowBlur: number;
  shimmer: number;
  hasEcho: boolean;
  brightness: number;
  energyFlash: number;
  fadeStartedAt?: number;
}

interface WorldMapProps {
  lat: number;
  lon: number;
  weather: WeatherData;
  isPlaying: boolean;
  layers: SoundscapeLayers;
  onPick: (lat: number, lon: number) => void;
  /** Compare-mode A/B pins rendered as labeled markers. */
  comparePins?: ComparePin[];
  /** Detective's latest guess, rendered separately from the active location. */
  detectivePin?: DetectivePin | null;
  /** Revealed target for the completed GeoGuessr round. */
  detectiveTarget?: DetectivePin | null;
  hideLocationMarker?: boolean;
  showClimateOverlay: boolean;
}

const MAP_WIDTH = 1000;
const MAP_HEIGHT = 500;
/** Pointer travel beyond this (in px) counts as a drag, not a click. */
const CLICK_TOLERANCE = 5;
const MIN_ZOOM = 1;
const MAX_ZOOM = 12;
const BIOME_COLORS = {
  rainforest: { color: "#10b981", opacity: 0.2 },
  desert: { color: "#f59e0b", opacity: 0.2 },
  temperate: { color: "#14b8a6", opacity: 0.15 },
  polar: { color: "#38bdf8", opacity: 0.2 },
} as const;
type Biome = keyof typeof BIOME_COLORS;

const COUNTRY_BIOMES: Record<string, Biome> = {
  Brazil: "rainforest",
  "Dem. Rep. Congo": "rainforest",
  Indonesia: "rainforest",
  Malaysia: "rainforest",
  Algeria: "desert",
  Egypt: "desert",
  "Saudi Arabia": "desert",
  Australia: "desert",
  France: "temperate",
  Germany: "temperate",
  "United States of America": "temperate",
  Japan: "temperate",
  Canada: "polar",
  Russia: "polar",
  Norway: "polar",
  Greenland: "polar",
  Antarctica: "polar",
};

const LATITUDE_BANDS = [
  { latitude: 0, label: "0° EQUATOR (DOLDRUMS)", color: "#f59e0b", width: 1.5, dash: undefined, opacity: 0.7, labelWidth: 132 },
  { latitude: 30, label: "30° DESERT BELT", color: "#fb923c", width: 1.2, dash: "4 4", opacity: 0.6, labelWidth: 105 },
  { latitude: -30, label: "30° DESERT BELT", color: "#fb923c", width: 1.2, dash: "4 4", opacity: 0.6, labelWidth: 105 },
  { latitude: 60, label: "60° STORM BELT", color: "#38bdf8", width: 1.2, dash: "4 4", opacity: 0.6, labelWidth: 100 },
  { latitude: -60, label: "60° STORM BELT", color: "#38bdf8", width: 1.2, dash: "4 4", opacity: 0.6, labelWidth: 100 },
] as const;

export default function WorldMap({
  lat,
  lon,
  weather,
  isPlaying,
  layers,
  onPick,
  comparePins = [],
  detectivePin = null,
  detectiveTarget = null,
  hideLocationMarker = false,
  showClimateOverlay,
}: WorldMapProps) {
  const [countries, setCountries] = useState<ExtendedFeatureCollection | null>(null);
  const [loadError, setLoadError] = useState(false);
  const [zoomLevel, setZoomLevel] = useState(1);

  const svgRef = useRef<SVGSVGElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const rootRef = useRef<SVGGElement>(null);
  const zoomBehaviorRef = useRef<ZoomBehavior<SVGSVGElement, unknown> | null>(null);
  /** Latest zoom transform, kept in a ref so picks invert correctly. */
  const transformRef = useRef<ZoomTransform>(zoomIdentity);
  /** Pointer position at pointerdown, to separate click from drag. */
  const pointerDownRef = useRef<{ x: number; y: number } | null>(null);
  const draggedRef = useRef(false);
  const ripplesRef = useRef<Ripple[]>([]);
  const weatherRef = useRef(weather);
  const layersRef = useRef(layers);
  const playingRef = useRef(isPlaying);
  const energyTapRef = useRef<SoundscapeEnergyTap | null>(null);

  const { projection, path } = useMemo(() => {
    const projection = geoEquirectangular().fitSize(
      [MAP_WIDTH, MAP_HEIGHT],
      { type: "Sphere" },
    );
    return { projection, path: geoPath(projection) };
  }, []);

  useEffect(() => {
    weatherRef.current = weather;
    layersRef.current = layers;
    playingRef.current = isPlaying;
  }, [weather, layers, isPlaying]);

  // Load country shapes once.
  useEffect(() => {
    let cancelled = false;
    fetch("/countries.geojson")
      .then((res) => {
        if (!res.ok) throw new Error(String(res.status));
        return res.json();
      })
      .then((json) => {
        if (!cancelled) setCountries(json);
      })
      .catch(() => {
        if (!cancelled) setLoadError(true);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  // Attach d3-zoom for drag-pan and wheel/pinch-zoom.
  useEffect(() => {
    const svg = svgRef.current;
    if (!svg || !countries) return;

    const behavior = zoom<SVGSVGElement, unknown>()
      .scaleExtent([MIN_ZOOM, MAX_ZOOM])
      .translateExtent([
        [0, 0],
        [MAP_WIDTH, MAP_HEIGHT],
      ]);
    const defaultConstrain = behavior.constrain();
    behavior
      .constrain((transform, extent, translateExtent) => {
        const vertical = defaultConstrain(
          zoomIdentity.translate(0, transform.y).scale(transform.k),
          extent,
          translateExtent,
        );
        const worldWidth = MAP_WIDTH * transform.k;
        const wrappedX =
          ((transform.x % worldWidth) + worldWidth) % worldWidth;
        return zoomIdentity
          .translate(wrappedX, vertical.y)
          .scale(transform.k);
      })
      .on("zoom", (event) => {
        transformRef.current = event.transform;
        setZoomLevel(event.transform.k);
        if (rootRef.current) {
          rootRef.current.setAttribute("transform", event.transform.toString());
        }
      });

    zoomBehaviorRef.current = behavior;
    select(svg)
      .call(behavior)
      .on("dblclick.zoom", null);

    return () => {
      select(svg).on(".zoom", null);
    };
  }, [countries]);

  useEffect(() => {
    const canvas = canvasRef.current;
    const container = containerRef.current;
    if (!canvas || !container || !countries) return;

    const context = canvas.getContext("2d");
    if (!context) return;

    const resize = () => {
      const { width, height } = container.getBoundingClientRect();
      const pixelRatio = window.devicePixelRatio || 1;
      canvas.width = Math.round(width * pixelRatio);
      canvas.height = Math.round(height * pixelRatio);
      canvas.style.width = `${width}px`;
      canvas.style.height = `${height}px`;
      context.setTransform(pixelRatio, 0, 0, pixelRatio, 0, 0);
    };

    const observer = new ResizeObserver(resize);
    observer.observe(container);
    window.addEventListener("resize", resize);
    resize();

    return () => {
      observer.disconnect();
      window.removeEventListener("resize", resize);
    };
  }, [countries]);

  useEffect(() => {
    if (!isPlaying) return;

    let cancelled = false;
    void createSoundscapeEnergyTap()
      .then((tap) => {
        if (cancelled) {
          tap.dispose();
          return;
        }
        energyTapRef.current = tap;
      })
      .catch((error: unknown) => {
        if (!cancelled) {
          console.warn("[WorldMap] sound energy tap unavailable:", error);
        }
      });

    return () => {
      cancelled = true;
      energyTapRef.current?.dispose();
      energyTapRef.current = null;
    };
  }, [isPlaying]);

  useEffect(() => {
    const canvas = canvasRef.current;
    const context = canvas?.getContext("2d");
    if (!canvas || !context || !countries) return;

    let frameId = 0;
    let previousFrame = performance.now();
    let previousEnergy = 0;
    let lastSpawn = Number.NEGATIVE_INFINITY;

    const draw = (time: number) => {
      const width = containerRef.current?.clientWidth ?? 0;
      const height = containerRef.current?.clientHeight ?? 0;
      if (width <= 0 || height <= 0) {
        frameId = requestAnimationFrame(draw);
        return;
      }

      const weatherNow = weatherRef.current;
      const layerState = layersRef.current;
      const activeLayer = (layer: keyof SoundscapeLayers["muted"]) =>
        layerState.solo === null
          ? !layerState.muted[layer]
          : layerState.solo === layer && !layerState.muted[layer];
      const temperatureActive = activeLayer("temperature");
      const humidityActive = activeLayer("humidity");
      const windActive = activeLayer("wind");
      const tempFactor = clamp01((weatherNow.temperature + 40) / 90);
      const humidityFactor = humidityActive
        ? clamp01((weatherNow.humidity - 30) / 70)
        : 0;
      const bloomFactor =
        humidityActive && weatherNow.humidity > 45
          ? clamp01((weatherNow.humidity - 45) / 55)
          : 0;
      const windIntensity = windActive ? windToIntensity(weatherNow.windSpeed) : 0;
      const frameSeconds = Math.min(0.05, (time - previousFrame) / 1000);
      previousFrame = time;
      const energy = energyTapRef.current?.readEnergy() ?? 0;
      const transient = Math.max(0, energy - previousEnergy * 0.72);
      previousEnergy = energy;

      context.clearRect(0, 0, width, height);

      if (playingRef.current) {
        const baseInterval = temperatureActive
          ? 1300 - tempFactor * 550
          : 1200;
        const spawnInterval = Math.max(
          280,
          (windActive ? baseInterval / (1 + windIntensity * 1.6) : baseInterval * 1.4),
        );
        if (time - lastSpawn >= spawnInterval) {
          const point = projection([weatherNow.lon, weatherNow.lat]);
          if (point) {
            const expansionSpeed =
              (temperatureActive ? 15 + tempFactor * 19 : 23) +
              (windActive ? windIntensity * 11 : 0);
            ripplesRef.current.push({
              mapX: point[0],
              mapY: point[1],
              radius: 2,
              speed: expansionSpeed,
              bornAt: time,
              lifetime: Math.max(3600, (Math.max(width, height) * 0.48 / expansionSpeed) * 1000),
              color: temperatureActive
                ? temperatureToColor(weatherNow.temperature)
                : { r: 226, g: 232, b: 240 },
              lineWidth: 0.8 + humidityFactor * 1.8,
              shadowBlur: bloomFactor * 16,
              shimmer: windIntensity * 1.4,
              hasEcho: humidityActive && weatherNow.humidity > 65,
              brightness: Math.min(1, 0.55 + energy * 0.4),
              energyFlash: transient,
            });
            if (ripplesRef.current.length > 18) ripplesRef.current.shift();
          }
          lastSpawn = time;
        }
      }

      const brightness = Math.min(1, 0.18 + energy * 0.65 + transient * 1.4);
      const visibleScale = Math.max(width / MAP_WIDTH, height / MAP_HEIGHT);
      const epicenter = projection([weatherNow.lon, weatherNow.lat]);
      if (epicenter && playingRef.current) {
        const transformed = transformRef.current.apply(epicenter);
        const beaconX = (width - MAP_WIDTH * visibleScale) / 2 + transformed[0] * visibleScale;
        const beaconY = (height - MAP_HEIGHT * visibleScale) / 2 + transformed[1] * visibleScale;
        const beaconRadius = 4 + energy * 7 + Math.sin(time / 180) * 1.5;
        context.beginPath();
        context.arc(beaconX, beaconY, beaconRadius, 0, Math.PI * 2);
        context.fillStyle = `rgba(186, 230, 253, ${0.42 + brightness * 0.48})`;
        context.shadowColor = "#7dd3fc";
        context.shadowBlur = 8 + energy * 24;
        context.fill();
        context.shadowBlur = 0;
      }

      const nowRipples: Ripple[] = [];
      for (const ripple of ripplesRef.current) {
        const age = time - ripple.bornAt;
        if (age >= ripple.lifetime) continue;

        if (!playingRef.current) {
          ripple.fadeStartedAt ??= time;
        }
        const fadeProgress = ripple.fadeStartedAt === undefined
          ? 0
          : Math.min(1, (time - ripple.fadeStartedAt) / 1800);
        ripple.speed += (playingRef.current ? 0 : 20 * frameSeconds);
        ripple.radius += ripple.speed * frameSeconds * (1 + fadeProgress * 2.5);
        if (fadeProgress >= 1) continue;
        const flash = ripple.energyFlash * Math.max(0, 1 - age / 220);
        const alpha =
          (1 - age / ripple.lifetime) *
          ripple.brightness *
          (1 + flash) *
          (1 - fadeProgress);
        const shimmer = ripple.shimmer * (1 + Math.sin(time / 250) * 0.35);
        const worldWidth = MAP_WIDTH * transformRef.current.k;
        const projectedX = transformRef.current.x + ripple.mapX * transformRef.current.k;
        const worldCopy = Math.round(
          (MAP_WIDTH / 2 - projectedX) / worldWidth,
        );
        const centerX =
          (width - MAP_WIDTH * visibleScale) / 2 +
          (transformRef.current.x +
            (ripple.mapX + worldCopy * MAP_WIDTH) * transformRef.current.k) *
            visibleScale;
        const centerY =
          (height - MAP_HEIGHT * visibleScale) / 2 +
          (transformRef.current.y + ripple.mapY * transformRef.current.k) *
            visibleScale;
        const segments = 144;
        context.beginPath();
        for (let pointIndex = 0; pointIndex <= segments; pointIndex++) {
          const angle = (pointIndex / segments) * Math.PI * 2;
          const displacement =
            Math.sin(angle * 7 + time / 230) +
            Math.sin(angle * 13 - time / 310) * 0.35;
          const radius = ripple.radius + displacement * shimmer;
          const x = centerX + Math.cos(angle) * radius;
          const y = centerY + Math.sin(angle) * radius;
          if (pointIndex === 0) context.moveTo(x, y);
          else context.lineTo(x, y);
        }
        context.closePath();
        context.strokeStyle = `rgba(${ripple.color.r}, ${ripple.color.g}, ${ripple.color.b}, ${alpha})`;
        context.lineWidth = ripple.lineWidth;
        context.shadowColor = `rgba(${ripple.color.r}, ${ripple.color.g}, ${ripple.color.b}, 0.9)`;
        context.shadowBlur = ripple.shadowBlur;
        context.stroke();

        if (ripple.hasEcho && ripple.radius > 12) {
          context.beginPath();
          context.arc(centerX, centerY, ripple.radius - 10, 0, Math.PI * 2);
          context.strokeStyle = `rgba(${ripple.color.r}, ${ripple.color.g}, ${ripple.color.b}, ${alpha * 0.28})`;
          context.lineWidth = ripple.lineWidth * 0.7;
          context.shadowBlur = 0;
          context.stroke();
        }

        context.shadowBlur = 0;
        nowRipples.push(ripple);
      }
      ripplesRef.current = nowRipples;

      if (playingRef.current || nowRipples.length > 0) {
        frameId = requestAnimationFrame(draw);
      }
    };

    if (isPlaying || ripplesRef.current.length > 0) {
      frameId = requestAnimationFrame(draw);
    }

    return () => cancelAnimationFrame(frameId);
  }, [countries, isPlaying, projection]);

  function handleClick(event: React.MouseEvent<SVGSVGElement>) {
    if (draggedRef.current) {
      draggedRef.current = false;
      return;
    }

    const svg = svgRef.current;
    if (!svg) return;

    // Screen pixel -> viewBox coordinates, then invert the zoom transform
    // to map coordinates, then invert the projection to lat/lon.
    const rect = svg.getBoundingClientRect();
    const viewBox = svg.viewBox.baseVal;
    const x =
      ((event.clientX - rect.left) / rect.width) * (viewBox.width || MAP_WIDTH);
    const y =
      ((event.clientY - rect.top) / rect.height) * (viewBox.height || MAP_HEIGHT);
    const [mx, my] = transformRef.current.invert([x, y]);

    const coords = projection.invert?.([mx, my]);
    if (!coords || !Number.isFinite(coords[0]) || !Number.isFinite(coords[1])) {
      return;
    }
    const wrappedLongitude = ((coords[0] + 180) % 360 + 360) % 360 - 180;
    onPick(coords[1], wrappedLongitude);
  }

  function handlePointerDown(event: React.PointerEvent) {
    pointerDownRef.current = { x: event.clientX, y: event.clientY };
    draggedRef.current = false;
  }

  function handlePointerMove(event: React.PointerEvent) {
    const start = pointerDownRef.current;
    if (!start) return;
    if (
      Math.abs(event.clientX - start.x) > CLICK_TOLERANCE ||
      Math.abs(event.clientY - start.y) > CLICK_TOLERANCE
    ) {
      draggedRef.current = true;
    }
  }

  function handlePointerUp() {
    pointerDownRef.current = null;
  }

  // Animated zoom controls.
  function zoomBy(factor: number) {
    const svg = svgRef.current;
    if (!svg || !zoomBehaviorRef.current) return;
    select(svg)
      .transition()
      .duration(300)
      .call(zoomBehaviorRef.current.scaleBy, factor);
  }

  function resetZoom() {
    const svg = svgRef.current;
    if (!svg || !zoomBehaviorRef.current) return;
    select(svg)
      .transition()
      .duration(300)
      .call(zoomBehaviorRef.current.transform, zoomIdentity);
  }

  // Marker position for the currently selected coordinates.
  const marker = useMemo(() => {
    if (hideLocationMarker) return null;
    const point = projection([lon, lat]);
    return point ? { x: point[0], y: point[1] } : null;
  }, [hideLocationMarker, projection, lat, lon]);

  // Compare-mode A/B pin positions.
  const pins = useMemo(
    () =>
      comparePins
        .map((pin) => {
          const point = projection([pin.lon, pin.lat]);
          return point
            ? { ...pin, x: point[0], y: point[1] }
            : null;
        })
        .filter((p): p is NonNullable<typeof p> => p !== null),
    [comparePins, projection],
  );
  const detectiveMarker = useMemo(() => {
    if (!detectivePin) return null;
    const point = projection([detectivePin.lon, detectivePin.lat]);
    return point ? { x: point[0], y: point[1] } : null;
  }, [detectivePin, projection]);
  const detectiveTargetMarker = useMemo(() => {
    if (!detectiveTarget) return null;
    const point = projection([detectiveTarget.lon, detectiveTarget.lat]);
    return point ? { x: point[0], y: point[1] } : null;
  }, [detectiveTarget, projection]);
  const detectiveRoute = useMemo(() => {
    if (!detectivePin || !detectiveTarget) return null;
    const interpolate = geoInterpolate(
      [detectivePin.lon, detectivePin.lat],
      [detectiveTarget.lon, detectiveTarget.lat],
    );
    const coordinates = Array.from({ length: 51 }, (_, index) =>
      interpolate(index / 50),
    );
    return path({ type: "LineString", coordinates } as never);
  }, [detectivePin, detectiveTarget, path]);

  return (
    <div ref={containerRef} className="relative h-full w-full overflow-hidden">
      {loadError ? (
        <div className="flex h-full items-center justify-center">
          <p className="text-sm text-rose-300">
            The map failed to load. Please use the search bar instead.
          </p>
        </div>
      ) : !countries ? (
        <div className="flex h-full items-center justify-center">
          <span className="h-8 w-8 animate-spin rounded-full border-2 border-slate-600 border-t-sky-400" />
        </div>
      ) : (
        <>
          <svg
            ref={svgRef}
            viewBox={`0 0 ${MAP_WIDTH} ${MAP_HEIGHT}`}
            preserveAspectRatio="xMidYMid slice"
            role="application"
            aria-label="World map — drag to pan, scroll to zoom, click any point to hear its weather"
            onClick={handleClick}
            onPointerDown={handlePointerDown}
            onPointerMove={handlePointerMove}
            onPointerUp={handlePointerUp}
            className="block h-full w-full cursor-crosshair bg-slate-950/60 touch-none active:cursor-grabbing"
          >
            <g ref={rootRef}>
              <use href="#world-map-content" x={-MAP_WIDTH} />
              <g id="world-map-content">
                <g stroke="#1e293b" strokeWidth={0.5} fill="none">
                {[-75, -60, -30, 0, 30, 60, 75].map((lat) => {
                  const line = path({
                    type: "LineString",
                    coordinates: [
                      [-180, lat],
                      [180, lat],
                    ],
                  } as never);
                  return line ? <path key={`lat-${lat}`} d={line} /> : null;
                })}
                {[-150, -120, -90, -60, -30, 0, 30, 60, 90, 120, 150].map(
                  (lon) => {
                    const line = path({
                      type: "LineString",
                      coordinates: [
                        [lon, -90],
                        [lon, 90],
                      ],
                    } as never);
                    return line ? <path key={`lon-${lon}`} d={line} /> : null;
                  },
                )}
                </g>

                <g fill="#334155" stroke="#334155" strokeWidth={0.5}>
                {countries.features.map((feature, i) => {
                  const d = path(feature);
                  return d ? (
                    <path
                      key={i}
                      d={d}
                      className="transition-colors hover:fill-sky-400/40"
                    >
                      <title>
                        {String(
                          (feature.properties as { name?: string })?.name ?? "",
                        )}
                      </title>
                    </path>
                  ) : null;
                })}
                </g>

                <g
                  aria-hidden="true"
                  className="transition-opacity duration-300"
                  opacity={showClimateOverlay ? 1 : 0}
                  pointerEvents="none"
                >
                  {countries.features.map((feature, i) => {
                    const d = path(feature);
                    if (!d) return null;
                    const name = String(
                      (feature.properties as { name?: string })?.name ?? "",
                    );
                    const biome = biomeForCountry(name, geoCentroid(feature)[1]);
                    const style = BIOME_COLORS[biome];
                    return (
                      <path
                        key={`biome-${i}`}
                        d={d}
                        fill={style.color}
                        fillOpacity={style.opacity}
                        stroke="none"
                      />
                    );
                  })}
                </g>

                <g
                  aria-hidden="true"
                  className="transition-opacity duration-300"
                  opacity={showClimateOverlay ? 1 : 0}
                  pointerEvents="none"
                >
                  {LATITUDE_BANDS.map((band) => {
                    const line = path({
                      type: "LineString",
                      coordinates: [
                        [-180, band.latitude],
                        [180, band.latitude],
                      ],
                    } as never);
                    const labelPoint = projection([-150, band.latitude]);
                    if (!line || !labelPoint) return null;
                    return (
                      <g key={`climate-band-${band.latitude}`} pointerEvents="none">
                        <path
                          d={line}
                          fill="none"
                          stroke={band.color}
                          strokeWidth={band.width}
                          strokeDasharray={band.dash}
                          opacity={band.opacity}
                        />
                        <g transform={`translate(${labelPoint[0] - 4},${labelPoint[1] - 8})`}>
                          <rect
                            width={band.labelWidth}
                            height="16"
                            rx="4"
                            fill="#020617"
                            fillOpacity="0.82"
                            stroke={band.color}
                            strokeOpacity="0.35"
                          />
                          <text
                            x="5"
                            y="11.5"
                            fill="#f8fafc"
                            fontFamily="monospace"
                            fontSize="10"
                            fontWeight="600"
                          >
                            {band.label}
                          </text>
                        </g>
                      </g>
                    );
                  })}
                </g>

                {marker && (
                  <g>
                    <circle
                      cx={marker.x}
                      cy={marker.y}
                      r="10"
                      fill="none"
                      stroke="#38bdf8"
                      strokeWidth="1.5"
                      opacity="0.6"
                    >
                      <animate
                        attributeName="r"
                        values="6;12;6"
                        dur="2s"
                        repeatCount="indefinite"
                      />
                    </circle>
                    <circle cx={marker.x} cy={marker.y} r="4" fill="#38bdf8" />
                  </g>
                )}

                {detectiveRoute && (
                  <path
                    d={detectiveRoute}
                    fill="none"
                    stroke="#fbbf24"
                    strokeWidth="1.5"
                    strokeDasharray="5 4"
                    opacity="0.9"
                    pointerEvents="none"
                  />
                )}
                {detectiveMarker && (
                  <g transform={`translate(${detectiveMarker.x},${detectiveMarker.y})`}>
                    <circle r="8" fill="#f43f5e" stroke="#fff1f2" strokeWidth="1.5" />
                    <path d="M-3 -3L3 3M3 -3L-3 3" stroke="#fff" strokeWidth="1.5" />
                    <title>Detective pin</title>
                  </g>
                )}
                {detectiveTargetMarker && (
                  <g transform={`translate(${detectiveTargetMarker.x},${detectiveTargetMarker.y})`}>
                    <circle r="7" fill="#34d399" stroke="#ecfdf5" strokeWidth="1.5" />
                    <path d="M-3 0L-1 2L3 -3" fill="none" stroke="#052e16" strokeWidth="1.5" />
                    <title>True signal origin</title>
                  </g>
                )}

                {/* Compare-mode A/B pins. */}
                {pins.map((pin) => (
                  <g key={pin.slot} transform={`translate(${pin.x},${pin.y})`}>
                    <circle
                      r="9"
                      fill={pin.slot === "A" ? "#8b5cf6" : "#0ea5e9"}
                      stroke="#0f172a"
                      strokeWidth="1"
                      opacity="0.9"
                    />
                    <text
                      textAnchor="middle"
                      dy="3.5"
                      fontSize="10"
                      fontWeight="bold"
                      fill="#ffffff"
                      pointerEvents="none"
                    >
                      {pin.slot}
                    </text>
                  </g>
                ))}
              </g>
              <use href="#world-map-content" x={MAP_WIDTH} />
            </g>
          </svg>

          <canvas
            ref={canvasRef}
            aria-hidden="true"
            className="pointer-events-none absolute inset-0 h-full w-full will-change-transform"
            style={{ transform: "translateZ(0)" }}
          />

          <div
            aria-hidden="true"
            className={`pointer-events-none absolute bottom-4 left-4 z-10 flex flex-wrap gap-x-3 gap-y-1 rounded-lg border border-white/10 bg-slate-950/75 px-3 py-2 text-[9px] text-slate-200 shadow-lg backdrop-blur transition-opacity duration-300 ${
              showClimateOverlay ? "opacity-100" : "opacity-0"
            }`}
          >
            <LegendSwatch color={BIOME_COLORS.rainforest.color} label="Rainforest" />
            <LegendSwatch color={BIOME_COLORS.desert.color} label="Desert" />
            <LegendSwatch color={BIOME_COLORS.temperate.color} label="Temperate" />
            <LegendSwatch color={BIOME_COLORS.polar.color} label="Polar/Boreal" />
          </div>

          {/* Zoom controls */}
          <div className="absolute right-4 bottom-4 flex flex-col gap-2">
            <button
              type="button"
              onClick={() => zoomBy(1.6)}
              aria-label="Zoom in"
              className="flex h-10 w-10 items-center justify-center rounded-full border border-white/10 bg-slate-900/90 text-lg font-bold text-white shadow-lg transition-colors hover:bg-slate-800"
            >
              +
            </button>
            <button
              type="button"
              onClick={() => zoomBy(1 / 1.6)}
              aria-label="Zoom out"
              className="flex h-10 w-10 items-center justify-center rounded-full border border-white/10 bg-slate-900/90 text-lg font-bold text-white shadow-lg transition-colors hover:bg-slate-800"
            >
              −
            </button>
            <button
              type="button"
              onClick={resetZoom}
              aria-label="Reset zoom"
              title="Reset view"
              className="flex h-10 w-10 items-center justify-center rounded-full border border-white/10 bg-slate-900/90 text-xs font-medium text-white shadow-lg transition-colors hover:bg-slate-800"
            >
              {zoomLevel.toFixed(1)}×
            </button>
          </div>
        </>
      )}
    </div>
  );
}

function clamp01(value: number): number {
  return Math.min(1, Math.max(0, value));
}

function biomeForCountry(name: string, latitude: number): Biome {
  const knownBiome = COUNTRY_BIOMES[name];
  if (knownBiome) return knownBiome;

  const absoluteLatitude = Math.abs(latitude);
  if (absoluteLatitude >= 60) return "polar";
  if (absoluteLatitude >= 35) return "temperate";
  if (absoluteLatitude >= 20) return "desert";
  return "rainforest";
}

function LegendSwatch({ color, label }: { color: string; label: string }) {
  return (
    <span className="inline-flex items-center gap-1.5 whitespace-nowrap">
      <span
        aria-hidden="true"
        className="h-2 w-2 rounded-sm"
        style={{ backgroundColor: color }}
      />
      {label}
    </span>
  );
}

function temperatureToColor(temperature: number) {
  const stops = [
    { temperature: -40, color: [56, 189, 248] },
    { temperature: 15, color: [52, 211, 153] },
    { temperature: 50, color: [251, 146, 60] },
  ];
  const bounded = Math.min(50, Math.max(-40, temperature));
  const start = bounded <= 15 ? stops[0] : stops[1];
  const end = bounded <= 15 ? stops[1] : stops[2];
  const fraction = (bounded - start.temperature) / (end.temperature - start.temperature);
  return {
    r: Math.round(start.color[0] + (end.color[0] - start.color[0]) * fraction),
    g: Math.round(start.color[1] + (end.color[1] - start.color[1]) * fraction),
    b: Math.round(start.color[2] + (end.color[2] - start.color[2]) * fraction),
  };
}
