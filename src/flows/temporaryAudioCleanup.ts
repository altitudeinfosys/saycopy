import type { FlowAudioInput, TemporaryAudioCleanup } from './types';

export async function cleanupTemporaryAudio(
  temporaryAudio: TemporaryAudioCleanup | undefined,
  audio: FlowAudioInput,
): Promise<void> {
  try {
    await temporaryAudio?.cleanup(audio);
  } catch {
    // Temporary-file cleanup is best-effort and must not replace the primary flow outcome.
  }
}
