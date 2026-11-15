/**
 * Server-side Meteomatics weather client for EarthPulse.
 *
 * Reads Basic-auth credentials from METEOMATICS_USERNAME / METEOMATICS_PASSWORD.
 * Live weather is required; missing credentials or upstream failures are surfaced.
 */
import type { MeteomaticsResponse, WeatherData } from "@/types/weather";

const METEOMATICS_API_URL = "https://api.meteomatics.com";

export interface GeoLocation {
  name: string;
  lat: number;
  lon: number;
}

/** Initial live-weather location: Kuala Lumpur. */
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
    throw new Error(
      "Live weather is not configured. Add METEOMATICS_USERNAME and METEOMATICS_PASSWORD to your Vercel project environment variables, then redeploy.",
    );
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
    if (res.status === 401 || res.status === 403) {
      throw new Error(
        "Meteomatics rejected the credentials. Check METEOMATICS_USERNAME and METEOMATICS_PASSWORD in your deployment environment.",
      );
    }
    throw new Error(`Meteomatics weather request failed (${res.status}).`);
  }

  const json = (await res.json()) as MeteomaticsResponse;
  const weather = extractWeather(json, location);
  if (!weather) {
    throw new Error("Meteomatics returned an incomplete weather response.");
  }

  return weather;
}
