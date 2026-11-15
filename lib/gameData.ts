import type { WeatherData } from "@/types/weather";

export interface GeoGuessrTarget {
  id: string;
  name: string;
  lat: number;
  lon: number;
  region: string;
  description: string;
}

export interface GeoGuessrRound {
  id: string;
  title: string;
  difficulty: "intro" | "easy" | "medium" | "hard" | "expert";
  objective: string;
  targets: GeoGuessrTarget[];
  contrastTargets?: GeoGuessrTarget[];
}

const recentTargetIds: string[] = [];

export const GEOGUESSR_ROUNDS: GeoGuessrRound[] = [
  {
    id: "extreme-contrast",
    title: "Extreme Contrast",
    difficulty: "intro",
    objective: "Identify whether this live signal comes from a hot, arid desert or a frozen polar region by its temperature-mapped pitch and texture.",
    targets: [
      { id: "sahara", name: "Sahara Desert", lat: 25, lon: 13, region: "North Africa", description: "Hot, arid desert climate with a bright root and sparse harmonics." },
      { id: "death-valley", name: "Death Valley", lat: 36.5323, lon: -116.9325, region: "North America", description: "An arid desert basin with low moisture and a characteristically dry harmonic signature." },
      { id: "rub-al-khali", name: "Rub' al Khali", lat: 20.5, lon: 51, region: "Arabian Peninsula", description: "A vast hot desert where dry air shapes a sparse, crystalline sound." },
      { id: "lut-desert", name: "Dasht-e Lut", lat: 30.5, lon: 59.0, region: "Iranian Plateau", description: "A hyper-arid desert landscape with a dry, bright acoustic profile." },
      { id: "antarctica", name: "Antarctic Ice Sheet", lat: -75.25, lon: 0.07, region: "Antarctica", description: "Extreme polar cold, often paired with sub-bass roots and forceful katabatic winds." },
      { id: "alert", name: "Alert, Nunavut", lat: 82.5018, lon: -62.3481, region: "Canadian Arctic", description: "A high-Arctic settlement whose cold climate maps to a very low tonal foundation." },
      { id: "yakutsk", name: "Yakutsk", lat: 62.0355, lon: 129.6755, region: "Siberia", description: "A continental sub-Arctic climate with a cold-mapped root and seasonal wind texture." },
      { id: "longyearbyen", name: "Longyearbyen", lat: 78.2232, lon: 15.6469, region: "Svalbard", description: "A polar settlement with a distinctly cold climate signature." },
    ],
  },
  {
    id: "tropical-moisture",
    title: "Tropical Moisture",
    difficulty: "easy",
    objective: "Locate the warm, moisture-rich tropical rainforest from its dense harmonic stack and steady wind pulse.",
    targets: [
      { id: "amazon", name: "Amazon Basin", lat: -3.11, lon: -60.02, region: "South America", description: "Equatorial rainforest with warm roots and high atmospheric moisture." },
      { id: "manaus", name: "Manaus", lat: -3.119, lon: -60.0217, region: "Brazilian Amazon", description: "An equatorial rainforest city where warm temperatures and humidity enrich the chord." },
      { id: "iquitos", name: "Iquitos", lat: -3.7437, lon: -73.2516, region: "Peruvian Amazon", description: "A tropical rainforest climate with a warm pitch and moisture-rich harmonics." },
      { id: "singapore", name: "Singapore", lat: 1.3521, lon: 103.8198, region: "Southeast Asia", description: "A humid equatorial island city with a lush harmonic signature." },
      { id: "jakarta", name: "Jakarta", lat: -6.2088, lon: 106.8456, region: "Indonesia", description: "A warm, humid lowland climate with dense harmonic potential." },
      { id: "kuala-lumpur", name: "Kuala Lumpur", lat: 3.14, lon: 101.69, region: "Malaysia", description: "Warm equatorial baseline with rich tropical moisture." },
      { id: "kinshasa", name: "Kinshasa", lat: -4.4419, lon: 15.2663, region: "Central Africa", description: "A tropical river-basin climate mapped to a warm tonal base and humid enrichment." },
      { id: "manaus-east", name: "Santarem", lat: -2.4431, lon: -54.7083, region: "Amazonia", description: "A warm tropical climate with moisture shaping its harmonic color." },
    ],
  },
  {
    id: "open-ocean",
    title: "Open-Ocean Motion",
    difficulty: "medium",
    objective: "Find the exposed North Atlantic sector. Listen for wind-driven rhythmic motion against the tonal pad.",
    targets: [
      { id: "north-atlantic", name: "North Atlantic Current", lat: 52, lon: -35, region: "North Atlantic Ocean", description: "An exposed ocean location where wind speed shapes rapid arpeggios and filtered noise." },
      { id: "reykjavik", name: "Reykjavik", lat: 64.1466, lon: -21.9426, region: "Iceland", description: "A North Atlantic coastal signal with changeable wind-driven motion." },
      { id: "galway", name: "Galway", lat: 53.2707, lon: -9.0568, region: "Ireland", description: "A cool Atlantic coast where wind texture adds motion to the tonal layers." },
      { id: "ushuaia", name: "Ushuaia", lat: -54.8019, lon: -68.303, region: "Tierra del Fuego", description: "A subpolar coastal climate with exposed wind and a cool tonal base." },
      { id: "cape-town", name: "Cape Town", lat: -33.9249, lon: 18.4241, region: "South Africa", description: "A coastal climate with wind-driven arpeggios and changing air texture." },
      { id: "wellington", name: "Wellington", lat: -41.2866, lon: 174.7756, region: "New Zealand", description: "An exposed maritime climate where wind creates a kinetic sound layer." },
      { id: "tromso", name: "Tromso", lat: 69.6492, lon: 18.9553, region: "Norway", description: "A high-latitude coastal signal shaped by cool air and maritime wind." },
      { id: "patagonia", name: "Patagonian Steppe", lat: -50.3, lon: -72.3, region: "Argentina", description: "An open, exposed landscape with wind influencing the rhythmic layer." },
    ],
  },
  {
    id: "equatorial-city",
    title: "Equatorial City",
    difficulty: "hard",
    objective: "Distinguish a humid equatorial urban climate from other warm regions by balancing pitch, harmony, and wind.",
    targets: [
      { id: "kuala-lumpur", name: "Kuala Lumpur", lat: 3.14, lon: 101.69, region: "Malaysia", description: "Warm equatorial baseline with rich tropical moisture." },
      { id: "bangkok", name: "Bangkok", lat: 13.7563, lon: 100.5018, region: "Thailand", description: "A tropical urban climate with seasonal variation in heat and moisture." },
      { id: "ho-chi-minh", name: "Ho Chi Minh City", lat: 10.8231, lon: 106.6297, region: "Vietnam", description: "A warm southern Vietnamese city with humidity shaping its harmonic density." },
      { id: "colombo", name: "Colombo", lat: 6.9271, lon: 79.8612, region: "Sri Lanka", description: "A tropical coastal climate with warm pitch and humid air." },
      { id: "lagos", name: "Lagos", lat: 6.5244, lon: 3.3792, region: "Nigeria", description: "A warm coastal metropolis with moisture and wind shaping its sound." },
      { id: "addis-ababa", name: "Addis Ababa", lat: 8.9806, lon: 38.7578, region: "Ethiopian Highlands", description: "A tropical latitude highland city with a milder tonal foundation." },
      { id: "medellin", name: "Medellin", lat: 6.2476, lon: -75.5658, region: "Colombia", description: "A humid tropical highland climate with a balanced, warm acoustic profile." },
      { id: "dar-es-salaam", name: "Dar es Salaam", lat: -6.7924, lon: 39.2083, region: "Tanzania", description: "A humid Indian Ocean coastal climate with warm harmonics." },
    ],
  },
  {
    id: "temperate-city",
    title: "Temperate Signal",
    difficulty: "expert",
    objective: "Pinpoint a temperate coastal city using smaller differences in root pitch, harmonic density, and motion.",
    targets: [
      { id: "paris", name: "Paris", lat: 48.8584, lon: 2.2945, region: "France", description: "A temperate regional signal with less extreme acoustic characteristics." },
      { id: "london", name: "London", lat: 51.5072, lon: -0.1276, region: "United Kingdom", description: "A temperate maritime climate with a moderate pitch and harmonic profile." },
      { id: "amsterdam", name: "Amsterdam", lat: 52.3676, lon: 4.9041, region: "Netherlands", description: "A lowland maritime climate with subtle variations in wind and moisture." },
      { id: "berlin", name: "Berlin", lat: 52.52, lon: 13.405, region: "Germany", description: "A temperate continental signal with balanced tonal and harmonic qualities." },
      { id: "seattle", name: "Seattle", lat: 47.6062, lon: -122.3321, region: "United States", description: "A temperate Pacific coast climate with moderate acoustic contrast." },
      { id: "vancouver", name: "Vancouver", lat: 49.2827, lon: -123.1207, region: "Canada", description: "A mild maritime climate where wind and moisture shape a nuanced sound." },
      { id: "melbourne", name: "Melbourne", lat: -37.8136, lon: 144.9631, region: "Australia", description: "A temperate coastal city with day-to-day variation across all three sound layers." },
      { id: "santiago", name: "Santiago", lat: -33.4489, lon: -70.6693, region: "Chile", description: "A temperate basin climate with a distinct but non-extreme tonal profile." },
      { id: "san-francisco", name: "San Francisco", lat: 37.7749, lon: -122.4194, region: "United States", description: "A mild coastal climate with restrained temperature, humidity, and wind contrasts." },
      { id: "rome", name: "Rome", lat: 41.9028, lon: 12.4964, region: "Italy", description: "A Mediterranean climate with moderate warmth and seasonal moisture." },
    ],
  },
];

export function chooseRoundTarget(round: GeoGuessrRound): GeoGuessrTarget {
  const candidates = [
    ...round.targets,
    ...(round.contrastTargets ?? []),
  ];
  const fresh = candidates.filter((target) => !recentTargetIds.includes(target.id));
  const pool = fresh.length > 0 ? fresh : candidates;
  return pool[Math.floor(Math.random() * pool.length)];
}

export function rememberRoundTarget(target: GeoGuessrTarget): void {
  if (recentTargetIds[recentTargetIds.length - 1] === target.id) return;
  recentTargetIds.push(target.id);
  if (recentTargetIds.length > 20) recentTargetIds.shift();
}

export function haversineDistanceKm(
  latA: number,
  lonA: number,
  latB: number,
  lonB: number,
): number {
  const radians = (degrees: number) => (degrees * Math.PI) / 180;
  const dLat = radians(latB - latA);
  const dLon = radians(lonB - lonA);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(radians(latA)) *
      Math.cos(radians(latB)) *
      Math.sin(dLon / 2) ** 2;
  return 6371 * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

export function scoreGuess(distanceKm: number): number {
  return Math.max(0, Math.round(5000 * (1 - Math.min(distanceKm, 20000) / 20000)));
}

export function telemetryHint(weather: WeatherData): string {
  const temperature =
    weather.temperature < 0
      ? "temperature is sub-zero"
      : weather.temperature > 28
        ? "temperature is high"
        : "temperature is moderate";
  const wind =
    weather.windSpeed >= 8
      ? "wind speed is high"
      : weather.windSpeed <= 2
        ? "wind speed is calm"
        : "wind speed is moderate";
  const humidity =
    weather.humidity >= 70
      ? "humidity is high"
      : weather.humidity < 45
        ? "air is dry"
        : "humidity is moderate";
  return `Listen for the relationship between the layers: ${temperature}, ${humidity}, and ${wind}.`;
}
