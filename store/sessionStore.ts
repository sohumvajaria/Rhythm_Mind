import AsyncStorage from '@react-native-async-storage/async-storage';
import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';

import type { ExerciseType } from '../lib/exercises';

// ─── public types ─────────────────────────────────────────────────────────────

/** One exercise's outcome, passed to recordSession after each session. */
export interface ExerciseSessionResult {
  type: ExerciseType;
  /** 0–100 from TapResult.score. */
  score: number;
  /** Difficulty level at which the exercise was played. */
  difficulty: number;
}

// ─── internal types ───────────────────────────────────────────────────────────

interface SessionRecord {
  /** Local calendar date, 'YYYY-MM-DD'. */
  date: string;
  exerciseResults: ExerciseSessionResult[];
}

interface SessionState {
  /** Current difficulty per exercise type (1–10). */
  difficulty: Record<ExerciseType, number>;
  /** Rolling 7-day exercise history. */
  history: SessionRecord[];

  /**
   * Persist a completed session and recompute difficulty.
   * Call once per session with all exercise outcomes.
   * Multiple calls on the same calendar day merge into one record.
   */
  recordSession: (results: ExerciseSessionResult[]) => void;

  /** Wipe all history and reset difficulty to defaults. */
  resetProgress: () => void;
}

// ─── constants ────────────────────────────────────────────────────────────────

const EXERCISE_TYPES: ExerciseType[] = [
  'TempoShift',
  'BeatInsertion',
  'PatternReverse',
  'BlendSequence',
];

const DEFAULT_DIFFICULTY: Record<ExerciseType, number> = {
  TempoShift:     3,
  BeatInsertion:  3,
  PatternReverse: 3,
  BlendSequence:  3,
};

/** Minimum same-type data points required before difficulty changes. */
const MIN_SAMPLES = 3;
const HISTORY_DAYS = 7;
const HIGH_THRESHOLD = 80; // avg score above this → increment difficulty
const LOW_THRESHOLD  = 50; // avg score below this → decrement difficulty

// ─── date helpers (local time throughout — no UTC parsing) ────────────────────

function pad(n: number): string {
  return String(n).padStart(2, '0');
}

/** Current local calendar date as 'YYYY-MM-DD'. */
function todayStr(): string {
  const d = new Date();
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

/** The calendar date immediately before `dateStr`, in local time. */
function dayBefore(dateStr: string): string {
  const [y, m, d] = dateStr.split('-').map(Number);
  // Construct from components to stay in local time and avoid DST edge cases.
  const date = new Date(y, m - 1, d);
  date.setDate(date.getDate() - 1);
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

/** ISO-style date string for `n` days ago (local time), for history pruning. */
function nDaysAgoStr(n: number): string {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

// ─── pure computation helpers ─────────────────────────────────────────────────

function pruneHistory(history: SessionRecord[]): SessionRecord[] {
  // YYYY-MM-DD strings are lexicographically sortable, so >= works correctly.
  const cutoff = nDaysAgoStr(HISTORY_DAYS);
  return history.filter(r => r.date >= cutoff);
}

/**
 * Consecutive days ending on today (or yesterday if today is not in history).
 * Returns 0 when the most recent session was before yesterday.
 */
function computeStreak(history: SessionRecord[]): number {
  const days = new Set(history.map(r => r.date));
  const today = todayStr();

  // If today has a session we count from today; otherwise from yesterday,
  // so a streak built up over prior days stays visible during the current day.
  let cursor = days.has(today) ? today : dayBefore(today);
  let streak = 0;

  while (days.has(cursor)) {
    streak++;
    cursor = dayBefore(cursor);
  }

  return streak;
}

/**
 * Compute the new difficulty for `type` given the full updated history.
 * Only adjusts when at least MIN_SAMPLES same-type results are available.
 * Clamps to [1, 10].
 */
function adjustDifficulty(
  current: number,
  type: ExerciseType,
  history: SessionRecord[],
): number {
  // Collect every individual result of this type across all records,
  // then take the last MIN_SAMPLES to represent "recent performance".
  const allScores = history
    .flatMap(r => r.exerciseResults)
    .filter(r => r.type === type)
    .map(r => r.score);

  const recent = allScores.slice(-MIN_SAMPLES);
  if (recent.length < MIN_SAMPLES) return current; // not enough data yet

  const avg = recent.reduce((a, b) => a + b, 0) / recent.length;

  if (avg > HIGH_THRESHOLD) return Math.min(10, current + 1);
  if (avg < LOW_THRESHOLD)  return Math.max(1,  current - 1);
  return current;
}

// ─── store ────────────────────────────────────────────────────────────────────

const useStore = create<SessionState>()(
  persist(
    (set, get) => ({
      difficulty: { ...DEFAULT_DIFFICULTY },
      history:    [],

      recordSession(results) {
        const { history, difficulty } = get();
        const today = todayStr();

        // Merge into an existing today-record, or append a new one.
        const todayIdx = history.findIndex(r => r.date === today);
        let newHistory: SessionRecord[];

        if (todayIdx >= 0) {
          newHistory = history.map((r, i) =>
            i === todayIdx
              ? { ...r, exerciseResults: [...r.exerciseResults, ...results] }
              : r,
          );
        } else {
          newHistory = [...history, { date: today, exerciseResults: results }];
        }

        newHistory = pruneHistory(newHistory);

        // Only recompute difficulty for types that appeared in this session.
        const touchedTypes = new Set(results.map(r => r.type));
        const newDifficulty = { ...difficulty };
        for (const type of touchedTypes) {
          newDifficulty[type] = adjustDifficulty(difficulty[type], type, newHistory);
        }

        set({ history: newHistory, difficulty: newDifficulty });
      },

      resetProgress() {
        set({ history: [], difficulty: { ...DEFAULT_DIFFICULTY } });
      },
    }),
    {
      name: 'rhythmmind-session-store',
      storage: createJSONStorage(() => AsyncStorage),
    },
  ),
);

// ─── public hooks ─────────────────────────────────────────────────────────────

/** Full store — use to read difficulty, record sessions, or reset progress. */
export function useSessionStore() {
  return useStore();
}

/** True when the user has completed at least one session today. */
export function useTodayComplete(): boolean {
  return useStore(state => state.history.some(r => r.date === todayStr()));
}

/**
 * Consecutive days with a completed session, ending on today or yesterday.
 * Returns 0 when no recent streak exists.
 */
export function useStreakCount(): number {
  return useStore(state => computeStreak(state.history));
}

// Re-export DEFAULT_DIFFICULTY so callers can initialise exercise planners
// without importing from the store internals.
export { DEFAULT_DIFFICULTY, EXERCISE_TYPES };
