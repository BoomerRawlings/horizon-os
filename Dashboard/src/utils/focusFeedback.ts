import type { FocusTimerMode } from "../hooks/useFocusTimer";

export type FocusAudioHandle = {
  current: AudioContext | null;
};

type FocusSoundKind = FocusTimerMode | "start";
export type CaptureSoundKind =
  | "capture-start"
  | "capture-ready"
  | "capture-input"
  | "capture-save"
  | "capture-undo"
  | "capture-error";
type HorizonSoundKind = FocusSoundKind | CaptureSoundKind | "launch" | "logo-poke";

const fallbackToneUrls = new Map<HorizonSoundKind, string>();
const fallbackToneGain = 1.0;
// Horizon's two signature sounds share one output level. The fallback gains differ
// only to normalize their very different waveforms to the same measured loudness.
const signatureSoundMasterGain = 0.82;
const launchFallbackToneGain = 1.24;
const logoLaughFallbackToneGain = 0.72;
const webAudioMasterGain = 0.68;
const webAudioNoteGain = 0.5;
const startToneFrequencies = [392, 493.88, 587.33, 659.25, 783.99, 987.77];
const launchTonePlan: Array<{
  duration: number;
  frequency: number;
  gain: number;
  glide: number;
  offset: number;
  type: OscillatorType;
}> = [
  // A quiet C/G bed gives the old ascending signal more body without turning it into
  // a startup jingle. The shorter cues line up with seed, trace, fill, and lock phases.
  { duration: 4.35, frequency: 130.81, gain: 0.15, glide: 1.012, offset: 0.02, type: "triangle" },
  { duration: 4.05, frequency: 196, gain: 0.1, glide: 1.008, offset: 0.1, type: "sine" },
  { duration: 0.72, frequency: 261.63, gain: 0.58, glide: 1.022, offset: 0.44, type: "sine" },
  { duration: 0.74, frequency: 329.63, gain: 0.5, glide: 1.018, offset: 1.04, type: "sine" },
  { duration: 0.78, frequency: 392, gain: 0.46, glide: 1.015, offset: 1.62, type: "sine" },
  { duration: 0.82, frequency: 523.25, gain: 0.44, glide: 1.012, offset: 2.22, type: "sine" },
  { duration: 1.22, frequency: 392, gain: 0.21, glide: 1.006, offset: 2.88, type: "triangle" },
  { duration: 1.16, frequency: 523.25, gain: 0.17, glide: 1.006, offset: 2.88, type: "sine" },
  { duration: 1.08, frequency: 659.25, gain: 0.14, glide: 1.006, offset: 2.88, type: "sine" },
];
const logoLaughPlan = [
  // Three tiny, bright syllables: closer to a quiet "tee-hee-hee" than a voiced character laugh.
  { duration: 0.11, endFrequency: 600, gain: 0.34, offset: 0.02, peakFrequency: 690, startFrequency: 620 },
  { duration: 0.12, endFrequency: 645, gain: 0.38, offset: 0.16, peakFrequency: 755, startFrequency: 675 },
  { duration: 0.18, endFrequency: 670, gain: 0.42, offset: 0.31, peakFrequency: 825, startFrequency: 710 },
] as const;
type LogoLaughNote = (typeof logoLaughPlan)[number];
const captureToneFrequencies: Record<CaptureSoundKind, number[]> = {
  "capture-error": [220, 196],
  "capture-input": [523.25, 493.88, 440],
  "capture-ready": [392, 523.25, 659.25],
  "capture-save": [392, 493.88, 659.25, 783.99],
  "capture-start": [329.63, 392, 493.88],
  "capture-undo": [659.25, 493.88, 392],
};

function clampVolume(volume: number) {
  if (!Number.isFinite(volume)) {
    return 0;
  }

  return Math.min(100, Math.max(0, volume));
}

function writeAscii(view: DataView, offset: number, value: string) {
  for (let index = 0; index < value.length; index += 1) {
    view.setUint8(offset + index, value.charCodeAt(index));
  }
}

function frequenciesFor(kind: HorizonSoundKind) {
  if (kind.startsWith("capture-")) {
    return captureToneFrequencies[kind as CaptureSoundKind];
  }

  if (kind === "start") {
    return startToneFrequencies;
  }

  if (kind === "launch") {
    return launchTonePlan.map((note) => note.frequency);
  }

  if (kind === "logo-poke") {
    return logoLaughPlan.map((note) => note.startFrequency);
  }

  return kind === "break" ? [659.25, 523.25, 392] : [392, 523.25, 659.25];
}

function timingFor(kind: HorizonSoundKind) {
  if (kind === "start") {
    return { durationSeconds: 1.65, noteLength: 0.48, noteSpacing: 0.1 };
  }

  if (kind.startsWith("capture-")) {
    return { durationSeconds: kind === "capture-save" ? 1.25 : 0.95, noteLength: 0.34, noteSpacing: 0.09 };
  }

  if (kind === "launch") {
    return { durationSeconds: 4.72, noteLength: 0.74, noteSpacing: 0.56 };
  }

  if (kind === "logo-poke") {
    return { durationSeconds: 0.58, noteLength: 0.16, noteSpacing: 0.15 };
  }

  return { durationSeconds: 1.15, noteLength: 0.5, noteSpacing: 0.12 };
}

function noteStartFor(kind: HorizonSoundKind, noteIndex: number, fallbackSpacing: number) {
  if (kind === "launch") {
    return launchTonePlan[noteIndex]?.offset ?? noteIndex * fallbackSpacing;
  }

  if (kind === "logo-poke") {
    return logoLaughPlan[noteIndex]?.offset ?? noteIndex * fallbackSpacing;
  }

  return noteIndex * fallbackSpacing;
}

function laughFrequencyAt(note: LogoLaughNote, progress: number) {
  const peakAt = 0.3;
  if (progress <= peakAt) {
    const rise = Math.sin((progress / peakAt) * (Math.PI / 2));
    return note.startFrequency + (note.peakFrequency - note.startFrequency) * rise;
  }

  const fall = (progress - peakAt) / (1 - peakAt);
  const easedFall = fall * fall * (3 - 2 * fall);
  return note.peakFrequency + (note.endFrequency - note.peakFrequency) * easedFall;
}

function fallbackToneUrl(kind: HorizonSoundKind) {
  const cached = fallbackToneUrls.get(kind);
  if (cached) {
    return cached;
  }

  const sampleRate = 44_100;
  const { durationSeconds, noteLength, noteSpacing } = timingFor(kind);
  const sampleCount = Math.floor(sampleRate * durationSeconds);
  const bytesPerSample = 2;
  const dataSize = sampleCount * bytesPerSample;
  const buffer = new ArrayBuffer(44 + dataSize);
  const view = new DataView(buffer);
  const frequencies = frequenciesFor(kind);
  const toneGain = kind === "launch" ? launchFallbackToneGain : fallbackToneGain;

  writeAscii(view, 0, "RIFF");
  view.setUint32(4, 36 + dataSize, true);
  writeAscii(view, 8, "WAVE");
  writeAscii(view, 12, "fmt ");
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, 1, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * bytesPerSample, true);
  view.setUint16(32, bytesPerSample, true);
  view.setUint16(34, 16, true);
  writeAscii(view, 36, "data");
  view.setUint32(40, dataSize, true);

  for (let sampleIndex = 0; sampleIndex < sampleCount; sampleIndex += 1) {
    const time = sampleIndex / sampleRate;
    let mixed = 0;

    frequencies.forEach((frequency, noteIndex) => {
      const launchNote = kind === "launch" ? launchTonePlan[noteIndex] : null;
      const laughNote = kind === "logo-poke" ? logoLaughPlan[noteIndex] : null;
      const noteStart = noteStartFor(kind, noteIndex, noteSpacing);
      const noteEnd = noteStart + (launchNote?.duration ?? laughNote?.duration ?? noteLength);
      if (time < noteStart || time > noteEnd) return;

      const localTime = time - noteStart;
      if (laughNote) {
        const progress = Math.min(1, localTime / laughNote.duration);
        const laughFrequency = laughFrequencyAt(laughNote, progress);
        const fadeIn = Math.min(1, localTime / 0.014);
        const fadeOut = Math.min(1, (noteEnd - time) / Math.min(0.075, laughNote.duration * 0.5));
        const envelope = Math.max(0, Math.min(fadeIn, fadeOut));
        const voice =
          Math.sin(2 * Math.PI * laughFrequency * localTime) +
          0.06 * Math.sin(4 * Math.PI * laughFrequency * localTime);
        mixed += voice * envelope * laughNote.gain * logoLaughFallbackToneGain;
        return;
      }

      const longLaunchBed = Boolean(launchNote && launchNote.duration > 2);
      const fadeIn = Math.min(1, localTime / (longLaunchBed ? 0.56 : 0.055));
      const fadeOut = Math.min(1, (noteEnd - time) / (longLaunchBed ? 0.72 : 0.3));
      const envelope = Math.max(0, Math.min(fadeIn, fadeOut));
      const noteDivider = kind === "launch" ? Math.sqrt(noteIndex + 1) : noteIndex + 1;
      const noteGain = launchNote ? launchNote.gain : 1 / noteDivider;
      mixed += Math.sin(2 * Math.PI * frequency * localTime) * envelope * toneGain * noteGain;
    });

    const sample = Math.max(-1, Math.min(1, mixed));
    view.setInt16(44 + sampleIndex * bytesPerSample, sample * 0x7fff, true);
  }

  const url = URL.createObjectURL(new Blob([view], { type: "audio/wav" }));
  fallbackToneUrls.set(kind, url);
  return url;
}

async function playFallbackSound(kind: HorizonSoundKind, volume: number) {
  const normalizedVolume = clampVolume(volume) / 100;
  if (normalizedVolume <= 0) {
    return false;
  }

  try {
    const audio = new Audio(fallbackToneUrl(kind));
    audio.volume = Math.min(1, normalizedVolume);
    await audio.play();
    return true;
  } catch {
    return false;
  }
}

async function playFallbackTransitionSound(mode: FocusTimerMode, volume: number) {
  return playFallbackSound(mode, volume);
}

async function playFallbackStartSound(volume: number) {
  return playFallbackSound("start", volume);
}

function audioContextFor(handle: FocusAudioHandle) {
  if (handle.current) {
    return handle.current;
  }

  const AudioContextCtor =
    window.AudioContext ?? (window as Window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!AudioContextCtor) {
    return null;
  }

  handle.current = new AudioContextCtor();
  return handle.current;
}

async function resumeAudioContext(context: AudioContext) {
  if (context.state !== "suspended") {
    return context.state === "running";
  }

  await Promise.race([
    context.resume(),
    new Promise((resolve) => {
      window.setTimeout(resolve, 900);
    }),
  ]);
  const state = context.state as AudioContextState;
  return state === "running";
}

export async function warmFocusAudio(handle: FocusAudioHandle, volume: number) {
  if (clampVolume(volume) <= 0) {
    return false;
  }

  const context = audioContextFor(handle);
  if (!context) {
    return false;
  }

  return resumeAudioContext(context);
}

export async function playFocusTransitionSound(handle: FocusAudioHandle, mode: FocusTimerMode, volume: number) {
  const normalizedVolume = clampVolume(volume) / 100;
  if (normalizedVolume <= 0) {
    return false;
  }

  const context = audioContextFor(handle);
  if (!context) {
    return playFallbackTransitionSound(mode, volume);
  }

  const ready = await resumeAudioContext(context);
  if (!ready) {
    return playFallbackTransitionSound(mode, volume);
  }

  try {
    const now = context.currentTime + 0.02;
    const master = context.createGain();
    master.gain.setValueAtTime(0.001, now);
    master.gain.linearRampToValueAtTime(webAudioMasterGain * normalizedVolume, now + 0.08);
    master.gain.exponentialRampToValueAtTime(0.001, now + 1.15);
    master.connect(context.destination);

    const frequencies = mode === "break" ? [659.25, 523.25, 392] : [392, 523.25, 659.25];
    frequencies.forEach((frequency, index) => {
      const start = now + index * 0.12;
      const stop = start + 0.5;
      const oscillator = context.createOscillator();
      const gain = context.createGain();

      oscillator.type = "sine";
      oscillator.frequency.setValueAtTime(frequency, start);
      gain.gain.setValueAtTime(0.001, start);
      gain.gain.linearRampToValueAtTime(webAudioNoteGain / (index + 1), start + 0.07);
      gain.gain.exponentialRampToValueAtTime(0.001, stop);

      oscillator.connect(gain);
      gain.connect(master);
      oscillator.start(start);
      oscillator.stop(stop + 0.03);
    });

    return true;
  } catch {
    return playFallbackTransitionSound(mode, volume);
  }
}

export async function playFocusStartSound(handle: FocusAudioHandle, volume: number) {
  const normalizedVolume = clampVolume(volume) / 100;
  if (normalizedVolume <= 0) {
    return false;
  }

  const context = audioContextFor(handle);
  if (!context) {
    return playFallbackStartSound(volume);
  }

  const ready = await resumeAudioContext(context);
  if (!ready) {
    return playFallbackStartSound(volume);
  }

  try {
    const now = context.currentTime + 0.02;
    const master = context.createGain();
    master.gain.setValueAtTime(0.001, now);
    master.gain.linearRampToValueAtTime(webAudioMasterGain * normalizedVolume, now + 0.08);
    master.gain.exponentialRampToValueAtTime(0.001, now + 1.55);
    master.connect(context.destination);

    startToneFrequencies.forEach((frequency, index) => {
      const start = now + index * 0.1;
      const stop = start + 0.48;
      const oscillator = context.createOscillator();
      const gain = context.createGain();

      oscillator.type = "sine";
      oscillator.frequency.setValueAtTime(frequency, start);
      gain.gain.setValueAtTime(0.001, start);
      gain.gain.linearRampToValueAtTime(webAudioNoteGain / Math.sqrt(index + 1), start + 0.06);
      gain.gain.exponentialRampToValueAtTime(0.001, stop);

      oscillator.connect(gain);
      gain.connect(master);
      oscillator.start(start);
      oscillator.stop(stop + 0.03);
    });

    return true;
  } catch {
    return playFallbackStartSound(volume);
  }
}

export async function playCaptureSound(handle: FocusAudioHandle, kind: CaptureSoundKind, volume: number) {
  const normalizedVolume = clampVolume(volume) / 100;
  if (normalizedVolume <= 0) {
    return false;
  }

  const context = audioContextFor(handle);
  if (!context) {
    return playFallbackSound(kind, volume);
  }

  const ready = await resumeAudioContext(context);
  if (!ready) {
    return playFallbackSound(kind, volume);
  }

  try {
    const now = context.currentTime + 0.02;
    const master = context.createGain();
    master.gain.setValueAtTime(0.001, now);
    master.gain.linearRampToValueAtTime(webAudioMasterGain * normalizedVolume * 0.72, now + 0.08);
    master.gain.exponentialRampToValueAtTime(0.001, now + 1.1);
    master.connect(context.destination);

    captureToneFrequencies[kind].forEach((frequency, index) => {
      const start = now + index * 0.09;
      const stop = start + 0.34;
      const oscillator = context.createOscillator();
      const gain = context.createGain();

      oscillator.type = "sine";
      oscillator.frequency.setValueAtTime(frequency, start);
      gain.gain.setValueAtTime(0.001, start);
      gain.gain.linearRampToValueAtTime(webAudioNoteGain / Math.sqrt(index + 1), start + 0.05);
      gain.gain.exponentialRampToValueAtTime(0.001, stop);

      oscillator.connect(gain);
      gain.connect(master);
      oscillator.start(start);
      oscillator.stop(stop + 0.03);
    });

    return true;
  } catch {
    return playFallbackSound(kind, volume);
  }
}

export async function playLaunchSound(handle: FocusAudioHandle, volume: number) {
  const normalizedVolume = clampVolume(volume) / 100;
  if (normalizedVolume <= 0) {
    return false;
  }

  const context = audioContextFor(handle);
  if (!context) {
    return playFallbackSound("launch", volume);
  }

  const ready = await resumeAudioContext(context);
  if (!ready) {
    return playFallbackSound("launch", volume);
  }

  try {
    const now = context.currentTime + 0.02;
    const master = context.createGain();
    const compressor = context.createDynamicsCompressor();
    const launchDuration = timingFor("launch").durationSeconds;
    master.gain.setValueAtTime(0.001, now);
    const launchLevel = signatureSoundMasterGain * normalizedVolume;
    master.gain.linearRampToValueAtTime(launchLevel * 0.86, now + 0.16);
    master.gain.setValueAtTime(launchLevel * 0.86, now + 2.4);
    master.gain.linearRampToValueAtTime(launchLevel, now + 2.98);
    master.gain.linearRampToValueAtTime(launchLevel * 0.82, now + 3.5);
    master.gain.linearRampToValueAtTime(launchLevel * 0.96, now + 3.72);
    master.gain.exponentialRampToValueAtTime(0.001, now + launchDuration);
    compressor.threshold.setValueAtTime(-20, now);
    compressor.knee.setValueAtTime(18, now);
    compressor.ratio.setValueAtTime(3.2, now);
    compressor.attack.setValueAtTime(0.008, now);
    compressor.release.setValueAtTime(0.38, now);
    master.connect(compressor);
    compressor.connect(context.destination);

    launchTonePlan.forEach((note) => {
      const start = now + note.offset;
      const stop = start + note.duration;
      const oscillator = context.createOscillator();
      const gain = context.createGain();
      const longBed = note.duration > 2;

      oscillator.type = note.type;
      oscillator.frequency.setValueAtTime(note.frequency * 0.994, start);
      oscillator.frequency.exponentialRampToValueAtTime(note.frequency * note.glide, stop);
      gain.gain.setValueAtTime(0.001, start);
      gain.gain.linearRampToValueAtTime(webAudioNoteGain * note.gain, start + (longBed ? 0.56 : 0.055));
      gain.gain.exponentialRampToValueAtTime(0.001, stop);

      oscillator.connect(gain);
      gain.connect(master);
      oscillator.start(start);
      oscillator.stop(stop + 0.03);
    });

    return true;
  } catch {
    return playFallbackSound("launch", volume);
  }
}

export async function playLogoPokeSound(handle: FocusAudioHandle, volume: number) {
  const normalizedVolume = clampVolume(volume) / 100;
  if (normalizedVolume <= 0) {
    return false;
  }

  const context = audioContextFor(handle);
  if (!context) {
    return playFallbackSound("logo-poke", volume);
  }

  const ready = await resumeAudioContext(context);
  if (!ready) {
    return playFallbackSound("logo-poke", volume);
  }

  try {
    const now = context.currentTime + 0.012;
    const master = context.createGain();
    const compressor = context.createDynamicsCompressor();
    const laughDuration = timingFor("logo-poke").durationSeconds;
    master.gain.setValueAtTime(0.001, now);
    master.gain.linearRampToValueAtTime(signatureSoundMasterGain * normalizedVolume, now + 0.025);
    master.gain.setValueAtTime(signatureSoundMasterGain * normalizedVolume, now + 0.38);
    master.gain.exponentialRampToValueAtTime(0.001, now + laughDuration);
    compressor.threshold.setValueAtTime(-20, now);
    compressor.knee.setValueAtTime(16, now);
    compressor.ratio.setValueAtTime(2.8, now);
    compressor.attack.setValueAtTime(0.006, now);
    compressor.release.setValueAtTime(0.2, now);
    master.connect(compressor);
    compressor.connect(context.destination);

    logoLaughPlan.forEach((note) => {
      const start = now + note.offset;
      const stop = start + note.duration;
      const oscillator = context.createOscillator();
      const overtone = context.createOscillator();
      const gain = context.createGain();
      const overtoneGain = context.createGain();
      const vibrato = context.createOscillator();
      const vibratoDepth = context.createGain();

      oscillator.type = "sine";
      overtone.type = "sine";
      oscillator.frequency.setValueAtTime(note.startFrequency, start);
      oscillator.frequency.exponentialRampToValueAtTime(note.peakFrequency, start + note.duration * 0.3);
      oscillator.frequency.exponentialRampToValueAtTime(note.endFrequency, stop);
      overtone.frequency.setValueAtTime(note.startFrequency * 2.01, start);
      overtone.frequency.exponentialRampToValueAtTime(note.peakFrequency * 2.015, start + note.duration * 0.3);
      overtone.frequency.exponentialRampToValueAtTime(note.endFrequency * 2, stop);
      vibrato.frequency.setValueAtTime(8.5, start);
      vibratoDepth.gain.setValueAtTime(3, start);
      gain.gain.setValueAtTime(0.001, start);
      gain.gain.linearRampToValueAtTime(webAudioNoteGain * note.gain, start + 0.014);
      gain.gain.setValueAtTime(webAudioNoteGain * note.gain * 0.84, start + note.duration * 0.42);
      gain.gain.exponentialRampToValueAtTime(0.001, stop);
      overtoneGain.gain.setValueAtTime(0.001, start);
      overtoneGain.gain.linearRampToValueAtTime(webAudioNoteGain * note.gain * 0.045, start + 0.014);
      overtoneGain.gain.exponentialRampToValueAtTime(0.001, stop);

      oscillator.connect(gain);
      overtone.connect(overtoneGain);
      vibrato.connect(vibratoDepth);
      vibratoDepth.connect(oscillator.detune);
      vibratoDepth.connect(overtone.detune);
      gain.connect(master);
      overtoneGain.connect(master);
      oscillator.start(start);
      overtone.start(start);
      vibrato.start(start);
      oscillator.stop(stop + 0.03);
      overtone.stop(stop + 0.03);
      vibrato.stop(stop + 0.03);
    });

    return true;
  } catch {
    return playFallbackSound("logo-poke", volume);
  }
}

export function showLaunchNotification() {
  if (!("Notification" in window) || Notification.permission !== "granted") {
    return;
  }

  const notification = new Notification("Welcome to HorizonOS", {
    body: "Workspace online. Signal locked.",
    icon: "/horizon-os-icon.png",
    silent: true,
    tag: "horizon-launch",
  });

  window.setTimeout(() => notification.close(), 5_500);
}

export function showFocusTransitionNotification(mode: FocusTimerMode) {
  if (!("Notification" in window) || Notification.permission !== "granted") {
    return;
  }

  const notification =
    mode === "break"
      ? new Notification("Break started", {
          body: "Nice work. Step away, stretch, or breathe for a few minutes.",
          icon: "/horizon-os-icon.png",
          silent: true,
          tag: "horizon-focus-transition",
        })
      : new Notification("Focus started", {
          body: "Your next focus round is ready.",
          icon: "/horizon-os-icon.png",
          silent: true,
          tag: "horizon-focus-transition",
        });

  window.setTimeout(() => notification.close(), 5_500);
}
