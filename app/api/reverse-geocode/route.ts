import { NextResponse } from "next/server";

interface BigDataCloudResult {
  city?: string;
  locality?: string;
  principalSubdivision?: string;
  countryName?: string;
}

/** Memoized in-flight reverse geocode requests. */
const pending = new Map<string, Promise<string>>();

function cacheKey(lat: number, lon: number): string {
  // Round to ~1km so repeated nearby clicks reuse the same request.
  return `${lat.toFixed(2)},${lon.toFixed(2)}`;
}

/**
 * GET /api/reverse-geocode?lat=..&lon=..
 * Resolves a clicked map point to a human-readable place name using the
 * free BigDataCloud API (no key required). Falls back to coordinates.
 */
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);

  const lat = Number.parseFloat(searchParams.get("lat") ?? "");
  const lon = Number.parseFloat(searchParams.get("lon") ?? "");

  if (!Number.isFinite(lat) || !Number.isFinite(lon)) {
    return NextResponse.json({ error: "Valid lat and lon are required" }, { status: 400 });
  }

  const key = cacheKey(lat, lon);

  try {
    let namePromise = pending.get(key);
    if (!namePromise) {
      namePromise = (async () => {
        const url = new URL(
          "https://api.bigdatacloud.net/data/reverse-geocode-client",
        );
        url.searchParams.set("latitude", String(lat));
        url.searchParams.set("longitude", String(lon));
        url.searchParams.set("localityLanguage", "en");

        const res = await fetch(url, { next: { revalidate: 86400 } });
        if (!res.ok) throw new Error(`status ${res.status}`);

        const json = (await res.json()) as BigDataCloudResult;
        const place =
          json.city ?? json.locality ?? json.principalSubdivision ?? null;
        const parts = [place, json.countryName].filter(Boolean);
        return parts.length > 0 ? parts.join(", ") : `${lat.toFixed(2)}, ${lon.toFixed(2)}`;
      })();

      pending.set(key, namePromise);
      // Allow the memoized entry to be GC'd and re-fetched later if needed.
      namePromise.finally(() => pending.delete(key)).catch(() => {});
    }

    const name = await namePromise;
    return NextResponse.json({ name });
  } catch (error) {
    console.error("[api/reverse-geocode] failed:", error);
    // Graceful fallback: coordinates are a perfectly usable label.
    return NextResponse.json({ name: `${lat.toFixed(2)}, ${lon.toFixed(2)}` });
  }
}
