// TypeScript fallback — metro resolves to shareNote.web.ts or shareNote.native.ts at build time.
// This file is never bundled for web or native; it exists only so tsc can resolve the import.

export type ShareResult = 'shared' | 'copied' | 'unavailable';

export async function shareNote(_note: string): Promise<ShareResult> {
  return 'unavailable';
}
