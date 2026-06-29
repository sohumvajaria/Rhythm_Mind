import { File, Paths } from 'expo-file-system';
import * as Sharing from 'expo-sharing';

export type ShareResult = 'shared' | 'copied' | 'unavailable';

export async function shareNote(note: string): Promise<ShareResult> {
  const available = await Sharing.isAvailableAsync();
  if (!available) return 'unavailable';

  const file = new File(Paths.cache, 'rhythmmind-session-note.txt');
  if (!file.exists) file.create();
  file.write(note);

  await Sharing.shareAsync(file.uri, {
    mimeType:    'text/plain',
    UTI:         'public.plain-text',
    dialogTitle: 'Send session note to caregiver',
  });

  return 'shared';
}
