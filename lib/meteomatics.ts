/**
 * Server-side Meteomatics weather client for EarthPulse.
 *
 * Reads Basic-auth credentials from METEOMATICS_USERNAME / METEOMATICS_PASSWORD.
 * When credentials are missing or the upstream call fails, falls back to mock
 * data so the demo stays functional (source is flagged in the response).
 */
import type { MeteomaticsResponse, WeatherData } from "@/types/weather";

const METEOMATICS_API_URL = "https://api.meteomatics.com";

export interface GeoLocation {
  name: string;
  lat: number;
  lon: number;
}

/** Default demo location: Kuala Lumpur. */
export const DEFAULT_LOCATION: GeoLocation = {
  name: "Kuala Lumpur",
  lat: 3.139,
  lon: 101.6869,
};

function buildWeatherUrl(location: GeoLocation): string {
  const now = new Date().toISOString().replace(/\.\d{3}Z$/, "Z");
  const params = ["t_2m:C", "relative_humidity_2m:p", "wind_speed_10m:ms"];
  return `${METEOMATICS_API_URL}/${now}/${params.join(",")}/${location.lat},${location.lon}/json`;
}

export function extractWeather(
  response: MeteomaticsResponse,
  location: GeoLocation,
): WeatherData | null {
  const find = (parameter: string): number | undefined =>
    response.data
      ?.find((d) => d.parameter === parameter)
      ?.coordinates?.[0]?.dates?.[0]?.value;

  const coordinate =
    response.data?.[0]?.coordinates?.[0];
  if (!coordinate) return null;

  const temperature = find("t_2m:C");
  const humidity = find("relative_humidity_2m:p");
  const windSpeed = find("wind_speed_10m:ms");
  if (
    temperature === undefined ||
    humidity === undefined ||
    windSpeed === undefined
  ) {
    return null;
  }

  return {
    location: location.name,
    lat: coordinate.lat,
    lon: coordinate.lon,
    temperature,
    humidity,
    windSpeed,
    unit: "C",
    observedAt: coordinate.dates?.[0]?.date ?? new Date().toISOString(),
    source: "meteomatics",
  };
}

export async function fetchWeather(
  location: GeoLocation,
): Promise<WeatherData> {
  const username = process.env.METEOMATICS_USERNAME;
  const password = process.env.METEOMATICS_PASSWORD;

  if (!username || !password) {
    return mockWeather(location, "Missing Meteomatics credentials");
  }

  const auth = Buffer.from(`${username}:${password}`).toString("base64");

  const res = await fetch(buildWeatherUrl(location), {
    headers: {
      Authorization: `Basic ${auth}`,
      Accept: "application/json",
    },
    cache: "no-store",
  });

  if (!res.ok) {
    return mockWeather(
      location,
      `Meteomatics API returned ${res.status} ${res.statusText}`,
    );
  }

  const json = (await res.json()) as MeteomaticsResponse;
  const weather = extractWeather(json, location);
  if (!weather) {
    return mockWeather(location, "Unexpected Meteomatics response shape");
  }

  return weather;
}

/**
 * Demo fallback that mirrors the documented Meteomatics response shape.
 * Used only when the live API is unavailable (hackathon demo resilience).
 */
function mockWeather(location: GeoLocation, reason: string): WeatherData {
  if (process.env.NODE_ENV !== "production") {
    console.warn(`[earthpulse] falling back to mock data: ${reason}`);
  }
  return {
    location: location.name,
    lat: location.lat,
    lon: location.lon,
    temperature: 27.4,
    humidity: 84,
    windSpeed: 3.2,
    unit: "C",
    observedAt: new Date().toISOString(),
    source: "mock",
  };
}
