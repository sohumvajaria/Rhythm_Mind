// Web platform: use the Web Share API with a clipboard fallback.
// Returns 'shared' | 'copied' | 'unavailable' so the caller can show
// the right confirmation message.
export type ShareResult = 'shared' | 'copied' | 'unavailable';

export async function shareNote(note: string): Promise<ShareResult> {
  if (typeof navigator === 'undefined') return 'unavailable';

  if (navigator.share) {
    try {
      await navigator.share({ title: 'RhythmMind session note', text: note });
      return 'shared';
    } catch {
      // User cancelled or browser blocked — fall through to clipboard.
    }
  }

  if (navigator.clipboard?.writeText) {
    try {
      await navigator.clipboard.writeText(note);
      return 'copied';
    } catch {
      return 'unavailable';
    }
  }

  return 'unavailable';
}
