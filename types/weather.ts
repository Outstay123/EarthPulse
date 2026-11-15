/**
 * Types describing the Meteomatics JSON response, the flattened weather
 * data rendered by the EarthPulse UI, and the geocoding search results.
 */

/** A single timestamped measurement inside a Meteomatics response. */
export interface MeteomaticsDatePoint {
  date: string;
  value: number;
}

/** A coordinate series for one parameter. */
export interface MeteomaticsCoordinate {
  lat: number;
  lon: number;
  dates: MeteomaticsDatePoint[];
}

/** One parameter block (e.g. "t_2m:C") of the response. */
export interface MeteomaticsParameter {
  parameter: string;
  coordinates: MeteomaticsCoordinate[];
}

/** Root of a Meteomatics JSON response. */
export interface MeteomaticsResponse {
  version: string;
  status: string;
  data: MeteomaticsParameter[];
}

/** Flattened weather snapshot rendered by the page. */
export interface WeatherData {
  location: string;
  lat: number;
  lon: number;
  temperature: number;
  /** Relative humidity, percent (0–100). */
  humidity: number;
  /** Wind speed, meters per second. */
  windSpeed: number;
  unit: "C";
  observedAt: string;
  source: "meteomatics" | "mock";
}

/** A geocoded location returned by /api/geocode. */
export interface GeoSearchResult {
  id: number;
  name: string;
  /** Display label, e.g. "Tokyo, Tokyo, Japan". */
  label: string;
  country?: string;
  admin1?: string;
  lat: number;
  lon: number;
}

/** Envelope returned by /api/geocode. */
export interface GeocodeApiResponse {
  results?: GeoSearchResult[];
  error?: string;
}

/** Envelope returned by /api/weather. */
export interface WeatherApiResponse {
  weather?: WeatherData;
  error?: string;
}
