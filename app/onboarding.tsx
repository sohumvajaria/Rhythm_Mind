import { router } from 'expo-router';
import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import {
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
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
import type { TempoShiftExercise } from '../lib/exercises';
import { useAppStore } from '../store/useAppStore';

// ─── practice exercise (fixed — deterministic for onboarding) ─────────────────

const PRACTICE: TempoShiftExercise = {
  type:           'TempoShift',
  inputSequence:  [1, 1, 1, 1],
  outputSequence: [1, 1, 1, 1],
  bpm:            72,
  targetBpm:      80,
  timeLimitMs:    12_000,
};

const POST_AUDIO_BUFFER_MS = 600;

// ─── colours (matches app-wide palette) ───────────────────────────────────────

const C = {
  bg:      '#07091a',
  surface: '#0d1a40',
  border:  '#1c3a82',
  accent:  '#4a8ef0',
  primary: '#eef2ff',
  muted:   '#6b84c4',
  dim:     '#2a3a6a',
  green:   '#5ec97e',
} as const;

// ─── step dots ────────────────────────────────────────────────────────────────

function StepDots({ current }: { current: number }) {
  return (
    <View style={dot.row}>
      {[0, 1, 2].map((i) => (
        <View key={i} style={[dot.base, i === current && dot.active]} />
      ))}
    </View>
  );
}

const dot = StyleSheet.create({
  row:    { flexDirection: 'row', justifyContent: 'center', gap: 10, paddingVertical: 20 },
  base:   { width: 10, height: 10, borderRadius: 5, backgroundColor: C.dim },
  active: { backgroundColor: C.accent, width: 28 },
});

// ─── step 1 — name ────────────────────────────────────────────────────────────

interface NameStepProps {
  name: string;
  onChange: (v: string) => void;
  onNext: () => void;
}

function NameStep({ name, onChange, onNext }: NameStepProps) {
  const canContinue = name.trim().length > 0;

  return (
    <KeyboardAvoidingView
      style={{ flex: 1 }}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
    >
      <View style={s.stepShell}>
        <View style={s.stepBody}>
          <Text style={s.stepLabel}>Step 1 of 3</Text>
          <Text style={s.heading}>What's your{'\n'}first name?</Text>
          <TextInput
            value={name}
            onChangeText={onChange}
            autoFocus
            autoCapitalize="words"
            autoCorrect={false}
            returnKeyType="done"
            onSubmitEditing={canContinue ? onNext : undefined}
            style={s.nameInput}
            placeholder="Your name"
            placeholderTextColor={C.dim}
            maxLength={40}
            accessibilityLabel="First name"
          />
        </View>

        <Pressable
          style={[s.btnPrimary, !canContinue && s.btnDisabled]}
          onPress={canContinue ? onNext : undefined}
          disabled={!canContinue}
          accessibilityRole="button"
          accessibilityLabel="Continue"
        >
          <Text style={s.btnPrimaryText}>Continue</Text>
        </Pressable>
      </View>
    </KeyboardAvoidingView>
  );
}

// ─── step 2 — about ───────────────────────────────────────────────────────────

interface AboutStepProps {
  name: string;
  onNext: () => void;
  onBack: () => void;
}

function AboutStep({ name, onNext, onBack }: AboutStepProps) {
  const firstName = name.trim() || 'there';

  return (
    <View style={s.stepShell}>
      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={s.aboutScroll}
        showsVerticalScrollIndicator={false}
      >
        <Text style={s.stepLabel}>Step 2 of 3</Text>
        <Text style={s.heading}>Hi, {firstName}.</Text>

        <Text style={s.bodyText}>
          RhythmMind gives you a short rhythm exercise every day — you listen to
          a pattern of beats and then tap it back.
        </Text>

        <Text style={s.bodyText}>
          Staying engaged with rhythm and timing keeps your mind active and
          your reactions quick, which helps you stay sharp in conversation
          and in everyday life.
        </Text>

        <Text style={s.bodyText}>
          Each session takes about 8 minutes. We'll guide you through every
          step — there's nothing to memorise or figure out on your own.
        </Text>

        <View style={s.bulletBlock}>
          {[
            'Listen to a short pattern of beats',
            'Tap the pattern back on the large button',
            'Get a new exercise each day',
          ].map((line) => (
            <View key={line} style={s.bulletRow}>
              <Text style={s.bulletDot}>•</Text>
              <Text style={s.bulletText}>{line}</Text>
            </View>
          ))}
        </View>
      </ScrollView>

      <View style={s.navRow}>
        <Pressable style={s.btnBack} onPress={onBack} accessibilityRole="button">
          <Text style={s.btnBackText}>Back</Text>
        </Pressable>
        <Pressable
          style={[s.btnPrimary, { flex: 1 }]}
          onPress={onNext}
          accessibilityRole="button"
          accessibilityLabel="Try a practice round"
        >
          <Text style={s.btnPrimaryText}>Try it now</Text>
        </Pressable>
      </View>
    </View>
  );
}

// ─── step 3 — practice ────────────────────────────────────────────────────────

type PracticePhase = 'intro' | 'playing' | 'tapping' | 'done';

interface PracticeStepProps {
  onComplete: () => void;
  onBack: () => void;
}

function PracticeStep({ onComplete, onBack }: PracticeStepProps) {
  const [phase, setPhase]           = useState<PracticePhase>('intro');
  const [activeBeat, setActiveBeat] = useState(-1);
  const [succeeded, setSucceeded]   = useState(false);

  const tapPadRef    = useRef<TapPadHandle>(null);
  const audioTimer   = useRef<ReturnType<typeof setTimeout> | null>(null);
  const tapTimer     = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Cleanup on unmount (back navigation mid-exercise).
  useEffect(() => {
    loadAudio();
    return () => {
      if (audioTimer.current) clearTimeout(audioTimer.current);
      if (tapTimer.current)   clearTimeout(tapTimer.current);
      setOnBeatCallback(null);
      stopPlayback();
      unloadAudio();
    };
  }, []);

  const startPlayback = useCallback(async () => {
    setPhase('playing');
    setActiveBeat(-1);

    setOnBeatCallback((i) => setActiveBeat(i));

    const beatMs        = 60_000 / PRACTICE.bpm;
    const audioDuration = PRACTICE.inputSequence.length * beatMs;

    await playSequence(PRACTICE.inputSequence, PRACTICE.bpm);

    audioTimer.current = setTimeout(() => {
      setOnBeatCallback(null);
      setActiveBeat(-1);
      setPhase('tapping');

      tapTimer.current = setTimeout(() => {
        tapPadRef.current?.forceComplete();
      }, PRACTICE.timeLimitMs);
    }, audioDuration + POST_AUDIO_BUFFER_MS);
  }, []);

  const handleTapComplete = useCallback((result: TapResult) => {
    if (tapTimer.current) { clearTimeout(tapTimer.current); tapTimer.current = null; }
    setSucceeded(result.isComplete);
    setPhase('done');
  }, []);

  const retry = useCallback(() => {
    stopPlayback();
    setPhase('intro');
    setActiveBeat(-1);
  }, []);

  // Beat dots for the playing phase.
  const beatDots = useMemo(() =>
    PRACTICE.inputSequence.map((_, i) => (
      <View
        key={i}
        style={[pd.dot, i === activeBeat ? pd.dotActive : pd.dotIdle]}
      />
    )),
  [activeBeat]);

  return (
    <View style={s.stepShell}>

      {/* ── intro ── */}
      {phase === 'intro' && (
        <View style={s.stepBody}>
          <Text style={s.stepLabel}>Step 3 of 3 — Practice</Text>
          <Text style={s.heading}>Let's try one together.</Text>
          <Text style={s.bodyText}>
            You'll hear 4 beats played at a steady pace. When it's your turn,
            tap the large pad to match the rhythm — slightly faster this time.
          </Text>
          <Text style={s.bodyText}>
            Listen first, then tap. Ready whenever you are.
          </Text>
        </View>
      )}

      {/* ── playing ── */}
      {phase === 'playing' && (
        <View style={[s.stepBody, { alignItems: 'center' }]}>
          <Text style={s.heading}>Listen carefully…</Text>
          <View style={pd.dotsRow}>{beatDots}</View>
          <Text style={[s.bodyText, { textAlign: 'center', fontStyle: 'italic' }]}>
            audio is playing
          </Text>
        </View>
      )}

      {/* ── tapping ── */}
      {phase === 'tapping' && (
        <View style={{ flex: 1 }}>
          <Text style={[s.heading, { textAlign: 'center', paddingTop: 8 }]}>
            Your turn
          </Text>
          <TapPad
            key="practice"
            ref={tapPadRef}
            targetSequence={PRACTICE.outputSequence}
            bpm={PRACTICE.targetBpm}
            onSequenceComplete={handleTapComplete}
          />
        </View>
      )}

      {/* ── done ── */}
      {phase === 'done' && (
        <View style={s.stepBody}>
          <Text style={[s.heading, { color: C.green }]}>
            {succeeded ? "You've got it!" : 'Good try!'}
          </Text>
          <Text style={s.bodyText}>
            {succeeded
              ? "That's exactly how every exercise works. You're ready to begin."
              : "That's exactly how it works — it gets easier with practice. You're ready to begin."}
          </Text>
        </View>
      )}

      {/* ── action buttons ── */}
      {phase !== 'playing' && phase !== 'tapping' && (
        <View style={s.navRow}>
          {phase === 'intro' ? (
            <>
              <Pressable style={s.btnBack} onPress={onBack} accessibilityRole="button">
                <Text style={s.btnBackText}>Back</Text>
              </Pressable>
              <Pressable
                style={[s.btnPrimary, { flex: 1 }]}
                onPress={startPlayback}
                accessibilityRole="button"
                accessibilityLabel="Play the practice pattern"
              >
                <Text style={s.btnPrimaryText}>Play pattern</Text>
              </Pressable>
            </>
          ) : (
            // phase === 'done'
            <>
              <Pressable style={s.btnBack} onPress={retry} accessibilityRole="button">
                <Text style={s.btnBackText}>Try again</Text>
              </Pressable>
              <Pressable
                style={[s.btnPrimary, { flex: 1 }]}
                onPress={onComplete}
                accessibilityRole="button"
                accessibilityLabel="Start your first session"
              >
                <Text style={s.btnPrimaryText}>Let's begin</Text>
              </Pressable>
            </>
          )}
        </View>
      )}
    </View>
  );
}

const pd = StyleSheet.create({
  dotsRow: {
    flexDirection: 'row',
    gap: 16,
    marginVertical: 40,
  },
  dot: {
    width: 36,
    height: 36,
    borderRadius: 18,
  },
  dotIdle: {
    backgroundColor: C.surface,
    borderWidth: 2,
    borderColor: C.border,
  },
  dotActive: {
    backgroundColor: C.accent,
  },
});

// ─── main screen ──────────────────────────────────────────────────────────────

export default function OnboardingScreen() {
  const setUserName = useAppStore(s => s.setUserName);

  const [step, setStep] = useState(0);
  const [name, setName] = useState('');

  // Fade transition between steps.
  const opacity  = useSharedValue(1);
  const fadeStyle = useAnimatedStyle(() => ({ opacity: opacity.value }));

  const transitionTo = useCallback((nextStep: number) => {
    opacity.value = withTiming(0, { duration: 150, easing: Easing.in(Easing.quad) }, (done) => {
      'worklet';
      if (done) runOnJS(setStep)(nextStep);
    });
  }, [opacity]);

  useEffect(() => {
    opacity.value = withTiming(1, { duration: 300, easing: Easing.out(Easing.quad) });
  }, [step, opacity]);

  const advance = useCallback(() => transitionTo(step + 1), [step, transitionTo]);
  const goBack  = useCallback(() => transitionTo(step - 1), [step, transitionTo]);

  const complete = useCallback(() => {
    setUserName(name);
    router.replace('/');
  }, [name, setUserName]);

  return (
    <SafeAreaView style={s.screen}>
      <StepDots current={step} />

      <Animated.View style={[{ flex: 1 }, fadeStyle]}>
        {step === 0 && (
          <NameStep name={name} onChange={setName} onNext={advance} />
        )}
        {step === 1 && (
          <AboutStep name={name} onNext={advance} onBack={goBack} />
        )}
        {step === 2 && (
          <PracticeStep onComplete={complete} onBack={goBack} />
        )}
      </Animated.View>
    </SafeAreaView>
  );
}

// ─── shared styles ────────────────────────────────────────────────────────────

const s = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: C.bg,
  },

  // per-step outer shell
  stepShell: {
    flex: 1,
    paddingHorizontal: 28,
    paddingBottom: 28,
  },

  // scrollable / centred body area
  stepBody: {
    flex: 1,
    justifyContent: 'center',
  },
  aboutScroll: {
    paddingTop: 8,
    paddingBottom: 24,
  },

  // typography
  stepLabel: {
    fontSize: 20,
    fontWeight: '500',
    color: C.muted,
    marginBottom: 16,
  },
  heading: {
    fontSize: 36,
    fontWeight: '800',
    color: C.primary,
    lineHeight: 44,
    marginBottom: 24,
  },
  bodyText: {
    fontSize: 22,
    fontWeight: '400',
    color: C.primary,
    lineHeight: 32,
    marginBottom: 20,
  },

  // bullet list (about screen)
  bulletBlock: {
    marginTop: 8,
    gap: 14,
  },
  bulletRow: {
    flexDirection: 'row',
    gap: 12,
    alignItems: 'flex-start',
  },
  bulletDot: {
    fontSize: 22,
    color: C.accent,
    lineHeight: 32,
  },
  bulletText: {
    flex: 1,
    fontSize: 22,
    color: C.muted,
    lineHeight: 32,
  },

  // name input
  nameInput: {
    fontSize: 34,
    fontWeight: '600',
    color: C.primary,
    borderBottomWidth: 2,
    borderBottomColor: C.accent,
    paddingVertical: 12,
    marginBottom: 48,
  },

  // buttons
  btnPrimary: {
    backgroundColor: C.accent,
    borderRadius: 18,
    paddingVertical: 22,
    paddingHorizontal: 28,
    alignItems: 'center',
  },
  btnPrimaryText: {
    color: '#fff',
    fontSize: 22,
    fontWeight: '700',
  },
  btnDisabled: {
    backgroundColor: C.dim,
  },
  btnBack: {
    paddingVertical: 22,
    paddingHorizontal: 20,
    alignItems: 'center',
    justifyContent: 'center',
  },
  btnBackText: {
    fontSize: 22,
    fontWeight: '500',
    color: C.muted,
  },

  // bottom nav row (Back + primary side-by-side)
  navRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingTop: 16,
  },
});
