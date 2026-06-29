import { Audio } from 'expo-av';

// beats[i] = velocity (0 = rest, 0..1 = volume). Called once per active beat.
export type BeatCallback = (beatIndex: number, scheduledTimeMs: number) => void;

// ─── module-level singleton state ────────────────────────────────────────────

let _sound: Audio.Sound | null = null;
let _isPlaying = false;
let _pendingTimers: ReturnType<typeof setTimeout>[] = [];
let _onBeatCallback: BeatCallback | null = null;

// ─── public API ──────────────────────────────────────────────────────────────

/** Register (or clear) the callback fired on every active beat. */
export function setOnBeatCallback(cb: BeatCallback | null) {
  _onBeatCallback = cb;
}

/**
 * Load and cache the click sound. Safe to call multiple times.
 * Call this once early (e.g. on app mount) to eliminate first-play latency.
 */
export async function loadAudio(): Promise<void> {
  if (_sound) return;

  await Audio.setAudioModeAsync({
    playsInSilentModeIOS: true,
    staysActiveInBackground: false,
  });

  const { sound } = await Audio.Sound.createAsync(
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    require('../assets/audio/click.wav') as number,
    { shouldPlay: false, volume: 1 }
  );
  _sound = sound;
}

/**
 * Play a sequence of beats at the given BPM.
 *
 * @param beats  Array of velocity values (0 = rest, 0..1 = volume).
 *               Length determines the number of beat slots.
 *               Example: [1, 0, 0.7, 0] plays beats 0 and 2 only.
 * @param bpm    Tempo in beats per minute.
 *
 * Returns a promise that resolves once all timers are scheduled
 * (not when playback finishes).
 */
export async function playSequence(beats: number[], bpm: number): Promise<void> {
  if (bpm <= 0) throw new RangeError('bpm must be > 0');

  await stopPlayback();
  await loadAudio();

  const sound = _sound!;
  const beatIntervalMs = (60 / bpm) * 1000;
  const startMs = Date.now();
  _isPlaying = true;

  beats.forEach((velocity, index) => {
    if (velocity <= 0) return; // rest slot — skip entirely

    // Drift-corrected scheduling: compute target wall-clock time once at
    // sequence start so accumulated setTimeout error doesn't compound.
    const targetMs = startMs + index * beatIntervalMs;
    const delayMs = Math.max(0, targetMs - Date.now());

    const t = setTimeout(async () => {
      if (!_isPlaying) return;

      _onBeatCallback?.(index, targetMs);

      try {
        const vol = Math.min(1, Math.max(0, velocity));
        await sound.setVolumeAsync(vol);
        await sound.replayAsync();
      } catch {
        // Sound may have been unloaded mid-sequence; silently ignore.
      }
    }, delayMs);

    _pendingTimers.push(t);
  });
}

/**
 * Immediately stop playback and cancel all pending beat timers.
 * Safe to call even when nothing is playing.
 */
export async function stopPlayback(): Promise<void> {
  _isPlaying = false;

  for (const t of _pendingTimers) clearTimeout(t);
  _pendingTimers = [];

  try {
    await _sound?.stopAsync();
  } catch {
    // Ignore — sound may already be stopped or unloaded.
  }
}

/**
 * Release the audio resource. Call when the screen using audio unmounts.
 * loadAudio() will re-create the sound on next playSequence() call.
 */
export async function unloadAudio(): Promise<void> {
  await stopPlayback();
  try {
    await _sound?.unloadAsync();
  } catch {}
  _sound = null;
}
