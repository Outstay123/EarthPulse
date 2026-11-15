/**
 * Weather-to-sound mappings for EarthPulse sonification.
 *
 * Design goal: real-world weather differences must be clearly audible.
 * Ranges are normalized to what Earth actually produces (not theoretical
 * 0–100 scales), and consumers amplify these factors into obvious
 * parameter swings.
 */

/* ------------------------------------------------------------------ */
/* Temperature -> pitch                                                */
/* ------------------------------------------------------------------ */

/**
 * Anchor points (piecewise-linear in semitones / MIDI space).
 * Extended to -40..50°C so polar and tropical climates land octaves
 * apart instead of saturating at the old 10°C floor.
 */
export interface PitchAnchor {
  celsius: number;
  midi: number;
}

const ANCHORS: PitchAnchor[] = [
  { celsius: -40, midi: 24 }, // C1  — deep polar
  { celsius: -20, midi: 36 }, // C2  — continental winter
  { celsius: 0, midi: 43 }, //  G2  — freezing
  { celsius: 10, midi: 48 }, //  C3  — cool
  { celsius: 20, midi: 64 }, //  E4  — temperate
  { celsius: 30, midi: 79 }, //  G5  — tropical
  { celsius: 40, midi: 84 }, //  C6  — desert heat
  { celsius: 50, midi: 88 }, //  E6  — extreme heat
];

/** Map a temperature in °C to a continuous MIDI note number. */
export function temperatureToMidi(celsius: number): number {
  if (celsius <= ANCHORS[0].celsius) return ANCHORS[0].midi;
  if (celsius >= ANCHORS[ANCHORS.length - 1].celsius) {
    return ANCHORS[ANCHORS.length - 1].midi;
  }

  for (let i = 0; i < ANCHORS.length - 1; i++) {
    const a = ANCHORS[i];
    const b = ANCHORS[i + 1];
    if (celsius >= a.celsius && celsius <= b.celsius) {
      const t = (celsius - a.celsius) / (b.celsius - a.celsius);
      return a.midi + t * (b.midi - a.midi);
    }
  }

  return ANCHORS[0].midi;
}

/** Convert a MIDI note number to frequency in Hz. */
export function midiToFrequency(midi: number): number {
  return 440 * Math.pow(2, (midi - 69) / 12);
}

/** Human-readable note name (e.g. "C3", "F#4") for a MIDI number. */
export function midiToNoteName(midi: number): string {
  const NAMES = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"];
  const rounded = Math.round(midi);
  const name = NAMES[rounded % 12];
  const octave = Math.floor(rounded / 12) - 1;
  return `${name}${octave}`;
}

/** The note frequency for a temperature, per the EarthPulse mapping. */
export function temperatureToFrequency(celsius: number): number {
  return midiToFrequency(temperatureToMidi(celsius));
}

/* ------------------------------------------------------------------ */
/* Humidity -> harmonic richness (0..1)                                */
/* ------------------------------------------------------------------ */

/**
 * Real-world surface humidity almost always sits between 30% (deserts)
 * and 100% (rainforest), so normalize to that band rather than 0..100.
 * 40% -> 0.14, 70% -> 0.57, 90% -> 0.86.
 */
const HUMIDITY_FLOOR = 30;
const HUMIDITY_CEILING = 100;

/** Map relative humidity (%) to a 0..1 harmonic-richness factor. */
export function humidityToRichness(percent: number): number {
  return clamp01(
    (percent - HUMIDITY_FLOOR) / (HUMIDITY_CEILING - HUMIDITY_FLOOR),
  );
}

/* ------------------------------------------------------------------ */
/* Wind speed -> rhythmic intensity (0..1)                             */
/* ------------------------------------------------------------------ */

/**
 * Winds above ~12 m/s are rare and meteorologically extreme, and gentle
 * breezes (0-5 m/s) are where most locations live, so the curve rises
 * fast at the low end and saturates at 12 m/s.
 */
const WIND_ANCHORS: { ms: number; intensity: number }[] = [
  { ms: 0, intensity: 0 }, //   calm
  { ms: 2, intensity: 0.3 }, // light breeze
  { ms: 5, intensity: 0.6 }, // moderate breeze
  { ms: 8, intensity: 0.8 }, // fresh breeze
  { ms: 12, intensity: 1 }, //  strong wind
];

/** Map wind speed (m/s) to a 0..1 rhythmic-intensity factor. */
export function windToIntensity(windSpeed: number): number {
  if (windSpeed <= WIND_ANCHORS[0].ms) return WIND_ANCHORS[0].intensity;
  if (windSpeed >= WIND_ANCHORS[WIND_ANCHORS.length - 1].ms) {
    return WIND_ANCHORS[WIND_ANCHORS.length - 1].intensity;
  }

  for (let i = 0; i < WIND_ANCHORS.length - 1; i++) {
    const a = WIND_ANCHORS[i];
    const b = WIND_ANCHORS[i + 1];
    if (windSpeed >= a.ms && windSpeed <= b.ms) {
      const t = (windSpeed - a.ms) / (b.ms - a.ms);
      return a.intensity + t * (b.intensity - a.intensity);
    }
  }

  return 0;
}

/** Arpeggio note interval (seconds); windier = faster rhythmic motion. */
export function windToArpInterval(windSpeed: number): number {
  // Calm -> one note every ~1.6s; strong wind -> every ~0.35s (4.5x).
  return 1.6 - windToIntensity(windSpeed) * 1.25;
}

/** Filter cutoff (Hz) for the wind-noise bed; windier = brighter hiss. */
export function windToCutoff(windSpeed: number): number {
  // Exponential-ish curve: gentle breezes stay a dark rumble, moderate
  // winds open up into audible airy texture.
  const t = Math.pow(windToIntensity(windSpeed), 1.4);
  return 200 + t * 3800;
}

function clamp01(value: number): number {
  return Math.min(1, Math.max(0, value));
}

/* ------------------------------------------------------------------ */
/* Descriptive style labels for the Earth Signature panel              */
/* ------------------------------------------------------------------ */

/** Temperature bucket for display ("Extreme Heat", "Very Cold", …). */
export function temperatureStyle(celsius: number): string {
  if (celsius < -20) return "Extreme Cold";
  if (celsius < 0) return "Very Cold";
  if (celsius < 10) return "Cold";
  if (celsius < 18) return "Cool";
  if (celsius < 25) return "Mild";
  if (celsius < 32) return "Warm";
  if (celsius < 40) return "Hot";
  return "Extreme Heat";
}

/** Humidity bucket for display ("Very Dry", "Moderately Rich", …). */
export function humidityStyle(percent: number): string {
  const r = humidityToRichness(percent);
  if (r < 0.2) return "Very Dry";
  if (r < 0.45) return "Sparse";
  if (r < 0.7) return "Moderately Rich";
  return "Lush and Dense";
}

/** Wind bucket for display ("Calm", "Extreme Winds", …). */
export function windStyle(windSpeed: number): string {
  const i = windToIntensity(windSpeed);
  if (i < 0.15) return "Calm";
  if (i < 0.4) return "Light Breeze";
  if (i < 0.65) return "Moderate Winds";
  if (i < 0.85) return "Strong Winds";
  return "Extreme Winds";
}
