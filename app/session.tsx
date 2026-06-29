import { router } from 'expo-router';
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import Animated, {
  Easing,
  runOnJS,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';

import TapPad, { type TapPadHandle, type TapResult } from '../components/TapPad';
import {
  loadAudio,
  playSequence,
  setOnBeatCallback,
  stopPlayback,
  unloadAudio,
} from '../lib/audioEngine';
import {
  EXERCISE_GENERATORS,
  type ExerciseInstance,
  type ExerciseType,
} from '../lib/exercises';

// ─── session config ───────────────────────────────────────────────────────────

const SESSION_LENGTH = 5;
const FEEDBACK_LINGER_MS = 3_000;
const POST_AUDIO_BUFFER_MS = 600; // silence after playback before "your turn"

const SESSION_PLAN: Array<{ type: ExerciseType; difficulty: number }> = [
  { type: 'TempoShift',    difficulty: 3 },
  { type: 'BeatInsertion', difficulty: 3 },
  { type: 'PatternReverse', difficulty: 4 },
  { type: 'BlendSequence', difficulty: 3 },
  { type: 'TempoShift',    difficulty: 4 },
];

// ─── types ────────────────────────────────────────────────────────────────────

type Phase = 'instruction' | 'playing' | 'tapping' | 'feedback';

const AVG_DIFFICULTY = Math.round(
  SESSION_PLAN.reduce((sum, p) => sum + p.difficulty, 0) / SESSION_LENGTH,
);

interface Instruction {
  title: string;
  body: string;
  detail?: string;
}

// ─── helpers ──────────────────────────────────────────────────────────────────

function getInstruction(ex: ExerciseInstance): Instruction {
  switch (ex.type) {
    case 'TempoShift':
      return {
        title: 'Tempo Shift',
        body: 'Listen to the rhythm, then tap it back at a different speed.',
        detail: `You will hear it at ${ex.bpm} BPM — tap it back at ${ex.targetBpm} BPM.`,
      };
    case 'BeatInsertion':
      return {
        title: 'Beat Insertion',
        body: 'Listen to the pattern, then tap it back with one extra beat added.',
        detail: `Add the extra beat at position ${ex.insertionIndex + 1}.`,
      };
    case 'PatternReverse':
      return {
        title: 'Pattern Reverse',
        body: 'Listen to the pattern, then tap it back in reverse order.',
      };
    case 'BlendSequence':
      return {
        title: 'Blend',
        body: 'You will hear two short patterns. Combine them by alternating one beat from each: A, B, A, B, …',
      };
  }
}

// The BPM the user must tap at (differs from playback BPM only for TempoShift).
function getTapBpm(ex: ExerciseInstance): number {
  return ex.type === 'TempoShift' ? ex.targetBpm : ex.bpm;
}

// score >= 60 and all expected beats tapped = "Good", otherwise "Try again".
function getFeedback(result: TapResult): 'Good' | 'Try again' {
  return result.isComplete && result.score >= 60 ? 'Good' : 'Try again';
}

// ─── colours ──────────────────────────────────────────────────────────────────

const C = {
  bg:        '#07091a',
  surface:   '#0d1a40',
  border:    '#1c3a82',
  accent:    '#4a8ef0',
  primary:   '#eef2ff',
  muted:     '#6b84c4',
  green:     '#5ec97e',
  amber:     '#e8a234',
} as const;

// ─── screen ───────────────────────────────────────────────────────────────────

export default function SessionScreen() {
  const exercises = useMemo<ExerciseInstance[]>(
    () => SESSION_PLAN.map(({ type, difficulty }) => EXERCISE_GENERATORS[type](difficulty)),
    [],
  );

  const [phase, setPhase]               = useState<Phase>('instruction');
  const [exerciseIndex, setExerciseIndex] = useState(0);
  const [lastResult, setLastResult]     = useState<TapResult | null>(null);
  const [activeBeat, setActiveBeat]     = useState(-1);
  const [blendLabel, setBlendLabel]     = useState<'A' | 'B' | null>(null);

  const tapPadRef       = useRef<TapPadHandle>(null);
  const audioTimerRef   = useRef<ReturnType<typeof setTimeout> | null>(null);
  const tapTimeoutRef   = useRef<ReturnType<typeof setTimeout> | null>(null);
  const feedbackTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // ── fade transition ────────────────────────────────────────────────────────

  const opacity = useSharedValue(1);
  const fadeStyle = useAnimatedStyle(() => ({ opacity: opacity.value }));

  // Fade out → swap phase → fade in.
  const transitionTo = useCallback((next: Phase) => {
    opacity.value = withTiming(0, { duration: 160, easing: Easing.in(Easing.quad) }, (done) => {
      'worklet';
      if (done) runOnJS(setPhase)(next);
    });
  }, [opacity]);

  // Fade in whenever phase changes (content has already swapped).
  useEffect(() => {
    opacity.value = withTiming(1, { duration: 300, easing: Easing.out(Easing.quad) });
  }, [phase, opacity]);

  // ── timer management ───────────────────────────────────────────────────────

  const clearAllTimers = useCallback(() => {
    [audioTimerRef, tapTimeoutRef, feedbackTimerRef].forEach((r) => {
      if (r.current) { clearTimeout(r.current); r.current = null; }
    });
  }, []);

  // Load audio on mount, clean up everything on unmount.
  useEffect(() => {
    loadAudio();
    return () => {
      clearAllTimers();
      setOnBeatCallback(null);
      stopPlayback();
      unloadAudio();
    };
  }, [clearAllTimers]);

  // ── exercise data ──────────────────────────────────────────────────────────

  const ex = exercises[exerciseIndex];
  const instruction = getInstruction(ex);
  const isLastExercise = exerciseIndex >= SESSION_LENGTH - 1;

  // ── playback ───────────────────────────────────────────────────────────────

  const startPlayback = useCallback(async () => {
    // Capture exercise in closure — doesn't change during this playback.
    const exercise = exercises[exerciseIndex];
    const beatMs = 60_000 / exercise.bpm;
    const audioDurationMs = exercise.inputSequence.length * beatMs;

    setActiveBeat(-1);
    setBlendLabel(exercise.type === 'BlendSequence' ? 'A' : null);
    transitionTo('playing');

    setOnBeatCallback((beatIndex) => {
      setActiveBeat(beatIndex);
      if (exercise.type === 'BlendSequence') {
        setBlendLabel(beatIndex < exercise.patternA.length ? 'A' : 'B');
      }
    });

    // playSequence schedules timers and returns; audio runs asynchronously.
    await playSequence(exercise.inputSequence, exercise.bpm);

    // After audio finishes, wait the buffer then hand control to TapPad.
    audioTimerRef.current = setTimeout(() => {
      setOnBeatCallback(null);
      setActiveBeat(-1);
      setBlendLabel(null);
      transitionTo('tapping');

      // Enforce the exercise time limit — forceComplete fires the callback.
      tapTimeoutRef.current = setTimeout(() => {
        tapPadRef.current?.forceComplete();
      }, exercise.timeLimitMs);
    }, audioDurationMs + POST_AUDIO_BUFFER_MS);
  }, [exercises, exerciseIndex, transitionTo]);

  // ── advance / complete ─────────────────────────────────────────────────────

  const advanceExercise = useCallback(() => {
    clearAllTimers();
    setLastResult(null);
    setActiveBeat(-1);

    if (isLastExercise) {
      router.replace({
        pathname: '/summary',
        params: {
          exerciseCount: String(SESSION_LENGTH),
          avgDifficulty: String(AVG_DIFFICULTY),
        },
      });
    } else {
      setExerciseIndex((i) => i + 1);
      transitionTo('instruction');
    }
  }, [isLastExercise, clearAllTimers, transitionTo]);

  const handleSequenceComplete = useCallback((result: TapResult) => {
    if (tapTimeoutRef.current) { clearTimeout(tapTimeoutRef.current); tapTimeoutRef.current = null; }
    setLastResult(result);
    transitionTo('feedback');
    feedbackTimerRef.current = setTimeout(advanceExercise, FEEDBACK_LINGER_MS);
  }, [transitionTo, advanceExercise]);

  // ── render ─────────────────────────────────────────────────────────────────

  const progressPct = (exerciseIndex / SESSION_LENGTH) * 100;
  const feedback = lastResult ? getFeedback(lastResult) : null;
  const isGood = feedback === 'Good';

  // Beat dots shown during the 'playing' phase.
  const beatDots = ex.inputSequence.map((v, i) => (
    <View
      key={i}
      style={[
        styles.dot,
        v > 0 ? styles.dotHit : styles.dotRest,
        i === activeBeat && styles.dotActive,
      ]}
    />
  ));

  return (
    <SafeAreaView style={styles.screen}>

      {/* ── progress bar ── */}
      <View style={styles.progressTrack}>
        <View style={[styles.progressFill, { width: `${progressPct}%` }]} />
      </View>

      {/* ── exercise counter ── */}
      <Text style={styles.counter}>
        Exercise {exerciseIndex + 1} of {SESSION_LENGTH}
      </Text>

      {/* ── fading content area ── */}
      <Animated.View style={[styles.content, fadeStyle]}>

        {/* instruction */}
        {phase === 'instruction' && (
          <View style={styles.centred}>
            <Text style={styles.exerciseTag}>{instruction.title}</Text>
            <Text style={styles.instructionBody}>{instruction.body}</Text>
            {instruction.detail ? (
              <Text style={styles.instructionDetail}>{instruction.detail}</Text>
            ) : null}
            <Pressable style={styles.btnPrimary} onPress={startPlayback}>
              <Text style={styles.btnPrimaryText}>Play sequence</Text>
            </Pressable>
          </View>
        )}

        {/* playing */}
        {phase === 'playing' && (
          <View style={styles.centred}>
            <Text style={styles.listeningHeading}>
              {blendLabel ? `Pattern ${blendLabel}` : 'Listen carefully'}
            </Text>
            <View style={styles.dotsRow}>{beatDots}</View>
            <Text style={styles.listeningHint}>audio is playing…</Text>
          </View>
        )}

        {/* tapping */}
        {phase === 'tapping' && (
          <View style={styles.tappingShell}>
            <Text style={styles.yourTurn}>Your turn</Text>
            {/* key=exerciseIndex remounts TapPad fresh for each exercise */}
            <TapPad
              key={exerciseIndex}
              ref={tapPadRef}
              targetSequence={ex.outputSequence}
              bpm={getTapBpm(ex)}
              onSequenceComplete={handleSequenceComplete}
            />
          </View>
        )}

        {/* feedback */}
        {phase === 'feedback' && (
          <View style={styles.centred}>
            <Text style={[styles.feedbackWord, isGood ? styles.feedbackGood : styles.feedbackAmber]}>
              {feedback}
            </Text>
            <Text style={styles.feedbackSub}>{instruction.title}</Text>
            <Pressable style={styles.btnSecondary} onPress={advanceExercise}>
              <Text style={styles.btnSecondaryText}>
                {isLastExercise ? 'Finish' : 'Next'}
              </Text>
            </Pressable>
          </View>
        )}

      </Animated.View>
    </SafeAreaView>
  );
}

// ─── styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: C.bg,
  },

  // progress
  progressTrack: {
    height: 4,
    backgroundColor: C.surface,
  },
  progressFill: {
    height: 4,
    backgroundColor: C.accent,
  },

  // exercise counter
  counter: {
    textAlign: 'center',
    color: C.muted,
    fontSize: 16,
    fontWeight: '500',
    paddingVertical: 12,
  },

  // fading wrapper
  content: {
    flex: 1,
  },

  // shared centred layout (instruction / playing / feedback / complete)
  centred: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 28,
    paddingBottom: 48,
  },

  // instruction
  exerciseTag: {
    fontSize: 13,
    fontWeight: '700',
    letterSpacing: 2.5,
    textTransform: 'uppercase',
    color: C.accent,
    marginBottom: 24,
  },
  instructionBody: {
    fontSize: 24,
    fontWeight: '500',
    color: C.primary,
    textAlign: 'center',
    lineHeight: 34,
    marginBottom: 14,
  },
  instructionDetail: {
    fontSize: 19,
    color: C.muted,
    textAlign: 'center',
    lineHeight: 28,
    marginBottom: 12,
  },

  // buttons
  btnPrimary: {
    marginTop: 36,
    backgroundColor: C.accent,
    borderRadius: 18,
    paddingVertical: 18,
    paddingHorizontal: 52,
  },
  btnPrimaryText: {
    color: '#fff',
    fontSize: 20,
    fontWeight: '700',
  },
  btnSecondary: {
    marginTop: 36,
    backgroundColor: C.surface,
    borderRadius: 18,
    paddingVertical: 18,
    paddingHorizontal: 52,
    borderWidth: 1.5,
    borderColor: C.border,
  },
  btnSecondaryText: {
    color: C.primary,
    fontSize: 20,
    fontWeight: '600',
  },

  // playing
  listeningHeading: {
    fontSize: 34,
    fontWeight: '700',
    color: C.primary,
    marginBottom: 36,
  },
  dotsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'center',
    gap: 10,
    maxWidth: '85%',
    marginBottom: 32,
  },
  dot: {
    width: 18,
    height: 18,
    borderRadius: 9,
  },
  dotHit: {
    backgroundColor: C.accent,
    opacity: 0.35,
  },
  dotRest: {
    backgroundColor: C.surface,
    opacity: 0.6,
  },
  dotActive: {
    opacity: 1,
    backgroundColor: C.primary,
  },
  listeningHint: {
    fontSize: 16,
    color: C.muted,
    fontStyle: 'italic',
  },

  // tapping
  tappingShell: {
    flex: 1,
  },
  yourTurn: {
    textAlign: 'center',
    color: C.primary,
    fontSize: 28,
    fontWeight: '700',
    paddingTop: 8,
    paddingBottom: 4,
  },

  // feedback
  feedbackWord: {
    fontSize: 56,
    fontWeight: '800',
    marginBottom: 10,
  },
  feedbackGood: {
    color: C.green,
  },
  feedbackAmber: {
    color: C.amber,
  },
  feedbackSub: {
    fontSize: 18,
    color: C.muted,
    marginBottom: 8,
  },

});
