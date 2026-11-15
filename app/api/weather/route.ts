import { NextResponse } from "next/server";
import { fetchWeather } from "@/lib/meteomatics";
import type { WeatherApiResponse } from "@/types/weather";

/**
 * GET /api/weather?lat=3.139&lon=101.6869&name=Kuala%20Lumpur
 * Fetches live temperature, humidity, and wind speed from Meteomatics
 * using credentials that live only on the server.
 */
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);

  const lat = Number.parseFloat(searchParams.get("lat") ?? "");
  const lon = Number.parseFloat(searchParams.get("lon") ?? "");
  const name = (searchParams.get("name") ?? "").trim();

  if (!Number.isFinite(lat) || !Number.isFinite(lon)) {
    return NextResponse.json<WeatherApiResponse>(
      { error: "Valid lat and lon query parameters are required" },
      { status: 400 },
    );
  }

  try {
    const weather = await fetchWeather({ name, lat, lon });
    return NextResponse.json<WeatherApiResponse>({ weather });
  } catch (error) {
    console.error("[api/weather] failed to fetch weather:", error);
    return NextResponse.json<WeatherApiResponse>(
      { error: "Failed to fetch weather data. Please try again." },
      { status: 502 },
    );
  }
}
