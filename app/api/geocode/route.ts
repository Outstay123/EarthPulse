import { NextResponse } from "next/server";
import type { GeocodeApiResponse, GeoSearchResult } from "@/types/weather";

interface OpenMeteoGeoResult {
  id: number;
  name: string;
  country?: string;
  admin1?: string;
  latitude: number;
  longitude: number;
}

/**
 * GET /api/geocode?q=<location name>
 * Proxies the free Open-Meteo geocoding API server-side so the client
 * never calls third parties directly and no API key is exposed.
 */
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const query = (searchParams.get("q") ?? "").trim();

  if (query.length < 2) {
    return NextResponse.json<GeocodeApiResponse>({
      error: "Please enter at least 2 characters",
    });
  }

  try {
    const url = new URL("https://geocoding-api.open-meteo.com/v1/search");
    url.searchParams.set("name", query);
    url.searchParams.set("count", "5");
    url.searchParams.set("language", "en");
    url.searchParams.set("format", "json");

    const res = await fetch(url, { cache: "no-store" });
    if (!res.ok) {
      return NextResponse.json<GeocodeApiResponse>(
        { error: "Location search is unavailable" },
        { status: 502 },
      );
    }

    const json = (await res.json()) as { results?: OpenMeteoGeoResult[] };

    const results: GeoSearchResult[] = (json.results ?? []).map((r) => ({
      id: r.id,
      name: r.name,
      label: [r.name, r.admin1, r.country].filter(Boolean).join(", "),
      country: r.country,
      admin1: r.admin1,
      lat: r.latitude,
      lon: r.longitude,
    }));

    return NextResponse.json<GeocodeApiResponse>({ results });
  } catch (error) {
    console.error("[api/geocode] failed:", error);
    return NextResponse.json<GeocodeApiResponse>(
      { error: "Location search failed. Please try again." },
      { status: 502 },
    );
  }
}
