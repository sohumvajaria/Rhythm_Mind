// ─── exercise types (discriminated union) ─────────────────────────────────────

export type ExerciseType =
  | 'TempoShift'
  | 'BeatInsertion'
  | 'PatternReverse'
  | 'BlendSequence';

/**
 * Hear a pattern at inputBpm, reproduce the same pattern at targetBpm.
 * outputSequence === inputSequence; only the playback tempo changes.
 */
export interface TempoShiftExercise {
  type: 'TempoShift';
  inputSequence: number[];
  outputSequence: number[];
  bpm: number;        // tempo to play inputSequence
  targetBpm: number;  // tempo the user must tap outputSequence at
  timeLimitMs: number;
}

/**
 * Hear a pattern, tap it back with one beat inserted at insertionIndex.
 * outputSequence.length === inputSequence.length + 1.
 */
export interface BeatInsertionExercise {
  type: 'BeatInsertion';
  inputSequence: number[];
  outputSequence: number[];
  insertionIndex: number;
  bpm: number;
  timeLimitMs: number;
}

/**
 * Hear a sequence, tap it in reverse order.
 * outputSequence === [...inputSequence].reverse().
 */
export interface PatternReverseExercise {
  type: 'PatternReverse';
  inputSequence: number[];
  outputSequence: number[];
  bpm: number;
  timeLimitMs: number;
}

/**
 * Hear patternA then patternB, tap their interleaved merge:
 * [A[0], B[0], A[1], B[1], ...].
 * inputSequence = [...patternA, ...patternB] (for sequential playback).
 */
export interface BlendSequenceExercise {
  type: 'BlendSequence';
  patternA: number[];
  patternB: number[];
  inputSequence: number[];
  outputSequence: number[];
  bpm: number;
  timeLimitMs: number;
}

export type ExerciseInstance =
  | TempoShiftExercise
  | BeatInsertionExercise
  | PatternReverseExercise
  | BlendSequenceExercise;

export type ExerciseGenerator = (difficulty: number) => ExerciseInstance;

// ─── shared helpers ───────────────────────────────────────────────────────────

function clamp(d: number): number {
  return Math.min(10, Math.max(1, Math.round(d)));
}

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

/** Normalised difficulty: 0 at d=1, 1 at d=10. */
function t(d: number): number {
  return (d - 1) / 9;
}

/**
 * Beat slots in the primary sequence.
 * d=1 → 4 slots, d=10 → 12 slots.
 */
function seqLen(d: number): number {
  return Math.round(lerp(4, 12, t(d)));
}

/**
 * Base playback tempo.
 * d=1 → 72 BPM, d=10 → 160 BPM.
 */
function bpmFor(d: number): number {
  return Math.round(lerp(72, 160, t(d)));
}

/** Wall-clock duration of a sequence in ms. */
function durationMs(length: number, bpm: number): number {
  return length * (60_000 / bpm);
}

/**
 * Random binary beat pattern (0 = rest, 1 = hit).
 * Always starts with a hit so there is an unambiguous downbeat.
 * Rest probability rises with difficulty so patterns grow more syncopated.
 */
function genPattern(length: number, d: number): number[] {
  const restProb = lerp(0.1, 0.45, t(d));
  return Array.from({ length }, (_, i) =>
    i === 0 ? 1 : Math.random() < restProb ? 0 : 1
  );
}

function isPalindrome(arr: number[]): boolean {
  return arr.every((v, i) => v === arr[arr.length - 1 - i]);
}

function arraysEqual(a: number[], b: number[]): boolean {
  return a.length === b.length && a.every((v, i) => v === b[i]);
}

// ─── TempoShift ───────────────────────────────────────────────────────────────

/**
 * Difficulty axes:
 *  - Sequence length (4 → 12 beats)
 *  - Input BPM (72 → 120 BPM)
 *  - Shift magnitude (10% → 125%)
 *  - Shift direction: always faster at d≤5; can be slower at d>5 (harder cognitively)
 */
export function generateTempoShift(difficulty: number): TempoShiftExercise {
  const d = clamp(difficulty);
  const td = t(d);

  const length = seqLen(d);
  const inputBpm = Math.round(lerp(72, 120, td));

  // Shift factor grows from 1.10× to 2.25× as difficulty rises.
  const factor = lerp(1.1, 2.25, td);
  // At d>5 there is a 40% chance the tempo slows instead of speeds up.
  const shiftUp = d <= 5 || Math.random() > 0.4;
  const targetBpm = shiftUp
    ? Math.round(inputBpm * factor)
    : Math.round(inputBpm / factor);

  const inputSequence = genPattern(length, d);
  const outputSequence = [...inputSequence];

  const timeLimitMs = Math.round(
    durationMs(length, inputBpm) +
    durationMs(length, targetBpm) * 1.5 +
    lerp(3500, 1500, td)  // cognitive buffer shrinks with difficulty
  );

  return {
    type: 'TempoShift',
    inputSequence,
    outputSequence,
    bpm: inputBpm,
    targetBpm,
    timeLimitMs,
  };
}

// ─── BeatInsertion ────────────────────────────────────────────────────────────

/**
 * Difficulty axes:
 *  - Sequence length (4 → 12 beats)
 *  - Tempo (72 → 160 BPM)
 *  - Insertion position: appended at d=1, increasingly early at d=10
 *    (inserting mid-sequence forces the user to shift context, not just append)
 */
export function generateBeatInsertion(difficulty: number): BeatInsertionExercise {
  const d = clamp(difficulty);
  const td = t(d);

  const length = seqLen(d);
  const bpm = bpmFor(d);
  const inputSequence = genPattern(length, d);

  // How far from the end the insertion can reach.
  // d=1: insertionIndex = length (append only).
  // d=10: insertionIndex can be as early as 1.
  const earliestAllowed = Math.round(lerp(length, 1, td));
  const insertionIndex =
    earliestAllowed +
    Math.floor(Math.random() * (length - earliestAllowed + 1));

  const outputSequence = [
    ...inputSequence.slice(0, insertionIndex),
    1,
    ...inputSequence.slice(insertionIndex),
  ];

  const timeLimitMs = Math.round(
    durationMs(length, bpm) +
    durationMs(outputSequence.length, bpm) * 1.5 +
    lerp(3000, 1000, td)
  );

  return {
    type: 'BeatInsertion',
    inputSequence,
    outputSequence,
    insertionIndex,
    bpm,
    timeLimitMs,
  };
}

// ─── PatternReverse ───────────────────────────────────────────────────────────

/**
 * Difficulty axes:
 *  - Sequence length (4 → 12 beats)
 *  - Tempo (72 → 160 BPM)
 *  - Pattern asymmetry: palindromes are re-rolled so the reversed answer
 *    always differs from the heard sequence
 *  - Cognitive buffer shrinks from 5 s to 2 s (user gets less thinking time)
 */
export function generatePatternReverse(difficulty: number): PatternReverseExercise {
  const d = clamp(difficulty);
  const td = t(d);

  const length = seqLen(d);
  const bpm = bpmFor(d);

  let inputSequence = genPattern(length, d);
  let attempts = 0;
  while (isPalindrome(inputSequence) && attempts < 20) {
    inputSequence = genPattern(length, d);
    attempts++;
  }

  const outputSequence = [...inputSequence].reverse();

  // Extra cognitive buffer because the user must mentally reverse the sequence.
  const timeLimitMs = Math.round(
    durationMs(length, bpm) +
    durationMs(length, bpm) * 1.5 +
    lerp(5000, 2000, td)
  );

  return {
    type: 'PatternReverse',
    inputSequence,
    outputSequence,
    bpm,
    timeLimitMs,
  };
}

// ─── BlendSequence ────────────────────────────────────────────────────────────

/**
 * Difficulty axes:
 *  - Per-pattern length (3 → 7 beats); output is 2× that length
 *  - Tempo (72 → 160 BPM)
 *  - Pattern distinctiveness: B is re-rolled if identical to A
 *  - At low d both patterns are simple; at high d both are syncopated
 *
 * Interleave rule: output[2i] = A[i], output[2i+1] = B[i]
 */
export function generateBlendSequence(difficulty: number): BlendSequenceExercise {
  const d = clamp(difficulty);
  const td = t(d);

  // Shorter per-pattern lengths since output doubles in length.
  const patLen = Math.round(lerp(3, 7, td));
  const bpm = bpmFor(d);

  const patternA = genPattern(patLen, d);
  let patternB = genPattern(patLen, d);
  let attempts = 0;
  while (arraysEqual(patternA, patternB) && attempts < 20) {
    patternB = genPattern(patLen, d);
    attempts++;
  }

  const inputSequence = [...patternA, ...patternB];

  const outputSequence: number[] = [];
  for (let i = 0; i < patLen; i++) {
    outputSequence.push(patternA[i]);
    outputSequence.push(patternB[i]);
  }

  const timeLimitMs = Math.round(
    durationMs(inputSequence.length, bpm) +   // hear both patterns
    durationMs(outputSequence.length, bpm) * 1.5 +
    lerp(4000, 1500, td)
  );

  return {
    type: 'BlendSequence',
    patternA,
    patternB,
    inputSequence,
    outputSequence,
    bpm,
    timeLimitMs,
  };
}

// ─── registry ─────────────────────────────────────────────────────────────────

export const EXERCISE_GENERATORS: Record<ExerciseType, ExerciseGenerator> = {
  TempoShift: generateTempoShift,
  BeatInsertion: generateBeatInsertion,
  PatternReverse: generatePatternReverse,
  BlendSequence: generateBlendSequence,
};
