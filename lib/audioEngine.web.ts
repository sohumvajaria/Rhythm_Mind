// Web Audio API implementation of the audio engine.
// Metro picks this file on the web platform instead of audioEngine.ts
// so expo-av never loads in a browser context.

export type BeatCallback = (beatIndex: number, scheduledTimeMs: number) => void;

let _onBeatCallback: BeatCallback | null = null;
let _isPlaying = false;
let _pendingTimers: ReturnType<typeof setTimeout>[] = [];
let _audioCtx: AudioContext | null = null;

function getCtx(): AudioContext {
  if (!_audioCtx) {
    _audioCtx = new window.AudioContext();
  }
  // Resume if the browser auto-suspended it (browsers require a user gesture first).
  if (_audioCtx.state === 'suspended') {
    _audioCtx.resume().catch(() => undefined);
  }
  return _audioCtx;
}

// Synthesise a short 1.2 kHz sine-wave click identical to the click.wav generated
// by scripts/generate-click.js — 40 ms, exponential decay.
function playClick(volume: number): void {
  try {
    const ctx  = getCtx();
    const osc  = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.type = 'sine';
    osc.frequency.setValueAtTime(1200, ctx.currentTime);
    gain.gain.setValueAtTime(Math.min(1, Math.max(0, volume)), ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.04);
    osc.start(ctx.currentTime);
    osc.stop(ctx.currentTime + 0.04);
  } catch {
    // AudioContext may be unavailable in some environments (e.g. SSR checks).
  }
}

export function setOnBeatCallback(cb: BeatCallback | null): void {
  _onBeatCallback = cb;
}

// No-op on web — AudioContext is initialised lazily on first user interaction.
export async function loadAudio(): Promise<void> {}

export async function playSequence(beats: number[], bpm: number): Promise<void> {
  await stopPlayback();
  _isPlaying = true;

  const beatIntervalMs = 60_000 / bpm;
  const startMs = Date.now();

  beats.forEach((velocity, index) => {
    const targetMs = startMs + index * beatIntervalMs;
    const delayMs  = Math.max(0, targetMs - Date.now());

    const t = setTimeout(() => {
      if (!_isPlaying) return;
      _onBeatCallback?.(index, targetMs);
      if (velocity > 0) {
        playClick(velocity);
      }
    }, delayMs);

    _pendingTimers.push(t);
  });
}

export async function stopPlayback(): Promise<void> {
  _isPlaying = false;
  for (const t of _pendingTimers) clearTimeout(t);
  _pendingTimers = [];
}

// AudioContext is intentionally kept alive across navigations for better UX
// (avoids the browser's first-activation latency on subsequent screens).
export async function unloadAudio(): Promise<void> {
  await stopPlayback();
}
