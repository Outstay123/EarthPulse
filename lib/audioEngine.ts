import {
  type SoundLayer,
  type SoundscapeLayers,
  startLabSoundscape,
  stopSoundscape,
  type LabSoundscapeInput,
  type LabSoundscapeSession,
} from "@/lib/soundscape";

type MysteryTelemetry = Pick<LabSoundscapeInput, "temperature" | "humidity" | "windSpeed">;

let activeSession: LabSoundscapeSession | null = null;
let requestId = 0;
let mysteryLayers: SoundscapeLayers = {
  muted: { temperature: false, humidity: false, wind: false },
  solo: null,
};

function effectiveMutes(layers: SoundscapeLayers): Record<SoundLayer, boolean> {
  return {
    temperature:
      layers.muted.temperature ||
      (layers.solo !== null && layers.solo !== "temperature"),
    humidity:
      layers.muted.humidity || (layers.solo !== null && layers.solo !== "humidity"),
    wind: layers.muted.wind || (layers.solo !== null && layers.solo !== "wind"),
  };
}

/** Start a persistent mystery transmission using the shared climate-mapped synth graph. */
export async function playMysteryAudio(
  telemetry: MysteryTelemetry,
  onStopped: () => void = () => {},
): Promise<void> {
  const currentRequest = ++requestId;
  activeSession?.stop();
  activeSession = null;

  const session = await startLabSoundscape(telemetry, () => {
    if (currentRequest === requestId) {
      activeSession = null;
      onStopped();
    }
  });
  if (currentRequest !== requestId || !session.isActive()) {
    session.stop();
    return;
  }
  session.setMuted(effectiveMutes(mysteryLayers));
  activeSession = session;
}

/** Apply per-layer isolation to the active mystery soundscape. */
export function setMysteryAudioLayers(layers: SoundscapeLayers): void {
  mysteryLayers = {
    muted: { ...layers.muted },
    solo: layers.solo,
  };
  activeSession?.setMuted(effectiveMutes(mysteryLayers));
}

/** Stop the persistent mystery transmission with the Lab's gentle gain ramp. */
export function stopAudio(): void {
  requestId++;
  const session = activeSession;
  activeSession = null;
  session?.stop();
  stopSoundscape();
}
