/**
 * Shared EarthPulse soundscape engine (client-side).
 *
 * Builds the four-layer ambient soundscape from weather data using Tone.js,
 * which is imported dynamically so the Web Audio API is never touched
 * during server rendering or before a user gesture.
 */
import {
  humidityToRichness,
  midiToNoteName,
  temperatureToMidi,
  windToArpInterval,
  windToCutoff,
  windToIntensity,
} from "@/lib/sonification";

/** Total playback length of the evolving soundscape. */
const SOUNDSCAPE_DURATION_MS = 8000;

export interface SoundscapeInput {
  temperature: number;
  humidity: number;
  windSpeed: number;
}

export interface SoundscapeHandle {
  /** Human-readable root note (e.g. "G5") the soundscape is built on. */
  rootNote: string;
  /** Resolves when playback finishes or is replaced by another soundscape. */
  done: Promise<void>;
}

export type SoundLayer = "temperature" | "humidity" | "wind";

export interface SoundscapeLayers {
  muted: Record<SoundLayer, boolean>;
  solo: SoundLayer | null;
}

export interface SoundscapeEnergyTap {
  readEnergy: () => number;
  readData: (
    waveform: Uint8Array<ArrayBuffer>,
    spectrum: Uint8Array<ArrayBuffer>,
  ) => void;
  dispose: () => void;
}

export interface LabSoundscapeInput {
  temperature: number;
  humidity: number;
  windSpeed: number;
}

export interface LabSoundscapeSession {
  isActive: () => boolean;
  update: (input: LabSoundscapeInput) => void;
  setMuted: (layers: Record<SoundLayer, boolean>) => void;
  stop: () => void;
}

export interface AudioPlaybackLease {
  readonly isActive: boolean;
  setStop: (stop: () => void) => void;
  stop: () => void;
  release: () => void;
}

const DEFAULT_LAYERS: SoundscapeLayers = {
  muted: { temperature: false, humidity: false, wind: false },
  solo: null,
};

let soundscapeLayers = DEFAULT_LAYERS;
let activeApplyLayers: (() => void) | null = null;
let masterVolumeBeforeSpeech: number | null = null;
let speechDuckRequestId = 0;
let activePlaybackLease: AudioPlaybackLease | null = null;

/** Claim exclusive ownership of the shared audio output. */
export function acquireAudioPlayback(onStop: () => void = () => {}): AudioPlaybackLease {
  let active = true;
  let notified = false;
  let stopAudio = () => {};
  const lease: AudioPlaybackLease = {
    get isActive() {
      return active && activePlaybackLease === lease;
    },
    setStop(stop) {
      stopAudio = stop;
      if (!active) stopAudio();
    },
    stop() {
      if (!active) return;
      active = false;
      if (activePlaybackLease === lease) activePlaybackLease = null;
      stopAudio();
      if (!notified) {
        notified = true;
        onStop();
      }
    },
    release() {
      if (!active) return;
      active = false;
      if (activePlaybackLease === lease) activePlaybackLease = null;
    },
  };

  const previous = activePlaybackLease;
  activePlaybackLease = lease;
  previous?.stop();
  return lease;
}

/** Stop whichever audio experience currently owns the shared output. */
export function stopSoundscape(): void {
  const lease = activePlaybackLease;
  activeApplyLayers = null;
  lease?.stop();
}

/** Play a short, quiet success cue without changing the soundscape routing. */
export async function playCaseCrackedChime(): Promise<void> {
  let chime: import("tone").Synth | null = null;
  let disposeTimer: number | null = null;
  const lease = acquireAudioPlayback(() => {});
  lease.setStop(() => {
    if (chime) {
      if (disposeTimer !== null) window.clearTimeout(disposeTimer);
      chime.dispose();
      chime = null;
    }
  });

  try {
    const Tone = await import("tone");
    await Tone.start();
    if (!lease.isActive) return;
    chime = new Tone.Synth({
      oscillator: { type: "sine" },
      envelope: { attack: 0.015, decay: 0.12, sustain: 0.08, release: 0.35 },
      volume: -18,
    }).toDestination();
    const now = Tone.now();
    chime.triggerAttackRelease("C5", "8n", now);
    chime.triggerAttackRelease("E5", "8n", now + 0.13);
    chime.triggerAttackRelease("G5", "4n", now + 0.27);
    disposeTimer = window.setTimeout(() => {
      chime?.dispose();
      chime = null;
      lease.release();
    }, 1000);
  } catch (error) {
    lease.release();
    throw error;
  }
}

/** Update isolation controls immediately, including during active playback. */
export function setSoundscapeLayers(layers: SoundscapeLayers): void {
  soundscapeLayers = layers;
  activeApplyLayers?.();
}

/** Gently duck the shared master output while speech narration is active. */
export async function setSpeechDucking(ducked: boolean): Promise<void> {
  const requestId = ++speechDuckRequestId;
  const Tone = await import("tone");
  if (requestId !== speechDuckRequestId) return;

  const masterVolume = Tone.Destination.volume;
  if (ducked) {
    if (masterVolumeBeforeSpeech === null) {
      masterVolumeBeforeSpeech = masterVolume.value;
    }
    masterVolume.rampTo(masterVolumeBeforeSpeech - 8, 0.25);
    return;
  }

  if (masterVolumeBeforeSpeech !== null) {
    masterVolume.rampTo(masterVolumeBeforeSpeech, 0.35);
    masterVolumeBeforeSpeech = null;
  }
}

/**
 * Attach a read-only analyser branch to the master output for visualization.
 * The analyser is never connected back to the audio graph or speakers.
 */
export async function createSoundscapeEnergyTap(): Promise<SoundscapeEnergyTap> {
  const Tone = await import("tone");
  const analyser = Tone.getContext().rawContext.createAnalyser();
  analyser.fftSize = 256;
  analyser.smoothingTimeConstant = 0.65;

  const masterOutput = Tone.Destination.output.output;
  masterOutput.connect(analyser);

  const samples = new Uint8Array(analyser.fftSize);
  let disposed = false;

  return {
    readEnergy() {
      if (disposed) return 0;
      analyser.getByteTimeDomainData(samples);
      let sum = 0;
      for (const sample of samples) {
        const amplitude = (sample - 128) / 128;
        sum += amplitude * amplitude;
      }
      return Math.min(1, Math.sqrt(sum / samples.length) * 7);
    },
    readData(waveform, spectrum) {
      if (disposed) return;
      analyser.getByteTimeDomainData(waveform);
      analyser.getByteFrequencyData(spectrum);
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      masterOutput.disconnect(analyser);
      analyser.disconnect();
    },
  };
}

/** Start an independent, continuously adjustable soundscape for the Lab. */
export async function startLabSoundscape(
  initialInput: LabSoundscapeInput,
  onStopped: () => void = () => {},
): Promise<LabSoundscapeSession> {
  let stopped = false;
  let cleanup = () => {};
  const lease = acquireAudioPlayback(onStopped);
  lease.setStop(() => {
    stopped = true;
    cleanup();
  });

  let Tone: typeof import("tone");
  try {
    Tone = await import("tone");
    await Tone.start();
  } catch (error) {
    lease.release();
    throw error;
  }
  if (stopped) return { isActive: () => false, update() {}, setMuted() {}, stop() {} };

  const padReverb = new Tone.Reverb({ decay: 2, wet: 0.06 });
  const arpReverb = new Tone.Reverb({ decay: 1.5, wet: 0.04 });
  try {
    await Promise.all([padReverb.ready, arpReverb.ready]);
  } catch (error) {
    padReverb.dispose();
    arpReverb.dispose();
    lease.release();
    throw error;
  }
  if (stopped) {
    padReverb.dispose();
    arpReverb.dispose();
    return { isActive: () => false, update() {}, setMuted() {}, stop() {} };
  }

  const output = new Tone.Gain(0);
  const compressor = new Tone.Compressor(-18, 3);
  const limiter = new Tone.Limiter(-1);
  output.chain(compressor, limiter, Tone.Destination);

  const rootPad = new Tone.FMSynth({
    harmonicity: 1,
    modulationIndex: 1,
    oscillator: { type: "sine" },
    modulation: { type: "sine" },
    envelope: { attack: 1.5, decay: 0.5, sustain: 0.8, release: 2 },
  });
  const padFilter = new Tone.Filter({
    frequency: 250,
    type: "lowpass",
    rolloff: -12,
  });
  const chorus = new Tone.Chorus({
    frequency: 0.3,
    delayTime: 4,
    depth: 0.6,
    wet: 0.3,
  }).start();
  const temperatureGain = new Tone.Gain(1);
  const humidityGain = new Tone.Gain(1);
  const windGain = new Tone.Gain(1);
  rootPad.chain(padFilter, chorus, padReverb, temperatureGain, output);

  const harmonicVoices = [1.5, 2, 2.25].map((interval) => {
    const voice = new Tone.FMSynth({
      harmonicity: 1,
      modulationIndex: 1,
      oscillator: { type: "sine" },
      modulation: { type: "sine" },
      envelope: { attack: 1.5, decay: 0.5, sustain: 0.8, release: 2 },
    });
    const voiceGain = new Tone.Gain(interval === 2.25 ? 0 : 1);
    voice.chain(voiceGain, padFilter, chorus, padReverb, humidityGain, output);
    return { voice, voiceGain, interval };
  });

  const drone = new Tone.Oscillator({ frequency: 55, type: "sine" });
  const droneVolume = new Tone.Volume(-18);
  drone.chain(droneVolume, temperatureGain);

  const arp = new Tone.PolySynth(Tone.Synth, {
    oscillator: { type: "triangle" },
    envelope: { attack: 0.01, decay: 0.8, sustain: 0, release: 1.5 },
  });
  const arpDelay = new Tone.FeedbackDelay({
    delayTime: windToArpInterval(initialInput.windSpeed),
    feedback: 0.28,
    wet: 0.16,
  });
  arp.chain(arpDelay, arpReverb, windGain, output);

  const windFilter = new Tone.Filter({
    frequency: windToCutoff(initialInput.windSpeed),
    type: "bandpass",
    rolloff: -24,
  });
  const windNoise = new Tone.Noise("pink");
  const noiseVolume = new Tone.Volume(-38);
  windNoise.chain(windFilter, noiseVolume, windGain);

  const scale = [0, 3, 5, 7, 10, 12];
  let arpTimer: ReturnType<typeof setTimeout> | null = null;
  let latestInput = initialInput;
  let arpInterval = windToArpInterval(initialInput.windSpeed);
  let noteIndex = 0;
  let muted: Record<SoundLayer, boolean> = {
    temperature: false,
    humidity: false,
    wind: false,
  };

  const applyInput = (input: LabSoundscapeInput, ramp = 0.25) => {
    latestInput = input;
    const midi = temperatureToMidi(input.temperature);
    const frequency = Tone.Frequency(midi, "midi").toFrequency();
    const richness = humidityToRichness(input.humidity);
    const windIntensity = windToIntensity(input.windSpeed);
    const now = Tone.now();

    rootPad.frequency.rampTo(frequency, ramp, now);
    rootPad.harmonicity.rampTo(muted.humidity ? 1 : 1 + richness * 6, ramp, now);
    rootPad.modulationIndex.rampTo(muted.humidity ? 0 : 1 + richness * 14, ramp, now);
    rootPad.volume.rampTo(-8 - (1 - richness) * 8, ramp, now);
    padFilter.frequency.rampTo(
      muted.humidity ? 20000 : 250 + richness * 4500,
      ramp,
      now,
    );
    chorus.wet.rampTo(muted.humidity ? 0 : 0.3 + richness * 0.4, ramp, now);
    temperatureGain.gain.rampTo(muted.temperature ? 0 : 1, ramp, now);
    humidityGain.gain.rampTo(muted.humidity ? 0 : 1, ramp, now);

    harmonicVoices.forEach(({ voice, voiceGain, interval }) => {
      voice.frequency.rampTo(frequency * interval, ramp, now);
      voice.harmonicity.rampTo(1 + richness * 6, ramp, now);
      voice.modulationIndex.rampTo(1 + richness * 14, ramp, now);
      voice.volume.rampTo(-8 - (1 - richness) * 8, ramp, now);
      voiceGain.gain.rampTo(
        interval === 2.25 && richness <= 0.4 ? 0 : 1,
        ramp,
        now,
      );
    });

    drone.frequency.rampTo(frequency / 2, ramp, now);
    windFilter.frequency.rampTo(windToCutoff(input.windSpeed), ramp, now);
    noiseVolume.volume.rampTo(-38 + windIntensity * 16, ramp, now);
    windGain.gain.rampTo(muted.wind ? 0 : 1, ramp, now);
    arp.volume.rampTo(-30 + windIntensity * 12, ramp, now);
  };

  const applyMuteState = (next: Record<SoundLayer, boolean>) => {
    muted = next;
    applyInput(latestInput, 0.08);
  };

  const startTime = Tone.now();
  output.gain.rampTo(0.55, 0.35, startTime);
  const initialRichness = humidityToRichness(initialInput.humidity);
  rootPad.volume.value = -8 - (1 - initialRichness) * 8;
  harmonicVoices.forEach(({ voice }) => {
    voice.volume.value = -8 - (1 - initialRichness) * 8;
  });
  applyInput(initialInput);
  const initialMidi = temperatureToMidi(initialInput.temperature);
  const initialFrequency = Tone.Frequency(initialMidi, "midi").toFrequency();
  rootPad.triggerAttack(initialFrequency, startTime, 0.8);
  harmonicVoices.forEach(({ voice, interval }) => {
    voice.triggerAttack(initialFrequency * interval, startTime, 0.8);
  });
  drone.start(startTime);
  windNoise.start(startTime);

  const scheduleArpeggio = () => {
    if (stopped) return;
    const rootMidi = temperatureToMidi(latestInput.temperature);
    const now = Tone.now();
    const elapsed = now - startTime;
    const wave = Math.sin(
      (elapsed / (SOUNDSCAPE_DURATION_MS / 1000)) * Math.PI * 2,
    );
    const scaleIndex = (noteIndex + (wave > 0 ? 1 : 0)) % scale.length;
    noteIndex++;
    const frequency = Tone.Frequency(rootMidi + scale[scaleIndex], "midi").toFrequency();
    arp.triggerAttackRelease(frequency, 0.3, now, 0.5);
    arpTimer = setTimeout(scheduleArpeggio, arpInterval * 1000);
  };

  const setArpeggioRate = (interval: number, initial = false) => {
    if (arpTimer !== null) clearTimeout(arpTimer);
    arpInterval = interval;
    if (!stopped) {
      arpTimer = setTimeout(scheduleArpeggio, initial ? 0.8 * 1000 : arpInterval * 1000);
    }
  };
  setArpeggioRate(arpInterval, true);
  const nodes = [
    output, compressor, limiter,
    rootPad, padFilter, chorus, padReverb, temperatureGain, humidityGain,
    ...harmonicVoices.flatMap(({ voice, voiceGain }) => [voice, voiceGain]),
    drone, droneVolume,
    arp, arpDelay, arpReverb, windGain,
    windFilter, windNoise, noiseVolume,
  ];
  cleanup = () => {
    if (stopped) return;
    stopped = true;
    if (arpTimer !== null) clearTimeout(arpTimer);
    const stopTime = Tone.now();
    output.gain.value = 0;
    rootPad.triggerRelease(stopTime);
    harmonicVoices.forEach(({ voice }) => voice.triggerRelease(stopTime));
    drone.stop(stopTime + 0.22);
    windNoise.stop(stopTime + 0.22);
    setTimeout(() => {
      nodes.forEach((node) => node.dispose());
    }, 260);
  };
  lease.setStop(cleanup);

  return {
    isActive: () => lease.isActive,
    update(input) {
      if (stopped) return;
      applyInput(input);
      const nextInterval = windToArpInterval(input.windSpeed);
      if (Math.abs(nextInterval - arpInterval) >= 0.08) {
        setArpeggioRate(nextInterval);
      }
    },
    setMuted: applyMuteState,
    stop() {
      lease.stop();
    },
  };
}

/**
 * Play the soundscape for the given weather, replacing any soundscape
 * already playing (so A/B comparisons cut over immediately).
 */
export async function playSoundscape(
  input: SoundscapeInput,
  onStopped: () => void = () => {},
): Promise<SoundscapeHandle> {
  const lease = acquireAudioPlayback(onStopped);
  lease.setStop(() => {});
  let Tone: typeof import("tone");
  try {
    Tone = await import("tone");
    await Tone.start();
  } catch (error) {
    lease.release();
    throw error;
  }
  if (!lease.isActive) {
    return { rootNote: midiToNoteName(temperatureToMidi(input.temperature)), done: Promise.resolve() };
  }

  // --- Mappings -----------------------------------------------------
  const rootMidi = temperatureToMidi(input.temperature);
  const rootFreq = Tone.Frequency(rootMidi, "midi").toFrequency();
  const richness = humidityToRichness(input.humidity);
  const windIntensity = windToIntensity(input.windSpeed);
  const arpInterval = windToArpInterval(input.windSpeed);
  const windCutoff = windToCutoff(input.windSpeed);

  // Wait for convolution buffers before scheduling any voices, avoiding gaps.
  const padReverb = new Tone.Reverb({ decay: 2, wet: 0.06 });
  const arpReverb = new Tone.Reverb({ decay: 1.5, wet: 0.04 });
  try {
    await Promise.all([padReverb.ready, arpReverb.ready]);
  } catch (error) {
    padReverb.dispose();
    arpReverb.dispose();
    lease.release();
    throw error;
  }
  if (!lease.isActive) {
    padReverb.dispose();
    arpReverb.dispose();
    return { rootNote: midiToNoteName(rootMidi), done: Promise.resolve() };
  }

  const now = Tone.now();

  // --- Temperature root and humidity enrichment ----------------------
  const rootPad = new Tone.FMSynth({
    harmonicity: 1 + richness * 6,
    modulationIndex: 1 + richness * 14,
    oscillator: { type: "sine" },
    modulation: { type: "sine" },
    envelope: { attack: 1.5, decay: 0.5, sustain: 0.8, release: 2 },
  });
  rootPad.volume.value = -8 - (1 - richness) * 8;
  rootPad.triggerAttackRelease(rootFreq, SOUNDSCAPE_DURATION_MS / 1000 - 1, now, 0.8);

  const harmonics = new Tone.PolySynth(Tone.FMSynth, {
    harmonicity: 1 + richness * 6,
    modulationIndex: 1 + richness * 14,
    oscillator: { type: "sine" },
    modulation: { type: "sine" },
    envelope: { attack: 1.5, decay: 0.5, sustain: 0.8, release: 2 },
  });
  harmonics.volume.value = -8 - (1 - richness) * 8;

  const padFilter = new Tone.Filter({
    frequency: 250 + richness * 4500,
    type: "lowpass",
    rolloff: -12,
  });

  const chorus = new Tone.Chorus({
    frequency: 0.3,
    delayTime: 4,
    depth: 0.6,
    wet: 0.3 + richness * 0.4,
  }).start();

  const temperatureGain = new Tone.Gain(1);
  const humidityGain = new Tone.Gain(1);
  const windGain = new Tone.Gain(1);
  const soundscapeBus = new Tone.Gain(0);
  const compressor = new Tone.Compressor(-18, 3);
  const limiter = new Tone.Limiter(-1);
  soundscapeBus.chain(compressor, limiter, Tone.Destination);
  rootPad.chain(padFilter, chorus, padReverb, temperatureGain, soundscapeBus);
  harmonics.chain(padFilter, chorus, padReverb, humidityGain, soundscapeBus);
  soundscapeBus.gain.rampTo(0.55, 0.35, now);

  const upperVoices = [rootFreq * 1.5, rootFreq * 2];
  if (richness > 0.4) upperVoices.push(rootFreq * 2.25);
  harmonics.triggerAttackRelease(
    upperVoices,
    SOUNDSCAPE_DURATION_MS / 1000 - 1,
    now,
    0.8,
  );

  // --- Temperature sub drone -----------------------------------------
  const drone = new Tone.Oscillator({
    frequency: rootFreq / 2,
    type: "sine",
  });
  const droneVol = new Tone.Volume(-18);
  drone.chain(droneVol, temperatureGain);
  drone.start(now);
  drone.stop(now + SOUNDSCAPE_DURATION_MS / 1000 + 2);

  // --- Wind-shaped arpeggio -------------------------------------------
  const arp = new Tone.PolySynth(Tone.Synth, {
    oscillator: { type: "triangle" },
    envelope: { attack: 0.01, decay: 0.8, sustain: 0, release: 1.5 },
  });
  arp.volume.value = -30 + windIntensity * 12;

  const arpDelay = new Tone.FeedbackDelay({
    delayTime: arpInterval,
    feedback: 0.28,
    wet: 0.16,
  });
  arp.chain(arpDelay, arpReverb, windGain, soundscapeBus);

  const scale = [0, 3, 5, 7, 10, 12];
  let i = 0;
  const totalSeconds = SOUNDSCAPE_DURATION_MS / 1000;
  for (let t = 0.8; t < totalSeconds - 0.5; t += arpInterval) {
    const wave = Math.sin((t / totalSeconds) * Math.PI * 2);
    const idx = Math.floor(
      ((i + (wave > 0 ? 1 : 0)) % scale.length + scale.length) % scale.length,
    );
    const freq = Tone.Frequency(rootMidi + scale[idx], "midi").toFrequency();
    arp.triggerAttackRelease(freq, 0.3, now + t, 0.5);
    i++;
  }

  // --- Wind-noise bed -------------------------------------------------
  const noise = new Tone.Noise("pink");
  const noiseFilter = new Tone.Filter({
    frequency: windCutoff,
    type: "bandpass",
    rolloff: -24,
  });
  const noiseVol = new Tone.Volume(-38 + windIntensity * 16);
  noise.chain(noiseFilter, noiseVol, windGain);
  noise.start(now);
  noise.stop(now + SOUNDSCAPE_DURATION_MS / 1000 + 2);

  noiseVol.volume.rampTo(-36 + windIntensity * 14, 2, now);
  noiseVol.volume.rampTo(-50, 2.5, now + SOUNDSCAPE_DURATION_MS / 1000 - 2.5);

  const isLayerActive = (layer: SoundLayer) =>
    soundscapeLayers.solo === null
      ? !soundscapeLayers.muted[layer]
      : soundscapeLayers.solo === layer && !soundscapeLayers.muted[layer];
  const applyLayers = () => {
    const temperatureActive = isLayerActive("temperature");
    const humidityActive = isLayerActive("humidity");
    const windActive = isLayerActive("wind");
    const applyTime = Tone.now();

    temperatureGain.gain.rampTo(temperatureActive ? 1 : 0, 0.12, applyTime);
    humidityGain.gain.rampTo(humidityActive ? 1 : 0, 0.12, applyTime);
    windGain.gain.rampTo(windActive ? 1 : 0, 0.12, applyTime);

    rootPad.harmonicity.value = humidityActive ? 1 + richness * 6 : 1;
    rootPad.modulationIndex.value = humidityActive ? 1 + richness * 14 : 0;
    padFilter.frequency.rampTo(
      humidityActive ? 250 + richness * 4500 : 20000,
      0.08,
      applyTime,
    );
    chorus.wet.rampTo(humidityActive ? 0.3 + richness * 0.4 : 0, 0.08, applyTime);
  };
  applyLayers();
  activeApplyLayers = applyLayers;

  // --- Lifecycle -------------------------------------------------------
  const nodes = [
    rootPad, harmonics, padFilter, chorus, padReverb,
    temperatureGain, humidityGain,
    drone, droneVol,
    arp, arpDelay, arpReverb, windGain,
    noise, noiseFilter, noiseVol,
    soundscapeBus, compressor, limiter,
  ];

  let finish: () => void;
  const done = new Promise<void>((resolve) => {
    finish = resolve;
  });

  let disposed = false;
  const disposeNodes = () => {
    if (disposed) return;
    disposed = true;
    clearTimeout(timeoutId);
    nodes.forEach((node) => node.dispose());
    if (activeApplyLayers === applyLayers) activeApplyLayers = null;
    lease.release();
    finish();
  };

  const cleanup = () => {
    if (disposed) return;
    clearTimeout(timeoutId);
    soundscapeBus.gain.value = 0;
    disposeNodes();
  };

  const timeoutId = setTimeout(() => cleanup(), SOUNDSCAPE_DURATION_MS + 2500);
  lease.setStop(cleanup);

  return { rootNote: midiToNoteName(rootMidi), done };
}
