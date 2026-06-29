import { router } from 'expo-router';
import { useMemo } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { useAppStore } from '../store/useAppStore';
import { useSessionStore, useStreakCount, useTodayComplete } from '../store/sessionStore';

// ─── date helpers (local time, no UTC parsing) ────────────────────────────────

function pad(n: number) {
  return String(n).padStart(2, '0');
}

function localDateStr(d: Date): string {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

function greeting(): string {
  const h = new Date().getHours();
  if (h >= 5  && h < 12) return 'Good morning';
  if (h >= 12 && h < 17) return 'Good afternoon';
  if (h >= 17 && h < 21) return 'Good evening';
  return 'Hello';
}

/** Returns the 7 dates of the current ISO week (Monday → Sunday). */
function currentIsoWeek(): Date[] {
  const today = new Date();
  // getDay() → 0=Sun … 6=Sat; ISO Monday offset = (day + 6) % 7
  const mondayOffset = (today.getDay() + 6) % 7;
  return Array.from({ length: 7 }, (_, i) => {
    const d = new Date(today.getFullYear(), today.getMonth(), today.getDate());
    d.setDate(d.getDate() - mondayOffset + i);
    return d;
  });
}

// ─── colours ──────────────────────────────────────────────────────────────────

const C = {
  bg:       '#07091a',
  surface:  '#0d1a40',
  border:   '#1c3a82',
  accent:   '#4a8ef0',
  primary:  '#eef2ff',
  muted:    '#6b84c4',
  dim:      '#2a3a6a',
  green:    '#5ec97e',
  greenBg:  '#0d2b18',
} as const;

// ─── sub-components ───────────────────────────────────────────────────────────

const DAY_LABELS = ['M', 'T', 'W', 'T', 'F', 'S', 'S'];

interface WeekCalendarProps {
  sessionDays: Set<string>;
}

function WeekCalendar({ sessionDays }: WeekCalendarProps) {
  const week  = useMemo(currentIsoWeek, []);
  const today = localDateStr(new Date());

  return (
    <View>
      <Text style={cal.heading}>This week</Text>
      <View style={cal.row}>
        {week.map((date, i) => {
          const ds       = localDateStr(date);
          const isToday  = ds === today;
          const isFuture = ds > today;
          const done     = sessionDays.has(ds);

          return (
            <View key={ds} style={cal.cell}>
              <Text style={[cal.dayLabel, isFuture && cal.dayLabelDim]}>
                {DAY_LABELS[i]}
              </Text>
              <View
                style={[
                  cal.dot,
                  done        && cal.dotDone,
                  !done && !isFuture && cal.dotMissed,
                  isFuture    && cal.dotFuture,
                  isToday     && cal.dotToday,
                ]}
              >
                {done && <View style={cal.dotFill} />}
              </View>
            </View>
          );
        })}
      </View>
    </View>
  );
}

const CELL_SIZE = 40;

const cal = StyleSheet.create({
  heading: {
    fontSize: 20,
    fontWeight: '600',
    color: C.muted,
    marginBottom: 14,
  },
  row: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  cell: {
    alignItems: 'center',
    gap: 8,
  },
  dayLabel: {
    fontSize: 20,
    fontWeight: '600',
    color: C.muted,
  },
  dayLabelDim: {
    color: C.dim,
  },
  dot: {
    width: CELL_SIZE,
    height: CELL_SIZE,
    borderRadius: CELL_SIZE / 2,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: 'transparent',
  },
  dotDone: {
    backgroundColor: C.green,
    borderColor: C.green,
  },
  dotMissed: {
    borderColor: C.dim,
  },
  dotFuture: {
    borderColor: 'transparent',
  },
  dotFill: {
    width: CELL_SIZE * 0.45,
    height: CELL_SIZE * 0.45,
    borderRadius: CELL_SIZE,
    backgroundColor: '#fff',
  },
  dotToday: {
    borderColor: C.accent,
    borderWidth: 2.5,
  },
});

// ─── screen ───────────────────────────────────────────────────────────────────

export default function HomeScreen() {
  const userName   = useAppStore(s => s.userName);
  const { history } = useSessionStore();
  const todayDone  = useTodayComplete();
  const streak     = useStreakCount();

  const sessionDays = useMemo(
    () => new Set(history.map(r => r.date)),
    [history],
  );

  const displayName  = userName.trim();
  const greetingLine = greeting();
  const nameLine     = displayName || 'RhythmMind';

  const streakLine =
    streak > 0
      ? `${streak}-day streak`
      : 'Begin your streak today';

  return (
    <SafeAreaView style={s.screen}>
      <ScrollView
        contentContainerStyle={s.scroll}
        showsVerticalScrollIndicator={false}
      >
        {/* ── greeting ── */}
        <View style={s.greetingBlock}>
          <Text style={s.greetingTime}>{greetingLine}</Text>
          <Text style={s.greetingName} numberOfLines={1} adjustsFontSizeToFit>
            {displayName ? displayName : 'Welcome back'}
          </Text>
        </View>

        {/* ── streak ── */}
        <View style={s.streakBadge}>
          <Text style={s.streakIcon}>{streak > 0 ? '★' : '○'}</Text>
          <Text style={s.streakText}>{streakLine}</Text>
        </View>

        {/* ── weekly calendar ── */}
        <View style={s.calendarBlock}>
          <WeekCalendar sessionDays={sessionDays} />
        </View>

        {/* ── CTA ── */}
        <View style={s.ctaBlock}>
          {todayDone ? (
            <>
              <View style={s.doneBanner}>
                <Text style={s.doneTick}>✓</Text>
                <Text style={s.doneText}>Session done for today</Text>
              </View>
              <Pressable
                style={s.btnSecondary}
                onPress={() => router.push('/session')}
                accessibilityRole="button"
                accessibilityLabel="Practice again"
              >
                <Text style={s.btnSecondaryText}>Practice again</Text>
              </Pressable>
            </>
          ) : (
            <Pressable
              style={s.btnPrimary}
              onPress={() => router.push('/session')}
              accessibilityRole="button"
              accessibilityLabel="Start today's session"
            >
              <Text style={s.btnPrimaryText}>Start Today's Session</Text>
            </Pressable>
          )}
        </View>

        {/* ── app name footer ── */}
        <Text style={s.appName}>RhythmMind</Text>
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
    paddingTop: 36,
    paddingBottom: 48,
    flexGrow: 1,
  },

  // greeting
  greetingBlock: {
    marginBottom: 32,
  },
  greetingTime: {
    fontSize: 22,
    fontWeight: '500',
    color: C.muted,
    marginBottom: 4,
  },
  greetingName: {
    fontSize: 40,
    fontWeight: '800',
    color: C.primary,
    letterSpacing: 0.3,
  },

  // streak
  streakBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: C.surface,
    borderWidth: 1.5,
    borderColor: C.border,
    borderRadius: 16,
    paddingVertical: 14,
    paddingHorizontal: 20,
    marginBottom: 36,
    alignSelf: 'flex-start',
    gap: 10,
  },
  streakIcon: {
    fontSize: 24,
    color: C.accent,
  },
  streakText: {
    fontSize: 22,
    fontWeight: '600',
    color: C.primary,
  },

  // calendar
  calendarBlock: {
    backgroundColor: C.surface,
    borderWidth: 1.5,
    borderColor: C.border,
    borderRadius: 20,
    padding: 20,
    marginBottom: 44,
  },

  // CTA
  ctaBlock: {
    gap: 16,
    marginBottom: 48,
  },
  btnPrimary: {
    backgroundColor: C.accent,
    borderRadius: 20,
    paddingVertical: 24,
    paddingHorizontal: 32,
    alignItems: 'center',
    // Shadow for depth — helps elderly users identify the tappable area
    shadowColor: C.accent,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.4,
    shadowRadius: 12,
    elevation: 8,
  },
  btnPrimaryText: {
    color: '#fff',
    fontSize: 24,
    fontWeight: '800',
    letterSpacing: 0.3,
  },
  doneBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: C.greenBg,
    borderWidth: 1.5,
    borderColor: C.green,
    borderRadius: 16,
    paddingVertical: 18,
    paddingHorizontal: 24,
    gap: 12,
  },
  doneTick: {
    fontSize: 28,
    color: C.green,
    fontWeight: '700',
  },
  doneText: {
    fontSize: 22,
    fontWeight: '600',
    color: C.green,
  },
  btnSecondary: {
    borderWidth: 2,
    borderColor: C.border,
    borderRadius: 20,
    paddingVertical: 20,
    paddingHorizontal: 32,
    alignItems: 'center',
    backgroundColor: C.surface,
  },
  btnSecondaryText: {
    color: C.primary,
    fontSize: 22,
    fontWeight: '600',
  },

  // footer
  appName: {
    textAlign: 'center',
    fontSize: 20,
    fontWeight: '700',
    color: C.dim,
    letterSpacing: 1,
    marginTop: 'auto',
  },
});
