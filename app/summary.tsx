import { router, useLocalSearchParams } from 'expo-router';
import React, { useCallback, useMemo, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { shareNote, type ShareResult } from '../lib/shareNote';

// ─── colours ──────────────────────────────────────────────────────────────────

const C = {
  bg:      '#07091a',
  surface: '#0d1a40',
  border:  '#1c3a82',
  accent:  '#4a8ef0',
  primary: '#eef2ff',
  muted:   '#6b84c4',
  dim:     '#2a3a6a',
  green:   '#5ec97e',
  greenBg: '#0d2b18',
} as const;

// ─── helpers ──────────────────────────────────────────────────────────────────

function formatLongDate(d: Date): string {
  return d.toLocaleDateString('en-US', {
    weekday: 'long',
    year:    'numeric',
    month:   'long',
    day:     'numeric',
  });
}

function formatNoteDate(d: Date): string {
  return d.toLocaleDateString('en-US', {
    year:  'numeric',
    month: 'long',
    day:   'numeric',
  });
}

function confirmationLabel(result: ShareResult): string {
  if (result === 'copied') return 'Note copied to clipboard';
  if (result === 'shared') return 'Sent!';
  return 'Sharing not available on this device';
}

// ─── screen ───────────────────────────────────────────────────────────────────

export default function SummaryScreen() {
  const params = useLocalSearchParams<{
    exerciseCount: string;
    avgDifficulty: string;
  }>();

  const exerciseCount = Number(params.exerciseCount) || 5;
  const avgDifficulty = Number(params.avgDifficulty) || 3;

  const today    = useMemo(() => new Date(), []);
  const longDate = useMemo(() => formatLongDate(today), [today]);
  const noteDate = useMemo(() => formatNoteDate(today), [today]);

  // Caregiver note — exactly the format specified.
  const note = useMemo(
    () =>
      `RhythmMind session on ${noteDate}: ${exerciseCount} exercises completed, difficulty level ${avgDifficulty}.`,
    [noteDate, exerciseCount, avgDifficulty],
  );

  const [busy, setBusy]             = useState(false);
  const [confirmation, setConf]     = useState<string | null>(null);

  // Platform-specific sharing via lib/shareNote.{web,native}.ts.
  // On web: Web Share API → clipboard fallback.
  // On native: expo-sharing (writes a .txt file to cache).
  const handleShare = useCallback(async () => {
    if (busy) return;
    setBusy(true);
    setConf(null);
    try {
      const result = await shareNote(note);
      setConf(confirmationLabel(result));
    } finally {
      setBusy(false);
    }
  }, [note, busy]);

  return (
    <SafeAreaView style={s.screen}>
      <ScrollView
        contentContainerStyle={s.scroll}
        showsVerticalScrollIndicator={false}
      >
        {/* ── check badge ── */}
        <View style={s.checkCircle}>
          <Text style={s.checkMark}>✓</Text>
        </View>

        {/* ── heading ── */}
        <Text style={s.heading}>Session complete</Text>
        <Text style={s.dateText}>{longDate}</Text>

        {/* ── stats row ── */}
        <View style={s.statsRow}>
          <View style={s.statCell}>
            <Text style={s.statValue}>{exerciseCount}</Text>
            <Text style={s.statLabel}>exercises</Text>
          </View>
          <View style={s.statDivider} />
          <View style={s.statCell}>
            <Text style={s.statValue}>{avgDifficulty}</Text>
            <Text style={s.statLabel}>difficulty level</Text>
          </View>
        </View>

        {/* ── caregiver note card ── */}
        <View style={s.noteCard}>
          <Text style={s.noteLabel}>Caregiver note</Text>
          <Text style={s.noteBody}>{note}</Text>
        </View>

        {/* ── confirmation message ── */}
        {confirmation ? (
          <Text style={s.confirmation}>{confirmation}</Text>
        ) : null}

        {/* ── share button ── */}
        <Pressable
          style={[s.btnShare, busy && s.btnShareDisabled]}
          onPress={handleShare}
          disabled={busy}
          accessibilityRole="button"
          accessibilityLabel="Share session note with caregiver"
        >
          {busy ? (
            <ActivityIndicator color="#fff" />
          ) : (
            <Text style={s.btnShareText}>Share with caregiver</Text>
          )}
        </Pressable>

        {/* ── done ── */}
        <Pressable
          style={s.btnDone}
          onPress={() => router.replace('/')}
          accessibilityRole="button"
          accessibilityLabel="Done, return to home"
        >
          <Text style={s.btnDoneText}>Done</Text>
        </Pressable>
      </ScrollView>
    </SafeAreaView>
  );
}

// ─── styles ───────────────────────────────────────────────────────────────────

const s = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: C.bg,
  },
  scroll: {
    paddingHorizontal: 28,
    paddingTop: 48,
    paddingBottom: 48,
    alignItems: 'center',
  },

  // check badge
  checkCircle: {
    width: 96,
    height: 96,
    borderRadius: 48,
    backgroundColor: C.greenBg,
    borderWidth: 2.5,
    borderColor: C.green,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 28,
  },
  checkMark: {
    fontSize: 48,
    color: C.green,
    fontWeight: '700',
    lineHeight: 56,
  },

  // heading + date
  heading: {
    fontSize: 36,
    fontWeight: '800',
    color: C.primary,
    textAlign: 'center',
    marginBottom: 10,
  },
  dateText: {
    fontSize: 20,
    fontWeight: '500',
    color: C.muted,
    textAlign: 'center',
    marginBottom: 36,
  },

  // stats
  statsRow: {
    flexDirection: 'row',
    backgroundColor: C.surface,
    borderWidth: 1.5,
    borderColor: C.border,
    borderRadius: 20,
    paddingVertical: 22,
    paddingHorizontal: 24,
    marginBottom: 28,
    width: '100%',
    alignItems: 'center',
    justifyContent: 'space-around',
  },
  statCell: {
    alignItems: 'center',
    flex: 1,
  },
  statValue: {
    fontSize: 38,
    fontWeight: '800',
    color: C.primary,
    marginBottom: 4,
  },
  statLabel: {
    fontSize: 18,
    fontWeight: '500',
    color: C.muted,
  },
  statDivider: {
    width: 1.5,
    height: 48,
    backgroundColor: C.border,
  },

  // caregiver note
  noteCard: {
    backgroundColor: C.surface,
    borderWidth: 1.5,
    borderColor: C.border,
    borderRadius: 20,
    padding: 22,
    width: '100%',
    marginBottom: 20,
  },
  noteLabel: {
    fontSize: 18,
    fontWeight: '600',
    color: C.muted,
    marginBottom: 10,
    textTransform: 'uppercase',
    letterSpacing: 0.8,
  },
  noteBody: {
    fontSize: 20,
    fontWeight: '400',
    color: C.primary,
    lineHeight: 30,
  },

  // share confirmation
  confirmation: {
    fontSize: 18,
    fontWeight: '500',
    color: C.green,
    textAlign: 'center',
    marginBottom: 12,
  },

  // share button
  btnShare: {
    backgroundColor: C.accent,
    borderRadius: 18,
    paddingVertical: 22,
    paddingHorizontal: 32,
    alignItems: 'center',
    justifyContent: 'center',
    width: '100%',
    marginBottom: 16,
    minHeight: 66,
    shadowColor: C.accent,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.35,
    shadowRadius: 10,
    elevation: 6,
  },
  btnShareDisabled: {
    opacity: 0.6,
  },
  btnShareText: {
    color: '#fff',
    fontSize: 22,
    fontWeight: '700',
  },

  // done button
  btnDone: {
    borderWidth: 2,
    borderColor: C.border,
    borderRadius: 18,
    paddingVertical: 20,
    paddingHorizontal: 32,
    alignItems: 'center',
    width: '100%',
    backgroundColor: C.surface,
  },
  btnDoneText: {
    color: C.primary,
    fontSize: 22,
    fontWeight: '600',
  },
});
