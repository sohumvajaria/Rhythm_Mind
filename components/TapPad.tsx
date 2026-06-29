import React, {
  forwardRef,
  useCallback,
  useImperativeHandle,
  useMemo,
  useRef,
  useState,
} from 'react';
import {
  Pressable,
  StyleSheet,
  Text,
  View,
  useWindowDimensions,
} from 'react-native';
import Animated, {
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withSequence,
  withSpring,
  withTiming,
} from 'react-native-reanimated';

// ─── result types (exported for use in exercise screens) ─────────────────────

export interface TapBeatResult {
  /** 0-based index into the inter-tap intervals array. */
  intervalIndex: number;
  expectedIntervalMs: number;
  actualIntervalMs: number;
  /** Positive = tapped late, negative = tapped early. */
  errorMs: number;
  isCorrect: boolean;
}

export interface TapResult {
  /** Raw tap timestamps normalised so the first tap = 0 ms. */
  timestamps: number[];
  /** Inter-tap intervals: timestamps[k+1] − timestamps[k]. */
  intervals: number[];
  beatResults: TapBeatResult[];
  /** 0–100: percentage of intervals within the tolerance window. */
  score: number;
  /** True when the user tapped every expected beat before time ran out. */
  isComplete: boolean;
  totalTaps: number;
  expectedTaps: number;
}

// ─── component types ──────────────────────────────────────────────────────────

export interface TapPadProps {
  /**
   * Velocity array from ExerciseInstance.outputSequence.
   * Values > 0 = active beat; 0 = rest.
   */
  targetSequence: number[];
  /** Tempo used to derive expected inter-tap intervals. */
  bpm: number;
  /** Symmetric tolerance window around each expected interval (default ±150 ms). */
  toleranceMs?: number;
  onSequenceComplete: (result: TapResult) => void;
}

export interface TapPadHandle {
  /** Reset for a new attempt without re-mounting. */
  reset: () => void;
  /** Force completion with whatever taps have been recorded — call on timeout. */
  forceComplete: () => void;
}

// ─── constants ────────────────────────────────────────────────────────────────

const BG = '#07091a';
const PAD_BG = '#0d1a40';
const PAD_BORDER = '#1c3a82';
const GLOW_COLOR = '#3a7de8';
const RIPPLE_COLOR = '#6aaaf5';
const TEXT_PRIMARY = '#eef2ff';
const TEXT_MUTED = '#6b84c4';
const BORDER_RADIUS = 36;

// ─── component ────────────────────────────────────────────────────────────────

const TapPad = forwardRef<TapPadHandle, TapPadProps>(function TapPad(
  { targetSequence, bpm, toleranceMs = 150, onSequenceComplete },
  ref,
) {
  const { height: windowHeight } = useWindowDimensions();

  // ── derived sequence data ──────────────────────────────────────────────────

  // Positions (slot indices) of every active beat in the target sequence.
  const hitPositions = useMemo(
    () =>
      targetSequence.reduce<number[]>((acc, v, i) => {
        if (v > 0) acc.push(i);
        return acc;
      }, []),
    [targetSequence],
  );

  const expectedTaps = hitPositions.length;
  const beatIntervalMs = 60_000 / bpm;

  // Expected inter-tap intervals between consecutive hits.
  // Accounts for rests: two hits separated by a rest slot have a 2-beat gap.
  const expectedITIs = useMemo(
    () =>
      hitPositions
        .slice(1)
        .map((pos, i) => (pos - hitPositions[i]) * beatIntervalMs),
    [hitPositions, beatIntervalMs],
  );

  // ── mutable session state (refs avoid stale-closure bugs in callbacks) ─────

  const timestampsRef = useRef<number[]>([]);
  const completedRef = useRef(false);

  // ── UI state ──────────────────────────────────────────────────────────────

  const [tapCount, setTapCount] = useState(0);
  const [done, setDone] = useState(false);

  // ── animation values ──────────────────────────────────────────────────────

  const padScale = useSharedValue(1);
  const rippleScale = useSharedValue(0.15);
  const rippleOpacity = useSharedValue(0);
  const glowOpacity = useSharedValue(0.1);

  const padStyle = useAnimatedStyle(() => ({
    transform: [{ scale: padScale.value }],
  }));

  const rippleStyle = useAnimatedStyle(() => ({
    transform: [{ scale: rippleScale.value }],
    opacity: rippleOpacity.value,
  }));

  const glowStyle = useAnimatedStyle(() => ({
    opacity: glowOpacity.value,
  }));

  // ── helpers ───────────────────────────────────────────────────────────────

  const buildResult = useCallback(
    (taps: number[], complete: boolean): TapResult => {
      const intervals = taps.slice(1).map((ts, i) => ts - taps[i]);

      const beatResults: TapBeatResult[] = intervals.map((actual, i) => {
        const expected = expectedITIs[i] ?? beatIntervalMs;
        const error = actual - expected;
        return {
          intervalIndex: i,
          expectedIntervalMs: expected,
          actualIntervalMs: actual,
          errorMs: error,
          isCorrect: Math.abs(error) <= toleranceMs,
        };
      });

      const correct = beatResults.filter((r) => r.isCorrect).length;
      const score = expectedTaps <= 1
        ? (taps.length >= expectedTaps ? 100 : 0)
        : Math.round((correct / (expectedTaps - 1)) * 100);

      return {
        timestamps: taps.map((ts) => ts - (taps[0] ?? ts)),
        intervals,
        beatResults,
        score,
        isComplete: complete,
        totalTaps: taps.length,
        expectedTaps,
      };
    },
    [expectedITIs, beatIntervalMs, expectedTaps, toleranceMs],
  );

  const triggerPulse = useCallback(() => {
    // Pad: compress then spring back with a small overshoot
    padScale.value = withSequence(
      withTiming(0.96, { duration: 70, easing: Easing.out(Easing.quad) }),
      withSpring(1, { damping: 7, stiffness: 260 }),
    );

    // Ripple: reset position, expand outward, fade
    rippleScale.value = 0.15;
    rippleOpacity.value = 0.6;
    rippleScale.value = withTiming(1.2, {
      duration: 500,
      easing: Easing.out(Easing.quad),
    });
    rippleOpacity.value = withTiming(0, {
      duration: 440,
      easing: Easing.in(Easing.quad),
    });

    // Glow: bright flash then settle back to dim
    glowOpacity.value = withSequence(
      withTiming(0.52, { duration: 55 }),
      withTiming(0.1, { duration: 400, easing: Easing.out(Easing.quad) }),
    );
  }, [padScale, rippleScale, rippleOpacity, glowOpacity]);

  const finishSession = useCallback(
    (taps: number[], complete: boolean) => {
      completedRef.current = true;
      setDone(true);
      onSequenceComplete(buildResult(taps, complete));
    },
    [buildResult, onSequenceComplete],
  );

  const handleTap = useCallback(() => {
    if (completedRef.current || expectedTaps === 0) return;

    timestampsRef.current.push(Date.now());
    const nextCount = timestampsRef.current.length;
    setTapCount(nextCount);
    triggerPulse();

    if (nextCount >= expectedTaps) {
      finishSession(timestampsRef.current, true);
    }
  }, [expectedTaps, triggerPulse, finishSession]);

  // ── imperative handle ──────────────────────────────────────────────────────

  useImperativeHandle(
    ref,
    () => ({
      reset() {
        timestampsRef.current = [];
        completedRef.current = false;
        setTapCount(0);
        setDone(false);
        padScale.value = withTiming(1, { duration: 200 });
        rippleOpacity.value = 0;
        glowOpacity.value = 0.1;
      },
      forceComplete() {
        if (completedRef.current) return;
        finishSession(timestampsRef.current, false);
      },
    }),
    [finishSession, padScale, rippleOpacity, glowOpacity],
  );

  // ── render ────────────────────────────────────────────────────────────────

  // Guarantee at least 60% of screen height regardless of status strip size.
  const minPadHeight = windowHeight * 0.62;
  const remaining = Math.max(0, expectedTaps - tapCount);

  return (
    <View style={styles.container}>
      {/* Status strip — kept intentionally small to maximise tap area */}
      <View style={styles.statusStrip}>
        <Text style={styles.statusText} numberOfLines={1}>
          {done
            ? 'Sequence complete'
            : tapCount === 0
              ? 'Tap the pad when ready'
              : `${remaining} beat${remaining !== 1 ? 's' : ''} remaining`}
        </Text>
        <Text style={styles.countBadge}>
          {tapCount} / {expectedTaps}
        </Text>
      </View>

      {/* Tap pad */}
      <Pressable
        onPress={handleTap}
        disabled={done}
        android_ripple={null}
        accessibilityRole="button"
        accessibilityLabel="Rhythm tap pad"
        accessibilityHint="Tap in rhythm to reproduce the pattern you heard"
        style={styles.pressable}
      >
        <Animated.View
          style={[styles.pad, { minHeight: minPadHeight }, padStyle]}
        >
          {/* Ambient glow layer behind content */}
          <Animated.View
            style={[StyleSheet.absoluteFill, styles.glow, glowStyle]}
            pointerEvents="none"
          />

          {/* Ripple ring — clipped by overflow:hidden on the pad */}
          <Animated.View
            style={[styles.ripple, rippleStyle]}
            pointerEvents="none"
          />

          {/* Centre labels */}
          <Text style={done ? styles.doneLabel : styles.tapLabel}>
            {done ? '✓' : 'TAP'}
          </Text>
          {!done && (
            <Text style={styles.tapHint}>
              {tapCount === 0
                ? 'touch anywhere on this pad'
                : `beat ${tapCount + 1} of ${expectedTaps}`}
            </Text>
          )}
          {done && (
            <Text style={styles.tapHint}>well done</Text>
          )}
        </Animated.View>
      </Pressable>
    </View>
  );
});

export default TapPad;

// ─── styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: BG,
    paddingHorizontal: 16,
    paddingBottom: 28,
  },
  statusStrip: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingTop: 16,
    paddingBottom: 14,
    paddingHorizontal: 4,
  },
  statusText: {
    color: TEXT_MUTED,
    fontSize: 18,
    fontWeight: '500',
    flexShrink: 1,
    marginRight: 12,
  },
  countBadge: {
    color: TEXT_PRIMARY,
    fontSize: 22,
    fontWeight: '700',
    minWidth: 64,
    textAlign: 'right',
  },
  pressable: {
    flex: 1,
  },
  pad: {
    flex: 1,
    borderRadius: BORDER_RADIUS,
    backgroundColor: PAD_BG,
    borderWidth: 2,
    borderColor: PAD_BORDER,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  glow: {
    borderRadius: BORDER_RADIUS,
    backgroundColor: GLOW_COLOR,
  },
  // Ripple is a borderless disc sized larger than the pad so it reads as a ring
  // expanding from the centre; the pad's overflow:hidden clips the outer edge.
  ripple: {
    position: 'absolute',
    width: '140%',
    aspectRatio: 1,
    borderRadius: 9999,
    borderWidth: 3.5,
    borderColor: RIPPLE_COLOR,
    backgroundColor: 'transparent',
  },
  tapLabel: {
    fontSize: 60,
    fontWeight: '800',
    color: TEXT_PRIMARY,
    letterSpacing: 8,
  },
  doneLabel: {
    fontSize: 72,
    fontWeight: '700',
    color: '#5ec97e',
  },
  tapHint: {
    marginTop: 10,
    fontSize: 19,
    color: TEXT_MUTED,
    fontWeight: '500',
    letterSpacing: 0.3,
  },
});
